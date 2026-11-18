"""Owner 2026-11-11 (iPhone screenshot): Bottle form, More details open, "Started 4:45 PM", "Ended 4:55 PM", "Length: 10 min", and the error
"The end time must be now or earlier." Save was refused.

Proven cause: the Minutes typed on the Breast manual tab (10) stayed as the form's length when the person changed to Bottle or Pump, so the
Bottle range became Start + 10 min, which is later than now. A Bottle or Pump has an End at its Start. The same Minutes also showed in the Breast
Minutes box after a Bottle tab. Every check here runs with the clock fixed at 4:47 PM, so "now" is the Start the form opens with.
Failure cases: Save refused or an error shown after a tab change; a length that leaks between tabs; a typed future End that no longer errors.
"""
import shutil
from datetime import datetime

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T16:47:00-06:00')
FAILS = []


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def open_feed(browser, base, width=390, height=844):
    page = open_app(browser, base, width, height, AT, lang='en')
    page.set_default_timeout(4000)
    page.locator('.tile[data-act="open-feed"]').click()
    return page


def state(page):
    return page.evaluate("""() => { const g = id => document.querySelector(`[data-fid="${id}"]`)?.value; const e = [...document.querySelectorAll('[data-sheet] [data-range-err]:not([hidden])')].map(x => x.textContent.trim());
        const save = document.querySelector('[data-sheet] [data-act=save]');
        return {start: g('manualClock'), end: g('manualEndClock'), minutes: g('manualDuration') ?? null, errors: e, hint: document.querySelector('[data-save-hint]')?.textContent.trim() || '', save: save ? !save.disabled : null,
                len: document.querySelector('[data-range-len]:not([hidden])')?.textContent.trim() || ''}; }""")


def set_details(page, opened):
    """The test page opens More details by itself; the first-open case with it closed is made here."""
    page.evaluate("o => { const d = document.querySelector('[data-sheet] details[data-more-details]'); d.open = o; S.sheet.detailsOpen = o; }", opened)


def fill_bottle(page):
    page.locator('[data-sheet] [data-act="ml-set"]').first.click()
    page.locator('[data-sheet] [data-act="milk"]').first.click()


def fill_pump(page):
    page.locator('[data-fid="pL"]').fill('60')
    page.locator('[data-fid="pR"]').fill('30')


def save_and_read(page):
    save = page.locator('[data-sheet] [data-act="save"]')
    save.scroll_into_view_if_needed()
    save.click()
    page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
    return page.writes[-1]['event'] if page.writes else None


def breast_manual_ten(page):
    page.locator('[data-act="manual"]').first.click()
    page.locator('[data-act="manualSide"][data-arg="L"]').first.click()
    page.locator('[data-fid="manualDuration"]').fill('10')


def flow_leak_to_bottle(browser, base, details):
    """Failure case: Minutes from Breast manual become the Bottle's length, and Save is refused."""
    page = open_feed(browser, base)
    breast_manual_ten(page)
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    set_details(page, details)
    fill_bottle(page)
    s = state(page)
    check(f'Breast manual 10 min, then Bottle (More details {"open" if details else "closed"}): End is the Start, no length, no error ({s})',
          s['start'] == s['end'] == '4:47' and page.evaluate("S.sheet.period === 'PM' && S.sheet.endPeriod === 'PM'") and not s['errors'] and s['len'] == '' and 'now or earlier' not in s['hint'] and s['save'] is True)
    event = save_and_read(page)
    check(f'... and Save posts the bottle at once with a length of 0 ({event and (event.get("type"), event.get("duration"))})', bool(event) and event.get('type') == 'bottle' and not event.get('duration') and str(event.get('start')).startswith('2026-11-10T22:47'))
    page.context.close()


def flow_leak_to_pump(browser, base):
    page = open_feed(browser, base)
    breast_manual_ten(page)
    page.locator('[data-act="ftab"][data-arg="pump"]').click()
    fill_pump(page)
    s = state(page)
    check(f'Breast manual 10 min, then Pump: no error, Save enabled ({s})', not s['errors'] and 'now or earlier' not in s['hint'] and s['save'] is True and s['len'] == '')
    event = save_and_read(page)
    check(f'... and Save posts the pump at once ({event and (event.get("type"), event.get("duration"))})', bool(event) and event.get('type') == 'pump' and not event.get('duration'))
    page.context.close()


def flow_leak_back_to_breast(browser, base):
    """The other direction: a Bottle's length must not appear in the Breast Minutes box."""
    page = open_feed(browser, base)
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    page.locator('[data-fid="manualClock"]').fill('4:40 PM')
    page.locator('[data-fid="manualClock"]').blur()
    page.locator('[data-fid="manualEndClock"]').fill('4:45 PM')
    page.locator('[data-fid="manualEndClock"]').blur()
    page.locator('[data-act="ftab"][data-arg="breast"]').click()
    page.locator('[data-act="manual"]').first.click()
    s = state(page)
    check(f'Bottle 4:40 to 4:45, then Breast manual: the Minutes box starts empty ({s["minutes"]!r})', s['minutes'] in ('', None))
    page.context.close()


def flow_plain(browser, base):
    """Opened and saved at once, now equal to the Start default: no error, posts. (Regression guard; these passed before the fix.)"""
    for details in (False, True):
        page = open_feed(browser, base)
        page.locator('[data-act="ftab"][data-arg="bottle"]').click()
        set_details(page, details)
        fill_bottle(page)
        s = state(page)
        event = save_and_read(page)
        check(f'Bottle opened and saved at once (More details {"open" if details else "closed"}): no error, posts ({s["errors"]}, {event and event.get("type")})', not s['errors'] and bool(event) and event.get('type') == 'bottle')
        page.context.close()
    page = open_feed(browser, base)
    page.locator('[data-act="ftab"][data-arg="pump"]').click()
    fill_pump(page)
    event = save_and_read(page)
    check('Pump opened and saved at once posts', bool(event) and event.get('type') == 'pump')
    page.context.close()
    page = open_feed(browser, base)
    page.locator('[data-act="manual"]').first.click()
    page.locator('[data-act="manualSide"][data-arg="L"]').first.click()
    page.locator('[data-fid="manualDuration"]').fill('10')
    s = state(page)
    event = save_and_read(page)
    check(f'Breast manual, 10 minutes, Start untouched: posts a 10 minute feed ending now ({s["errors"]}, {event and (event.get("type"), event.get("duration"))})', not s['errors'] and bool(event) and event.get('duration') == 10)
    page.context.close()


def flow_sleep_typed(browser, base):
    """Sleep with typed times, opened at the Start default: saves at once, no error."""
    page = open_app(browser, base, 390, 844, AT, lang='en')
    page.set_default_timeout(4000)
    page.locator('.tile[data-act="open-sleep"]').click()
    page.locator('[data-sheet] [data-act="manual"]').click()
    for fid, text in (('manualClock', '4:30 PM'), ('manualEndClock', '4:45 PM')):
        page.locator(f'[data-fid="{fid}"]').fill(text)
        page.locator(f'[data-fid="{fid}"]').blur()
    s = state(page)
    event = save_and_read(page)
    check(f'Sleep 4:30 to 4:45 typed: no error, posts a 15 minute sleep ({s["errors"]}, {event and (event.get("type"), event.get("duration"))})', not s['errors'] and bool(event) and event.get('type') == 'sleep' and event.get('duration') == 15)
    page.context.close()


def flow_typed_future_end(browser, base):
    """A typed End later than now keeps its error and blocks Save."""
    page = open_feed(browser, base)
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    fill_bottle(page)
    page.locator('[data-fid="manualEndClock"]').fill('4:55 PM')
    page.locator('[data-fid="manualEndClock"]').blur()
    s = state(page)
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_timeout(300)
    check(f'A typed End of 4:55 PM (now is 4:47 PM) keeps the error and posts nothing ({s["errors"]}, {len(page.writes)} writes)', bool(s['errors']) and not page.writes)
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for name, flow in (('leak to bottle (details closed)', lambda: flow_leak_to_bottle(browser, base, False)), ('leak to bottle (details open)', lambda: flow_leak_to_bottle(browser, base, True)),
                                   ('leak to pump', lambda: flow_leak_to_pump(browser, base)), ('leak back to breast', lambda: flow_leak_back_to_breast(browser, base)),
                                   ('plain', lambda: flow_plain(browser, base)), ('sleep typed', lambda: flow_sleep_typed(browser, base)), ('typed future end', lambda: flow_typed_future_end(browser, base))):
                    try:
                        flow()
                    except Exception as error:  # a timeout is a failed check, not a crash
                        check(f'{name} completed ({type(error).__name__}: {str(error)[:100]})', False)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
