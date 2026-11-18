import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))
import bootstrap_household as bootstrap


class FakeUser:
    def __init__(self, permissions, *, username="Rowan", staff=False, superuser=False, active=True, groups=(), direct_permissions=None):
        self.username = username
        self.first_name = username
        self.pk = 17
        self.is_staff = staff
        self.is_superuser = superuser
        self.is_active = active
        self.permissions = set(permissions)
        self.group_names = list(groups)
        self.direct_permissions = set(permissions if direct_permissions is None else direct_permissions)
        self.groups = SimpleNamespace(values_list=lambda field, flat=False: self.group_names)

    def get_all_permissions(self):
        return self.permissions

    def has_perm(self, permission):
        return permission in self.permissions

    def get_user_permissions(self):
        return self.direct_permissions


class HouseholdBootstrapTest(unittest.TestCase):
    @staticmethod
    def models_for_plan():
        return [SimpleNamespace(_meta=SimpleNamespace(model_name=name, default_permissions=("view", "add", "change", "delete"))) for name in ("child", "timer", "feeding")]

    def setUp(self):
        self.models = [
            SimpleNamespace(_meta=SimpleNamespace(model_name="child", default_permissions=("view", "add", "change", "delete"))),
            SimpleNamespace(_meta=SimpleNamespace(model_name="timer", default_permissions=("view", "add", "change", "delete"))),
            SimpleNamespace(_meta=SimpleNamespace(model_name="headcircumference", default_permissions=("view", "add", "change", "delete"))),
            SimpleNamespace(_meta=SimpleNamespace(model_name="bmi", default_permissions=("view", "add", "change", "delete"))),
            SimpleNamespace(_meta=SimpleNamespace(model_name="tag", default_permissions=("view", "add", "change", "delete"))),
            SimpleNamespace(_meta=SimpleNamespace(model_name="weightpercentile", default_permissions=("view", "add", "change", "delete"))),
        ]

    def test_permission_plan_grants_full_timer_and_no_child_delete(self):
        permissions = bootstrap.expected_permissions(self.models)
        with_timer_delete = bootstrap.expected_permissions(self.models, allow_timer_delete=True)
        self.assertEqual(
            {name for name in permissions if name.startswith("core.") and name.endswith("_timer")},
            {"core.view_timer", "core.add_timer", "core.change_timer"},
        )
        self.assertIn("core.delete_timer", with_timer_delete)
        self.assertTrue({"core.view_child", "core.add_child", "core.change_child"} <= permissions)
        self.assertNotIn("core.delete_child", permissions)
        self.assertFalse(any("percentile" in name for name in permissions))
        self.assertTrue({"core.view_headcircumference", "core.add_headcircumference", "core.change_headcircumference", "core.delete_headcircumference"} <= permissions)
        self.assertFalse(any(name.endswith("_bmi") or name.endswith("_tag") for name in permissions))
        self.assertIn("babybuddy.view_settings", permissions)

    def test_caregiver_permissions_match_the_pinned_group_role(self):
        permissions = bootstrap.caregiver_permissions(
            ("child", "timer", "feeding", "diaperchange", "sleep", "medication", "temperature", "weight", "note", "tummytime"),
            ("timer", "feeding", "diaperchange", "sleep", "medication", "temperature", "weight", "note", "tummytime"),
        )
        self.assertIn("core.view_child", permissions)
        self.assertIn("core.add_timer", permissions)
        self.assertNotIn("core.delete_timer", permissions)
        self.assertNotIn("core.delete_child", permissions)
        self.assertFalse(any(name.endswith("_pumping") or name.endswith("_height") or name.endswith("_bmi") or name.endswith("_tag") for name in permissions))
        self.assertIn("babybuddy.view_settings", permissions)

    def test_existing_account_must_have_exact_household_rights_and_no_admin_flags(self):
        expected = {"core.view_timer"}
        bootstrap.assert_account_safe(FakeUser(expected), expected)
        for user in (FakeUser(expected, staff=True), FakeUser(expected, superuser=True), FakeUser(expected, active=False), FakeUser(expected | {"auth.add_user"}), FakeUser(expected | {"core.delete_timer"})):
            with self.subTest(user=user):
                with self.assertRaises(RuntimeError):
                    bootstrap.assert_account_safe(user, expected)
        with self.assertRaises(RuntimeError):
            bootstrap.assert_account_safe(FakeUser(set()), expected)

    def test_caregiver_must_use_only_the_exact_source_group(self):
        group = SimpleNamespace(name="caregiver")
        expected = {"core.view_child", "core.add_timer"}
        bootstrap.assert_account_safe(FakeUser(expected, username="Wren", groups=("caregiver",), direct_permissions=set()), expected, caregiver_group=group)
        with self.assertRaises(RuntimeError):
            bootstrap.assert_account_safe(FakeUser(expected | {"core.delete_timer"}, username="Wren", groups=("caregiver",), direct_permissions=set()), expected, caregiver_group=group)

    def test_identity_uses_actual_timer_delete_permission(self):
        rows = bootstrap.identity_rows([FakeUser({"core.delete_timer"}), FakeUser(set(), username="Sage")])
        self.assertEqual(rows, [
            {"username": "Rowan", "id": 17, "permissions": ["core.delete_timer"], "timerDeletePermission": True},
            {"username": "Sage", "id": 17, "permissions": [], "timerDeletePermission": False},
        ])

    def test_json_output_is_mode_600_and_exclusive(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "access.json"
            payload = {"accounts": [{"username": "rowan", "password": "hidden-test-value"}]}
            bootstrap.write_json_exclusive(path, payload)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            original = path.read_bytes()
            self.assertEqual(json.loads(original), payload)
            with self.assertRaises(FileExistsError):
                bootstrap.write_json_exclusive(path, {"accounts": []})
            self.assertEqual(path.read_bytes(), original)

    def test_dry_run_does_not_create_users_or_output_files(self):
        caregiver_view_models = ("child", "timer", "feeding", "diaperchange", "sleep", "medication", "temperature", "weight", "note", "tummytime")
        caregiver_add_change_models = ("timer", "feeding", "diaperchange", "sleep", "medication", "temperature", "weight", "note", "tummytime")
        expected = set().union(
            bootstrap.expected_permissions(self.models),
            bootstrap.caregiver_permissions(caregiver_view_models, caregiver_add_change_models),
        )
        caregiver_expected = bootstrap.caregiver_permissions(caregiver_view_models, caregiver_add_change_models)

        class Manager:
            creates = 0

            def filter(self, **_kwargs):
                return SimpleNamespace(first=lambda: None)

            def create_user(self, **_kwargs):
                self.creates += 1
                raise AssertionError("dry run must not create users")

        permission_rows = [SimpleNamespace(content_type=SimpleNamespace(app_label=name.split(".", 1)[0]), codename=name.split(".", 1)[1]) for name in expected]

        class PermissionManager:
            def filter(self, **_kwargs):
                return permission_rows

        class GroupPermissionManager:
            def select_related(self, *_fields):
                return self

            def all(self):
                return [row for row in permission_rows if f"{row.content_type.app_label}.{row.codename}" in caregiver_expected]

        class GroupManager:
            def get(self, **_kwargs):
                return SimpleNamespace(name="caregiver", permissions=GroupPermissionManager())

        class UserModel:
            objects = Manager()

        with tempfile.TemporaryDirectory() as directory:
            access = Path(directory) / "access.json"
            identities = Path(directory) / "identities.json"
            household_file = Path(directory) / "household.json"
            household_file.write_text(json.dumps(adults(("Rowan", "owner"), ("Sage", "owner"), ("Wren", "caregiver"))), encoding="utf-8")
            original_paths = bootstrap.ACCESS_PATH, bootstrap.IDENTITIES_PATH, bootstrap.initialize_django
            bootstrap.ACCESS_PATH, bootstrap.IDENTITIES_PATH = access, identities
            bootstrap.initialize_django = lambda: None
            auth_apps = types.ModuleType("django.apps")
            auth_apps.apps = SimpleNamespace(get_app_config=lambda _name: SimpleNamespace(get_models=lambda: self.models))
            auth = types.ModuleType("django.contrib.auth")
            auth.get_user_model = lambda: UserModel
            auth_models = types.ModuleType("django.contrib.auth.models")
            auth_models.Permission = SimpleNamespace(objects=PermissionManager())
            auth_models.Group = SimpleNamespace(objects=GroupManager())
            db = types.ModuleType("django.db")
            db.transaction = types.SimpleNamespace()
            django = types.ModuleType("django")
            django.__path__ = []
            contrib = types.ModuleType("django.contrib")
            contrib.__path__ = []
            core = types.ModuleType("core")
            core.__path__ = []
            core_apps = types.ModuleType("core.apps")
            core_apps.CAREGIVER_VIEW_MODELS = caregiver_view_models
            core_apps.CAREGIVER_ADD_CHANGE_MODELS = caregiver_add_change_models
            modules = {
                "django": django,
                "django.contrib": contrib,
                "django.apps": auth_apps,
                "django.contrib.auth": auth,
                "django.contrib.auth.models": auth_models,
                "django.db": db,
                "core": core,
                "core.apps": core_apps,
            }
            original_argv = sys.argv
            original_modules = {name: sys.modules.get(name) for name in modules}
            try:
                sys.modules.update(modules)
                sys.argv = ["bootstrap_household.py", "--dry-run", "--household", str(household_file)]
                self.assertEqual(bootstrap.main(), 0)
                self.assertEqual(UserModel.objects.creates, 0)
                self.assertFalse(access.exists())
                self.assertFalse(identities.exists())
            finally:
                sys.argv = original_argv
                bootstrap.ACCESS_PATH, bootstrap.IDENTITIES_PATH, bootstrap.initialize_django = original_paths
                for name in modules:
                    if original_modules[name] is None:
                        sys.modules.pop(name, None)
                    else:
                        sys.modules[name] = original_modules[name]

    def test_fresh_creation_adds_only_missing_profile_permission_to_caregiver_group(self):
        views = ("child", "timer", "feeding")
        additions = ("timer", "feeding")
        caregiver_expected = bootstrap.caregiver_permissions(views, additions)
        all_expected = bootstrap.expected_permissions(self.models) | caregiver_expected

        def permission(name):
            app, codename = name.split(".", 1)
            return SimpleNamespace(content_type=SimpleNamespace(app_label=app), codename=codename, full_name=name)

        rows = [permission(name) for name in all_expected]

        class GroupPermissions:
            names = set(caregiver_expected) - {"babybuddy.view_settings"}

            def add(self, row):
                self.names.add(row.full_name)

            def select_related(self, *_fields):
                return self

            def all(self):
                return [row for row in rows if row.full_name in self.names]

        group_permissions = GroupPermissions()
        group = SimpleNamespace(name="caregiver", permissions=group_permissions)

        class GroupManager:
            objects = SimpleNamespace(get=lambda **_kwargs: group)

        class PermissionManager:
            objects = SimpleNamespace(filter=lambda **_kwargs: rows)

        household = [bootstrap.Adult("Rowan", "owner"), bootstrap.Adult("Sage", "owner"), bootstrap.Adult("Wren", "caregiver")]
        plan = bootstrap.load_permission_plan(self.models, set(), GroupManager, PermissionManager, views, additions, household)
        self.assertTrue(plan[4])
        self.assertEqual(group_permissions.names, caregiver_expected - {"babybuddy.view_settings"})

        created = {}

        class User:
            def __init__(self, username, first_name, pk):
                self.username = username
                self.first_name = first_name
                self.pk = pk
                self.is_staff = False
                self.is_superuser = False
                self.is_active = True
                self.direct_permissions = set()
                self.group_names = []
                self.groups = SimpleNamespace(values_list=lambda _field, flat=False: self.group_names)
                self.user_permissions = SimpleNamespace(set=self.set_permissions)

            def set_permissions(self, selected):
                self.direct_permissions = {row.full_name for row in selected}

            def get_user_permissions(self):
                return self.direct_permissions

            def get_all_permissions(self):
                return self.direct_permissions | (group_permissions.names if self.group_names else set())

            def has_perm(self, name):
                return name in self.get_all_permissions()

            def save(self, **_kwargs):
                return None

        class UserManager:
            def create_user(self, username, first_name, password):
                user = User(username, first_name, len(created) + 1)
                created[user.pk] = user
                user.groups.add = lambda selected_group: user.group_names.append(selected_group.name)
                return user

            def get(self, pk):
                return created[pk]

        user_model = SimpleNamespace(objects=UserManager())
        class Transaction:
            class atomic:
                def __enter__(self):
                    return self

                def __exit__(self, *_args):
                    return False

        with tempfile.TemporaryDirectory() as directory:
            access_path = Path(directory) / "access.json"
            identity_path = Path(directory) / "identities.json"
            old_paths = bootstrap.ACCESS_PATH, bootstrap.IDENTITIES_PATH
            bootstrap.ACCESS_PATH, bootstrap.IDENTITIES_PATH = access_path, identity_path
            try:
                result = bootstrap.apply_household(
                    user_model, Transaction, plan[0], plan[1], plan[2], plan[3], {}, [(a.username, a.username) for a in household], household, plan[4]
                )
            finally:
                bootstrap.ACCESS_PATH, bootstrap.IDENTITIES_PATH = old_paths
            self.assertEqual(result["created"], ["Rowan", "Sage", "Wren"])
            self.assertEqual(group_permissions.names, caregiver_expected)
            self.assertEqual(set(json.loads(identity_path.read_text())["accounts"][2]["permissions"]), caregiver_expected)

    def test_permission_plan_rejects_any_unapproved_caregiver_group_difference(self):
        views = ("child", "timer")
        additions = ("timer",)
        expected = bootstrap.caregiver_permissions(views, additions)
        rows = [SimpleNamespace(content_type=SimpleNamespace(app_label=name.split(".", 1)[0]), codename=name.split(".", 1)[1]) for name in expected | {"core.delete_child"}]

        class GroupPermissions:
            def select_related(self, *_fields):
                return self

            def all(self):
                return rows

        group_manager = SimpleNamespace(objects=SimpleNamespace(get=lambda **_kwargs: SimpleNamespace(name="caregiver", permissions=GroupPermissions())))
        permission_manager = SimpleNamespace(objects=SimpleNamespace(filter=lambda **_kwargs: rows))
        with self.assertRaisesRegex(RuntimeError, "permissions differ"):
            bootstrap.load_permission_plan(self.models, set(), group_manager, permission_manager, views, additions, [bootstrap.Adult("Rowan", "owner")])


def adults(*rows):
    return {"adults": [dict(zip(("username", "role", "label"), row)) if len(row) == 3 else dict(zip(("username", "role"), row)) for row in rows]}


class HouseholdFileTest(unittest.TestCase):
    """The household file replaces the three fixed names (D3)."""

    def read(self, value):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "household.json"
            path.write_text(value if isinstance(value, str) else json.dumps(value), encoding="utf-8")
            return bootstrap.load_household(path)

    def test_one_owner_alone_is_a_household(self):
        household = self.read(adults(("rowan", "owner")))
        self.assertEqual([(a.username, a.role, a.label) for a in household], [("rowan", "owner", None)])

    def test_owner_and_caregiver_keep_file_order_and_label(self):
        household = self.read(adults(("rowan", "owner"), ("wren", "caregiver", "Grandma")))
        self.assertEqual([a.username for a in household], ["rowan", "wren"])
        self.assertEqual(household[1].label, "Grandma")

    def test_five_adults_load(self):
        household = self.read(adults(("a", "owner"), ("b", "owner"), ("c", "caregiver"), ("d", "caregiver"), ("e", "caregiver")))
        self.assertEqual(len(household), 5)

    def test_a_label_is_one_text_or_one_text_for_each_language(self):
        def label(value):
            return self.read({"adults": [{"username": "a", "role": "owner", "label": value}]})[0].label

        self.assertEqual(label(" Grandma "), "Grandma")
        self.assertEqual(label({"en": "Other", "es": "Otra persona"}), {"en": "Other", "es": "Otra persona"})
        self.assertEqual(label({"en": "Other"}), {"en": "Other"})
        for bad in ("", "  ", 5, {}, {"es": "Otra"}, {"en": "Other", "fr": "Autre"}, {"en": "Other", "es": ""}, "x" * 101):
            with self.subTest(bad=bad):
                with self.assertRaisesRegex(RuntimeError, "Label"):
                    label(bad)

    def test_a_household_without_an_owner_is_refused(self):
        with self.assertRaisesRegex(RuntimeError, "owner"):
            self.read(adults(("wren", "caregiver")))

    def test_bad_files_are_refused_before_any_account_is_touched(self):
        for bad in ("not json", {}, {"adults": []}, adults(("a", "owner"), ("a", "caregiver")), adults(("a", "admin")), adults(("", "owner")),
                    adults(("a b", "owner")), adults(("a", "owner", 5)), {"adults": [{"username": "a", "role": "owner", "extra": 1}]}):
            with self.subTest(bad=bad):
                with self.assertRaises(RuntimeError):
                    self.read(bad)

    def test_dry_run_with_the_households_adults_already_in_baby_buddy_changes_no_account(self):
        # A fake Baby Buddy holds 3 invented adults that match an invented household file.
        views = ("child", "timer", "feeding")
        additions = ("timer", "feeding")
        models = HouseholdBootstrapTest.models_for_plan()
        caregiver_expected = bootstrap.caregiver_permissions(views, additions)
        owner_expected = bootstrap.expected_permissions(models)
        rows = {name: SimpleNamespace(content_type=SimpleNamespace(app_label=name.split(".", 1)[0]), codename=name.split(".", 1)[1]) for name in owner_expected | caregiver_expected}
        group = SimpleNamespace(name="caregiver", permissions=SimpleNamespace(
            select_related=lambda *_f: SimpleNamespace(all=lambda: [rows[n] for n in caregiver_expected])))
        existing = {
            "rowan": FakeUser(owner_expected, username="rowan"),
            "sage": FakeUser(owner_expected, username="sage"),
            "wren": FakeUser(caregiver_expected, username="wren", groups=("caregiver",), direct_permissions=set()),
        }
        user_model = SimpleNamespace(objects=SimpleNamespace(filter=lambda username: SimpleNamespace(first=lambda: existing.get(username))))
        household = self.read(adults(("rowan", "owner"), ("sage", "owner"), ("wren", "caregiver")))
        plan = bootstrap.load_permission_plan(models, set(), SimpleNamespace(objects=SimpleNamespace(get=lambda **_k: group)),
                                              SimpleNamespace(objects=SimpleNamespace(filter=lambda **_k: list(rows.values()))), views, additions, household)
        found, missing = bootstrap.find_existing_accounts(user_model, plan[2], plan[0], household)
        self.assertEqual(missing, [])
        self.assertEqual(sorted(found), ["rowan", "sage", "wren"])
        report = bootstrap.dry_run_report(found, missing, [], plan[4])
        self.assertEqual(report["accountChanges"], 0)
        self.assertEqual(report["wouldCreate"], [])
        # The same fake with a fourth adult in the file: exactly one change.
        bigger = self.read(adults(("rowan", "owner"), ("sage", "owner"), ("wren", "caregiver"), ("quinn", "caregiver")))
        plan = bootstrap.load_permission_plan(models, set(), SimpleNamespace(objects=SimpleNamespace(get=lambda **_k: group)),
                                              SimpleNamespace(objects=SimpleNamespace(filter=lambda **_k: list(rows.values()))), views, additions, bigger)
        found, missing = bootstrap.find_existing_accounts(user_model, plan[2], plan[0], bigger)
        self.assertEqual(bootstrap.dry_run_report(found, missing, [], plan[4])["accountChanges"], 1)

    def test_a_stored_account_with_the_wrong_role_is_refused_not_changed(self):
        # The file says caregiver; Baby Buddy holds that account with owner rights.
        views, additions = ("child", "timer"), ("timer",)
        models = HouseholdBootstrapTest.models_for_plan()
        caregiver_expected = bootstrap.caregiver_permissions(views, additions)
        owner_expected = bootstrap.expected_permissions(models)
        rows = {name: SimpleNamespace(content_type=SimpleNamespace(app_label=name.split(".", 1)[0]), codename=name.split(".", 1)[1]) for name in owner_expected | caregiver_expected}
        group = SimpleNamespace(name="caregiver", permissions=SimpleNamespace(select_related=lambda *_f: SimpleNamespace(all=lambda: [rows[n] for n in caregiver_expected])))
        user_model = SimpleNamespace(objects=SimpleNamespace(filter=lambda username: SimpleNamespace(first=lambda: FakeUser(owner_expected, username=username))))
        household = self.read(adults(("rowan", "owner"), ("wren", "caregiver")))
        plan = bootstrap.load_permission_plan(models, set(), SimpleNamespace(objects=SimpleNamespace(get=lambda **_k: group)),
                                              SimpleNamespace(objects=SimpleNamespace(filter=lambda **_k: list(rows.values()))), views, additions, household)
        with self.assertRaisesRegex(RuntimeError, "caregiver group alone|different permissions"):
            bootstrap.find_existing_accounts(user_model, plan[2], plan[0], household)

    def test_the_example_file_loads_and_the_family_file_stays_out_of_git(self):
        household = bootstrap.load_household(Path(__file__).parent / "household.example.json")
        self.assertTrue(any(a.role == "owner" for a in household))
        ignore = (Path(__file__).parent.parent / ".gitignore").read_text().split()
        self.assertIn("deploy/household.json", ignore)


if __name__ == "__main__":
    unittest.main()
