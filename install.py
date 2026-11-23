#!/usr/bin/env python3
"""Install Little Days on one computer with Docker. Run it from this folder: python3 install.py

It asks for the adults (a name and a role each), a household passcode, the child, the app address, and the
time zone. Then it runs 8 steps in order and stops at the first failure. Answers can also come from standard
input, one line each, in the order they are asked (see sample/answers.txt).
"""
import getpass
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import uuid
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CONFIG = DATA / "babybuddy"
USERNAME = re.compile(r"^[A-Za-z0-9._@+-]{1,150}$")
RECEIPT_NEEDS = ("Baby Buddy numeric unit readback", "CSV values escaped and present")
GATEWAY_URL = "http://127.0.0.1:18084"


class AnswerError(Exception):
    pass


class StepError(Exception):
    def __init__(self, step: str, message: str):
        super().__init__(f"{step}: {message}")


def origin_parts(origin: str) -> tuple[str, int]:
    try:
        parsed = urlparse(origin.strip())
        port = parsed.port
    except ValueError:
        raise AnswerError("Use a valid host name and a port from 1 to 65535.") from None
    if port == 0:
        raise AnswerError("Use a port from 1 to 65535.")
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise AnswerError("The address must start with https:// and hold only a host name and an optional port, such as https://localhost")
    return parsed.hostname, port or 443


def normalize_origin(origin: str) -> str:
    """The one form a browser sends in its Origin header: lower-case host, no default port, no trailing slash."""
    host, port = origin_parts(origin)
    shown = f"[{host}]" if ":" in host else host
    return f"https://{shown}" + ("" if port == 443 else f":{port}")


def check_username(value: str) -> str:
    value = value.strip()
    if not USERNAME.match(value):
        raise AnswerError("Use 1 to 150 letters, digits, or . _ @ + - with no spaces.")
    return value


def check_role(value: str) -> str:
    if value not in ("owner", "caregiver"):
        raise AnswerError("Type owner or caregiver.")
    return value


def check_child_name(value: str) -> str:
    if not 1 <= len(value.strip()) <= 100:
        raise AnswerError("Use 1 to 100 characters.")
    return value.strip()


def household_text(adults: list[dict]) -> str:
    names = [adult["username"] for adult in adults]
    if not adults or len(set(names)) != len(names):
        raise AnswerError("List at least one adult, and give each adult a different name.")
    if not any(adult["role"] == "owner" for adult in adults):
        raise AnswerError("At least one adult must be an owner.")
    return json.dumps({"adults": adults}, indent=2) + "\n"


def check_passcode(value: str) -> str:
    length = len(unicodedata.normalize("NFKC", value))
    if length < 10 or length > 256:
        raise AnswerError("The passcode needs 10 to 256 characters.")
    return value


def check_birth_date(value: str) -> str:
    try:
        born = date.fromisoformat(value.strip())
    except ValueError:
        raise AnswerError("Type the birth date as YYYY-MM-DD.") from None
    if born > date.today() or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value.strip()):
        raise AnswerError("Type the birth date as YYYY-MM-DD, today or earlier.")
    return value.strip()


def check_zone(value: str) -> str:
    try:
        ZoneInfo(value.strip())
    except Exception:
        raise AnswerError("Type a time zone name such as America/Chicago.") from None
    return value.strip()


def local_zone() -> str:
    """The computer's own zone name from /etc/localtime, or UTC when it cannot be read."""
    try:
        name = "/".join(Path(os.path.realpath("/etc/localtime")).parts[-2:])
        return check_zone(name)
    except (OSError, AnswerError):
        return "UTC"


def env_text(origin: str, zone: str, uid: int, gid: int) -> str:
    origin = normalize_origin(origin)
    host, port = origin_parts(origin)
    return (
        "# Written by install.py. Add the AI settings here to turn AI on; see README.md.\n"
        f"LITTLE_DAYS_ORIGIN={origin}\n"
        f"LITTLE_DAYS_HOST={host}\n"
        f"LITTLE_DAYS_HTTPS_PORT={port}\n"
        "LITTLE_DAYS_BIND=127.0.0.1\n"
        f"TZ={zone}\n"
        f"LITTLE_DAYS_UID={uid}\n"
        f"LITTLE_DAYS_GID={gid}\n"
    )


def timer_flags(adults: list[dict]) -> list[str]:
    """Baby Buddy lets only an account with the delete-timer permission stop or switch a timer. Owners get it."""
    return [item for adult in adults if adult["role"] == "owner" for item in ("--timer-stop-adult", adult["username"])]


def expect_accounts(report: str, expected: int) -> None:
    try:
        changes = json.loads(report.strip().splitlines()[-1])["accountChanges"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise StepError("household dry run", "the report could not be read") from None
    if changes != expected:
        raise StepError("household dry run", f"expected {expected} new accounts and found {changes}")


def run_steps(steps) -> None:
    total = len(steps)
    for number, (title, action) in enumerate(steps, 1):
        print(f"Step {number} of {total}: {title}", flush=True)
        action()


def compose(*args: str, stdin: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(["docker", "compose", *args], cwd=ROOT, input=stdin, capture_output=True, text=True)
    if check and result.returncode != 0:
        tail = (result.stderr or result.stdout).strip().splitlines()[-6:]
        raise StepError(" ".join(args[:3]), "failed. " + " | ".join(tail))
    return result


def ask(prompt: str, check, default: str = "") -> str:
    while True:
        text = input(f"{prompt}{f' [{default}]' if default else ''}: ").strip() or default
        try:
            return check(text)
        except AnswerError as error:
            print(f"  {error}")
            if not sys.stdin.isatty():
                raise SystemExit(f"Stopped: {error}") from None


def ask_adults() -> list[dict]:
    adults: list[dict] = []
    while True:
        first = not adults
        name = ask(f"Adult {len(adults) + 1} name (used to sign in)", check_username)
        role = ask("Role, owner or caregiver (a caregiver sees fewer records)", check_role, "owner" if first else "caregiver")
        label = input("Name to show on screens (press Enter to use the sign-in name): ").strip()
        adults.append({"username": name, "role": role, **({"label": label[:100]} if label else {})})
        if input("Add another adult? [y/N]: ").strip().lower() != "y":
            return adults


def secret(prompt: str) -> str:
    # With answers piped in, read them from standard input; getpass would read the terminal instead.
    return getpass.getpass(prompt) if sys.stdin.isatty() else input(prompt)


def ask_passcode() -> str:
    while True:
        try:
            first = check_passcode(secret("Household passcode (10 or more characters): "))
        except AnswerError as error:
            print(f"  {error}")
            if not sys.stdin.isatty():
                raise SystemExit(f"Stopped: {error}") from None
            continue
        if secret("Type it again: ") == first:
            return first
        print("  The two entries differ.")
        if not sys.stdin.isatty():
            raise SystemExit("Stopped: the two passcode entries differ.")


def gateway_request(path: str, origin: str, method: str = "GET", body=None, cookie: str = "", csrf: str = ""):
    headers = {"content-type": "application/json", "origin": origin}
    if cookie:
        headers["cookie"] = cookie
    if csrf:
        headers["x-csrf-token"] = csrf
    request = urllib.request.Request(GATEWAY_URL + path, method=method, headers=headers, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"{}"), response.headers
    except urllib.error.HTTPError as error:
        raise StepError("child setup", f"the app answered {error.code} for {method} {path}") from None


def create_child(origin: str, owner: str, passcode: str, name: str, birth: str) -> None:
    session, _ = gateway_request("/api/session", origin)
    login, headers = gateway_request("/api/session", origin, "POST", {"username": owner, "passcode": passcode}, csrf=session["csrf"])
    cookie = (headers.get("set-cookie") or "").split(";", 1)[0]
    if not cookie:
        raise StepError("child setup", "sign-in returned no session")
    saved, _ = gateway_request("/api/children", origin, "POST", {"operationId": str(uuid.uuid4()), "firstName": name, "birthDate": birth}, cookie=cookie, csrf=login["csrf"])
    if saved.get("status") != "saved":
        raise StepError("child setup", "the child was not saved")


def prepare_files(answers: dict) -> None:
    if (ROOT / ".env").exists() or CONFIG.exists():
        raise SystemExit("This folder already has an install (.env or data/). To start over, run: docker compose down, then delete .env and data/.")
    CONFIG.mkdir(parents=True)
    (DATA / "gateway").mkdir()
    (CONFIG / "household.json").write_text(household_text(answers["adults"]), encoding="utf-8")
    fd = os.open(ROOT / ".env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(env_text(answers["origin"], answers["zone"], os.getuid(), os.getgid()))


def step_start_baby_buddy() -> None:
    compose("up", "-d", "--wait", "--wait-timeout", "600", "babybuddy")


def step_lock_default_admin() -> None:
    compose("exec", "-T", "babybuddy", "python", "/deploy/admin_lockdown.py", "--dry-run")
    compose("exec", "-T", "babybuddy", "python", "/deploy/admin_lockdown.py")
    probe = ("import urllib.request,urllib.error,base64\n"
             "r=urllib.request.Request('http://127.0.0.1:8000/api/children/',headers={'Authorization':'Basic '+base64.b64encode(b'admin:admin').decode()})\n"
             "try:\n    urllib.request.urlopen(r); print('OPEN')\n"
             "except urllib.error.HTTPError as e:\n    print('DENIED' if e.code in (401,403) else 'OTHER')\n")
    if compose("exec", "-T", "babybuddy", "python", "-c", probe).stdout.strip() != "DENIED":
        raise StepError("default admin", "the default administrator account can still sign in")


def step_create_accounts(adults: list[dict]) -> None:
    flags = timer_flags(adults)
    dry = compose("exec", "-T", "babybuddy", "python", "/deploy/bootstrap_household.py", "--dry-run", *flags)
    expect_accounts(dry.stdout, len(adults))
    compose("exec", "-T", "babybuddy", "python", "/deploy/bootstrap_household.py", "--apply", *flags)
    own = f"{os.getuid()}:{os.getgid()}"
    compose("exec", "-T", "babybuddy", "sh", "-c", f"chown {own} /config/little-days-household-access.json /config/little-days-household-identities.json /config/household.json")


def gateway_run(*args: str, stdin: str | None = None, mounts: tuple[str, ...] = ()) -> subprocess.CompletedProcess:
    flags = [item for mount in mounts for item in ("-v", mount)]
    return compose("run", "--rm", "--no-deps", "-T", *flags, "gateway", *args, stdin=stdin)


def step_set_passcode(passcode: str) -> None:
    gateway_run("node", "server/passcode.ts", stdin=passcode)


def step_receipt_checks() -> None:
    receipt = CONFIG / "receipt.json"
    receipt.write_text("{}\n", encoding="utf-8")
    receipt.chmod(0o600)
    config = str(CONFIG)
    mounts = (f"{config}/little-days-household-access.json:/run/credentials.json:ro", f"{config}/little-days-household-identities.json:/run/identities.json:ro", f"{config}/household.json:/run/household.json:ro", f"{receipt}:/run/receipt.json")
    smoke = subprocess.run(["docker", "compose", "run", "--rm", "--no-deps", "-T", *[x for m in mounts for x in ("-v", m)], "-e", "BABYBUDDY_URL=http://babybuddy:8000", "gateway", "node", "test/live-smoke.ts",
                            "--credentials-file", "/run/credentials.json", "--identity-file", "/run/identities.json", "--household-file", "/run/household.json", "--cleanup-summary", "/run/receipt.json", "--receipt-only"],
                           cwd=ROOT, capture_output=True, text=True)
    # The test child goes away whether the checks passed or failed.
    removal = compose("exec", "-T", "babybuddy", "python", "/deploy/child_tools.py", "remove", stdin=receipt.read_text(encoding="utf-8"), check=False)
    if removal.returncode != 0:
        raise StepError("receipt checks", "the test child could not be removed: " + (removal.stderr or removal.stdout).strip()[-300:])
    if smoke.returncode != 0:
        raise StepError("receipt checks", "failed. " + (smoke.stderr or smoke.stdout).strip()[-300:])
    passed = json.loads(receipt.read_text(encoding="utf-8")).get("passed", [])
    if not all(name in passed for name in RECEIPT_NEEDS):
        raise StepError("receipt checks", "the receipt lacks a required check")


def step_configure() -> None:
    config = str(CONFIG)
    mounts = (f"{config}/little-days-household-identities.json:/run/identities.json:ro", f"{config}/receipt.json:/run/receipt.json:ro", f"{config}/household.json:/run/household.json:ro")
    for mode in ("--dry-run", "--apply"):
        gateway_run("node", "server/configure.ts", mode, "/run/identities.json", "/run/receipt.json", "/run/household.json", mounts=mounts)


def step_start_gateway() -> None:
    compose("up", "-d", "--wait", "--wait-timeout", "120", "gateway", "caddy")


def step_create_child(answers: dict, passcode: str) -> None:
    owner = next(adult["username"] for adult in answers["adults"] if adult["role"] == "owner")
    create_child(answers["origin"], owner, passcode, answers["child"], answers["birth"])
    names = json.loads(compose("exec", "-T", "babybuddy", "python", "/deploy/child_tools.py", "list").stdout.strip().splitlines()[-1])
    if names != [answers["child"]]:
        raise StepError("child setup", "the child list does not hold only the child you typed")


def main() -> int:
    if len(sys.argv) > 1:
        print(__doc__)
        return 0
    if subprocess.run(["docker", "compose", "version"], capture_output=True).returncode != 0:
        raise SystemExit("Docker with the compose plugin is required.")
    started = time.monotonic()
    answers = {
        "origin": ask("App address", normalize_origin, "https://localhost"),
        "zone": ask("Time zone", check_zone, os.environ.get("TZ") or local_zone()),
        "adults": ask_adults(),
    }
    passcode = ask_passcode()
    answers["child"] = ask("Child's first name", check_child_name)
    answers["birth"] = ask("Child's birth date (YYYY-MM-DD)", check_birth_date)
    household_text(answers["adults"])
    prepare_files(answers)
    print("Building the app image. The first run downloads images and can take a few minutes.", flush=True)
    compose("build", "gateway")
    run_steps([
        ("start Baby Buddy and wait for its migrations", step_start_baby_buddy),
        ("disable the default administrator account", step_lock_default_admin),
        ("create the adult accounts", lambda: step_create_accounts(answers["adults"])),
        ("set the household passcode", lambda: step_set_passcode(passcode)),
        ("run the receipt checks and remove the test child", step_receipt_checks),
        ("save the household settings", step_configure),
        ("start the app", step_start_gateway),
        ("add your child", lambda: step_create_child(answers, passcode)),
    ])
    print(f"Done in {int(time.monotonic() - started)} seconds. Open {answers['origin']} and sign in with the passcode.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except StepError as error:
        raise SystemExit(f"Stopped at {error}. Nothing after this step ran. Fix the cause and read README.md before you try again.")
    except KeyboardInterrupt:
        raise SystemExit("Stopped.")
