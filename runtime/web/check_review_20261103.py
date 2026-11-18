"""Focused browser checks for the 2026-11-03 review fixes (layout, colour, dim theme, fewer taps, labels, type).

Test-only mocked server responses; nothing here reaches a live app. Run it from this folder with the Playwright Python:
  python check_review_20261103.py
"""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import json
import math
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from forms_support import save_diaper, pick_setting
from playwright.sync_api import sync_playwright
from check_support import launch_browser, mx_minutes, open_app, start_static_server
from check_ui import navigate, open_settings, close_settings

ROOT = Path(__file__).resolve().parent
PASS = 0
FAIL = 0


def check(name, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name}")


def hex_rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def lin(c):
    c /= 255
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def unlin(x):
    x = max(0, min(1, x))
    return 255 * (12.92 * x if x <= .0031308 else 1.055 * x ** (1 / 2.4) - .055)


def luminance(rgb):
    r, g, b = [lin(c) for c in rgb]
    return .2126 * r + .7152 * g + .0722 * b


def contrast(a, b):
    la, lb = sorted([luminance(a), luminance(b)], reverse=True)
    return (la + .05) / (lb + .05)


def oklab(rgb):
    r, g, b = [lin(c) for c in rgb]
    l = (.4122214708 * r + .5363325363 * g + .0514459929 * b) ** (1 / 3)
    m = (.2119034982 * r + .6806995451 * g + .1073969566 * b) ** (1 / 3)
    s = (.0883024619 * r + .2817188376 * g + .6299787005 * b) ** (1 / 3)
    return (.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s)


DEUTAN = [[.367322, .860646, -.227968], [.280085, .672501, .047413], [-.01182, .04294, .968881]]
PROTAN = [[.152286, 1.052583, -.204868], [.114503, .786281, .099216], [-.003882, -.048116, 1.051998]]


def simulate(rgb, matrix):
    v = [lin(c) for c in rgb]
    return [unlin(sum(matrix[i][j] * v[j] for j in range(3))) for i in range(3)]


def audit_left_right_colours(browser, base, at):
    readable = True
    for theme, lang, words in [("off", "en", ["L Left", "R Right"]), ("on", "es", ["I Izquierdo", "D Derecho"])]:
        page = open_app(browser, base, 390, 844, at, theme=theme, lang=lang)
        page.locator('[data-act="open-feed"]').click()
        buttons = page.locator("[data-sheet] .side")
        labels = [" ".join(text.split()) for text in buttons.all_inner_texts()]
        colors = buttons.evaluate_all("els=>els.map(e=>({ink:getComputedStyle(e).color,fill:getComputedStyle(e).backgroundColor}))")
        rgb = lambda value: [int(x) for x in re.findall(r"\d+", value)[:3]]
        readable = readable and all(contrast(rgb(c["ink"]), rgb(c["fill"])) >= 4.5 for c in colors)
        # Changed (R4): the picked side tile is filled in the care color and the other stays white, so the fills differ by design.
        check(f"{theme}: sides use distinct letters and words, one picked and one not",
              len(labels) == 2 and all(label.startswith(word) for label, word in zip(labels, words))
              and colors[0]["fill"] != colors[1]["fill"] and page.locator('[data-sheet] .side[aria-pressed="true"]').count() == 1)
        page.context.close()
    check("side labels keep 4.5:1 text contrast in day and night", readable)
    retained = True
    for palette in ["Jelly bean", "Sorbet", "Spring garden", "Robin's egg"]:
        page = open_app(browser, base, 390, 844, at, theme="off")
        page.st["preferences"]["palette"] = palette
        page.reload()
        page.locator(".nav").wait_for()
        writes = []
        def preferences(route):
            body = route.request.post_data_json
            writes.append(body)
            page.st["preferences"].update(body)
            route.fulfill(json={"status":"saved", "operationId":body["operationId"], "state":page.st})
        page.route("**/api/preferences", preferences)
        open_settings(page)
        pick_setting(page, "lang", "es")
        page.wait_for_function("S.lang === 'es'")
        retained = retained and len(writes) == 1 and writes[0].get("palette") == palette
        retained = retained and page.locator('[data-setting="palette"]').count() == 0
        retained = retained and page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(240, 240, 242)"
        page.context.close()
    check("all four saved palettes survive preference writes without changing Gallery colors or showing a picker", retained)


def audit_tiles_visible(browser, base, at):
    feed = {"id": "run-1", "kind": "feed", "side": "L", "by": "Rowan", "startedAt": (at - timedelta(minutes=5)).isoformat(), "t0": mx_minutes(at) - 5}
    for run in (None, feed):
        for night_rules in (False, True):
            for width, height in ((375, 667), (390, 844)):
                page = open_app(browser, base, width, height, at, night_rules=night_rules, theme="off", run=run)
                controls = page.locator('.run-card [data-act="open-feed"], .tile')
                visible = controls.count() == (4 if run else 3)
                for control in controls.all():
                    control.scroll_into_view_if_needed()
                    visible = visible and control.evaluate("""el => {
                        const r=el.getBoundingClientRect(),sc=document.querySelector('[data-scroll]').getBoundingClientRect();
                        return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.top>=sc.top-1&&r.bottom<=sc.bottom+1;
                    }""")
                label = ("Big buttons" if night_rules else "normal") + (", feed running" if run else "")
                check(f"{width}x{height} {label}: Feed, Sleep and Diaper remain reachable above the dock", visible)
                page.context.close()


def audit_default_language(browser, base, at):
    page = open_app(browser, base, 390, 844, at, theme="off", lang=None, locale="es-MX")
    check("a Spanish-language phone with no saved language opens in English", page.evaluate("document.documentElement.lang") == "en" and "Sleep" in page.locator(".tiles").inner_text())
    page.context.close()


def audit_order_and_headings(browser, base, at):
    page = open_app(browser, base, 390, 844, at, theme="off")
    order = page.evaluate("""() => { const q=s=>document.querySelector(s).getBoundingClientRect().top; return {tiles:q('.tile'), status:q('.status'), nav:q('.nav'), dev:document.querySelector('.development')?q('.development'):null}}""")
    check("log cards, the insight card and navigation come before development cards (duty tools and the portrait moved into Settings, R3)", order["tiles"] < order["status"] < order["nav"] and (order["dev"] is None or order["nav"] < order["dev"]))

    def levels():
        return page.evaluate("[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h=>!h.closest('[inert]')||true).map(h=>+h.tagName[1])")

    def ordered(seq):
        return bool(seq) and seq[0] == 1 and all(b <= a + 1 for a, b in zip(seq, seq[1:]))

    home = levels()
    # The sleep card plots finished days only, so it needs one nap from yesterday to show.
    yesterday = {"id": "e-yesterday", "type": "sleep", "nap": True, "dur": 60, "t": page.st["entries"][1]["t"] - 1440, "by": "Rowan"}
    page.st["entries"].append(yesterday)
    page.evaluate("e => S.entries.push(e)", yesterday)
    navigate(page, "charts")
    page.wait_for_timeout(300)
    charts = levels()
    check("Home headings go h1, h2, h3 without skipping a level", ordered(home) and 2 in home)
    check("Charts headings go h1, h2, h3 without skipping a level", ordered(charts) and 2 in charts)
    check("Daily rhythm keeps its legend once, and a day with no record says so inside its row (the gap sentences are gone)", page.locator(".charts-page .legend").count() == 1 and page.get_by_text("Gaps mean", exact=False).count() == 0)
    page.context.close()
    desktop = open_app(browser, base, 1440, 900, at, theme="off")
    ada = desktop.evaluate("[...document.querySelectorAll('h1,h2,h3')].filter(h=>h.textContent.trim()==='Ada'&&h.getBoundingClientRect().width>2&&h.getBoundingClientRect().height>2&&getComputedStyle(h).clip!=='rect(0px, 0px, 0px, 0px)').length")
    check("desktop shows the Ada title once", ada == 1)
    desktop.context.close()


def theme_at(browser, base, iso, theme=None):
    at = datetime.fromisoformat(iso)
    page = open_app(browser, base, 390, 844, at, theme=theme)
    value = page.evaluate("document.documentElement.dataset.theme")
    page.context.close()
    return value


def audit_theme(browser, base, noon):
    cases = [("2026-11-03T19:59:00-06:00", "light"), ("2026-11-03T20:00:00-06:00", "dim"), ("2026-11-03T23:30:00-06:00", "dim"),
             ("2026-11-04T06:59:00-06:00", "dim"), ("2026-11-04T07:00:00-06:00", "light"), ("2026-11-03T12:00:00-06:00", "light")]
    check("Auto theme turns dim at 8:00 PM and back to day at 7:00 AM Mexico City time", all(theme_at(browser, base, iso) == want for iso, want in cases))
    # 03:00 UTC is 9:00 PM in Mexico City: the hour is read in Mexico City time, not in the browser's own zone.
    check("Auto theme reads Mexico City time, not UTC", theme_at(browser, base, "2026-11-04T03:00:00+00:00") == "dim" and theme_at(browser, base, "2026-11-03T20:00:00+00:00") == "light")
    check("On forces dim at noon and Off forces day at 9 PM", theme_at(browser, base, "2026-11-03T12:00:00-06:00", "on") == "dim" and theme_at(browser, base, "2026-11-03T21:00:00-06:00", "off") == "light")
    page = open_app(browser, base, 390, 844, noon)
    open_settings(page)  # R3: the Dim screen choice lives on Settings
    page.get_by_role("group", name="Dim screen").get_by_role("button", name="On").click()
    stored = page.evaluate("[localStorage.getItem('little-days-theme'), document.documentElement.dataset.theme]")
    page.reload()
    page.locator(".tile").first.wait_for()
    after_reload = page.evaluate("document.documentElement.dataset.theme")
    open_settings(page)
    page.get_by_role("group", name="Dim screen").get_by_role("button", name="Auto").click()
    auto = page.evaluate("[localStorage.getItem('little-days-theme'), document.documentElement.dataset.theme, document.querySelector('[data-arg=auto]').getAttribute('aria-pressed')]")
    check("the More toggle sets On, keeps it after reload, and Auto clears the override", stored == ["on", "dim"] and after_reload == "dim" and auto == [None, "light", "true"])
    page.context.close()
    dim = open_app(browser, base, 390, 844, datetime.fromisoformat("2026-11-03T22:00:00-06:00"))
    colors = dim.evaluate("""() => { const b=getComputedStyle(document.body); return {bg:b.backgroundColor, ink:b.color, card:getComputedStyle(document.querySelector('.status')).backgroundColor, scheme:getComputedStyle(document.documentElement).colorScheme}}""")
    rgb = lambda text: [int(x) for x in re.findall(r"\d+", text)[:3]]
    check("dim theme uses warm dark surfaces (not pure black) and soft text (not pure white)", rgb(colors["bg"]) != [0, 0, 0] and sum(rgb(colors["bg"])) < 150 and rgb(colors["ink"]) != [255, 255, 255] and rgb(colors["bg"])[0] >= rgb(colors["bg"])[2] and colors["scheme"] == "dark")
    low = dim.evaluate(CONTRAST_JS)
    dim.locator('.tile[data-act="open-feed"]').click()
    low_feed = dim.evaluate(CONTRAST_JS)
    dim.locator('[data-act="cancel"]').click()
    navigate(dim, "charts")
    low_charts = dim.evaluate(CONTRAST_JS)
    print("dim contrast minimums", round(low["min"], 2), round(low_feed["min"], 2), round(low_charts["min"], 2), (low["worst"], low_feed["worst"], low_charts["worst"]))
    check("every visible text in the dim theme (Home, feed sheet, Charts) is at least 4.5:1", min(low["min"], low_feed["min"], low_charts["min"]) >= 4.5)
    dim.context.close()


CONTRAST_JS = """() => {
  const parse = c => { const m = c.match(/[\\d.]+/g).map(Number); return {r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1}; };
  const lin = v => { v/=255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); };
  const lum = c => .2126*lin(c.r)+.7152*lin(c.g)+.0722*lin(c.b);
  const over = (top, under) => ({r:top.r*top.a+under.r*(1-top.a),g:top.g*top.a+under.g*(1-top.a),b:top.b*top.a+under.b*(1-top.a),a:1});
  const bgOf = el => { const stack=[]; for (let e=el; e; e=e.parentElement) { const c=parse(getComputedStyle(e).backgroundColor); if (c.a>0) { stack.push(c); if (c.a===1) break; } } let base={r:255,g:255,b:255,a:1}; const html=parse(getComputedStyle(document.body).backgroundColor); if (html.a>0) base=html; for (const c of stack.reverse()) base=over(c,base); return base; };
  let min=99, worst='';
  const scope = document.querySelector('[data-sheet]') || document.querySelector('.app');
  for (const el of scope.querySelectorAll('*')) {
    if (el.disabled || el.getAttribute('aria-disabled')==='true' || el.closest('[hidden]')) continue;
    const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    const cs=getComputedStyle(el); if (!own || cs.visibility==='hidden' || cs.display==='none' || el.getBoundingClientRect().width<2) continue;
    const fg=parse(cs.color), bg=bgOf(el), f=over(fg,bg);
    const l1=lum(f), l2=lum(bg), r=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    if (r<min) { min=r; worst=(el.className||el.tagName)+':'+el.textContent.trim().slice(0,20); }
  }
  return {min, worst};
}"""


def audit_sleep_default(browser, base):
    # Changed (R7): night sleep runs from 7 PM to 7 AM (it was 8 PM), and one "Start sleep" button carries the kind the clock suggests (it was a Nap and a Night button).
    cases = [("2026-11-03T06:59:00-06:00", "night"), ("2026-11-03T07:00:00-06:00", "nap"), ("2026-11-03T12:00:00-06:00", "nap"),
             ("2026-11-03T18:59:00-06:00", "nap"), ("2026-11-03T19:00:00-06:00", "night"), ("2026-11-03T23:30:00-06:00", "night")]
    ok = True
    for iso, expected in cases:
        page = open_app(browser, base, 390, 844, datetime.fromisoformat(iso), theme="off")
        page.locator('.tile[data-act="open-sleep"]').click()
        suggested = page.locator('[data-sheet] [data-act="sleep-start"]').evaluate_all("els => els.map(e => e.dataset.arg)")
        ready = page.locator('[data-sheet] [data-act="sleep-start"]:enabled').count() == 1
        no_start = page.locator('[data-sheet] [data-act="save"]').count() == 0
        ok = ok and suggested == [expected] and ready and no_start
        page.context.close()
    check("Sleep sheet starts Night from 7 PM to 7 AM and Nap otherwise with one Start sleep button, and the header has no Save", ok)
    # owner request, 2026-11-09: one tap starts the timer, and a running sleep stops from a big button in the Home dock.
    at = datetime.fromisoformat("2026-11-03T23:30:00-06:00")
    page = open_app(browser, base, 390, 844, at, theme="off")
    posts = []
    def timers(route):
        body = route.request.post_data_json or {}
        posts.append((route.request.url, body))
        page.st["sleepRun"] = {"id": "timer-nap", "nap": body.get("nap"), "t0": mx_minutes(at), "startedAt": at.isoformat(), "by": "Rowan"} if route.request.url.endswith("/api/timers") else None
        route.fulfill(json={"status": "saved", "operationId": body.get("operationId"), "state": page.st})
    page.route("**/api/timers**", timers)
    page.locator('.tile[data-act="open-sleep"]').click()
    page.get_by_role("button", name="Start sleep", exact=True).click()
    page.wait_for_function("S.sheet === null && !!S.sleepRun")
    check("one tap on Start sleep at 11:30 PM starts a night timer (nap is false)", len(posts) == 1 and posts[0][0].endswith("/api/timers") and posts[0][1].get("kind") == "sleep" and posts[0][1].get("nap") is False)
    stop = page.locator(".dock").get_by_role("button", name="Stop sleep")
    check("a running sleep shows a full-width Stop sleep in the Home dock, 56 px tall as in round 3", stop.count() == 1 and stop.bounding_box()["height"] >= 56 and stop.bounding_box()["width"] >= 340)  # D2 (2026-11-11): the pinned bar follows round 3, 72 px became 56 px
    page.evaluate("S.run={id:'timer-feed',side:'L',t0:nowM()-5,startedAt:new Date().toISOString(),by:'Rowan'};render()")
    labels = [x.strip() for x in page.locator(".dock button.btn").all_inner_texts()]
    check("with a feed and a sleep both running, each Stop names its timer", "Stop feed" in labels and "Stop sleep" in labels and "Stop" not in labels)
    page.evaluate("S.run=null;render()")
    page.wait_for_timeout(450)  # decision 2026-11-11: the Home bar ignores taps for 400 ms after a form closes (the form's Save sits over it)
    stop.click()  # Home Stop asks first (shared confirm)
    page.locator('.confirm [data-act="stop-go"]').click()  # Round 3: the Home Stop asks once, through the shared confirm
    for _ in range(50):
        if any(url.endswith("/api/timers/timer-nap/stop") for url, _body in posts):
            break
        page.wait_for_timeout(100)
    check("Stop sleep in the dock sends the stop for the sleep timer", any(url.endswith("/api/timers/timer-nap/stop") for url, _body in posts))
    # Codex review, 2026-11-09: the Home dock behind the open sheet also holds Stop sleep.
    page.wait_for_function("!S.busy")
    page.evaluate("S.sheet=null;S.sleepRun={id:'timer-nap-2',nap:true,t0:nowM()-20,startedAt:new Date().toISOString(),by:'Rowan'};render();act('open-sleep');render()")
    behind = page.locator('.main [data-act="stop-sleep"]').count() == 0  # decision 2026-11-11: no pinned bar behind a form any more, so nothing behind it can take the focus
    page.locator('[data-sheet] [data-act="stop-sleep"]').focus()
    page.evaluate("render()")
    check("a redraw keeps keyboard focus on Stop in the Sleep sheet, not on the Home dock behind it", behind and page.evaluate("!!document.activeElement?.closest('[data-sheet]') && document.activeElement.dataset.act === 'stop-sleep'"))
    page.context.close()
    # Codex review, 2026-11-09: Sleep has no header Save, so a start the server accepted and then lost needs its own Retry.
    def lost_start_page(note=""):
        page = open_app(browser, base, 390, 844, at, theme="off")
        starts = []
        def lost_start(route):
            body = route.request.post_data_json or {}
            starts.append(body.get("operationId"))
            if len(starts) == 1:
                route.fulfill(json={"status": "pending", "operationId": body.get("operationId")})
                return
            page.st["sleepRun"] = {"id": "timer-nap", "nap": True, "t0": mx_minutes(at), "startedAt": at.isoformat(), "by": "Rowan"}
            route.fulfill(json={"status": "saved", "operationId": body.get("operationId"), "state": page.st})
        page.route("**/api/timers", lost_start)
        page.route("**/api/operations/*", lambda route: route.fulfill(status=404, json={"error": "Operation not found."}))
        page.locator('.tile[data-act="open-sleep"]').click()
        if note:
            page.evaluate("note => {S.sheet.note=note;S.sheet.dirty=true;render()}", note)
        page.get_by_role("button", name="Start sleep", exact=True).click()  # R4: one Start sleep button
        page.wait_for_function("Object.keys(S.pendingOps).length === 1")
        page.evaluate("uncertainOperation(Object.keys(S.pendingOps)[0])")  # stands in for the 30-second poll limit
        page.locator('[data-sheet] [data-status] [data-act="retry-write"]').click()  # Check again: the server never got the start
        page.wait_for_function("S.message === t('retrySame')")
        return page, starts
    # Codex review round 2: a discarded start must not stay behind a Retry button.
    page, starts = lost_start_page("Woke once")
    page.locator('[data-sheet] [data-act="cancel"]').click()
    page.locator('[data-sheet] [data-act="discard"]').click()
    page.locator('.tile[data-act="open-dia"]').click()
    check("after Discard, a lost sleep start leaves no Retry behind and sends nothing more", page.locator('[data-sheet] [data-act="retry-write"]').count() == 0 and len(starts) == 1)
    page.context.close()
    # Codex review round 2: a start kept (sheet closed unchanged) and retried from the Diaper form leaves that form open.
    page, starts = lost_start_page()
    page.locator('[data-sheet] [data-act="cancel"]').click()
    page.locator('.tile[data-act="open-dia"]').click()
    page.locator('[data-sheet] [data-status] [data-act="retry-write"]').click()
    page.wait_for_function("!!S.sleepRun && !S.busy", timeout=5000)
    check("Retry from the Diaper form sends the same sleep start and keeps the Diaper form open", len(starts) == 2 and starts[0] == starts[1] and page.evaluate("S.sheet?.kind") == "diaper")
    page.context.close()
    page, starts = lost_start_page()
    retry = page.locator("[data-sheet] [data-status]").get_by_role("button", name="Retry", exact=True)
    offered = retry.count() == 1 and retry.is_enabled()
    if offered:
        retry.click()
        page.wait_for_function("!!S.sleepRun", timeout=5000)
    check("a sleep start the server lost offers Retry, and Retry sends the same start again", offered and len(starts) == 2 and starts[0] == starts[1] and page.evaluate("!!S.sleepRun"))
    page.context.close()


def audit_diaper_tap(browser, base, noon):
    for letter, word in (("W", "Wet"), ("D", "Dirty"), ("B", "Both")):
        writes = []
        page = open_app(browser, base, 390, 844, noon, theme="off", writes=writes)
        page.locator('.tile[data-act="open-dia"]').click()
        save_diaper(page, letter)  # Changed (R4): pick a kind chip, then Save diaper (it was one tap)
        page.wait_for_function("!document.querySelector('[data-sheet]')")
        body = writes[0]["event"] if writes else {}
        check(f"{word} saves a diaper of kind {letter} with Save diaper and closes the form", len(writes) == 1 and body.get("type") == "diaper" and body.get("kind") == letter)
        if letter == "D":
            toast = page.locator(".toast")
            check("after a Dirty tap the toast offers Add details with a countdown", toast.get_by_role("button", name="Add details").count() == 1 and bool(re.search(r"\d+ s", toast.inner_text())))
            toast.get_by_role("button", name="Add details").click()
            check("Add details opens the saved entry for texture and color", page.locator('[data-sheet] #f-valueTex').count() == 1 and page.locator('[data-sheet] #f-valueCol').count() == 1)
            check("an empty texture and color read Not set instead of a blank box", [page.locator(f'[data-sheet] #f-{f} option:checked').inner_text().strip() for f in ("valueTex", "valueCol")] == ["Not set", "Not set"])
        page.context.close()
    writes = []
    page = open_app(browser, base, 390, 844, noon, theme="off", writes=writes)
    page.locator('.tile[data-act="open-dia"]').click()
    check("the diaper note field sits behind More details", page.locator('details[data-more-details] summary').count() == 1 and page.locator('details[data-more-details] [data-fid="eventNote"]').count() == 1)
    page.locator('[data-fid="eventNote"]').fill("rash")
    save_diaper(page, "D")
    page.wait_for_function("!document.querySelector('[data-sheet]')")
    check("a note typed before the tap is saved with the diaper", writes and writes[0]["event"].get("note") == "rash")
    page.context.close()


def audit_toast_countdown(browser, base, noon):
    # The clock runs here (not frozen): the countdown must really count down.
    page = open_app(browser, base, 390, 844, noon, theme="off", freeze=False)
    page.evaluate("() => { setToast(() => 'Timer stopped.', 'op-1', new Date(Date.now() + 2000).toISOString(), false); render(); }")
    shown = page.evaluate("({total:S.toast.total, until:S.toast.until-Date.now(), bar:document.querySelector('.toast .cd').style.animationDuration, text:document.querySelector('.toast .cdn').textContent})")
    check("the Undo countdown and bar end at the server deadline, not later", shown["total"] <= 2100 and shown["until"] <= 2100 and shown["bar"] in ("2000ms", "1999ms", "2001ms") and int(shown["text"].split()[0]) <= 2)
    page.wait_for_timeout(2600)
    after = page.evaluate("({toast:!!document.querySelector('.toast'), status:document.querySelector('#shell-status').innerText})")
    check("when Undo ends the toast goes and a separate success message stays", not after["toast"] and "Timer stopped." in after["status"])
    page.evaluate("() => { S.pendingOps['op-p'] = {label: 'x', context: {}}; setToast(() => t('stopPending'), 'op-p', new Date(Date.now() + 1500).toISOString(), true); render(); }")
    before = "Undo" in page.locator(".toast").inner_text()
    page.wait_for_timeout(2200)
    gone = page.evaluate("({toast:document.querySelector('.toast')?.innerText||'', pending:!!S.pendingOps['op-p']})")
    check("a pending stop toast ends at the Undo deadline while polling continues", before and "Undo" not in gone["toast"] and gone["pending"])
    page.evaluate("() => { delete S.pendingOps['op-p']; S.message = ''; }")
    page.evaluate("() => { setToast(() => 'Timer stopped.', 'op-2', new Date(Date.now() + 10000).toISOString(), false); render(); }")
    first = page.locator(".toast .cdn").inner_text()
    page.wait_for_timeout(2300)
    later = page.locator(".toast .cdn").inner_text()
    n = lambda text: int(re.findall(r"\d+", text)[0])
    check("the Undo toast shows a visible countdown that counts down", re.fullmatch(r"\d+ s", first) and n(later) <= n(first) - 2 and page.locator(".toast .cd").count() == 1)
    page.context.close()


def audit_details_target(browser, base, noon):
    page = open_app(browser, base, 390, 844, noon, theme="off", mode="race")
    page.locator('.tile[data-act="open-dia"]').click()
    save_diaper(page, "W")  # R4: pick the kind, then Save diaper
    page.get_by_role("button", name="Add details").click()
    check("Add details opens the entry this write created, not another adult's diaper saved at the same time", page.evaluate("S.sheet && S.sheet.id") == "new-1")
    page.context.close()
    page = open_app(browser, base, 390, 844, noon, theme="off", mode="recover")
    page.locator('.tile[data-act="open-dia"]').click()
    save_diaper(page, "B")  # R4: pick the kind, then Save diaper
    page.wait_for_timeout(1500)
    offered = page.get_by_role("button", name="Add details").count() == 1
    if offered:
        page.get_by_role("button", name="Add details").click()
    check("after error recovery (reply lost, then the operation is checked) Add details is still offered", offered and page.evaluate("S.sheet && S.sheet.id") == "new-1")
    page.context.close()
    page = open_app(browser, base, 390, 844, noon, theme="off", mode="pending")
    page.locator('.tile[data-act="open-dia"]').click()
    save_diaper(page, "D")  # R4: pick the kind, then Save diaper
    page.wait_for_timeout(2500)  # the app polls the pending save after 0.7 s
    offered = page.get_by_role("button", name="Add details").count() == 1
    if offered:
        page.get_by_role("button", name="Add details").click()
    check("a save that finishes after polling still offers Add details for the saved entry", offered and page.evaluate("S.sheet && S.sheet.id") == "new-1")
    page.context.close()


def audit_edit_warning(browser, base, noon):
    for lang, text in (("en", "Call the pediatrician"), ("es", "Llame al pediatra")):
        page = open_app(browser, base, 390, 844, noon, theme="off", lang=lang)
        page.evaluate("act('edit', 'e3')")
        page.locator("#f-valueCol").select_option("yellow")
        quiet = page.locator("[data-col-warn] .warn").count() == 0
        shown = []
        for color in ("pale", "black", "red"):
            page.locator("#f-valueCol").select_option(color)
            shown.append(text in page.locator("[data-col-warn]").inner_text())
        page.locator("#f-valueCol").select_option("brown")
        check(f"{lang}: the edit sheet shows the pediatrician warning for pale, black and red stool only", quiet and all(shown) and page.locator("[data-col-warn] .warn").count() == 0)
        page.context.close()


def audit_storage_and_focus(browser, base, noon):
    page = open_app(browser, base, 390, 844, noon, theme=None, broken_storage=True)
    open_settings(page)  # R3: the Dim screen choice lives on Settings
    group = page.get_by_role("group", name="Dim screen")
    group.get_by_role("button", name="On").click()
    on = page.evaluate("document.documentElement.dataset.theme")
    group.get_by_role("button", name="Off").click()
    off = page.evaluate("document.documentElement.dataset.theme")
    check("with browser storage blocked, On and Off still switch the theme for the page", on == "dim" and off == "light" and page.locator('[data-arg="off"]').get_attribute("aria-pressed") == "true")
    page.context.close()
    page = open_app(browser, base, 390, 844, noon, theme="off")
    page.locator('[data-act="open-more"]').click()
    page.get_by_role("button", name="Medicine").click()
    page.get_by_role("button", name="Add note").click()
    page.wait_for_function("document.activeElement && document.activeElement.id === 'f-medNote'")
    check("Add note moves focus to the note field it opened, not the first field in the sheet", page.evaluate("document.activeElement.id") == "f-medNote")
    page.context.close()


def audit_dock_and_targets(browser, base, noon):
    run = {"id": "run-1", "kind": "feed", "side": "L", "by": "Rowan", "startedAt": (noon - timedelta(minutes=5)).isoformat(), "t0": mx_minutes(noon) - 5}
    page = open_app(browser, base, 390, 844, noon, theme="off", run=run)
    dock = page.evaluate("""() => { const ink=getComputedStyle(document.documentElement).getPropertyValue('--lilac').trim(); const probe=document.createElement('i'); probe.style.color=ink; document.body.append(probe); const inkRgb=getComputedStyle(probe).color; probe.remove(); const stop=document.querySelector('.dock [data-act=stop]');
        return {stop:getComputedStyle(stop).backgroundColor, ink:inkRgb, stopW:stop.getBoundingClientRect().width, buttons:document.querySelectorAll('.dock button').length, switches:document.querySelectorAll('.main .dock [data-act=switch], .main .dock [data-act=switch-earlier]').length, label:stop.textContent.trim()}}""")
    check("Round 3: the Home dock holds one solid lilac Stop feed button and no Switch buttons", dock["stop"] == dock["ink"] and dock["buttons"] == 1 and dock["switches"] == 0 and dock["label"] == "Stop feed" and dock["stopW"] >= 340)
    page.locator('.run-card [data-act="open-feed"]').click()
    pair = page.evaluate("""() => { const form=document.querySelector('[data-sheet] .sheet'), stop=form.querySelector('[data-act="stop"]'), links=[...form.querySelectorAll('[data-act="switch"]')], f=form.getBoundingClientRect(), s=stop.getBoundingClientRect(); return {inner:f.width-32, stopW:s.width, stopLeft:s.left-f.left, links:links.length, tall:links.every(l=>l.getBoundingClientRect().height>=44)}}""")
    check("Running-feed form keeps the Switch links (44px tall) and a full-width Stop (round 3: the links replace the two Switch buttons)", pair["links"] >= 2 and pair["tall"] and abs(pair["stopW"] - pair["inner"]) < 1 and abs(pair["stopLeft"] - 16) < 1)
    page.context.close()
    page = open_app(browser, base, 390, 844, noon, theme="off", development=True)
    page.wait_for_function("S.developmentBatch?.status==='ready'")
    for _ in range(20):
        if page.locator('.insight a').count():
            break
        page.locator('[data-act=fact-next]').click()
    page.locator('[data-act="open-settings"]').click()  # The portrait picker moved into Settings (R3).
    portrait_height = page.evaluate("document.querySelector('.portrait-upload').getBoundingClientRect().height")
    page.locator('[data-sheet] [data-act="cancel"]').click()
    heights = page.evaluate("""() => ({links:[...document.querySelectorAll('.insight a')].map(a=>a.getBoundingClientRect().height)})""")
    check("Add portrait and the fact source link are at least 44px tall", portrait_height >= 44 and heights["links"] and all(h >= 44 for h in heights["links"]))
    scale = page.evaluate("""() => { const px=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize); return [px('.fact-actions .text-link'), px('.fact-body'), px('.insight h2'), px('.top h1')]}""")
    check("Home keeps 16px fact links and body, an 18px fact heading and a 24px name (round 2 header)", scale == [16, 16, 18, 24])
    page.context.close()


def audit_labels(browser, base, noon):
    for lang, want in (("en", ["Bigger buttons at night", "Reminder", "Not connected"]), ("es", ["Botones grandes de noche", "Programar un recordatorio", "No conectado"])):  # want[1] is the Reminder row, hidden on purpose (D4)
        page = open_app(browser, base, 390, 844, noon, theme="off", lang=lang)
        open_settings(page)
        night = page.locator('[data-setting="night"]').inner_text().strip()
        care = page.locator('[data-sheet] [data-act="open-care"]').inner_text().strip()  # R3: Care connection moved from More to Settings
        close_settings(page)
        page.locator('[data-act="open-more"]').click()
        rows = page.locator("[data-sheet] .nav-row").all_inner_texts()
        check(f"{lang}: Night rules and Care labels say what they do, and the More list has no Reminder row (D4)", night == want[0] and want[1] not in [r.strip() for r in rows] and care == want[2])
        page.context.close()


def audit_gallery_controls(browser, base, noon):
    page = open_app(browser, base, 390, 844, noon, theme="off")
    page.locator('[data-act="open-settings"]').click()  # The duty change moved into Settings (R3).
    duty = page.locator('[data-sheet] [data-act="duty"]')
    check("Settings offers a visible duty control", duty.count() == 1 and duty.is_visible())
    if duty.count():
        duty.click()
        check("the Settings duty control opens the existing duty form", page.locator('[data-sheet][data-kind="duty"]').count() == 1)
        page.locator('[data-sheet] [data-act="cancel"]').click()
    if page.locator("[data-sheet]").count():
        page.locator('[data-sheet] [data-act="cancel"]').click()  # the duty form returns to Settings; leave Settings too
    navigate(page, "log")
    # R5 (look match): chips replace the filter list, and the search opens from the title bar. Clear stays with the search; the All chip resets the filter.
    check("Timeline hides the search field and Clear until the search button is used", page.locator('[data-fid="search"]').count() == 0 and page.locator('[data-act="clear-filter"]').count() == 0)
    page.locator('[data-act="search-toggle"]').click()
    check("Timeline hides Clear until a search is typed", page.locator('[data-fid="search"]').is_visible() and page.locator('[data-act="clear-filter"]').count() == 0)
    page.locator('[data-fid="search"]').fill("no match")
    # R5 (look match, round 3): Clear is gone; the search button turns into a close button, and closing empties the search.
    page.locator('[data-act="search-toggle"]').click()
    check("the close button shuts the Timeline search and empties it", page.locator('[data-fid="search"]').count() == 0 and page.evaluate("S.search") == "" and page.locator('[data-act="clear-filter"]').count() == 0)
    page.locator('[data-act="filter"][data-arg="sleep"]').click()
    check("the Sleep chip filters the Timeline", page.locator('[data-act="filter"][data-arg="sleep"]').get_attribute("aria-pressed") == "true" and page.evaluate("S.filter") == "sleep")
    page.locator('[data-act="filter"][data-arg="all"]').click()
    check("the All chip resets the Timeline filter", page.locator('[data-act="filter"][data-arg="all"]').get_attribute("aria-pressed") == "true" and page.evaluate("S.filter") == "all")
    open_settings(page)
    check("Settings contains the signed-in person's name", page.locator(".settings-card .account-name").inner_text() == "Rowan")
    close_settings(page)
    header = page.locator(".screen-top").bounding_box()
    check("Screen header holds only Home, the title and the search button, in one row", page.locator(".screen-top > *").count() == 3 and header["height"] <= 72)
    # look match (2026-11-11): the screen header is the mockup's title bar: 24 px title, a drawn chevron on a 48 px outlined Home button
    bar = page.evaluate("""() => {const top=document.querySelector('.screen-top'),b=top.querySelector('button'),h=top.querySelector('h1');
      return {shared:top.classList.contains('bar'),title:getComputedStyle(h).fontSize,drawn:!!b.querySelector('svg.glyph .ln'),typed:b.textContent.includes('\\u2039'),
        height:Math.round(b.getBoundingClientRect().height),outline:getComputedStyle(b).borderTopWidth}}""")
    check("Screen header is the shared title bar: 24 px title, drawn chevron, 48 px outlined Home button",
          bar["shared"] and bar["title"] == "24px" and bar["drawn"] and not bar["typed"] and bar["height"] == 48 and bar["outline"] == "2px")
    navigate(page, "home")
    page.locator('[data-act="open-more"]').click()
    page.set_viewport_size({"width":320,"height":740})
    more_header = page.locator("[data-sheet] header.bar").bounding_box()
    check("More keeps Home and the title in one row at 320px", more_header["height"] <= 72 and page.locator("[data-sheet] .settings-card").count() == 0)
    page.locator('[data-sheet] [data-act="cancel"]').click()
    page.locator('[data-act="open-settings"]').click()
    settings_header = page.locator("[data-sheet] header.bar").bounding_box()
    check("Settings keep Home and the title in one row at 320px and hold the settings card", settings_header["height"] <= 72 and page.locator("[data-sheet] .settings-card").count() >= 1)
    page.locator('[data-sheet] [data-act="cancel"]').click()
    page.locator('[data-act="open-more"]').click()
    page.set_viewport_size({"width":390,"height":844})
    page.locator('[data-act="open-note"]').click()
    check("a log form carries no Settings link; Settings is its own screen", page.locator("[data-sheet]").get_by_text("Settings", exact=True).count() == 0 and page.locator(".settings-card").count() == 0)
    check("Note offers an Add photo button instead of a visible file input", page.get_by_role("button", name="Add photo", exact=True).count() == 1 and not page.locator('[data-fid="photo"]').is_visible())
    page.context.close()


def audit_gate_round2(browser, base, noon):
    # Design review of 2026-11-09: the title, dock, chips and night setting keep the fixes the review asked for.
    page = open_app(browser, base, 390, 844, noon, theme="off")
    offsets = []
    for width in (390, 1440):
        page.set_viewport_size({"width": width, "height": 900})
        for tab in ("log", "charts"):
            navigate(page, tab)
            offsets.append(page.evaluate("""() => {const top=document.querySelector('.screen-top'),r=document.createRange();r.selectNodeContents(top.querySelector('h1'));
              const a=r.getBoundingClientRect(),b=top.getBoundingClientRect();return Math.abs((a.left+a.right)/2-(b.left+b.right)/2);}"""))
    check("Timeline and Charts center the title on the column, as the sheets do", max(offsets) <= 2)
    navigate(page, "home")
    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("""() => {const t0=nowM()-5,at=new Date().toISOString();S.run={id:'timer-feed',side:'L',t0,startedAt:at,by:'Rowan'};
      S.sleepRun={id:'timer-nap',nap:true,t0,startedAt:at,by:'Rowan'};render();}""")
    gaps = page.evaluate("""() => {const d=document.querySelector('.main .dock'),f=d.querySelector('.feed-stop'),n=d.querySelector('.sleep-stop');return {text:d.querySelectorAll('.text-link').length,buttons:d.querySelectorAll('button').length,gap:n.getBoundingClientRect().top-f.getBoundingClientRect().bottom};}""")
    check("with a feed and a sleep both running, the Home dock holds one Stop for each, 12 px or more apart, and no Switched earlier? link", gaps["text"] == 0 and gaps["buttons"] == 2 and gaps["gap"] >= 12)
    page.context.close()
    page = open_app(browser, base, 390, 844, noon, theme="off", lang="es")
    page.evaluate("S.sheet=null;act('open-feed');act('ftab','pump');render()")
    chips = page.evaluate("""() => [...document.querySelectorAll('[data-sheet] .seg>.chip')].map(c=>{const n=[...c.childNodes].find(x=>x.nodeType===3&&x.textContent.trim()),r=document.createRange();r.selectNodeContents(n);
      const t=r.getBoundingClientRect(),b=c.getBoundingClientRect(),k=c.querySelector('svg.glyph'),kb=getComputedStyle(k).display==='none'?null:k.getBoundingClientRect();
      return {gap:kb?t.left-kb.right:8,pad:Math.min((kb||t).left-b.left,b.right-t.right),over:c.scrollWidth>c.clientWidth+1};})""")
    check("Spanish feed chips keep the check apart from the label and padding inside the border at 390 px", len(chips) == 3 and all(c["gap"] >= 6 and c["pad"] >= 12 and not c["over"] for c in chips))
    page.evaluate("S.sheet=null;render()")
    open_settings(page)
    night = page.locator('.settings-card [data-setting="night"]')
    off = night.evaluate("b => b.classList.contains('chip') && b.getAttribute('aria-pressed') === 'false' && getComputedStyle(b.querySelector('svg.glyph')).display === 'none'")
    page.evaluate("S.night=true;render()")
    on = night.evaluate("b => b.getAttribute('aria-pressed') === 'true' && getComputedStyle(b.querySelector('svg.glyph')).display !== 'none'")
    check("Bigger buttons at night is a chip that shows its check only when on", off and on)
    page.context.close()


def guarded(audit, *args):
    """An audit that crashes (for example a missing element) counts as one failure instead of ending the run."""
    try:
        audit(*args)
    except Exception as error:  # noqa: BLE001
        check(f"{audit.__name__} ran without error ({type(error).__name__})", False)
        print("   " + str(error).splitlines()[0][:160] + " | " + " ".join(l.strip() for l in str(error).splitlines()[1:6])[:300])


def main():
    server, base = start_static_server()
    noon = datetime.fromisoformat("2026-11-03T12:00:00-06:00")
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            guarded(audit_left_right_colours, browser, base, noon)
            guarded(audit_tiles_visible, browser, base, noon)
            guarded(audit_default_language, browser, base, noon)
            guarded(audit_order_and_headings, browser, base, noon)
            guarded(audit_theme, browser, base, noon)
            guarded(audit_sleep_default, browser, base)
            guarded(audit_diaper_tap, browser, base, noon)
            guarded(audit_toast_countdown, browser, base, noon)
            guarded(audit_details_target, browser, base, noon)
            guarded(audit_edit_warning, browser, base, noon)
            guarded(audit_storage_and_focus, browser, base, noon)
            guarded(audit_dock_and_targets, browser, base, noon)
            guarded(audit_labels, browser, base, noon)
            guarded(audit_gate_round2, browser, base, noon)
            guarded(audit_gallery_controls, browser, base, noon)
            browser.close()
    finally:
        server.shutdown()
    print(f"{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
