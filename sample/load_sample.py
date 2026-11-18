#!/usr/bin/env python3
"""Add 7 days of invented care records for a sample baby, so the screens have something to show.

Run it once, after install.py, on a sample install only. Every record is made up. It signs in as an owner
through the app, the same way a phone does.

  python3 sample/load_sample.py --origin https://localhost:8443 --username river [--cafile caddy-root.crt]
The passcode is read from the terminal, or from standard input when you pipe it in.
"""
import argparse
import getpass
import json
import random
import ssl
import sys
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def day_events(day: datetime, rng: random.Random) -> list[dict]:
    """One invented day. `day` is local midnight. Times are local; sleeps never overlap."""
    def at(hour: float) -> datetime:
        return day + timedelta(minutes=round(hour * 60 + rng.uniform(-12, 12)))

    def span(start_hour: float, minutes: int, kind: str, **more) -> dict:
        start = at(start_hour)
        return {"type": kind, "start": start, "end": start + timedelta(minutes=minutes), **more}

    events = [span(0.0, 160, "sleep", nap=False), span(3.25, 175, "sleep", nap=False), span(9.5, 65, "sleep", nap=True),
              span(13.0, 85, "sleep", nap=True), span(16.25, 35, "sleep", nap=True), span(19.75, 220, "sleep", nap=False)]
    for hour, how in [(2.8, "bottle"), (6.4, "breast"), (9.0, "bottle"), (12.0, "breast"), (15.0, "bottle"), (17.6, "breast"), (19.2, "bottle"), (23.6, "breast")]:
        events.append({"type": "bottle", "milk": "formula", "ml": rng.choice([70, 80, 90, 100, 110]), "time": at(hour)} if how == "bottle" else span(hour, rng.choice([12, 15, 18]), "feed", side=rng.choice(["L", "R"])))
    for hour in (6.5, 9.2, 12.3, 15.4, 18.5, 21.2):
        events.append({"type": "diaper", "kind": rng.choice(["W", "W", "W", "B", "D"]), "time": at(hour)})
    return events


def wire(event: dict) -> dict:
    return {key: (value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if isinstance(value, datetime) else value) for key, value in event.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--zone", default="America/Chicago")
    parser.add_argument("--cafile")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    passcode = getpass.getpass("Household passcode: ") if sys.stdin.isatty() else sys.stdin.readline().rstrip("\n")
    context = ssl.create_default_context(cafile=args.cafile)
    base = args.origin.rstrip("/")

    def call(path, method="GET", body=None, cookie="", csrf=""):
        headers = {"content-type": "application/json", "origin": base, **({"cookie": cookie} if cookie else {}), **({"x-csrf-token": csrf} if csrf else {})}
        request = urllib.request.Request(base + path, method=method, headers=headers, data=None if body is None else json.dumps(body).encode())
        with urllib.request.urlopen(request, timeout=30, context=context) as response:
            return json.loads(response.read() or b"{}"), response.headers

    session, _ = call("/api/session")
    me, headers = call("/api/session", "POST", {"username": args.username, "passcode": passcode}, csrf=session["csrf"])
    cookie = headers["set-cookie"].split(";", 1)[0]
    zone, rng, now = ZoneInfo(args.zone), random.Random(2026), datetime.now(timezone.utc)
    today = datetime.now(zone).replace(hour=0, minute=0, second=0, microsecond=0)
    saved = skipped = 0
    for back in range(args.days, -1, -1):
        for event in sorted(day_events(today - timedelta(days=back), rng), key=lambda e: e.get("start", e.get("time"))):
            if max(event.get("end", event.get("time")), event.get("start", event.get("time"))) > now - timedelta(minutes=5):
                skipped += 1
                continue
            result, _ = call("/api/events", "POST", {"operationId": str(uuid.uuid4()), "event": wire(event)}, cookie=cookie, csrf=me["csrf"])
            saved += result.get("status") == "saved"
    print(f"Saved {saved} invented records. Left out {skipped} that fall in the future.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
