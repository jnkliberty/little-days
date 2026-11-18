"""Owner 2026-11-11 (incident): Minutes typed on Breast manual showed up as the length of a Bottle. One form's typed values must not leak into another kind.
After each switch the fields show the same values as a form opened fresh, and Save posts only what the screen shows.
Failure cases: Breast manual to Bottle to Pump and back; Sleep typed times to a new Sleep form; an edit form to a new form; a post that carries a value the screen does not show.
"""
import shutil
from datetime import datetime

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T16:47:00-06:00')
FAILS = []
SNAP = """() => ({fields: [...document.querySelectorAll('[data-sheet] input, [data-sheet] textarea')].filter(e => e.type !== 'file').map(e => (e.dataset.fid || e.id) + '=' + e.value),
  pressed: [...document.querySelectorAll('[data-sheet] [aria-pressed="true"]')].filter(e => e.dataset.act !== 'ftab').map(e => e.dataset.act + ':' + e.dataset.arg),
  len: document.querySelector('[data-range-len]:not([hidden])')?.textContent.trim() || '', errors: [...document.querySelectorAll('[data-sheet] [data-range-err]:not([hidden])')].length})"""


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def fresh(browser, base):
    page = open_app(browser, base, 390, 844, AT, lang='en')
    page.set_default_timeout(4000)
    return page


def snap(page):
    return page.evaluate(SNAP)


def tab(page, name):
    page.locator(f'[data-sheet] [data-act="ftab"][data-arg="{name}"]').click()


def manual_on(page):
    if not page.locator('[data-fid="manualDuration"]').count():
        page.locator('[data-sheet] [data-act="manual"]').click()


def baselines(browser, base):
    page = fresh(browser, base)
    out = {}
    page.locator('.tile[data-act="open-feed"]').click()
    for name in ('bottle', 'pump', 'breast'):
        tab(page, name)
        if name == 'breast':
            manual_on(page)
        out[name] = snap(page)
    page.context.close()
    return out


def flow_feed_tabs(browser, base, want):
    page = fresh(browser, base)
    page.locator('.tile[data-act="open-feed"]').click()
    manual_on(page)
    page.locator('[data-act="manualSide"][data-arg="L"]').first.click()
    page.locator('[data-fid="manualDuration"]').fill('10')
    tab(page, 'bottle')
    page.locator('[data-sheet] [data-act="ml-set"]').first.click()
    page.locator('[data-sheet] [data-act="milk"]').first.click()
    tab(page, 'pump')
    page.locator('[data-fid="pL"]').fill('55')
    tab(page, 'bottle')
    s = snap(page)
    check(f'Bottle after Breast manual and Pump: only the Bottle fields the person set show (amount and milk), nothing else ({s["fields"]}, {s["len"]!r})',
          s['len'] == '' and s['errors'] == 0 and all(f.split('=')[1] == '' or f.split('=')[0] in ('ml', 'manualDate', 'manualClock', 'manualEndClock', 'manualDuration') for f in s['fields']))
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
    e = page.writes[-1]['event']
    check(f'the Bottle posts what its screen shows: {e.get("ml")} ml, no side, no pump amounts, no length, start now ({sorted(e)})',
          e.get('type') == 'bottle' and 'side' not in e and 'leftMl' not in e and not e.get('duration') and str(e.get('start')).startswith('2026-11-10T22:47'))
    page.locator('.tile[data-act="open-feed"]').click()
    for name in ('bottle', 'pump'):
        tab(page, name)
        s = snap(page)
        # By design a new Bottle opens with the last bottle's milk (the amount default is already 60 ml); nothing else carries over.
        keep = ['milk:formula'] if name == 'bottle' else []
        check(f'a new Feed form, {name} tab: shows the defaults of a fresh form ({s["fields"]}, {s["pressed"]})', s['fields'] == want[name]['fields'] and sorted(s['pressed']) == sorted(want[name]['pressed'] + keep) and not s['len'])
    tab(page, 'breast')
    manual_on(page)
    s = snap(page)
    check(f'a new Feed form, Breast manual: no side, no Minutes ({s["fields"]}, {s["pressed"]})', s == want['breast'])
    page.context.close()


def flow_pump_post(browser, base):
    page = fresh(browser, base)
    page.locator('.tile[data-act="open-feed"]').click()
    manual_on(page)
    page.locator('[data-act="manualSide"][data-arg="R"]').first.click()
    page.locator('[data-fid="manualDuration"]').fill('12')
    tab(page, 'bottle')
    page.locator('[data-sheet] [data-act="ml-set"]').first.click()
    page.locator('[data-sheet] [data-act="milk"]').first.click()
    tab(page, 'pump')
    page.locator('[data-fid="pL"]').fill('40')
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
    e = page.writes[-1]['event']
    check(f'the Pump posts what its screen shows: left 40, no bottle amount, no side, no length ({sorted(e)})',
          e.get('type') == 'pump' and 'ml' not in e and 'side' not in e and not e.get('duration') and e.get('leftMl') == 40)
    page.context.close()


def flow_sleep(browser, base):
    page = fresh(browser, base)
    page.locator('.tile[data-act="open-sleep"]').click()
    page.locator('[data-sheet] [data-act="manual"]').click()
    want = snap(page)
    for fid, text in (('manualClock', '4:00 PM'), ('manualEndClock', '4:30 PM')):
        page.locator(f'[data-fid="{fid}"]').fill(text)
        page.locator(f'[data-fid="{fid}"]').blur()
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
    page.locator('.tile[data-act="open-sleep"]').click()
    page.locator('[data-sheet] [data-act="manual"]').click()
    s = snap(page)
    check(f'a new Sleep form after typed times: the fields are the defaults ({s["fields"]})', s == want)
    page.context.close()


def flow_edit_then_new(browser, base):
    page = fresh(browser, base)
    page.locator('.tile[data-act="open-feed"]').click()
    tab(page, 'bottle')
    want = snap(page)
    page.locator('[data-sheet] [data-act="cancel"]').click()
    entry = page.evaluate("S.entries.find(e => e.type === 'bottle' || e.type === 'feed')?.id")
    check(f'the edit check has a record to open ({entry})', bool(entry))
    page.evaluate("id => act('edit', id)", entry)
    page.wait_for_selector('[data-sheet]')
    page.locator('[data-sheet] input.field').first.fill('1') if page.locator('[data-sheet] input.field').count() else None
    page.evaluate("act('cancel')")
    if page.locator('[data-sheet] [data-act="discard"]').count():
        page.locator('[data-sheet] [data-act="discard"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
    page.locator('.tile[data-act="open-feed"]').click()
    tab(page, 'bottle')
    s = snap(page)
    check(f'a new Bottle form after an edit form: the fields are the defaults ({s["fields"]})', s == want)
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                want = baselines(browser, base)
                for name, flow in (('feed tabs', lambda: flow_feed_tabs(browser, base, want)), ('pump post', lambda: flow_pump_post(browser, base)), ('sleep', lambda: flow_sleep(browser, base)), ('edit then new', lambda: flow_edit_then_new(browser, base))):
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
