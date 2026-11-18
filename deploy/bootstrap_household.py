#!/usr/bin/env python3
"""Create least-privilege Baby Buddy accounts for the adults in the household file."""

import argparse
import json
import os
import re
import secrets
import sys
import tempfile
from pathlib import Path
from typing import Iterable, NamedTuple


APP_PATH = "/app/www/public"
SECRET_PATH = Path("/config/.secretkey")
ACCESS_PATH = Path("/config/little-days-household-access.json")
IDENTITIES_PATH = Path("/config/little-days-household-identities.json")
HOUSEHOLD_PATH = Path("/config/household.json")
ROLES = ("owner", "caregiver")
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._@+-]{1,150}$")
CAREGIVER_GROUP_NAME = "caregiver"
CARE_MODELS = frozenset({
    "diaperchange", "feeding", "headcircumference", "height", "medication",
    "note", "pumping", "sleep", "temperature", "timer", "tummytime", "weight",
})


class Adult(NamedTuple):
    username: str
    role: str
    label: str | dict[str, str] | None = None


def clean_label(username: str, label: object) -> str | dict[str, str] | None:
    """A label is one text, or {"en": ..., "es": ...} when the screens show a different text in Spanish."""
    def text(value: object) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() and len(value) <= 100 else None

    if label is None:
        return None
    if text(label):
        return text(label)
    if isinstance(label, dict) and set(label) <= {"en", "es"} and text(label.get("en")) and all(text(value) for value in label.values()):
        return {key: text(value) for key, value in label.items()}
    raise RuntimeError(f"Label for {username!r} must be 1 to 100 characters, or an object with en and optional es.")


def load_household(path: Path) -> list[Adult]:
    """Read the household file: one object for each adult, with `username`, `role`, and an optional `label`."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Cannot read the household file: {error}") from error
    rows = data.get("adults") if isinstance(data, dict) else None
    if not isinstance(rows, list) or not rows:
        raise RuntimeError('The household file needs an "adults" list with at least one adult.')
    household: list[Adult] = []
    for row in rows:
        if not isinstance(row, dict) or set(row) - {"username", "role", "label"}:
            raise RuntimeError("Each adult needs only username, role, and an optional label.")
        username, role, label = row.get("username"), row.get("role"), row.get("label")
        if not isinstance(username, str) or not USERNAME_PATTERN.match(username):
            raise RuntimeError("Each adult needs a username of letters, digits, and . _ @ + - only.")
        if role not in ROLES:
            raise RuntimeError(f"Role for {username!r} must be one of: {', '.join(ROLES)}.")
        household.append(Adult(username, role, clean_label(username, label)))
    if len({adult.username for adult in household}) != len(household):
        raise RuntimeError("The household file lists a username twice.")
    if not any(adult.role == "owner" for adult in household):
        raise RuntimeError("The household needs at least one owner.")
    return household


def expected_permissions(models: Iterable[object], *, allow_timer_delete: bool = False) -> set[str]:
    permissions: set[str] = {"babybuddy.view_settings"}
    for model in models:
        model_name = model._meta.model_name
        if model_name != "child" and model_name not in CARE_MODELS:
            continue
        actions = set(model._meta.default_permissions)
        if model_name == "child":
            actions.discard("delete")
        if model_name == "timer" and not allow_timer_delete:
            actions.discard("delete")
        permissions.update(f"core.{action}_{model_name}" for action in actions)
    if "core.delete_child" in permissions:
        raise RuntimeError("Household permissions must not include child deletion.")
    return permissions


def caregiver_permissions(view_models: Iterable[str], add_change_models: Iterable[str]) -> set[str]:
    permissions = {"babybuddy.view_settings", *(f"core.view_{model}" for model in view_models)}
    for model in add_change_models:
        permissions.update((f"core.add_{model}", f"core.change_{model}"))
    if any(name.startswith("core.delete_") for name in permissions):
        raise RuntimeError("Baby Buddy caregiver group must not grant delete permissions.")
    return permissions


def assert_account_safe(user: object, expected: set[str], *, caregiver_group: object | None = None) -> None:
    if user.is_staff or user.is_superuser or not user.is_active:
        raise RuntimeError(f"Existing account {user.username!r} is not a safe active household account.")
    if set(user.get_all_permissions()) != expected:
        raise RuntimeError(f"Existing account {user.username!r} has different permissions; no changes made.")
    if user.has_perm("auth.add_user") or user.has_perm("auth.change_user") or user.has_perm("auth.delete_user"):
        raise RuntimeError(f"Existing account {user.username!r} has user administration access.")
    groups = set(user.groups.values_list("name", flat=True))
    if caregiver_group is None and groups:
        raise RuntimeError(f"Existing account {user.username!r} has unexpected groups; no changes made.")
    if caregiver_group is not None and groups != {caregiver_group.name}:
        raise RuntimeError(f"Existing account {user.username!r} is not in the caregiver group alone.")
    direct_permissions = set(user.get_user_permissions())
    if caregiver_group is not None and direct_permissions:
        raise RuntimeError(f"Existing account {user.username!r} has direct permissions outside the caregiver group.")
    if caregiver_group is None and direct_permissions != expected:
        raise RuntimeError(f"Existing account {user.username!r} does not have the exact direct permission set.")


def identity_rows(users: Iterable[object]) -> list[dict[str, object]]:
    return [
        {
            "username": user.username,
            "id": user.pk,
            "permissions": sorted(user.get_all_permissions()),
            "timerDeletePermission": bool(user.has_perm("core.delete_timer")),
        }
        for user in users
    ]


def write_json_exclusive(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp_path = Path(temp_name)
    linked = False
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(value, indent=2, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temp_path, path)
        linked = True
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except Exception:
        if linked:
            path.unlink(missing_ok=True)
        raise
    finally:
        temp_path.unlink(missing_ok=True)


def initialize_django() -> None:
    secret_key = SECRET_PATH.read_text(encoding="utf-8").strip()
    if not secret_key:
        raise RuntimeError("Baby Buddy secret key is empty.")
    os.environ["DJANGO_SETTINGS_MODULE"] = "babybuddy.settings.base"
    os.environ["SECRET_KEY"] = secret_key
    sys.path.insert(0, APP_PATH)
    import django

    django.setup()


def load_permission_plan(models, timer_stop_adults, group_model, permission_model, caregiver_views, caregiver_add_change, household):
    owner_permissions = {
        adult.username: expected_permissions(models, allow_timer_delete=adult.username in timer_stop_adults)
        for adult in household if adult.role == "owner"
    }
    caregiver_expected = caregiver_permissions(caregiver_views, caregiver_add_change)
    caregiver_group = group_model.objects.get(name=CAREGIVER_GROUP_NAME)
    group_permissions = {
        f"{permission.content_type.app_label}.{permission.codename}"
        for permission in caregiver_group.permissions.select_related("content_type").all()
    }
    missing_group_permissions = caregiver_expected - group_permissions
    if missing_group_permissions not in (set(), {"babybuddy.view_settings"}) or group_permissions - caregiver_expected:
        raise RuntimeError("Baby Buddy caregiver group permissions differ from the pinned source; no accounts changed.")
    expected_by_user = {**owner_permissions, **{adult.username: caregiver_expected for adult in household if adult.role == "caregiver"}}
    codenames = {name.split(".", 1)[1] for values in expected_by_user.values() for name in values}
    permission_rows = list(permission_model.objects.filter(content_type__app_label__in=("core", "babybuddy"), codename__in=codenames))
    permissions = {f"{row.content_type.app_label}.{row.codename}": row for row in permission_rows}
    expected_union = set().union(*expected_by_user.values())
    if not expected_union <= set(permissions):
        missing = sorted(expected_union - set(permissions))
        raise RuntimeError(f"Baby Buddy permissions are incomplete: {', '.join(missing)}")
    return caregiver_group, owner_permissions, expected_by_user, permissions, bool(missing_group_permissions)


def find_existing_accounts(user_model, expected_by_user, caregiver_group, household):
    existing: dict[str, object] = {}
    missing_names: list[tuple[str, str]] = []
    for adult in household:
        username, first_name = adult.username, adult.username
        user = user_model.objects.filter(username=username).first()
        if user is None:
            missing_names.append((username, first_name))
        else:
            group = caregiver_group if adult.role == "caregiver" else None
            assert_account_safe(user, expected_by_user[username], caregiver_group=group)
            if user.first_name != first_name:
                raise RuntimeError(f"Existing account {username!r} has a different name; no changes made.")
            existing[username] = user
    return existing, missing_names


def create_household_user(user_model, username, first_name, password, caregiver_group, owner_permissions, permission_rows, expected_by_user):
    user = user_model.objects.create_user(username=username, first_name=first_name, password=password)
    user.is_staff = False
    user.is_superuser = False
    user.is_active = True
    user.save(update_fields=["is_staff", "is_superuser", "is_active"])
    if username in owner_permissions:
        user.user_permissions.set([permission_rows[name] for name in owner_permissions[username]])
    else:
        user.groups.add(caregiver_group)
    user = user_model.objects.get(pk=user.pk)
    group = None if username in owner_permissions else caregiver_group
    assert_account_safe(user, expected_by_user[username], caregiver_group=group)
    return user


def apply_household(user_model, transaction, caregiver_group, owner_permissions, expected_by_user, permission_rows, existing, missing_names, household, group_needs_profile_permission=False):
    if missing_names and ACCESS_PATH.exists():
        raise RuntimeError("Household access file already exists; refusing to overwrite it.")
    if IDENTITIES_PATH.exists() and missing_names:
        raise RuntimeError("Household identity file already exists; refusing to overwrite it.")

    passwords = {username: secrets.token_urlsafe(32) for username, _ in missing_names}
    created_files: list[Path] = []
    try:
        with transaction.atomic():
            if group_needs_profile_permission:
                caregiver_group.permissions.add(permission_rows["babybuddy.view_settings"])
            if passwords:
                write_json_exclusive(ACCESS_PATH, {"accounts": [{"username": name, "password": password} for name, password in passwords.items()]})
                created_files.append(ACCESS_PATH)
            for username, first_name in missing_names:
                existing[username] = create_household_user(user_model, username, first_name, passwords[username], caregiver_group, owner_permissions, permission_rows, expected_by_user)

            ordered_users = [existing[adult.username] for adult in household]
            identities = {"accounts": identity_rows(ordered_users)}
            if IDENTITIES_PATH.exists():
                current = json.loads(IDENTITIES_PATH.read_text(encoding="utf-8"))
                if current != identities:
                    raise RuntimeError("Household identity file differs from Baby Buddy; no changes made.")
            else:
                write_json_exclusive(IDENTITIES_PATH, identities)
                created_files.append(IDENTITIES_PATH)
    except Exception:
        for path in created_files:
            path.unlink(missing_ok=True)
        raise
    return {"mode": "applied", "created": [name for name, _ in missing_names], "verified": [adult.username for adult in household], "identityFile": str(IDENTITIES_PATH)}


def dry_run_report(existing, missing_names, timer_stop_adults, group_needs_profile_permission):
    return {"mode": "dry-run", "accountChanges": len(missing_names), "wouldCreate": [name for name, _ in missing_names], "verifiedExisting": sorted(existing), "timerStopAdults": sorted(timer_stop_adults), "wouldGrantCaregiverProfileRead": bool(missing_names and group_needs_profile_permission)}


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--household", type=Path, default=HOUSEHOLD_PATH, help="Household file with one entry for each adult.")
    parser.add_argument("--timer-stop-adult", action="append", default=[], help="Grant timer deletion only to this named owner; repeat for each approved adult.")
    args = parser.parse_args()
    household = load_household(args.household)
    owners = {adult.username for adult in household if adult.role == "owner"}
    if set(args.timer_stop_adult) - owners:
        raise RuntimeError("--timer-stop-adult must name an owner in the household file.")
    initialize_django()

    from core.apps import CAREGIVER_ADD_CHANGE_MODELS, CAREGIVER_VIEW_MODELS
    from django.apps import apps
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Group, Permission
    from django.db import transaction

    plan = load_permission_plan(list(apps.get_app_config("core").get_models()), set(args.timer_stop_adult), Group, Permission, CAREGIVER_VIEW_MODELS, CAREGIVER_ADD_CHANGE_MODELS, household)
    caregiver_group, owner_permissions, expected_by_user, permission_rows, group_needs_profile_permission = plan
    existing, missing_names = find_existing_accounts(get_user_model(), expected_by_user, caregiver_group, household)
    if args.dry_run:
        print(json.dumps(dry_run_report(existing, missing_names, args.timer_stop_adult, group_needs_profile_permission)))
        return 0

    result = apply_household(get_user_model(), transaction, caregiver_group, owner_permissions, expected_by_user, permission_rows, existing, missing_names, household, group_needs_profile_permission)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        raise SystemExit(f"Household setup failed: {error}")
