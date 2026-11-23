"""Browser features from the audit of 2026-11-12: Photos range, Timeline search, care hours, reminders, repeated reloads.

Items 13, 14, 15, 16 and 20. Invented data only; the API is mocked, so nothing here reaches a family service.
Each audit names the failure it would catch.
  python3 check_audit_ui.py        (Playwright Python, sandbox off: the page is served from a local port)
  python3 check_audit_ui.py audit_photos_range audit_search     (only the named audits)
"""
import re
import sys
from datetime import date, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

from check_support import launch_browser, start_static_server
from forms_support import save_diaper

PASS = 0
FAIL = 0
AT = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
TODAY = date(2026, 11, 10)
RESOURCES = ["feedings", "changes", "sleep", "pumping", "weight", "height", "head-circumference", "children", "timers", "notes"]
PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
STATE = re.compile(r"/api/state(\?.*)?$")


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


def day_iso(offset):
    return (TODAY + timedelta(days=offset)).isoformat()


def feed(entry_id, day, minute=600, note="", by="Sam"):
    return {"id": entry_id, "type": "feed", "side": "L", "dur": 12, "t": day * 1440 + minute, "by": by, "note": note}


def photo(entry_id, day):
    return {"id": entry_id, "type": "note", "text": f"Photo {entry_id}", "photo": PIXEL, "photoName": f"{entry_id}.png", "t": day * 1440 + 600, "by": "Sam"}


def base_state(lang="en", me="Sam"):
    resources = {name: {"view": True, "add": True, "change": True, "delete": True} for name in RESOURCES}
    people = [{"id": "adult:1", "name": "Sam", "onDuty": True}, {"id": "adult:2", "name": "Alex"}]
    return {
        "me": next(p for p in people if p["name"] == me),
        "people": people,
        "child": {"id": "child:1", "name": "Luna", "birthDate": "2026-07-01"},
        "entries": [], "run": None, "sleepRun": None, "timers": [],
        "permissions": {"canStopOtherAdultsTimers": True, "resources": resources},
        "preferences": {"units": "metric", "language": lang, "palette": "Sorbet", "night": False},
    }


def open_page(browser, base, lang="en", me="Sam", timezone="America/Mexico_City", entries=()):
    """The app on Home with a mocked API. page.requests lists each state request, page.growth_requests each growth request, page.posts each write."""
    context = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id=timezone)
    page = context.new_page()
    page.set_default_timeout(5000)
    page.clock.set_fixed_time(AT)
    page.st = {**base_state(lang, me), "entries": [dict(e) for e in entries]}
    page.requests, page.growth_requests, page.posts, page.errors = [], [], [], []
    page.on("pageerror", lambda e: page.errors.append(str(e)))

    def state_route(route):
        query = parse_qs(urlparse(route.request.url).query)
        low, high = ((date.fromisoformat(query[k][0]) - TODAY).days for k in ("from", "to")) if "from" in query else (-1, 1)
        page.requests.append({"from": query.get("from", [""])[0], "to": query.get("to", [""])[0]})
        route.fulfill(json={**page.st, "entries": [dict(e) for e in page.st["entries"] if low <= e["t"] // 1440 < high]})

    def growth_route(route):
        page.growth_requests.append(route.request.url)
        route.fulfill(json={"entries": [], "unavailable": []})

    def write_route(route):
        body = route.request.post_data_json
        page.posts.append({"path": urlparse(route.request.url).path, "body": body})
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})

    def care_route(route):
        if route.request.method == "GET":
            route.fulfill(json={"exportOptIn": False, "confirmations": [], "dutyHistory": []})
            return
        write_route(route)

    # Like the server, the session reply names the household time zone (tz); the phone's own zone does not decide.
    page.route("**/api/session", lambda r: r.fulfill(json={"me": page.st["me"], "csrf": "c", "people": ["Sam", "Alex"], "tz": "America/Mexico_City"}))
    page.route(STATE, state_route)
    page.route("**/api/growth", growth_route)
    page.route("**/api/ai/status", lambda r: r.fulfill(json={"available": False}))
    page.route("**/api/development", lambda r: r.fulfill(status=503, json={"error": "off"}))
    page.route("**/api/events", write_route)
    page.route("**/api/events/*", write_route)
    page.route("**/api/reminders", write_route)
    page.route("**/api/care", care_route)
    page.route("**/api/care/confirmations", care_route)
    page.goto(base)
    page.locator(".tile[data-act='open-feed'], .run, .dock").first.wait_for()
    page.wait_for_load_state("networkidle")
    page.requests.clear()
    return page


def settle(page):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(250)


def tab(page, name):
    page.evaluate(f"act('tab','{name}')")
    settle(page)


def from_dates(page):
    return sorted(r["from"] for r in page.requests if r["from"])


def audit_photos_range(browser, base):
    """Failure case: the Photos tab shows only photos of yesterday and today, and has no way to reach older ones."""
    page = open_page(browser, base, entries=[photo("notes:1", -20), photo("notes:2", -35)])
    tab(page, "photos")
    ranges = [(r["from"], r["to"]) for r in page.requests]
    check(f"opening Photos asks for the last 31 days in one request ({ranges})", ranges == [(day_iso(-30), day_iso(1))])
    check("a photo from 20 days ago shows", "notes:1" in page.evaluate("S.entries.map(e => e.id)") and page.locator(".pbig img").count() == 1)
    check("a photo from 35 days ago is not loaded yet", "notes:2" not in page.evaluate("S.entries.map(e => e.id)"))
    older = page.locator("[data-act='photos-older']")
    check("the Load older button uses the existing button style", older.count() == 1 and "btn" in (older.get_attribute("class") or "").split())
    page.requests.clear()
    older.click()
    settle(page)
    ranges = [(r["from"], r["to"]) for r in page.requests]
    check(f"Load older asks for the 31 days before ({ranges})", ranges == [(day_iso(-61), day_iso(-30))])
    check("the photo from 35 days ago is now loaded", "notes:2" in page.evaluate("S.entries.map(e => e.id)"))
    page.requests.clear()
    tab(page, "home")
    tab(page, "photos")
    check(f"opening Photos again does not ask again ({len(page.requests)} requests)", not [r for r in page.requests if r["from"] == day_iso(-30)])
    done(page)


def audit_photos_selection(browser, base):
    """Failure case: the large photo is the oldest one loaded, and Load older changes which photo is shown."""
    page = open_page(browser, base, entries=[photo("notes:1", -20), photo("notes:3", -5), photo("notes:2", -35)])
    big = lambda: page.locator(".pbig img").get_attribute("alt")  # noqa: E731
    tab(page, "photos")
    check(f"opening Photos shows the newest photo large ({big()!r})", big() == "Photo notes:3")
    page.locator("[data-act='photo'][data-arg='0']").click()
    page.locator("[data-act='photos-older']").click()
    settle(page)
    check(f"Load older keeps the selected photo ({big()!r} after picking the first thumbnail)", big() == "Photo notes:1")
    tab(page, "home")
    tab(page, "photos")
    check(f"opening Photos again shows the newest photo ({big()!r})", big() == "Photo notes:3")
    done(page)


def audit_photos_spanish(browser, base):
    """Failure case: the new control has English text only."""
    page = open_page(browser, base, lang="es", entries=[photo("notes:1", -20)])
    tab(page, "photos")
    text = (page.locator("[data-act='photos-older']").text_content() or "").strip()
    check(f"the Load older text is Spanish ({text!r})", text == "Cargar anteriores")
    done(page)


def open_search(page, term):
    if page.locator("[data-fid='search']").count() == 0:
        tab(page, "log")
        page.locator("[data-act='search-toggle']").click()
    page.locator("[data-fid='search']").fill(term)
    page.wait_for_timeout(150)
    return page.locator(".wrap-results [data-row]").count()


def audit_search(browser, base):
    """Failure case: Search matched the raw record (field names such as side, dur and type) and not the words the row shows."""
    page = open_page(browser, base, entries=[feed("feedings:1", 0, note="sunny window")])
    for term in ("side", "dur", "type"):
        check(f"English: the field name {term!r} finds nothing", open_search(page, term) == 0)
    check("English: a word from the row ('left') finds the row", open_search(page, "left") == 1)
    check("English: a word from the note finds the row", open_search(page, "sunny") == 1)
    done(page)
    page = open_page(browser, base, lang="es", entries=[feed("feedings:1", 0, note="sunny window")])
    check("Spanish: the row's own word ('izquierdo') finds the row", open_search(page, "izquierdo") == 1)
    check("Spanish: the English word ('left') finds nothing", open_search(page, "left") == 0)
    check("Spanish: the note still finds the row", open_search(page, "sunny") == 1)
    done(page)


def audit_care_hours(browser, base):
    """Failure case: the care form reads its times in the phone's own time zone, so a phone outside Mexico City sends other hours."""
    page = open_page(browser, base, timezone="Asia/Tokyo")
    page.evaluate("act('open-care')")
    page.locator("[data-fid='careStartDate']").wait_for()
    for key, clock in (("careStart", "10:00 AM"), ("careEnd", "2:00 PM")):
        page.locator(f"[data-fid='{key}Date']").fill("2026-11-10")
        page.locator(f"[data-fid='{key}Clock']").fill(clock)
    page.wait_for_timeout(150)
    page.locator("[data-act='care-confirm']").click()
    settle(page)
    sent = [p["body"] for p in page.posts if p["path"].endswith("/care/confirmations")]
    got = (sent[0]["start"], sent[0]["end"]) if sent else None
    check(f"10:00 AM to 2:00 PM Mexico City time is sent as 16:00Z to 20:00Z from a phone in Tokyo ({got})", got == ("2026-11-10T16:00:00.000Z", "2026-11-10T20:00:00.000Z"))
    done(page)


def audit_reminders(browser, base):
    """Failure case: the reminder form starts with a wrong person or Reminder is missing from More."""
    for me in ("Sam", "Alex"):
        page = open_page(browser, base, me=me)
        page.locator("[data-act='open-more']").click()
        page.locator("[data-sheet]").wait_for()
        check(f"{me}: the More list has the reminder row", page.locator("[data-act='open-reminder']").count() == 1)
        page.locator("[data-act='open-reminder']").click()
        got = page.evaluate("S.sheet && S.sheet.recipient")
        check(f"{me}: a new reminder starts with the signed-in adult ({got!r})", got == me)
        done(page)


def audit_timeline_reload_counts(browser, base):
    """Failure case: a save on the Timeline asks for the same day several times (each day and the day before it)."""
    page = open_page(browser, base, entries=[feed(f"feedings:{n}", -n) for n in range(1, 6)])
    tab(page, "log")
    page.locator("[data-act='earlier-day']").click()
    settle(page)
    shown = page.evaluate("tlDays()")
    page.requests.clear()
    page.evaluate("act('open-dia')")
    page.locator("[data-sheet]").wait_for()
    save_diaper(page)
    settle(page)
    dates = from_dates(page)
    counts = {d: dates.count(d) for d in dates}
    wanted = {day_iso(d): 1 for d in range(min(shown) - 1, 0)}
    check(f"after one save each Timeline day was asked for exactly once ({counts})", counts == wanted)
    done(page)


def audit_charts_growth_counts(browser, base):
    """Home loads growth history once and Charts reuses it until a growth write."""
    page = open_page(browser, base)
    count = lambda: len(page.growth_requests)  # noqa: E731
    check(f"Home asks for growth history once ({count()})", count() == 1)
    tab(page, "charts")
    check(f"the first visit to Charts reuses growth history ({count()})", count() == 1)
    tab(page, "home")
    tab(page, "charts")
    check(f"a second visit asks again for nothing ({count()})", count() == 1)
    page.st["entries"].append(feed("feedings:9", 0))
    page.evaluate("syncFamily()")
    settle(page)
    check(f"a changed poll on Charts asks again for nothing ({count()})", count() == 1)
    page.evaluate("act('open-dia')")
    page.locator("[data-sheet]").wait_for()
    save_diaper(page)
    settle(page)
    check(f"a diaper save on Charts asks again for nothing ({count()})", count() == 1)
    page.evaluate("act('open-growth')")
    page.locator("[data-sheet]").wait_for()
    page.locator("[data-fid='weight']").fill("5.2")
    page.wait_for_timeout(150)
    page.locator("[data-sheet] [data-act='save']").evaluate("el => el.click()")
    settle(page)
    check(f"a growth save on Charts asks once more ({count()})", count() == 2)
    done(page)


def audit_growth_delete_reloads(browser, base):
    """Failure case: deleting a growth record leaves the old chart on screen, because Charts no longer asks again on its own."""
    growth = {"id": "weight:1", "type": "growth", "kg": 4.2, "date": day_iso(0), "t": 600, "by": "Sam"}
    page = open_page(browser, base, entries=[growth, feed("feedings:1", 0)])
    count = lambda: len(page.growth_requests)  # noqa: E731
    tab(page, "charts")
    tab(page, "home")
    page.evaluate("removeEntry({id: 'feedings:1'}, null)")
    settle(page)
    tab(page, "charts")
    check(f"deleting a feed does not make Charts ask again ({count()})", count() == 1)
    tab(page, "home")
    page.evaluate("removeEntry({id: 'weight:1'}, null)")
    settle(page)
    tab(page, "charts")
    check(f"deleting a growth record makes the next visit to Charts ask again ({count()})", count() == 2)
    done(page)


def done(page):
    page.unroute_all(behavior="ignoreErrors")
    page.context.close()


def main():
    server, base = start_static_server()
    chosen = sys.argv[1:]
    with sync_playwright() as pw:
        browser = launch_browser(pw)
        for audit in (audit_photos_range, audit_photos_selection, audit_photos_spanish, audit_search, audit_care_hours, audit_reminders, audit_timeline_reload_counts, audit_charts_growth_counts, audit_growth_delete_reloads):
            if not chosen or audit.__name__ in chosen:
                guarded(audit, browser, base)
        browser.close()
    server.shutdown()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
