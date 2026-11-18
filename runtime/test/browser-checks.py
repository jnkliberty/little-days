"""Run the existing browser suites locally with synthetic API responses only."""
import argparse
import importlib.util
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HAS_MAIN = re.compile(r"^def main\(", re.MULTILINE)


def discover_checks():
    """Every web/check_*.py that defines main(), in name order. A helper module without main() is run by the check that imports it."""
    return [path for path in sorted((ROOT / "web").glob("check_*.py")) if HAS_MAIN.search(path.read_text())]


def run_all(browser, dry_run):
    checks = discover_checks()
    if dry_run:
        for path in checks:
            print(f"Run {path.name} in local {browser} with synthetic API responses. No family service access.")
        return 0
    env = {**os.environ, "LITTLE_DAYS_BROWSER": browser}
    results = []
    for path in checks:
        print(f"=== {path.name}", flush=True)
        started = time.monotonic()
        code = subprocess.run([sys.executable, str(path)], cwd=ROOT / "web", env=env).returncode
        results.append((path.name, code, time.monotonic() - started))
    print("=== summary")
    for name, code, seconds in results:
        print(f"{'pass' if code == 0 else 'FAIL'} {name} ({seconds:.0f}s)")
    failed = [name for name, code, _ in results if code != 0]
    print(f"{len(results) - len(failed)} of {len(results)} check files passed")
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suite", choices=["ui", "writes", "charts", "review", "all"])
    parser.add_argument("--browser", choices=["chromium", "webkit"], default=os.environ.get("LITTLE_DAYS_BROWSER", "chromium"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.suite == "all":
        return run_all(args.browser, args.dry_run)
    name = "review_20261103" if args.suite == "review" else args.suite
    source = ROOT / "web" / f"check_{name}.py"
    if args.dry_run:
        assert source.is_file()
        print(f"Run {source.name} in local {args.browser} with synthetic API responses. No family service access.")
        return 0
    os.environ["LITTLE_DAYS_BROWSER"] = args.browser
    sys.path.insert(0, str(ROOT / "web"))
    spec = importlib.util.spec_from_file_location("browser_suite", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.main()


if __name__ == "__main__":
    raise SystemExit(main())
