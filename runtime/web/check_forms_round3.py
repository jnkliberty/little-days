"""Round-3 form behavior: the Stop confirm, Settings chips, pump presets, the read-only sleep Type and typed Minutes in an edit.
Each test names the failure it catches. Mocked API only; invented data."""
import re
from datetime import datetime

from playwright.sync_api import sync_playwright

from check_support import launch_browser, open_app, start_static_server
from check_ui import open_settings, close_settings
from forms_support import pick_setting, set_period

RESULTS = []
NOON = datetime.fromisoformat("2026-11-10T12:00:00-06:00")


def check(name, condition):
    RESULTS.append((name, bool(condition)))
    print(("PASS " if condition else "FAIL ") + name, flush=True)


def stop_confirm(browser, base):
    """Fails if Stop sends the stop at once (no question), if Keep sends it anyway, or if Stop and save does not send it."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    posts = []

    def timers(route):
        posts.append(route.request.url)
        route.fulfill(json={"status": "saved", "operationId": route.request.post_data_json["operationId"], "state": {**page.st, "run": None}})

    page.route("**/api/timers/**", timers)
    page.evaluate("() => {S.run={id:'t-confirm',side:'L',t0:nowM()-12,startedAt:new Date(Date.now()-12*60000).toISOString(),by:'Rowan'};render();act('open-feed');render();}")
    page.locator('[data-sheet] [data-act="stop"]').click()
    check("Stop opens a question and sends nothing yet", page.locator('.confirm [data-act="stop-go"]').count() == 1 and not posts)
    check("the question names the side and the running time", "Left" in page.locator(".confirm .sub").inner_text() and re.search(r"\d+\u00a0m \d\d\u00a0s", page.locator(".confirm .sub").inner_text()))
    page.locator('.confirm [data-act="stop-keep"]').click()
    check("Keep feeding closes the question, sends nothing and the timer runs on", page.locator(".confirm").count() == 0 and not posts and page.evaluate("S.run?.id") == "t-confirm")
    page.locator('[data-sheet] [data-act="stop"]').click()
    page.locator('.confirm [data-act="stop-go"]').click()
    page.wait_for_function("!S.busy")
    check("Stop and save sends exactly one stop for the timer", len(posts) == 1 and posts[0].endswith("/t-confirm/stop"))
    page.context.close()


def settings_chips(browser, base):
    """Fails if a Settings chip does not change the language or the unit, or if the pressed chip does not follow the choice."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    def preferences(route):
        body = route.request.post_data_json
        page.st["preferences"].update({"language": body["lang"], "units": body["units"]})
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})

    page.route("**/api/preferences**", preferences)
    open_settings(page)
    check("Settings offers Language and Units as chips, not lists", page.locator('[data-setting="lang"]').count() == 2 and page.locator('[data-setting="units"]').count() == 2 and page.locator(".settings-card select, .wrap-settings select").count() == 0)
    pick_setting(page, "lang", "es")
    page.wait_for_function("S.lang === 'es'")
    check("the Español chip switches the screen to Spanish and shows pressed", page.locator("#settings-title").inner_text() == "Ajustes" and page.locator('[data-setting="lang"][data-value="es"]').get_attribute("aria-pressed") == "true")
    pick_setting(page, "units", "us")
    page.wait_for_function("unitsOf() === 'us'")
    check("the oz chip sets the unit and shows pressed", page.evaluate("unitsOf()") == "us" and page.locator('[data-setting="units"][data-value="us"]').get_attribute("aria-pressed") == "true")
    close_settings(page)
    page.context.close()


def pump_presets(browser, base):
    """Fails if a preset fills the wrong side: it must fill the side that was last tapped."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    page.evaluate("() => {S.sheet=null;S.drafts={};act('open-feed');act('ftab','pump');render();}")
    page.locator('[data-fid="pL"]').click()
    page.locator('.presets [data-arg="90"]').click()
    left_first = page.evaluate("[S.sheet.pL, S.sheet.pR]")
    page.locator('[data-fid="pR"]').click()
    page.locator('.presets [data-arg="120"]').click()
    both = page.evaluate("[S.sheet.pL, S.sheet.pR]")
    check("a preset fills the Left side while Left is the side in use", left_first[0] == 90 and not left_first[1])
    check("after tapping Right, a preset fills Right and keeps Left", both == [90, 120])
    page.context.close()


def edit_forms(browser, base):
    """Fails if the sleep Type is editable text, if it ignores the Nap or Night choice, or if typed Minutes do not reach the saved length."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    saved = []

    def update(route):
        body = route.request.post_data_json
        saved.append(body["event"])
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})

    page.route("**/api/events/**", update)
    page.evaluate("""() => {
      const at = nowM() - 120;
      S.entries.push({id:'feedings:r3', type:'feed', side:'L', dur:22, t:at, by:'Rowan'});
      S.entries.push({id:'sleep:r3', type:'sleep', nap:false, dur:60, t:at - 200, by:'Rowan'});
      S.sheet=null;render();act('edit','sleep:r3');render();
    }""")
    kind = page.locator("[data-sheet] #sleep-kind")
    check("the sleep Type is a read-only line, not a field", kind.evaluate("el => el.tagName") == "P" and kind.inner_text() == "Night sleep" and page.locator("[data-sheet] input#sleep-kind").count() == 0)
    page.locator('[data-sheet] [data-act="editNap"][data-arg="nap"]').click()
    check("the Nap choice in More details changes the Type line", page.locator("[data-sheet] #sleep-kind").inner_text() == "Nap")
    page.evaluate("S.sheet=null;render();act('edit','feedings:r3');render();")
    page.locator('[data-fid="valueDur"]').fill("30")
    start = page.locator('[data-fid="editClock"]').input_value()
    end = page.locator('[data-fid="editEndClock"]').input_value()
    check("typing Minutes moves the Ended time to start plus those minutes", start != end and page.evaluate("S.sheet.valueDur") == "30")
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function("!S.busy && !S.sheet")
    check("the saved feed carries the typed 30 minutes", len(saved) == 1 and saved[0].get("duration") == 30)
    page.context.close()


def manual_sleep_type(browser, base):
    """Fails if a hand-typed night start saves as a nap (Type is computed at draw, typing does not redraw), or if a picked Type is overridden."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    saved = []

    def add(route):
        body = route.request.post_data_json
        saved.append(body.get("event") or body)
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})

    page.route("**/api/events", add)

    def save_typed(clock, period, end, end_period, pick=None):
        page.evaluate("() => {S.sheet=null;S.drafts={};S.tab='home';render();S.sheet={kind:'sleep',manual:true,manualDate:'2026-11-09',manualDuration:'60'};render();}")
        page.locator('[data-fid="manualClock"]').fill(clock)
        set_period(page, "manual", period)
        page.locator('[data-fid="manualEndClock"]').fill(end)
        set_period(page, "manualEnd", end_period)
        if pick:
            page.evaluate("() => {S.sheet.detailsOpen=true;render();}")
            page.locator(f'[data-sheet] [data-act="nap"][data-arg="{pick}"]').click()
        before = len(saved)
        page.locator('[data-sheet] [data-act="save"]').click()
        for _ in range(50):
            if len(saved) > before:
                break
            page.wait_for_timeout(100)
        return saved[-1] if len(saved) > before else {}

    night = save_typed("1100", "PM", "1200", "AM")
    check("a night start typed by hand (11:00 PM) saves as night, not nap", night.get("nap") is False)
    day = save_typed("100", "PM", "200", "PM")
    check("a day start typed by hand (1:00 PM) saves as a nap", day.get("nap") is True)
    picked = save_typed("100", "PM", "200", "PM", pick="night")
    check("a Type the person picked is kept, even against the typed time", picked.get("nap") is False)
    page.context.close()


def stop_confirm_keys(browser, base):
    """Fails if Tab leaves the Stop confirm for the form behind it, or if Escape cancels the form instead of only the confirm."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    page.evaluate("() => {S.run={id:'t-keys',side:'L',t0:nowM()-12,startedAt:new Date(Date.now()-12*60000).toISOString(),by:'Rowan'};render();act('open-feed');render();}")
    page.locator('[data-sheet] [data-act="stop"]').click()
    inside = lambda: page.evaluate("() => !!document.activeElement.closest('.confirm')")
    seen = []
    for _ in range(5):
        page.keyboard.press("Tab")
        seen.append(inside())
    check("Tab keeps focus inside the Stop confirm, forward", all(seen))
    seen = []
    for _ in range(5):
        page.keyboard.press("Shift+Tab")
        seen.append(inside())
    check("Shift+Tab keeps focus inside the Stop confirm, backward", all(seen))
    page.keyboard.press("Escape")
    check("Escape closes only the confirm: the Feed form stays and the feed still runs", page.locator(".confirm").count() == 0 and page.locator("[data-sheet]").count() == 1 and page.evaluate("S.run?.id") == "t-keys")
    page.evaluate("() => {S.sheet=null;render();}")
    page.wait_for_timeout(450)  # decision 2026-11-11: the Home bar ignores taps for 400 ms after a form closes (the form's Save sits over it)
    page.locator('.dock [data-act="stop"]').click()
    page.keyboard.press("Tab")
    check("on the Home Stop bar, Tab stays in the confirm and Escape closes it", inside())
    page.keyboard.press("Escape")
    check("Escape on the Home confirm keeps the feed running", page.locator(".confirm").count() == 0 and page.evaluate("S.run?.id") == "t-keys")
    page.context.close()


def growth_empty_measure(browser, base):
    """Fails if tapping Length with no length records does nothing: the chip must show selected and the card must say No records yet."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    page.evaluate("() => {S.tab='charts';S.growthLoading=false;S.growthError=false;S.growthUnavailable=[];S.growthEntries=[{id:'g1',type:'growth',date:'2026-10-01',kg:4.2}];S.growthMeasure='weight';render();}")
    chip = lambda m: page.locator(f'[data-act="growth-measure"][data-arg="{m}"]')
    check("with weight records only, Weight is selected and the chart shows", chip("weight").get_attribute("aria-pressed") == "true" and page.locator('.plot[data-chart="growth"]').count() == 1)
    chip("length").click()
    card = page.locator(".growth-chips").locator("xpath=..")
    check("tapping Length with no records selects the chip and says No records yet.", chip("length").get_attribute("aria-pressed") == "true" and chip("weight").get_attribute("aria-pressed") == "false" and "No records yet." in card.inner_text())
    chip("weight").click()
    check("tapping Weight brings the chart back", chip("weight").get_attribute("aria-pressed") == "true" and page.locator('.plot[data-chart="growth"]').count() == 1)
    page.context.close()


def timer_unit_form(browser, base):
    """Fails if a running feed or sleep form, or the Stop confirm, prints the timer as a clock (12:04): the app writes 12 m 04 s everywhere."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    clock = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b(?!\s?[AP]M)")
    page.evaluate("() => {S.run={id:'t-unit',side:'L',t0:nowM()-12,startedAt:new Date(Date.now()-(12*60+4)*1000).toISOString(),by:'Rowan'};S.sheet=null;render();act('open-feed');render();}")
    form = page.locator("[data-sheet]").inner_text()
    check("the running Feed form shows the timer in the unit form (12 m 04 s), not a clock", re.search(r"\b12\u00a0m 0[45]\u00a0s", form) and not clock.search(form))
    page.locator('[data-sheet] [data-act="stop"]').click()
    sub = page.locator(".confirm .sub").inner_text()
    check("the Stop confirm shows the timer in the unit form, not a clock", re.search(r"\bm 0\d\u00a0s", sub) and not clock.search(sub))
    page.evaluate("() => {S.confirmStop=null;S.run=null;S.sleepRun={id:'s-unit',nap:true,t0:nowM()-12,startedAt:new Date(Date.now()-(12*60+4)*1000).toISOString(),by:'Rowan'};S.sheet=null;render();act('open-sleep');render();}")
    form = page.locator("[data-sheet]").inner_text()
    check("the running Sleep form shows the timer in the unit form, not a clock", re.search(r"\bm 0\d\u00a0s", form) and not clock.search(form))
    page.context.close()


def pager_dot_color(browser, base):
    """Fails if the Home pager dots use the page ink instead of the mockup's deep violet (--line, rgb 63 54 89)."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    page.evaluate("() => {S.tab='home';S.sheet=null;render();}")
    colors = page.evaluate("() => [...document.querySelectorAll('.fact-dot')].map(e => [getComputedStyle(e).borderColor, e.classList.contains('current') ? getComputedStyle(e).backgroundColor : ''])")
    check("the long dot and the ring dots of the insight pager are deep violet", len(colors) >= 2 and all(c[0] == "rgb(63, 54, 89)" for c in colors) and [c[1] for c in colors if c[1]] == ["rgb(63, 54, 89)"])
    page.context.close()


def typed_time_focus(browser, base):
    """Fails if a field that lost focus within one frame takes it back (select() moves focus), so End digits land in Start and save a wrong time."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    saved = []

    def add(route):
        body = route.request.post_data_json
        saved.append(body.get("event") or body)
        route.fulfill(json={"status": "saved", "operationId": body["operationId"], "state": page.st})

    page.route("**/api/events", add)
    bad = []
    for n in range(10):
        page.evaluate("() => {S.sheet=null;S.drafts={};S.tab='home';render();S.sheet={kind:'sleep',manual:true,manualDate:'2026-11-09',manualDuration:'60'};render();}")
        start, end = page.locator('[data-fid="manualClock"]'), page.locator('[data-fid="manualEndClock"]')
        start.fill("1100 PM")
        page.keyboard.press("Tab")  # straight to End, inside the frame in which Start took focus
        end.fill("1200 AM")
        shown = (start.input_value(), end.input_value())
        before = len(saved)
        page.locator('[data-sheet] [data-act="save"]').click()
        for _ in range(50):
            if len(saved) > before:
                break
            page.wait_for_timeout(100)
        body = saved[-1] if len(saved) > before else {}
        if not (shown[0] in ("1100 PM", "11:00 PM", "11:00") and shown[1] in ("1200 AM", "12:00 AM", "12:00") and body.get("start") == "2026-11-10T05:00:00.000Z" and body.get("end") == "2026-11-10T06:00:00.000Z"):
            bad.append((n, shown, body.get("start"), body.get("end")))
    check(f"typing Start, Tab, typing End keeps both and posts both, 10 times in a row (wrong: {bad[:2]})", not bad)
    page.context.close()
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    page.evaluate("() => {S.sheet={kind:'sleep',manual:true,manualDate:'2026-11-09',manualDuration:'60'};render();}")
    page.evaluate("() => {window.FOCUSED=[];document.addEventListener('focusin',e=>FOCUSED.push(e.target.dataset.fid),true);document.getElementById('f-manualClock').focus();document.getElementById('f-manualEndClock').focus();}")
    page.wait_for_timeout(400)
    moves = page.evaluate("FOCUSED")
    check(f"focus handed from Start to End within one frame stays on End and does not bounce back (moves: {moves[:6]})", moves == ["manualClock", "manualEndClock"] and page.evaluate("document.activeElement.dataset.fid") == "manualEndClock")
    page.context.close()


def stop_confirm_focus(browser, base):
    """Fails if keyboard focus drops to the page when the Stop confirm closes: it must return to the Stop button that opened it."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.set_default_timeout(4000)
    where = "() => { const a = document.activeElement; return a.dataset.act + ' in ' + (a.closest('[data-sheet]') ? 'form' : a.closest('.dock') ? 'bar' : 'page'); }"
    for opener, expected in (('.dock [data-act="stop"]', "stop in bar"), ('[data-sheet] [data-act="stop"]', "stop in form")):
        for how in ("Keep", "Escape"):
            page.evaluate("() => {S.run={id:'t-focus',side:'L',t0:nowM()-12,startedAt:new Date(Date.now()-12*60000).toISOString(),by:'Rowan'};S.confirmStop=null;S.sheet=null;render();}")
            if "sheet" in opener:
                page.evaluate("() => {act('open-feed');render();}")
            page.locator(opener).click()
            if how == "Keep":
                page.locator('.confirm [data-act="stop-keep"]').click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(100)
            got = page.evaluate(where)
            check(f"after {how} on the confirm opened from the {'form' if 'sheet' in opener else 'Home bar'}, focus is on that Stop button (got: {got})", got == expected)
    page.context.close()


def small_overlay_motion(browser, base):
    """Failure cases: replay on redraw, motion for keyboard/full forms/reduced motion, or delayed closing."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    moving = "document.getAnimations().filter(a=>a.id==='ui-enter')"
    check("first app load has no entrance animation", page.evaluate(moving + '.length') == 0)
    page.evaluate("()=>{S.run={id:'motion',side:'L',t0:nowM()-12,by:'Rowan'};render();act('open-feed');render()}")
    check("ordinary full-screen forms remain still", page.evaluate(moving + '.length') == 0)
    stop = page.locator('[data-sheet] [data-act=stop]')
    stop.click()
    check("a new Stop question has one brief container entrance", page.evaluate(moving + ".length===1 && " + moving + "[0].effect.getTiming().duration===180"))
    page.evaluate('render()')
    check("redrawing the same Stop question settles without replay", page.evaluate(moving + '.length') == 0)
    page.locator('.confirm [data-act=stop-keep]').evaluate('e=>e.click()')
    stop.click()
    check("a quick reopen starts only one entrance", page.locator('.confirm').count() == 1 and page.evaluate(moving + '.length') == 1)
    page.locator('.confirm [data-act=stop-keep]').evaluate('e=>e.click()')
    check("Keep closes the question during its entrance without waiting", page.locator('.confirm').count() == 0 and page.evaluate('S.run.id') == 'motion')
    stop.focus()
    stop.press('Enter')
    check("a keyboard-opened Stop question remains still", page.locator('.confirm').count() == 1 and page.evaluate(moving + '.length') == 0)
    page.locator('.confirm [data-act=stop-keep]').evaluate('e=>e.click()')
    page.emulate_media(reduced_motion='reduce')
    stop.click()
    check("reduced motion opens the question without movement", page.locator('.confirm').count() == 1 and page.evaluate(moving + '.length') == 0)
    page.locator('.confirm [data-act=stop-keep]').evaluate('e=>e.click()')
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate("()=>{S.run=null;S.sheet=null;render();act('open-feed');S.sheet.note='Unsaved note';S.sheet.dirty=true;render()}")
    page.locator('[data-sheet] [data-act=cancel]').click()
    check("a new discard bottom sheet has one brief entrance", page.locator('.bsheet').count() == 1 and page.evaluate(moving + '.length') == 1)
    page.evaluate('render()')
    check("redrawing the same bottom sheet does not replay its entrance", page.evaluate(moving + '.length') == 0)
    page.locator('.bsheet [data-act=keep]').evaluate('e=>e.click()')
    check("Keep editing removes the bottom sheet at once", page.locator('.bsheet').count() == 0 and page.locator('.formscreen').count() == 1)
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            for audit in (small_overlay_motion, stop_confirm, settings_chips, pump_presets, edit_forms, manual_sleep_type, stop_confirm_keys, growth_empty_measure, timer_unit_form, pager_dot_color, typed_time_focus, stop_confirm_focus):
                try:
                    audit(browser, base)
                except Exception as error:  # noqa: BLE001
                    check(f"{audit.__name__} ran without error ({type(error).__name__}: {str(error).splitlines()[0][:120]})", False)
            browser.close()
    finally:
        server.shutdown()
    failed = [name for name, ok in RESULTS if not ok]
    print(f"{len(RESULTS) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
