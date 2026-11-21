"""Focused mock-server checks for confirmed writes and retry behavior."""
import os
import re
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()
import json
import subprocess
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
from check_support import browser_engine, launch_browser, start_static_server

from forms_support import OPEN_DETAILS, save_diaper, set_period, stop_click, pick_setting
from check_ui import navigate, open_settings, close_settings, unlock
from check_feed_ranges import audit_feed_ranges, open_feed_adjustments, type_clock
from check_typing import audit_redraw_typing

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT.parents[1] / ".evidence"
PASS = FAIL = 0
MX = ZoneInfo("America/Mexico_City")
# A running feed offers two Switch buttons: to the other side and to Bottle. These checks mean the side one.
SIDE_SWITCH = '[data-sheet] [data-act="switch"]:not([data-arg="bottle"])'


def instant(day_iso, hh, mm):
    """The UTC instant of a household wall-clock time, worked out without app code."""
    y, mo, d = map(int, day_iso.split("-"))
    return datetime(y, mo, d, hh, mm, tzinfo=MX).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def check(name, ok):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name}")


def capture_sheet(page, name):
    for width, height in [(320, 740), (390, 844)]:
        page.set_viewport_size({"width": width, "height": height})
        metrics = page.evaluate("() => {const targets=[...document.querySelectorAll('[data-sheet] button:not([disabled]),[data-sheet] input:not([type=hidden]),[data-sheet] select,[data-sheet] textarea')].filter(el=>!el.hidden);return {box:document.querySelector('[data-sheet]')?.getBoundingClientRect().toJSON(),doc:document.documentElement.scrollWidth,view:innerWidth,minH:targets.length?Math.min(...targets.map(el=>el.getBoundingClientRect().height)):44,minW:targets.length?Math.min(...targets.map(el=>el.getBoundingClientRect().width)):44};}")
        box = metrics["box"]
        fits = box is not None and box["x"] >= 0 and box["x"] + box["width"] <= width + 1 and metrics["doc"] <= metrics["view"] and metrics["minH"] >= 44 and metrics["minW"] >= 44
        if not fits:
            print("layout evidence:", name, width, box, metrics)
        check(f"{name} fits {width}px with 44px controls", fits)
        EVIDENCE.mkdir(exist_ok=True)
        page.screenshot(path=str(EVIDENCE / f"little-days-runtime-{name}-{width}.png"))


def capture_all_sheets(page, language):
    def dismiss():
        page.locator('[data-sheet] [data-act="cancel"]').click()
        discard = page.locator('[data-sheet] [data-act="discard"]')
        if discard.count():
            discard.click()

    def opened(selector, name):
        page.locator(selector).click()
        if name in {"solids", "tummy", "bath", "moment", "note", "handoff", "duty"}:
            expected = "Nota" if language == "es" else "Note"
            labels = [text.strip() for text in page.locator("[data-sheet] label").all_inner_texts()]
            check(f"{name}-{language} shows a visible Notes label", any(expected.lower() in text.lower() for text in labels))
        capture_sheet(page, f"{name}-{language}")
        dismiss()
    opened('.tile[data-act="open-feed"]', "feed-breast")
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    capture_sheet(page, f"feed-bottle-{language}")
    dismiss()
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="pump"]').click()
    capture_sheet(page, f"feed-pump-{language}")
    page.locator('[data-act="ftab"][data-arg="breast"]').click()
    open_feed_adjustments(page)
    page.locator('[data-sheet] [data-act="manual"]').click()
    capture_sheet(page, f"feed-manual-{language}")
    dismiss()
    opened('.tile[data-act="open-sleep"]', "sleep-timer")
    page.locator('.tile[data-act="open-sleep"]').click()
    open_feed_adjustments(page)
    page.locator('[data-sheet] [data-act="manual"]').click()
    capture_sheet(page, f"sleep-manual-{language}")
    dismiss()
    opened('.tile[data-act="open-dia"]', "diaper")
    page.locator('[data-act="open-more"]').click()
    capture_sheet(page, f"more-{language}")
    dismiss()
    for act, name in [("open-med", "medicine"), ("open-temp", "temperature"), ("open-note", "note"), ("open-growth", "growth"), ("open-handoff", "handoff")]:
        page.locator('[data-act="open-more"]').click()
        opened(f'[data-act="{act}"]', name)
    # D4: reminders are stored but never delivered, so More has no Reminder row. The form code stays and still opens through act().
    page.locator('[data-act="open-more"]').click()
    check(f"more-{language} has no reminder row (D4)", page.locator('[data-act="open-reminder"]').count() == 0)
    page.evaluate("act('open-reminder')")
    capture_sheet(page, f"reminder-{language}")
    dismiss()
    for what, name in [("solids", "solids"), ("tummy", "tummy"), ("bath", "bath"), ("mile", "moment")]:
        page.locator('[data-act="open-more"]').click()
        page.locator(f'[data-act="quick"][data-arg="{what}"]').click()
        capture_sheet(page, f"{name}-{language}")
        dismiss()
    page.locator('[data-act="open-settings"]').click()  # The duty change moved into Settings (R3).
    page.locator('[data-sheet] [data-act="duty"]').click()
    capture_sheet(page, f"duty-{language}")
    dismiss()


def audit_failed_sleep_save(page, state):
    state.update({"run":None,"pumpRun":None,"sleepRun":{"id":"25","t0":600,"by":"Sage"},"entries":[],"pendingOperations":[]})
    state["preferences"]["lang"]="en"
    posts=[]
    def saved_diaper_failed_sleep(route):
        body=route.request.post_data_json
        posts.append(body)
        state["entries"]=[{"id":"changes:partial","type":"diaper","kind":"W","t":600,"by":"Rowan"}]
        route.fulfill(json={"status":"failed","operationId":body["operationId"],"eventSaved":True,"error":"The event saved. Sleep was not saved. Check the sleep times, then end sleep again."})
    page.route("**/api/events",saved_diaper_failed_sleep)
    try:
        page.reload()
        page.locator('.tile[data-act="open-dia"]').click()
        save_diaper(page)
        page.wait_for_function("!S.busy")
        closed=page.locator('[data-sheet]').count()==0
        check("a saved diaper with a rejected sleep closes its form instead of offering another diaper save",closed)
        if closed:
            page.wait_for_function("S.entries.some(e=>e.id==='changes:partial')")
        check("the saved diaper appears once while sleep stays available for correction",len(posts)==1 and page.evaluate("S.entries.filter(e=>e.id==='changes:partial').length===1 && S.sleepRun?.id==='25'"))
        check("the partial save explains that sleep still needs attention",'Sleep was not saved' in page.locator('[data-status]').inner_text())
    finally:
        page.unroute("**/api/events",saved_diaper_failed_sleep)


def audit_start_times(page, state):
    """Started earlier? and Change start send the typed time, and a diaper takes one typed time."""
    day = "2026-11-07"
    page.clock.set_fixed_time(instant(day, 22, 0))  # 10:00 PM in Mexico City
    posts = []

    def timers(route):
        req = route.request
        body = req.post_data_json
        posts.append((req.url, body))
        if req.url.endswith("/api/timers"):
            state["sleepRun"] = {"id": "51", "nap": True, "t0": 1295, "startedAt": body.get("start"), "by": "Rowan"}
        elif req.url.endswith("/start-time"):
            start = datetime.fromisoformat(body["start"])
            timer_id = req.url.rsplit("/", 2)[-2]
            run = next(state[key] for key in ("run", "sleepRun", "pumpRun") if state.get(key) and state[key]["id"] == timer_id)
            run.update(startedAt=body["start"], t0=(start-datetime.fromisoformat(instant(day, 0, 0))).total_seconds()/60)
        route.fulfill(json={"status": "saved", "operationId": body.get("operationId"), "state": state})

    def events(route):
        body = route.request.post_data_json
        posts.append((route.request.url, body))
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})

    def start_button():
        return page.locator('[data-sheet] [data-act="sleep-start"][data-arg="nap"]')

    def hint():
        box = page.locator("[data-early-hint]")
        return box.inner_text() if box.count() and box.is_visible() else ""

    open_settings(page)
    pick_setting(page, "lang", "en")
    page.wait_for_function("S.lang === 'en'")
    close_settings(page)
    page.route("**/api/timers**", timers)
    page.route("**/api/events", events)
    state.update({"run": None, "sleepRun": None, "pumpRun": None, "entries": []})
    page.evaluate("() => {S.lang='en';S.run=null;S.sleepRun=null;S.pumpRun=null;S.sheet=null;act('open-sleep');act('nap','nap');render();}")
    check("Started earlier? stays hidden until it is tapped", page.locator('[data-sheet] [data-fid="earlyClock"]').count() == 0 and page.locator('[data-sheet] [data-act="early"]').count() == 1)
    page.locator('[data-sheet] [data-act="early"]').evaluate("el => el.click()")
    page.locator('[data-fid="earlyClock"]').fill("9:00")
    page.locator('[data-fid="earlyPeriod"]').select_option("AM")
    check("a start over 12 hours ago turns Start sleep off and says why", page.locator('[data-sheet] [data-act="sleep-start"]:disabled').count() == 1 and hint() == "Choose a time in the last 12 hours.")
    page.locator('[data-fid="earlyPeriod"]').select_option("PM")
    page.locator('[data-fid="earlyClock"]').fill("9:35")
    check("a start 25 minutes ago turns Start sleep on again", page.locator('[data-sheet] [data-act="sleep-start"]:enabled').count() == 1 and hint() == "")
    start_button().click()
    page.wait_for_function("S.sheet === null")
    sent = posts[-1] if posts else ("", {})
    check("Started earlier? sends the typed start with the new sleep timer", sent[0].endswith("/api/timers") and sent[1].get("kind") == "sleep" and sent[1].get("start") == instant(day, 21, 35))

    page.evaluate("() => {S.sheet=null;act('open-sleep');render();}")
    page.locator('[data-sheet] [data-act="change-start"]').click()
    check("Change start shows the timer's current start", page.locator('[data-fid="earlyClock"]').input_value() == "9:35" and page.locator('[data-fid="earlyPeriod"]').input_value() == "PM")
    save_start = page.locator('[data-sheet] [data-act="save"]')
    assert save_start.count() == 1, "A running nap needs Save in the header while its start time is edited"
    check("the nap correction names its action Save start", save_start.inner_text() == "Save start")
    page.locator('[data-fid="earlyClock"]').fill("9:00")
    page.locator('[data-fid="earlyPeriod"]').select_option("AM")
    check("an old start gives the same specific reason beside Save and the clock", save_start.is_disabled() and page.locator('[data-save-hint]').inner_text() == hint() == "Choose a time in the last 12 hours.")
    page.locator('[data-fid="earlyPeriod"]').select_option("PM")
    page.locator('[data-fid="earlyClock"]').fill("invalid")
    check("a running nap's header Save rejects an invalid start", save_start.is_disabled() and bool(hint()))
    page.locator('[data-fid="earlyClock"]').fill("9:30")
    check("a valid running nap start enables the header Save", save_start.is_enabled())
    check("an unsaved nap start correction has draft protection", page.evaluate("hasDraft(S.sheet)"))
    save_start.click()
    page.wait_for_function("(S.message || '').startsWith('Start changed')")
    sent = posts[-1]
    check("Change start sends the typed start for the running timer", sent[0].endswith("/api/timers/51/start-time") and sent[1].get("start") == instant(day, 21, 30))
    check("Change start confirms the new start time", "Start changed to 9:30 PM." in page.locator("[data-status]").inner_text())
    check("Change start returns to the running nap view", page.evaluate("S.sheet?.kind === 'sleep' && !S.sheet.early"))
    check("saving the start keeps the same nap running without a stop request", page.evaluate("S.sleepRun?.id === '51' && Math.round(timerElapsed(S.sleepRun)) === 30") and not any(url.endswith('/stop') for url, _ in posts))
    page.locator('[data-sheet] [data-act="cancel"]').click()
    check("a saved clock-only nap correction closes without Discard draft", page.locator('[data-sheet]').count() == 0)
    if page.locator('[data-sheet] [data-act="discard"]').count():
        page.locator('[data-sheet] [data-act="discard"]').click()
    page.reload()
    page.wait_for_function("S.auth === 'ready' && S.sleepRun?.id === '51'")
    check("a reload keeps the corrected start on the running nap", page.evaluate("S.sleepRun.startedAt") == instant(day, 21, 30))
    page.locator('[data-act="open-sleep"]').first.click()
    page.clock.set_fixed_time(instant(day, 22, 1))
    page.wait_for_function("document.querySelector('[data-sheet] [data-live=sleep]')?.textContent.replaceAll('\\u00a0',' ') === '31 m 00 s'")
    check("the corrected nap timer continues to count", page.locator('[data-sheet] [data-live="sleep"]').inner_text().replace("\u00a0", " ") == "31 m 00 s")
    page.clock.set_fixed_time(instant(day, 22, 0))
    page.evaluate("() => {S.sheet.noteOpen=true;render();}")
    page.locator('[data-fid="eventNote"]').fill("Woke once")
    page.locator('[data-sheet] [data-act="change-start"]').click()
    page.locator('[data-fid="earlyClock"]').fill("9:30")
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function("!S.busy && !S.sheet.early")
    check("a saved start preserves an unrelated unsaved note", page.evaluate("S.sheet.note === 'Woke once' && hasDraft(S.sheet)"))
    page.locator('[data-sheet] [data-act="cancel"]').click()
    check("closing after a start save still protects an unsaved note", page.locator('[data-sheet] [data-act="discard"]').count() == 1)
    page.locator('[data-sheet] [data-act="keep"]').click()
    page.locator('[data-sheet] [data-act="change-start"]').click()
    page.locator('[data-fid="earlyClock"]').fill("invalid")
    running_nap = state["sleepRun"]
    state["sleepRun"] = None
    page.evaluate("() => syncFamily()")
    check("another adult ending the nap clears its start edit and enables a new nap", page.evaluate("S.sheet.early !== 'sleep' && S.sleepRun === null") and page.locator('[data-sheet] [data-act="sleep-start"]:enabled').count() == 1)
    state["sleepRun"] = running_nap
    page.evaluate("() => syncFamily()")
    guarded = page.evaluate("""() => {
      const box = () => document.querySelector('[data-fid="earlyClock"]')?.value;
      S.sheet=null;S.sleepRun={...S.sleepRun,t0:nowM()-780};act('open-sleep');act('change-start','sleep');render();const old=box();
      const oldHint=document.querySelector('[data-save-hint]')?.textContent;
      const grants=S.permissions.resources.timers;S.permissions.resources.timers={...grants,change:false,delete:true};S.sheet=null;act('open-sleep');render();
      const noChange=document.querySelectorAll('[data-sheet] [data-act="change-start"]').length;
      S.permissions.resources.timers={...grants,change:true,delete:false};render();
      const changeOnly=document.querySelectorAll('[data-sheet] [data-act="change-start"]').length;
      S.permissions.resources.timers=grants;S.sheet=null;render();return {old,oldHint,noChange,changeOnly};
    }""")
    check("a timer started over 12 hours ago opens Change start with an empty box", guarded["old"] == "")
    check("an empty old start names the clock format beside Save", guarded["oldHint"] == "Enter a time like 9:30.")
    check("Change start follows the timer change grant", guarded["noChange"] == 0 and guarded["changeOnly"] == 1)

    for kind, key, tab in [("feed", "run", "breast"), ("pump", "pumpRun", "pump")]:
        state.update({"run": None, "sleepRun": None, "pumpRun": None})
        state[key] = {"id": "52", "kind": kind, "side": "L", "t0": 1295, "startedAt": instant(day, 21, 35), "by": "Rowan"}
        page.evaluate("args => {loadServerState(args.state);S.sheet=null;act('open-feed');act('ftab',args.tab);act('change-start',args.kind);render();}", {"state": state, "tab": tab, "kind": kind})
        page.locator('[data-fid="earlyClock"]').fill("9:20")
        page.locator('[data-sheet] [data-act="save-start"]').click()
        page.wait_for_function("!S.busy && !S.sheet.early")
        check(f"a clock-only {kind} correction clears its draft", page.evaluate("!hasDraft(S.sheet)"))
        page.evaluate("() => {S.sheet.noteOpen=true;render();}")
        page.locator('[data-fid="eventNote"]').fill("Keep this note")
        if kind == "pump":
            page.locator('[data-fid="pL"]').fill("25")
        page.locator(f'[data-sheet] [data-act="change-start"][data-arg="{kind}"]').click()
        page.locator('[data-fid="earlyClock"]').fill("9:15")
        page.locator('[data-sheet] [data-act="save-start"]').click()
        page.wait_for_function("!S.busy && !S.sheet.early")
        check(f"a {kind} correction preserves unrelated draft fields", page.evaluate("S.sheet.note === 'Keep this note' && hasDraft(S.sheet) && (S.sheet.tab !== 'pump' || S.sheet.pL === 25)"))

    state.update({"run": None, "pumpRun": None})
    page.evaluate("() => {S.run=null;S.pumpRun=null;}")

    # A refused, lost or unconfirmed Change start keeps the typed time and never leaves the form stuck.
    reply = {"start": "refuse", "check": "fail"}

    def start_time(route):
        posts.append((route.request.url, route.request.post_data_json))
        if reply["start"] == "refuse":
            return route.fulfill(status=400, json={"error": "This timer is stopping. Edit the saved entry instead."})
        route.abort()

    def check_op(route):
        if reply["check"] == "fail":
            return route.abort()
        route.fulfill(json={"status": "saved", "operationId": route.request.url.rsplit("/", 1)[-1]})

    page.route("**/api/timers/51/start-time", start_time)
    page.route("**/api/operations/*", check_op)
    page.evaluate(f"() => {{S.sleepRun={{id:'51',nap:true,t0:1295,startedAt:'{instant(day, 21, 35)}',by:'Rowan'}};S.sheet=null;act('open-sleep');act('change-start','sleep');render();}}")
    page.locator('[data-fid="earlyClock"]').fill("9:30")
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function("(S.message || '').includes('stopping')")
    box = page.locator('[data-fid="earlyClock"]')
    check("a refused Change start keeps the typed time to fix or send again", box.count() == 1 and box.input_value() == "9:30")
    reply["start"] = "lose"
    page.evaluate("() => {act('change-start','sleep');render();}")
    page.locator('[data-fid="earlyClock"]').fill("9:30")
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function("!!S.retryAction && !S.busy")
    offered = page.locator('[data-sheet] [data-act="change-start"], [data-sheet] [data-act="save-start"]').count()
    check("an unconfirmed Change start offers Check again and no second change", offered == 0 and page.locator('[data-act="retry-write"]').count() == 1)
    reply["check"] = "saved"
    page.clock.set_fixed_time(instant("2026-11-08", 0, 5))  # confirmed after midnight
    page.locator('[data-act="retry-write"]').evaluate("el => el.click()")
    page.wait_for_function("(S.message || '').startsWith('Start changed')")
    moved = page.evaluate("() => Math.round(timerElapsed(S.sleepRun))")
    check("a confirmation without fresh state, even after midnight, shows the new start", moved == 155 and page.locator('[data-sheet] [data-act="change-start"]').count() == 1)
    page.clock.set_fixed_time(instant(day, 22, 0))

    def unconfirmed_feed_change():
        reply.update({"start": "lose", "check": "fail"})
        page.evaluate(f"() => {{S.sleepRun=null;S.run={{id:'51',side:'L',t0:1295,startedAt:'{instant(day, 21, 35)}',by:'Rowan'}};S.sheet=null;act('open-feed');act('ftab','breast');act('change-start','feed');render();}}")
        page.locator('[data-fid="earlyClock"]').fill("9:30")
        page.locator('[data-sheet] [data-act="save-start"]').evaluate("el => el.click()")
        page.wait_for_function("!!S.retryAction && !S.busy")
        page.evaluate("() => {act('ftab','pump');render();}")

    unconfirmed_feed_change()
    page.locator('[data-sheet] [data-act="early"]').evaluate("el => el.click()")
    reply["check"] = "saved"
    page.locator('[data-act="retry-write"]').evaluate("el => el.click()")
    page.wait_for_function("(S.message || '').startsWith('Start changed')")
    check("a confirmed feed change keeps a pump start time typed meanwhile", page.locator('[data-fid="earlyClock"]').count() == 1)
    unconfirmed_feed_change()
    page.locator('[data-sheet] [data-act="pumpTimer"]').evaluate("el => el.click()")
    page.wait_for_function("!S.busy")
    change_id = next(body["operationId"] for url, body in reversed(posts) if url.endswith("/start-time"))
    check("a pump start while a feed change is unconfirmed gets its own save ID", posts[-1][0].endswith("/api/timers") and posts[-1][1].get("operationId") != change_id)
    page.evaluate("() => {S.pendingOps={};S.retryAction=null;S.message='';S.run=null;}")
    page.unroute("**/api/timers/51/start-time", start_time)
    page.unroute("**/api/operations/*", check_op)
    page.evaluate("() => {S.sleepRun=null;S.sheet=null;render();}")

    shown = page.evaluate("""() => {
      const count = q => document.querySelectorAll(q).length;
      S.sleepRun=null;S.sheet=null;act('open-feed');render();const breast=count('[data-sheet] [data-act="early"]');
      act('ftab','pump');render();const pump=count('[data-sheet] [data-act="early"]');
      S.run={id:'61',side:'L',t0:0,by:'Rowan'};S.pumpRun={id:'62',t0:0,by:'Rowan'};S.sheet=null;act('open-feed');act('ftab','breast');render();
      const feedRun=count('[data-sheet] [data-act="change-start"][data-arg="feed"]');act('ftab','pump');render();
      const pumpRun=count('[data-sheet] [data-act="change-start"][data-arg="pump"]');
      S.run=null;S.pumpRun=null;S.sheet=null;render();return {breast,pump,feedRun,pumpRun};
    }""")
    if shown != {"breast": 1, "pump": 1, "feedRun": 1, "pumpRun": 1}:
        print("start options:", shown)
    check("feed and pump offer Started earlier? and Change start", shown == {"breast": 1, "pump": 1, "feedRun": 1, "pumpRun": 1})

    page.evaluate("() => {S.sheet=null;act('open-dia');render();}")
    page.locator('[data-fid="manualDate"]').fill(day)
    type_clock(page, "manual", "9:40", "PM")
    typed_diaper = page.evaluate("({timeEdited:S.sheet.timeEdited,hour:S.sheet.hour,minute:S.sheet.minute,period:S.sheet.period})")
    save_diaper(page)
    page.wait_for_function("S.sheet === null")
    sent = posts[-1]
    if sent[1].get("event", {}).get("time") != instant(day, 21, 40):
        print("diaper time evidence:", sent, "typed:", typed_diaper, "expected:", instant(day, 21, 40))
    check("a diaper takes one typed time", sent[0].endswith("/api/events") and sent[1]["event"].get("type") == "diaper" and sent[1]["event"].get("time") == instant(day, 21, 40))
    page.unroute("**/api/timers**", timers)
    page.unroute("**/api/events", events)


def audit_wrong_side(page, state):
    posts = []

    def side(route):
        body = route.request.post_data_json
        posts.append(body)
        state["run"]["side"] = body.get("side")
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})

    state["run"] = {"id": "71", "side": "L", "t0": 1295, "startedAt": instant("2026-11-07", 21, 35), "by": "Rowan"}
    page.evaluate("r => {S.lang='en';S.run=r;S.sheet=null;act('open-feed');act('ftab','breast');render();}", state["run"])
    open_feed_adjustments(page)
    link = page.get_by_role("button", name="Wrong side?", exact=True)
    if not link.count():
        check("Wrong side? sends the chosen side", False)
        check("the dock uses the corrected Switch to side", False)
        state["run"] = None
        page.evaluate("() => {S.run=null;S.sheet=null;render();}")
        return
    page.route("**/api/timers/71/side", side)
    try:
        link.click()
        page.get_by_role("button", name="Right", exact=True).click()
        page.get_by_role("button", name="Save", exact=True).click()
        page.wait_for_function("!S.busy && S.run?.side === 'R'")
        check("Wrong side? sends the chosen side", len(posts) == 1 and posts[0].get("side") == "R" and bool(posts[0].get("operationId")))
        check("the running form uses the corrected Switch to side", page.locator('[data-sheet] [data-act="switch"]').first.text_content().strip() == "Switch to left side")  # round 3: Switch is a link in the running form, not a Home dock button
        page.screenshot(path=str(EVIDENCE / "wrong-side.png"))
    finally:
        page.unroute("**/api/timers/71/side", side)
        state["run"] = None
        page.evaluate("() => {S.run=null;S.sheet=null;render();}")




def audit_switch_time(page, state):
    posts = []

    def switch(route):
        posts.append(route.request.post_data_json)
        if len(posts) == 1:
            route.abort()
        else:
            route.fulfill(json={"status": "saved", "operationId": posts[-1]["operationId"], "state": state})

    def missing(route):
        route.fulfill(status=404, json={"error": "Not found"})

    day = "2026-11-07"
    page.clock.set_fixed_time(instant(day, 22, 0))
    run = {"id": "72", "side": "L", "t0": 1295, "startedAt": instant(day, 21, 35), "by": "Rowan"}
    state["run"] = run
    page.evaluate("r => {S.lang='en';S.run=r;S.sheet=null;render();}", run)
    page.locator('.run-card [data-act="open-feed"]').click()  # round 3: Switched earlier? lives in the running Feed form, not on Home
    open_feed_adjustments(page)
    link = page.get_by_role("button", name="Switched earlier?", exact=True)
    if not link.count():
        check("Switched earlier? sends the typed switch minute", False)
        check("a switch at or before the start keeps Save off", False)
        check("a switch retry sends the same at and operation ID", False)
        state["run"] = None
        page.evaluate("() => {S.run=null;S.sheet=null;render();}")
        return
    page.route("**/api/timers/72/switch", switch)
    page.route("**/api/operations/*", missing)
    try:
        link.first.click()
        clock = page.locator('[data-sheet] [data-fid="earlyClock"]')
        clock.fill("9:35")
        page.locator('[data-fid="earlyPeriod"]').select_option("PM")
        save = page.get_by_role("button", name="Save", exact=True)
        at_start = save.is_disabled()
        clock.fill("9:30")
        check("a switch at or before the start keeps Save off", at_start and save.is_disabled())
        clock.fill("9:55")
        page.screenshot(path=str(EVIDENCE / "switch-earlier.png"))
        save.click()
        page.wait_for_function("!!S.retryAction && !S.busy")
        check("Switched earlier? sends the typed switch minute", len(posts) == 1 and posts[0].get("at") == instant(day, 21, 55))
        page.clock.set_fixed_time(instant(day, 22, 1))
        page.locator('[data-act="retry-write"]').click()
        page.wait_for_function("!S.busy && !S.retryAction")
        check("a switch retry sends the same at and operation ID", len(posts) == 2 and posts[1] == posts[0] and posts[1].get("at") == instant(day, 21, 55))
    finally:
        page.unroute("**/api/timers/72/switch", switch)
        page.unroute("**/api/operations/*", missing)
        state["run"] = None
        page.evaluate("() => {S.run=null;S.sheet=null;S.pendingOps={};S.retryAction=null;render();}")


def review_feed(page, state):
    run = {"id": "73", "side": "L", "t0": 1295, "startedAt": instant("2026-11-07", 21, 35), "by": "Rowan"}
    state["run"] = run
    page.evaluate("r => {S.lang='en';S.tab='home';S.run=r;S.sheet=null;S.pendingSheetOperation=null;S.pendingOps={};S.retryAction=null;S.retrySame=null;act('open-feed');act('ftab','breast');render();}", run)


def audit_review_switch(page, state):
    message = "The side changed on another phone. Check the side and switch again."
    for status in [400, 409]:
        review_feed(page, state)
        state["run"] = {**state["run"], "side": "R"}
        page.route("**/api/timers/73/switch", lambda route: route.fulfill(status=status, json={"error": message}))
        page.locator(SIDE_SWITCH).click()
        page.wait_for_function("!S.busy")
        check(f"F1: refused switch {status} refreshes the dock and keeps the message", page.locator(SIDE_SWITCH).inner_text().strip() == "Switch to left side" and message in page.locator('[data-status]').inner_text())
        page.unroute("**/api/timers/73/switch")

    review_feed(page, state)
    open_feed_adjustments(page)
    page.locator('[data-sheet] [data-act="switch-earlier"]').click()
    page.evaluate("() => {S.run=null;render();}")
    check("F2: an ended feed closes the switch clock and offers Started earlier?", page.locator('[data-sheet] [data-fid="earlyClock"]').count() == 0 and page.get_by_role("button", name="Started earlier?", exact=True).count() == 1)

    review_feed(page, state)
    open_feed_adjustments(page)
    page.get_by_role("button", name="Wrong side?", exact=True).click()
    open_feed_adjustments(page)
    page.locator('[data-sheet] [data-act="change-start"]').click()
    check("F10: Change start closes the side chips", page.locator('[data-sheet] [data-act="correct-side"]').count() == 0)

    review_feed(page, state)
    posts = []

    def switch(route):
        posts.append(route.request.post_data_json)
        if len(posts) == 1:
            route.abort()
        else:
            route.fulfill(json={"status": "saved", "operationId": posts[-1]["operationId"], "state": state})

    page.route("**/api/timers/73/switch", switch)
    page.route("**/api/operations/*", lambda route: route.fulfill(status=404, json={"error": "Not found"}))
    page.locator(SIDE_SWITCH).click()
    page.wait_for_function("!!S.retryAction && !S.busy")
    hidden = page.locator('[data-act="switch-earlier"]').count() == 0
    guarded = page.evaluate("() => {const s=S.sheet;openSwitchTime();return s.early !== 'switch' && !!s._preparedSwitch;}")
    check("F3: a lost plain switch hides and blocks Switched earlier? until retry", hidden and guarded)
    page.locator('[data-act="retry-write"]').click()
    page.wait_for_function("!S.busy && !S.retryAction")
    if not page.locator("[data-sheet]").count():  # the form closed after the retry; Switched earlier? lives in the form (round 3)
        page.locator('.run-card [data-act="open-feed"]').click()
    open_feed_adjustments(page)
    check("F3: the retry keeps its input and restores Switched earlier?", len(posts) == 2 and posts[0] == posts[1] and page.locator('[data-sheet] [data-act="switch-earlier"]').count() > 0)
    page.unroute("**/api/timers/73/switch")
    page.unroute("**/api/operations/*")
    state["run"] = None
    page.evaluate("() => {S.run=null;S.sheet=null;S.pendingSheetOperation=null;render();}")


def audit_switch_review_r2(page, state):
    review_feed(page, state)
    posts = []

    def switch(route):
        posts.append(route.request.post_data_json)
        if len(posts) == 1:
            state["run"] = {**state["run"], "side": "R"}
            route.fulfill(status=409, json={"error": "Check the current side."})
        else:
            route.fulfill(json={"status": "saved", "operationId": posts[-1]["operationId"], "state": state})

    page.route("**/api/timers/73/switch", switch)
    page.locator(SIDE_SWITCH).click()
    page.wait_for_function("!S.busy && S.run.side === 'R'")
    offered = page.locator('[data-sheet] [data-act="switch-earlier"]').count() == 1
    clean = page.evaluate("!S.sheet._preparedSwitch && !S.sheet._operationId")
    target = page.locator(SIDE_SWITCH).inner_text().strip()
    ready = not page.locator(SIDE_SWITCH).is_disabled()
    if ready:
        page.locator(SIDE_SWITCH).click()
        page.wait_for_function("!S.busy && S.sheet === null")
    check("N1: a refused switch restores Switched earlier? and sends a new ID with the current side", offered and clean and ready and target == "Switch to left side" and len(posts) == 2 and posts[0]["operationId"] != posts[1]["operationId"] and posts[1]["side"] == "L")
    page.unroute("**/api/timers/73/switch")

    review_feed(page, state)
    state["pumpRun"] = None
    page.evaluate("() => {S.pumpRun=null;render();}")
    open_feed_adjustments(page)
    page.locator('[data-sheet] [data-act="switch-earlier"]').click()
    page.locator('[data-fid="earlyClock"]').fill("9:50")
    page.locator('[data-fid="earlyPeriod"]').select_option("PM")
    page.get_by_role("button", name="Pump", exact=True).click()
    hidden = page.locator('[data-sheet] [data-fid="earlyClock"]').count() == 0
    starts = []

    def start(route):
        starts.append(route.request.post_data_json)
        route.fulfill(json={"status": "saved", "operationId": starts[-1]["operationId"], "state": state})

    page.route("**/api/timers", start)
    page.locator('[data-sheet] [data-act="pumpTimer"]').click()
    page.wait_for_function("!S.busy")
    check("N2: Pump closes the switch clock and starts without a typed start time", hidden and len(starts) == 1 and starts[0].get("kind") == "pump" and "start" not in starts[0])
    page.unroute("**/api/timers", start)
    state["run"] = None
    page.evaluate("() => {S.run=null;S.sheet=null;S.pendingSheetOperation=null;render();}")


def audit_pump_amount_only(page, state):
    """A pump keeps amount-only saves; typed start and end times set its length."""
    page.clock.set_fixed_time(instant("2026-11-08", 11, 20))  # 11:20 AM in Mexico City: 680 minutes after midnight
    posts = []

    def events(route):
        body = route.request.post_data_json
        posts.append(body)
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})

    def pump_form(amount, start=None, end=None):
        page.evaluate("() => {S.lang='en';S.run=null;S.sleepRun=null;S.pumpRun=null;S.sheet=null;act('open-feed');act('ftab','pump');render();}")
        page.locator('[data-fid="pL"]').fill(amount)
        if start is not None:
            log_clock(page, "manual", start, "AM")
        if end is not None:
            log_clock(page, "manualEnd", end, "AM")
        hint = page.locator("[data-save-hint]")
        return page.locator('[data-sheet] [data-act="save"]'), (hint.inner_text() if hint.count() else "")

    def save_and_read(save):
        if not save.is_enabled():
            return {}
        save.click()
        page.wait_for_function("S.sheet === null && !S.busy")
        return posts[-1].get("event", {}) if posts else {}

    state.update({"run": None, "sleepRun": None, "pumpRun": None, "entries": []})
    page.route("**/api/events", events)
    try:
        save, hint = pump_form("2")
        check("a pump with an amount and untouched times can be saved", save.is_enabled() and hint == "")
        event = save_and_read(save)
        now_iso = "2026-11-08T17:20:00.000Z"  # 11:20 AM in Mexico City
        check("it saves as a pump of no length at the current time",
              event.get("type") == "pump" and event.get("leftMl") == 2 and event.get("duration") == 0
              and event.get("start") == now_iso and event.get("end") == now_iso)
        event = save_and_read(pump_form("2", "11:15", "11:20")[0])
        check("typed times make a five-minute pump end now", event.get("duration") == 5
              and event.get("start") == "2026-11-08T17:15:00.000Z" and event.get("end") == now_iso)
        save, hint = pump_form("2", end="-1")
        check("an invalid pump end keeps Save off and says why", not save.is_enabled() and hint == "Enter a time like 9:30.")
        save, hint = pump_form("", "11:15", "11:20")
        check("a pump without an amount still asks for one", not save.is_enabled() and hint == "Add an amount to save.")
        edits = []
        def edit_route(route):
            body = route.request.post_data_json
            edits.append(body.get("event", {}))
            route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})
        def edit_pump(end):
            page.evaluate("() => {S.sheet=null;S.drafts={};S.entries=[{id:'pumping:9',type:'pump',t:600,dur:0,ml:2,side:'B',sideAmounts:{L:2,R:0},unit:'ml',by:'Rowan'}];act('edit','pumping:9');render();}")
            page.locator('[data-fid="valueLeftMl"]').fill("3")
            if end == "":
                page.locator('[data-fid="editEndClock"]').fill("")  # an empty box, with no period typed after it
            else:
                log_clock(page, "editEnd", end, "AM")
            return page.locator('[data-sheet] [data-act="save"]')
        page.route("**/api/events/**", edit_route)
        save, sent = edit_pump("10:00"), len(edits)
        if save.is_enabled():
            save.click()
            page.wait_for_function("S.sheet === null && !S.busy")
        event = edits[-1] if len(edits) > sent else {}
        check("a pump edit with equal times saves as a pump of no length",
              event.get("leftMl") == 3 and event.get("duration") == 0 and bool(event.get("start")) and event.get("start") == event.get("end"))
        for end, message in [("", "Enter an end time at or after the start time."), ("-1", "Enter a time like 9:30.")]:
            save = edit_pump(end)
            hint = page.locator("[data-save-hint]")
            check(f"a pump edit with end {end!r} keeps Save off and says why",
                  not save.is_enabled() and hint.count() == 1 and hint.inner_text() == message)
    finally:
        page.unroute("**/api/events/**")
        page.unroute("**/api/events", events)
        state["entries"] = []
        page.evaluate("() => {S.sheet=null;S.entries=[];render();}")


def local_only(route):
    if urlsplit(route.request.url).hostname == "127.0.0.1":
        route.continue_()
    else:
        route.abort()


def audit_sign_in_again(page, state):
    """A sign-in that ends during use shows the name picker in place and keeps the open form."""
    signed_in = {"on": True}
    saves = []
    people = ["Rowan", "Sage"]
    who = {"name": "Rowan"}
    session_gets = []
    fail_refresh = {"on": False}
    no_state = {"on": False}

    def session_route(route):
        if route.request.method == "POST":
            signed_in["on"] = True
            who["name"] = (route.request.post_data_json or {}).get("username") or "Rowan"
            route.fulfill(json={"me": who["name"], "csrf": "csrf-2"})
            return
        session_gets.append(route.request.url)
        if fail_refresh["on"]:
            fail_refresh["on"] = False
            route.fulfill(status=500, json={"error": "The server could not complete this request."})
        elif signed_in["on"]:
            route.fulfill(json={"me": state["me"] if who["name"] == "Rowan" else who["name"], "csrf": "csrf-2", "people": people, "labels": {"Wren": {"en": "Other", "es": "Otra persona"}}})
        else:
            route.fulfill(json={"me": None, "csrf": "login-csrf", "passcode": True})

    def guarded(handler):
        def run(route):
            if not signed_in["on"]:
                route.fulfill(status=401, json={"error": "Sign in to continue."})
                return
            handler(route)
        return run

    def save(route):
        body = route.request.post_data_json
        saves.append(body)
        if no_state["on"]:
            no_state["on"] = False
            signed_in["on"] = False  # The sign-in ends right after this save, before the app reads the new state.
            route.fulfill(json={"status": "saved", "operationId": body["operationId"]})
            return
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})

    state_route = guarded(lambda route: route.fulfill(
        json=state if who["name"] == "Rowan" else {**state, "me": {"id": "adult:2", "name": who["name"]}}))
    events_route = guarded(save)
    # A sign-in that ended asks for the household passcode again; the names come with the correct passcode.
    passcode_route = lambda route: route.fulfill(json={"people": people, "labels": {"Wren": {"en": "Other", "es": "Otra persona"}}})
    page.route("**/api/session", session_route)
    page.route("**/api/session/passcode", passcode_route)
    page.route("**/api/state", state_route)
    page.route("**/api/events", events_route)
    form = "JSON.stringify({kind:S.sheet?.kind,tab:S.sheet?.tab,milk:S.sheet?.milk,ml:S.sheet?.ml})"
    try:
        page.evaluate("()=>{S.lang='en';S.sheet=null;S.message='';S.writeError='';render()}")
        page.locator('.tile[data-act="open-feed"]').click()
        page.get_by_role("button", name="Bottle").click()
        page.get_by_role("button", name="Formula").click()
        before = page.evaluate(form)
        signed_in["on"] = False  # The sign-in ends on the server; the open app does not know yet.
        page.get_by_role("button", name="Save").click()
        page.locator("#passcode-form").wait_for(timeout=5000)
        check("a save after the sign-in ended asks for the passcode, with no name, and no restart",
              "Your sign-in ended" in page.locator("#passcode-form").inner_text() and page.locator("#login-form").count() == 0 and not saves)
        unlock(page)
        page.locator('#login-form select[name="username"]').select_option("Rowan")
        page.locator('#login-form button[type="submit"]').click()
        page.get_by_role("dialog").wait_for(timeout=5000)
        check("after the sign-in the same bottle form is back, with Formula chosen",
              page.evaluate(form) == before and '"formula"' in before and "Try it again" in page.locator("[data-status]").inner_text())
        page.get_by_role("button", name="Save").click()
        page.wait_for_function("document.querySelector('[data-status]')?.textContent.toLowerCase().includes('saved')")
        check("the save goes out after the sign-in and succeeds",
              len(saves) == 1 and saves[0]["event"]["type"] == "bottle" and saves[0]["event"]["milk"] == "formula" and not page.get_by_role("dialog").count())
        signed_in["on"] = False  # The 15-second sync finds an ended sign-in too.
        page.evaluate("async()=>{await syncFamily();}")
        unlock(page)
        check("a sync after the sign-in ended asks for the passcode, then shows the name picker", page.locator("#login-form").is_visible())
        page.locator('#login-form button[type="submit"]').click()
        page.locator('.tile[data-act="open-feed"]').wait_for(timeout=5000)
        check("the app is usable again after that sign-in", page.evaluate("S.auth") == "ready" and page.evaluate("S.sheet") is None)

        def sign_in_as(name):
            if page.evaluate("S.auth") == "ready":
                signed_in["on"] = False
                page.evaluate("async()=>{await syncFamily();}")
            page.locator("#passcode-form, #login-form").first.wait_for(timeout=5000)
            if page.locator("#passcode-form").count():  # the names are already open after a passcode in this test
                unlock(page)
            page.locator('#login-form select[name="username"]').select_option(name)
            page.locator('#login-form button[type="submit"]').click()
            page.wait_for_function("S.auth==='ready'", timeout=5000)
            page.evaluate("()=>{S.sheet=null;S.message='';S.writeError='';render()}")

        # Codex review round 1 of 3. A save that the server confirmed stays saved when the sign-in ends before the state read.
        page.locator('.tile[data-act="open-feed"]').click()
        page.get_by_role("button", name="Bottle").click()
        page.get_by_role("button", name="Formula").click()
        no_state["on"] = True
        page.get_by_role("button", name="Save").click()
        page.wait_for_function("S.auth==='login'||(document.querySelector('[data-status]')?.textContent||'').toLowerCase().includes('saved')", timeout=5000)
        check("a confirmed save is not called refused when the sign-in ends before the state read",
              len(saves) == 2 and not page.evaluate("!!S.resume?.refusedSave"))
        sign_in_as("Rowan")

        # Two requests that find the same ended sign-in open one name picker and keep the refused save.
        signed_in["on"] = False
        session_gets.clear()
        page.evaluate("()=>{signInAgain(true);signInAgain(false);}")
        page.locator("#passcode-form").wait_for(timeout=5000)
        check("two requests that find one ended sign-in open one passcode screen and keep the refused save",
              len(session_gets) == 1 and page.evaluate("S.resume?.refusedSave") is True)
        sign_in_as("Rowan")

        # When the session check fails after the sign-in ended, the name picker still lists the names.
        fail_refresh["on"] = True
        signed_in["on"] = False
        page.evaluate("async()=>{await syncFamily();}")
        unlock(page)
        names = page.locator('#login-form select[name="username"] option').all_inner_texts()
        check("the name picker lists the names when the session check fails", names == people)
        if names != people:
            page.evaluate("()=>{S.people=['Rowan','Sage'];render()}")
        sign_in_as("Rowan")

        # Another person who signs in on this phone gets neither the open form nor the last person's care data.
        page.locator('.tile[data-act="open-feed"]').click()
        page.get_by_role("button", name="Bottle").click()
        page.get_by_role("button", name="Formula").click()
        page.evaluate("()=>{S.careData={confirmations:[],exportOptIn:true}}")
        signed_in["on"] = False
        page.get_by_role("button", name="Save").click()
        unlock(page)
        page.locator('#login-form select[name="username"]').select_option("Sage")
        page.locator('#login-form button[type="submit"]').click()
        page.wait_for_function("S.auth==='ready'", timeout=5000)
        check("another person who signs in gets neither the open form nor the last person's care data",
              page.evaluate("personName(S.me)") == "Sage" and page.evaluate("S.sheet") is None
              and page.evaluate("S.careData") is None and "Try it again" not in (page.evaluate("S.message") or ""))
        sign_in_as("Rowan")

        # Codex review round 2 of 3. A sync found the ended sign-in while no form was open; then a save from a new form failed.
        page.locator('.tile[data-act="open-feed"]').click()
        page.get_by_role("button", name="Bottle").click()
        page.get_by_role("button", name="Formula").click()
        drafted = page.evaluate("JSON.stringify({kind:S.sheet?.kind,milk:S.sheet?.milk})")
        signed_in["on"] = False
        page.evaluate("()=>{const form=S.sheet;S.sheet=null;signInAgain(false);S.sheet=form;signInAgain(true);}")
        unlock(page)
        page.locator('#login-form select[name="username"]').select_option("Rowan")
        page.locator('#login-form button[type="submit"]').click()
        page.wait_for_function("S.auth==='ready'", timeout=5000)
        check("a form whose save failed during a running sign-in check comes back after the sign-in",
              page.evaluate("JSON.stringify({kind:S.sheet?.kind,milk:S.sheet?.milk})") == drafted and '"formula"' in drafted
              and "Try it again" in (page.evaluate("S.message") or ""))
        sign_in_as("Rowan")
    finally:
        page.unroute("**/api/session", session_route)
        page.unroute("**/api/session/passcode", passcode_route)
        page.unroute("**/api/state", state_route)
        page.unroute("**/api/events", events_route)


def log_fixture(browser, base, state, kind="feed", start="2026-11-08T03:55:10.000Z", end="2026-11-08T04:00:50.000Z"):
    page = browser.new_page(timezone_id="America/Mexico_City")
    page.add_init_script(OPEN_DETAILS)
    page.set_default_timeout(1500)
    page.clock.set_fixed_time("2026-11-08T16:00:35.000Z")
    local = deepcopy(state)
    local.update({"entries": [], "run": None, "sleepRun": None, "pumpRun": None, "pendingOperations": []})
    local["preferences"].update({"lang": "en", "night": False})
    start_dt, end_dt = (datetime.fromisoformat(v.replace("Z", "+00:00")) for v in (start, end))
    local_start = start_dt.astimezone(MX)
    minute = (local_start.day - 8) * 1440 + local_start.hour * 60 + local_start.minute + local_start.second / 60
    entry = {"id": "sleep:42" if kind == "sleep" else "feedings:42", "type": kind, "t": minute, "dur": (end_dt - start_dt).total_seconds() / 60, "side": "L", "nap": True, "by": "Fake parent", "note": "Fake note"}
    local["entries"] = [entry]
    sent, mode = [], {"status": 200, "error": "", "lost": False}

    def api_route(route):
        req = route.request
        if req.url.endswith("/api/session"):
            return route.fulfill(json={"me": local["me"], "csrf": "fake"})
        if "/api/state" in req.url:
            return route.fulfill(json=local)
        if "/api/operations/" in req.url:
            return route.fulfill(json={"status": "failed", "operationId": req.url.rsplit("/", 1)[-1], "error": "Fake split failed. Try again."})
        if req.url.endswith("/api/development"):  # daily guidance is read at sign-in; it is not a write
            return route.fulfill(json={"date": "2026-11-08", "status": "unavailable", "cards": []})
        if req.url.endswith("/api/ai/status"):  # Home asks once whether Ask can show; it is not a write
            return route.fulfill(json={"available": True})
        if req.url.endswith("/api/growth"):
            return route.fulfill(json={"entries": [], "unavailable": []})
        if "/api/cries?home=1" in req.url or req.url.endswith("/api/care-passages"):  # the Crying card reads these at sign-in; they are not writes
            return route.fulfill(json={"ask": None, "sound": "off"} if "/api/cries" in req.url else {"en": [], "es": []})
        sent.append({"method": req.method, "url": req.url, **req.post_data_json})
        if mode["lost"]:
            return route.abort()
        if mode["status"] != 200:
            return route.fulfill(status=mode["status"], json={"error": mode["error"]})
        route.fulfill(json={"status": "saved", "operationId": req.post_data_json["operationId"], "state": local})

    page.route("**/api/**", api_route)
    page.goto(base)
    page.locator('.tile[data-act="open-feed"]').wait_for()
    page.evaluate("() => {S.tab='log';S.day=-1;render();}")
    page.locator(f'[data-act="edit"][data-arg="{entry["id"]}"]').first.click()  # R5: a sleep that crosses midnight has a row in each day it touches
    return page, local, entry, sent, mode


def log_save(page, sent):
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function("!S.busy")
    assert sent, "Save sent no request"
    return sent[-1]


def log_split(page):
    page.get_by_role("button", name="Split around a wake-up", exact=True).click()
    assert page.locator('[data-fid="wokeClock"]').count() == 1
    assert not page.locator('[data-sheet] [data-act="save"]').is_disabled()


def log_clock(page, prefix, value, period):
    # Finish the previous field's select-on-focus callback before WebKit types here.
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(resolve))")
    page.locator(f'[data-fid="{prefix}Clock"]').fill(f"{value} {period}")  # one box holds the time and its period (R4)
    # Wait for the existing select-on-focus step before the next clock takes focus.
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(resolve))")


def audit_edit_seconds(page, local, entry, sent, mode):
    body = log_save(page, sent)["event"]
    assert body["start"] == "2026-11-08T03:55:10.000Z", body
    assert body["end"] == "2026-11-08T04:00:50.000Z", body
    page.evaluate("() => {act('edit','feedings:42');render();}")
    log_clock(page, "edit", "9:56", "PM")
    log_clock(page, "editEnd", "10:01", "PM")
    changed = log_save(page, sent)["event"]
    assert changed["start"] == "2026-11-08T03:56:00.000Z" and changed["end"] == "2026-11-08T04:01:00.000Z", changed


def audit_recent_edit(page, local, entry, sent, mode):
    page.clock.set_fixed_time("2026-11-08T04:00:58.000Z")
    page.evaluate("render()")
    assert not page.locator('[data-sheet] [data-act="save"]').is_disabled(), "Save is off eight seconds after the end"
    log_save(page, sent)


def audit_edit_errors(page, local, entry, sent, mode):
    for code, message in [(400, "This time overlaps another entry. Change the start or end."), (409, "This entry changed on another phone. Close it and open it again.")]:
        mode.update({"status": code, "error": message})
        log_save(page, sent)
        assert page.locator('[role="dialog"]').count() == 1
        assert message in page.locator('[data-status]').inner_text()
        assert page.locator('[data-sheet] [data-act="save"]').is_disabled() == (code == 409)
        assert page.evaluate("S.auth") == "ready"


def audit_edit_expected(page, local, entry, sent, mode):
    body = log_save(page, sent)["event"]
    assert body.get("expected") == {"start": "2026-11-08T03:55:10.000Z", "end": "2026-11-08T04:00:50.000Z"}, body


def audit_edit_date_move(page, local, entry, sent, mode):
    expected = {"start": "2026-11-08T03:55:10.000Z", "end": "2026-11-08T04:00:50.000Z"}
    page.locator('[data-fid="editDay"]').fill("2026-11-05")  # Two days before the loaded Mexico City date.
    body = log_save(page, sent)["event"]
    for key in ("start", "end"):
        loaded = datetime.fromisoformat(expected[key].replace("Z", "+00:00"))
        moved = datetime.fromisoformat(body[key].replace("Z", "+00:00"))
        seconds = (moved - loaded).total_seconds()
        assert seconds == -2 * 86400, f"{key} moved {seconds:g} seconds; expected -172800 seconds"
    assert body.get("expected") == expected, body


def audit_split_clocks(page, local, entry, sent, mode):
    log_split(page)
    log_clock(page, "woke", "1:15", "AM")
    log_clock(page, "slept", "1:25", "AM")
    body = log_save(page, sent)
    assert body["url"].endswith("/api/events/sleep%3A42/split")
    assert body["split"] == {"wokeAt": "2026-11-08T07:15:00.000Z", "sleptAt": "2026-11-08T07:25:00.000Z", "expected": {"start": "2026-11-08T04:30:00.000Z", "end": "2026-11-08T11:10:00.000Z"}}, body
    page.evaluate("() => {act('edit','sleep:42');render();}")
    log_split(page)
    log_clock(page, "woke", "2:00", "AM")
    log_clock(page, "slept", "1:00", "AM")
    assert page.locator('[data-sheet] [data-act="save"]').is_disabled()
    assert page.locator('[data-save-hint]').is_visible()


def audit_short_split(page, local, entry, sent, mode):
    log_split(page)
    assert page.locator('[data-fid="wokeClock"]').input_value() == "10:02"
    assert page.locator('[data-fid="sleptClock"]').input_value() == "10:03"
    assert page.locator('[data-fid="wokePeriod"]').input_value() == "PM"
    page.set_viewport_size({"width": 390, "height": 844})
    evidence = ROOT.parent.parent / ".evidence"
    engine = browser_engine()
    page.screenshot(path=str(evidence / f"split-{engine}-en.png"))
    page.evaluate("() => {S.lang='es';render();}")
    assert "Despertó" in page.locator('[data-sheet]').inner_text() and "Se durmió otra vez" in page.locator('[data-sheet]').inner_text()
    page.screenshot(path=str(evidence / f"split-{engine}-es.png"))
    page.evaluate("() => {S.lang='en';S.sheet=null;act('edit','sleep:42');render();}")
    hidden = page.evaluate("""() => {
      const grants={...S.permissions.resources.sleep},counts=[];
      for(const action of ['view','change','add']){S.permissions.resources.sleep={...grants,[action]:false};render();counts.push(document.querySelectorAll('[data-act="split"]').length);}
      S.permissions.resources.sleep=grants;render();return counts;
    }""")
    assert hidden == [0, 0, 0]
    page.evaluate("() => {S.sheet=null;S.entries[0].dur=50/60;act('edit','sleep:42');render();}")
    assert page.get_by_role("button", name="Split around a wake-up", exact=True).count() == 0


def audit_split_retry(page, local, entry, sent, mode):
    log_split(page)
    mode["lost"] = True
    first = log_save(page, sent)
    page.wait_for_function("S.message === 'Fake split failed. Try again.'")
    assert page.evaluate("!S.sheet._operationId && Object.keys(S.pendingOps).length===0")
    assert not page.locator('[data-sheet] [data-act="save"]').is_disabled()
    log_clock(page, "slept", "2:10", "AM")
    mode["lost"] = False
    second = log_save(page, sent)
    assert first["operationId"] != second["operationId"]


def audit_edit_delete(page, local, entry, sent, mode):
    page.evaluate("id => {S.permissions.resources[id.split(':')[0]].delete=true;render();}", entry["id"])
    button = page.locator('[data-act="delete-entry"]')
    assert button.count() == 1, "Delete is missing"
    page.once("dialog", lambda dialog: dialog.dismiss())
    button.click()
    assert not sent
    page.once("dialog", lambda dialog: dialog.accept())
    button.click()
    page.wait_for_function("!S.busy")
    assert sent[-1]["method"] == "DELETE" and sent[-1]["url"].endswith(entry["id"].replace(":", "%3A"))
    page.evaluate("id => {S.permissions.resources[id.split(':')[0]].delete=false;act('edit',id);render();}", entry["id"])
    assert page.locator('[data-act="delete-entry"]').count() == 0


def audit_r1_milliseconds(page, local, entry, sent, mode):
    start, end = "2026-11-08T03:55:10.123Z", "2026-11-08T04:00:50.456Z"
    local["entries"][0].update({"startISO": start, "endISO": end, "dur": (datetime.fromisoformat(end.replace("Z", "+00:00")) - datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds() / 60})
    page.evaluate("([start,end]) => {S.entries[0].startISO=start;S.entries[0].endISO=end;S.entries[0].dur=(Date.parse(end)-Date.parse(start))/60000;S.entries.push({id:'feedings:41',type:'feed',side:'L',t:S.entries[0].t-5,dur:5,by:'Fake',endISO:start});S.sheet=null;act('edit','feedings:42');render();}", [start, end])
    body = log_save(page, sent)["event"]
    assert body["start"] == start and body["end"] == end, body
    assert body["expected"] == {"start": start, "end": end}, body
    page.evaluate("() => {act('edit','feedings:42');render();}")
    page.locator('[data-fid="editDay"]').fill("2026-11-05")
    moved = log_save(page, sent)["event"]
    assert moved["start"] == "2026-11-06T03:55:10.123Z" and moved["end"] == "2026-11-06T04:00:50.456Z", moved


def audit_r1_delete_id(page, local, entry, sent, mode):
    mode.update({"status": 409, "error": "Fake stale save."})
    first = log_save(page, sent)
    page.evaluate("() => {S.permissions.resources.feedings.delete=true;render();}")
    mode["status"] = 200
    page.once("dialog", lambda dialog: dialog.accept())
    page.locator('[data-act="delete-entry"]').click()
    page.wait_for_function("!S.busy")
    assert sent[-1]["method"] == "DELETE" and sent[-1]["operationId"] != first["operationId"], sent
    assert page.evaluate("S.sheet === null")


def audit_r1_child_failed(page, local, entry, sent, mode):
    result = page.evaluate("""async () => {
      S.sheet=null;S.setupDraft={firstName:'Fake',birthDate:'2026-10-01'};
      LittleDaysAPI.createChild=async()=>({status:'failed',operationId:'fake',error:'Fake setup refusal.'});
      await submitChild(S.setupDraft);
      return {auth:S.auth,message:S.message,id:S.setupDraft._operationId};
    }""")
    assert result["auth"] == "setup" and result["message"] == "Fake setup refusal." and not result.get("id"), result


def audit_end_after_start_hint(page, local, entry, sent, mode):
    log_clock(page, "edit", "10:10", "PM")
    assert page.locator('[data-sheet] [data-act="save"]').is_disabled()
    assert page.locator('[data-save-hint]').inner_text() == page.evaluate("t('hintEnd')"), page.locator('[data-save-hint]').inner_text()


def audit_r2_search(page, local, entry, sent, mode):
    page.evaluate("""() => {
      S.sheet=null;const feed={...S.entries[0],startISO:'2026-11-08T03:55:10.123Z',endISO:'2026-11-08T04:00:50.456Z',note:'quiet'};
      S.entries=[feed,{...feed,id:'sleep:42',type:'sleep',nap:true,note:'restful'}];render();
    }""")
    page.locator('[data-act="search-toggle"]').click()  # R5: the search opens from the title bar
    for query in ("start", "end", "iso"):
        page.locator('[data-fid="search"]').fill(query)
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        assert page.locator('.rowedit').count() == 0, f"{query} matched {page.locator('.rowedit').count()} entries through ISO fields"
    page.evaluate("() => {S.entries[0].note='start after bath';render();}")
    page.locator('[data-fid="search"]').fill("start")
    page.locator('[data-act="edit"][data-arg="feedings:42"]').wait_for()
    assert page.locator('.rowedit').count() == 1
    page.locator('[data-fid="search"]').fill("restful")
    page.locator('[data-act="edit"][data-arg="sleep:42"]').wait_for()
    assert page.locator('.rowedit').count() == 1


def audit_log_edits(browser, base, state):
    overnight = {"kind": "sleep", "start": "2026-11-08T04:30:00.000Z", "end": "2026-11-08T11:10:00.000Z"}
    short = {"kind": "sleep", "start": "2026-11-08T04:00:50.000Z", "end": "2026-11-08T04:03:50.000Z"}
    cases = [("B1 unchanged clocks keep seconds", audit_edit_seconds, {}),
             ("F1 switched feed keeps milliseconds", audit_r1_milliseconds, {}),
             ("F3 delete has its own operation ID", audit_r1_delete_id, {}),
             ("F4 immediate child failure keeps the legacy result", audit_r1_child_failed, {}),
             ("F7 start after a filled end gets the end-after-start hint", audit_end_after_start_hint, {}),
             ("N2 Log search ignores exact-time fields and finds note words", audit_r2_search, {}),
             ("B2 an entry ended eight seconds ago can save", audit_recent_edit, {}),
             ("B3 refused edits keep the form and sign-in", audit_edit_errors, {}),
             ("B4 overnight split clocks and expected", audit_split_clocks, overnight),
             ("B4 short split defaults and hidden button", audit_short_split, short),
             ("B5 edits send the loaded expected range", audit_edit_expected, {}),
             ("date-only edit moves exact start and end by whole days", audit_edit_date_move, {}),
             ("B6 failed split clears the ID for a corrected save", audit_split_retry, overnight),
             ("B7 feed delete confirms and follows permission", audit_edit_delete, {}),
             ("B7 sleep delete confirms and follows permission", audit_edit_delete, overnight)]
    for label, run, options in cases:
        page = None
        try:
            fixture = log_fixture(browser, base, state, **options)
            page = fixture[0]
            run(*fixture)
            check(label, True)
        except Exception as error:
            check(f"{label}: {error}", False)
        finally:
            if page:
                page.close()


def audit_saved_edits(page, state, save_event, save_if_on, close_sheet, type_clock):
    # Edits take an end time; a feed on both sides keeps its side and its title.
    # Yesterday, so the typed end time has passed whatever the clock says when this runs.
    now_m=page.evaluate("nowM()")
    both={"id":"feeding:both","type":"feed","side":"B","dur":45,"t":-1440+720,"by":"Sage"}
    nap={"id":"sleep:nap","type":"sleep","nap":True,"dur":90,"t":-1440+780,"by":"Rowan"}
    recent={"id":"feeding:recent","type":"feed","side":"L","dur":20,"t":now_m-30,"by":"Rowan"}
    appt={"id":"appt:edit","type":"other","what":"appointment","title":"Checkup","t":-1440+600,"by":"Rowan"}
    short={"id":"feeding:short","type":"feed","side":"R","dur":0.5,"t":-1440+900,"by":"Rowan"}
    diaper={"id":"diaper:edit","type":"diaper","kind":"W","t":-1440+800,"by":"Rowan"}
    bottle={"id":"bottle:edit","type":"bottle","ml":60,"milk":"breast","dur":15,"t":-1440+820,"by":"Rowan"}
    state["entries"].extend([both,nap,recent,appt,short,diaper,bottle])
    saved_edits=[]
    def entry_edit(route):
        body=route.request.post_data_json
        saved_edits.append(body["event"])
        route.fulfill(json={"status":"saved","operationId":body["operationId"],"state":state})
    page.route("**/api/events/**",entry_edit)
    navigate(page,"log")
    row=page.locator('[data-act="edit"][data-arg="feeding:both"]')  # R5: Today and Yesterday show together, so no day button is needed
    check("a feed on both sides is titled Both breasts","Both breasts" in row.inner_text())
    row.click()
    side=lambda arg:page.locator(f'[data-sheet] [data-act="editSide"][data-arg="{arg}"]')
    check("feed edit keeps Both breasts and shows the end time",side("B").get_attribute("aria-pressed")=="true" and page.locator('[data-fid="editEndClock"]').input_value()=="12:45" and page.locator('[data-act="clock-period"][data-arg="editEnd:PM"]').get_attribute('aria-pressed')=='true')
    side("L").click()
    page.evaluate("render()")
    check("Both breasts stays a choice after another side is picked and the sheet redraws",side("B").count()==1 and side("L").get_attribute("aria-pressed")=="true" and page.evaluate("S.sheet.valueSide")=="L")
    page.evaluate("S.sheet.valueSide='B';S.entries.find(x=>x.id==='feeding:both').side='L';render()")  # another adult changed the feed
    check("Both breasts stays chosen when the feed changes while its edit is open",side("B").get_attribute("aria-pressed")=="true")
    page.evaluate("S.entries.find(x=>x.id==='feeding:both').side='B';render()")
    page.locator('[data-fid="editEndClock"]').fill("12:50")
    event=save_event(saved_edits)
    check("feed edit posts the length from the typed end time",event.get("side")=="B" and event.get("duration")==50)
    page.locator('[data-act="edit"][data-arg="sleep:nap"]').click()
    check("sleep edit shows the end time",page.locator('[data-fid="editEndClock"]').input_value()=="2:30" and page.locator('[data-act="clock-period"][data-arg="editEnd:PM"]').get_attribute('aria-pressed')=='true')
    page.locator('[data-fid="editEndClock"]').fill("3:00")
    length_text=page.locator("[data-range-len]").inner_text()
    event=save_event(saved_edits)
    check("sleep edit posts the length from the typed end time",event.get("duration")==120 and event.get("nap") is True)
    check("a length over an hour uses min, like lengths under an hour","2 h" in length_text and "00" not in length_text)
    # Edit sheets pick with the same chips as new entries (owner request, 2026-11-09).
    page.locator('[data-act="edit"][data-arg="diaper:edit"]').click()
    page.locator('[data-sheet] [data-act="editKind"][data-arg="D"]').click()
    event=save_event(saved_edits)
    check("diaper edit picks the type with the new-entry chips and saves it",event.get("kind")=="D")
    page.locator('[data-act="edit"][data-arg="bottle:edit"]').click()
    page.locator('[data-sheet] [data-act="editMilk"][data-arg="formula"]').click()
    event=save_event(saved_edits)
    check("bottle edit picks the milk with chips and saves it",event.get("milk")=="formula")
    def type_end(minute):
        c=page.evaluate(f"clockOf({minute})")
        page.locator('[data-fid="editEndClock"]').fill(f"{c['hh']}:{c['mm']} {c['period']}")
    page.wait_for_function("!S.busy&&!S.sheet")
    page.evaluate("act('edit','feeding:recent');render()")
    type_end(now_m+30)
    check("a feed edit that ends in the future blocks Save and says why",page.locator('[data-sheet] [data-act="save"]').is_disabled() and "must be now or earlier" in page.locator("[data-sheet]").inner_text())
    type_end(now_m-5)
    event=save_event(saved_edits)
    check("a feed edit saves once its end time has passed",event.get("duration")==25)
    page.wait_for_function("!S.busy&&!S.sheet")
    page.evaluate("act('edit','feeding:short');render()")
    page.locator('[data-fid="editDay"]').fill(page.evaluate("dayISO(-2)"))
    event=save_if_on(saved_edits)
    check("moving a 30-second feed to another day keeps its length",event.get("duration")==0.5)
    page.wait_for_function("!S.busy&&!S.sheet")
    page.evaluate("act('edit','appt:edit');render()")
    check("an appointment edit shows its date, time and note once",page.locator('[data-sheet] [data-fid="editClock"]').count()==1 and page.locator('[data-sheet] [data-fid="editNote"]').count()==1)
    close_sheet()

    # Review round 1 (design): no error before input; the hint names what is missing.
    page.evaluate("act('quick','tummy');render()")
    err=page.locator("[data-sheet] [data-range-err]")
    check("tummy time opens with no error and asks for minutes",not (err.count() and err.is_visible()) and "Enter how many minutes" in page.locator("[data-sheet]").inner_text())
    page.locator('[data-fid="duration"]').fill("5")
    late_shown=err.count()==1 and err.is_visible() and "plus the duration" in err.inner_text()
    page.locator('[data-fid="manualDate"]').fill(page.evaluate(f"dayISO({-1 if now_m<30 else 0})"))
    type_clock("manual",now_m-30)
    check("tummy time explains a start plus duration after now and clears it once fixed",late_shown and not err.is_visible() and not page.locator('[data-sheet] [data-act="save"]').is_disabled())
    close_sheet()
    page.evaluate("act('open-med');render()")
    hint=page.locator("[data-sheet] [data-save-hint]")
    first=hint.inner_text()
    page.locator('[data-fid="name"]').fill("Gas drops")
    second=hint.inner_text()
    page.locator('[data-fid="dose"]').fill("0.5")
    check("medicine names the missing name, then dose, then unit",(first,second,hint.inner_text())==("Enter the medicine name to save.","Enter the dose to save.","Choose a unit to save."))
    close_sheet()
    page.unroute("**/api/events/**",entry_edit)


def audit_typed_entries(page, state, manual_events):
    # Typed times and amounts, and start and end times.
    def save_event(captured):
        before=len(captured)
        page.locator('[data-sheet] [data-act="save"]').click()
        for _ in range(50):
            if len(captured)>before:
                break
            page.wait_for_timeout(100)
        return captured[-1] if len(captured)>before else {}
    def choose(act,arg):
        chip=page.locator(f'[data-sheet] [data-act="{act}"][data-arg="{arg}"]')
        if chip.get_attribute("aria-pressed")!="true":
            chip.click()
    def open_manual_feed(side):
        page.locator('.tile[data-act="open-feed"]').click()
        open_feed_adjustments(page)
        page.locator('[data-sheet] [data-act="manual"]').click()
        choose("manualSide",side)
    two_days_ago=page.evaluate("dayISO(-2)")
    running_feed=state.get("run")
    state["run"]=None  # a running feed timer replaces manual entry; the timer checks above set their own
    page.reload()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    open_manual_feed("R")
    page.locator('[data-fid="manualDate"]').fill(two_days_ago)
    page.locator('[data-fid="manualClock"]').fill("1150")
    set_period(page, "manual", "PM")
    page.locator('[data-fid="manualDuration"]').fill("20")  # R4: the breast form takes Minutes, not an end time
    check("manual feed shows the minutes it will save",page.locator('[data-fid="manualDuration"]').input_value()=="20")
    event=save_event(manual_events)
    check("manual feed posts the typed start and an end after midnight",event.get("type")=="feed" and event.get("side")=="R" and event.get("start")==instant(two_days_ago,23,50) and event.get("duration")==20)
    open_manual_feed("L")
    page.locator('[data-fid="manualDate"]').fill(two_days_ago)
    page.locator('[data-fid="manualClock"]').fill("2131")
    clock_hint=lambda:page.locator("[data-sheet] [data-save-hint]").inner_text()=="Enter a time like 9:30."
    check("a 24-hour time blocks Save and asks for a time like 9:30",page.locator('[data-sheet] [data-act="save"]').is_disabled() and clock_hint())
    page.locator('[data-fid="manualClock"]').fill("931")
    set_period(page, "manual", "PM")
    page.locator('[data-fid="manualDuration"]').fill("0")
    check("zero minutes blocks Save",page.locator('[data-sheet] [data-act="save"]').is_disabled())
    page.locator('[data-fid="manualClock"]').fill("9:75 PM")
    page.locator('[data-fid="manualDuration"]').fill("4")
    check("an impossible start time blocks Save and asks for a time like 9:30",page.locator('[data-sheet] [data-act="save"]').is_disabled() and clock_hint())
    page.locator('[data-fid="manualClock"]').fill("931 PM")
    event=save_event(manual_events)
    check("typed 931 and 935 with PM post a feed from 9:31 PM to 9:35 PM",event.get("start")==instant(two_days_ago,21,31) and event.get("duration")==4)
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    choose("milk","formula")
    page.locator('[data-fid="ml"]').fill("15")
    page.locator('[data-sheet] [data-act="ml-set"][data-arg="90"]').click()  # R4: presets replace the plus and minus buttons
    check("a preset replaces a typed 15 ml with 90 ml",page.locator('[data-fid="ml"]').input_value()=="90")
    page.locator('[data-fid="ml"]').fill("15")
    page.locator('[data-fid="manualDate"]').fill(two_days_ago)
    page.locator('[data-fid="manualClock"]').fill("6:10")
    set_period(page, "manual", "PM")
    event=save_event(manual_events)
    check("bottle posts the typed 15 ml at the typed time",event.get("type")=="bottle" and event.get("ml")==15 and event.get("milk")=="formula" and event.get("time")==instant(two_days_ago,18,10))
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    choose("milk","breast")
    page.locator('[data-fid="ml"]').fill("12,5")
    event=save_event(manual_events)
    posted=datetime.strptime(event.get("time","2000-01-01T00:00:00.000Z"),"%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    check("a bottle with an untouched time posts now and a decimal-comma amount",event.get("ml")==12.5 and abs((datetime.now(timezone.utc)-posted).total_seconds())<180)

    # Review round 1: leading zeros, a stale error, the time a form shows, bad amounts, a cleared date.
    now_m=page.evaluate("nowM()")
    def type_clock(fid,minute):
        c=page.evaluate(f"clockOf({minute})")
        page.locator(f'[data-fid="{fid}Clock"]').fill(f"{c['hh']}:{c['mm']} {c['period']}")
    def close_sheet():
        page.evaluate("S.sheet=null;S.drafts={};render()")
    def save_if_on(captured):
        # A check that fails with Save off must not stop the run at a disabled button.
        if page.locator('[data-sheet] [data-act="save"]').is_disabled():
            close_sheet()
            return {}
        return save_event(captured)
    open_manual_feed("L")
    page.locator('[data-fid="manualDate"]').fill(two_days_ago)
    set_period(page, "manual", "PM")
    box=page.locator('[data-fid="manualClock"]')
    box.focus()
    box.evaluate("e=>e.select()")  # a tap selects the text; the first digit replaces it
    page.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")  # a tap selects the text; the first digit replaces it
    box.press_sequentially("0230")  # passes 023 on the way
    check("typing 0230 one digit at a time formats the clock and keeps PM",box.input_value()=="02:30" and page.evaluate("S.sheet.period")=="PM")
    page.locator('[data-fid="manualDuration"]').fill("30")
    event=save_if_on(manual_events)
    check("0230 with PM posts 2:30 PM",event.get("start")==instant(two_days_ago,14,30) and event.get("duration")==30)
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="pump"]').click()  # R4: only Pump and Bottle keep an end time
    type_clock("manual",now_m)
    type_clock("manualEnd",now_m+30)
    page.evaluate("render()")  # a full redraw shows the error under the end time
    late=page.locator("[data-sheet] [data-range-err]")
    shown=late.count()==1 and late.is_visible()
    type_clock("manualEnd",now_m)
    check("fixing a future end time clears its error without a redraw",shown and not late.is_visible())
    close_sheet()
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    choose("milk","breast")
    page.evaluate("render()")  # after a redraw the time on screen must still be the one the sheet holds
    shown=[page.locator('[data-fid="manualClock"]').input_value(),page.locator('[data-act="clock-period"][data-arg^="manual:"][aria-pressed="true"]').inner_text().strip()]
    held=page.evaluate("S.sheet.hour===undefined?null:[`${S.sheet.hour}:${S.sheet.minute}`,S.sheet.period]")
    page.locator('[data-fid="manualDate"]').fill(two_days_ago)
    event=save_event(manual_events)
    hh,mm=map(int,shown[0].split(":"))
    check("a bottle holds the time its form shows and saves it when only the date changes",held==shown and event.get("time")==instant(two_days_ago,hh%12+(12 if shown[1]=="PM" else 0),mm))
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    choose("milk","breast")
    page.locator('[data-fid="ml"]').fill("12.3.4")
    # R4: the bottle Save is always on. A value that cannot save shows the inline error, sends nothing and puts the cursor in the field.
    sent_before=len(manual_events)
    page.locator('[data-sheet] [data-act="save"]').click()
    check("a malformed amount sends nothing, shows the inline error and focuses the amount",len(manual_events)==sent_before and page.locator("[data-sheet] #ml-error").is_visible() and page.evaluate("document.activeElement?.id")=="f-ml")
    page.locator('[data-fid="ml"]').fill("20")
    page.locator('[data-fid="manualDate"]').fill("")
    page.locator('[data-sheet] [data-act="save"]').click()
    check("a cleared date sends nothing and says why",len(manual_events)==sent_before and page.locator("[data-sheet] [data-status]").count()==1)
    close_sheet()
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="pump"]').click()
    page.locator('[data-fid="pL"]').fill("12.3.4")
    page.locator('[data-fid="pR"]').fill("20")
    check("a malformed amount on one pump side blocks Save and asks for an amount",page.locator('[data-sheet] [data-act="save"]').is_disabled() and page.locator("[data-sheet] [data-save-hint]").inner_text()=="Add an amount to save.")
    page.evaluate("S.sheet.vu='oz';render()")  # R4: the unit moved to Settings; a redraw in ounces is the same check
    check("a redraw keeps the malformed text on screen and Save off",page.locator('[data-fid="pL"]').input_value()=="12.3.4" and page.locator('[data-sheet] [data-act="save"]').is_disabled())
    close_sheet()
    stops=[]
    def stop_seen(route):
        stops.append(route.request.url)
        route.abort()
    page.route("**/api/timers/**/stop",stop_seen)
    page.evaluate("S.toast=null;S.message='';S.pumpRun={id:'timer:pump',side:'L',t0:nowM(),startedAt:new Date().toISOString(),by:'Rowan'};S.sheet={kind:'feed',tab:'pump',pL:0,pR:0,vu:'ml'};render()")
    page.locator('[data-fid="pL"]').fill("12.3.4")
    page.locator('[data-fid="pR"]').fill("20")
    page.locator('[data-sheet] [data-act="pumpTimer"]').click()
    status=page.locator("[data-sheet] [data-status]")
    check("stopping the pump timer with a malformed amount sends nothing and asks for an amount",not stops and status.count()==1 and "Add an amount to save." in status.inner_text())
    page.unroute("**/api/timers/**/stop",stop_seen)
    page.evaluate("S.pumpRun=null;S.stopping?.clear?.();S.message=''")
    close_sheet()
    open_manual_feed("L")
    page.locator('[data-fid="manualClock"]').fill("9:75 PM")
    page.locator('[data-act="ftab"][data-arg="pump"]').click()
    check("an invalid time left on the Breast tab does not set the Pump hint",page.locator("[data-sheet] [data-save-hint]").inner_text()=="Add an amount to save.")
    close_sheet()

    audit_saved_edits(page, state, save_event, save_if_on, close_sheet, type_clock)
    state["run"]=running_feed
    navigate(page,"home")


def audit_pump_edit(page, state):
    # Yesterday's pump (t=-740 is 11:40 AM the day before), so the typed 12:05 PM end is in the past at any time of day.
    # On today's page it was in the future from midnight to 12:05 PM, Save stayed off and the click waited 30 s
    #.
    pump={"id":"pump:edit","type":"pump","t":-740,"side":"B","ml":120,"sideAmounts":{"L":45,"R":75},"dur":20,"by":"Rowan"}
    state["entries"].append(pump)
    saved_pump=[]
    def pump_edit(route):
        body=route.request.post_data_json
        saved_pump.append(body["event"])
        state["entries"]=[pump|body["event"]|{"id":"pump:edit","type":"pump","by":"Rowan","t":-740}]
        route.fulfill(json={"status":"saved","operationId":body["operationId"],"state":state})
    page.route("**/api/events/**",pump_edit)
    navigate(page, "log")
    page.evaluate("() => {S.day=-1;render();}")
    page.locator('[data-act="edit"][data-arg="pump:edit"]').click()
    check("pump edit starts with separate left and right amounts",page.locator('[data-fid="valueLeftMl"]').input_value()=="45" and page.locator('[data-fid="valueRightMl"]').input_value()=="75")
    capture_sheet(page,"pump-edit-en")
    page.locator('[data-fid="valueLeftMl"]').fill("50")
    page.locator('[data-fid="valueRightMl"]').fill("80")
    log_clock(page,"editEnd","12:05","PM")
    page.get_by_role("button",name="Save").click()
    page.wait_for_function("document.querySelector('[data-status]')?.textContent.toLowerCase().includes('saved')")
    check("pump edit saves both side values, total and length",len(saved_pump)==1 and saved_pump[0].get("leftMl")==50 and saved_pump[0].get("rightMl")==80 and saved_pump[0].get("ml")==130 and saved_pump[0].get("duration")==25)
    page.unroute("**/api/events/**",pump_edit)
    page.evaluate("() => {S.day=0;render();}")


def audit_save_failure(page, requests):
    handoff_text=page.locator('[data-handoff="true"]').inner_text()
    check("server handoff note and author appear on Home", "Bottle at 2 am" in handoff_text and "Sage" in handoff_text)
    page.locator('.tile[data-act="open-feed"]').click()
    page.get_by_role("button", name="Bottle").click()
    page.get_by_role("button", name="Formula").click()
    page.get_by_role("button", name="Save").click()
    page.get_by_role("dialog").wait_for()
    page.locator("[data-status]", has_text="Test failure").wait_for(timeout=5000)
    check("failed event remains a draft and does not appear as saved", page.get_by_role("dialog").is_visible() and page.locator(".rowedit").count() == 0 and "Test failure" in page.locator("[data-status]").inner_text())
    alert = page.locator('[data-sheet] [role="alert"]')
    position = alert.evaluate("e=>e.getBoundingClientRect().top >= document.querySelector('.form-head').getBoundingClientRect().bottom && e.getBoundingClientRect().bottom <= document.querySelector('.sheet').getBoundingClientRect().top")
    check("save failure is labeled beside the form and keeps the chosen milk", alert.locator("strong").inner_text() == "Not saved" and alert.locator("svg").count() == 1 and position and page.get_by_role("button", name="Formula").get_attribute("aria-pressed") == "true")
    page.evaluate("()=>{S.lang='es';render()}")
    check("save failure label is translated in Spanish", page.locator('[data-sheet] [role="alert"] strong').inner_text() == "No se guardó")
    page.evaluate("()=>{S.lang='en';render()}")
    page.get_by_role("button", name="Save").click()
    page.wait_for_function("document.querySelector('[data-status]')?.textContent.toLowerCase().includes('saved')")
    check("confirmed event closes the form and uses an absolute ISO time", not page.get_by_role("dialog").count() and requests[1][3]["event"]["time"].endswith("Z") and "t" not in requests[1][3]["event"])
    check("failed attempt and new intentional retry use distinct operation IDs", requests[0][3]["operationId"] != requests[1][3]["operationId"])
    check("CSRF header accompanies event writes", all(req[2] == "csrf-1" for req in requests))

    # A transport retry can pass the stored operation ID so a lost response cannot duplicate a write.


def past_form(page, kind):
    page.evaluate("() => {S.lang='en';S.sheet=null;S.drafts={};S.run=null;S.sleepRun=null;S.pumpRun=null;render();}")
    if kind == "pump":
        page.locator('.tile[data-act="open-feed"]').click()
        page.locator('[data-act="ftab"][data-arg="pump"]').click()
        page.locator('[data-fid="pL"]').fill("2")
    elif kind == "diaper":
        page.locator('.tile[data-act="open-dia"]').click()
    else:
        page.locator('[data-act="open-more"]').click()
        if kind in {"solids", "mile"}:
            page.locator(f'[data-act="quick"][data-arg="{kind}"]').click()
        else:
            page.locator(f'[data-act="open-{kind}"]').click()
        fid = {"solids": "food", "mile": "moment", "growth": "weight", "note": "note"}[kind]
        if kind == "solids":
            page.locator('[data-act="food-custom"]').click()
        page.locator(f'[data-fid="{fid}"]').fill("2" if kind == "growth" else "Fake entry")


def past_clock(page, day):
    date = page.locator('[data-fid="manualDate"]')
    clock = page.locator('[data-fid="manualClock"]')
    if date.count():
        date.fill(day)
    if clock.count():
        log_clock(page, "manual", "3:20", "PM")
    return date.count() == 1 and clock.count() == 1


def past_save(page, kind):
    if kind == "diaper":
        page.locator('[data-sheet] [data-act="dkind"][data-arg="W"]').evaluate("el => el.click()")
    button = page.locator('[data-sheet] [data-act="save"]')
    if button.is_enabled():
        button.click()
        page.wait_for_function("!S.busy")


def audit_past_dates(page, posts):
    for kind in ["pump", "diaper", "solids", "mile", "growth", "note"]:
        past_form(page, kind)
        typed = past_clock(page, "2026-11-07")
        if kind == "growth":
            typed = page.locator('[data-fid="manualDate"]').count() == 1
        before = len(posts)
        past_save(page, kind)
        event = posts[-1]["event"] if len(posts) > before else {}
        actual = event.get("date", event.get("time", "")[:10]) if kind == "growth" else event.get("start", event.get("time"))
        expected = "2026-11-07" if kind == "growth" else "2026-11-07T21:20:00.000Z"
        check(f"B5 {kind}: yesterday at 3:20 PM reaches the POST" if kind != "growth" else "B5 growth: yesterday reaches the POST", typed and actual == expected)
        past_form(page, kind)
        future = past_clock(page, "2026-11-09")
        if kind == "growth":
            future = page.locator('[data-fid="manualDate"]').count() == 1
        if kind == "diaper":
            page.locator('[data-sheet] [data-act="dkind"][data-arg="W"]').evaluate("el => el.click()")
        button = page.locator('[data-sheet] [data-act="save"]')
        check(f"B5 {kind}: a future time keeps saving off", future and all(button.nth(i).is_disabled() for i in range(button.count())))
    page.evaluate("() => {S.sheet=null;render();}")


def logged_by(page, name):
    chip = page.locator(f'[data-sheet] [data-act="logged-by"][data-arg="{name}"]')
    if chip.count() and chip.is_enabled():
        chip.click()
    return chip


def audit_past_adults(page, state, posts):
    for name in ["Rowan", "Wren"]:
        state["me"] = name
        page.evaluate("name => {S.me=name;render();}", name)
        past_form(page, "note")
        chips = page.locator('[data-sheet] [data-act="logged-by"]')
        check(f"B6 {name}: all three names appear with the signed-in name chosen", chips.all_inner_texts() == ["Rowan", "Sage", "Other"] and page.locator(f'[data-act="logged-by"][data-arg="{name}"][aria-pressed="true"]').count() == 1)
        logged_by(page, "Sage")
        past_save(page, "note")
        check(f"B6 {name}: an add sends the chosen Sage", posts[-1]["event"].get("by") == "Sage")
        page.evaluate("() => {S.sheet=null;S.entries=[{id:'notes:fake',type:'note',t:600,text:'Fake',by:'Sage'}];act('edit','notes:fake');render();}")
        check(f"B6 {name}: an edit starts with the saved name", page.locator('[data-act="logged-by"][data-arg="Sage"][aria-pressed="true"]').count() == 1)
        logged_by(page, "Rowan" if name == "Wren" else "Wren")
        past_save(page, "note")
        check(f"B6 {name}: an edit sends the changed name", posts[-1]["event"].get("by") == ("Rowan" if name == "Wren" else "Wren"))
    page.evaluate("() => {S.sheet=null;render();}")


def audit_past_photos(page, state):
    photos = []
    def save_photo(route):
        photos.append(route.request.post_data_buffer or b"")
        route.fulfill(json={"status": "saved", "operationId": "fake-photo", "state": state})
    page.route("**/api/photos", save_photo)
    try:
        past_form(page, "note")
        logged_by(page, "Sage")
        page.locator('[data-fid="photo"]').set_input_files({"name": "fake.png", "mimeType": "image/png", "buffer": bytes([137,80,78,71,13,10,26,10])})
        page.locator('.photo-picker', has_text="fake.png").wait_for()
        chips = page.locator('[data-sheet] [data-act="logged-by"]')
        check("B6 attaching a photo locks all three chips to Wren and says why", chips.count() == 3 and all(chips.nth(i).is_disabled() for i in range(3)) and page.locator('[data-act="logged-by"][data-arg="Wren"][aria-pressed="true"]').count() == 1 and "A note with a photo is logged by you." in page.locator('[data-sheet]').inner_text())
        past_save(page, "note")
        check("B6 a photo POST has no by", len(photos) == 1 and b'"by"' not in photos[0])
        page.evaluate("() => {S.entries=[{id:'notes:fake',type:'note',t:600,text:'Fake',by:'Sage',photo:'/fake.png'}];act('edit','notes:fake');render();}")
        chips = page.locator('[data-sheet] [data-act="logged-by"]')
        check("B6 a photo edit locks the saved name and says why", chips.count() == 3 and all(chips.nth(i).is_disabled() for i in range(3)) and page.locator('[data-act="logged-by"][data-arg="Sage"][aria-pressed="true"]').count() == 1 and "Logged by cannot change on a note with a photo." in page.locator('[data-sheet]').inner_text())
    finally:
        page.unroute("**/api/photos", save_photo)
        page.evaluate("() => {S.sheet=null;S.entries=[];render();}")


def audit_past_r1_unknown(page, state, posts):
    page.evaluate("() => {S.me='Rowan';S.sheet=null;S.entries=[{id:'notes:42',type:'note',t:600,text:'Fake imported note',by:'Unknown'}];act('edit','notes:42');render();}")
    chosen = page.locator('[data-act="logged-by"][data-arg="Rowan"][aria-pressed="true"]').count() == 1
    def edit(route):
        body = route.request.post_data_json
        posts.append(body)
        if body["event"].get("by") not in state["people"]:
            route.fulfill(status=400, json={"error": "Choose who logged this."})
        else:
            route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})
    page.route("**/api/events/notes:42", edit)
    try:
        past_save(page, "note")
        check("R1.1 Unknown defaults to Rowan and an unchanged edit saves with Rowan", chosen and posts[-1]["event"].get("by") == "Rowan" and page.locator('[data-sheet]').count() == 0)
    finally:
        page.unroute("**/api/events/notes:42", edit)
        page.evaluate("() => {S.sheet=null;S.message='';S.writeError='';render();}")


def audit_past_r1_clock(page, posts):
    for kind in ["diaper", "note", "solids", "mile", "pump"]:
        page.clock.set_fixed_time(instant("2026-11-08", 2, 0))
        past_form(page, kind)
        page.clock.set_fixed_time(instant("2026-11-08", 2, 15))
        past_save(page, kind)
        event = posts[-1]["event"]
        expected = instant("2026-11-08", 2, 15)
        check(f"R1.2 {kind} uses the time of the tap until a time is typed", event.get("start", event.get("time")) == expected)
    past_form(page, "diaper")
    past_clock(page, "2026-11-07")
    page.clock.set_fixed_time(instant("2026-11-08", 2, 30))
    past_save(page, "diaper")
    check("R1.2 a typed diaper time stays at yesterday 3:20 PM", posts[-1]["event"].get("time") == instant("2026-11-07", 15, 20))


def audit_past_r1_tabs(page, posts):
    page.clock.set_fixed_time(instant("2026-11-08", 18, 0))
    past_form(page, "pump")
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    page.locator('[data-act="milk"][data-arg="formula"]').click()
    past_clock(page, "2026-11-07")
    page.locator('[data-act="ftab"][data-arg="pump"]').click()
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    past_save(page, "bottle")
    check("R1.3 a bottle time survives a visit to the pump tab", posts[-1]["event"].get("time") == instant("2026-11-07", 15, 20))


def audit_past_r1_photo(page, posts):
    past_form(page, "note")
    logged_by(page, "Sage")
    page.locator('[data-fid="photo"]').set_input_files({"name": "fake.png", "mimeType": "image/png", "buffer": bytes([137,80,78,71,13,10,26,10])})
    page.locator('.photo-picker', has_text="fake.png").wait_for()
    page.locator('[data-act="remove-photo"]').click()
    chosen = page.locator('[data-act="logged-by"][data-arg="Sage"][aria-pressed="true"]').count() == 1
    past_save(page, "note")
    check("R1.4 removing a photo restores Sage and sends Sage", chosen and posts[-1]["event"].get("by") == "Sage")


def audit_past_r1_labels(page):
    for lang, expected in [("en", "Start time"), ("es", "Hora de inicio")]:
        for kind in ["pump", "tummy", "bath"]:
            page.evaluate("kind => {S.sheet=null;S.drafts={};if(kind==='pump'){act('open-feed');act('ftab','pump');}else act('quick',kind);render();}", kind)
            page.evaluate("lang => {S.lang=lang;render();}", lang)
            want = {"en": "Started", "es": "Inicio"}[lang] if kind == "pump" else expected  # R4: the pump form uses the mockup's Started
            check(f"R1.5 {kind} shows {want}", page.locator('label[for="f-manualClock"]').inner_text() == want)
    page.evaluate("() => {S.sheet=null;S.lang='en';render();}")


def audit_past_entries(page, state):
    page.clock.set_fixed_time(instant("2026-11-08", 18, 0))
    saved = deepcopy(state)
    state.update({"me": "Rowan", "people": ["Rowan", "Sage", "Wren"], "entries": [], "run": None, "sleepRun": None, "pumpRun": None})
    page.evaluate("state => {loadServerState(state);S.tab='home';S.sheet=null;render();}", state)
    posts = []
    def save(route):
        body = route.request.post_data_json
        posts.append(body)
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})
    page.route("**/api/events", save)
    page.route("**/api/events/**", save)
    try:
        audit_past_dates(page, posts)
        audit_past_adults(page, state, posts)
        audit_past_photos(page, state)
        audit_past_r1_unknown(page, state, posts)
        audit_past_r1_clock(page, posts)
        audit_past_r1_tabs(page, posts)
        audit_past_r1_photo(page, posts)
        audit_past_r1_labels(page)
    finally:
        page.unroute("**/api/events", save)
        page.unroute("**/api/events/**", save)
        state.clear()
        state.update(saved)
        page.evaluate("state => {loadServerState(state);S.sheet=null;render();}", state)


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            page = browser.new_page()
            page.add_init_script(OPEN_DETAILS)
            page.route("**/*", local_only)
            errors, requests = [], []
            page.on("pageerror", lambda err: errors.append(str(err)))
            actual_permissions = json.loads(subprocess.check_output([
                "node", str(ROOT.parent / "test/state-permissions-fixture.ts")
            ], text=True))
            state = {"me": {"id": "adult:1", "name": "Rowan"}, "people": [{"id": "adult:1", "name": "Rowan", "onDuty": True}, {"id": "adult:2", "name": "Sage"}], "child": {"id": "child:1", "name": "Ada"}, "entries": [], "run": None, "sleepRun": None, "pumpRun": None, "timers": [], "permissions":actual_permissions["adult"],"dutyNote":"Bottle at 2 am","dutyNoteBy":"Sage", "preferences": {"units": "metric", "lang": "en", "palette": "Sorbet", "night": False}, "pendingOperations": []}
            operations = {}
            page.route("**/api/session", lambda route: route.fulfill(json={"me": state["me"], "csrf": "csrf-1", "labels": {"Wren": {"en": "Other", "es": "Otra persona"}}}))
            page.route("**/api/state**", lambda route: route.fulfill(json=state))  # also the dated reload after a save on an older day

            def mutation(route):
                req = route.request
                body = req.post_data_json
                requests.append((req.method, req.url, req.headers.get("x-csrf-token"), body))
                if len(requests) == 1:
                    # A known terminal failure must leave the form open and the timeline unchanged.
                    route.fulfill(json={"status": "failed", "operationId": body["operationId"], "error": "Test failure", "state": state})
                    return
                event = body["event"]
                state["entries"] = [{"id": "app:event-1", **event, "t": 600, "by": "Rowan"}]
                route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": state})

            page.route("**/api/events", mutation)
            def save_preferences(route):
                payload=route.request.post_data_json
                state["preferences"].update(payload)
                route.fulfill(json={"status":"saved","operationId":payload["operationId"],"state":state})
            page.route("**/api/preferences",save_preferences)
            page.goto(base)
            page.locator('.tile[data-act="open-feed"]').wait_for()
            audit_feed_ranges(browser, base, state, check)
            audit_redraw_typing(browser, base, state, check)
            audit_save_failure(page, requests)
            retry_ids = []
            def retry(route):
                payload = route.request.post_data_json
                retry_ids.append(payload["operationId"])
                if len(retry_ids) == 1:
                    route.abort()
                else:
                    route.fulfill(json={"status": "saved", "operationId": payload["operationId"], "state": state})
            page.route("**/api/timers", retry)
            outcome = page.evaluate("""async () => { const id='same-operation-id'; try { await LittleDaysAPI.writes.startTimer({kind:'feed',side:'L'}, id); } catch (_) {} return await LittleDaysAPI.writes.startTimer({kind:'feed',side:'L'}, id); }""")
            check("retry retains the same idempotency key", len(retry_ids) == 2 and retry_ids[0] == retry_ids[1] == "same-operation-id" and outcome.get("confirmed") is True)

            # A saved photo travels as multipart form data and remains a File, not JSON/base64.
            photo_headers, photo_bytes = [], []
            def photo(route):
                photo_headers.append(route.request.headers.get("content-type", ""))
                photo_bytes.append(route.request.post_data_buffer or b"")
                route.fulfill(json={"status": "saved", "operationId": "photo-op", "state": state})
            page.route("**/api/photos", photo)
            page.locator('[data-act="open-more"]').click()
            page.locator('[data-act="open-note"]').click()
            with page.expect_file_chooser() as chooser:
                page.get_by_role("button", name="Add photo", exact=True).click()
            chooser.value.set_files({"name":"tiny.png","mimeType":"image/png","buffer":bytes([137,80,78,71,13,10,26,10])})
            page.locator(".photo-picker", has_text="tiny.png").wait_for()
            check("Add photo opens the file chooser and shows the selected name", not page.locator('[data-fid="photo"]').is_visible() and page.locator('.photo-picker').inner_text().endswith("tiny.png"))
            page.get_by_role("button", name="Save", exact=True).click()
            page.wait_for_function("!S.sheet && !S.busy")
            check("photo uses multipart file upload rather than base64 JSON", len(photo_headers) == 1 and photo_headers[0].startswith("multipart/form-data; boundary=") and b"tiny.png" in photo_bytes[0] and b"data:image/" not in photo_bytes[0])

            # Reload state has only the operation ID; GET supplies the retained photo event.
            recovery_event={"type":"note","time":"2026-10-24T08:30:00.000Z","text":"Keep this timestamp"}
            state["pendingOperations"]=[{"operationId":"reload-photo-op","status":"pending"}]
            recovered_posts=[]
            page.route("**/api/operations/reload-photo-op",lambda route:route.fulfill(json={"status":"pending","operationId":"reload-photo-op","needsRetry":True,"requiresPhoto":True,"event":recovery_event,"portrait":False}))
            def retry_photo(route):
                data=route.request.post_data_buffer or b"";recovered_posts.append(data)
                route.fulfill(json={"status":"saved","operationId":"reload-photo-op","state":state})
            page.route("**/api/photos",retry_photo)
            page.reload()
            page.wait_for_function("document.querySelector('[data-status]')?.textContent.includes('Select the same photo')",timeout=5000)
            page.locator('[data-status] [data-act="retry-write"]').click()
            page.locator("#retry-photo-picker").set_input_files({"name":"retry.png","mimeType":"image/png","buffer":bytes([137,80,78,71,13,10,26,10])})
            page.wait_for_function("document.querySelector('[data-status]')?.textContent.toLowerCase().includes('saved')",timeout=5000)
            recovered_body=recovered_posts[-1] if recovered_posts else b""
            check("photo retry after reload uses GET event and same operation ID",b"reload-photo-op" in recovered_body and b"Keep this timestamp" in recovered_body and b"2026-10-24T08:30:00.000Z" in recovered_body and b"retry.png" in recovered_body)
            state["pendingOperations"]=[]

            # Use records.state's real grants with an active timer; no client-only timers permission fixture.
            manual_events=[]
            def manual_event(route):
                body=route.request.post_data_json
                manual_events.append(body["event"])
                route.fulfill(json={"status":"saved","operationId":body["operationId"],"state":state})
            page.route("**/api/events",manual_event)
            state["sleepRun"]={"id":"timer:sleep-active","t0":600,"by":"Sage"}
            state["permissions"]=actual_permissions["caregiver"]
            page.evaluate("state => {S.permissions=state.permissions;S.sleepRun=state.sleepRun;render()}",state)
            check("caregiver active timer is loaded before opening Sleep",page.evaluate("S.sleepRun?.id")=="timer:sleep-active")
            page.locator('.tile[data-act="open-sleep"]').click()
            check("another adult's active sleep timer without the stop grant shows a disabled End sleep, not manual fields",page.locator('[data-fid="manualDate"]').count()==0 and page.locator('[data-sheet] [data-act="stop-sleep"]').inner_text().strip()=="End sleep" and page.locator('[data-sheet] [data-act="stop-sleep"]').is_disabled())
            page.locator('[data-sheet] [data-act="manual"]').click()
            page.locator('[data-sheet] [data-act="nap"][data-arg="nap"]').click()
            page.locator('[data-fid="manualDate"]').fill(page.evaluate("dayISO(-1)"))
            page.locator('[data-fid="manualClock"]').fill("8:00")
            set_period(page, "manual", "AM")
            page.locator('[data-fid="manualEndClock"]').fill("9:00")
            set_period(page, "manualEnd", "AM")
            check("manual sleep accepts a past start and end time",not page.locator('[data-sheet] [data-act="save"]').is_disabled())
            page.locator('[data-sheet] [data-act="save"]').click()
            page.wait_for_function("document.querySelector('[data-status]')?.textContent.toLowerCase().includes('saved')")
            sleep_event=manual_events[-1] if manual_events else {}
            check("manual sleep posts selected start and nonfuture end",sleep_event.get("start","").endswith("Z") and sleep_event.get("end","").endswith("Z") and sleep_event.get("duration")==60 and sleep_event.get("start")<sleep_event.get("end"))
            check("saving a past manual sleep keeps the current sleep timer",page.evaluate("S.sleepRun?.id")=="timer:sleep-active")

            state["sleepRun"]=None
            state["permissions"]=actual_permissions["adult"]
            page.evaluate("state => {S.permissions=state.permissions;S.sleepRun=state.sleepRun;render()}",state)
            page.evaluate("state => {S.permissions=state.permissions;render()}",state)
            page.locator('[data-act="open-more"]').click()
            page.locator('[data-act="quick"][data-arg="tummy"]').click()
            page.locator('[data-fid="manualDate"]').fill(page.evaluate("dayISO(0)"))
            page.locator('[data-fid="manualClock"]').fill("11:59")
            set_period(page, "manual", "PM")
            page.locator('[data-fid="duration"]').fill("10")
            check("manual tummy time rejects a future end",page.locator('[data-sheet] [data-act="save"]').is_disabled())
            page.locator('[data-sheet] [data-act="cancel"]').click()
            page.locator('[data-sheet] [data-act="discard"]').click()

            op_checks=[]
            def uncertain(route):
                op_checks.append(route.request.method)
                result={"status":"pending","operationId":"bounded-op"} if len(op_checks)==1 else {"status":"saved","operationId":"bounded-op","state":state}
                if len(op_checks)==1:
                    page.evaluate("window.__pollClockOffset=40000")
                route.fulfill(json=result)
            page.route("**/api/operations/bounded-op",uncertain)
            page.evaluate("""() => {const original=Date.now;window.__realNow=original;window.__pollClockOffset=0;Date.now=()=>original()+window.__pollClockOffset;void acceptWrite({status:'pending',operationId:'bounded-op'},()=>t('saved'),{undoable:false,toast:false})}""")
            page.locator('[data-status] [data-act="retry-write"]').wait_for(timeout=5000)
            check("uncertain operation polling stops and offers Check again",page.locator('[data-status]').inner_text().lower().find('check again')>=0 and op_checks==["GET"])
            page.locator('[data-status] [data-act="retry-write"]').click()
            page.wait_for_function("document.querySelector('[data-status]')?.textContent.toLowerCase().includes('saved')",timeout=5000)
            page.evaluate("Date.now=window.__realNow")
            check("Check again reads the same operation instead of posting a new write",op_checks==["GET","GET"])

            timer_posts = []
            stop_id = "stop-operation-1"
            # Keep the mock deadline within the browser's timer range; 2030 overflows setTimeout.
            undo_until = page.evaluate("new Date(Date.now()+10000).toISOString()")
            undo_ids = []
            correction_mode={"required":False,"corrected":False,"payload":None}
            def timers(route):
                req=route.request
                body=req.post_data_json
                timer_posts.append((req.url,body))
                if req.url.endswith("/api/timers"):
                    state["run"]={"id":"timer:feed-1","side":body["side"],"t0":600,"by":"Rowan"}
                    route.fulfill(json={"status":"saved","operationId":body["operationId"],"state":state})
                else:
                    route.fulfill(json={"status":"pending","operationId":stop_id,"undoUntil":undo_until,"state":state})
            def operations(route):
                req=route.request
                if req.method=="GET":
                    if correction_mode["required"] and not correction_mode["corrected"]:
                        start="2026-10-24T07:00:00.000Z"
                        route.fulfill(json={"status":"pending","operationId":stop_id,"correctionRequired":True,"timerId":"timer:long","start":start,"maxEnd":"2026-10-25T07:00:00.000Z"})
                        return
                    if correction_mode["corrected"]:
                        state["run"]=None
                        route.fulfill(json={"status":"saved","operationId":stop_id,"undoUntil":undo_until,"state":state})
                        return
                    # Like the real server: the stop stays pending until Undo or its deadline; Undo cancels it.
                    if undo_ids:
                        route.fulfill(json={"status":"cancelled","operationId":stop_id,"state":state})
                    else:
                        route.fulfill(json={"status":"pending","operationId":stop_id,"undoUntil":undo_until,"state":state})
                else:
                    body=req.post_data_json
                    if undo_ids:
                        route.fulfill(status=409,json={"error":"The Undo period has ended. Edit the saved entry instead."});return
                    undo_ids.append(body["operationId"])
                    state["run"]={"id":"timer:feed-1","side":"L","t0":600,"by":"Rowan"}
                    state["entries"]=[e for e in state["entries"] if e["id"]!="app:feed-1"]
                    route.fulfill(json={"status":"cancelled","operationId":stop_id,"state":state})
            page.route("**/api/timers**", timers)
            page.route("**/api/operations/**", operations)
            page.locator('.tile[data-act="open-feed"]').evaluate("el => el.click()")
            page.locator('.side[data-act="manualSide"][data-arg="L"]').evaluate("el => el.click()")  # R4: choose the side, then Start
            page.locator('[data-sheet] .btn-primary[data-act="start"]').evaluate("el => el.click()")
            page.locator('.run-card [data-act="open-feed"]').wait_for()
            page.locator('.run-card [data-act="open-feed"]').evaluate("el => el.click()")
            stop_click(page, '[data-sheet] [data-act="stop"]', evaluate=True)
            # The server accepts Undo only while the stop is pending, so Undo must show during that window.
            page.locator('.toast[role="status"] [data-act="undo"]').wait_for(timeout=1000)
            stop_ok=any(url.endswith("/stop") for url, _ in timer_posts) and page.locator('.toast [data-act="undo"]').is_visible() and page.locator('.run-card').count()==0 and "saved" not in page.locator('.toast span').first.inner_text().lower()
            if not stop_ok: print("timer debug",state["run"],timer_posts, page.locator("[data-status]").inner_text())
            check("timer stop offers Undo during the pending window and hides the running card", stop_ok)
            page.evaluate("S.sleepRun={id:'timer:sleep-second',t0:600,by:'Rowan'};render();stopTimer('sleep')")
            check("a second Stop waits for the first Undo window instead of replacing its Undo",not any("sleep-second" in url for url, _ in timer_posts) and "can still be undone" in page.locator("[data-status]").inner_text() and page.locator('.toast [data-act="undo"]').is_visible())
            page.evaluate("S.sleepRun=null;S.message='';render()")
            page.locator('.toast [data-act="undo"]').click()
            page.wait_for_function("document.querySelector('[data-status]')?.textContent === 'Undone.'",timeout=5000)
            undo_ok=all([state["run"] is not None, len(undo_ids)==1,
                         page.locator('.toast [data-act="undo"]').count()==0,
                         page.locator('.run-card [data-act="open-feed"]').is_visible(),
                         page.evaluate("!S.stopping.has('timer:feed-1')")])
            check("cancelled Undo restores a visible timer and clears its stop guard", undo_ok)
            page.screenshot(path="/tmp/little-days-jh7r-r5-undo-restored.png")

            # A lost Stop reply has an unknown outcome, so the timer stays hidden; a 409 rejection shows it again.
            lost_stop=lambda route:route.abort()
            lost_check=lambda route:route.abort() if route.request.method=="GET" else route.fallback()
            page.route("**/api/timers/**/stop",lost_stop)
            page.route("**/api/operations/*",lost_check)
            page.locator('.run-card [data-act="open-feed"]').click(timeout=10000)
            stop_click(page, '[data-sheet] [data-act="stop"]')
            page.wait_for_function("document.querySelector('[data-status]')?.textContent.trim() && !document.querySelector('[data-status]').textContent.includes('Saving')",timeout=5000)
            check("lost Stop reply keeps the timer hidden and blocks a second Stop",page.locator('.run-card').count()==0)
            page.unroute("**/api/timers/**/stop",lost_stop)
            page.unroute("**/api/operations/*",lost_check)
            page.locator('[data-status] [data-act="retry-write"]').click(timeout=10000)
            page.locator('.run-card').wait_for(state='attached',timeout=5000)
            check("Check again finishes a lost Stop and shows the timer once the server reports it cancelled",page.locator('.run-card').count()==1)
            # Check again that learns the server never received the stop shows the timer and offers the same request again.
            not_found=lambda route:route.fulfill(status=404,json={"error":"Operation not found."}) if route.request.method=="GET" else route.fallback()
            page.route("**/api/timers/**/stop",lost_stop)
            page.route("**/api/operations/*",lost_check)
            page.evaluate("S.sheet=null;render()")  # the cancelled stop leaves its form open
            page.locator('.run-card [data-act="open-feed"]').click(timeout=10000)
            stop_click(page, '[data-sheet] [data-act="stop"]')
            page.locator('[data-status] [data-act="retry-write"]').wait_for(timeout=5000)
            page.unroute("**/api/operations/*",lost_check)
            page.route("**/api/operations/*",not_found)
            page.locator('[data-status] [data-act="retry-write"]').click()
            page.locator('.run-card').wait_for(state='attached',timeout=5000)
            check("Check again after a 404 shows the timer and offers the same Stop again",page.locator('.run-card').count()==1 and page.locator('[data-status] [data-act="retry-write"]').count()==1)
            page.unroute("**/api/timers/**/stop",lost_stop)
            page.unroute("**/api/operations/*",not_found)
            page.reload()
            rejected_stops=[]
            def rejected_stop(route):
                rejected_stops.append(route.request.post_data_json)
                route.fulfill(status=409,json={"error":"This timer is already being stopped. Refresh its status."})
            page.route("**/api/timers/**/stop",rejected_stop)
            page.locator('.run-card [data-act="open-feed"]').click()
            stop_click(page, '[data-sheet] [data-act="stop"]')
            page.locator("[data-status]",has_text="already being stopped").wait_for(timeout=5000)
            check("rejected Stop shows the timer again",page.locator('.run-card').count()==1)
            check("rejected Stop leaves the timer form usable",page.locator('[data-sheet] [data-act="stop"]').is_enabled())
            page.unroute("**/api/timers/**/stop",rejected_stop)
            retried_stops=[]
            def retry_rejected_stop(route):
                body=route.request.post_data_json
                retried_stops.append(body)
                route.fulfill(json={"status":"failed","operationId":body["operationId"],"error":"Retry reached the server."})
            page.route("**/api/timers/**/stop",retry_rejected_stop)
            if page.locator('[data-sheet] [data-act="stop"]').is_enabled():
                stop_click(page, '[data-sheet] [data-act="stop"]')
                page.locator("[data-status]",has_text="Retry reached the server").wait_for(timeout=5000)
            check("a rejected Stop retries with a new save ID without reloading",len(retried_stops)==1 and retried_stops[0]["operationId"]!=rejected_stops[0]["operationId"])
            page.unroute("**/api/timers/**/stop",retry_rejected_stop)
            page.reload()
            failed_stop=lambda route:route.fulfill(json={"status":"failed","operationId":"stop-failed-1","error":"Stop failed for this test."})
            page.route("**/api/timers/**/stop",failed_stop)
            page.locator('.run-card [data-act="open-feed"]').click()
            stop_click(page, '[data-sheet] [data-act="stop"]')
            page.locator("[data-status]",has_text="Stop failed for this test").wait_for(timeout=5000)
            check("Stop that fails at once shows the timer again",page.locator('.run-card').count()==1)
            page.unroute("**/api/timers/**/stop",failed_stop)
            page.reload()
            page.locator('.run-card [data-act="open-feed"]').wait_for()

            # A pump record keeps independent left and right values when edited.
            audit_pump_edit(page, state)

            audit_typed_entries(page, state, manual_events)

            correction_mode["required"]=True
            undo_until = page.evaluate("new Date(Date.now()+10000).toISOString()")
            state["run"]={"id":"timer:long","side":"L","t0":-1500,"by":"Rowan"}
            page.route("**/api/timers/**/stop",lambda route:route.fulfill(json={"status":"pending","operationId":stop_id,"state":state}))
            def correct(route):
                correction_mode["payload"]=route.request.post_data_json
                correction_mode["corrected"]=True
                route.fulfill(json={"status":"pending","operationId":stop_id,"undoUntil":undo_until})
            page.route("**/api/operations/stop-operation-1/correct",correct)
            page.reload()
            page.locator('.run-card [data-act="open-feed"]').wait_for()
            page.locator('.run-card [data-act="open-feed"]').click()
            stop_click(page, '[data-sheet] [data-act="stop"]')
            page.get_by_role("dialog",name="Correct timer end").wait_for(timeout=5000)
            check("long timer asks for an actual end time before saving",page.locator('[data-fid="correctDate"]').input_value()!="" and not page.locator('[data-sheet] [data-act="save"]').is_disabled())
            box=page.locator('[data-fid="correctClock"]')
            before=box.input_value()
            box.fill("21:30")
            check("an invalid corrected end time turns Save off and asks for a time like 9:30",page.locator('[data-sheet] [data-act="save"]').is_disabled() and page.locator("[data-sheet] [data-correction-error]").inner_text()=="Enter a time like 9:30.")
            box.fill(before)
            check("timer that needs a corrected end is not hidden behind the correction form",page.locator('.run-card').count()==1)
            capture_sheet(page,"correction-en")
            page.get_by_role("button",name="Save").click()
            page.wait_for_function("document.querySelector('.toast [data-act=undo]') !== null",timeout=5000)
            check("corrected timer posts an absolute end time and offers bounded Undo",correction_mode["payload"] and correction_mode["payload"].get("end","").endswith("Z") and page.locator('.toast [data-act="undo"]').is_visible())
            capture_all_sheets(page,"en")
            open_settings(page)
            pick_setting(page, "lang", "es")
            page.wait_for_function("S.lang === 'es'")
            close_settings(page)
            capture_all_sheets(page,"es")
            timer_ticks=page.evaluate("""() => {
              const original=Date.now,base=Date.now(),startedAt=new Date(base).toISOString();
              const timer={id:'timer:clock',side:'L',t0:0,startedAt,by:'Rowan'};
              S.lang='en';S.run=timer;S.sleepRun={...timer,nap:true};S.pumpRun=timer;S.sheet={kind:'feed',tab:'pump',pL:0,pR:0,vu:'ml'};render();
              Date.now=()=>base+30000;updateTimerDisplays();
              const at30=['[data-live="run"]','[data-live="sleep"]','[data-live="pump"]'].map(q=>document.querySelector(q)?.textContent);
              Date.now=()=>base+65000;updateTimerDisplays();
              const at65=['[data-live="run"]','[data-live="sleep"]','[data-live="pump"]'].map(q=>document.querySelector(q)?.textContent);
              Date.now=original;S.run=null;S.sleepRun=null;S.pumpRun=null;S.sheet=null;render();return {at30,at65};
            }""")
            plain=lambda texts:[text.replace("\u00a0"," ") for text in texts]  # a number and its unit are joined by a no-break space
            check("feed, sleep and pump timers show seconds and cross minute boundaries accurately",plain(timer_ticks["at30"])==["0 m 30 s"]*3 and plain(timer_ticks["at65"])==["1 m 05 s"]*3)
            audit_start_times(page, state)
            audit_wrong_side(page, state)
            audit_switch_time(page, state)
            audit_review_switch(page, state)
            audit_switch_review_r2(page, state)
            audit_sign_in_again(page, state)
            audit_pump_amount_only(page, state)
            audit_past_entries(page, state)
            audit_log_edits(browser, base, state)
            audit_failed_sleep_save(page, state)
            check("browser has no uncaught JavaScript errors", not errors)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
