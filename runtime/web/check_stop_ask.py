"""Owner 2026-11-11: the app asked "Stop this sleep?" over a form the person had just opened, and a Stop question left behind made the page inert.
Synthetic Chrome checks with a phone-sized screen. Invented data only; mocked APIs.
Failure cases:
  B1-B4. A Stop question stays after a form opens, a form closes, the tab changes or the timer ends elsewhere; the page is inert or the form is
         inert with no question on screen.
  D.     With a sleep running, a timed breast feed cannot be stopped (the question or its Stop button is missing or covered) or posts nothing.
"""
import shutil

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server
from check_stop_bar import AT, RUN, Touchy, tap

FAILS = []
PROBE = """() => { const c = document.querySelector('.confirm'); let reach = false;
  if (c) { const b = c.querySelector('[data-act="stop-go"]').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); reach = !!e && c.contains(e); }
  const sheetInert = !!document.querySelector('[data-sheet][inert]'), mainInert = !!document.querySelector('.main[inert]');
  return {asked: !!S.confirmStop, confirm: !!c, reach, sheet: S.sheet && S.sheet.kind, sheetInert, mainInert, invisibleInert: (sheetInert || (mainInert && !S.sheet)) && !c}; }"""


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def page_with(browser, base, sleep=True, feed=False):
    page = open_app(Touchy(browser, has_touch=True, is_mobile=True), base, 390, 844, AT, lang='en')
    page.set_default_timeout(5000)
    page.st['sleepRun'] = RUN['sleep'] if sleep else None
    page.st['run'] = RUN['feed'] if feed else None
    page.reload()
    page.locator('.tile[data-act="open-sleep"]').wait_for()
    return page


def watch_stops(page):
    stops = []
    page.route("**/api/timers/**/stop", lambda route: (stops.append(route.request.url), route.fallback()))
    return stops


def clean(p):
    return not p['asked'] and not p['confirm'] and not p['invisibleInert']


def flow_stale_question(browser, base):
    for label, js in (('a form opens', "act('open-feed')"), ('the tab changes', "act('tab','log')"), ('the timer ends elsewhere', "{S.sleepRun=null;render()}"),
                      ('a form opens and closes', "{act('open-feed');act('cancel')}"), ('Settings opens', "act('open-settings')")):
        page = page_with(browser, base)
        page.evaluate("act('stop-sleep')")
        check(f'the question is on screen first ({label})', page.evaluate(PROBE)['reach'])
        page.evaluate("() => " + (js if js.startswith('{') else js))
        page.wait_for_timeout(150)
        p = page.evaluate(PROBE)
        check(f'{label}: the old Stop question is gone, nothing is inert without one ({p})', clean(p) and (p['sheet'] is None or not p['sheetInert']))
        page.context.close()


def flow_question_in_sheet(browser, base):
    """The question asked from inside a sheet goes when that sheet closes."""
    page = page_with(browser, base)
    page.locator('.tile[data-act="open-sleep"]').click()
    page.locator('[data-sheet] [data-act="stop-sleep"]').first.click()
    check('asked from the sleep sheet: the question shows over the sheet', page.evaluate(PROBE)['reach'])
    page.evaluate("() => { S.sheet = null; render(); }")
    p = page.evaluate(PROBE)
    check(f'the sheet closes: the question goes with it ({p})', clean(p))
    page.context.close()


def flow_question_still_works(browser, base):
    """Regression guard: the question on the Home bar still opens, Keep sleeping closes it, Stop sleep stops."""
    page = page_with(browser, base)
    stops = watch_stops(page)
    tap(page, page.locator('.dock [data-act="stop-sleep"]'))
    check('a tap on the Home Stop bar opens the question', page.evaluate(PROBE)['reach'])
    tap(page, page.locator('.confirm [data-act="stop-keep"]'))
    check('Keep sleeping closes it and the sleep runs on', clean(page.evaluate(PROBE)) and page.evaluate('!!S.sleepRun'))
    tap(page, page.locator('.dock [data-act="stop-sleep"]'))
    tap(page, page.locator('.confirm [data-act="stop-go"]'))
    page.wait_for_timeout(300)
    check(f'Stop sleep sends the stop request once ({len(stops)})', len(stops) == 1)
    page.context.close()


def flow_timed_breast_stop(browser, base):
    """D: a sleep and a breast feed both run. The feed's Stop opens its question, the question's Stop posts the feed, the sleep runs on."""
    page = page_with(browser, base, sleep=True, feed=True)
    stops = watch_stops(page)
    page.locator('.tile[data-act="open-feed"]').click()
    stop = page.locator('[data-sheet] [data-act="stop"]').first
    stop.scroll_into_view_if_needed()
    box = stop.bounding_box()
    top = page.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('[data-act]')?.dataset.act }", [box['x'] + box['width'] / 2, box['y'] + box['height'] / 2])
    check(f'with a sleep running, the timed feed Stop button is not covered ({top})', top == 'stop')
    tap(page, stop)
    p = page.evaluate(PROBE)
    check(f'its question shows and reads Stop this feed ({p})', p['reach'] and 'feed' in page.evaluate('S.confirmStop'))
    tap(page, page.locator('.confirm [data-act="stop-go"]'))
    page.wait_for_timeout(500)
    check(f'the feed stop is sent once ({[u.rsplit("/", 2)[-2:] for u in stops]}) and the sleep still runs', len(stops) == 1 and page.evaluate('!!S.sleepRun'))
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for flow in (flow_stale_question, flow_question_in_sheet, flow_question_still_works, flow_timed_breast_stop):
                    try:
                        flow(browser, base)
                    except Exception as error:  # a timeout is a failed check, not a crash
                        check(f'{flow.__name__} completed ({type(error).__name__}: {str(error)[:100]})', False)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
