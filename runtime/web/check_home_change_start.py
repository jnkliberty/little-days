"""Owner 2026-11-24: a forgotten sleep or feed timer is fixed from Home by a tap on the running card's timer.
Synthetic Chrome checks, phone-sized screen with touch. Invented data only; mocked APIs.
Failure cases covered:
  1. A tap on the running card's timer does not open that timer's sheet with Change start open at the current start.
  2. The Pause sleep button opens the start picker (the tap area grew next to it).
  3. With a pump timer also running, the feed tap lands on the Pump tab, where the feed picker never shows.
  4. A screen reader loses the running time or the Change start name.
"""
from datetime import datetime

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T12:00:00-06:00')
RUN = {'sleep': {'id': 's1', 't0': 700, 'startedAt': '2026-11-10T11:40:00-06:00', 'by': 'Rowan', 'nap': True},
       'feed': {'id': 'r1', 'side': 'L', 't0': 700, 'startedAt': '2026-11-10T11:40:00-06:00', 'by': 'Rowan'}}
FAILS = []


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def open_running(browser, base, kind):
    page = open_app(browser, base, 390, 844, AT, lang='en')
    page.st['sleepRun'] = RUN['sleep'] if kind == 'sleep' else None
    page.st['run'] = RUN['feed'] if kind == 'feed' else None
    page.reload()
    page.locator('.run-card').wait_for()
    return page


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            for kind in ('sleep', 'feed'):
                page = open_running(browser, base, kind)
                edit = page.locator(f'.run-card .run-edit[data-arg="{kind}"]')
                name = edit.inner_text().replace('\xa0', ' ') if edit.count() else ''
                check(f'{kind}: the running card timer is one button whose name says Change start and the running time: {name!r}', edit.count() == 1 and edit.get_attribute('aria-label') is None and 'Change start' in name and '20 m' in name)
                edit.click()
                state = page.evaluate("({kind:S.sheet?.kind,early:S.sheet?.early,h:S.sheet?.earlyHour,m:S.sheet?.earlyMinute,p:S.sheet?.earlyPeriod})")
                check(f'{kind}: the tap opens the {kind} sheet with Change start open at 11:40 AM: {state}',
                      state['kind'] == kind and state['early'] == kind and str(state['h']) == '11' and str(state['m']).zfill(2) == '40' and state['p'] == 'AM')
                check(f'{kind}: Save start shows in the sheet', page.locator('[data-sheet]').get_by_text('Save start').count() >= 1)
                page.context.close()
            page = open_running(browser, base, 'sleep')
            page.locator('.run-card [data-act="pause-sleep"]').click()
            page.wait_for_timeout(300)
            check('sleep: Pause sleep does not open the start picker', page.evaluate("S.sheet?.early!=='sleep'"))
            page.context.close()
            page = open_running(browser, base, 'feed')
            page.evaluate("S.pumpRun={id:'p1',t0:705,startedAt:'2026-11-10T11:45:00-06:00',by:'Rowan'};render()")
            page.locator('.run-card .run-edit[data-arg="feed"]').click()
            state = page.evaluate("({tab:S.sheet?.tab,early:S.sheet?.early})")
            check(f'feed with a pump timer: the tap opens the breast tab with the feed picker and Save start: {state}',
                  state == {'tab': 'breast', 'early': 'feed'} and page.locator('[data-sheet]').get_by_text('Save start').count() >= 1)
            page.context.close()
            browser.close()
    finally:
        server.shutdown()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
