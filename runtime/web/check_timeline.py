"""Timeline rebuilt to the approved mockup (look match): the parts the mockup does not draw (R5) and the rules of its rows.

Each audit names the failure it would catch. Invented records only.
  python3 check_timeline.py        (Playwright Python, sandbox off)
"""
import os
import re
from datetime import date, datetime
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

from check_support import launch_browser, open_app, start_static_server
from check_ui import navigate

PASS = 0
FAIL = 0
AT = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
TODAY = date(2026, 11, 10)
SHOTS = os.environ.get("TIMELINE_SHOTS", "")


def check(name, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name}")


def guarded(audit, *args):
    """An audit that crashes (a missing element) counts as one failure instead of ending the run."""
    try:
        audit(*args)
    except Exception as error:  # noqa: BLE001
        check(f"{audit.__name__} ran without error ({type(error).__name__}: {str(error).splitlines()[0][:120]})", False)


def timeline_page(browser, base, entries, lang="en", night=False, width=390, height=844):
    """A Timeline served the way the server serves it: a range request gets only the records inside its days."""
    page = open_app(browser, base, width, height, AT, lang=lang, theme="on" if night else "off")  # night = the Dim screen
    page.set_default_timeout(5000)
    page.st["entries"] = entries
    page.requests = []

    def ranged(route):
        page.requests.append(route.request.url)
        query = parse_qs(urlparse(route.request.url).query)
        low, high = ((date.fromisoformat(query[k][0]) - TODAY).days for k in ("from", "to")) if "from" in query else (-1, 1)
        route.fulfill(json={**page.st, "entries": [e for e in page.st["entries"] if low <= e["t"] // 1440 < high]})

    page.route(re.compile(r"/api/state(\?.*)?$"), ranged)
    page.reload()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    navigate(page, "log")
    return page


def shot(page, name):
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, f"timeline-{name}.png"), full_page=True)


def audit_chips(browser, base):
    """Failure case: a record type with no chip vanishes from every filter, or the old filter list is still there."""
    entries = [
        {"id": "c-feed", "type": "feed", "side": "L", "dur": 12, "t": 60, "by": "Sam"},
        {"id": "c-bottle", "type": "bottle", "ml": 90, "milk": "formula", "t": 120, "by": "Sam"},
        {"id": "c-pump", "type": "pump", "ml": 80, "t": 150, "by": "Sam"},
        {"id": "c-sleep", "type": "sleep", "nap": True, "dur": 40, "t": 200, "by": "Sam"},
        {"id": "c-dia", "type": "diaper", "kind": "W", "t": 260, "by": "Sam"},
        {"id": "c-med", "type": "med", "name": "Vitamin D", "dose": "1", "unit": "ml", "t": 300, "by": "Sam"},
        {"id": "c-temp", "type": "temp", "c": 36.8, "t": 320, "by": "Sam"},
        {"id": "c-growth", "type": "growth", "kg": 4.2, "t": 340, "by": "Sam"},
        {"id": "c-note", "type": "note", "text": "Smiled at the lamp.", "t": 360, "by": "Sam"},
        {"id": "c-tummy", "type": "other", "what": "tummy", "dur": 8, "t": 380, "by": "Sam"},
    ]
    page = timeline_page(browser, base, entries)
    chips = page.evaluate("[...document.querySelectorAll('.chips .chip')].map(c => [c.dataset.arg, c.textContent.trim(), c.getAttribute('aria-pressed')])")
    check(f"chips are All, Feed, Sleep, Diaper, Other, with All pressed and no filter list: {chips}",
          [c[1] for c in chips] == ["All", "Feed", "Sleep", "Diaper", "Other"] and chips[0][2] == "true" and page.locator("select[data-fid=filter]").count() == 0)
    row_fit = page.evaluate("""() => {
        const bar = document.querySelector('.tl-chips'), items = [...bar.querySelectorAll('.chip')].map(c => {
            const b = c.getBoundingClientRect();
            return {arg: c.dataset.arg, top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), clipped: c.scrollWidth > c.clientWidth + 1};
        });
        return {items, oneRow: new Set(items.map(i => i.top)).size === 1, fitsBar: bar.scrollWidth <= bar.clientWidth + 1,
                sideways: document.documentElement.scrollWidth > innerWidth};
    }""")
    check(f"all five Timeline filter chips sit on one 390 px row with 44x48+ targets and no scroll: {row_fit}",
          row_fit["oneRow"] and row_fit["fitsBar"] and not row_fit["sideways"]
          and all(i["w"] >= 44 and i["h"] >= 48 and not i["clipped"] for i in row_fit["items"]))
    want = {"feed": {"c-feed", "c-bottle", "c-pump"}, "sleep": {"c-sleep"}, "diaper": {"c-dia"}, "other": {"c-med", "c-temp", "c-growth", "c-note", "c-tummy"}}
    for chip, ids in want.items():
        page.locator(f'[data-act="filter"][data-arg="{chip}"]').click()
        shown = set(page.evaluate("[...document.querySelectorAll('.day[data-day=\"0\"] [data-row]')].map(r => r.dataset.row)"))
        check(f"the {chip} chip shows exactly its own records: {sorted(shown)}", shown == ids and page.locator(f'[data-act="filter"][data-arg="{chip}"]').get_attribute("aria-pressed") == "true")
    page.locator('[data-act="filter"][data-arg="all"]').click()
    check("the All chip brings back all ten records", page.locator('.day[data-day="0"] [data-row]').count() == 10)
    page.context.close()


def audit_rows(browser, base):
    """Failure case: a row loses its button, keeps the old 'ago' line or who chip, or a record with no care color gets a care color."""
    entries = [
        {"id": "r-feed", "type": "feed", "side": "R", "dur": 26, "t": 600, "by": "Sam"},
        {"id": "r-bottle", "type": "bottle", "ml": 120, "milk": "formula", "t": 540, "by": "Alex"},
        {"id": "r-dia", "type": "diaper", "kind": "B", "t": 500, "by": "Sam"},
        {"id": "r-note", "type": "note", "text": "Fussy after the bottle.", "t": 450, "by": "Alex"},
        {"id": "r-med", "type": "med", "name": "Vitamin D", "dose": "1", "unit": "ml", "t": 400, "by": "Sam"},
    ]
    page = timeline_page(browser, base, entries)
    rows = page.evaluate("""() => Object.fromEntries([...document.querySelectorAll('.day[data-day="0"] [data-row]')].map(r => [r.dataset.row, {
        tag: r.tagName, buttons: r.querySelectorAll('button[data-act="edit"]').length, height: Math.round(r.getBoundingClientRect().height), title: r.querySelector('strong').textContent, sub: r.querySelector('.sub').textContent.replace(/\\u00a0/g, ' '),
        time: r.querySelector('time').textContent, plate: getComputedStyle(r.querySelector('.plate')).fill, ago: !!r.querySelector('.ago'), chip: !!r.querySelector('.by')}]))""")
    check(f"a row is a 64 px row with one edit button in its title, a second line and the time: {rows['r-feed']}",
          all(r["tag"] == "LI" and r["buttons"] == 1 and r["height"] == 64 for r in rows.values()) and rows["r-feed"]["title"] == "Breast · Right" and rows["r-feed"]["sub"] == "26 min · Sam" and rows["r-feed"]["time"] == "10:00 AM")
    check(f"bottle, diaper and note rows read as the mockup writes them: {[rows[k]['title'] for k in ('r-bottle', 'r-dia', 'r-note')]}",
          rows["r-bottle"]["title"] == "Bottle · 120 ml" and rows["r-bottle"]["sub"] == "Formula · Alex" and rows["r-dia"]["title"] == "Diaper · Wet and dirty" and rows["r-note"]["title"] == "Note · Alex" and rows["r-note"]["sub"] == "Fussy after the bottle.")
    check("no row keeps the 'ago' line or the who chip", not any(r["ago"] or r["chip"] for r in rows.values()))
    check(f"a note and a medicine row use the neutral icon block, a feed the feed color: {rows['r-note']['plate']} {rows['r-med']['plate']} {rows['r-feed']['plate']}",
          rows["r-note"]["plate"] == rows["r-med"]["plate"] == "rgb(224, 225, 230)" and rows["r-feed"]["plate"] == "rgb(244, 194, 106)" and rows["r-med"]["title"] == "Medicine")
    page.locator('[data-act="edit"][data-arg="r-bottle"]').click()
    check("a row opens its edit form", page.get_by_role("dialog").is_visible() and page.evaluate("S.sheet && S.sheet.kind === 'edit' && S.sheet.id === 'r-bottle'"))
    page.context.close()


def audit_midnight_split(browser, base):
    """Failure case: a sleep across midnight shows once, or the two parts do not add up to the day totals."""
    entries = [
        {"id": "m-night", "type": "sleep", "nap": False, "dur": 320, "t": -150, "by": "Sam"},   # 9:30 PM yesterday to 2:50 AM today
        {"id": "m-unmarked", "type": "sleep", "dur": 60, "t": 13 * 60, "by": "Sam"},             # no saved kind: starts at 1 PM, so Nap
        {"id": "m-late", "type": "sleep", "dur": 60, "t": 19 * 60 + 30 - 1440, "by": "Sam"},     # no saved kind: starts at 7:30 PM yesterday, so Night
    ]
    page = timeline_page(browser, base, entries)
    parts = page.evaluate("""() => [...document.querySelectorAll('[data-row="m-night"]')].map(r => [r.closest('.day').dataset.day, r.querySelector('strong').textContent, r.querySelector('.sub').innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' / '), r.querySelector('time').innerText.replace(/\\n/g, ' / ')])""")
    check(f"a sleep across midnight has one row in each day with its own part: {parts}",
          sorted(parts) == [["-1", "Night sleep", "2 h 30 min of 5 h 20 min / Sam", "9:30 PM / to midnight"], ["0", "Night sleep", "2 h 50 min of 5 h 20 min / Sam", "Midnight / to 2:50 AM"]])
    totals = page.evaluate("[...document.querySelectorAll('[data-day-totals] .total.t-sleep dd')].map(d => [d.closest('[data-day-totals]').dataset.dayTotals, d.textContent.replace(/\\u00a0/g, ' ')])")
    check(f"the day totals count the same parts: {totals}", ["0", "3 h 50 min · 2 sleeps"] in totals and ["-1", "3 h 30 min · 2 sleeps"] in totals)
    titles = page.evaluate("Object.fromEntries(['m-unmarked', 'm-late'].map(id => [id, document.querySelector(`[data-row=${id}] strong`).textContent]))")
    check(f"a sleep with no saved kind is named by its start, 7 PM to 7 AM being night: {titles}", titles == {"m-unmarked": "Nap", "m-late": "Night sleep"})
    page.context.close()


def audit_earlier_days(browser, base):
    """Failure case: the day pager stays, one tap loads more than one day, or an empty day has no heading and line."""
    entries = [
        {"id": "e-two", "type": "note", "text": "Two days back.", "t": -2 * 1440 + 500, "by": "Sam"},
        {"id": "e-four", "type": "feed", "side": "L", "dur": 10, "t": -4 * 1440 + 500, "by": "Sam"},
    ]
    page = timeline_page(browser, base, entries)
    check("it opens on Today, Yesterday and the day before, with the link and no day pager",
          page.locator(".day").count() == 3 and page.get_by_role("button", name="Show the day before").count() == 1 and page.locator('[data-act="day"]').count() == 0)
    page.requests.clear()
    page.get_by_role("button", name="Show the day before").click()
    page.wait_for_load_state("networkidle")
    check("the third day already holds its record, and one tap adds one earlier day", page.locator('.day[data-day="-2"] [data-row="e-two"]').count() == 1 and page.locator(".day").count() == 4)
    asked = {parse_qs(urlparse(u).query)["from"][0] for u in page.requests if "from=" in u}
    check(f"the tap asks for one new day only, the one before the new day (its sleep carried in); the new day itself came with the third day's carry: {sorted(asked)}", asked == {"2026-11-06"})
    page.get_by_role("button", name="Show the day before").click()
    page.wait_for_load_state("networkidle")
    empty = page.evaluate("(() => { const day = document.querySelector('.day[data-day=\"-3\"]'); return [day.querySelector('h2').firstChild.textContent, day.querySelector('.card p.sub').textContent]; })()")
    check(f"a day with no record keeps its heading and one line: {empty}", page.locator(".day").count() == 5 and empty == ["Sat, Nov 7", "Nothing logged this day."])
    page.st["preferences"] = {**page.st.get("preferences", {}), "lang": "es"}  # the server copy says Spanish too, so a poll cannot put English back
    page.evaluate("S.lang = 'es'; render()")
    link = page.get_by_role("button", name="Ver el día anterior").count()
    check("the link has Spanish text", link == 1)
    page.context.close()


def audit_search_button(browser, base):
    """Failure case: the search has no way in from the title bar, or it shows records of a day that was not asked for."""
    entries = [
        {"id": "s-a", "type": "note", "text": "Gas drops after lunch.", "t": 400, "by": "Sam"},
        {"id": "s-b", "type": "note", "text": "Gas again at night.", "t": -300, "by": "Alex"},
        {"id": "s-c", "type": "note", "text": "Bath time.", "t": 420, "by": "Sam"},
    ]
    page = timeline_page(browser, base, entries)
    box = page.locator('[data-act="search-toggle"]').bounding_box()
    check(f"the search button is a 48 px target at the right of the title bar: {box}", box["width"] >= 48 and box["height"] >= 48 and box["x"] + box["width"] > 390 - 40)
    check("the field starts closed", page.locator('[data-fid="search"]').count() == 0 and page.locator('[data-act="search-toggle"]').get_attribute("aria-expanded") == "false")
    page.locator('[data-act="search-toggle"]').click()
    page.locator('[data-fid="search"]').fill("gas")
    page.wait_for_timeout(300)
    found = page.evaluate("[...document.querySelectorAll('[data-row]')].map(r => r.dataset.row).sort()")
    check(f"results use the same day groups and rows: {found}", found == ["s-a", "s-b"] and page.locator(".day").count() == 2 and page.evaluate("document.activeElement?.dataset.fid") == "search")
    page.locator('[data-act="search-toggle"]').click()
    check("closing the search clears it and brings back every record", page.locator('[data-fid="search"]').count() == 0 and page.locator("[data-row]").count() == 3)
    page.context.close()


def luminance(rgb):
    channel = [(v / 255) / 12.92 if v / 255 <= .04045 else (((v / 255) + .055) / 1.055) ** 2.4 for v in rgb]
    return .2126 * channel[0] + .7152 * channel[1] + .0722 * channel[2]


def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + .05) / (lo + .05)


def audit_night_and_spanish(browser, base):
    """Failure case: night text under 4.5:1 on its ground, or Spanish text that clips, wraps a number from its unit, or pushes the page sideways."""
    entries = [
        {"id": "n-night", "type": "sleep", "nap": False, "dur": 320, "t": -150, "by": "Sam"},
        {"id": "n-feed", "type": "feed", "side": "L", "dur": 26, "t": 300, "by": "Sam"},
        {"id": "n-bottle", "type": "bottle", "ml": 120, "milk": "formula", "t": 360, "by": "Alex"},
        {"id": "n-dia", "type": "diaper", "kind": "B", "t": 420, "by": "Sam"},
        {"id": "n-note", "type": "note", "text": "Fussy after the bottle. Settled with the swaddle.", "t": 450, "by": "Alex"},
        {"id": "n-yesterday", "type": "feed", "side": "R", "dur": 20, "t": -1440 + 900, "by": "Sam"},
    ]
    probe = """() => {
        const parse = s => s.match(/[\\d.]+/g).slice(0, 3).map(Number), box = e => e.getBoundingClientRect(), out = [];
        const ground = el => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)') return parse(c); } return [255, 255, 255]; };
        for (const el of document.querySelectorAll('.day h2, .day h2 .sub, .row strong, .row .sub, .row time, .total dt, .total dd, .chip, .textlink, .card p.sub')) {
            const cs = getComputedStyle(el); if (!el.textContent.trim()) continue;
            out.push({name: el.className || el.tagName, fg: parse(cs.color), bg: ground(el), clipped: el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline'});
        }
        return {out, oneRow: new Set([...document.querySelectorAll('.tl-chips .chip')].map(c => Math.round(c.getBoundingClientRect().top))).size === 1,
                sideways: document.documentElement.scrollWidth > innerWidth, outside: [...document.querySelectorAll('.day, .chips')].some(e => box(e).right > innerWidth + 0.5)};
    }"""
    for lang, night in (("es", False), ("en", False), ("en", True), ("es", True)):
        for width in (390, 320):
            page = timeline_page(browser, base, entries, lang=lang, night=night, width=width)
            page.locator('[data-act="search-toggle"]').click()
            m = page.evaluate(probe)
            low = sorted({(o["name"], round(ratio(o["fg"], o["bg"]), 2)) for o in m["out"] if ratio(o["fg"], o["bg"]) < 4.5})
            check(f"{lang} {'night' if night else 'day'} {width}px: every Timeline text reads at 4.5:1 or more, chips stay one row, nothing clips or scrolls sideways: {low}",
                  not low and m["oneRow"] and not any(o["clipped"] for o in m["out"]) and not m["sideways"] and not m["outside"])
            if width == 390:
                page.locator('[data-act="search-toggle"]').click()
                page.get_by_role("button", name=re.compile("Show the day before|Ver el día anterior")).click()
                page.wait_for_load_state("networkidle")
                page.set_viewport_size({"width": 390, "height": 1500})
                shot(page, f"{lang}-{'night' if night else 'day'}")
            page.context.close()


def main():
    server, base = start_static_server()
    with sync_playwright() as pw:
        browser = launch_browser(pw)
        for audit in (audit_chips, audit_rows, audit_midnight_split, audit_earlier_days, audit_search_button, audit_night_and_spanish):
            guarded(audit, browser, base)
        browser.close()
    server.shutdown()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
