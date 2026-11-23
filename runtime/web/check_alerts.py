"""Browser checks for Group 5: Real alerts on the phone (plan 2026-11-21-alerts.md).

Invented data only; all API calls are mocked locally. Each check names the failure it catches.
"""
import re
import sys
from base64 import urlsafe_b64encode
from datetime import date, datetime, timedelta
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import sync_playwright

from check_support import launch_browser, start_static_server

PASS = 0
FAIL = 0
AT = datetime.fromisoformat("2026-11-10T10:00:00-06:00")
TODAY = date(2026, 11, 10)
RESOURCES = ["feedings", "changes", "sleep", "pumping", "medication", "weight", "height", "head-circumference", "children", "timers", "notes"]
# The push mock checks the encoded shape and byte count, without using real cryptographic keys.
VAPID_PUB = urlsafe_b64encode(bytes([4]) + bytes(range(64))).decode().rstrip('=')
PUSH_AUTH = urlsafe_b64encode(b'fake-push-auth!!').decode().rstrip('=')
STATE_RE = re.compile(r"/api/state(\?.*)?$")


def check(name, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"PASS {name}", flush=True)
    else:
        FAIL += 1
        print(f"FAIL {name}", flush=True)


def guarded(fn, *args):
    try:
        fn(*args)
    except Exception as error:  # noqa: BLE001
        check(f"{fn.__name__} ran without error ({type(error).__name__}: {str(error).splitlines()[0][:140]})", False)


def base_state(lang="en", me="Sam", resources=None, reminders=None, entries=None):
    res = resources or {name: {"view": True, "add": True, "change": True, "delete": True} for name in RESOURCES}
    people = [{"id": "adult:1", "name": "Sam", "onDuty": True}, {"id": "adult:2", "name": "Alex"}]
    return {
        "me": next(p for p in people if p["name"] == me),
        "people": people,
        "child": {"id": "child:1", "name": "Luna", "birthDate": "2026-07-01"},
        "today": TODAY.isoformat(),
        "entries": [dict(e) for e in (entries or [])],
        "reminders": [dict(r) for r in (reminders or [])],
        "run": None, "sleepRun": None, "pumpRun": None, "timers": [],
        "permissions": {"canStopOtherAdultsTimers": True, "resources": res},
        "preferences": {"units": "metric", "lang": lang, "palette": "Sorbet", "night": False},
    }


def install_push_mock(page, permission="default", existing_endpoint=None):
    page.add_init_script(f"""(() => {{
      window.__pushLog = {{ perms: 0, registered: [], subscribed: [], unsubscribed: 0 }};
      let perm = {permission!r};
      let currentSub = {('null' if not existing_endpoint else f'{{ endpoint: {existing_endpoint!r}, toJSON: () => ({{ endpoint: {existing_endpoint!r}, keys: {{ p256dh: {VAPID_PUB!r}, auth: {PUSH_AUTH!r} }} }}), unsubscribe: async () => {{ window.__pushLog.unsubscribed++; currentSub = null; return true; }} }}')};
      Object.defineProperty(window, 'Notification', {{
        configurable: true,
        value: {{
          get permission() {{ return perm; }},
          async requestPermission() {{
            window.__pushLog.perms++;
            if (window.__nextPerm) perm = window.__nextPerm;
            else if (perm === 'default') perm = 'granted';
            return perm;
          }},
        }},
      }});
      window.PushManager = function() {{}};
      const reg = {{
        pushManager: {{
          async getSubscription() {{ return currentSub; }},
          async subscribe(opts) {{
            window.__pushLog.subscribed.push({{ userVisibleOnly: opts.userVisibleOnly, keyLen: opts.applicationServerKey?.length || 0 }});
            currentSub = {{
              endpoint: 'https://web.push.apple.com/mock-device',
              toJSON: () => ({{ endpoint: 'https://web.push.apple.com/mock-device', keys: {{ p256dh: {VAPID_PUB!r}, auth: {PUSH_AUTH!r} }} }}),
              unsubscribe: async () => {{ window.__pushLog.unsubscribed++; currentSub = null; return true; }},
            }};
            return currentSub;
          }},
        }},
      }};
      Object.defineProperty(navigator, 'serviceWorker', {{
        configurable: true,
        value: {{
          ready: Promise.resolve(reg),
          async getRegistration() {{ return reg; }},
          async register(url, opts) {{ window.__pushLog.registered.push({{ url, scope: opts?.scope }}); return reg; }},
        }},
      }});
    }})();""")


def open_app(browser, base, state_data=None, push_cfg=None, permission="default", existing_endpoint=None, subscribe_status=200, logout_status=200):
    context = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Mexico_City")
    page = context.new_page()
    page.set_default_timeout(5000)
    page.clock.set_fixed_time(AT)
    install_push_mock(page, permission=permission, existing_endpoint=existing_endpoint)
    page.st = state_data or base_state()
    page.push_cfg = push_cfg or {
        "available": True, "vapidPublicKey": VAPID_PUB,
        "sessionSubscribed": bool(existing_endpoint), "thisSessionSelected": bool(existing_endpoint),
        "adultSubscribed": bool(existing_endpoint), "authError": False,
    }
    page.writes, page.errors = [], []
    page.on("pageerror", lambda e: page.errors.append(str(e)))

    page.route("**/api/session", lambda route: route.fulfill(
        status=logout_status if route.request.method == "DELETE" else 200,
        json={"error": "Offline"} if (route.request.method == "DELETE" and logout_status != 200)
        else {"authenticated": True, "me": page.st["me"], "people": ["Sam", "Alex"], "csrf": "tok", "tz": "America/Mexico_City", "labels": {}, "careLink": False, "ai": False},
    ))
    page.route("**/api/push/config", lambda route: route.fulfill(json=page.push_cfg))

    def handle_sub(route):
        body = route.request.post_data_json
        page.writes.append({"method": "POST", "path": "/api/push/subscribe", "body": body})
        if subscribe_status != 200:
            route.fulfill(status=subscribe_status, json={"error": "Subscribe failed"})
            return
        page.push_cfg.update({"sessionSubscribed": True, "thisSessionSelected": True, "adultSubscribed": True})
        route.fulfill(json=page.push_cfg)

    def handle_unsub(route):
        body = route.request.post_data_json
        page.writes.append({"method": "POST", "path": "/api/push/unsubscribe", "body": body})
        page.push_cfg.update({"sessionSubscribed": False, "thisSessionSelected": False, "adultSubscribed": False})
        route.fulfill(json=page.push_cfg)

    page.route("**/api/push/subscribe", handle_sub)
    page.route("**/api/push/unsubscribe", handle_unsub)

    def handle_state(route):
        query = parse_qs(urlparse(route.request.url).query)
        if "from" in query and "to" in query:
            lo = (date.fromisoformat(query["from"][0]) - TODAY).days
            hi = (date.fromisoformat(query["to"][0]) - TODAY).days
            ents = [dict(e) for e in page.st["entries"] if lo <= e["t"] // 1440 < hi]
            route.fulfill(json={**page.st, "entries": ents})
        else:
            route.fulfill(json=page.st)

    page.route(STATE_RE, handle_state)
    page.route("**/api/cries**", lambda route: route.fulfill(json={"cries": [], "sound": False}))
    page.route("**/api/growth", lambda route: route.fulfill(json={"entries": [], "unavailable": []}))
    page.route("**/api/ai/status", lambda route: route.fulfill(json={"available": False}))

    def handle_writes(route):
        path = unquote(urlparse(route.request.url).path)
        body = route.request.post_data_json or {}
        page.writes.append({"method": route.request.method, "path": path, "body": body})
        if path.startswith("/api/reminders/"):
            rem_id = path.split("/")[-1]
            if route.request.method == "DELETE":
                page.st["reminders"] = [r for r in page.st["reminders"] if r["id"] != rem_id]
                page.st["entries"] = [e for e in page.st["entries"] if e["id"] != rem_id]
                route.fulfill(json={"status": "saved", "id": rem_id, "state": page.st})
                return
            if route.request.method == "PATCH":
                for r in page.st["reminders"]:
                    if r["id"] == rem_id:
                        r["enabled"] = body["enabled"]
                        r["what"] = body["what"]
                        r["scheduledAt"] = body["scheduledAt"]
                route.fulfill(json={"status": "saved", "id": rem_id, "state": page.st})
                return
        if path == "/api/preferences":
            page.st["preferences"] = {k: v for k, v in body.items() if k != "operationId"}
            route.fulfill(json={"status": "saved", "id": "preferences:1", "state": page.st})
            return
        route.fulfill(json={"status": "saved", "id": "medication:42", "state": page.st})

    for pattern in ("**/api/events", "**/api/events/*", "**/api/reminders", "**/api/reminders/*", "**/api/preferences"):
        page.route(pattern, handle_writes)
    page.goto(base)
    try:
        page.locator("[data-act='open-settings']").wait_for()
    except Exception:
        print("PAGE_ERRORS:", page.errors, "HTML:", page.locator("#stage").inner_html()[:400], flush=True)
        raise
    page.wait_for_load_state("networkidle")
    return page


def audit_push_enrollment_and_states(browser, base):
    """Failure case: Turn on alerts skips SW/VAPID/POST, hides authError, leaks switches without view perm, or breaks denied/failed states."""
    # 1. Full enrollment flow + per-type switch
    page = open_app(browser, base)
    page.locator("[data-act='open-settings']").click()
    page.locator("[data-alerts-settings]").wait_for()
    page.locator("[data-act='alerts-on']").click()
    page.locator("[data-act='alerts-off']").wait_for()
    log = page.evaluate("window.__pushLog")
    check("enrollment requests Notification permission", log["perms"] == 1)
    check("enrollment registers /sw.js at scope '/'", log["registered"] == [{"url": "/sw.js", "scope": "/"}])
    check("enrollment passes 65-byte VAPID key to pushManager.subscribe", log["subscribed"][0]["keyLen"] == 65)
    check("enrollment posts subscription to /api/push/subscribe", any(w["path"] == "/api/push/subscribe" for w in page.writes))
    check("Settings shows 'Alerts are on for this phone'", "Alerts are on for this phone" in page.locator("[data-alerts-settings]").inner_text())
    check("Settings renders all 4 per-type switch rows when permitted", page.locator("[data-alerts-settings] .al-type-row").count() == 4)
    page.locator("[data-act='alerts-switch'][data-arg='nap:on']").click()
    page.wait_for_timeout(150)
    pref_write = [w for w in page.writes if w["path"] == "/api/preferences"]
    check("flipping Nap switch persists alerts.nap='on'", bool(pref_write) and pref_write[-1]["body"]["alerts"]["nap"] == "on")
    check("enrollment flow has 0 JS errors", len(page.errors) == 0)
    page.context.close()

    # 2. Permission denied + authError banner + reduced permissions + Spanish/dim
    reduced = {name: {"view": name not in ("medication", "sleep", "feedings"), "add": True, "change": True, "delete": True} for name in RESOURCES}
    st = base_state(lang="es", resources=reduced)
    st["preferences"]["night"] = True
    page = open_app(browser, base, state_data=st, permission="granted", existing_endpoint="https://web.push.apple.com/x",
                    push_cfg={"available": True, "vapidPublicKey": VAPID_PUB, "sessionSubscribed": True, "thisSessionSelected": True, "adultSubscribed": True, "authError": True})
    page.locator("[data-act='open-settings']").click()
    page.locator("[data-alerts-settings] .al-warn").wait_for()
    txt = page.locator("[data-alerts-settings]").inner_text()
    check("authError warning banner shows in Spanish", "servicio push" in txt)
    check("reduced permissions hide Medicine/Nap/Feed switches, leaving Reminder only", page.locator("[data-alerts-settings] .al-type-row").count() == 1)
    page.context.close()

    # 3. Permission denied and failed subscribe keep alerts off
    page = open_app(browser, base, permission="denied")
    page.locator("[data-act='open-settings']").click()
    page.locator("[data-alerts-settings]").wait_for()
    check("denied permission shows phone Settings warning", "phone Settings" in page.locator("[data-alerts-settings]").inner_text())
    page.context.close()

    page = open_app(browser, base, subscribe_status=500)
    page.locator("[data-act='open-settings']").click()
    page.locator("[data-act='alerts-on']").click()
    page.wait_for_timeout(200)
    check("failed subscribe keeps Turn on button and shows error", page.locator("[data-act='alerts-on']").count() == 1 and page.locator("[data-alerts-settings] .al-warn").count() == 1)
    page.context.close()


def audit_signout_offline(browser, base):
    """Failure case: offline sign-out unsubscribes browser or drops error/retry state."""
    page = open_app(browser, base, permission="granted", existing_endpoint="https://web.push.apple.com/s1", logout_status=503)
    page.locator("[data-act='open-settings']").click()
    page.locator("[data-shell='logout']").click()
    page.locator("[data-shell='retry']").wait_for()
    log = page.evaluate("window.__pushLog")
    check("offline sign-out keeps retry screen and does NOT unsubscribe browser", log["unsubscribed"] == 0)
    page.context.close()


def audit_medicine_next_dose_and_dst(browser, base):
    """Failure case: invalid next-dose hours allow save, untouched medicine drops openedAtISO, note-only edit shifts timeISO, or Timeline omits next dose."""
    med_iso = "2026-11-01T07:30:00.000Z"  # second 1:30 AM CST DST fallback
    st = base_state(entries=[{
        "id": "medication:42", "type": "med", "name": "Vitamin D", "dose": 400, "unit": "drops",
        "t": 600, "timeISO": "2026-11-10T16:00:00.000Z", "next": 6, "by": "Sam", "note": "",
    }])
    page = open_app(browser, base, state_data=st)

    # Timeline displays Next dose after 4:00 PM (10:00 AM + 6h)
    page.locator("[data-act='tab'][data-arg='log']").click()
    page.locator("[data-row='medication:42']").wait_for()
    check("Timeline shows 'Next dose after 4:00 PM'", "Next dose after 4:00 PM" in page.locator("[data-row='medication:42']").inner_text())

    # Note-only edit preserves exact timeISO and clears next hours cleanly
    page.locator("[data-row='medication:42'] .rowedit").click()
    page.locator("[data-fid='valueNext']").wait_for()
    check("Edit medicine shows guidance line", "label or from the pediatrician" in page.locator("[data-sheet]").inner_text())
    page.locator("[data-fid='valueNext']").fill("200")
    check("Invalid next-dose hours (>168) show inline error and disable Save",
          page.locator("[data-med-next-err]").is_visible() and page.locator("[data-sheet] [data-act='save']").is_disabled())
    page.locator("[data-fid='valueNext']").fill("")
    page.locator("summary").click()
    page.locator("[data-fid='editNote']").fill("with milk")
    page.locator("[data-sheet] [data-act='save']").click()
    page.wait_for_timeout(150)
    patch = [w for w in page.writes if w["method"] == "PATCH" and "medication:42" in w["path"]][-1]
    check("Note-only medicine edit preserves exact timeISO verbatim", patch["body"]["event"]["time"] == "2026-11-10T16:00:00.000Z")
    check("Clearing next hours sends next: null", patch["body"]["event"]["next"] is None)

    # New medicine with untouched clock preserves openedAtISO verbatim
    page.locator("[data-act='tab'][data-arg='home']").click()
    page.locator("[data-act='open-more']").click()
    page.locator("[data-act='open-med']").click()
    opened_iso = page.evaluate("S.sheet.openedAtISO")
    page.locator("[data-fid='name']").fill("Iron")
    page.locator("[data-fid='dose']").fill("1")
    page.locator("[data-fid='unit']").select_option("ml")
    page.locator("[data-fid='next']").fill("4")
    page.locator("[data-sheet] [data-act='save']").click()
    page.wait_for_timeout(150)
    post = [w for w in page.writes if w["method"] == "POST" and w["path"] == "/api/events"][-1]
    check("Live-logged medicine sends openedAtISO verbatim", post["body"]["event"]["time"] == opened_iso)
    check("Live-logged medicine sends numeric next=4", post["body"]["event"]["next"] == 4)
    page.context.close()


def audit_reminders_two_phones_and_swipe(browser, base):
    """Failure case: tomorrow reminder vanishes on stale refresh, Edit has 2 clocks or wrong note, or swipe-delete skips DELETE /api/reminders/:id."""
    rem_tomorrow = {
        "id": "reminder:00000000-0000-4000-8000-000000000001", "type": "reminder",
        "recipient": "Sam", "by": "Sam", "what": "feed", "scheduledAt": "2026-11-11T14:00:00.000Z",
        "day": "2026-11-11", "hour": 8, "minute": 0, "period": "AM", "t": 1440 + 480, "enabled": True, "delivery": "push",
    }
    rem_today = {
        "id": "reminder:00000000-0000-4000-8000-000000000002", "type": "reminder",
        "recipient": "Sam", "by": "Sam", "what": "medicine", "scheduledAt": "2026-11-10T15:00:00.000Z",
        "day": "2026-11-10", "hour": 9, "minute": 0, "period": "AM", "t": 540, "enabled": True, "delivery": "push",
    }
    st = base_state(reminders=[rem_tomorrow, rem_today], entries=[rem_today])

    # Phone 1 (newest selected phone)
    page = open_app(browser, base, state_data=st, permission="granted", existing_endpoint="https://web.push.apple.com/new",
                    push_cfg={"available": True, "vapidPublicKey": VAPID_PUB, "sessionSubscribed": True, "thisSessionSelected": True, "adultSubscribed": True, "authError": False})
    page.locator("[data-act='open-more']").click()
    page.locator("[data-act='open-reminder']").click()
    page.locator("[data-rem-id='reminder:00000000-0000-4000-8000-000000000001']").wait_for()
    page.locator("[data-rem-note='this-phone']").wait_for()
    check("Tomorrow reminder appears in Upcoming reminders", page.locator("[data-rem-id='reminder:00000000-0000-4000-8000-000000000001']").count() == 1)
    check("Selected phone shows 'This phone gets an alert.'", "This phone gets an alert." in page.locator("[data-rem-note]").inner_text())

    # Stale yesterday/today range refresh must NOT wipe tomorrow's reminder
    page.evaluate("loadDayRange(-1, 0, true)")
    page.wait_for_timeout(150)
    check("Tomorrow reminder survives yesterday/today range refresh", page.evaluate("S.entries.some(e => e.id === 'reminder:00000000-0000-4000-8000-000000000001')"))

    # Edit tomorrow's reminder: single clock, locked recipient, no NaN
    page.locator("[data-rem-id='reminder:00000000-0000-4000-8000-000000000001'] [data-act='edit']").click()
    page.locator("[data-fid='reminderDate']").wait_for()
    check("Edit reminder renders exactly 1 clock input", page.locator("[data-sheet] [data-clock]").count() == 1)
    check("Edit reminder date is exact YYYY-MM-DD (no NaN)", page.locator("[data-fid='reminderDate']").input_value() == "2026-11-11")
    check("Edit reminder locks recipient (no select)", page.locator("[data-fid='editRecipient']").count() == 0 and "Sam" in page.locator(".rem-recipient").inner_text())
    page.locator("[data-act='editReminder']").click()
    check("Turning reminder off updates note to off wording", "This reminder is off" in page.locator("[data-rem-note]").inner_text())
    page.locator("[data-sheet] [data-act='save']").click()
    page.wait_for_timeout(150)
    patch = [w for w in page.writes if w["method"] == "PATCH" and "000000000001" in w["path"]][-1]
    check("Saving disabled reminder sends enabled: false", patch["body"]["enabled"] is False)

    # Timeline renders today's reminder without 'undefined NaN' and swipe-delete calls DELETE /api/reminders/:id
    page.locator("[data-act='tab'][data-arg='log']").click()
    row = page.locator("[data-row='reminder:00000000-0000-4000-8000-000000000002']")
    row.wait_for()
    check("Timeline reminder row has no 'undefined' or 'NaN'", "undefined" not in row.inner_text() and "NaN" not in row.inner_text())
    page.evaluate("startSwipeDelete('reminder:00000000-0000-4000-8000-000000000002'); commitSwipeDelete();")
    page.wait_for_timeout(150)
    dels = [w for w in page.writes if w["method"] == "DELETE" and w["path"].endswith("reminder:00000000-0000-4000-8000-000000000002")]
    check("Timeline swipe-delete calls DELETE /api/reminders/:id", len(dels) == 1)
    page.context.close()

    # Phone 2 (older phone of same adult) sees newest-phone note
    page = open_app(browser, base, state_data=base_state(reminders=[rem_tomorrow]), permission="granted", existing_endpoint="https://web.push.apple.com/old",
                    push_cfg={"available": True, "vapidPublicKey": VAPID_PUB, "sessionSubscribed": True, "thisSessionSelected": False, "adultSubscribed": True, "authError": False})
    page.locator("[data-act='open-more']").click()
    page.locator("[data-act='open-reminder']").click()
    page.locator("[data-rem-note='other-phone']").wait_for()
    check("Older phone shows newest-phone note", "newest signed-in phone" in page.locator("[data-rem-note]").inner_text())
    page.context.close()


def audit_sw_wait_until(browser, base):
    """Failure case: sw.js misses event.waitUntil(), adds a fetch listener, or fails to open '/' on notificationclick."""
    context = browser.new_context()
    page = context.new_page()
    res = page.goto(f"{base}/sw.js")
    src = res.text()
    out = page.evaluate("""async (code) => {
      const listeners = {};
      const shown = [];
      const opened = [];
      const selfObj = {
        location: { origin: 'https://example.test' },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        registration: { async showNotification(title, opts) { shown.push({ title, opts }); } },
        clients: {
          async matchAll() { return []; },
          async openWindow(url) { opened.push(url); return { url }; },
        },
      };
      new Function('self', code)(selfObj);
      let pushWait = null;
      listeners.push[0]({
        data: { async json() { return { title: 'Little Days', body: 'Medicine dose is due', tag: 'medication:42' }; } },
        waitUntil(p) { pushWait = p; },
      });
      await pushWait;
      let clickWait = null;
      let closed = false;
      listeners.notificationclick[0]({
        notification: { close() { closed = true; }, data: { url: '/' } },
        waitUntil(p) { clickWait = p; },
      });
      await clickWait;
      return { types: Object.keys(listeners).sort(), shown, opened, closed, pushWaitIsPromise: pushWait instanceof Promise, clickWaitIsPromise: clickWait instanceof Promise };
    }""", src)
    check("sw.js registers ONLY push and notificationclick (no fetch listener)", out["types"] == ["notificationclick", "push"])
    check("sw.js passes full promises to event.waitUntil()", out["pushWaitIsPromise"] and out["clickWaitIsPromise"])
    check("sw.js shows notification with D5 title/body/tag", out["shown"][0]["title"] == "Little Days" and out["shown"][0]["opts"]["tag"] == "medication:42")
    check("sw.js closes notification and opens '/' when no window is open", out["closed"] and out["opened"] == ["/"])
    context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as p:
            browser = launch_browser(p)
            for fn in (
                audit_push_enrollment_and_states,
                audit_signout_offline,
                audit_medicine_next_dose_and_dst,
                audit_reminders_two_phones_and_swipe,
                audit_sw_wait_until,
            ):
                guarded(fn, browser, base)
            browser.close()
    finally:
        server.shutdown()
    print(f"Summary: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
