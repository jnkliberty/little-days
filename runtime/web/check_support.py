"""Shared start-up for the browser checks: the static file server, the browser engine, and the page opener.

This file is a helper. It has no main(), so `runtime/test/browser-checks.py all` does not start it.
LITTLE_DAYS_BROWSER (chromium or webkit) picks the engine for every check that launches through launch_browser().
"""
import os
import re
import threading
import time
from datetime import timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

from forms_support import OPEN_DETAILS

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

ROOT = Path(__file__).resolve().parent
MX = ZoneInfo("America/Mexico_City")
ENGINES = ("chromium", "webkit", "firefox")


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass


def start_static_server():
    """Serve the web folder on a free local port. Returns (server, base URL); the caller ends it with server.shutdown()."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


def browser_engine():
    """The engine named by LITTLE_DAYS_BROWSER; chromium when the variable is not set."""
    engine = os.environ.get("LITTLE_DAYS_BROWSER") or "chromium"
    if engine not in ENGINES:
        raise ValueError(f"LITTLE_DAYS_BROWSER must be one of {', '.join(ENGINES)}; got {engine!r}")
    return engine


def launch_browser(pw, engine=None, **chromium_options):
    """Launch headless in the engine from LITTLE_DAYS_BROWSER (or `engine` when a check must run in one engine only).
    chromium_options (executable_path, channel) apply to Chromium only and are ignored for other engines."""
    engine = engine or browser_engine()
    if engine == "chromium":
        return pw.chromium.launch(headless=True, **chromium_options)
    return getattr(pw, engine).launch(headless=True)


def mx_minutes(at):
    local = at.astimezone(MX)
    return local.hour * 60 + local.minute


def state_for(at, night_rules=False, lang="en", run=None):
    now = mx_minutes(at)
    resources = {n: {"view": True, "add": True, "change": True, "delete": True} for n in ["feedings", "changes", "sleep", "pumping", "weight", "height", "head-circumference", "children", "timers", "notes"]}
    entries = [
        {"id": "e1", "type": "feed", "side": "L", "dur": 18, "t": now - 95, "by": "Rowan"},
        {"id": "e2", "type": "sleep", "nap": True, "dur": 75, "t": now - 240, "by": "Sage"},
        {"id": "e3", "type": "diaper", "kind": "W", "t": now - 50, "by": "Rowan"},
        {"id": "e4", "type": "note", "title": "handoff", "text": "Fed at 2. Gas drops given.", "t": now - 30, "by": "Sage"},
    ]
    return {"me": {"id": "adult:1", "name": "Rowan"}, "people": [{"id": "adult:1", "name": "Rowan", "onDuty": True}, {"id": "adult:2", "name": "Sage"}],
            "child": {"id": "child:1", "name": "Ada", "birthDate": (at.astimezone(MX).date() - timedelta(days=100)).isoformat()},
            "entries": entries, "run": run, "sleepRun": None,
            "permissions": {"canStopOtherAdultsTimers": True, "resources": resources},
            "preferences": {"units": "metric", "language": lang, "palette": "Sorbet", "night": night_rules}}


def development_batch(day):
    """The daily guidance the server sends. The app no longer builds age-based facts from its own files."""
    cards = [("sleep-range", ["A general sleep range for this age", "Un rango general de sueño para esta edad"], "Sleep and development"),
             ("talk-back", ["Talk back when your baby makes sounds", "Responda cuando su bebé haga sonidos"], "Language")]
    return {"date": day, "status": "ready", "cards": [
        {"id": f"{name}-{day}", "date": day, "topic": [topic, topic], "title": title,
         # Each card has its own body: Home shows a repeated body once (card mix, 2026-11-19).
         "body": [f"Synthetic guidance for this check: {title[0]}.", f"Guía sintética para esta prueba: {title[1]}."],
         "source": ["Sample source", "Fuente de muestra"], "sourceDate": "Retrieved " + day,
         "url": "https://example.com/guidance"} for name, title, topic in cards]}


def open_app(browser, base, width, height, at, night_rules=False, lang="en", theme=None, run=None, writes=None, freeze=True, mode="saved", broken_storage=False, locale=None, development=False, ai=True):
    context = browser.new_context(viewport={"width": width, "height": height}, **({"locale": locale} if locale else {}))
    if theme:
        context.add_init_script(f"localStorage.setItem('little-days-theme','{theme}')")
    if broken_storage:
        context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('storage blocked')}})")
    context.add_init_script(OPEN_DETAILS)  # the forms keep Day, Ended and Note behind More details
    page = context.new_page()
    if freeze:
        page.clock.set_fixed_time(at)
    state = state_for(at, night_rules, lang, run)
    page.st = state
    page.writes = writes if writes is not None else []
    page.mode = mode
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))

    def events(route):
        body = route.request.post_data_json
        page.writes.append(body)
        entry = {**{k: v for k, v in body["event"].items() if k != "time"}, "id": f"new-{len(page.writes)}", "by": "Rowan", "t": mx_minutes(at)}
        if page.mode == "race":  # the other adult saved a diaper at the same moment, listed before ours
            state["entries"].append({"id": "other-adult-diaper", "type": "diaper", "kind": "D", "t": mx_minutes(at), "by": "Sage"})
        state["entries"].append(entry)
        if page.mode == "recover":  # the reply is lost after the server saved: the app must check the operation
            route.abort()
            return
        if page.mode == "pending":  # the server is still working: no state and no entry ID until the poll ends
            route.fulfill(json={"status": "pending", "operationId": body["operationId"]})
            return
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "id": entry["id"], "state": state})

    def operation(route):
        route.fulfill(json={"status": "saved", "id": state["entries"][-1]["id"]})

    page.route("**/api/session", lambda r: r.fulfill(json={"me": {"name": "Rowan"}, "csrf": "c", "people": ["Rowan", "Sage"], "careLink": True, "ai": ai}))
    # A sign-in that ends asks for the household passcode again; this stub accepts any passcode.
    page.route("**/api/session/passcode", lambda r: r.fulfill(json={"people": ["Rowan", "Sage"]}))
    page.route(re.compile(r"/api/state(\?.*)?$"), lambda r: r.fulfill(json=state))
    page.route("**/api/growth", lambda r: r.fulfill(json={"entries": [], "unavailable": []}))
    page.route(re.compile(r"/api/photos(\?.*)?$"), lambda r: r.fulfill(json={"photos": [], "nextOffset": None}) if r.request.method == "GET" else r.fallback())
    if development:  # daily guidance comes from the server; a page that wants a source fact must serve it
        def guidance(route):  # like the server, send no cards for a child with no birth date
            batch = development_batch(at.astimezone(MX).date().isoformat())
            route.fulfill(json=batch if state["child"].get("birthDate") else {**batch, "cards": []})
        page.route("**/api/development", guidance)
    page.route("**/api/events", events)
    page.route("**/api/operations/*", operation)
    page.goto(base)
    page.locator('.tile[data-act="open-feed"], .run').first.wait_for()
    return page
