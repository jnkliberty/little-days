"""Browser sync: what the app does with state replies that arrive late or out of order, a hidden tab, a stuck request and a failed poll.

Audit 2026-11-12 items 3 (browser part), 9, 10, 11 and 12. Invented data only; the API is mocked, so nothing here reaches a family service.
Each audit names the failure it would catch.
  python3 check_sync.py        (Playwright Python, sandbox off: the page is served from a local port)
  python3 check_sync.py audit_hidden_tab audit_reply_order     (only the named audits)
"""
import re
import sys
from datetime import date, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

from check_support import launch_browser, start_static_server
from check_ui import navigate

PASS = 0
FAIL = 0
AT = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
TODAY = date(2026, 11, 10)
RESOURCES = ["feedings", "changes", "sleep", "pumping", "weight", "height", "head-circumference", "children", "timers", "notes"]
FEED_RUN = {"id": "r1", "side": "L", "t0": 700, "startedAt": "2026-11-10T11:30:00-06:00", "by": "Sam"}
UNDO_UNTIL = "2026-11-10T19:00:00.000Z"  # one hour after AT: a stop that waits out its Undo window
STATE = re.compile(r"/api/state(\?.*)?$")
HIDDEN = """
window.__hidden = false;
Object.defineProperty(document, 'hidden', {configurable: true, get: () => window.__hidden});
Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => window.__hidden ? 'hidden' : 'visible'});
"""


def check(name, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"PASS {name}", flush=True)
    else:
        FAIL += 1
        print(f"FAIL {name}", flush=True)


def guarded(audit, *args):
    """An audit that crashes (a missing element) counts as one failure instead of ending the run."""
    try:
        audit(*args)
    except Exception as error:  # noqa: BLE001
        check(f"{audit.__name__} ran without error ({type(error).__name__}: {str(error).splitlines()[0][:140]})", False)


def feed(entry_id, minute, note="", by="Sam"):
    return {"id": entry_id, "type": "feed", "side": "L", "dur": 12, "t": minute, "by": by, "note": note}


def base_state(lang="en"):
    resources = {name: {"view": True, "add": True, "change": True, "delete": True} for name in RESOURCES}
    return {
        "me": {"id": "adult:1", "name": "Sam"},
        "people": [{"id": "adult:1", "name": "Sam", "onDuty": True}, {"id": "adult:2", "name": "Alex"}],
        "child": {"id": "child:1", "name": "Luna", "birthDate": "2026-07-01"},
        "entries": [feed("feedings:1", 600)], "run": None, "sleepRun": None, "timers": [],
        "permissions": {"canStopOtherAdultsTimers": True, "resources": resources},
        "preferences": {"units": "metric", "language": lang, "palette": "Sorbet", "night": False},
    }


def open_page(browser, base, lang="en", fake_clock=False, hidden=False, **state):
    """The app on Home with a mocked API. page.hold keeps each /api/state reply in page.held until the audit lets it go."""
    context = browser.new_context(viewport={"width": 390, "height": 844})
    if hidden:
        context.add_init_script(HIDDEN)
    page = context.new_page()
    page.set_default_timeout(5000)
    if fake_clock:
        page.clock.install(time=AT)
    else:
        page.clock.set_fixed_time(AT)
    page.st = {**base_state(lang), **state}
    page.requests, page.held, page.hold, page.posts, page.errors, page.hung = [], [], False, [], [], []
    page.stop_mode, page.operation_mode = "saved", "pending"
    page.on("pageerror", lambda e: page.errors.append(str(e)))

    def state_route(route):
        query = parse_qs(urlparse(route.request.url).query)
        low, high = ((date.fromisoformat(query[k][0]) - TODAY).days for k in ("from", "to")) if "from" in query else (-1, 1)
        body = {**page.st, "entries": [dict(e) for e in page.st["entries"] if low <= e["t"] // 1440 < high]}
        page.requests.append({"from": query.get("from", [""])[0], "to": query.get("to", [""])[0]})
        if page.hold:  # the server answered; the reply is kept back on the way
            page.held.append({"from": query.get("from", [""])[0], "release": lambda: route.fulfill(json=body)})
            return
        route.fulfill(json=body)

    def timers(route):
        body, path = route.request.post_data_json, urlparse(route.request.url).path
        page.posts.append({"path": path, "operationId": body["operationId"]})
        if path.endswith("/stop"):
            if page.stop_mode == "hang":
                page.hung.append(route)
                return
            if page.stop_mode == "pending":
                route.fulfill(json={"status": "pending", "operationId": body["operationId"], "undoUntil": UNDO_UNTIL})
                return
            page.st["run"] = None
            route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})
            return
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})

    def operation(route):
        if page.operation_mode == "hang":
            page.hung.append(route)
            return
        route.fulfill(json={"status": "pending", "operationId": route.request.url.rsplit("/", 1)[1]})

    page.route("**/api/session", lambda r: r.fulfill(json={"me": {"id": "adult:1", "name": "Sam"}, "csrf": "c", "people": ["Sam", "Alex"]}))
    page.route(STATE, state_route)
    page.route("**/api/growth", lambda r: r.fulfill(json={"entries": [], "unavailable": []}))
    page.route("**/api/ai/status", lambda r: r.fulfill(json={"available": False}))
    page.route("**/api/development", lambda r: r.fulfill(status=503, json={"error": "off"}))
    page.route("**/api/timers/**", timers)
    page.route("**/api/operations/*", operation)
    page.goto(base)
    page.locator(".tile[data-act='open-feed'], .run, .dock").first.wait_for()
    # Each audit counts or holds its own requests after the initial Home reads finish.
    page.wait_for_function("!homeReading")
    page.requests.clear()
    return page


def done(page):
    """Close the page. Replies the audit kept back or never answered are dropped quietly."""
    for route in page.hung:
        try:
            route.abort()
        except Exception:  # noqa: BLE001
            pass
    for reply in page.held:
        try:
            reply["release"]()
        except Exception:  # noqa: BLE001
            pass
    page.unroute_all(behavior="ignoreErrors")
    page.context.close()


def ids(page):
    return sorted(page.evaluate("S.entries.map(e => e.id)"))


def state_requests(page):
    return len(page.requests)


def release(page, index):
    page.held.pop(index)["release"]()
    page.wait_for_timeout(250)


def audit_hidden_tab(browser, base):
    """Failure case: a tab that is not on screen keeps asking the server every 15 s and keeps redrawing its clocks."""
    page = open_page(browser, base, fake_clock=True, hidden=True, run=FEED_RUN)
    page.evaluate("() => { const el = document.createElement('span'); el.id = 'probe-countdown'; el.dataset.countdown = String(Date.now() + 600000); el.textContent = 'start'; document.body.append(el); }")
    live = lambda: page.evaluate("document.querySelector('[data-live=\"run\"]')?.textContent || ''")  # noqa: E731
    page.evaluate("() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); }")
    page.requests.clear()
    clock_before = live()
    check(f"the running clock is on screen ({clock_before!r})", clock_before != "")
    page.clock.run_for(31000)
    page.wait_for_timeout(300)
    check(f"a hidden tab sends no state request in 31 s ({state_requests(page)})", state_requests(page) == 0)
    check(f"a hidden tab leaves the running clock alone ({clock_before!r} to {live()!r})", live() == clock_before)
    check("a hidden tab leaves the countdown text alone", page.locator("#probe-countdown").text_content() == "start")
    page.evaluate("() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); }")
    page.wait_for_timeout(300)
    check(f"the tab visible again asks for the state at once ({state_requests(page)})", state_requests(page) == 1)
    page.clock.run_for(16000)
    page.wait_for_timeout(300)
    check(f"and the 15 s poll runs again ({state_requests(page)})", state_requests(page) >= 2)
    check("the countdown and clock run again when visible", page.locator("#probe-countdown").text_content() != "start")
    done(page)


def audit_visible_uses_poll_guard(browser, base):
    """Failure case: the tab coming back to the front starts a second poll while the 15 s poll still waits for its reply."""
    page = open_page(browser, base)
    page.hold = True
    page.evaluate("() => { tick(); }")  # the 15 s timer's own call: it marks a poll as running
    page.wait_for_timeout(150)
    one = state_requests(page)
    page.evaluate("() => { document.dispatchEvent(new Event('visibilitychange')); }")
    page.wait_for_timeout(250)
    check(f"one poll is waiting for its reply ({one}); the visible tab handler adds no second one ({state_requests(page)})", one == 1 and state_requests(page) == 1)
    page.hold = False
    done(page)


def audit_resume_own_save_id(browser, base):
    """Failure case: Resume sleep on Home sends the save ID of the stop that waits out its Undo window, so the server answers with the stop."""
    page = open_page(browser, base, run=FEED_RUN, sleepPaused={"id": "p1", "by": "Sam"})
    page.stop_mode = "pending"
    page.evaluate("() => { act('stop', ''); }")  # Stop asks first
    page.locator('.confirm [data-act="stop-go"]').click()
    page.wait_for_timeout(400)
    stop = [p for p in page.posts if p["path"].endswith("/stop")]
    check(f"the stop was sent ({len(stop)})", len(stop) == 1)
    page.locator('[data-act="resume-sleep"]').first.click()
    page.wait_for_timeout(400)
    resume = [p for p in page.posts if p["path"].endswith("/resume")]
    check(f"Resume sleep was sent ({len(resume)})", len(resume) == 1)
    check(f"Resume has its own save ID, not the pending stop's ({resume[0]['operationId'] if resume else None} and {stop[0]['operationId'] if stop else None})",
          bool(resume) and bool(stop) and resume[0]["operationId"] != stop[0]["operationId"])
    done(page)


def audit_reply_order(browser, base):
    """Failure cases: a late reply puts back what a newer reply or a save already changed."""
    # Two poll replies in reverse order around a save by the other adult.
    page = open_page(browser, base)
    page.hold = True
    page.evaluate("() => { window.__p1 = syncFamily(); }")
    page.wait_for_timeout(100)
    page.st["entries"].append(feed("feedings:2", 640, by="Alex"))  # the other adult saved a feed
    page.evaluate("() => { window.__p2 = syncFamily(); }")
    page.wait_for_timeout(100)
    check(f"both polls reached the server ({len(page.held)})", len(page.held) == 2)
    release(page, 1)
    check(f"the newer reply shows the other adult's feed ({ids(page)})", ids(page) == ["feedings:1", "feedings:2"])
    release(page, 0)
    check(f"the older reply, arriving last, does not take it away ({ids(page)})", ids(page) == ["feedings:1", "feedings:2"])
    page.hold = False
    done(page)

    # Two day loads whose replies arrive in reverse order: both days show.
    page = open_page(browser, base)
    page.st["entries"] += [feed("feedings:d3", -3 * 1440 + 600), feed("feedings:d5", -5 * 1440 + 600)]
    page.hold = True
    page.evaluate("() => { loadTimelineOneDay(-3); loadTimelineOneDay(-5); }")
    page.wait_for_timeout(100)
    check(f"both day loads reached the server ({len(page.held)})", len(page.held) == 2)
    release(page, 1)
    release(page, 0)
    check(f"two day loads in reverse order: both days show ({ids(page)})", "feedings:d3" in ids(page) and "feedings:d5" in ids(page))
    page.hold = False
    done(page)

    # An old Charts poll reply that arrives after a confirmed stop does not bring the timer back.
    page = open_page(browser, base, run=FEED_RUN)
    navigate(page, "charts")
    page.wait_for_timeout(500)
    page.requests.clear()
    page.hold = True
    page.evaluate("() => { window.__old = syncFamily(); }")
    page.wait_for_timeout(100)
    check(f"the Charts poll asks for the 9-day range ({page.requests[:1]})", len(page.held) == 1 and bool(page.held[0]["from"]))
    page.hold = False
    page.evaluate("() => { stopTimer('feed'); }")
    page.wait_for_timeout(500)
    check("the stop is confirmed: the timer is gone", page.evaluate("S.run") is None)
    page.st["run"] = FEED_RUN  # the old reply was made while the timer ran
    release(page, 0)
    check(f"the old Charts reply does not bring the timer back ({page.evaluate('S.run')})", page.evaluate("S.run") is None)
    done(page)


def audit_day_load_before_save(browser, base):
    """Failure case: a day load that started before an edit was saved shows the old version of the entry."""
    page = open_page(browser, base)
    page.st["entries"].append(feed("feedings:d2", -2 * 1440 + 600, note="old words"))
    page.hold = True
    page.evaluate("() => { loadTimelineOneDay(-2); }")
    page.wait_for_timeout(100)
    check(f"the day load reached the server ({len(page.held)})", len(page.held) == 1)
    page.st["entries"] = [{**e, "note": "new words"} if e["id"] == "feedings:d2" else e for e in page.st["entries"]]
    page.hold = False
    saved = {**page.st, "entries": [e for e in page.st["entries"] if -1 <= e["t"] // 1440 < 1]}  # a save reply carries the default two days
    page.evaluate("state => { acceptWrite({status: 'saved', operationId: 'op-edit', state}, () => 'Saved', {}); }", saved)
    page.wait_for_timeout(200)
    release(page, 0)
    page.wait_for_timeout(500)
    note = page.evaluate("S.entries.find(e => e.id === 'feedings:d2')?.note")
    check(f"after the edit the old reply is not shown ({note!r})", note == "new words")
    reads = [request for request in page.requests if request == {
        "from": (TODAY - timedelta(days=2)).isoformat(), "to": (TODAY - timedelta(days=1)).isoformat()}]
    check(f"the day was asked for once more after the write ({len(reads)} requests)", len(reads) == 2)
    done(page)


def audit_timeout(browser, base):
    """Failure case: a request that never answers keeps the app waiting for ever. The page clock is the test's: run_for(ms) moves it that far."""
    # A state request: still waiting at 29 s, ended at 31 s with the connection text.
    page = open_page(browser, base, fake_clock=True, run=FEED_RUN)
    page.hold = True  # the server does not answer
    page.evaluate("() => { syncFamily(); }")
    page.clock.run_for(29000)
    page.wait_for_timeout(200)
    check(f"a state request is still waiting at 29 s ({page.evaluate('S.message')!r})", page.evaluate("S.message") == "")
    page.clock.run_for(2000)
    page.wait_for_timeout(300)
    check(f"and ends at 30 s with the connection text ({page.evaluate('S.message')!r})", page.evaluate("S.message") == "Check your connection and try again.")
    done(page)

    # A write that never answers, then a check of it that never answers: Save not confirmed.
    page = open_page(browser, base, fake_clock=True, run=FEED_RUN)
    page.stop_mode, page.operation_mode = "hang", "hang"
    page.evaluate("() => { stopTimer('feed'); }")
    page.wait_for_timeout(200)
    page.clock.run_for(31000)  # the write times out; the app asks the server what happened to it
    page.wait_for_timeout(300)
    page.clock.run_for(31000)  # that question times out too
    page.wait_for_timeout(300)
    shown = page.evaluate("S.message")
    check(f"a write that never answers ends in Save not confirmed ({shown!r})", shown == "Save not confirmed. Check again.")
    check("and offers Check again", page.locator("text=Check again").count() > 0)
    done(page)

    # A photo upload has 120 s: still waiting at 61 s, ended after 121 s.
    page = open_page(browser, base, fake_clock=True)
    page.route("**/api/photos", lambda r: page.hung.append(r))  # never answers
    page.evaluate("""() => {
      window.__photo = 'waiting';
      const file = new File([new Uint8Array(20)], 'a.jpg', {type: 'image/jpeg'});
      LittleDaysAPI.writes.savePhoto({type: 'note', text: 'x'}, file).then(() => { window.__photo = 'answered'; }, e => { window.__photo = e.code || e.name || 'error'; });
    }""")
    page.clock.run_for(61000)
    page.wait_for_timeout(200)
    waiting = page.evaluate("window.__photo")
    page.clock.run_for(60000)
    page.wait_for_timeout(300)
    check(f"a photo upload gets longer than a plain request: still waiting at 61 s ({waiting!r})", waiting == "waiting")
    check(f"and ends after 120 s ({page.evaluate('window.__photo')!r})", page.evaluate("window.__photo") == "timeout")
    done(page)


STALLED_BODY = """(mode) => {
  const real = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    if (!/\\/api\\/state(\\?|$)/.test(String(input?.url || input))) return real(input, init);
    // The headers are 200 and in time. The body then stalls until the request's own timeout ends it, or stops part way.
    const body = new ReadableStream({start(controller) {
      if (mode === 'cut') { controller.enqueue(new TextEncoder().encode('{"child":')); controller.error(new TypeError('network error')); return; }
      init.signal?.addEventListener('abort', () => controller.error(init.signal.reason));
    }});
    return Promise.resolve(new Response(body, {status: 200, headers: {'Content-Type': 'application/json'}}));
  };
}"""


def audit_body_failure(browser, base):
    """Failure case: a 200 reply whose body stalls past the time limit, or is cut off, reads as {} and empties the child, the entries and the permissions."""
    for mode, expected in (("stall", "Check your connection and try again."), ("cut", "Check your connection and try again.")):
        page = open_page(browser, base, fake_clock=True, run=FEED_RUN)
        before = page.evaluate("({child: S.child?.name, entries: S.entries.length, canTimers: S.permissions?.resources?.timers?.delete === true})")
        check(f"{mode}: the page starts with a child, entries and permissions ({before!r})", before["child"] == "Luna" and before["entries"] > 0 and before["canTimers"])
        page.evaluate(STALLED_BODY, mode)
        page.evaluate("() => { syncFamily(); }")
        page.clock.run_for(31000)  # a stalled body ends at the 30 s limit; a cut body ends at once
        page.wait_for_timeout(300)
        after = page.evaluate("({child: S.child?.name, entries: S.entries.length, canTimers: S.permissions?.resources?.timers?.delete === true, message: S.message})")
        check(f"{mode}: the child, entries and permissions stay ({after!r})", (after["child"], after["entries"], after["canTimers"]) == (before["child"], before["entries"], before["canTimers"]))
        check(f"{mode}: the failed-poll text shows ({after['message']!r})", after["message"] == expected and expected in page.locator("body").inner_text())
        check(f"{mode}: the page raised no error ({page.errors!r})", not page.errors)
        done(page)


def audit_poll_error_text(browser, base):
    """Failure case: a failed poll shows the browser's own error word; the text stays after the next poll works."""
    for lang, expected in (("en", "Check your connection and try again."), ("es", "Revise su conexión e inténtelo de nuevo.")):
        page = open_page(browser, base, lang=lang)
        fail = lambda r: r.abort()  # noqa: E731
        page.route(STATE, fail)
        page.evaluate("() => syncFamily()")
        page.wait_for_timeout(300)
        shown = page.evaluate("S.message")
        check(f"{lang}: a failed poll shows the translated text, not the browser error ({shown!r})", shown == expected)
        check(f"{lang}: the text is on screen", expected in page.locator("body").inner_text())
        page.unroute(STATE, fail)
        page.evaluate("() => syncFamily()")
        page.wait_for_timeout(400)
        check(f"{lang}: the next good poll clears it ({page.evaluate('S.message')!r})", page.evaluate("S.message") == "" and expected not in page.locator("body").inner_text())
        done(page)


def main():
    server, base = start_static_server()
    chosen = sys.argv[1:]
    with sync_playwright() as pw:
        browser = launch_browser(pw)
        for audit in (audit_hidden_tab, audit_visible_uses_poll_guard, audit_resume_own_save_id, audit_reply_order, audit_day_load_before_save, audit_timeout, audit_body_failure, audit_poll_error_text):
            if not chosen or audit.__name__ in chosen:
                guarded(audit, browser, base)
        browser.close()
    server.shutdown()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
