"""Owner 2026-11-11: "if we do any actions in the settings or stuff like adding photos or anything else, it'll make it ask us to stop the nap".
Synthetic Chrome checks, phone-sized screen with touch, sleep running (and a feed running). Invented data only; mocked APIs.

Proven trigger: a form's Save button (390 x 844: y 732 to 788) sits over the top 16 px of the Home pinned Stop bar (y 772 to 828).
After the form closes, a second tap at the same place lands on Stop and opens "Stop this sleep?".
Failure cases covered:
  1. A second tap on a closed form's Save opens the Stop question.
  2. The pinned bar shows on Timeline, Charts, Photos or behind a form, where a tap can reach it.
  3. The bar stops working on Home, or ignores a real tap after the 400 ms guard.
"""
import io
import shutil
from datetime import datetime

from PIL import Image
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T12:00:00-06:00')
FAILS = []
RUN = {'sleep': {'id': 's1', 't0': 700, 'startedAt': '2026-11-10T11:30:00-06:00', 'by': 'Rowan', 'nap': True},
       'feed': {'id': 'r1', 'side': 'L', 't0': 700, 'startedAt': '2026-11-10T11:30:00-06:00', 'by': 'Rowan'}}


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def png():
    out = io.BytesIO()
    Image.effect_noise((300, 300), 60).convert('RGB').save(out, 'PNG')
    return out.getvalue()


class Touchy:
    def __init__(self, browser, **kw):
        self.browser, self.kw = browser, kw

    def new_context(self, **k):
        return self.browser.new_context(**k, **self.kw)


def open_running(browser, base, kind, width=390, height=844):
    page = open_app(Touchy(browser, has_touch=True, is_mobile=True), base, width, height, AT, lang='en')
    page.set_default_timeout(5000)
    page.st['sleepRun'] = RUN['sleep'] if kind == 'sleep' else None
    page.st['run'] = RUN['feed'] if kind == 'feed' else None
    page.reload()
    page.locator('.tile[data-act="open-sleep"]').wait_for()
    return page


def tap(page, locator):
    locator.scroll_into_view_if_needed()
    box = locator.bounding_box()
    point = (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.touchscreen.tap(*point)
    page.wait_for_timeout(200)
    return point


def confirm_open(page):
    return page.locator('.confirm').count() > 0


def running(page, kind):
    return page.evaluate('!!S.sleepRun' if kind == 'sleep' else '!!S.run')


def pick(page, loc):
    with page.expect_file_chooser() as chooser:
        tap(page, loc)
    chooser.value.set_files({'name': 'p.png', 'mimeType': 'image/png', 'buffer': png()})
    page.wait_for_timeout(700)


def flows_a_to_d(page, kind):
    seen = []

    def step(label):
        seen.append((label, confirm_open(page)))
        if confirm_open(page):
            page.evaluate("act('stop-keep')")

    tap(page, page.locator('[data-act="open-settings"]')); step('settings row')
    pick(page, page.locator('.portrait-upload')); step('add portrait')
    if page.locator('[data-act="portrait-save"]').count():
        tap(page, page.locator('[data-act="portrait-save"]')); step('portrait save')
    for selector in ('[data-setting="lang"][data-value="es"]', '[data-setting="lang"][data-value="en"]'):
        if page.locator(selector).count():
            tap(page, page.locator(selector).first); step('language')
    tap(page, page.locator('[data-sheet] [data-act="cancel"]')); step('settings cancel')
    tap(page, page.locator('[data-act="tab"][data-arg="photos"]').first); step('photos row')
    tap(page, page.locator('[data-act="open-photo"]').first); step('add photo')
    pick(page, page.locator('[data-sheet] [data-act="pick-photo"]')); step('pick photo')
    tap(page, page.locator('[data-sheet] [data-act="save"]')); step('photo save')
    page.wait_for_timeout(500)
    page.evaluate("S.tab='home';render()")
    tap(page, page.locator('[data-act="open-more"]')); step('log something else')
    tap(page, page.locator('[data-sheet] [data-act="open-note"]')); step('note row')
    pick(page, page.locator('[data-sheet] [data-act="pick-photo"]')); step('note photo')
    tap(page, page.locator('[data-sheet] [data-act="save"]')); step('note save')
    page.wait_for_timeout(500)
    return seen


def flow_taps(browser, base, kind):
    page = open_running(browser, base, kind)
    seen = flows_a_to_d(page, kind)
    check(f'{kind} running: settings, portrait, photo, note and language taps never open the Stop question ({len(seen)} steps)', not any(c for _, c in seen) and running(page, kind))
    page.context.close()


def flow_second_tap(browser, base, kind):
    """Failure case 1: tap Save at its lower edge, the form closes, a second tap at the same point hits the Stop bar under it."""
    for width, height in ((390, 844), (320, 568)):
        page = open_running(browser, base, kind, width, height)
        tap(page, page.locator('[data-act="open-more"]'))
        tap(page, page.locator('[data-sheet] [data-act="open-note"]'))
        pick(page, page.locator('[data-sheet] [data-act="pick-photo"]'))
        save = page.locator('[data-sheet] [data-act="save"]')
        save.scroll_into_view_if_needed()
        box = save.bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] - 6
        page.touchscreen.tap(x, y)
        page.wait_for_timeout(120)
        page.touchscreen.tap(x, y)
        page.wait_for_timeout(300)
        check(f'{kind} running, {width} x {height}: a second tap on the closed form\'s Save opens no Stop question and the timer keeps running', not confirm_open(page) and page.locator('[data-sheet]').count() == 0 and running(page, kind))
        page.context.close()


def flow_bar_places(browser, base, kind):
    """Failure case 2: the pinned bar exists only on Home with no form open."""
    page = open_running(browser, base, kind)
    bar = "document.querySelectorAll('.main > .dock, .dock:not(.in-sheet)').length"
    check(f'{kind} running: the bar shows on Home', page.evaluate(bar) == 1)
    for tab in ('log', 'charts', 'photos'):
        page.evaluate(f"S.tab='{tab}';render()")
        check(f'{kind} running: no pinned bar on {tab}', page.evaluate(bar) == 0)
    page.evaluate("S.tab='home';render()")
    for label, js in (('settings', "{kind:'settings'}"), ('Log something else', "{kind:'more'}"), ('note', "{kind:'note'}"), ('photo', "{kind:'note',photoOnly:true}"), ('sleep', "{kind:'sleep'}")):
        page.evaluate(f"S.sheet={js};render()")
        check(f'{kind} running: no pinned bar behind the {label} form', page.evaluate(bar) == 0)
        page.evaluate("S.sheet=null;render()")
    page.context.close()


def flow_home_bar(browser, base, kind):
    """Failure case 3: on Home the bar still asks and stops; a tap just after a form closes is ignored; a tap after 400 ms works."""
    page = open_running(browser, base, kind)
    button = page.locator('.dock .feed-stop, .dock .sleep-stop')
    tap(page, button)
    check(f'{kind} running: the Home bar asks the Stop question', confirm_open(page) and running(page, kind))
    tap(page, page.locator('[data-act="stop-keep"]'))
    check(f'{kind} running: Keep leaves the timer running', not confirm_open(page) and running(page, kind))
    tap(page, page.locator('[data-act="open-more"]'))
    tap(page, page.locator('[data-sheet] [data-act="cancel"]'))
    tap(page, button)
    check(f'{kind} running: a bar tap right after a form closes is ignored', not confirm_open(page))
    page.wait_for_timeout(500)
    tap(page, button)
    check(f'{kind} running: a bar tap after the guard asks the question', confirm_open(page))
    page.context.close()


def flow_safe_bar_buttons(browser, base):
    """The 400 ms guard holds Stop only. Failure case: Resume sleep or Finish bottle ignored right after a form closes."""
    page = open_app(Touchy(browser, has_touch=True, is_mobile=True), base, 390, 844, AT, lang='en')
    page.set_default_timeout(5000)
    page.st['sleepRun'] = None
    page.st['run'] = {**RUN['feed'], 'side': 'bottle'}
    page.reload()
    page.locator('.tile[data-act="open-sleep"]').wait_for()
    tap(page, page.locator('[data-act="open-more"]'))
    tap(page, page.locator('[data-sheet] [data-act="cancel"]'))
    page.locator('.dock [data-act="open-feed"]').click()
    page.wait_for_timeout(100)
    check('Finish bottle acts right after a form closes (the Feed form opens)', page.evaluate('S.sheet?.kind') == 'feed')
    page.context.close()
    page = open_app(Touchy(browser, has_touch=True, is_mobile=True), base, 390, 844, AT, lang='en')
    page.set_default_timeout(5000)
    seen = []
    page.on('request', lambda r: seen.append(r.url) if '/timers/sleep/resume' in r.url else None)
    page.evaluate("() => { S.sleepRun = null; S.run = null; S.sleepPaused = {id: 'p1', t0: 700, startedAt: '2026-11-10T11:30:00-06:00', by: 'Rowan', nap: true}; render(); }")
    page.locator('.resume-bar').wait_for()
    page.evaluate("act('open-more')")
    page.evaluate("act('cancel')")
    page.locator('.resume-bar').click()
    page.wait_for_timeout(300)
    check(f'Resume sleep acts right after a form closes ({len(seen)} request)', len(seen) == 1)
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                try:
                    flow_safe_bar_buttons(browser, base)
                except Exception as error:
                    check(f'flow_safe_bar_buttons completed ({type(error).__name__}: {str(error)[:100]})', False)
                for kind in ('sleep', 'feed'):
                    for flow in (flow_taps, flow_second_tap, flow_bar_places, flow_home_bar):
                        try:
                            flow(browser, base, kind)
                        except Exception as error:  # a timeout is a failed check, not a crash
                            check(f'{kind}: {flow.__name__} completed ({type(error).__name__}: {str(error)[:80]})', False)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
