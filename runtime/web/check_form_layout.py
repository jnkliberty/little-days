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

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright
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
  const save = sheet.querySelector('[data-act="save"]'), content = sheet.querySelector('.wrap');
  content.scrollTop = 0; const initial = save.getBoundingClientRect();
  content.scrollTop = content.scrollHeight; const s = save.getBoundingClientRect();
  const last = [...content.querySelectorAll('input.field, textarea.field')].filter(el => el.checkVisibility()).at(-1);
  if (last) last.scrollIntoView({block: 'end'});
  const top = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
  return {bad, cover: !(top && (top === save || save.contains(top))), inView: s.top >= 0 && s.bottom <= innerHeight && s.left >= 0 && s.right <= vw, enabled: !save.disabled,
    pinned: Math.abs(initial.top - s.top) < 1, fieldClear: !last || last.getBoundingClientRect().bottom <= sheet.querySelector('.sh-foot').getBoundingClientRect().top};
}"""

FOCUSED_NOTE = """() => {
  const e=document.querySelector('[data-fid="eventNote"]'), sheet=e.closest('[data-sheet]');
  const field=e.getBoundingClientRect(), save=sheet.querySelector('[data-act="save"]').getBoundingClientRect();
  const content=sheet.querySelector('.wrap'), contentTop=content.getBoundingClientRect().top;
  const footerTop=sheet.querySelector('.sh-foot').getBoundingClientRect().top;
  return {focused:e===document.activeElement, fieldTop:field.top, fieldBottom:field.bottom,
    contentTop, footerTop, saveBottom:save.bottom, viewport:innerHeight, scrollTop:content.scrollTop,
    clear:e===document.activeElement && field.top>=contentTop && field.bottom<=footerTop && save.bottom<=innerHeight};
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
                                    check(f'{name}: Save stays pinned and visible, fields scroll clear, Save is enabled', m['pinned'] and m['fieldClear'] and m['inView'] and not m['cover'] and m['enabled'])
                                    if details is False:
                                        page.locator('[data-sheet] [data-act="save"]').click()
                                        page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
                                        check(f'{name}: Save posts at once ({len(page.writes)} writes)', len(page.writes) == 1)
                                    page.context.close()
                                except Exception as error:
                                    check(f'{name} completed ({type(error).__name__}: {str(error)[:90]})', False)
                for lang in ('en', 'es'):
                    page = open_app(Touchy(browser, **phone), base, 320, 480, AT, lang=lang)
                    form(page, 'breast', True)
                    fill(page, 'breast')
                    note = page.locator('[data-fid="eventNote"]')
                    note.focus()
                    # WebKit scrolls a focused field into view after focus() returns.
                    try:
                        page.wait_for_function(f'() => ({FOCUSED_NOTE})().clear', timeout=4000)
                    except PlaywrightTimeoutError:
                        pass
                    focused = page.evaluate(FOCUSED_NOTE)
                    check(f'{lang} 320x480 focused Note: Save stays visible and the field clears its bar ({focused})', focused['clear'])
                    page.evaluate("() => {S.sheet=null;render();act('open-med');render()}")
                    check(f'{lang} 320x480: the disabled Save hint is left aligned and visible', page.locator('.sh-foot [data-save-hint]').evaluate("e=>!e.hidden && getComputedStyle(e).textAlign === 'left' && e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().bottom <= innerHeight"))
                    page.context.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
