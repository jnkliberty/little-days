"""Owner 2026-11-11 (iPhone): "the day box looks weird... honestly all the boxes are too long", and a Save that "wont let me click".
WebKit with the iPhone 13 profile at 390 and 320 px, for the Feed form (Breast manual, Bottle, Pump) with More details open and closed,
with and without a sleep running. Failure cases:
  1. a field (the Day date box included) is wider than its card or sticks out of the screen;
  2. a field's text is not left-aligned or its font is below 16 px (iOS zooms the page on focus under 16 px);
  3. Save is outside the screen after scrolling it into view, or another element covers its center (a tap would hit that element);
  4. with a sleep running, Save on Bottle (amount), Breast manual (Minutes) and Pump is not enabled and does not post.
iOS-native date boxes cannot be drawn here: the CSS (appearance none, 100% width, left alignment) is checked as computed style.
"""
from datetime import datetime

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server
from check_stop_bar import Touchy

AT = datetime.fromisoformat('2026-11-10T16:47:00-06:00')
SLEEP = {'id': 's1', 't0': 700, 'startedAt': '2026-11-10T15:30:00-06:00', 'by': 'Rowan', 'nap': True}
FAILS = []

MEASURE = """() => {
  const sheet = document.querySelector('[data-sheet]'); const card = sheet.getBoundingClientRect(); const vw = innerWidth; const bad = [];
  for (const el of sheet.querySelectorAll('input.field, textarea.field')) {
    const r = el.getBoundingClientRect(); if (!r.width) continue; const cs = getComputedStyle(el); const host = el.closest('.form-field, .range-end') || sheet; const h = host.getBoundingClientRect();
    if (r.left < h.left - 0.5 || r.right > h.right + 0.5 || r.right > vw + 0.5 || r.left < -0.5) bad.push([el.dataset.fid || el.id, 'outside', Math.round(r.left), Math.round(r.right), Math.round(h.left), Math.round(h.right)]);
    if (cs.textAlign !== 'left' && cs.textAlign !== 'start') bad.push([el.dataset.fid || el.id, 'align', cs.textAlign]);
    if (parseFloat(cs.fontSize) < 16) bad.push([el.dataset.fid || el.id, 'font', cs.fontSize]);
  }
  const save = sheet.querySelector('[data-act="save"]'); save.scrollIntoView({block: 'center'}); const s = save.getBoundingClientRect();
  const top = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
  return {bad, cover: !(top && (top === save || save.contains(top))), inView: s.top >= 0 && s.bottom <= innerHeight && s.left >= 0 && s.right <= vw, enabled: !save.disabled};
}"""


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def form(page, tab, details):
    page.locator('.tile[data-act="open-feed"]').click()
    if tab != 'breast':
        page.locator(f'[data-act="ftab"][data-arg="{tab}"]').click()
    else:
        page.locator('[data-sheet] [data-act="manual"]').click()
    page.evaluate("o => { const d = document.querySelector('[data-sheet] details[data-more-details]'); d.open = o; S.sheet.detailsOpen = o; }", details)


def fill(page, tab):
    if tab == 'breast':
        page.locator('[data-act="manualSide"][data-arg="L"]').first.click()
        page.locator('[data-fid="manualDuration"]').fill('10')
    elif tab == 'bottle':
        page.locator('[data-sheet] [data-act="ml-set"]').first.click()
        page.locator('[data-sheet] [data-act="milk"]').first.click()
    else:
        page.locator('[data-fid="pL"]').fill('60')


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, "webkit")
            d = pw.devices['iPhone 13']
            phone = {k: d[k] for k in ('user_agent', 'device_scale_factor', 'has_touch', 'is_mobile')}
            try:
                for width in (390, 320):
                    for sleeping in (False, True):
                        for tab in ('breast', 'bottle', 'pump'):
                            for details in (False, True):
                                name = f'{width}px {tab} details {"open" if details else "closed"} {"sleep running" if sleeping else "no sleep"}'
                                try:
                                    page = open_app(Touchy(browser, **phone), base, width, 844, AT, lang='en')
                                    page.set_default_timeout(4000)
                                    if sleeping:
                                        page.st['sleepRun'] = SLEEP
                                        page.reload()
                                        page.locator('.tile[data-act="open-sleep"]').wait_for()
                                    form(page, tab, details)
                                    fill(page, tab)
                                    m = page.evaluate(MEASURE)
                                    check(f'{name}: fields inside the card, left-aligned, 16 px ({m["bad"]})', not m['bad'])
                                    check(f'{name}: Save on screen, not covered, enabled', m['inView'] and not m['cover'] and m['enabled'])
                                    if details is False:
                                        page.locator('[data-sheet] [data-act="save"]').click()
                                        page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
                                        check(f'{name}: Save posts at once ({len(page.writes)} writes)', len(page.writes) == 1)
                                    page.context.close()
                                except Exception as error:
                                    check(f'{name} completed ({type(error).__name__}: {str(error)[:90]})', False)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
