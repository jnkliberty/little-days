"""Swipe a Timeline row to delete it (owner request, 2026-11-11): one Delete button behind the row, an Undo toast, and the same delete request as the edit form.

Each audit names the failure it would catch. Invented records only (Luna, Sam, Alex).
  python3 check_swipe_delete.py        (Playwright Python, sandbox off)
  LITTLE_DAYS_BROWSER=webkit LITTLE_DAYS_DEVICE="iPhone 13" python3 check_swipe_delete.py     (the same run in WebKit)
"""
import os
import re
import sys
import time
from datetime import date, datetime
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import sync_playwright

from check_support import browser_engine, launch_browser, open_app, start_static_server
from check_ui import navigate

PASS = 0
FAIL = 0
AT = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
TODAY = date(2026, 11, 10)
SHOTS = os.environ.get("SWIPE_SHOTS", "")
ENGINE = browser_engine()
DEVICE = os.environ.get("LITTLE_DAYS_DEVICE", "")
UNDO_MS = 6000
RUN = {"id": "r1", "side": "L", "t0": 700, "startedAt": "2026-11-10T11:30:00-06:00", "by": "Sam"}
PROFILE = {}  # WebKit run: the iPhone 13 user agent and pixel ratio
DOT = "data:image/gif;base64,R0lGODlhAQABAAAAACw="
ROW = '.day[data-day="0"] [data-row="{}"]'


def entries():
    return [
        {"id": "feedings:11", "type": "bottle", "ml": 120, "milk": "formula", "dur": 10, "t": 520, "by": "Sam"},  # 8:40 AM
        {"id": "feedings:12", "type": "feed", "side": "R", "dur": 15, "t": 600, "by": "Alex"},
        {"id": "changes:13", "type": "diaper", "kind": "W", "t": 640, "by": "Sam"},
        {"id": "sleep:14", "type": "sleep", "nap": True, "dur": 60, "t": 300, "by": "Alex"},
        {"id": "notes:15", "type": "note", "text": "Smiled at the lamp.", "photo": DOT, "t": 420, "by": "Sam"},
        {"id": "changes:16", "type": "diaper", "kind": "D", "t": 660, "by": "Alex"},
    ]


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


class Touchy:
    """A browser whose contexts have touch, like a phone (and, in WebKit, the iPhone 13 profile)."""

    def __init__(self, browser, **kw):
        self.browser, self.kw = browser, kw

    def new_context(self, **k):
        return self.browser.new_context(**{**self.kw, **k})


def swipe_page(browser, base, lang="en", width=390, height=844, night=False, run=None, rows=None, **context):
    profile = {"has_touch": True, "is_mobile": True, **PROFILE, **context}
    page = open_app(Touchy(browser, **profile), base, width, height, AT, lang=lang, theme="on" if night else "off")
    page.set_default_timeout(5000)
    page.st["me"] = {"id": "adult:1", "name": "Sam"}
    page.st["people"] = [{"id": "adult:1", "name": "Sam", "onDuty": True}, {"id": "adult:2", "name": "Alex"}]
    page.st["child"]["name"] = "Luna"
    page.st["entries"] = rows if rows is not None else entries()
    page.st["run"] = run
    page.requests, page.deletes, page.delete_mode, page.held = [], [], "ok", []

    def ranged(route):
        page.requests.append(route.request.url)
        query = parse_qs(urlparse(route.request.url).query)
        low, high = ((date.fromisoformat(query[k][0]) - TODAY).days for k in ("from", "to")) if "from" in query else (-1, 1)
        route.fulfill(json={**page.st, "entries": [e for e in page.st["entries"] if low <= e["t"] // 1440 < high]})

    def events(route):
        request = route.request
        if request.method != "DELETE":
            route.fallback()
            return
        body, path = request.post_data_json, urlparse(request.url).path
        page.deletes.append({"method": request.method, "path": path, "keys": sorted(body), "at": time.monotonic()})
        if page.delete_mode == "fail":
            route.fulfill(status=403, json={"error": "This account may not delete records."})
            return
        if page.delete_mode == "conflict":
            route.fulfill(status=409, json={"error": "This record changed. Reload and try again."})
            return

        def answer():
            page.st["entries"] = [e for e in page.st["entries"] if e["id"] != unquote(path.rsplit("/", 1)[1])]
            route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})

        if page.delete_mode == "hold":  # the reply is kept until the test calls page.held.pop()(): a delete still in flight
            page.held.append(answer)
            return
        answer()

    page.route(re.compile(r"/api/state(\?.*)?$"), ranged)
    page.route(re.compile(r"/api/events/[^/]+$"), events)
    page.reload()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    navigate(page, "log")
    page.locator(ROW.format("feedings:11")).wait_for()
    page.evaluate("document.querySelector('[data-scroll]').scrollTop = 0")  # opening the Timeline from Home keeps Home's scroll
    page.wait_for_timeout(100)
    return page


def drag(page, selector, dx, dy=0, from_x=0.55, steps=8):
    """A finger drag over the row: real touch events through the browser in Chromium; in WebKit (no touch injection) pointer events, with a scroll for a vertical drag."""
    box = page.locator(selector).bounding_box()
    x, y = box["x"] + box["width"] * from_x, box["y"] + box["height"] / 2
    if ENGINE == "chromium":
        cdp = getattr(page, "_cdp", None) or setattr(page, "_cdp", page.context.new_cdp_session(page)) or page._cdp
        send = lambda kind, points: cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})  # noqa: E731
        send("touchStart", [{"x": x, "y": y}])
        for i in range(1, steps + 1):
            send("touchMove", [{"x": x + dx * i / steps, "y": y + dy * i / steps}])
        send("touchEnd", [])
    else:
        page.evaluate("""([x, y, dx, dy, steps]) => {
          const el = document.elementFromPoint(x, y);
          const fire = (type, px, py) => el.dispatchEvent(new PointerEvent(type, {bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: px, clientY: py}));
          fire('pointerdown', x, y);
          if (Math.abs(dy) > Math.abs(dx)) {  // a vertical drag: the browser takes it for a scroll and cancels the pointer
            fire('pointercancel', x, y);
            document.querySelector('[data-scroll]').scrollBy(0, -dy);
            return;
          }
          for (let i = 1; i <= steps; i++) fire('pointermove', x + dx * i / steps, y + dy * i / steps);
          fire('pointerup', x + dx, y + dy);
        }""", [x, y, dx, dy, steps])
    page.wait_for_timeout(300)


def swipe_left(page, row_id, dx=-120):
    drag(page, ROW.format(row_id), dx)


def tap(page, selector, from_x=0.5):
    box = page.locator(selector).bounding_box()
    page.touchscreen.tap(box["x"] + box["width"] * from_x, box["y"] + box["height"] / 2)
    page.wait_for_timeout(250)


def open_rows(page):
    return page.evaluate("[...document.querySelectorAll('.swipe.open')].map(r => r.dataset.row)")


def row_count(page):
    return page.locator('.day[data-day="0"] [data-row]').count()


def totals(page):
    return page.evaluate("[...document.querySelectorAll('.day[data-day=\"0\"] [data-day-totals] .total')].map(t => t.textContent.replace(/\\u00a0/g, ' ').trim())")


def delete_button(page, row_id):
    return page.locator(ROW.format(row_id) + " .swipe-del")


def toast_text(page):
    return page.evaluate("document.querySelector('.toast')?.textContent.replace(/\\s+/g, ' ').trim() || ''")


def settle(page, count, limit=3.0):
    """Wait (at most `limit` s) until `count` delete requests have arrived; a slow machine must not fail a check."""
    end = time.monotonic() + limit
    while len(page.deletes) < count and time.monotonic() < end:
        page.wait_for_timeout(50)
    page.wait_for_timeout(150)


def shot(page, name):
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"))


def edit_form_delete(browser, base, row_id):
    """What the edit form's Delete sends for this record (the reference the swipe must match)."""
    page = swipe_page(browser, base)
    tap(page, ROW.format(row_id))
    page.locator('[data-act="delete-entry"]').wait_for()
    page.once("dialog", lambda dialog: dialog.accept())
    page.locator('[data-act="delete-entry"]').tap()
    page.wait_for_function("!S.busy && !S.sheet")
    sent = list(page.deletes)
    page.context.close()
    return sent


def audit_open_and_long_swipe(browser, base):
    """Failure case: a left swipe does not open the row, shows no Delete (word and glyph), opens two rows, or a long swipe deletes by itself."""
    page = swipe_page(browser, base)
    check("a closed row has no visible Delete: every button is hidden, so none shows in the list's side gutter", page.evaluate("() => { const all = [...document.querySelectorAll('.swipe-del')]; return all.length >= 6 && all.every(b => getComputedStyle(b).visibility === 'hidden'); }"))
    swipe_left(page, "feedings:11")
    check(f"a left swipe of 120 px opens exactly that row: {open_rows(page)}", open_rows(page) == ["feedings:11"])
    shape = page.evaluate("""(sel) => {
      const row = document.querySelector(sel), b = row.querySelector('.swipe-del'), r = b.getBoundingClientRect(), li = row.getBoundingClientRect(), list = row.closest('.list').getBoundingClientRect();
      return {w: r.width, h: r.height, rowH: li.height, inside: r.right <= list.right + 0.5 && r.right <= innerWidth && r.left >= 0, hit: b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
              text: b.textContent.trim(), glyph: !!b.querySelector('svg'), name: b.getAttribute('aria-label'), x: new DOMMatrix(getComputedStyle(row).transform).m41};
    }""", ROW.format("feedings:11"))
    check(f"the revealed Delete is 72 px or wider, as tall as the row, on screen and tappable: {shape}", shape["w"] >= 72 and abs(shape["h"] - shape["rowH"]) <= 2 and shape["inside"] and shape["hit"])
    check(f"the revealed Delete has the trash glyph and the word: {shape['text']!r}", shape["glyph"] and shape["text"] == "Delete")
    check(f"its accessible name names the record: {shape['name']!r}", shape["name"] == "Delete Bottle · 120 ml, 8:40 AM")
    check("it is a real button in the accessibility tree while open", page.get_by_role("button", name=re.compile("^Delete Bottle")).count() == 1)
    swipe_left(page, "sleep:14")
    check(f"a sleep row's name keeps a space where its time wraps: {delete_button(page, 'sleep:14').get_attribute('aria-label')!r}", delete_button(page, "sleep:14").get_attribute("aria-label") == "Delete Nap, 5:00 AM to 6:00 AM")
    swipe_left(page, "feedings:12", -400)
    check(f"a very long swipe opens its row and stops at the button width, never past it: {open_rows(page)}", open_rows(page) == ["feedings:12"] and abs(page.evaluate("new DOMMatrix(getComputedStyle(document.querySelector('[data-row=\"feedings:12\"]')).transform).m41") + shape["w"]) <= 1)
    page.wait_for_timeout(500)
    check(f"a long swipe alone sends nothing and removes no record (requests {len(page.deletes)}, rows {row_count(page)})", not page.deletes and row_count(page) == 6)
    check("a second row opening closes the first (one open row at a time)", open_rows(page) == ["feedings:12"] and not page.evaluate("document.querySelector('[data-row=\"feedings:11\"]').classList.contains('open')"))
    page.context.close()


def audit_toast_entrance(browser, base):
    """Failure cases: lost centering, replay or changed Undo deadline on redraw, or an unavailable Undo during entrance."""
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:11")
    box = page.locator(ROW.format("feedings:11") + " .swipe-del").bounding_box()
    page.touchscreen.tap(box['x'] + box['width']/2, box['y'] + box['height']/2)
    moving = "document.querySelector('.toast').getAnimations().filter(a=>a.id==='ui-enter')"
    check("a new Undo notice has one 140ms entrance", page.evaluate(moving + ".length===1 && " + moving + "[0].effect.getTiming().duration===140"))
    check("the Undo notice stays horizontally centered during entrance", page.locator('.toast').evaluate('e=>Math.abs(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2-innerWidth/2)<1'))
    deadline = page.evaluate('S.toast.until')
    page.evaluate('render()')
    check("redrawing the same notice keeps its deadline without replay", page.evaluate(moving + '.length') == 0 and page.evaluate('S.toast.until') == deadline and page.evaluate('S.toast.total') == UNDO_MS)
    page.locator('.toast [data-act=swipe-undo]').evaluate('e=>e.click()')
    check("Undo remains available immediately and sends no delete", page.locator('.toast').count() == 0 and page.locator(ROW.format('feedings:11')).count() == 1 and not page.deletes)
    swipe_left(page, "feedings:11")
    box = page.locator(ROW.format("feedings:11") + " .swipe-del").bounding_box()
    page.touchscreen.tap(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.locator('.toast [data-act=swipe-undo]').evaluate('e=>e.click()')
    check("Undo works before the entrance can finish", page.locator('.toast').count() == 0 and page.locator(ROW.format('feedings:11')).count() == 1 and not page.deletes)
    page.emulate_media(reduced_motion='reduce')
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    check("reduced motion keeps a new Undo notice still", page.locator('.toast').count() == 1 and page.evaluate(moving + '.length') == 0)
    page.locator('.toast [data-act=swipe-undo]').evaluate('e=>e.click()')
    page.context.close()


def audit_delete_and_undo(browser, base):
    """Failure case: Delete leaves the row, the day totals or the toast; Undo does not bring the row and totals back; or something was deleted on the server anyway."""
    page = swipe_page(browser, base)
    before = totals(page)
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    check(f"tap Delete takes the row out at once (rows {row_count(page)})", row_count(page) == 5 and page.locator(ROW.format("feedings:11")).count() == 0)
    after = totals(page)
    check(f"the day totals changed with it: {before} -> {after}", after != before)
    text = toast_text(page)
    check(f"a toast says Deleted and offers Undo: {text!r}", text.startswith("Deleted") and page.locator('.toast [data-act="swipe-undo"]').count() == 1)
    check("the toast is a status message and the dialog never opened", page.locator('.toast[role="status"]').count() == 1 and page.locator("dialog, [data-sheet]").count() == 0)
    shot(page, "toast")
    page.wait_for_timeout(2000)
    check("no request has gone out while the Undo toast is up", not page.deletes)
    page.locator('.toast [data-act="swipe-undo"]').tap()
    page.wait_for_timeout(300)
    check(f"Undo brings the row back in its place (rows {row_count(page)})", row_count(page) == 6 and page.locator(ROW.format("feedings:11")).count() == 1)
    check(f"and the totals come back: {totals(page)}", totals(page) == before)
    check("the toast is gone after Undo", page.locator(".toast").count() == 0)
    page.locator('.screen-top [data-arg="home"]').tap()
    latest, today = page.locator(".row.t-dia").text_content(), page.locator(".total.t-dia dd").text_content()
    page.locator('.wrap [data-act=tab][data-arg="log"]').first.tap()
    page.locator(ROW.format("changes:16")).wait_for()
    swipe_left(page, "changes:16")
    tap(page, ROW.format("changes:16") + " .swipe-del")
    page.locator('.toast [data-act="swipe-undo"]').tap()
    page.locator('.screen-top [data-arg="home"]').tap()
    check(f"after Delete and Undo, Home Latest and Today read as before: {latest!r} {today!r}", page.locator(".row.t-dia").text_content() == latest and page.locator(".total.t-dia dd").text_content() == today and not page.deletes)
    page.locator('.wrap [data-act=tab][data-arg="log"]').first.tap()
    page.locator(ROW.format("changes:16")).wait_for()
    page.wait_for_timeout(UNDO_MS + 1200)
    check(f"nothing was deleted on the server: {len(page.deletes)} requests, record still there", not page.deletes and any(e["id"] == "feedings:11" for e in page.st["entries"]))
    page.context.close()


def audit_single_request_matches_edit_form(browser, base):
    """Failure case: no request, two requests, or a request unlike the edit form's (another method, resource, id or body)."""
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:11")
    started = time.monotonic()
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    page.wait_for_timeout(3500)
    check("the request waits for the Undo toast (none after 3.5 s)", not page.deletes)
    deadline = time.monotonic() + 5
    while not page.deletes and time.monotonic() < deadline:
        page.wait_for_timeout(100)
    waited = page.deletes[0]["at"] - started if page.deletes else 99
    check(f"it goes out when the toast ends, about 6 s after the tap: {waited:.1f} s", 5.5 <= waited <= 7.5)
    page.wait_for_timeout(2500)
    check(f"exactly one delete request in all: {len(page.deletes)}", len(page.deletes) == 1)
    reference = edit_form_delete(browser, base, "feedings:11")
    check(f"same method, resource and id as the edit form's Delete: {page.deletes[0]['method']} {page.deletes[0]['path']}", len(reference) == 1 and all(page.deletes[0][k] == reference[0][k] for k in ("method", "path", "keys")))
    check("the row stays out of the list after the server answered", page.locator(ROW.format("feedings:11")).count() == 0 and row_count(page) == 5)
    page.context.close()


def audit_same_request_for_every_kind(browser, base):
    """Failure case: a photo note, a diaper or a sleep sends a different delete from the edit form's (a swipe path of its own)."""
    for row_id in ("notes:15", "changes:13", "sleep:14"):
        page = swipe_page(browser, base)
        swipe_left(page, row_id)
        tap(page, ROW.format(row_id) + " .swipe-del")
        page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        deadline = time.monotonic() + 3
        while not page.deletes and time.monotonic() < deadline:
            page.wait_for_timeout(100)
        reference = edit_form_delete(browser, base, row_id)
        check(f"{row_id}: the swipe delete equals the edit form's ({page.deletes[:1] and page.deletes[0]['path']})", len(page.deletes) == 1 and len(reference) == 1 and all(page.deletes[0][k] == reference[0][k] for k in ("method", "path", "keys")))
        page.context.close()


def audit_send_at_once(browser, base):
    """Failure case: a delete waiting for Undo is lost or delayed when the person leaves the Timeline, hides the app, reloads, opens a form, or deletes a second row."""
    page = swipe_page(browser, base)
    page.locator('.screen-top [data-arg="home"]').tap()
    latest, today = page.locator(".row.t-dia").text_content(), page.locator(".total.t-dia dd").text_content()
    page.locator('.wrap [data-act=tab][data-arg="log"]').first.tap()
    page.locator(ROW.format("changes:16")).wait_for()
    swipe_left(page, "changes:16")
    tap(page, ROW.format("changes:16") + " .swipe-del")
    page.locator('.screen-top [data-arg="home"]').tap()
    settle(page, 1)
    check(f"leaving the Timeline sends the delete at once: {len(page.deletes)}", len(page.deletes) == 1)
    check(f"Home Latest and Today follow the delete: {latest!r} -> {page.locator('.row.t-dia').text_content()!r}; {today!r} -> {page.locator('.total.t-dia dd').text_content()!r}",
          page.locator(".row.t-dia").text_content() != latest and page.locator(".total.t-dia dd").text_content() != today)
    page.wait_for_timeout(UNDO_MS + 800)
    check(f"and it is not sent a second time when the old timer ends: {len(page.deletes)}", len(page.deletes) == 1)
    page.context.close()
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    tap(page, ROW.format("feedings:12"))
    settle(page, 1)
    check(f"opening another record's form dismisses the toast and sends the delete at once: {len(page.deletes)}", len(page.deletes) == 1 and page.evaluate("S.sheet && S.sheet.id === 'feedings:12'"))
    page.context.close()
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    page.evaluate("Object.defineProperty(document, 'hidden', {value: true, configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
    settle(page, 1)
    check(f"hiding the app (phone app switch) sends the delete at once: {len(page.deletes)}", len(page.deletes) == 1)
    page.context.close()
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    swipe_left(page, "feedings:12")
    tap(page, ROW.format("feedings:12") + " .swipe-del")
    settle(page, 1)
    first = [d["path"] for d in page.deletes]
    check(f"a second Delete sends the first at once, and the second waits for its own toast: {first}", len(first) == 1 and first[0].endswith("feedings%3A11"))
    page.wait_for_timeout(UNDO_MS + 800)
    check(f"each record is deleted exactly once: {[d['path'][-14:] for d in page.deletes]}", sorted(d["path"][-13:] for d in page.deletes) == ["feedings%3A11", "feedings%3A12"])
    page.context.close()
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    settle(page, 1)
    check(f"pagehide (a reload) sends the delete at once: {len(page.deletes)}", len(page.deletes) == 1)
    page.context.close()


def audit_failed_delete_returns_row(browser, base):
    """Failure case: the server refuses the delete and the row is gone from the screen with no word about it (a silent loss)."""
    page = swipe_page(browser, base)
    page.delete_mode = "fail"
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    settle(page, 1)
    page.wait_for_timeout(500)
    check(f"a refused delete puts the row back and says so: rows {row_count(page)}", row_count(page) == 6 and page.locator('[role="alert"], .save-error').count() >= 1)
    page.context.close()


def audit_second_undo_while_first_in_flight(browser, base):
    """Failure case: delete row A, then row B within 6 s while A's request is still in flight (the app is busy): B's Undo does nothing, so B is deleted anyway."""
    page = swipe_page(browser, base)
    page.delete_mode = "hold"
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    swipe_left(page, "feedings:12")
    tap(page, ROW.format("feedings:12") + " .swipe-del")
    settle(page, 1)
    check(f"the first delete is in flight and the app is busy: {len(page.deletes)} request, busy {page.evaluate('S.busy')}", len(page.deletes) == 1 and page.evaluate("S.busy") is True)
    page.locator('.toast [data-act="swipe-undo"]').tap()
    page.wait_for_timeout(300)
    check(f"Undo of the second delete works while the first is in flight (row back: {page.locator(ROW.format('feedings:12')).count()})", page.locator(ROW.format("feedings:12")).count() == 1)
    page.held.pop()()
    page.wait_for_function("!S.busy")
    page.wait_for_timeout(UNDO_MS + 800)
    check(f"only the first record was deleted: {[d['path'][-13:] for d in page.deletes]}", [d["path"][-13:] for d in page.deletes] == ["feedings%3A11"])
    page.context.close()


def audit_midnight_sleep_twin_rows(browser, base):
    """Failure case: a sleep that crosses midnight is listed under both days; a swipe opens one row only (or a close misses one), so the other row's Delete stays exposed or open."""
    rows = entries() + [{"id": "sleep:20", "type": "sleep", "nap": False, "dur": 120, "t": -60, "by": "Sam"}]  # 11:00 PM to 1:00 AM
    page = swipe_page(browser, base, rows=rows)
    twin = '.swipe[data-row="sleep:20"]'
    check(f"the sleep is listed under both days: {page.locator(twin).count()} rows", page.locator(twin).count() == 2)
    page.locator(ROW.format("sleep:20")).scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    swipe_left(page, "sleep:20")
    check(f"a swipe opens both rows of that sleep: {open_rows(page)}", open_rows(page) == ["sleep:20", "sleep:20"])
    check("and both Delete buttons are exposed", page.locator(twin + " .swipe-del[aria-hidden]").count() == 0)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check(f"closing shuts both rows: {open_rows(page)}", open_rows(page) == [] and page.locator(twin + " .swipe-del[aria-hidden]").count() == 2)
    page.context.close()


def audit_conflict_returns_row(browser, base):
    """Failure case: the server answers a delayed swipe delete with 409 (the record changed): the row stays hidden until reload and Save is switched off in forms."""
    page = swipe_page(browser, base)
    page.delete_mode = "conflict"
    swipe_left(page, "feedings:11")
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    settle(page, 1)
    page.wait_for_timeout(500)
    check(f"after a 409 the row is back from the server's state: rows {row_count(page)}", row_count(page) == 6 and page.locator(ROW.format("feedings:11")).count() == 1)
    check("and no hidden record is left behind", page.evaluate("!S.swipeHidden?.size && !S.swipeDel"))
    check(f"and no sheet operation is marked pending (Save stays on in forms): {page.evaluate('S.pendingSheetOperation')}", not page.evaluate("S.pendingSheetOperation"))
    page.context.close()


def audit_gestures(browser, base):
    """Failure case: a scroll opens a row, a tap does the wrong thing on a closed or an open row, or a swipe also taps the row."""
    rows = entries() + [{"id": f"feedings:{30 + i}", "type": "feed", "side": "L", "dur": 5, "t": 20 + i * 3, "by": "Sam"} for i in range(12)]
    page = swipe_page(browser, base, rows=rows)
    scroll_before = page.evaluate("document.querySelector('[data-scroll]').scrollTop")
    drag(page, ROW.format("feedings:12"), 0, -250, steps=10)
    moved = page.evaluate("document.querySelector('[data-scroll]').scrollTop")
    check(f"a vertical drag scrolls the list and opens nothing: scrollTop {scroll_before} -> {moved}, open {open_rows(page)}", moved > scroll_before and not open_rows(page) and not page.deletes)
    page.evaluate("document.querySelector('[data-scroll]').scrollTop = 0")
    page.wait_for_timeout(200)
    check("the row follows a horizontal finger and the page does not scroll sideways", page.evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('[data-scroll]').scrollWidth <= document.querySelector('[data-scroll]').clientWidth"))
    tap(page, ROW.format("feedings:12"), 0.4)
    check("a tap on a closed row opens its edit form", page.evaluate("!!S.sheet && S.sheet.kind === 'edit' && S.sheet.id === 'feedings:12'") and page.get_by_role("dialog").is_visible())
    page.locator('[data-act="cancel"]').first.tap()
    page.wait_for_timeout(300)
    swipe_left(page, "feedings:12")
    tap(page, ROW.format("feedings:12"), 0.3)
    check(f"a tap on an open row closes it and opens no edit form: open {open_rows(page)}, sheet {page.evaluate('!!S.sheet')}", not open_rows(page) and not page.evaluate("!!S.sheet"))
    swipe_left(page, "feedings:12")
    swipe_left(page, "feedings:12", 120)
    check(f"a right swipe closes an open row: {open_rows(page)}", not open_rows(page))
    swipe_left(page, "feedings:12")
    page.touchscreen.tap(195, 40)
    page.wait_for_timeout(250)
    check(f"a tap anywhere else closes it: {open_rows(page)}", not open_rows(page))
    swipe_left(page, "feedings:12")
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    check(f"Escape closes an open row: {open_rows(page)}", not open_rows(page))
    check("and its Delete is hidden again once the row has settled", page.evaluate("[...document.querySelectorAll('.swipe-del')].every(b => getComputedStyle(b).visibility === 'hidden')"))
    check("a closed row's Delete is out of the keyboard order and the accessibility tree", page.get_by_role("button", name=re.compile("^Delete ")).count() == 0 and page.evaluate("document.querySelector('.swipe-del').tabIndex") == -1)
    swipe_left(page, "feedings:12")
    drag(page, ROW.format("feedings:11"), 0, -200, steps=10)
    page.wait_for_timeout(300)
    check(f"a scroll closes an open row: {open_rows(page)}", not open_rows(page))
    page.context.close()
    page = swipe_page(browser, base)
    box = page.locator(ROW.format("feedings:11")).bounding_box()
    page.mouse.move(box["x"] + 220, box["y"] + 32)
    page.mouse.down()
    for i in range(1, 9):
        page.mouse.move(box["x"] + 220 - 14 * i, box["y"] + 32)
    page.mouse.up()
    page.wait_for_timeout(300)
    check(f"a mouse drag opens the row and its release does not also tap it: open {open_rows(page)}, sheet {page.evaluate('!!S.sheet')}", open_rows(page) == ["feedings:11"] and not page.evaluate("!!S.sheet"))
    page.context.close()


def audit_chips_search_earlier(browser, base):
    """Failure case: the chips, the search field or "Show the day before" stop working with a row open, or a chip tap leaves the row open."""
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:11")
    tap(page, '[data-act="filter"][data-arg="sleep"]')
    shown = page.evaluate("[...document.querySelectorAll('.day[data-day=\"0\"] [data-row]')].map(r => r.dataset.row)")
    check(f"a chip still filters, and the tap closes the open row: {shown}, open {open_rows(page)}", shown == ["sleep:14"] and not open_rows(page))
    tap(page, '[data-act="filter"][data-arg="all"]')
    page.locator('[data-act="earlier-day"]').tap()
    page.wait_for_timeout(600)
    check("Show the day before still adds a day", page.locator(".day").count() >= 3)
    page.locator('[data-act="search-toggle"]').tap()
    page.locator('[data-fid="search"]').fill("Sam")
    page.wait_for_timeout(300)
    check(f"search still lists matches: {page.locator('[data-row]').count()}", page.locator("[data-row]").count() >= 3)
    swipe_left(page, "feedings:11")
    check("a row in the search results swipes open too", open_rows(page) == ["feedings:11"])
    page.context.close()


def audit_rows_that_do_not_open(browser, base):
    """Failure case: a row the person may not delete, a running timer's row, or a record with a save in flight opens its Delete."""
    page = swipe_page(browser, base, run=RUN)
    page.evaluate("S.permissions.resources.changes.delete = false; render()")
    page.wait_for_timeout(200)
    swipe_left(page, "changes:13")
    check(f"a record the account may not delete does not swipe open (and has no Delete): {open_rows(page)}", not open_rows(page) and delete_button(page, "changes:13").count() == 0)
    swipe_left(page, "feedings:11")
    check("a record it may delete still opens", open_rows(page) == ["feedings:11"])
    box = page.locator('.day[data-day="0"] .row:not([data-row])').first.bounding_box()
    check("the timeline shows a running timer's row", box is not None)
    page.touchscreen.tap(5, 5)
    page.wait_for_timeout(200)
    drag(page, '.day[data-day="0"] .row:not([data-row])', -120)
    check(f"a running timer's row does not open: {open_rows(page)}", not open_rows(page) and page.locator('.day[data-day="0"] .row:not([data-row]) .swipe-del').count() == 0)
    page.evaluate("S.pendingOps = {'op-1': {context: {sheet: {id: 'feedings:12'}}}}; render()")
    page.wait_for_timeout(200)
    swipe_left(page, "feedings:12")
    check(f"a record with a save in flight does not open: {open_rows(page)}", not open_rows(page))
    page.context.close()


def audit_spanish_and_motion(browser, base):
    """Failure case: the Spanish screen shows an English word, motion runs under reduced-motion, or the row does not settle in 150 to 200 ms."""
    page = swipe_page(browser, base, lang="es")
    swipe_left(page, "feedings:11")
    button = delete_button(page, "feedings:11")
    check(f"Spanish: the revealed button says Eliminar and its name names the record: {button.text_content().strip()!r} {button.get_attribute('aria-label')!r}", button.text_content().strip() == "Eliminar" and button.get_attribute("aria-label").startswith("Eliminar Biberón"))
    tap(page, ROW.format("feedings:11") + " .swipe-del")
    text = toast_text(page)
    check(f"Spanish: the toast says Eliminado and Deshacer: {text!r}", text.startswith("Eliminado") and "Deshacer" in text)
    page.context.close()
    page = swipe_page(browser, base)
    swipe_left(page, "feedings:12")
    transition = page.evaluate("document.querySelector('[data-row=\"feedings:12\"]').style.transition")
    duration = page.evaluate("getComputedStyle(document.querySelector('[data-row=\"feedings:12\"]')).transitionDuration")
    check(f"the row settles in 150 to 200 ms with the move curve: {transition!r} {duration}", re.search(r"\b(1[5-9]\d)ms\b", transition) is not None and "cubic-bezier(0.77, 0, 0.175, 1)" in transition and duration in ("0.18s", "0.17s", "0.19s", "0.2s", "0.15s", "0.16s"))
    page.context.close()
    page = swipe_page(browser, base, reduced_motion="reduce")
    swipe_left(page, "feedings:12")
    now = page.evaluate("(() => { const r = document.querySelector('[data-row=\"feedings:12\"]'); return {t: getComputedStyle(r).transitionDuration, x: new DOMMatrix(getComputedStyle(r).transform).m41}; })()")
    check(f"reduced motion: the row jumps with no transition: {now}", now["t"] in ("0s", "0s, 0s") and now["x"] <= -87)
    page.context.close()


def audit_no_sideways_scroll(browser, base):
    """Failure case: the Delete button pushes the page wider than the screen, closed or open, at 320 px or 390 px."""
    for width in (320, 390):
        page = swipe_page(browser, base, width=width, lang="es")
        wide = "document.documentElement.scrollWidth > innerWidth || document.querySelector('[data-scroll]').scrollWidth > document.querySelector('[data-scroll]').clientWidth"
        closed = page.evaluate(wide)
        swipe_left(page, "feedings:11")
        check(f"{width} px: no sideways scroll with the rows closed ({closed}) or one open ({page.evaluate(wide)}); the label fits its button", not closed and not page.evaluate(wide)
              and page.evaluate("(() => { const b = document.querySelector('.swipe.open .swipe-del'), s = b.querySelector('span'); return s.scrollWidth <= b.clientWidth; })()"))
        page.context.close()


def audit_pictures(browser, base):
    """Shots for the owner review: an open row, English day, Spanish day and English night, 390 px."""
    if not SHOTS:
        return
    for name, kw in (("open-en-day", {}), ("open-es-day", {"lang": "es"}), ("open-en-night", {"night": True})):
        page = swipe_page(browser, base, **kw)
        swipe_left(page, "feedings:11")
        shot(page, name)
        page.context.close()


def main():
    server, base = start_static_server()
    with sync_playwright() as pw:
        browser = launch_browser(pw)
        if DEVICE:
            PROFILE.update({k: v for k, v in pw.devices[DEVICE].items() if k in ("user_agent", "device_scale_factor")})
        chosen = [a for a in sys.argv[1:]]
        for audit in (audit_toast_entrance, audit_open_and_long_swipe, audit_delete_and_undo, audit_single_request_matches_edit_form, audit_same_request_for_every_kind, audit_send_at_once,
                      audit_failed_delete_returns_row, audit_second_undo_while_first_in_flight, audit_midnight_sleep_twin_rows, audit_conflict_returns_row, audit_gestures, audit_chips_search_earlier, audit_rows_that_do_not_open, audit_spanish_and_motion, audit_no_sideways_scroll, audit_pictures):
            if not chosen or audit.__name__ in chosen:
                guarded(audit, browser, base)
        browser.close()
    server.shutdown()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
