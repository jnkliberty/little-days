"""Sleep plan (plan 2026-11-21, Group 4, lines 255-268; mockup approved 2026-11-22) in Chrome, sample data, no live writes."""
import os
import re
import time

os.environ["TZ"] = "America/Mexico_City"
time.tzset()

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

CHARTS = "(async()=>{S.tab='charts';S.sheet=null;S.chartDetail=null;await loadTrendRange();render()})()"
DIAG_WORDS = re.compile(r'\b(disorder|abnormal|danger|warning|emergency|problem)\b', re.I)


def check(name, value):
    assert value, name
    print('PASS', name, flush=True)


def make_sleep_entries(days=7, naps_per_day=3):
    out = []
    for day in range(-days, 0):
        base = day * 1440
        out.append({'id': f'sn-{day}-night', 'type': 'sleep', 'nap': False, 'dur': 570, 't': base - 150, 'by': 'Sage'})
        # 3 naps starting at 8:30 AM, 11:30 AM, 2:30 PM (45 min each -> ~2h15m awake gaps, 3 gaps/day = 21 gaps in 7 days)
        for i in range(naps_per_day):
            out.append({'id': f'sn-{day}-nap-{i}', 'type': 'sleep', 'nap': True, 'dur': 45, 't': base + 510 + i * 180, 'by': 'Rowan'})
        out.append({'id': f'sn-{day}-bed', 'type': 'sleep', 'nap': False, 'dur': 600, 't': base + 1140, 'by': 'Sage'})
    return out


def setup_page(browser, base, at_iso='2026-11-22T12:00:00-06:00', age=45, lang='en', theme=None, ai=True, hide_sleep=False, entries=None, fail_state=False):
    at = datetime.fromisoformat(at_iso)
    page = open_app(browser, base, 390, 844, at, lang=lang, theme=theme, ai=ai)
    page.st['child']['birthDate'] = (at.date() - timedelta(days=age)).isoformat() if age is not None else None
    if hide_sleep:
        page.st['permissions']['resources']['sleep']['view'] = False
    today = at.date()
    all_entries = make_sleep_entries() if entries is None else entries
    state_fail = {'on': fail_state}

    def handle_state(route):
        query = parse_qs(urlparse(route.request.url).query)
        if 'from' in query and 'to' in query:
            if state_fail['on']:
                route.fulfill(status=500, json={'error': 'Failed'})
                return
            lo = (datetime.fromisoformat(query['from'][0]).date() - today).days
            hi = (datetime.fromisoformat(query['to'][0]).date() - today).days
        else:
            lo, hi = -1, 1
        filtered = [e for e in all_entries if lo <= e['t'] // 1440 < hi]
        route.fulfill(json={**page.st, 'today': today.isoformat(), 'entries': filtered})

    page.route(re.compile(r'/api/state(\?.*)?$'), handle_state)
    page.reload()
    page.locator('.tile[data-act="open-feed"], .wrap').first.wait_for()
    return page, state_fail


def open_sleep_plan(page):
    page.evaluate(CHARTS)
    page.locator('.rp-entry-card [data-act="extras-plan-open"]').wait_for()
    page.click('.rp-entry-card [data-act="extras-plan-open"]')
    page.locator('[data-kind="sleep-plan"]').wait_for()


def check_band_a_and_schedule(browser, base):
    p, _ = setup_page(browser, base, age=45, lang='en')
    p.evaluate(CHARTS)
    p.locator('.rp-entry-card').wait_for()
    check('Charts Reports card has 5 rows including Sleep plan',
          p.locator('.rp-entry-card .nav-row').count() == 5 and p.locator('.rp-entry-card [data-act="extras-plan-open"]').count() == 1)
    p.click('.rp-entry-card [data-act="extras-plan-open"]')
    p.locator('[data-kind="sleep-plan"] .rp-table').wait_for()
    text = p.locator('[data-kind="sleep-plan"]').inner_text()
    check('Band A: shows disclaimer, baby age, and Band A label',
          'Not medical advice. Ask the pediatrician.' in text and '45 days old' in text and '0 to 3 months' in text)
    check('Band A: Part 1 shows 4 neutral stat tiles and short-nap shift table',
          p.locator('[data-kind="sleep-plan"] .rp-stat').count() == 4
          and 'How a short nap shifts the day' in text
          and p.locator('[data-kind="sleep-plan"] .rp-table tbody tr').count() >= 3)
    safe = p.locator('[data-kind="sleep-plan"] details[data-sp-open="safe"]')
    check('Band A: Safe sleep card starts open first with NICHD link',
          safe.get_attribute('open') is not None and safe.locator('a[target="_blank"]').count() == 1)
    codes = p.locator('[data-kind="sleep-plan"] .sp-code').all_inner_texts()
    check(f'Band A: shows strategies A1..A5 only ({codes})', codes == ['A1', 'A2', 'A3', 'A4', 'A5'])
    check('Band A: shows 6-month gate box and zero settling methods',
          'Settling methods open at 6 months' in text and p.locator('[data-kind="sleep-plan"] .sp-settling-note').count() == 0)
    check('Band A: shows 4 weekly steps W1..W4', p.locator('[data-kind="sleep-plan"] .sp-week-item').count() == 4)
    # Expand first strategy quote and verify Read date + source link
    first_q = p.locator('[data-kind="sleep-plan"] details[data-sp-open="q:A1"]')
    check('Band A: strategy quote starts closed', first_q.get_attribute('open') is None)
    first_q.locator('summary').click()
    qtext = first_q.inner_text()
    check('Band A: expanded quote shows Read 2026-11-21 and source link',
          first_q.get_attribute('open') is not None and 'Read 2026-11-21' in qtext and first_q.locator('a[target="_blank"]').count() == 1)
    check('Band A: no diagnosis/alarm wording in schedule or gate',
          not DIAG_WORDS.search(p.locator('[data-kind="sleep-plan"] .sp-shift').inner_text())
          and not DIAG_WORDS.search(p.locator('[data-kind="sleep-plan"] .sp-gate-box').inner_text()))
    no_hscroll = p.evaluate("document.querySelector('[data-kind=\"sleep-plan\"]').scrollWidth <= document.querySelector('[data-kind=\"sleep-plan\"]').clientWidth + 1")
    check('Band A: no sideways overflow at 390 px', no_hscroll)
    # Focus trap + Escape return focus
    p.locator('[data-kind="sleep-plan"] [data-act="extras-plan-close"]').focus()
    p.keyboard.press('Shift+Tab')
    check('Sleep plan: Shift+Tab wraps focus inside dialog', p.evaluate("!!document.activeElement?.closest('[data-kind=\"sleep-plan\"]')"))
    p.keyboard.press('Escape')
    p.locator('[data-kind="sleep-plan"]').wait_for(state='detached')
    check('Sleep plan: Escape returns focus to opener', p.evaluate("document.activeElement?.dataset?.act || ''") == 'extras-plan-open')
    # Adult switch closes open plan
    p.click('.rp-entry-card [data-act="extras-plan-open"]')
    p.locator('[data-kind="sleep-plan"]').wait_for()
    p.evaluate("()=>{S.me={id:'adult:2',name:'Sage'};render()}")
    check('Sleep plan: adult switch closes sheet cleanly', p.locator('[data-kind="sleep-plan"]').count() == 0)
    check('Band A: zero JS errors', not p.errors)
    p.context.close()


def check_age_gates_and_edge_states(browser, base):
    # Day 182 (1 day before 6 months) -> still gated
    p, _ = setup_page(browser, base, age=182)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .sp-code').first.wait_for()
    codes = p.locator('[data-kind="sleep-plan"] .sp-code').all_inner_texts()
    check(f'Day 182: stays in Band B ({codes}) with 6-month gate shown',
          codes == ['B1', 'B2', 'B3', 'B4', 'B5'] and p.locator('[data-kind="sleep-plan"] .sp-gate-box').count() == 1 and p.locator('[data-kind="sleep-plan"] .sp-settling-note').count() == 0)
    p.context.close()

    # Day 183 (6 months) -> Band C settling methods unlocked
    p, _ = setup_page(browser, base, age=183)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .sp-code').first.wait_for()
    codes = p.locator('[data-kind="sleep-plan"] .sp-code').all_inner_texts()
    check(f'Day 183 (6 months): unlocks Band C ({codes}) with settling badges and no gate box',
          codes == ['C1', 'C2', 'C3', 'C4', 'C5'] and p.locator('[data-kind="sleep-plan"] .sp-settling-note').count() == 2 and p.locator('[data-kind="sleep-plan"] .sp-gate-box').count() == 0)
    p.context.close()

    # Over 12 months (400 days) -> Band D + over-12-months note
    p, _ = setup_page(browser, base, age=400)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .sp-code').first.wait_for()
    text = p.locator('[data-kind="sleep-plan"]').inner_text()
    check('Day 400: Band D with up-to-12-months note',
          '9 to 12 months' in text and 'These guides cover up to 12 months.' in text)
    p.context.close()

    # Missing birth date -> zero strategies, zero settling methods, Safe sleep open first, Settings prompt
    p, _ = setup_page(browser, base, age=None)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .sp-gate-box').wait_for()
    text = p.locator('[data-kind="sleep-plan"]').inner_text()
    check('No birth date: hides strategies, shows Settings prompt, keeps Safe sleep open',
          p.locator('[data-kind="sleep-plan"] .sp-code').count() == 0
          and 'Add her birth date in Settings' in text
          and p.locator('[data-kind="sleep-plan"] details[data-sp-open="safe"]').get_attribute('open') is not None)
    p.context.close()

    # Fewer than 8 daytime awake gaps -> calm placeholder in Part 1, Part 2 still visible
    few = [{'id': 's1', 'type': 'sleep', 'nap': True, 'dur': 40, 't': -1440 + 540, 'by': 'Rowan'}]
    p, _ = setup_page(browser, base, age=45, entries=few)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .rp-skel-card').wait_for(state='detached')
    text = p.locator('[data-kind="sleep-plan"]').inner_text()
    check('Fewer than 8 gaps: shows calm placeholder and still renders Part 2 guides',
          'Schedule estimates appear after 8 daytime awake gaps' in text
          and p.locator('[data-kind="sleep-plan"] .rp-table').count() == 0
          and p.locator('[data-kind="sleep-plan"] .sp-code').count() == 5)
    p.context.close()

    # Reduced permissions (sleep.view = False) -> omits Part 1, still renders Part 2
    p, _ = setup_page(browser, base, age=45, hide_sleep=True)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .sp-code').first.wait_for()
    text = p.locator('[data-kind="sleep-plan"]').inner_text()
    check('Reduced sleep permission: hides Part 1 schedule and keeps Part 2 guides',
          'Her usual schedule' not in text and p.locator('[data-kind="sleep-plan"] .sp-code').count() == 5 and not p.errors)
    p.context.close()

    # Error + Retry recovery
    p, state_fail = setup_page(browser, base, age=45, fail_state=True)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .rp-error').wait_for()
    check('State error: shows error card and Try again button while Part 2 remains visible',
          'Could not load sleep records' in p.locator('[data-kind="sleep-plan"] .rp-error').inner_text()
          and p.locator('[data-kind="sleep-plan"] .sp-code').count() == 5)
    state_fail['on'] = False
    p.click('[data-act="extras-plan-retry"]')
    p.locator('[data-kind="sleep-plan"] .rp-table').wait_for()
    check('State error retry: loads schedule cleanly', p.locator('[data-kind="sleep-plan"] .rp-stat').count() == 4)
    p.context.close()


def check_es_dim_and_no_ai(browser, base):
    # Spanish + Dim + AI off
    p, _ = setup_page(browser, base, age=45, lang='es', theme='on', ai=False)
    open_sleep_plan(p)
    p.locator('[data-kind="sleep-plan"] .rp-table').wait_for()
    text = p.locator('[data-kind="sleep-plan"]').inner_text()
    check('Spanish + Dim + AI off: renders Plan de sueño, disclaimer, Band A, S1..S4, gate box',
          'Plan de sueño' in text
          and 'No es consejo médico. Consulte al pediatra.' in text
          and 'Los métodos para dormirse por su cuenta se abren a los 6 meses' in text
          and p.locator('[data-kind="sleep-plan"] .sp-week-num').first.inner_text() == 'S1'
          and p.evaluate("document.documentElement.dataset.theme") == 'dim')
    no_hscroll = p.evaluate("document.querySelector('[data-kind=\"sleep-plan\"]').scrollWidth <= document.querySelector('[data-kind=\"sleep-plan\"]').clientWidth + 1")
    check('Spanish + Dim: no sideways overflow at 390 px and zero JS errors', no_hscroll and not p.errors)
    p.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            try:
                check_band_a_and_schedule(browser, base)
                check_age_gates_and_edge_states(browser, base)
                check_es_dim_and_no_ai(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
