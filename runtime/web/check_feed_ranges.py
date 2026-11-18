"""T2–T5: bottle and pump ranges, using the writes suite's local fake API."""
from forms_support import OPEN_DETAILS, set_period
import re
from copy import deepcopy
from urllib.parse import urlsplit


def open_feed_adjustments(page):
    details = page.locator('[data-sheet] [data-feed-adjust]')
    if details.count() and not details.evaluate('el => el.open'):
        details.locator('summary').click()


def type_clock(page, prefix, value, period):
    clock = page.locator(f'[data-fid="{prefix}Clock"]')
    if not clock.count():
        return False
    # Finish the previous field's select-on-focus callback before WebKit types here.
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(resolve))")
    clock.fill(value)
    set_period(page, prefix, period)
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(resolve))")
    return True


def feed_form(page, kind):
    page.evaluate("""kind => {
      S.sheet=null;S.drafts={};S.message='';S.toast=null;S.tab='home';
      act('open-feed');act('ftab',kind);render();
    }""", kind)
    if kind == "bottle":
        page.locator('[data-act="milk"][data-arg="breast"]').click()
        page.locator('[data-fid="ml"]').fill("40")
    else:
        page.locator('[data-fid="pL"]').fill("2")


def save_event(page, posts):
    save = page.locator('[data-sheet] [data-act="save"]')
    before = len(posts)
    if save.count() and save.is_enabled():
        save.click()
        page.wait_for_function("!S.busy")
    return posts[-1]["event"] if len(posts) > before else {}


def range_labels(page, check, kind):
    for lang, expected in [("en", ["Day", "Started", "Ended"]),
                           ("es", ["Día", "Inicio", "Fin"])]:
        page.evaluate("lang => {S.lang=lang;render();}", lang)
        labels = page.locator('[data-sheet] label').all_inner_texts()
        fields = all(page.locator(f'[data-fid="{fid}"]').count() == 1
                     for fid in ["manualDate", "manualClock", "manualEndClock"])
        check(f"T{'2' if kind == 'bottle' else '3'} {kind} has the three range fields in {lang}",
              fields and all(label in labels for label in expected))
        check(f"T{'2' if kind == 'bottle' else '3'} {kind} keeps Logged by and Other in {lang}",
              page.locator('[data-act="logged-by"]').all_inner_texts()
              == ["Rowan", "Sage", "Otra persona" if lang == "es" else "Other"])
    page.evaluate("() => {S.lang='en';render();}")


def audit_bottle_range(page, posts, check):
    feed_form(page, "bottle")
    range_labels(page, check, "bottle")
    page.locator('[data-fid="manualDate"]').fill("2026-11-07")
    type_clock(page, "manual", "3:51", "AM")
    type_clock(page, "manualEnd", "4:35", "AM")
    length = page.locator('[data-range-len]')
    check("T2 bottle shows its 44-minute length", length.count() == 1 and "44" in length.inner_text())
    page.locator('[data-act="logged-by"][data-arg="Sage"]').click()
    event = save_event(page, posts)
    check("T2 bottle sends the typed start and 44 minutes",
          event.get("start") == "2026-11-07T09:51:00.000Z"
          and event.get("end") == "2026-11-07T10:35:00.000Z"
          and event.get("duration") == 44 and event.get("ml") == 40 and event.get("by") == "Sage")
    feed_form(page, "bottle")
    event = save_event(page, posts)
    check("T2 keeps a zero-minute bottle save", event.get("type") == "bottle")
    check("T2 a zero-minute bottle sends equal start and end",
          event.get("start") == "2026-11-09T00:00:00.000Z" and event.get("end") == event.get("start") and event.get("duration") == 0)
    feed_form(page, "bottle")
    page.locator('[data-fid="manualDate"]').fill("2026-11-07")
    type_clock(page, "manual", "11:50", "PM")
    type_clock(page, "manualEnd", "12:10", "AM")
    event = save_event(page, posts)
    check("T2 11:50 PM to 12:10 AM sends 20 minutes across midnight",
          event.get("start") == "2026-11-08T05:50:00.000Z" and event.get("end") == "2026-11-08T06:10:00.000Z" and event.get("duration") == 20)
    feed_form(page, "bottle")
    type_clock(page, "manual", "5:50", "PM")
    type_clock(page, "manualEnd", "6:10", "PM")
    error = page.locator('[data-range-err]')
    # R4: Save on a bottle is always on. An end after now shows its error, and Save sends nothing.
    before = len(posts)
    page.locator('[data-sheet] [data-act="save"]').click()
    check("T2 an end after now shows the error and Save sends nothing",
          error.count() == 1 and error.is_visible() and "now or earlier" in error.inner_text()
          and page.locator('[data-sheet] [data-act="save"]').is_enabled() and len(posts) == before)


def audit_pump_range(page, posts, check):
    feed_form(page, "pump")
    range_labels(page, check, "pump")
    check("T3 pump has no Minutes field", page.locator('[data-fid="pumpDuration"]').count() == 0)
    page.locator('[data-fid="manualDate"]').fill("2026-11-07")
    type_clock(page, "manual", "3:51", "AM")
    type_clock(page, "manualEnd", "4:35", "AM")
    event = save_event(page, posts)
    check("T3 pump sends the typed start and 44 minutes",
          event.get("start") == "2026-11-07T09:51:00.000Z" and event.get("end") == "2026-11-07T10:35:00.000Z"
          and event.get("duration") == 44 and event.get("leftMl") == 2)
    feed_form(page, "pump")
    event = save_event(page, posts)
    check("T3 keeps a zero-minute pump save", event.get("duration") == 0 and event.get("start") == event.get("end"))


def audit_following_end(page, posts, check):
    page.clock.set_fixed_time("2026-11-08T21:00:00.000Z")  # 3:00 PM
    for kind in ["bottle", "pump"]:
        feed_form(page, kind)
        type_clock(page, "manual", "2:30", "AM")
        check(f"A1 {kind} untouched end follows the start in place",
              page.locator('[data-fid="manualEndClock"]').input_value() == "2:30" and page.evaluate("S.sheet.endPeriod") == "AM")
        event = save_event(page, posts)
        check(f"A1 {kind} start-only change saves zero minutes at 2:30 AM",
              event.get("start") == "2026-11-08T08:30:00.000Z"
              and event.get("end") == event.get("start") and event.get("duration") == 0)
    feed_form(page, "bottle")
    type_clock(page, "manual", "2:30", "AM")
    type_clock(page, "manualEnd", "2:45", "AM")
    type_clock(page, "manual", "2:40", "AM")
    check("A1 an edited end stays at 2:45 AM and shows five minutes",
          page.locator('[data-fid="manualEndClock"]').input_value() == "2:45" and page.evaluate("S.sheet.endPeriod") == "AM"
          and "5 min" in page.locator('[data-range-len]').inner_text())
    event = save_event(page, posts)
    check("A1 the edited end saves a five-minute bottle",
          event.get("start") == "2026-11-08T08:40:00.000Z" and event.get("end") == "2026-11-08T08:45:00.000Z" and event.get("duration") == 5)
    page.clock.set_fixed_time("2026-11-09T00:00:00.000Z")


def audit_end_across_tabs(page, posts, check):
    page.clock.set_fixed_time("2026-11-08T21:00:00.000Z")  # 3:00 PM
    for path in ["1", "2"]:
        feed_form(page, "bottle")
        type_clock(page, "manual", "2:30", "AM")
        type_clock(page, "manualEnd", "2:45", "AM")
        if path == "1":
            page.evaluate("act('ftab','breast');render();")
            page.locator('[data-act="manual"]').click()  # resets the shared end to now
        else:  # R4: Breast no longer has an end time (it takes minutes), so the end is typed on Pump
            page.evaluate("act('ftab','pump');render();")
            type_clock(page, "manualEnd", "2:40", "PM")
        page.evaluate("act('ftab','bottle');render();")
        page.locator('[data-fid="manualDate"]').fill("2026-11-08")
        type_clock(page, "manual", "2:10", "PM")
        end = page.locator('[data-fid="manualEndClock"]').input_value()
        period = page.evaluate("S.sheet.endPeriod")
        if path == "1":
            check("A6 a manual reset on Breast makes the bottle end follow the start again",
                  end == "2:10" and period == "PM" and page.locator('[data-range-len]').is_hidden())
            event = save_event(page, posts)
            check("A6 that bottle saves zero minutes",
                  event.get("start") == "2026-11-08T20:10:00.000Z" and event.get("end") == event.get("start")
                  and event.get("duration") == 0)
        else:
            check("A6 an end typed on Pump stays when the start changes on Bottle",
                  end == "2:40" and period == "PM" and "30 min" in page.locator('[data-range-len]').inner_text())
            event = save_event(page, posts)
            check("A6 that bottle saves 30 minutes",
                  event.get("start") == "2026-11-08T20:10:00.000Z" and event.get("end") == "2026-11-08T20:40:00.000Z"
                  and event.get("duration") == 30)
    page.clock.set_fixed_time("2026-11-09T00:00:00.000Z")


def audit_zero_length(page, check):
    for lang in ["en", "es"]:
        for kind in ["bottle", "pump"]:
            feed_form(page, kind)
            page.evaluate("lang => {S.lang=lang;render();}", lang)
            check(f"A2 {kind} opens without a length line in {lang}", page.locator('[data-range-len]').is_hidden())
            entry = {"id": "fake:zero", "type": kind, "t": 231, "dur": 0, "ml": 40,
                     "milk": "breast", "sideAmounts": {"L": 20, "R": 20}, "by": "Rowan"}
            page.evaluate("entry => {S.sheet=null;S.drafts={};S.entries=[entry];act('edit',entry.id);render();}", entry)
            check(f"A2 zero-minute {kind} edit has no length line in {lang}", page.locator('[data-range-len]').is_hidden())
        page.evaluate("S.entries=[];S.lang='en'")
        feed_form(page, "bottle")
        type_clock(page, "manual", "2:30", "AM")
        type_clock(page, "manualEnd", "3:14", "AM")
        page.evaluate("lang => {S.lang=lang;render();}", lang)
        check(f"A2 a 44-minute bottle still shows its length in {lang}",
              page.locator('[data-range-len]').is_visible() and "44 min" in page.locator('[data-range-len]').inner_text())
    page.evaluate("S.lang='en';S.entries=[];S.sheet=null;render()")


def audit_pump_timer(page, state, check):
    sent = []

    def timer(route):
        body = route.request.post_data_json
        sent.append((route.request.url, body))
        state["pumpRun"] = None if route.request.url.endswith("/stop") else {
            "id": "fake-pump", "t0": 1080, "startedAt": "2026-11-09T00:00:00.000Z", "by": "Rowan"}
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})

    page.route("**/api/timers**", timer)
    try:
        feed_form(page, "pump")
        page.locator('[data-act="pumpTimer"]').click()
        page.wait_for_function("!S.busy")
        started = len(sent) == 1 and sent[0][1].get("kind") == "pump" and page.evaluate("!!S.pumpRun")
        page.clock.set_fixed_time("2026-11-09T00:05:00.000Z")
        feed_form(page, "pump")
        page.locator('[data-act="pumpTimer"]').click()
        page.wait_for_function("!S.busy")
        check("T3 keeps the pump timer start and stop",
              started and len(sent) == 2 and sent[-1][0].endswith("/stop")
              and sent[-1][1].get("amounts", {}).get("leftMl") == 2 and page.evaluate("!S.pumpRun"))
    finally:
        page.unroute("**/api/timers**", timer)
        page.clock.set_fixed_time("2026-11-09T00:00:00.000Z")


def audit_feed_range_edits(page, posts, check):
    for kind in ["bottle", "pump"]:
        entry = {"id": f"{'feedings' if kind == 'bottle' else 'pumping'}:fake", "type": kind,
                 "t": 231, "dur": 10, "ml": 40, "milk": "breast", "side": "B",
                 "sideAmounts": {"L": 20, "R": 20}, "by": "Sage"}
        for end, duration in [("4:35", 44), ("3:51", 0)]:
            page.evaluate("entry => {S.sheet=null;S.drafts={};S.entries=[entry];act('edit',entry.id);render();}", entry)
            has_end = page.locator('[data-fid="editEndClock"]').count() == 1
            check(f"T4 {kind} edit has an end time", has_end)
            type_clock(page, "editEnd", end, "AM")
            event = save_event(page, posts)
            check(f"T4 {kind} edit sends {duration} minutes from its end time",
                  event.get("duration") == duration and event.get("start") == "2026-11-08T09:51:00.000Z"
                  and event.get("by") == "Sage")


def audit_feed_range_log(page, check):
    entries = [
        {"id": "feedings:range", "type": "bottle", "t": 231, "dur": 44, "ml": 40, "milk": "breast", "by": "Rowan"},
        {"id": "feedings:zero", "type": "bottle", "t": 120, "dur": 0, "ml": 40, "milk": "breast", "by": "Sage"},
        {"id": "pumping:range", "type": "pump", "t": 480, "dur": 20, "ml": 40, "side": "B", "by": "Rowan"},
        {"id": "feedings:breast", "type": "feed", "t": 540, "dur": 15, "side": "L", "by": "Sage"},
        {"id": "sleep:range", "type": "sleep", "t": 600, "dur": 45, "nap": True, "by": "Rowan"},
        {"id": "tummy:range", "type": "other", "what": "tummy", "t": 660, "dur": 10, "by": "Rowan"},
        {"id": "diaper:instant", "type": "diaper", "t": 690, "kind": "wet", "by": "Rowan"},
    ]
    page.evaluate("entries => {S.entries=entries;S.sheet=null;S.tab='log';S.day=0;S.search='';S.filter='all';render();}", entries)
    for key, start, end in [("feedings:range", "3:51", "4:35"), ("pumping:range", "8:00", "8:20"),
                            ("feedings:breast", "9:00", "9:15"), ("sleep:range", "10:00", "10:45"),
                            ("tummy:range", "11:00", "11:10")]:
        # R5 (look match): a row shows its start time at the right and its length in the second line; a sleep shows both times. The "ago" line is dropped.
        text = page.locator(f'[data-row="{key}"] time').inner_text()
        sub = page.locator(f'[data-row="{key}"] .sub').inner_text()
        minutes = {"feedings:range": 44, "pumping:range": 20, "feedings:breast": 15, "sleep:range": 45, "tummy:range": 10}[key]
        if key == "sleep:range":
            check(f"T5 {key} shows its start and end in the Log", bool(re.search(rf"{start}\s*AM.*{end}\s*AM", text, re.S)))
        else:
            check(f"T5 {key} shows its start at the right and its length in the second line", text.strip() == f"{start} AM" and f"{minutes} min" in sub.replace("\u00a0", " "))
        check(f"T5 {key} has no relative-time line", page.locator(f'[data-row="{key}"] .ago').count() == 0)
    check("T5 an instant event keeps one time", page.locator('[data-row="diaper:instant"] time').inner_text() == "11:30 AM")
    text = page.locator('[data-row="feedings:zero"] time').inner_text()
    check("T5 keeps one time for a zero-minute bottle", text == "2:00 AM")
    for lang, title, bottle in [("en", "Pump", "Bottle"), ("es", "Extracción", "Biberón")]:
        page.evaluate("lang => {S.lang=lang;render();}", lang)
        row = page.locator('[data-row="pumping:range"]')
        check(f"A5 pump title has no bottle label in {lang}", row.locator('strong').inner_text() == title and bottle not in row.inner_text())


def audit_feed_ranges(browser, base, state, check):
    page = browser.new_page()
    page.add_init_script(OPEN_DETAILS)
    page.route("**/*", lambda route: route.continue_() if urlsplit(route.request.url).hostname == "127.0.0.1" else route.abort())
    local = deepcopy(state)
    local.update({"me": "Rowan", "people": ["Rowan", "Sage", "Wren"], "entries": [],
                  "run": None, "sleepRun": None, "pumpRun": None, "pendingOperations": []})
    posts = []

    def event(route):
        body = route.request.post_data_json
        posts.append(body)
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": local})

    page.clock.set_fixed_time("2026-11-09T00:00:00.000Z")  # November 8, 6:00 PM in Mexico City
    page.route("**/api/session", lambda route: route.fulfill(json={"me": local["me"], "csrf": "fake", "labels": {"Wren": {"en": "Other", "es": "Otra persona"}}}))
    page.route("**/api/state", lambda route: route.fulfill(json=local))
    page.route("**/api/events", event)
    page.route("**/api/events/**", event)
    try:
        page.goto(base)
        page.locator('.tile[data-act="open-feed"]').wait_for()
        audit_bottle_range(page, posts, check)
        audit_pump_range(page, posts, check)
        audit_pump_timer(page, local, check)
        audit_feed_range_edits(page, posts, check)
        audit_following_end(page, posts, check)
        audit_end_across_tabs(page, posts, check)
        audit_zero_length(page, check)
        audit_feed_range_log(page, check)
    finally:
        page.close()
