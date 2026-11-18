#!/usr/bin/env python3
"""Disable Baby Buddy's default admin without removing its superuser row."""

import argparse
import os
import sys
from pathlib import Path


APP_PATH = "/app/www/public"
SECRET_PATH = Path("/config/.secretkey")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    secret_key = SECRET_PATH.read_text(encoding="utf-8").strip()
    if not secret_key:
        raise SystemExit("Baby Buddy secret key is empty; admin was not changed.")
    os.environ["DJANGO_SETTINGS_MODULE"] = "babybuddy.settings.base"
    os.environ["SECRET_KEY"] = secret_key
    sys.path.insert(0, APP_PATH)

    import django

    django.setup()

    from django.contrib.auth import get_user_model

    user = get_user_model().objects.get(username="admin")
    if not user.is_superuser:
        raise SystemExit("The admin account is not a superuser; no change made.")

    if args.dry_run:
        print("Dry run passed: admin exists and remains a superuser; no changes made.")
        return 0

    user.is_active = False
    user.set_unusable_password()
    user.save(update_fields=["is_active", "password"])
    user.refresh_from_db()
    assert user.is_superuser
    assert not user.is_active
    assert not user.has_usable_password()
    print("Default admin disabled; superuser row retained; password unusable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
