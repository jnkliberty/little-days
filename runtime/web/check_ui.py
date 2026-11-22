"""Focused, test-only browser checks for the production shell."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import json
import os
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright
from forms_support import pick_setting
from check_support import development_batch, launch_browser, open_app, start_static_server

ROOT = Path(__file__).resolve().parent
# An invented household passcode, and the adult names that a correct one returns.
PASSCODE = "synthetic household code"
ADULTS = ["Rowan", "Sage", "Wren"]
ADULT_LABELS = {"Wren": {"en": "Other", "es": "Otra persona"}}


def passcode_route(route, seen=None):
    """The server's passcode step: the names and labels for a correct passcode, 401 and no names for any other."""
    body = route.request.post_data_json
    if seen is not None:
        seen.append(body)
    if body.get("passcode") == PASSCODE:
        route.fulfill(json={"people": ADULTS, "labels": ADULT_LABELS})
    else:
        route.fulfill(status=401, json={"error": "That passcode is not right."})


def audit_signin_style(page, step):
    """The sign-in screens follow DESIGN.md: 16 px fields with the field outline, a 56 px pill primary button, lilac focus, a 16 px tinted error row."""
    ids = {"passcode": ("#passcode-form", "input[name=passcode]"), "names": ("#login-form", "select[name=username]")}
    form, field = ids[step]
    page.locator(f"{form} {field}").focus()
    got = page.evaluate("""([form, field]) => {
      const f = document.querySelector(form + ' ' + field), b = document.querySelector(form + ' button[type=submit]'), c = document.querySelector(form), cs = x => getComputedStyle(x), e = document.querySelector(form + ' .shell-error');
      const root = cs(document.documentElement);
      return {fieldRadius: cs(f).borderTopLeftRadius, fieldBorder: cs(f).borderTopColor, fieldWidth: cs(f).borderTopWidth, fieldHeight: f.getBoundingClientRect().height, focus: cs(f).outlineColor, fieldToken: root.getPropertyValue('--field').trim(),
        buttonHeight: b.getBoundingClientRect().height, buttonRadius: cs(b).borderTopLeftRadius, buttonFill: cs(b).backgroundColor, lilac: root.getPropertyValue('--lilac').trim(), cardRadius: cs(c).borderTopLeftRadius, errorRadius: e ? cs(e).borderTopLeftRadius : null}}""", [form, field])
    def rgb(hex_color):
        value = hex_color.lstrip("#")
        return "rgb(%d, %d, %d)" % tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
    check(f"{step} screen: the field has a 16 px radius, a 1 px field-token outline and a 48 px or taller target", got["fieldRadius"] == "16px" and got["fieldBorder"] == rgb(got["fieldToken"]) and got["fieldWidth"] == "1px" and got["fieldHeight"] >= 48)
    check(f"{step} screen: the field shows a lilac focus ring", got["focus"] == rgb(got["lilac"]))
    check(f"{step} screen: the primary button is a 56 px lilac pill and the card has a 24 px radius", got["buttonHeight"] >= 56 and float(got["buttonRadius"][:-2]) >= 28 and got["buttonFill"] == rgb(got["lilac"]) and got["cardRadius"] == "24px")
    if got["errorRadius"]:
        check(f"{step} screen: the error row is a 16 px tinted row", got["errorRadius"] == "16px")


def unlock(page, passcode=PASSCODE):
    """Type the household passcode on the first sign-in screen and wait for the name picker."""
    page.locator("#passcode-form").wait_for(timeout=5000)
    page.locator("#passcode-form input[name=passcode]").fill(passcode)
    page.locator("#passcode-form button[type=submit]").click()
    page.locator("#login-form").wait_for(timeout=5000)


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


def navigate(page, tab):
    page.locator(".app").wait_for()
    back = page.locator(".screen-top [data-arg=home], .screen-top [data-act=chat-back]")
    if back.count():
        back.click()
    if tab != "home":
        link = page.locator(f'.wrap [data-act=tab][data-arg="{tab}"]')
        if link.count():
            link.first.click()
        else:  # round 3: an empty Home has no Today card, so no Timeline link; open the tab directly
            page.evaluate(f"act('tab','{tab}')")
        if tab == "log":  # the Timeline loads its earlier day on opening and redraws when it arrives
            page.wait_for_load_state("networkidle")


def open_settings(page):
    # Settings open from the Settings row on Home (R3). They were in More (owner request, 2026-11-09).
    if not page.locator(".settings-card").count():
        page.settings_from = page.evaluate("S.tab")
        navigate(page, "home")
        page.locator('[data-act="open-settings"]').click()
    page.locator(".settings-card").first.scroll_into_view_if_needed()
    if not page.locator("[data-night]").count() and page.locator('[data-act="night-open"]').count():
        page.locator('[data-act="night-open"]').click()  # round 3: the Night row opens the dim options below it


def close_settings(page):
    if page.locator(".settings-card").count():
        page.locator('[data-sheet] [data-act="cancel"]').click()
    if getattr(page, "settings_from", "home") != "home":
        navigate(page, page.settings_from)
    page.settings_from = "home"


def fill_care_clock(page, key, date, hour, minute="00", period="AM"):
    page.locator(f'[data-fid="{key}Date"]').fill(date)
    page.locator(f'[data-fid="{key}Clock"]').fill(f"{hour}:{minute}")
    page.locator(f'[data-fid="{key}Period"]').select_option(period)


def state_response():
    return {"me": {"id": "adult:1", "name": "Care Adult"}, "people": [{"id": "adult:1", "name": "Care Adult", "onDuty": True}],
            "child": {"id": "child:1", "name": "Ada"}, "entries": [], "run": None, "sleepRun": None,
            "permissions":{"canStopOtherAdultsTimers":True,"resources":{name:{"view":True,"add":True,"change":True,"delete":True} for name in ["feedings","changes","sleep","pumping","weight","height","head-circumference","children"]}},
            "preferences": {"units": "metric", "language": "en"}}


def audit_next_side(page):
    page.clock.set_fixed_time("2026-11-08T00:00:00Z")  # 6 PM in Mexico City
    cases = [
        ("A", [{"type":"feed","side":"L","t":1020}], "Right side is next.", "R"),
        ("B", [{"type":"feed","side":"R","t":1020},{"type":"bottle","t":1050}], "Left side is next.", "L"),
        ("C", [{"type":"bottle","t":1050}], None, None),
        ("D", [{"type":"feed","side":"B","t":1020}], None, None),
        ("E", [{"type":"feed","side":"B","t":1020},{"type":"bottle","t":1050}], None, None),
        ("G", [], None, None),
    ]
    for name, entries, expected, side in cases:
        result = page.evaluate("""entries => {
          S.entries=entries; S.run=null; S.stopping=new Set(); S.lang='en'; S.tab='home'; S.sheet=null;
          S.permissions.resources.timers={view:true,add:true,change:true,delete:true}; S.permissions.canStopOtherAdultsTimers=true; render();
          const detail=document.querySelector('.wrap').innerText;
          S.sheet={kind:'feed',tab:'breast',pL:0,pR:0,vu:'ml'}; render();
          return {detail, side:[...document.querySelectorAll('[data-sheet] .side')].find(b=>b.querySelector('.sub')?.textContent.trim()==='Next side')?.dataset.arg || null};
        }""", entries)
        check(f"next side {name}: hint only in breast panel", "side is next" not in result["detail"] and result["side"] == side)
    result = page.evaluate("""() => {
      S.entries=[{type:'feed',side:'R',t:1020}]; S.run={id:'timer',side:'L',t0:1050,by:'Care Adult'}; S.stopping=new Set(); S.sheet=null; render();
      const running=!!document.querySelector('.wrap .run-card');
      S.sheet={kind:'feed',tab:'breast',pL:0,pR:0,vu:'ml'}; render(); const panel=!!document.querySelector('[data-sheet] .side[data-pressed]');
      S.stopping.add('timer'); S.sheet=null; render(); const detail=document.querySelector('.wrap').innerText;
      S.sheet={kind:'feed',tab:'breast',pL:0,pR:0,vu:'ml'}; render();
      return {running,panel,detail,side:[...document.querySelectorAll('[data-sheet] .side')].find(b=>b.querySelector('.sub')?.textContent.trim()==='Next side')?.dataset.arg};
    }""")
    check("next side F: running timer stays visible", result["running"] and result["panel"])
    check("next side pending stop uses saved feed", "side is next" not in result["detail"] and result["side"] == "L")
    result = page.evaluate("""() => {
      S.run=null; S.stopping=new Set(); S.sheet=null; S.lang='es';
      S.entries=[{type:'feed',side:'R',t:1020},{type:'bottle',t:1050}]; render();
      const spanish=document.querySelector('.wrap').innerText;
      S.entries[0].t=-420; render(); const yesterday=document.querySelector('.wrap').innerText;
      S.entries[0].t=-1860; render(); const older=document.querySelector('.wrap').innerText;
      return {spanish,yesterday,older};
    }""")
    check("Spanish Feed tile omits next-side text", "Sigue el lado" not in result["spanish"])
    check("older Feed tiles omit next-side text", all("Sigue el lado" not in result[key] for key in ("yesterday", "older")))


def audit_sleep_stop_permission(page):
    page.evaluate("""() => { S.permissions.resources.timers={view:true,add:true,change:true,delete:false}; S.permissions.canStopOtherAdultsTimers=false; S.sleepRun={by:'Wren',startedAt:new Date().toISOString()}; render(); }""")
    page.locator('.tile[data-act="open-sleep"]').click()
    check("another adult's active sleep timer stays visible with stop disabled", page.locator("[data-sheet] .run").count()==1 and page.locator("[data-sheet] [data-act=stop-sleep]:disabled").count()==1)
    page.get_by_role("button", name="Cancel", exact=True).click()
    page.evaluate("""() => { S.permissions.resources.timers={view:true,add:true,change:true,delete:true}; S.permissions.canStopOtherAdultsTimers=true; S.sleepRun=null; render(); }""")


def audit_timeline_rows(page, loaded):
    loaded["entries"]=[
        {"id":"long-note","type":"note","title":"Handoff","text":"A long note with practical details that should wrap across several lines without colliding with the time or author.","t":500,"by":"Sage Mercado"},
        {"id":"sleep-row","type":"sleep","nap":True,"dur":90,"t":600,"by":"Sage"},
        {"id":"feed-row","type":"feed","side":"L","dur":20,"t":720,"by":"Rowan"},
        {"id":"wet-row","type":"diaper","kind":"W","t":780,"by":"Sage"},
        {"id":"dirty-row","type":"diaper","kind":"D","tex":"soft","col":"yellow","t":840,"by":"Rowan"},
    ]
    page.reload();navigate(page, "log");note_row=page.locator('[data-row="long-note"]');aligned=True
    for width,height in [(320,740),(390,844)]:
        page.set_viewport_size({"width":width,"height":height});note_row.scroll_into_view_if_needed()
        details=note_row.locator(".sub").bounding_box();author=note_row.locator("strong").bounding_box();clock=note_row.locator("time").bounding_box()
        aligned=aligned and bool(details and author and clock and author["x"]>=details["x"] and author["x"]+author["width"]<=clock["x"]+1 and details["height"]>45)
        page.screenshot(path=f"/tmp/little-days-runtime-timeline-{width}.png")
    check("timeline author stays inside details column before clock at 320 and 390px",aligned)
    loaded["preferences"]={"units":"us","language":"es"};page.reload();navigate(page, "log")
    for width,height in [(320,740),(390,844)]:
        page.set_viewport_size({"width":width,"height":height});note_row.scroll_into_view_if_needed()
        page.screenshot(path=f"/tmp/little-days-runtime-timeline-es-{width}.png")
    check("Spanish timeline includes wet and dirty entries",page.locator('[data-arg="wet-row"]').count()==1 and page.locator('[data-arg="dirty-row"]').count()==1)
    audit_timeline_look(page)


def audit_timeline_look(page):
    """Look A on the Timeline: a drawn icon on a care-color block for each care row, a breast icon that is not the bottle, and tinted, labelled day totals."""
    # The fills and tints below are the day values. Auto turns the night look on from 8 PM to 7 AM, so pin the day look here and put the choice back at the end.
    mode = page.evaluate("() => { const m = LittleDaysTheme.mode(); LittleDaysTheme.set('off'); LittleDaysTheme.apply(); return m; }")
    page.evaluate("""() => { S.lang='en'; S.filter='all'; S.search=''; S.day=0;
      S.entries=[...S.entries,{id:'bottle-row',type:'bottle',ml:90,milk:'formula',t:60,by:'Rowan'},{id:'both-row',type:'diaper',kind:'B',t:70,by:'Rowan'},{id:'pump-row',type:'pump',ml:50,t:80,by:'Rowan'}]; render(); }""")
    art = lambda row: page.evaluate("id => document.querySelector(`[data-row=\"${id}\"] .ico`)?.dataset.art || ''", row)
    check("timeline icons: a breast feed shows the breast icon, a bottle the bottle, sleep the moon", art("feed-row") == "nurse" and art("bottle-row") == "bottle" and art("sleep-row") == "moon")
    check("timeline icons: wet, dirty and both diapers each have their own drawing", [art("wet-row"), art("dirty-row"), art("both-row")] == ["wet", "dirty", "diaper"])
    fills = page.evaluate("""() => Object.fromEntries(['feed-row','sleep-row','wet-row','long-note','pump-row'].map(id => [id, getComputedStyle(document.querySelector(`[data-row="${id}"] .plate`)).fill]))""")
    check("timeline blocks use the care fills; notes and pumping stay neutral", fills == {"feed-row": "rgb(244, 194, 106)", "sleep-row": "rgb(174, 204, 252)", "wet-row": "rgb(89, 197, 192)", "long-note": "rgb(224, 225, 230)", "pump-row": "rgb(224, 225, 230)"})
    totals = page.evaluate("""() => [...document.querySelectorAll('[data-day-totals] .total')].map(e => ({cls: [...e.classList].filter(c => c !== 'total').join(' '), bg: getComputedStyle(e).backgroundColor, label: e.querySelector('dt').textContent}))""")
    tint = {"t-feed": "rgb(255, 240, 214)", "t-sleep": "rgb(228, 237, 254)", "t-dia": "rgb(204, 243, 239)"}
    check("day totals are tinted rows with a word label, so color is not the only cue", len(totals) >= 2 and all(t["cls"] in tint and t["bg"] == tint[t["cls"]] and len(t["label"]) > 3 for t in totals))
    page.evaluate("m => { LittleDaysTheme.set(m); LittleDaysTheme.apply(); }", mode)


def audit_upcoming_appointment_time(page, loaded):
    # Director, 2026-11-11: the Next appointment card has two sub lines, the place, then the date and time together. No right column.
    loaded["upcomingAppointments"]=[{"id":"upcoming-appointment","title":"Pediatric visit","provider":"Family Clinic","t":int(time.time()//60)+4320}]
    loaded["permissions"]["resources"]["notes"]={"view":True,"add":True,"change":True,"delete":True}
    page.reload(); row=page.locator('.appt .row');row.wait_for()
    fits=True
    for width in (320,390,420):
        page.set_viewport_size({"width":width,"height":844});row.scroll_into_view_if_needed()
        box=row.bounding_box()
        fits=fits and bool(box and box["x"]>=0 and box["x"]+box["width"]<=width)
        if width==390: page.screenshot(path="/tmp/little-days-upcoming-appointments-390.png")
    subs=row.locator('.sub').all_inner_texts()
    check("the Next appointment card has the place on line 1 and the date with the time on line 2, no right column, inside 320, 390 and 420px",fits and row.locator('.rowlink[data-arg="upcoming-appointment"]').count()==1 and len(subs)==2 and subs[0]=="Family Clinic" and re.search(r"^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+ · \d+:\d\d [AP]M$",subs[1]) is not None and row.locator('time').count()==0)


def audit_care_screen(page, care_state, care_writes):
    page.locator('[data-act="open-settings"]').click()
    page.locator('[data-sheet] [data-act="open-care"]').click()  # round 3: the Care connection row shows the state
    fill_care_clock(page, "careStart", "2026-10-25", "12", "30", "AM")
    fill_care_clock(page, "careEnd", "2026-10-25", "12", "30", "PM")
    check("care clock distinguishes midnight and noon and retains 12-hour choices",
          page.evaluate("S.sheet.careStart") == "2026-10-25T00:30"
          and page.evaluate("S.sheet.careEnd") == "2026-10-25T12:30"
          and page.locator("input[type=datetime-local]").count() == 0)
    fill_care_clock(page, "careStart", "2026-10-25", "10")
    fill_care_clock(page, "careEnd", "2026-10-25", "11")
    care_form=page.evaluate("({sheet:S.sheet,loading:S.careLoading,disabled:document.querySelector('[data-act=care-confirm]').disabled})")
    check("care form retains entered times and enables its save action",care_form["sheet"].get("careStart")=="2026-10-25T10:00" and care_form["sheet"].get("careEnd")=="2026-10-25T11:00" and not care_form["loading"] and not care_form["disabled"])
    page.locator('[data-fid="careEndClock"]').fill("21:30")
    hint=page.locator('[data-care-hint="careEnd"]')
    hint_while_typing=hint.is_visible()
    page.evaluate("render()")  # a family-state refresh redraws the form
    check("a rejected care time keeps its date and text, turns confirm off and asks for a time like 9:30",
          hint_while_typing and hint.is_visible() and "Enter a time like 9:30." in hint.inner_text()
          and page.locator('[data-fid="careEndDate"]').input_value()=="2026-10-25"
          and page.locator('[data-fid="careEndClock"]').input_value()=="21:30"
          and page.locator('[data-act="care-confirm"]').is_disabled())
    fill_care_clock(page, "careEnd", "2026-10-25", "11")
    page.get_by_role("button", name="Confirm this care period").click()
    page.wait_for_function("S.careData?.confirmations.length === 1",timeout=5000)
    check("care sheet records only the entered self-confirmed period",len(care_writes)==1 and care_writes[0][0]=="POST" and care_writes[0][2].get("start").endswith("Z") and len(care_state["confirmations"])==1)
    page.get_by_role("button", name="Sharing is off").click()
    page.wait_for_function("S.careData?.exportOptIn === true",timeout=5000)
    check("sharing changes only after explicit action and uses the guarded opt-in route",care_writes[-1][0]=="PUT" and care_writes[-1][2].get("enabled") is True)
    page.get_by_role("button", name="Revoke").click()
    page.wait_for_function("S.careData?.confirmations.length === 0",timeout=5000)
    check("revocation removes the own confirmation from the source view",care_writes[-1][0]=="POST" and len(care_state["confirmations"])==0)
    check("care data is not written to browser local storage",page.evaluate("Object.keys(localStorage).every(key => !key.toLowerCase().includes('care'))"))
    page.get_by_role("button", name="Cancel", exact=True).click()


def audit_person_switch(page, session_state):
    original_view=page.evaluate("({width:innerWidth,height:innerHeight})")
    page.set_viewport_size({"width":1024,"height":400})
    navigate(page, "home")
    dialogs = []
    page.on("dialog", lambda dialog: (dialogs.append(dialog.type), dialog.dismiss()))
    open_settings(page)  # Changed (R3): Choose person and Sign out live on the Settings screen, not in More
    page.locator("[data-sheet]").evaluate("e => e.scrollTop = e.scrollHeight")
    settings=page.evaluate("""() => {const p=document.querySelector('[data-sheet]'),b=document.querySelector('[data-shell="logout"]'),r=p.getBoundingClientRect(),q=b.getBoundingClientRect();return {bottom:r.bottom,scrolls:p.scrollHeight>p.clientHeight,logoutBottom:q.bottom}}""")
    check("1024x400 Settings scrolls and keeps Choose person, its last control, reachable",settings["scrolls"] and settings["bottom"]<=400 and settings["logoutBottom"]<=400)
    page.locator('[data-shell="logout"]').click()
    unlock(page)
    page.get_by_label("Person").select_option("Wren")
    page.get_by_role("button", name="Continue").click()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    check("Choose person in More switches the adult with no leave-page prompt, open sheet or draft", not dialogs and session_state["signed_in"] and session_state["person"] == "Wren" and page.evaluate("S.auth === 'ready' && personName(S.me) === 'Wren' && !S.sheet && Object.keys(S.drafts).length === 0"))
    page.set_viewport_size(original_view)


def audit_reminder_default(page):
    # A new reminder starts with the adult who is signed in, not a fixed name.
    page.evaluate("() => { S.sheet=null; S.drafts={}; render(); }")
    # The More list has no reminder row (D4), so the check opens the reminder sheet the way the family checks do.
    page.evaluate("act('open-reminder')")
    recipient = page.evaluate("() => ({kind: S.sheet?.kind, recipient: S.sheet?.recipient, me: personName(S.me)})")
    check("a new reminder names the signed-in adult as its recipient", recipient["kind"] == "reminder" and recipient["recipient"] == recipient["me"] == "Wren")
    page.evaluate("() => { S.sheet=null; S.drafts={}; render(); }")


def audit_other_label(page, state):
    # Owner request, 2026-11-08: "instead of Wren you should just have other". Display only: the account value stays Wren.
    body = "document.body.innerText"
    original_language = state["preferences"].get("language", "en")
    state["preferences"]["language"] = "en"
    page.evaluate("""() => { window.__otherBackup={entries:S.entries,duty:S.duty,lang:S.lang,sleepRun:S.sleepRun,careData:S.careData,careLoading:S.careLoading,tab:S.tab};
      S.entries=[...S.entries.map(e=>({...e,by:'Wren'})),{id:'reminders:other',type:'reminder',recipient:'Wren',by:'Wren',what:'feed',enabled:true,t:nowM()-1,day:0,hour:3,minute:20,period:'PM'}]; S.sleepRun={id:'timers:other',by:'Wren',startedAt:new Date().toISOString()};
      S.duty='Wren'; S.lang='en'; S.sheet=null; render(); }""")
    try:
        texts, account, chip_ok, sign_in, spanish = other_label_reads(page, body)
    finally:
        state["preferences"]["language"] = original_language
        page.evaluate("() => { Object.assign(S, window.__otherBackup); S.sheet=null; render(); }")
    leaks = [name for name, text in texts.items() if "Wren" in text]
    if leaks:
        print("Wren still shows on:", leaks)
    check("Wren shows as Other on home, log, settings, duty, confirm, care and the diaper form", not leaks and account == "Other" and "Other" in texts["log"])
    check("the Other chip keeps the account value Wren and is on for the signed-in Wren", chip_ok)
    check("the sign-in list shows Other for the account Wren", sign_in == "Other")
    check("Spanish shows Otra persona for the account Wren", spanish == "Otra persona")


def other_label_reads(page, body):
    navigate(page, "home")
    texts = {"home": page.evaluate(body)}
    navigate(page, "log")
    texts["log"] = page.evaluate(body)
    open_settings(page)
    texts["settings"] = page.evaluate(body)
    account = page.locator(".account-name").inner_text().strip()
    close_settings(page)
    page.evaluate("() => { S.sheet=null; act('duty'); render(); }")
    texts["duty sheet"] = page.evaluate(body)
    page.evaluate("() => { S.sheet={kind:'confirm',act:'sleepstop',by:'Wren',draft:null}; render(); }")
    texts["confirm sheet"] = page.evaluate(body)
    page.evaluate("""() => { S.careLoading=false; S.careData={confirmations:[],dutyHistory:[{occurredAt:new Date().toISOString(),who:'Wren',adult:'Wren',note:''}]};
      S.sheet={kind:'care',careStart:'',careEnd:''}; render(); }""")
    texts["care sheet"] = page.evaluate(body)
    page.evaluate("() => { S.sheet=null; act('open-dia'); render(); }")
    texts["diaper form"] = page.evaluate(body)
    page.locator('[data-sheet] details[data-more-details] summary').click()  # R4: More details holds Day and Logged by
    texts["diaper form, changed"] = page.evaluate(body)
    chip = page.locator('[data-sheet] [data-act="logged-by"][data-arg="Wren"]')
    chip_ok = chip.count() == 1 and chip.inner_text().strip() == "Other" and chip.get_attribute("aria-pressed") == "true"
    sign_in = page.evaluate("""() => { const d=document.createElement('div'); d.innerHTML=loginHTML();
      const o=[...d.querySelectorAll('option')].find(o=>o.value==='Wren'); return o ? o.textContent.trim() : null; }""")
    page.evaluate("() => { S.sheet={kind:'settings'}; S.lang='es'; render(); }")  # the account name lives on Settings (R3)
    spanish = page.evaluate("document.querySelector('.account-name').textContent.trim()")
    return texts, account, chip_ok, sign_in, spanish


def audit_long_responsive_timeline(page, loaded):
    loaded["entries"]=[{"id":f"fixture-note-{i}","type":"note","title":f"Fixture timeline {i+1}","text":"Synthetic long timeline fixture text.","t":840-i,"by":"Care Adult"} for i in range(30)]
    page.reload();navigate(page, "log")
    check("long timeline renders synthetic fixture records",page.locator('[data-act="edit"][data-arg^="fixture-note-"]').count()==30)
    for width in [768,1440]:
        page.set_viewport_size({"width":width,"height":900})
        page.locator('[data-scroll]').evaluate("el=>el.scrollTop=el.scrollHeight")
        nav=page.evaluate("""() => {const sc=document.querySelector('[data-scroll]'),b=document.querySelector('.screen-top [data-arg=home]'),r=b.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,scrolls:sc.scrollHeight>sc.clientHeight,visible:r.width>=44&&r.height>=44&&r.top>=0&&r.bottom<=innerHeight}}""")
        check(f"{width}px long timeline scrolls while Home remains reachable",not nav["overflow"] and nav["scrolls"] and nav["visible"])
        navigate(page, "home")
        assert page.locator("nav.nav button").count() == 5
        navigate(page, "log")


def audit_responsive_shell(page, width, height, evidence):
    page.set_viewport_size({"width":width,"height":height})
    metrics=page.evaluate("""() => {const app=document.querySelector('.app.phone'),home=document.querySelector('.wrap'),a=app.getBoundingClientRect();return {doc:document.documentElement.scrollWidth,view:innerWidth,appWidth:a.width,columns:getComputedStyle(home).gridTemplateColumns.split(' ').length,appBottom:a.bottom,viewBottom:innerHeight}}""")
    reachable=True
    for button in page.locator("nav.nav button").all():
        button.scroll_into_view_if_needed()
        r=button.bounding_box()
        reachable=reachable and r["width"]>=44 and r["height"]>=44 and r["y"]>=0 and r["y"]+r["height"]<=height+1
    check(f"{width}px shell has one column capped at 480px and five reachable nav rows",
          metrics["appWidth"]==min(width,480) and metrics["columns"]==1 and metrics["doc"]<=metrics["view"]
          and metrics["appBottom"]<=metrics["viewBottom"]+1 and page.locator("nav.nav button").count()==5 and reachable)
    page.screenshot(path=str(evidence/f"after-{width}.png"))
    open_settings(page)
    panel=page.locator(".settings-card").first.bounding_box()
    check(f"{width}px Settings card in More stays inside viewport",panel is not None and panel["x"]>=0 and panel["x"]+panel["width"]<=width+1)
    selects=page.locator('[data-setting="lang"], [data-setting="units"]').evaluate_all("els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]})")
    check(f"{width}px Settings language and unit chips meet 44x44px target",len(selects)==4 and all(w>=44 and h>=44 for w,h in selects))  # round 3: chips replace the two lists
    page.screenshot(path=f"/tmp/little-days-runtime-settings-{width}.png")
    close_settings(page)


def audit_settings_content(page):
    """R3 (new): Settings is its own screen with On duty + Change, Baby photo, Care connection, Language, Units, Night options and who is signed in.
    Fails if a row is missing, if the screen is a bottom sheet, or if Change does not open the duty form."""
    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("S.lang='en';render()")
    open_settings(page)
    seen = page.evaluate("""() => { const root = document.querySelector('[data-sheet]'), q = s => !!root.querySelector(s), text = root.innerText;
        return {full: root.classList.contains('formscreen'), duty: q('[data-act="duty"]') && /On duty/.test(text), photo: /Baby/.test(text) && q('.portrait-upload, .mini-portrait, .portrait-tools'), care: q('[data-act="open-care"]'),
                lang: q('[data-setting="lang"]'), units: q('[data-setting="units"]'), night: q('[data-setting="night"]'), who: q('.account-name') && q('[data-shell="logout"]'), r4: root.querySelectorAll('[data-r]').length}; }""")
    check(f"Settings is a full screen with On duty, Baby photo, Care connection, Language, Units, Night options and the signed-in name: {seen}", seen["full"] and all(seen[k] for k in ("duty", "photo", "care", "lang", "units", "night", "who")))
    page.locator('[data-sheet] [data-act="duty"]').click()
    check("Change on the On duty row opens the duty form", page.locator('[data-sheet][data-kind="duty"]').count() == 1)
    page.locator('[data-sheet] [data-act="cancel"]').click()
    page.evaluate("S.sheet=null;render()")


def audit_more_details(page):
    """R4 (new): a form's More details is closed until it is tapped and then shows Day and Logged by. Fails if it opens by itself or never opens."""
    page.evaluate("S.sheet=null;render()")
    page.locator('.tile[data-act="open-dia"]').click()
    closed = page.evaluate("(() => { const d = document.querySelector('[data-sheet] details[data-more-details]'); return !!d && !d.open; })()")
    page.locator('[data-sheet] details[data-more-details] summary').click()
    opened = page.locator('[data-sheet] [data-fid=manualDate]').is_visible() and page.locator('[data-sheet] [data-act="logged-by"]').count() >= 1
    page.wait_for_function("S.sheet.detailsOpen === true")  # the toggle event records it
    page.evaluate("render()")
    kept = page.evaluate("document.querySelector('[data-sheet] details[data-more-details]').open")
    check(f"More details starts closed, opens on a tap and stays open after a redraw: {closed} {opened} {kept}", closed and opened and kept)
    page.evaluate("S.sheet=null;S.drafts={};render()")


def audit_trends(page, requests, revision):
    # The recorded-pattern cards are gone. check_charts.py covers the 7 AM days,
    # carry-in sleep, the 17-date range and the refresh. This check keeps the phone-width fit of the Charts tab.
    page.set_viewport_size({"width":390,"height":844})
    navigate(page, "charts")
    page.locator('.plot[data-chart="rhythm"] svg').wait_for()
    for width, height in [(320, 740), (390, 844)]:
        page.set_viewport_size({"width":width,"height":height})
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        fit=page.evaluate("""() => ({overflow:document.documentElement.scrollWidth>innerWidth,cardsFit:[...document.querySelectorAll('.charts-page .card')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),rows3:document.querySelectorAll('[data-chart="glance"] li').length,rows:document.querySelectorAll('.plot[data-chart="rhythm"] text[x="0"]').length,expected:S.chartRows.length-Math.max(0,S.chartRows.findIndex(rhythmHas))})""")
        check(f"charts fit the {width}px phone viewport with three glance rows and a rhythm row for each day from the first record ({fit['rows']})", not fit["overflow"] and fit["rows3"]==3 and fit["rows"]==fit["expected"] and fit["rows"]>=1)
        check(f"every chart card stays inside {width}px after resize, including cards below the fold", fit["cardsFit"])
    page.screenshot(path="/tmp/little-days-runtime-trends-390.png")


def audit_large_text_titles(browser, base):
    """Failure case: enlarged Spanish titles push Home or Timeline search off a 320px screen."""
    at = datetime.fromisoformat("2026-11-13T12:00:00-06:00")
    for theme in ("off", "on"):
        page = open_app(browser, base, 320, 844, at, lang="es", theme=theme)
        try:
            for tab in ("log", "charts"):
                navigate(page, tab)
                page.wait_for_function("!S.trendsLoading && !S.growthLoading")
                # Text-only enlargement keeps the viewport fixed.
                page.evaluate("""() => {
                    const sizes=[...document.querySelectorAll('#stage *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);
                    for(const [el,size] of sizes)el.style.fontSize=`${size*2}px`;
                }""")
                fit = page.evaluate("""() => {
                    const bar=document.querySelector('.screen-top'),title=bar.querySelector('h1');
                    const parts=[title,...bar.querySelectorAll('button')].map(e=>e.getBoundingClientRect());
                    return {inside:parts.every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight),
                        separate:parts.every((a,i)=>parts.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)),
                        fullTitle:title.scrollWidth<=title.clientWidth+1&&title.scrollHeight<=title.clientHeight+1,
                        search:!!bar.querySelector('[data-act="search-toggle"]'),
                        totalsFit:[...document.querySelectorAll('.totals .total')].every(e=>{
                            const range=document.createRange();range.selectNodeContents(e.querySelector('dt'));const a=range.getBoundingClientRect();
                            range.selectNodeContents(e.querySelector('dd'));const b=range.getBoundingClientRect();
                            return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;
                        }),totalCount:document.querySelectorAll('.totals .total').length};
                }""")
                check(f"Spanish {tab}, theme {theme}: 200% text keeps the title and controls visible without overlap at 320px: {fit}",
                      fit["inside"] and fit["separate"] and fit["fullTitle"])
                if tab == "log":
                    check("Timeline search stays present with 200% Spanish text", fit["search"])
                    check("Timeline care labels and totals stay separate with 200% Spanish text", fit["totalCount"] > 0 and fit["totalsFit"])
        finally:
            page.context.close()


def audit_child_setup(browser, base):
    setup_page = browser.new_page()
    setup_child = {"child": None}
    child_posts = []
    setup_page.route("**/api/session", lambda route: route.fulfill(json={"me": {"id": "adult:1", "name": "Care Adult"}, "csrf": "setup-csrf"}))
    setup_page.route("**/api/state", lambda route: route.fulfill(json={**state_response(), "child": setup_child["child"]}))

    def create_child(route):
        child_posts.append({"csrf": route.request.headers.get("x-csrf-token"), "body": route.request.post_data_json})
        setup_child["child"] = {"id": "child:1", "name": route.request.post_data_json["firstName"]}
        route.fulfill(json={"status": "saved", "state": {**state_response(), "child": setup_child["child"]}})

    setup_page.route("**/api/children", create_child)
    setup_page.goto(base)
    setup_page.get_by_role("heading", name="Add your baby").wait_for()
    check("child onboarding leaves birth date and optional due date blank", setup_page.locator('[name="birthDate"]').input_value() == "" and setup_page.locator('[name="dueDate"]').input_value() == "")
    setup_page.locator('[name="birthDate"]').fill("2099-11-01")
    check("child onboarding rejects a future birth date", not setup_page.locator('[name="birthDate"]').evaluate("el => el.checkValidity()"))
    setup_page.locator('[name="birthDate"]').fill("2026-10-01")
    setup_page.locator('[name="firstName"]').fill("Setup Test Baby")
    setup_page.wait_for_timeout(16000)
    check("child setup retains entered name and birth date across the refresh interval", setup_page.locator('[name="firstName"]').input_value() == "Setup Test Baby" and setup_page.locator('[name="birthDate"]').input_value() == "2026-10-01")
    setup_page.get_by_role("button", name="Save baby").click()
    setup_page.locator('.tile[data-act="open-feed"]').wait_for()
    check("child setup posts entered details with a blank optional due date and session CSRF", len(child_posts) == 1 and child_posts[0]["csrf"] == "setup-csrf" and child_posts[0]["body"]["firstName"] == "Setup Test Baby" and child_posts[0]["body"]["birthDate"] == "2026-10-01" and child_posts[0]["body"].get("dueDate", "") == "")
    setup_page.close()



DAY_TOTAL_SHOTS = Path(os.environ.get("LITTLE_DAYS_SHOTS", "/tmp/little-days-day-totals"))


def day_totals_entries(bottle=True):
    """Invented records. Today is 12:00 noon (minute 720). Minutes count from midnight."""
    entries = [
        {"id": "dt-sleep-night", "type": "sleep", "dur": 240, "t": -120, "by": "Rowan"},  # 10 PM to 2 AM, across midnight
        {"id": "dt-sleep-morning", "type": "sleep", "dur": 90, "t": 400, "by": "Rowan"},  # 6:40 to 8:10 AM, across 7 AM
        {"id": "dt-feed-1", "type": "feed", "side": "L", "dur": 5, "t": 15, "by": "Rowan"},  # 12:15 AM
        {"id": "dt-feed-2", "type": "feed", "side": "R", "dur": 20, "t": 60, "by": "Rowan"},
        {"id": "dt-wet", "type": "diaper", "kind": "W", "t": 100, "by": "Rowan"},
        {"id": "dt-dirty", "type": "diaper", "kind": "D", "t": 200, "by": "Rowan"},
        {"id": "dt-both", "type": "diaper", "kind": "B", "t": 250, "by": "Rowan"},
        {"id": "dt-yesterday-feed", "type": "feed", "side": "L", "dur": 10, "t": -1440 + 600, "by": "Rowan"},
        {"id": "dt-yesterday-nap", "type": "sleep", "dur": 60, "t": -1440 + 780, "by": "Rowan"},
    ]
    if bottle:
        entries += [
            {"id": "dt-bottle", "type": "bottle", "ml": 120, "t": 120, "by": "Rowan"},
            {"id": "dt-mixed-bottle", "type": "bottle", "sid": "dt-mixed", "ml": 60, "t": 300, "dur": 5, "by": "Rowan"},
            {"id": "dt-mixed-breast", "type": "feed", "sid": "dt-mixed", "side": "R", "dur": 15, "t": 305, "by": "Rowan"},
        ]
    return entries


def day_total_text(page, selector):
    return " ".join(page.locator(selector).inner_text().split())


def timeline_total_text(page, day=0):
    """One day's totals on the Timeline: a tinted row for each care type; the rows are joined with | here (the word label is left out)."""
    return " | ".join(" ".join(text.split()) for text in page.locator(f'[data-day-totals="{day}"] .total dd').all_inner_texts())


def open_search(page):
    """R5: the Timeline search opens from the button in the title bar."""
    if page.locator('[data-fid="search"]').count() == 0:
        page.locator('[data-act="search-toggle"]').click()
    page.locator('[data-fid="search"]').wait_for()


def audit_day_totals(browser, base):
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    DAY_TOTAL_SHOTS.mkdir(parents=True, exist_ok=True)
    expected = {
        "en": {"feed": "4 feeds · 40 min · 180 ml", "sleep": "3 h 30 min · 2 sleeps", "diaper": "Wet 2 · Dirty 2",
               "today": "4 feeds · 40 min · 180 ml | 3 h 30 min · 2 sleeps | Wet 2 · Dirty 2",
               "yesterday": "1 feed · 10 min | 3 h · 2 sleeps", "nobottle": "2 feeds · 25 min", "running": "5 h 30 min · 3 sleeps", "one": "1 feed · 5 min", "feeding": "1 feed · 10 min"},
        "es": {"feed": "4 tomas · 40 min · 180 ml", "sleep": "3 h 30 min · 2 sueños", "diaper": "Pipí 2 · Popó 2",
               "today": "4 tomas · 40 min · 180 ml | 3 h 30 min · 2 sueños | Pipí 2 · Popó 2",
               "yesterday": "1 toma · 10 min | 3 h · 2 sueños", "nobottle": "2 tomas · 25 min", "running": "5 h 30 min · 3 sueños", "one": "1 toma · 5 min", "feeding": "1 toma · 10 min"},
    }
    for lang, want in expected.items():
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        page.st["entries"] = day_totals_entries()
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
        # Owner, 2026-11-21: Today moved off Home; Latest carries the "See the timeline" link and Timeline owns the daily totals.
        home_check = page.evaluate("""() => {
            const link = document.querySelector('.wrap [data-act="tab"][data-arg="log"]');
            const card = link && link.closest('.card');
            return {totals: document.querySelectorAll('.totals').length, inLatest: !!card && !!card.querySelector('h2') && !!card.querySelector('ul .row'), linkText: link ? link.textContent.trim() : ''};
        }""")
        check(f"{lang} Home has no Today totals card and places See the timeline inside Latest: {home_check}",
              home_check["totals"] == 0 and home_check["inLatest"] and home_check["linkText"] == ("See the timeline" if lang == "en" else "Ver el historial"))
        page.screenshot(path=str(DAY_TOTAL_SHOTS / f"home-{lang}.png"), full_page=True)
        navigate(page, "log")
        feed, sleep, diaper = day_total_text(page, '[data-day-totals="0"] .total.t-feed dd'), day_total_text(page, '[data-day-totals="0"] .total.t-sleep dd'), day_total_text(page, '[data-day-totals="0"] .total.t-dia dd')
        check(f"{lang} Timeline Feed total shows feeds, nursing time and bottle volume of the calendar day: {feed}", feed == want["feed"])
        check(f"{lang} Timeline Sleep total counts a sleep across midnight and across 7 AM by calendar day: {sleep}", sleep == want["sleep"])
        check(f"{lang} Timeline shows the diaper counts once: {diaper}", diaper == want["diaper"] and page.get_by_text("Wet 2").count() + page.get_by_text("Pipí 2").count() == 1)
        today = timeline_total_text(page)
        check(f"{lang} Timeline today shows one totals block: {today}", today == want["today"] and page.locator('[data-day-totals="0"]').count() == 1)
        page.screenshot(path=str(DAY_TOTAL_SHOTS / f"timeline-{lang}.png"), full_page=True)
        yesterday = timeline_total_text(page, -1)
        check(f"{lang} Timeline yesterday shows only its own sleep minutes and no bottle volume: {yesterday}", yesterday == want["yesterday"])
        page.locator('[data-act="filter"][data-arg="feed"]').click()
        page.wait_for_function("S.filter === 'feed'")
        page.wait_for_timeout(100)
        feeding = timeline_total_text(page, -1)
        check(f"{lang} Timeline feeding filter shows only the feed part: {feeding}", feeding == want["feeding"])
        page.locator('[data-act="filter"][data-arg="other"]').click()
        page.wait_for_function("S.filter === 'other'")
        page.wait_for_timeout(100)
        check(f"{lang} Timeline Other filter shows no totals", page.locator("[data-day-totals]").count() == 0)
        page.screenshot(path=str(DAY_TOTAL_SHOTS / f"timeline-yesterday-{lang}.png"), full_page=True)
        # No bottle that day: no volume, no "0 ml". A running sleep timer counts up to now.
        page.st["entries"] = [e for e in day_totals_entries(bottle=False) if e["id"] != "dt-feed-2"]
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
        navigate(page, "log")
        one = day_total_text(page, '[data-day-totals="0"] .total.t-feed dd')
        check(f"{lang} Timeline with one feed and no bottle shows the singular and no volume: {one}", one == want["one"])
        page.st["entries"] = day_totals_entries(bottle=False)
        page.st["sleepRun"] = {"id": "dt-run", "kind": "sleep", "t0": 600, "by": "Rowan"}  # started 10:00 AM, 2 h before now
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
        page.screenshot(path=str(DAY_TOTAL_SHOTS / f"home-running-{lang}.png"), full_page=True)
        navigate(page, "log")
        nobottle = day_total_text(page, '[data-day-totals="0"] .total.t-feed dd')
        running = day_total_text(page, '[data-day-totals="0"] .total.t-sleep dd')
        check(f"{lang} Timeline with no bottle shows nursing time only: {nobottle}", nobottle == want["nobottle"] and "ml" not in nobottle)
        check(f"{lang} Timeline running sleep timer counts up to now: {running}", running == want["running"])
        check(f"{lang} day totals page has no script errors", not page.errors)
        page.context.close()
    page = open_app(browser, base, 390, 844, at, lang="en", theme="off")
    page.st["entries"] = day_totals_entries()
    page.st["preferences"]["units"] = "us"
    page.reload()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    navigate(page, "log")
    us = day_total_text(page, '[data-day-totals="0"] .total.t-feed dd')
    check(f"US units show the volume in oz: {us}", us.startswith("4 feeds · 40 min · ") and us.endswith(" oz"))
    page.context.close()


def audit_day_totals_live(browser, base):
    """Day totals must load the day before for yesterday, and keep counting while a timer runs."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    today = date(2026, 11, 10)
    want = {"en": "1 feed · 10 min | 2 h · 1 sleep", "es": "1 toma · 10 min | 2 h · 1 sueño"}
    for lang in ("en", "es"):
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)

        def ranged(route):  # like the server: only records that start inside the asked days
            query = parse_qs(urlparse(route.request.url).query)
            low, high = ((date.fromisoformat(query[k][0]) - today).days for k in ("from", "to")) if "from" in query else (-1, 1)
            route.fulfill(json={**page.st, "entries": [e for e in page.st["entries"] if low <= e["t"] // 1440 < high]})

        page.route(re.compile(r"/api/state(\?.*)?$"), ranged)
        page.st["entries"] = [
            {"id": "dl-carried", "type": "sleep", "dur": 180, "t": -2 * 1440 + 1380, "by": "Rowan"},  # 11 PM two nights ago to 2 AM yesterday
            {"id": "dl-feed", "type": "feed", "side": "L", "dur": 10, "t": -1440 + 600, "by": "Rowan"},
        ]
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
        navigate(page, "log")
        page.wait_for_timeout(1000)
        carried = timeline_total_text(page, -1)
        check(f"{lang} Timeline yesterday counts the sleep minutes carried in from two nights ago: {carried}", carried == want[lang])
        page.st["entries"] = [{"id": "dl-feed-2", "type": "feed", "side": "L", "dur": 10, "t": 30, "by": "Rowan"}]
        page.st["sleepRun"] = {"id": "dl-run", "kind": "sleep", "t0": 600, "by": "Rowan"}  # 10:00 AM; now is 12:00 PM
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
        navigate(page, "log")
        before = day_total_text(page, '[data-day-totals="0"] .total.t-sleep dd')
        page.clock.set_fixed_time(at + timedelta(minutes=3))
        page.wait_for_timeout(2500)
        after = day_total_text(page, '[data-day-totals="0"] .total.t-sleep dd')
        check(f"{lang} Timeline sleep total advances while the timer runs: {before} -> {after}", before.startswith("2 h ·") and after.startswith("2 h 3 min"))
        open_search(page)
        page.locator('[data-fid="search"]').click()
        page.keyboard.type("a")
        page.wait_for_timeout(300)
        page.clock.set_fixed_time(at + timedelta(minutes=6))
        page.wait_for_timeout(2500)
        typing = page.evaluate("[document.activeElement?.dataset.fid, document.activeElement?.value]")
        check(f"{lang} Timeline search field stays intact while the timer ticks: {typing}", typing == ["search", "a"])
        check(f"{lang} live totals page has no script errors", not page.errors)
        page.context.close()
        # An empty day: the first timer has run for no minutes, so no total exists until a minute passes.
        word = "sleep" if lang == "en" else "sueño"
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        page.st["entries"] = []
        page.st["sleepRun"] = {"id": "dl-first", "kind": "sleep", "t0": 720, "by": "Rowan"}
        page.reload()
        page.locator('.tile[data-act="open-sleep"]').wait_for()
        check(f"{lang} Home with only a running timer keeps the See the timeline link in Latest", page.locator('.wrap [data-act="tab"][data-arg="log"]').count() == 1)
        navigate(page, "log")
        before = page.locator('[data-day-totals="0"]').count()
        page.clock.set_fixed_time(at + timedelta(minutes=3))
        page.wait_for_timeout(2500)
        text = timeline_total_text(page)
        check(f"{lang} log total appears on an empty day when the first timer passes a minute: {text}", before == 0 and text == f"3 min · 1 {word}")
        # R5 (look match, round 3): search results show no day totals, so the typing check is its own step: a tick must not take the field away.
        open_search(page)
        page.locator('[data-fid="search"]').click()
        page.keyboard.type("a")
        page.clock.set_fixed_time(at + timedelta(minutes=5))
        page.wait_for_timeout(2500)
        check(f"{lang} log typing in search survives the timer tick", page.evaluate("[document.activeElement?.dataset.fid, document.activeElement?.value]") == ["search", "a"])
        check(f"{lang} log first-timer page has no script errors", not page.errors)
        page.context.close()


def audit_known_gaps(browser, base):
    """Three fixes before the family deploy: a saved edit refreshes the carried-in day, the Spanish timer wraps between units, the filter shows its full text."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    today = date(2026, 11, 10)
    shots = DAY_TOTAL_SHOTS
    shots.mkdir(parents=True, exist_ok=True)
    for lang in ("en", "es"):
        # 1. Edit a sleep that began two nights ago from yesterday's page; the Timeline and totals follow with no reload.
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        carried = {"id": "kg-carried", "type": "sleep", "nap": False, "dur": 180, "t": -2 * 1440 + 1380, "by": "Rowan"}  # 11 PM two nights ago to 2 AM yesterday
        page.st["entries"] = [carried, {"id": "kg-feed", "type": "feed", "side": "L", "dur": 10, "t": -1440 + 600, "by": "Rowan"}]

        def window(entries, low, high):
            return [e for e in entries if low <= e["t"] // 1440 < high]

        def ranged(route):
            query = parse_qs(urlparse(route.request.url).query)
            low, high = ((date.fromisoformat(query[k][0]) - today).days for k in ("from", "to")) if "from" in query else (-1, 1)
            route.fulfill(json={**page.st, "entries": window(page.st["entries"], low, high)})

        def edited(route):
            body = route.request.post_data_json
            page.st["entries"] = [{**e, "dur": body["event"]["duration"]} if e["id"] == "kg-carried" else e for e in page.st["entries"]]
            route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": {**page.st, "entries": window(page.st["entries"], -1, 1)}})

        page.route(re.compile(r"/api/state(\?.*)?$"), ranged)
        page.route("**/api/events/**", edited)
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
        navigate(page, "log")
        page.wait_for_timeout(800)
        sleeps = "sleep" if lang == "en" else "sueño"
        before = timeline_total_text(page, -1)
        page.evaluate("editAction('kg-carried');render()")  # the Undo window of an older day's edit is the way a person reaches this record from here
        page.locator('[data-fid="editEndClock"]').fill("1:00")
        page.locator('[data-sheet] [data-act="save"]').click()
        page.wait_for_timeout(1200)
        after = timeline_total_text(page, -1)
        check(f"{lang} yesterday totals follow an edit of a carried-in sleep with no reload: {before} -> {after}", "2 h ·" in before and after.endswith(f"1 h · 1 {sleeps}"))
        page.screenshot(path=str(shots / f"gap1-edit-carried-{lang}.png"))
        page.context.close()
        # 2. The running sleep timer on Home breaks only between units.
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        page.st["entries"] = []
        page.st["sleepRun"] = {"id": "kg-run", "kind": "sleep", "t0": 600, "by": "Rowan"}  # 2 h before now
        page.reload()
        page.locator('.run-card [data-live="sleep"]').wait_for()
        broken = page.evaluate("""() => {
            const el = document.querySelector('.run-card [data-live="sleep"]'), node = el.firstChild, out = [];
            for (const m of node.data.matchAll(/\\d+[ \\u00a0][a-z]+/g)) {
                const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
                if (new Set([...r.getClientRects()].map(x => Math.round(x.top))).size > 1) out.push(m[0]);
            }
            return out;
        }""")
        check(f"{lang} Home sleep timer never splits a number from its unit at 390px: {broken}", broken == [])
        page.screenshot(path=str(shots / f"gap2-timer-{lang}.png"))
        page.context.close()
        # 3. The Timeline chips show the full text of every option at 390px (R5: chips replace the filter list).
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        navigate(page, "log")
        for option in ("all", "feed", "sleep", "diaper", "other"):
            page.locator(f'[data-act="filter"][data-arg="{option}"]').click()
            page.wait_for_function(f"S.filter === '{option}'")
            page.wait_for_timeout(100)
            fit = page.evaluate("""(option) => {
                const el = document.querySelector(`[data-act="filter"][data-arg="${option}"]`), box = el.getBoundingClientRect();
                return {text: el.textContent.trim(), clipped: el.scrollWidth > el.clientWidth + 1, height: Math.round(box.height), pressed: el.getAttribute('aria-pressed'), sideways: document.documentElement.scrollWidth > innerWidth};
            }""", option)
            check(f"{lang} filter chip '{fit['text']}' shows its full text, keeps a 44px target, is pressed once chosen, no sideways scroll at 390px",
                  not fit["clipped"] and fit["height"] >= 44 and fit["pressed"] == "true" and not fit["sideways"])
            if option == "other":
                page.screenshot(path=str(shots / f"gap3-filter-{lang}.png"))
        page.context.close()


def audit_look_spacing(browser, base):
    """DESIGN.md: 24 px between groups and 8 px inside a group, on Home (also on a short screen) and the Timeline; a number stays with its unit on a 360 px Home."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    for lang in ("en", "es"):
        for width, height in ((390, 844), (390, 740), (360, 740)):
            page = open_app(browser, base, width, height, at, lang=lang, theme="off")
            page.set_default_timeout(5000)
            page.st["entries"] = [e for e in day_totals_entries() if e["type"] not in ("feed", "bottle")] + [  # two feeds 5 h 10 min apart give the longest "usual gap" line
                {"id": "sp-feed-1", "type": "feed", "side": "L", "dur": 10, "t": 60, "by": "Rowan"}, {"id": "sp-feed-2", "type": "feed", "side": "R", "dur": 10, "t": 370, "by": "Rowan"}]
            page.reload()
            page.locator('.tile[data-act="open-feed"]').wait_for()
            # The Crying card (DESIGN.md, 2026-11-20) is the one exception: 16 px above it and 16 px below it. It must be there (cryGap is null without it).
            # .home-first is display:contents (no box of its own), so its children are the groups to measure.
            gaps = page.evaluate("""() => { const els = [...document.querySelector('.wrap').children].flatMap(e => getComputedStyle(e).display === 'contents' ? [...e.children] : [e]), kids = els.map(e => e.getBoundingClientRect());
                const tiles = [...document.querySelectorAll('.tiles .tile')].map(e => e.getBoundingClientRect()), cry = document.querySelector('.cry-home');
                const cryGap = cry ? Math.round(cry.lastElementChild.getBoundingClientRect().top - cry.firstElementChild.getBoundingClientRect().bottom) : null;
                return {between: kids.slice(1).map((b, i) => Math.round(b.top - kids[i].bottom)), want: kids.slice(1).map((b, i) => els[i].classList.contains('cry-home') ? 16 : 24),
                        cryGap, inside: tiles.slice(1).map((b, i) => Math.round(b.left - tiles[i].right))}; }""")
            check(f"{lang} {width}x{height} Home keeps 24 px between groups (16 px above and below the Crying card) and 8 px between the tiles: {gaps}", gaps["between"] == gaps["want"] and gaps["cryGap"] == 16 and set(gaps["inside"]) == {8})
            broken = page.evaluate("""() => { const out = [];
                for (const el of document.querySelectorAll('.row strong, .row .sub, .total dd, .run-card .clock, .run-card .sub')) for (const node of [el, ...el.querySelectorAll('*')]) for (const t of [...node.childNodes].filter(n => n.nodeType === 3)) {
                    for (const m of t.data.matchAll(/\\d+[ \\u00a0][a-z]+/g)) { const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
                        if (new Set([...r.getClientRects()].map(x => Math.round(x.top))).size > 1) out.push(m[0]); } }
                return out; }""")
            check(f"{lang} {width}x{height} Home card lines never split a number from its unit: {broken}", broken == [])
            if width == 390 and height == 844:
                navigate(page, "log")
                # R5 (look match): the mockup's gaps. 24 px between groups (chips, a day, the next day), 8 px inside a day (heading, totals card, row card).
                tl = page.evaluate("""() => { const top = e => e.getBoundingClientRect().top, bottom = e => e.getBoundingClientRect().bottom, q = s => document.querySelector(s), day = q('.day');
                    return {chips_to_day: Math.round(top(day) - bottom(q('.chips'))), heading_to_totals: Math.round(top(day.querySelector(':scope > .card')) - bottom(day.querySelector(':scope > h2'))),
                            totals_to_rows: Math.round(top(day.querySelector(':scope > .list')) - bottom(day.querySelector(':scope > .card'))), day_to_day: Math.round(top(document.querySelectorAll('.day')[1]) - bottom(day))}; }""")
                check(f"{lang} Timeline: 24 px from the chips to a day and between days, 8 px inside a day: {tl}", tl["chips_to_day"] == 24 and tl["day_to_day"] == 24 and tl["heading_to_totals"] == 8 and tl["totals_to_rows"] == 8)
            page.context.close()


def audit_forms_look(browser, base):
    """DESIGN.md forms: Cancel is the secondary button at the top left, Save is the one primary button at the bottom, full width; a chosen option takes the care color of its form (gold Feed, blue Sleep, teal Diaper) and keeps its check; inputs have a 16 px radius."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    gold, blue, teal, lilac, lilac_deep, white = "rgb(244, 194, 106)", "rgb(174, 204, 252)", "rgb(89, 197, 192)", "rgb(121, 102, 175)", "rgb(101, 81, 143)", "rgb(255, 255, 255)"
    probe = """() => { const sheet = document.querySelector('[data-sheet]'), r = e => e.getBoundingClientRect(), cs = e => getComputedStyle(e);
        const cancel = sheet.querySelector('[data-act="cancel"]'), save = sheet.querySelector('[data-act="save"]'), hint = sheet.querySelector('[data-save-hint]'), on = sheet.querySelector('.chip[aria-pressed="true"]'), off = sheet.querySelector('.chip[aria-pressed="false"]'), field = sheet.querySelector('input.field');
        return {cancel: cancel && {border: cs(cancel).borderTopColor, width: cs(cancel).borderTopWidth, color: cs(cancel).color, left: Math.round(r(cancel).left)},
                save: save && {opacity: +cs(save).opacity, bg: cs(save).backgroundColor, color: cs(save).color, width: Math.round(r(save).width), height: Math.round(r(save).height), top: Math.round(r(save).top), bottom: Math.round(r(save).bottom), inFoot: !!save.closest('.sh-foot'), inHead: !!save.closest('.sh-head'), disabled: save.disabled},
                hintBottom: hint && !hint.hidden ? Math.round(r(hint).bottom) : null, sheetWidth: Math.round(r(sheet).width), viewport: innerHeight,
                on: on && {bg: cs(on).backgroundColor, border: cs(on).borderTopColor, check: getComputedStyle(on.querySelector('svg.glyph')).display},
                off: off && {bg: cs(off).backgroundColor}, radius: field && cs(field).borderTopLeftRadius}; }"""
    for lang in ("en", "es"):
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        page.locator('.tile[data-act="open-feed"]').click()
        page.locator('[data-act="ftab"][data-arg="bottle"]').click()
        page.locator('[data-act="milk"][data-arg="formula"]').click()
        page.evaluate("document.querySelectorAll('details[data-more-details]').forEach(d => { d.open = false; })")  # the check's init script opens More details; Save must fit with it closed
        m = page.evaluate(probe)
        check(f"{lang} Feed form: Cancel is the title bar's link at the top left, {m['cancel']}", m["cancel"]["color"] == lilac_deep and m["cancel"]["left"] <= 24)  # Changed: the mockup's Cancel is a text link, not an outline pill
        check(f"{lang} Feed form: Save is one full-width lilac button, 56 px tall, in the footer and not in the header, {m['save']}", m["save"]["inFoot"] and not m["save"]["inHead"] and m["save"]["bg"] == lilac and m["save"]["height"] >= 56 and m["save"]["width"] >= m["sheetWidth"] - 72)
        check(f"{lang} Feed form: Save stays on screen, {m['save']['bottom']} of {m['viewport']}", m["save"]["bottom"] <= m["viewport"])
        check(f"{lang} Feed form: the chosen option is gold with a dark gold outline and a check, the others white, {m['on']} {m['off']}", m["on"]["bg"] == gold and m["on"]["border"] == "rgb(101, 71, 4)" and m["on"]["check"] != "none" and m["off"]["bg"] == white)
        check(f"{lang} Feed form: inputs have a 16 px radius, {m['radius']}", m["radius"] == "16px")
        page.screenshot(path=str(Path(os.environ.get("LOOK_SHOTS", "/tmp")) / f"forms-feed-{lang}.png"))
        page.locator('[data-act="ftab"][data-arg="pump"]').click()  # Changed (R4): the bottle Save is always on, so the off Save is checked on the Pump tab
        m = page.evaluate(probe)
        check(f"{lang} Pump form: a Save that is off keeps its lilac shape at reduced strength and the hint sits above it, {m['save']} hint {m['hintBottom']}", m["save"]["disabled"] and m["save"]["bg"] == lilac and m["save"]["opacity"] < 1 and m["hintBottom"] is not None and m["hintBottom"] <= m["save"]["top"])
        page.reload()  # a form with a draft asks before it closes, so start the next form from a fresh page
        page.locator('.tile[data-act="open-sleep"]').click()
        page.locator('[data-act="manual"]').click()
        page.locator('[data-act="nap"][data-arg="nap"]').click()
        m = page.evaluate(probe)
        check(f"{lang} Sleep form: the chosen option is blue with a check, {m['on']}", m["on"]["bg"] == blue and m["on"]["check"] != "none")
        page.reload()
        page.locator('.tile[data-act="open-dia"]').click()
        # Changed (R4): the diaper form is a teal full-screen form with three chips and a Save button, not three teal tap-to-save buttons.
        kinds = page.evaluate("() => ({teal: !!document.querySelector('.formscreen .wrap.t-dia'), chips: document.querySelectorAll('[data-sheet] [data-act=dkind]').length, save: document.querySelectorAll('[data-sheet] [data-act=save]').length})")
        check(f"{lang} Diaper form: a teal form with Wet, Dirty and Both chips and one Save, {kinds}", kinds == {"teal": True, "chips": 3, "save": 1})
        page.context.close()
    page = open_app(browser, base, 390, 844, at, lang="en", theme="off")
    page.locator('.tile[data-act="open-feed"]').click()
    sides = page.evaluate("() => [...document.querySelectorAll('[data-sheet] .side')].map(b => [b.getAttribute('aria-pressed'), b.textContent.includes('Next')])")
    check(f"Feed form: two side tiles, the next side is picked and says Next: {sides}", len(sides) == 2 and any(s[0] == "true" and s[1] for s in sides) and sum(s[0] == "true" for s in sides) == 1)  # Changed (R4): a side tile is picked, not a gold button
    page.context.close()


def audit_more_look(browser, base):
    """Changed (R4, binding notes): "Log something else" is a full screen with the title bar and one card of nav rows, each with an icon block and a chevron. No record row is dropped; Care connection moved to Settings."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    rows_en = ["Medicine", "Temperature", "Note", "Appointment", "Doctor visit", "Growth", "Handoff note", "Solids", "Tummy time", "Bath", "Milestone"]
    for lang in ("en", "es"):
        for width in (390, 360):
            page = open_app(browser, base, width, 844, at, lang=lang, theme="off")
            page.set_default_timeout(5000)
            page.locator('[data-act="open-more"]').click()
            m = page.evaluate("""() => { const root = document.querySelector('[data-sheet]'), cards = [...root.querySelectorAll('.card.nav')], rows = [...root.querySelectorAll('.card.nav .nav-row')], r = e => e.getBoundingClientRect();
                return {full: root.classList.contains('formscreen') && Math.round(r(root).width) === innerWidth, bar: !!root.querySelector('header.bar h1'), cards: cards.length, rows: rows.length, icons: rows.filter(x => x.querySelector('svg.ico')).length, chev: rows.filter(x => x.querySelector('svg.glyph')).length,
                    labels: rows.map(x => x.textContent.trim()), tall: rows.every(x => r(x).height >= 48), sideways: root.scrollWidth > root.clientWidth}; }""")
            check(f"{lang} {width} More: a full screen with a title bar and one card: {m['full']} {m['bar']} {m['cards']}", m["full"] and m["bar"] and m["cards"] == 1)
            check(f"{lang} {width} More: all 11 rows stay, each with an icon block and a chevron glyph: {m['rows']} {m['icons']} {m['chev']}", m["rows"] == 11 and m["icons"] == 11 and m["chev"] == 11 and m["tall"] and not m["sideways"])  # D4: no Reminder row
            if lang == "en":
                check(f"More: no record row is dropped or renamed, and Reminder is absent (D4): {m['labels']}", sorted(m["labels"]) == sorted(rows_en) and "Reminder" not in m["labels"])
            if width == 390:
                page.screenshot(path=str(Path(os.environ.get("LOOK_SHOTS", "/tmp")) / f"more-{lang}.png"))
            page.context.close()


def audit_timeline_empty(page, lang, m):
    """A Timeline with no record: three days, each a heading and one line and no bunny; a search with no match is one card."""
    # R5 (look match, round 2): an empty day is its heading and one line, with no bunny (the approved Timeline has no empty-state card).
    empty = page.evaluate("""() => [...document.querySelectorAll('.day')].map(day => ({heading: day.querySelector('h2').firstChild.textContent, line: day.querySelector('.card p.sub')?.textContent.trim(), bunny: !!day.querySelector('.bunny'), fits: day.getBoundingClientRect().right <= innerWidth}))""")
    line = "Nothing logged this day." if lang == "en" else "No hay registros este día."
    check(f"{lang} Timeline with no records: three days each keep a heading and the line, no bunny: {empty}",
          [d["heading"] for d in empty] == (["Today", "Yesterday", "Sun, Nov 8"] if lang == "en" else ["Hoy", "Ayer", "dom, 8 nov"]) and all(d["line"] == line and not d["bunny"] and d["fits"] for d in empty) and not m)
    open_search(page)
    page.locator('[data-fid="search"]').fill("zzzz")
    page.wait_for_timeout(600)
    none = page.evaluate("[...document.querySelectorAll('.day, .wrap-results .card p.sub')].map(p => p.textContent.trim())")
    check(f"{lang} Timeline search with no match shows one card with its own sentence and no day group: {none}", len(none) == 1 and none[0] and none[0] != line)


def audit_empty_and_photos_look(browser, base):
    """DESIGN.md: an empty state has the bunny (48 px, Wave 6) above its sentence, so it never relies on words alone; Add photo is the secondary button."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    lilac, lilac_deep = "rgb(121, 102, 175)", "rgb(101, 81, 143)"
    probe = """() => { const card = document.querySelector('.empty-state'); if (!card) return null; const r = e => e.getBoundingClientRect(), ico = card.querySelector('svg.bunny'), p = card.querySelector('p'), add = card.querySelector('.btn');
        return {icon: ico ? [Math.round(r(ico).width), Math.round(r(ico).height)] : null, iconAbove: !!ico && !!p && r(ico).bottom <= r(p).top, text: p?.textContent.trim(), size: p && getComputedStyle(p).fontSize,
                fits: r(card).right <= innerWidth && r(card).left >= 0, add: add && {h: Math.round(r(add).height), border: getComputedStyle(add).borderTopColor, color: getComputedStyle(add).color, below: r(add).top >= r(p).bottom}}; }"""
    for lang in ("en", "es"):
        for screen, tab in (("Timeline", "log"), ("Photos", "photos"), ("Charts", "charts")):
            page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
            page.set_default_timeout(5000)
            page.st["entries"] = []
            page.reload()
            page.locator('.tile[data-act="open-feed"]').wait_for()
            navigate(page, tab)
            page.wait_for_timeout(300)
            if screen == "Charts":
                # look-match: each Charts card keeps its head and says "No records yet." in place of the one bunny card.
                words = "No records yet." if lang == "en" else "Todavía no hay registros."
                cards = page.evaluate("""() => [...document.querySelectorAll('.charts-page .card:not(.rp-entry-card)')].map(c => [c.querySelector('h2')?.textContent, c.querySelector('p.sub')?.textContent, c.getBoundingClientRect().right <= innerWidth])""")
                check(f"{lang} Charts with no record: every card shows its head and {words!r}, and fits the screen: {len(cards)} cards", len(cards) == 7 and all(c[0] and c[1] == words and c[2] for c in cards) and page.locator(".empty-state").count() == 0)
                page.screenshot(path=str(Path(os.environ.get("LOOK_SHOTS", "/tmp")) / f"empty-charts-{lang}.png"))
                page.context.close()
                continue
            m = page.evaluate(probe)
            if screen == "Timeline":
                audit_timeline_empty(page, lang, m)
            else:
                check(f"{lang} {screen} empty state: a 48 px bunny sits above one 16 px sentence and fits the screen: {m}", bool(m) and m["icon"] == [48, 48] and m["iconAbove"] and bool(m["text"]) and m["size"] == "16px" and m["fits"])
            if screen == "Photos":
                check(f"{lang} Photos empty state: Add photo is a lilac outline button under the sentence: {m and m['add']}", bool(m) and bool(m["add"]) and m["add"]["h"] >= 48 and m["add"]["border"] == lilac and m["add"]["color"] == lilac_deep and m["add"]["below"])
            if lang == "en" or screen == "Photos":
                page.screenshot(path=str(Path(os.environ.get("LOOK_SHOTS", "/tmp")) / f"empty-{screen.lower()}-{lang}.png"))
            page.context.close()


def audit_photos_heading(browser, base):
    """DESIGN.md: the Photos card heading is a real h2 at the card heading size (18 px, bold, line height 1.2), with and without photos, and Add photo stays the secondary button beside it."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    dot = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='30'%3E%3Crect width='40' height='30' fill='%23aeccfc'/%3E%3C/svg%3E"
    for lang in ("en", "es"):
        for photos in (False, True):
            page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
            page.set_default_timeout(5000)
            page.st["entries"] = [{"id": "ph-1", "type": "note", "title": "Sample", "photo": dot, "photoName": "sample.png", "t": 600, "by": "Rowan"}] if photos else []
            page.reload()
            page.locator('.tile[data-act="open-feed"]').wait_for()
            navigate(page, "photos")
            head = page.evaluate("""() => { const h = document.querySelector('.card .strip h2'), strip = h && h.closest('.strip'), add = strip && strip.querySelector('.btn');
                return h && {size: getComputedStyle(h).fontSize, weight: getComputedStyle(h).fontWeight, line: getComputedStyle(h).lineHeight, alone: !add && strip.textContent.trim() === h.textContent.trim(), add: add ? getComputedStyle(add).borderTopColor : null, sideways: document.documentElement.scrollWidth > innerWidth}; }""")
            check(f"{lang} Photos heading ({'with a photo' if photos else 'empty'}) is an h2 at 18 px, bold, line height 1.2, and the page does not scroll sideways: {head}",
                  bool(head) and head["size"] == "18px" and head["weight"] == "700" and head["line"] == "21.6px" and not head["sideways"] and (head["add"] == "rgb(121, 102, 175)" if photos else head["alone"]))
            title = page.locator(".card .strip h2").first.inner_text().strip()
            check(f"{lang} Photos heading ({'with a photo' if photos else 'empty'}) names the child and never reads undefined: {title}", title == ("Photos of Ada" if lang == "en" else "Fotos de Ada"))
            page.context.close()


def audit_design_review_r2(browser, base):
    """Design review round 2 findings 1 to 7: empty-state inset and fill, one look for same-role log buttons, DESIGN.md links, one Add note width, a full-viewport scrim at 1440, the night plain icon block, and a solid lilac disabled Save with a one-line hint."""
    from datetime import timedelta
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    lilac, lilac_deep, clear = "rgb(121, 102, 175)", "rgb(101, 81, 143)", "rgba(0, 0, 0, 0)"
    for lang in ("en", "es"):
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        page.st["entries"] = []
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
        for tab in ("photos",):  # R5 (look match): the Timeline has no empty-state card (its empty day is a heading and one line) and the Charts empty state moved on
            navigate(page, tab)
            page.wait_for_timeout(200)
            m = page.evaluate("""() => { const es = document.querySelector('.empty-state'), card = es.closest('.card'), r = e => e.getBoundingClientRect(), cs = getComputedStyle(es);
                return {fill: cs.backgroundColor, inset: Math.round(r(es).left - r(card).left + parseFloat(cs.paddingLeft)), bottom: Math.round(r(card).bottom - r(es).bottom + parseFloat(cs.paddingBottom))}; }""")
            check(f"R2-1/5 {lang} {tab} empty state inside a card has no fill, a 16 px inset and room below: {m}", m["fill"] == clear and m["inset"] >= 16 and m["bottom"] >= 16)
        page.context.close()
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        looks = {}
        for name, tile, selector in (("sleep", "open-sleep", "[data-sheet] .btn-primary"), ("feed", "open-feed", "[data-sheet] .side"), ("diaper", "open-dia", "[data-sheet] [data-act=dkind]")):
            page.locator(f'.tile[data-act="{tile}"]').click()
            looks[name] = page.evaluate("""(sel) => [...document.querySelectorAll(sel)].map(b => { const cs = getComputedStyle(b); return [cs.backgroundColor, cs.borderTopColor, !!b.querySelector('.ck')]; })""", selector)
            width = page.evaluate("""() => { const b = document.querySelector('[data-sheet] [data-act="note-open"]'), body = document.querySelector('[data-sheet] .sheet'); return b && [Math.round(b.getBoundingClientRect().width), Math.round(body.clientWidth - 32)]; }""")
            links = page.evaluate("""() => [...document.querySelectorAll('[data-sheet] .textlink')].map(l => { const cs = getComputedStyle(l); return [l.dataset.act, cs.color, cs.fontWeight, cs.textDecorationLine]; })""")
            check(f"R2-3 {lang} {name} form: Add note is in the form, {width}", bool(width) or (name == "diaper" and page.locator('[data-sheet] [data-fid="eventNote"]').count() == 1))  # Changed (R4): the link hugs its text in the mockup form, so the full-width test is gone
            check(f"R2-3 {lang} {name} form: text links are lilac-deep, bold and not underlined: {links}", bool(links) and all(l[1] == lilac_deep and l[2] == "700" and l[3] == "none" for l in links))
            page.reload()
            page.locator('.tile[data-act="open-feed"]').wait_for()
        for name, group in looks.items():
            same = len({tuple(b[:2]) for b in group}) == 1 if name == "diaper" else True  # Changed (R4): the diaper chips share one look; a picked side tile or the one Start button has no twin
            check(f"R2-2 {lang} {name} form: same-role controls share one look: {group}", len(group) >= 1 and same)
        page.context.close()
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off", run={"id": "run-1", "kind": "feed", "side": "L", "by": "Rowan", "startedAt": (at - timedelta(minutes=5)).isoformat(), "t0": 12 * 60 - 5})
        page.set_default_timeout(5000)
        page.locator('.run-card [data-act="open-feed"]').click()
        links = page.evaluate("""() => [...document.querySelectorAll('[data-sheet] .text-link, .dock .text-link, [data-sheet] summary')].map(l => { const cs = getComputedStyle(l); return [l.dataset.act || l.tagName, cs.color, cs.textDecorationLine]; })""")
        check(f"R2-3 {lang} running feed: Switched earlier and Change start are lilac-deep and not underlined: {links}", any(l[0] == "switch-earlier" for l in links) and all(l[1] == lilac_deep and l[2] == "none" for l in links if l[0] in ("switch-earlier", "change-start")))
        page.context.close()
        page = open_app(browser, base, 390, 844, at, lang=lang, theme="off")
        page.set_default_timeout(5000)
        page.locator('[data-act="open-more"]').click()
        page.locator('[data-act="open-med"]').click()
        m = page.evaluate("""() => { const save = document.querySelector('[data-sheet] [data-act="save"]'), foot = document.querySelector('.sh-foot'), hint = document.querySelector('.sh-foot [data-save-hint]'), cs = getComputedStyle(save);
            return {bg: cs.backgroundColor, opacity: +getComputedStyle(save).opacity, h: Math.round(save.getBoundingClientRect().height), disabled: save.disabled, foot: Math.round(save.getBoundingClientRect().bottom - hint.getBoundingClientRect().top), hint: Math.round(hint.getBoundingClientRect().height), text: hint.textContent}; }""")
        check(f"R2-7 {lang} disabled Save is the 56 px solid lilac at reduced strength: {m}", m["disabled"] and m["bg"] == lilac and 0.3 <= m["opacity"] <= 0.6 and m["h"] == 56)
        check(f"R2-7 {lang} the hint is at most two lines and the hint with Save is at most 128 px: {m['hint']} {m['foot']}", m["hint"] <= 48 and m["foot"] <= 128)  # Changed: the form card is 326 px wide, so a long Spanish hint may take two lines
        page.context.close()
    page = open_app(browser, base, 1440, 900, at, lang="en", theme="off")
    page.set_default_timeout(5000)
    page.locator('.tile[data-act="open-feed"]').click()
    m = page.evaluate("""() => { const s = document.querySelector('[data-sheet]').getBoundingClientRect(); return {over: [0, Math.round(s.top), 1440, Math.round(s.height)], sheet: [Math.round(s.left), Math.round(s.width)], vw: innerWidth, vh: innerHeight}; }""")
    check(f"R2-4 the full-screen form fills the 900 px height and stays 480 px wide and centered at 1440: {m}", m["over"][1] == 0 and m["over"][3] == 900 and m["sheet"][1] <= 480 and abs(m["sheet"][0] + m["sheet"][1] / 2 - 720) <= 1)  # Changed: the form is a screen in the phone column, not a scrim over the page
    page.context.close()
    page = open_app(browser, base, 390, 844, at, lang="en", theme="on")
    page.set_default_timeout(5000)
    page.locator('[data-act="open-more"]').click()
    m = page.evaluate("""() => { const lum = c => { const [r, g, b] = c.match(/\\d+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
        const plate = getComputedStyle(document.querySelector('.nav-row .plate')).fill, line = getComputedStyle(document.querySelector('.nav-row .ln')).stroke, page = getComputedStyle(document.body).backgroundColor;
        return {plate: lum(plate), line: lum(line), plateRaw: plate, lineRaw: line}; }""")
    check(f"R2-6 night: the plain icon block is dark (not a near-white square) and its line is light: {m}", m["plate"] < .12 and m["line"] > .5)
    page.context.close()
    page = open_app(browser, base, 390, 844, at, lang="en", theme="on")
    page.set_default_timeout(5000)
    for name, tile, selector in (("sleep", "open-sleep", "[data-sheet] .btn-primary"), ("feed", "open-feed", "[data-sheet] .side"), ("diaper", "open-dia", "[data-sheet] [data-act=dkind]")):
        page.locator(f'.tile[data-act="{tile}"]').click()
        rows = page.evaluate("""(sel) => { const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
            const lum = c => { const [r, g, b] = c.match(/\\d+/g).map(Number); return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b); };
            const back = el => { for (; el; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)') return c; } return 'rgb(0, 0, 0)'; };
            return [...document.querySelectorAll(sel)].map(b => { const fg = getComputedStyle(b).color, bg = back(b), [hi, lo] = [lum(fg), lum(bg)].sort((a, c) => c - a); return [b.textContent.trim().slice(0, 18), fg, bg, +((hi + .05) / (lo + .05)).toFixed(2)]; }); }""", selector)
        check(f"R2-2 night {name} form: every log button text reads against its own fill at 4.5:1 or more: {rows}", len(rows) >= 1 and all(r[3] >= 4.5 for r in rows))
        page.reload()
        page.locator('.tile[data-act="open-feed"]').wait_for()
    page.context.close()


NIGHT_PROBE = """(parts) => {
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const rgba = c => { const m = c.match(/[\\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
  const over = (top, under) => top[3] >= 1 ? top : [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat([1]);
  const back = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    return stack.reduceRight((under, c) => over(c, under), [0, 0, 0, 1]); };
  const lum = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return +((hi + .05) / (lo + .05)).toFixed(2); };
  const out = [];
  for (const [label, selector, kind] of parts) {
    for (const el of document.querySelectorAll(selector)) {
      if (!el.getClientRects().length) continue;  // a part that is not drawn (the check mark on an unpressed chip) has no contrast to measure
      const bg = back(el);
      if (kind === 'text') { if (!el.textContent.trim()) continue; out.push([label, selector, 4.5, ratio(over(rgba(getComputedStyle(el).color), bg), bg)]); }
      else if (kind === 'block') { const ground = back(el.parentElement), own = el instanceof SVGElement ? getComputedStyle(el).fill : getComputedStyle(el).backgroundColor;
        out.push([label, selector, 2, ratio(over(rgba(own), ground), ground)]); }  // a tile or icon block with no outline (Deep fills night look): its edge is its fill, 2:1
      else if (kind === 'fill') { const ground = back(el.parentElement); out.push([label, selector, 3, ratio(over(rgba(getComputedStyle(el).backgroundColor), ground), ground)]); }  // a mark drawn as a filled shape (a chip dot)
      else if (kind === 'border') { const ground = back(el.parentElement), fill = rgba(getComputedStyle(el).backgroundColor);
        // A control's edge is seen by its border or by its own fill against the ground; the better of the two counts.
        out.push([label, selector, 3, Math.max(ratio(over(rgba(getComputedStyle(el).borderTopColor), ground), ground), fill[3] > .5 ? ratio(over(fill, ground), ground) : 1)]); }
      else for (const svg of el.matches('svg') ? [el] : el.querySelectorAll('svg')) {
        // A drawn line (.ln) sits on the care-color shape, the icon plate or the surface behind the icon; the weakest of those counts.
        const plated = !!svg.querySelector('.plate'), grounds = plated ? [] : [back(svg)]; for (const f of svg.querySelectorAll('.shape, .plate')) { const c = rgba(getComputedStyle(f).fill); if (c[3] > 0) grounds.push(over(c, back(svg))); }
        for (const g of svg.querySelectorAll('.ln, .ln *')) { const c = getComputedStyle(g).stroke; if (c === 'none') continue; out.push([label, selector, 3, Math.min(...grounds.map(bgc => ratio(over(rgba(c), bgc), bgc)))]); } }
    }
  }
  return out;
}"""

NIGHT_LEAD = """() => {
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const lum = c => { const [r, g, b] = c.match(/[\\d.]+/g).map(Number); return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b); };
  const card = document.querySelector('.run-card'), kind = card.classList.contains('t-feed') ? 't-feed' : 't-sleep', tile = document.querySelector('.tile.' + kind);
  const [hi, lo] = [lum(getComputedStyle(card).backgroundColor), lum(getComputedStyle(tile).backgroundColor)].sort((x, y) => y - x);
  return +((hi + .05) / (lo + .05)).toFixed(2);
}"""

# [label, selector, kind]: text 4.5:1, glyph, control border and filled mark 3:1, tile and icon block fill 2:1, each against the colour behind it.
NIGHT_HOME = [
    ("tile text", ".tile", "text"), ("tile glyph", ".tile .ico", "glyph"), ("tile block", ".tile", "block"), ("running card block", ".run-card", "block"), ("Latest icon block", ".row:not(.t-plain) .ico .plate", "block"),
    ("running card title", ".run-card h2", "text"), ("running card timer", ".run-card .clock", "text"), ("running card line", ".run-card .sub", "text"),
    ("running card glyph", ".run-card .ico", "glyph"), ("running card button text", ".run-card .back", "text"), ("running card button border", ".run-card .back", "border"),
    ("Latest title", ".card > h2", "text"), ("Latest row title", ".row strong", "text"), ("Latest row line", ".row .sub", "text"), ("Latest row glyph", ".row .ico", "glyph"),
    ("Timeline link", ".textlink", "text"),
    ("nav row text", ".nav-row", "text"), ("nav row chevron", ".nav-row .chev svg", "glyph"), ("nav row glyph", ".nav-row > svg", "glyph"),
]
NIGHT_TIMELINE = [
    ("chip on", '.chip[aria-pressed="true"]', "text"), ("chip on border", '.chip[aria-pressed="true"]', "border"),
    ("chip off", '.chip[aria-pressed="false"]', "text"), ("chip off border", '.chip[aria-pressed="false"]', "border"),
    ("chip dot", ".chip .dot", "fill"), ("day heading", ".day > h2", "text"), ("Today row label", ".total dt", "text"), ("Today row value", ".total dd", "text"),
    ("row title", ".list .row strong", "text"), ("row line", ".list .row .sub", "text"), ("row time", ".list .row time", "text"), ("row glyph", ".list .row .ico", "glyph"), ("row icon block", ".list .row:not(.t-plain) .ico .plate", "block"),  # care blocks only: the neutral block is 1.37:1 by design (DESIGN.md Color rule 5); its line is measured as a glyph
    ("empty day line", ".day .card > p.sub", "text"), ("earlier-day link", ".textlink", "text"), ("title bar button", ".bar .back", "text"), ("title bar button border", ".bar .back", "border"),
]
NIGHT_CHARTS = [("chart head", ".charts-page .card h2", "text"), ("chart line", ".charts-page .card .sub", "text"), ("chart numbers toggle", ".charts-page summary", "text")]


def audit_night_contrast_new_parts(browser, base):
    """Failure case: a part of the new look that is dark on dark at night (the earlier check covered the log buttons only). Text needs 4.5:1, glyphs and control borders 3:1."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    for screen, tab, parts, running in (("Home", "home", NIGHT_HOME, True), ("Timeline", "log", NIGHT_TIMELINE, False), ("Charts", "charts", NIGHT_CHARTS, False)):
        page = open_app(browser, base, 390, 844, at, theme="on")
        page.set_default_timeout(5000)
        if running:
            page.st["sleepRun"] = {"id": "nc-run", "kind": "sleep", "t0": 600, "by": "Rowan"}
            page.reload()
            page.locator('.tile[data-act="open-feed"]').wait_for()
        navigate(page, tab)
        page.wait_for_timeout(300)
        rows = page.evaluate(NIGHT_PROBE, parts)
        seen = {r[0] for r in rows}
        weak = sorted({(r[0], r[1], r[2], r[3]) for r in rows if r[3] < r[2]})
        check(f"night {screen}: every measured part passes (text 4.5:1, glyphs and borders 3:1); {len(rows)} measured, weak: {weak}", len(rows) >= len(parts) - 2 and not weak)
        check(f"night {screen}: each named part was found on the page: {sorted({p[0] for p in parts} - seen)} missing", {p[0] for p in parts} <= seen)
        if running:
            lead = page.evaluate(NIGHT_LEAD)
            check(f"night Home: the running card leads its own tile at 1.25:1 or more (Deep fills, DESIGN.md Color rule 5): {lead}", lead >= 1.25)
        page.context.close()


NIGHT_FORM = [
    ("form title", ".bar h1", "text"), ("title bar button", ".bar .back", "text"), ("title bar button border", ".bar .back", "border"),
    ("field label", ".sheet .fl", "text"), ("field border", ".sheet .field", "border"),
    ("chip on", '.sheet .chip[aria-pressed="true"]', "text"), ("chip on border", '.sheet .chip[aria-pressed="true"]', "border"),
    ("chip off", '.sheet .chip[aria-pressed="false"]', "text"), ("chip off border", '.sheet .chip[aria-pressed="false"]', "border"), ("chip check", ".sheet .chip svg", "glyph"),
    ("More details link", ".sheet summary", "text"), ("text link", ".sheet .textlink", "text"), ("primary button", ".sheet .btn-primary, .sh-foot .btn-primary", "text"),
]
NIGHT_FORM_SCREENS = [
    ("feed", "S.sheet=null;act('open-feed');S.sheet.manual=true;S.sheet.detailsOpen=true;render()", NIGHT_FORM),
    ("sleep edit", "S.entries.push({id:'sleep:nc',type:'sleep',nap:false,dur:60,t:nowM()-300,by:'Rowan'});S.sheet=null;act('edit','sleep:nc');S.sheet.detailsOpen=true;render()", NIGHT_FORM + [("read-only Type", ".readonly", "text")]),
    ("diaper", "S.sheet=null;act('open-dia');S.sheet.type='W';S.sheet.detailsOpen=true;render()", NIGHT_FORM),
    ("settings", "S.sheet={kind:'settings',nightOpen:true};render()", [("settings heading", ".day > h2", "text"), ("settings row", ".nav-row", "text"), ("settings row chevron", ".nav-row .chev svg", "glyph"), ("settings line", ".line", "text"),
        ("settings chip on", '.card .chip[aria-pressed="true"]', "text"), ("settings chip off", '.card .chip[aria-pressed="false"]', "text"), ("settings chip off border", '.card .chip[aria-pressed="false"]', "border"), ("settings link", ".textlink", "text")]),
    ("more", "S.sheet={kind:'more'};render()", [("more row", ".nav-row", "text"), ("more row chevron", ".nav-row .chev svg", "glyph"), ("more row icon", ".nav-row .ico", "glyph")]),
]


def audit_night_contrast_forms(browser, base):
    """Failure case: a part of a form, Settings or More that is dark on dark (or a bright block) at night. Same measure as the Home, Timeline and Charts audit."""
    at = datetime.fromisoformat("2026-11-10T12:00:00-06:00")
    page = open_app(browser, base, 390, 844, at, theme="on")
    page.set_default_timeout(5000)
    for name, js, parts in NIGHT_FORM_SCREENS:
        page.evaluate("() => {S.sheet=null;S.drafts={};render();}")
        page.evaluate("() => {" + js + "}")
        page.wait_for_timeout(200)
        rows = page.evaluate(NIGHT_PROBE, parts)
        seen = {r[0] for r in rows}
        weak = sorted({(r[0], r[1], r[2], r[3]) for r in rows if r[3] < r[2]})
        check(f"night {name}: every measured part passes (text 4.5:1, glyphs and borders 3:1); {len(rows)} measured, weak: {weak}", not weak)
        check(f"night {name}: each named part was found on the page: {sorted({p[0] for p in parts} - seen)} missing", {p[0] for p in parts} <= seen)
        if name == "sleep edit":
            bg = page.evaluate("() => getComputedStyle(document.querySelector('.readonly')).backgroundColor")
            lum = sum(int(x) for x in re.findall(r"\d+", bg)[:3]) / 3
            check(f"night sleep edit: the read-only Type box is dark, not a bright block (background {bg})", lum < 110)
    page.context.close()


def main():
    global FAIL
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            login_csrf = "one-time-login-csrf"
            received_login = []
            session_state = {"signed_in": False, "person": "Rowan"}
            state_hits = []
            current_state = state_response()
            care_state = {"exportOptIn": False, "confirmations": [], "dutyHistory": [{"who":"Care Adult","note":"Handoff","adult":"Care Adult","occurredAt":"2026-10-25T12:00:00.000Z"}]}
            care_writes = []

            def session(route):
                req = route.request
                if req.method == "GET":
                    signed_in = session_state["signed_in"]
                    route.fulfill(json={"me": {"name": session_state["person"]} if signed_in else None, "csrf": "session-csrf" if signed_in else login_csrf, "careLink": True, "ai": True, "passcode": True, **({"people": ADULTS, "labels": ADULT_LABELS} if signed_in else {})})
                elif req.method == "POST":
                    received_login.append({"csrf": req.headers.get("x-csrf-token"), "body": req.post_data_json})
                    session_state["person"] = req.post_data_json["username"]
                    session_state["signed_in"] = True
                    route.fulfill(json={"me": session_state["person"], "csrf": "session-csrf"})
                elif req.method == "DELETE":
                    session_state["signed_in"] = False
                    route.fulfill(json={"me": None, "csrf": "next-login-csrf"})
                else:
                    route.fulfill(status=404, json={"error": "not found"})

            def state(route):
                state_hits.append(route.request.method)
                current_state["me"] = {"id": f"adult:{session_state['person']}", "name": session_state["person"]}
                current_state["people"] = [{"id": f"adult:{person}", "name": person, "onDuty": person == session_state["person"]} for person in ["Rowan", "Sage", "Wren"]]
                route.fulfill(json=current_state)

            def preferences(route):
                payload=route.request.post_data_json
                current_state["preferences"]={"units":payload.get("units","metric"),"language":payload.get("lang","en"),"palette":payload.get("palette","Sorbet"),"night":payload.get("night",False)}
                route.fulfill(json={"status":"saved","operationId":payload["operationId"],"state":current_state})

            def care_get(route):
                route.fulfill(json=care_state)

            def care_write(route):
                payload=route.request.post_data_json
                care_writes.append((route.request.method,route.request.url,payload))
                if route.request.url.endswith("/api/care/export-opt-in"):
                    care_state["exportOptIn"]=payload["enabled"]
                elif route.request.url.endswith("/revoke"):
                    care_state["confirmations"]=[item for item in care_state["confirmations"] if item["id"]!=route.request.url.split("/")[-2]]
                else:
                    care_state["confirmations"].append({"id":payload["operationId"],"start":payload["start"],"end":payload["end"],"confirmedAt":"2026-10-25T12:00:00.000Z","revision":"1"})
                route.fulfill(json={"saved":True})

            passcode_bodies = []
            page.route("**/api/session", session)
            page.route("**/api/session/passcode", lambda route: passcode_route(route, passcode_bodies))
            page.route("**/api/state", state)
            page.route("**/api/preferences", preferences)
            development_day = {"day": ""}
            page.route("**/api/development", lambda route: route.fulfill(json=development_batch(development_day["day"])))
            page.route("**/api/care", care_get)
            page.route("**/api/care/**", care_write)
            page.goto(base)
            check("anonymous session asks for the household passcode and shows no adult name", page.get_by_role("heading", name="Household passcode").is_visible() and page.locator("#passcode-form input[type=password]").count() == 1 and page.locator("#login-form").count() == 0 and not any(name in page.locator("body").inner_text() for name in ADULTS))
            page.locator("#passcode-form button[type=submit]").click()
            check("an empty passcode is refused by the field and sends no request", page.locator("#passcode-form input[name=passcode]:invalid").count() == 1 and not passcode_bodies)
            page.locator("#passcode-form input[name=passcode]").fill("wrong code here")
            page.locator("#passcode-form button[type=submit]").click()
            page.get_by_text("That passcode is not right.").wait_for(timeout=5000)
            check("a wrong passcode shows an icon and a message, keeps the passcode screen, and shows no name", page.locator("#passcode-form .shell-error svg").count() == 1 and page.locator("#login-form").count() == 0 and page.locator("#passcode-form input[name=passcode]").input_value() == "")
            audit_signin_style(page, "passcode")
            unlock(page)
            audit_signin_style(page, "names")
            check("a correct passcode opens the household picker without a password field", page.get_by_role("heading", name="Choose a person").is_visible() and page.get_by_label("Password").count() == 0 and page.locator("#login-form option").count() == 3 and page.get_by_text(PASSCODE).count() == 0)
            page.set_viewport_size({"width":1440,"height":900})
            login_geometry=page.evaluate("""() => {const c=document.querySelector('.shell-card'),s=document.querySelector('.stage'),r=c.getBoundingClientRect();return {card:r.height,stage:s.clientHeight,scroll:s.scrollHeight,bottom:r.bottom,view:innerHeight}}""")
            check("1440x900 login card keeps natural height",login_geometry["card"]+24<login_geometry["stage"])
            page.set_viewport_size({"width":1024,"height":400})
            short_login=page.evaluate("""() => {const c=document.querySelector('.shell-card'),s=document.querySelector('.stage'),r=c.getBoundingClientRect();return {card:r.height,stage:s.clientHeight,scroll:s.scrollHeight,bottom:r.bottom,view:innerHeight}}""")
            check("1024x400 login card keeps natural height and stays visible",short_login["card"]+24<short_login["stage"] and short_login["bottom"]<=short_login["view"]+1)
            page.set_viewport_size({"width":390,"height":844})
            page.get_by_label("Person").select_option("Rowan")
            page.get_by_role("button", name="Continue").click()
            page.locator('.tile[data-act="open-feed"]').wait_for()
            check("picker sends only the selected name, the passcode and csrf", len(received_login) == 1 and received_login[0]["csrf"] == login_csrf and received_login[0]["body"] == {"username": "Rowan", "passcode": PASSCODE})
            check("the browser drops the passcode once the sign-in starts", page.evaluate("householdPasscode") == "" and PASSCODE not in page.content())
            check("state loads after successful session and has no demo events", len(state_hits) == 1 and page.locator(".rowedit").count() == 0)
            audit_care_screen(page, care_state, care_writes)
            audit_sleep_stop_permission(page)
            evidence = Path("/tmp/little-days-responsive-2026-10-25")
            evidence.mkdir(parents=True, exist_ok=True)
            for width, height in [(320, 740), (390, 844), (768, 900), (1024, 900), (1440, 1000)]:
                audit_responsive_shell(page,width,height,evidence)
            audit_settings_content(page)
            audit_more_details(page)
            check("an empty Home says Nothing logged yet once and shows the hint (R3 replaces the three empty care rows)",all(page.get_by_text(label).count()==1 for label in ["Nothing logged yet","Tap Feed, Sleep or Diaper to log the first one."]) and page.get_by_text("No feed logged").count()==0)
            check("mock toolbar and sample gallery drawings are absent", page.get_by_text("Mock clock").count() == 0 and page.locator(".pbig svg").count() == 0)
            check("Mexico City clock replaces fixed November demo date", page.get_by_text("Nov 30").count() == 0 and page.get_by_text("Mexico City time").count() == 0 and page.evaluate("(() => { const t = document.querySelector('.top .when').textContent; return /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \\d{1,2}$/.test(t) && !t.includes(clk(nowM())); })()"))  # owner 2026-11-11: the header shows the date only, no time
            check("writes no longer show a read-only notice", page.get_by_text("Read only while server write routes are connected.").count() == 0)
            page.locator('.tile[data-act="open-feed"]').click()
            page.get_by_role("button", name="Bottle").click()
            # Changed (R4): the bottle Save is always on; a blank form shows the inline error instead of a disabled button.
            page.locator("[data-sheet] [data-act=save]").click()
            check("a bottle form with no milk picked keeps Save on, sends nothing and shows the inline error", page.locator("[data-act=save]:enabled").count() == 1 and page.locator("[data-sheet] .error").is_visible())
            page.locator("[data-sheet] details[data-more-details] summary").click()
            dirty = page.locator("[data-sheet] input.field").first
            dirty.fill("123")
            page.set_viewport_size({"width": 1440, "height": 1000})
            page.set_viewport_size({"width": 390, "height": 844})
            form_metrics = page.evaluate("""() => { const cancel=document.querySelector('[data-sheet] [data-act="cancel"]'),save=document.querySelector('[data-sheet] [data-act="save"]'); return {value:document.querySelector('[data-sheet] input.field')?.value,overflow:document.documentElement.scrollWidth>innerWidth,cancel:!!cancel&&cancel.getBoundingClientRect().width>=44,save:!!save&&save.getBoundingClientRect().width>=44} }""")
            print(f"RESIZE DIRTY FORM {form_metrics}")
            check("dirty form survives desktop and phone resize with save/cancel reachable", form_metrics == {"value":"123","overflow":False,"cancel":True,"save":True})
            page.get_by_role("button", name="Cancel", exact=True).click()
            page.get_by_role("button", name="Discard draft").click()
            page.locator('.tile[data-act="open-dia"]').click()
            # Changed (R4, binding notes): the diaper form is Wet / Dirty / Wet and dirty chips, a Changed time, More details and "Save diaper".
            check("diaper form offers three kind chips, one Save that is off until a kind is picked, and no tap-to-save buttons", page.locator('[data-sheet] [data-act=dkind]').count() == 3 and page.locator('[data-sheet] [data-act=dtype]').count() == 0 and page.locator('[data-sheet] [data-act=save]:disabled').count() == 1)
            order = page.evaluate("""() => {const b=document.querySelector('[data-sheet] [data-act=dkind]'),c=document.querySelector('[data-sheet] [data-fid=manualClock]'),d=document.querySelector('[data-sheet] details[data-more-details]');
              return {after:!!(b&&c&&(b.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)),closed:!!d&&!d.open,label:document.querySelector('[data-sheet] label[for=f-manualClock]')?.textContent}}""")
            check("diaper form shows the kinds first, then the Changed time, with More details closed", order == {"after": True, "closed": True, "label": "Changed"})
            page.locator('[data-sheet] details[data-more-details] summary').click()
            check("More details shows Day and Logged by", page.locator('[data-sheet] [data-fid=manualDate]').is_visible() and page.locator('[data-sheet] [data-act=logged-by]').count() >= 1)
            page.get_by_role("button", name="Cancel", exact=True).click()
            navigate(page, "photos")
            check("gallery has a real empty state", page.get_by_text("No photos have been added.").is_visible())
            navigate(page, "home")
            check("development cards stay hidden without a valid birth date", page.locator(".development-card").count() == 0)
            current_state['child']['birthDate'] = page.evaluate("shiftISO(todayISO(), -190)")
            development_day["day"] = page.evaluate("todayISO()")
            page.reload();page.locator('.tile[data-act="open-feed"]').wait_for()
            page.wait_for_function("S.developmentBatch?.status==='ready'")
            for _ in range(20):
                if page.locator('.insight h2').inner_text() == 'A general sleep range for this age':
                    break
                page.locator('[data-act=fact-next]').click()
            sleep_fact=page.locator('.insight').filter(has_text='A general sleep range for this age')
            check('age-eligible guidance appears in the single fact card with a safe source link', sleep_fact.count() == 1 and sleep_fact.locator("a[target=_blank][rel='noopener noreferrer']").count() == 1 and page.locator('.development-card').count() == 0)
            previous_fact=page.locator('.insight').get_attribute('data-fact')
            page.locator('[data-act=fact-next]').click()
            check('Next replaces the fact instead of adding cards', page.locator('.insight').count() == 1 and page.locator('.insight').get_attribute('data-fact') != previous_fact)
            current_state['preferences']['language'] = 'es'
            page.evaluate("""() => { S.lang='es'; render(); }""")
            for _ in range(20):
                if page.locator('.insight h2').inner_text() == 'Un rango general de sueño para esta edad':
                    break
                page.locator('[data-act=fact-next]').click()
            check('the single fact card renders Spanish content', page.locator('.insight').count() == 1 and page.locator('.insight h2').inner_text() == 'Un rango general de sueño para esta edad' and page.locator('[data-act=fact-next]').get_attribute('aria-label') == 'Dato siguiente')
            current_state['child']['birthDate'] = ''
            current_state['preferences']['language'] = 'en'
            page.evaluate("""() => { localStorage.removeItem('little-days-development-dismissed'); S.child.birthDate=''; S.lang='en'; render(); }""")
            open_settings(page)
            pick_setting(page, "lang", "es")
            page.wait_for_function("document.querySelector('#settings-title')?.textContent === 'Ajustes'")
            close_settings(page)
            spanish_empty=all(page.get_by_text(label).count()==1 for label in ["Todavía no hay registros","Toque Toma, Sueño o Pañal para el primer registro."])
            check("Spanish empty Home says Todavía no hay registros and shows the hint (R3)",spanish_empty)
            navigate(page, "log")
            check("Spanish shell and controls render accented labels", page.get_by_role("button", name="Iniciar sesión").count() == 0 and page.locator(".screen-top h1").inner_text() == "Historial")
            check("passwords and csrf values are not stored in local storage", page.evaluate("localStorage.length") == 0)

            audit_person_switch(page, session_state)
            audit_reminder_default(page)
            audit_other_label(page, current_state)

            # The transport adapter sends a mutation only when its server route is tested.
            mutation_requests = []

            def timer(route):
                req = route.request
                mutation_requests.append({"method": req.method, "csrf": req.headers.get("x-csrf-token"), "body": req.post_data_json})
                route.fulfill(json={"operationId": req.post_data_json.get("operationId"), "status": "saved", "state": current_state})

            page.route("**/api/timers", timer)
            result = page.evaluate("async () => await LittleDaysAPI.writes.startTimer({kind:'feed',side:'L'})")
            check("timer adapter posts UUID operation ID with CSRF and accepts saved status", len(mutation_requests) == 1 and mutation_requests[0]["method"] == "POST" and mutation_requests[0]["csrf"] == "session-csrf" and mutation_requests[0]["body"]["kind"] == "feed" and bool(mutation_requests[0]["body"].get("operationId")) and result.get("confirmed") is True)
            check("browser has no uncaught JavaScript errors", not errors)
            # A failing bootstrap shows a retry state, not an empty family timeline.
            error_page = browser.new_page()
            error_page.route("**/api/session", lambda route: route.fulfill(status=503, json={"error": "Unavailable"}))
            error_page.goto(base)
            check("server failure shows retry shell", error_page.get_by_role("heading", name="Connection problem").is_visible() and error_page.get_by_role("button", name="Retry").is_visible())
            error_page.close()

            # A locked member consumes the sign-in token, so the app must fetch a fresh one before the next pick.
            lock_page = browser.new_page()
            lock_tokens = {"n": 0}
            lock_posts = []
            def lock_session(route):
                if route.request.method == "GET":
                    lock_tokens["n"] += 1
                    route.fulfill(json={"me": None, "csrf": f"login-{lock_tokens['n']}", "passcode": True})
                else:
                    lock_posts.append(route.request.headers.get("x-csrf-token"))
                    route.fulfill(status=429, json={"error": "This account is locked after too many wrong passwords. Try again in 1 hour, or ask an owner of this household to unlock it."})
            lock_page.route("**/api/session", lock_session)
            lock_page.route("**/api/session/passcode", lambda route: passcode_route(route))
            lock_page.goto(base)
            unlock(lock_page)
            lock_page.locator("#login-form button[type=submit]").click()
            lock_page.get_by_text("locked after too many").wait_for(timeout=5000)
            unlock(lock_page)
            lock_page.locator("#login-form button[type=submit]").click()
            lock_page.wait_for_function("document.body.textContent.includes('locked after too many')", timeout=5000)
            lock_page.wait_for_timeout(300)
            check("lockout shows the lock message and the next pick uses a fresh sign-in token", len(lock_posts) == 2 and lock_posts[0] != lock_posts[1])
            lock_page.close()

            audit_child_setup(browser, base)

            permission_page=browser.new_page()
            restricted={**state_response(),"child":None}
            restricted["me"]={"id":"adult:wren","name":"Wren"}
            restricted["permissions"]={"resources":{"children":{"view":True,"add":False,"change":False,"delete":False}}}
            permission_page.route("**/api/session",lambda route:route.fulfill(json={"me":restricted["me"],"csrf":"permission-csrf"}))
            permission_page.route("**/api/state",lambda route:route.fulfill(json=restricted))
            permission_page.goto(base)
            permission_page.get_by_text("Waiting for an adult who can set up the baby profile.").wait_for()
            waiting=permission_page.get_by_text("Waiting for an adult who can set up the baby profile.").is_visible() and permission_page.locator('[name="birthDate"]').count()==0
            check("adult without child-add access sees waiting state",waiting)
            restricted["permissions"]["resources"]["children"]["add"]=True
            permission_page.reload()
            permission_page.locator('[name="birthDate"]').wait_for()
            permission_page.set_viewport_size({"width":1440,"height":900})
            tall_setup=permission_page.evaluate("""() => {const c=document.querySelector('.shell-card'),s=document.querySelector('.stage');return {card:c.getBoundingClientRect().height,stage:s.clientHeight}}""")
            check("1440x900 child setup card keeps natural height",tall_setup["card"]+24<tall_setup["stage"])
            permission_page.set_viewport_size({"width":1024,"height":400})
            setup_geometry=permission_page.evaluate("""() => {const c=document.querySelector('.shell-card'),s=document.querySelector('.stage'),r=c.getBoundingClientRect();return {card:r.height,stage:s.clientHeight,scroll:s.scrollHeight,bottom:r.bottom,view:innerHeight}}""")
            permission_page.locator('.stage').evaluate("el=>el.scrollTop=el.scrollHeight")
            setup_button=permission_page.locator('#child-form button').bounding_box()
            check("1024x400 child setup scrolls naturally and keeps Save reachable",setup_geometry["card"]>setup_geometry["stage"] and setup_geometry["scroll"]>setup_geometry["stage"] and setup_button is not None and setup_button["y"]+setup_button["height"]<=400)
            check("adult with child-add access sees the setup form",permission_page.locator('[name="birthDate"]').count()==1)
            restricted["child"]={"id":"child:1","name":"Ada"}
            restricted["permissions"]["resources"]["children"]["change"]=False
            permission_page.reload()
            check("adult without child-change access has no portrait upload",permission_page.locator('[data-fid="portrait"]').count()==0)
            permission_page.locator('[data-act="open-more"]').click()
            permission_page.locator("[data-sheet]").wait_for()
            check("with no link settings, More shows no care-hours row and no Health sharing", permission_page.locator('[data-act="open-care"]').count()==0 and not any(text in permission_page.locator("[data-sheet]").inner_text() for text in ("Health sharing", "Confirm your care hours")))
            permission_page.close()

            data_page = browser.new_page()
            data_page.route("**/api/session", lambda route: route.fulfill(json={"me": {"id": "adult:1", "name": "Care Adult"}, "csrf": "read-csrf", "ai": True}))
            loaded = state_response()
            loaded["preferences"] = {"units": "us", "language": "en"}
            loaded["entries"] = [{"id": "event:abc-123", "type": "bottle", "t": 840, "ml": 90, "milk": "formula", "by": "Care Adult"}]
            data_state_requests=[]
            trend_revision={"value":0}
            def data_state(route):
                data_state_requests.append(route.request.url)
                if "from=" in route.request.url:
                    query=parse_qs(urlparse(route.request.url).query)
                    span=(date.fromisoformat(query["to"][0])-date.fromisoformat(query["from"][0])).days
                    if span > 1:
                        today=date.fromisoformat(query["to"][0])-timedelta(days=1)
                        from_offset=(date.fromisoformat(query["from"][0])-today).days
                        to_offset=(date.fromisoformat(query["to"][0])-today).days
                        entries=[]
                        for offset in range(-7,0):
                            feed_id=f"trend-feed-{offset}"
                            entries.extend([
                                {"id":feed_id,"type":"feed","sid":f"session-{offset}","side":"L","t":offset*1440+120,"dur":20,"by":"Care Adult"},
                                {"id":feed_id+"-switch","type":"feed","sid":f"session-{offset}","side":"R","t":offset*1440+140,"dur":15,"by":"Care Adult"},
                                {"id":f"trend-bottle-{offset}","type":"bottle","ml":60,"t":offset*1440+180,"by":"Care Adult"},
                                {"id":f"trend-diaper-{offset}","type":"diaper","kind":"B","t":offset*1440+200,"by":"Care Adult"},
                                {"id":f"trend-sleep-{offset}","type":"sleep","dur":60,"t":offset*1440+240,"by":"Care Adult"},
                                {"id":f"trend-pump-{offset}","type":"pump","ml":80,"t":offset*1440+300,"by":"Care Adult"},
                            ])
                        entries.extend([
                            {"id":"trend-carry-sleep","type":"sleep","dur":90+30*trend_revision["value"],"t":-8*1440+1410,"by":"Care Adult"},
                            {"id":"trend-carry-feed-l","type":"feed","sid":"carry-session","side":"L","t":-8*1440+1430,"by":"Care Adult"},
                            {"id":"trend-carry-feed-r","type":"feed","sid":"carry-session","side":"R","t":-7*1440+10,"by":"Care Adult"},
                        ])
                        # Match records.insideRange filtering period rows by start date.
                        entries=[entry for entry in entries if from_offset<=entry["t"]//1440<to_offset]
                        route.fulfill(json={**loaded,"entries":entries})
                    else:
                        older={"id":"event:older-note","type":"note","title":"Older note","text":"Range loaded","t":-2*1440+500,"by":"Care Adult"}
                        route.fulfill(json={**loaded,"entries":[older]})
                else:
                    route.fulfill(json=loaded)
            data_page.route("**/api/state**", data_state)
            data_page.goto(base)
            data_page.locator('.tile[data-act="open-feed"]').wait_for()
            audit_upcoming_appointment_time(data_page,loaded)
            navigate(data_page, "log")
            row = data_page.locator('[data-row="event:abc-123"]')
            check("server entry with a string resource ID renders", row.count() == 1)
            shown = row.get_by_text("3 oz").count() == 1 and row.get_by_text("Formula").count() == 1
            open_settings(data_page)
            units = data_page.locator('[data-setting="units"][aria-pressed="true"]').get_attribute("data-value")
            close_settings(data_page)
            check("server amount and account unit preference render without invented values", shown and units == "us")
            row.click()
            check("edit lookup preserves a nonnumeric server ID", data_page.get_by_role("dialog", name="Edit feed").is_visible() and data_page.locator('[data-fid="valueMl"]').input_value() == "90")
            data_page.get_by_role("button", name="Cancel", exact=True).click()
            audit_timeline_rows(data_page,loaded)
            navigate(data_page, "log")
            data_page.locator('[data-act="earlier-day"]').click(force=True)
            data_page.wait_for_timeout(1000)
            query=parse_qs(urlparse(data_state_requests[-1]).query)
            loaded_older=data_page.get_by_text("Older note").count()>0
            check("older timeline dates load from the exclusive date range endpoint", loaded_older and len(data_state_requests)>1 and "from" in query and "to" in query and query["to"][0] != query["from"][0])
            loaded["preferences"]={"units":"us","language":"en"}
            data_page.reload();data_page.locator('.tile[data-act="open-feed"]').wait_for()
            audit_trends(data_page,data_state_requests,trend_revision)
            audit_large_text_titles(browser, base)
            audit_long_responsive_timeline(data_page,loaded)
            audit_next_side(data_page)
            audit_day_totals(browser, base)
            audit_day_totals_live(browser, base)
            audit_known_gaps(browser, base)
            audit_look_spacing(browser, base)
            audit_forms_look(browser, base)
            audit_more_look(browser, base)
            audit_empty_and_photos_look(browser, base)
            audit_photos_heading(browser, base)
            audit_design_review_r2(browser, base)
            audit_night_contrast_new_parts(browser, base)
            audit_night_contrast_forms(browser, base)
            data_page.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
