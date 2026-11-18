#!/usr/bin/env python3
"""Child tools for the install script. They run inside the Baby Buddy container.

  child_tools.py remove   Remove the one test child that the live smoke made. Reads the smoke summary on standard input.
                          It deletes only a child whose number and exact name match the summary and whose name starts
                          with the fixture prefix, then confirms the child is gone.
  child_tools.py list     Print the first name of every child as a JSON list.
"""

import json
import os
import sys
from pathlib import Path

APP_PATH = "/app/www/public"
SECRET_PATH = Path("/config/.secretkey")
PREFIX = "LittleDaysRuntimeTest-"


def target(summary):
    """Return (child number, name) to remove, None when the smoke made no child, or raise when the summary is not a fixture."""
    if not isinstance(summary, dict):
        raise RuntimeError("The smoke summary is not an object.")
    child_id, name = summary.get("childId"), summary.get("name")
    if child_id is None:
        return None
    if isinstance(child_id, bool) or not isinstance(child_id, int) or child_id < 1 or not isinstance(name, str) or not name.startswith(PREFIX):
        raise RuntimeError("The summary does not name a fixture child; nothing was removed.")
    return child_id, name


def django_ready():
    os.environ["DJANGO_SETTINGS_MODULE"] = "babybuddy.settings.base"
    os.environ["SECRET_KEY"] = SECRET_PATH.read_text(encoding="utf-8").strip()
    sys.path.insert(0, APP_PATH)
    import django

    django.setup()


def remove() -> int:
    found = target(json.load(sys.stdin))
    if found is None:
        print("No fixture child to remove.")
        return 0
    django_ready()
    from core.models import Child

    child_id, name = found
    child = Child.objects.get(pk=child_id)
    if child.first_name != name:
        raise RuntimeError("The child with that number has a different name; nothing was removed.")
    child.delete()
    if Child.objects.filter(pk=child_id).exists():
        raise RuntimeError("The fixture child is still there after the delete.")
    print("Fixture child removed after exact number and name checks.")
    return 0


def list_children() -> int:
    django_ready()
    from core.models import Child

    print(json.dumps(sorted(child.first_name for child in Child.objects.all())))
    return 0


def main(argv) -> int:
    if len(argv) != 1 or argv[0] not in ("remove", "list"):
        raise RuntimeError("Usage: child_tools.py remove|list")
    return remove() if argv[0] == "remove" else list_children()


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as error:
        raise SystemExit(f"Fixture removal failed: {error}")
