"""Reports (plan 2026-11-21, Group 3; Option B approved 2026-11-22) in Chrome, sample data, no live writes."""
import os
import re
import time

os.environ["TZ"] = "America/Mexico_City"
time.tzset()

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

WORDS = re.compile(r'\b(should|must|too (few|many|little|much)|problem|worry|abnormal|warning)\b', re.I)
VARY = {
    'en': 'Babies vary. Ask the pediatrician if you are concerned.',
    'es': 'Cada bebé es distinto. Consulte al pediatra si le preocupa algo.',
}
CHARTS = "(async()=>{S.tab='charts';S.sheet=null;S.chartDetail=null;await loadTrendRange();render()})()"


def check(name, value):
    assert value, name
    print('PASS', name, flush=True)


def make_entries(today_offset_start=-35, today_offset_end=0, feeds=8, night=630, naps=3, nap_dur=90, include_med=True):
    out = []
    for day in range(today_offset_start, today_offset_end + 1):
        base = day * 1440 + 420  # 7:00 AM
        # Give the most recent 7 days slightly more sleep/feeds than prior days so Weekly shows clear "more" deltas.
        recent = day >= -7
        f_count = feeds + (1 if recent else 0)
        for i in range(f_count):
            t = base + 30 + i * 155
            if i % 4 == 3:
                out.append({'id': f'b{day}-{i}', 'type': 'bottle', 'ml': 110, 'unit': 'ml', 't': t, 'by': 'Rowan'})
            else:
                out.append({'id': f'f{day}-{i}', 'type': 'feed', 'side': 'L' if i % 2 == 0 else 'R', 'dur': 15, 't': t, 'by': 'Rowan'})
        for i in range(naps):
            out.append({'id': f'sn{day}-{i}', 'type': 'sleep', 'nap': True, 'dur': nap_dur, 't': base + 120 + i * 210, 'by': 'Sage'})
        out.append({'id': f's{day}-n', 'type': 'sleep', 'nap': False, 'dur': night + (30 if recent else 0), 't': base + 795, 'by': 'Sage'})
        for i in range(7 if recent else 6):
            out.append({'id': f'w{day}-{i}', 'type': 'diaper', 'kind': 'W', 't': base + 60 + i * 160, 'by': 'Sage'})
        for i in range(2):
            out.append({'id': f'd{day}-{i}', 'type': 'diaper', 'kind': 'D', 't': base + 100 + i * 360, 'by': 'Sage'})
        if include_med and day >= -14:
            out.append({'id': f'm{day}', 'type': 'med', 'name': 'Vitamin D drops', 'dose': 400, 'unit': 'drops', 't': base + 135, 'by': 'Rowan'})
    return out


def setup_page(browser, base, at_iso, age=17, lang='en', theme=None, ai=True, hide=None, entries=None, growth=None, fail_chunk=None):
    at = datetime.fromisoformat(at_iso)
    page = open_app(browser, base, 390, 844, at, lang=lang, theme=theme)
    page.st['child']['birthDate'] = (at.date() - timedelta(days=age)).isoformat() if age is not None else None
    page.st['permissions']['resources']['medication'] = {'view': True, 'add': True, 'change': True, 'delete': True}
    if hide:
        for res in hide:
            page.st['permissions']['resources'][res]['view'] = False
    today = at.date()
    all_entries = make_entries() if entries is None else entries
    growth_entries = growth if growth is not None else [
        {'id': 'weight:1', 'date': (today - timedelta(days=30)).isoformat(), 'kg': 3.6},
        {'id': 'weight:2', 'date': (today - timedelta(days=20)).isoformat(), 'kg': 3.9},
        {'id': 'height:1', 'date': (today - timedelta(days=20)).isoformat(), 'cm': 53.2},
        {'id': 'head-circumference:1', 'date': (today - timedelta(days=20)).isoformat(), 'head': 36.1},
    ]
    state_calls = []
    export_calls = []

    if not ai:
        page.route(re.compile(r'/api/session$'), lambda r: r.fulfill(json={'authenticated': True, 'me': 'Rowan', 'csrf': 'csrf-1', 'ai': False}))

    def handle_state(route):
        query = parse_qs(urlparse(route.request.url).query)
        if 'from' in query and 'to' in query:
            f, t = query['from'][0], query['to'][0]
            state_calls.append((f, t))
            if fail_chunk and fail_chunk(f, t):
                route.fulfill(status=500, json={'error': 'Failed'})
                return
            lo = (datetime.fromisoformat(f).date() - today).days
            hi = (datetime.fromisoformat(t).date() - today).days
        else:
            lo, hi = -1, 1
        filtered = [e for e in all_entries if lo <= e['t'] // 1440 < hi]
        route.fulfill(json={**page.st, 'today': today.isoformat(), 'entries': filtered})

    page.route(re.compile(r'/api/state(\?.*)?$'), handle_state)
    page.route(re.compile(r'/api/growth(\?.*)?$'), lambda r: r.fulfill(json={'entries': growth_entries, 'unavailable': []}))

    def handle_export(route):
        export_calls.append(route.request.url)
        route.fulfill(status=200, headers={'content-type': 'text/csv; charset=utf-8'}, body='date,type\n2026-11-16,feed\n')

    page.route(re.compile(r'/api/export(\?.*)?$'), handle_export)
    page.reload()
    page.locator('.tile[data-act="open-feed"], .wrap').first.wait_for()
    return page, state_calls, export_calls


def open_charts(page):
    page.evaluate(CHARTS)
    page.locator('.rp-entry-card, .charts-page').first.wait_for()


def check_monday_home_card(browser, base):
    # Monday 6:59 AM -> no card
    p, _, _ = setup_page(browser, base, '2026-11-23T06:59:00-06:00')
    check('Home: no "Her week is ready" card before 7 AM on Monday', p.locator('[data-rp-home]').count() == 0)
    p.context.close()

    # Monday 7:00 AM -> card visible, opens Weekly with Back -> Home, dismiss persists on reload
    p, _, _ = setup_page(browser, base, '2026-11-23T07:00:00-06:00')
    check('Home: "Her week is ready" card appears at 7 AM on Monday', p.locator('[data-rp-home]').count() == 1 and 'Her week is ready' in p.locator('[data-rp-home]').inner_text())
    check('Home shows Latest before the weekly report', p.evaluate("() => Boolean(document.querySelector('[data-act=tab][data-arg=log]').compareDocumentPosition(document.querySelector('[data-rp-home]')) & Node.DOCUMENT_POSITION_FOLLOWING)"))
    p.click('[data-rp-home] [data-act="report-open"]')
    p.locator('.rp-sheet[data-kind="report-weekly"] .row').first.wait_for()
    check('Home -> Weekly: Back button says Home', 'Home' in p.locator('.rp-sheet [data-act="report-close"]').inner_text())
    p.keyboard.press('Escape')
    p.locator('.rp-sheet').wait_for(state='detached')
    p.locator('[data-rp-home] .rp-home-summary').wait_for()
    check('Home: loaded weekly metrics retain sleep and feeds', 'sleep' in p.locator('[data-rp-home] .rp-home-summary').inner_text() and 'feeds' in p.locator('[data-rp-home] .rp-home-summary').inner_text())
    p.click('[data-rp-home] [data-act="report-dismiss"]')
    check('Home: Dismiss hides card immediately', p.locator('[data-rp-home]').count() == 0)
    p.reload()
    p.locator('.tile[data-act="open-feed"]').wait_for()
    check('Home: Dismiss persists across reload in localStorage', p.locator('[data-rp-home]').count() == 0)
    p.context.close()

    p, _, _ = setup_page(browser, base, '2026-11-23T07:00:00-06:00', entries=[], growth=[])
    check('Home: weekly card omits a repeated date fallback', p.locator('[data-rp-home] .rp-home-summary').count() == 0)
    p.click('[data-rp-home] [data-act="report-open"]')
    p.locator('.rp-sheet .empty-state').wait_for()
    check('Empty weekly report from Home: return control says Home', p.locator('.rp-sheet .empty-state [data-act="report-close"]').inner_text().strip() == 'Back to Home')
    p.click('.rp-sheet .empty-state [data-act="report-close"]')
    check('Empty weekly report: return opens Home', p.locator('[data-rp-home]').count() == 1 and p.locator('.rp-sheet').count() == 0)
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="weekly"]')
    p.locator('.rp-sheet .empty-state').wait_for()
    check('Empty weekly report from Charts: return control says Charts', p.locator('.rp-sheet .empty-state [data-act="report-close"]').inner_text().strip() == 'Back to Charts')
    p.context.close()

    # Tuesday -> no card
    p, _, _ = setup_page(browser, base, '2026-11-24T10:00:00-06:00')
    check('Home: no weekly card on Tuesday', p.locator('[data-rp-home]').count() == 0)
    p.context.close()


def check_weekly_dates_and_ages(browser, base):
    # Sunday -> asks Nov 1..Nov 17
    p, calls, _ = setup_page(browser, base, '2026-11-22T14:00:00-06:00')
    open_charts(p)
    calls.clear()
    p.click('[data-act="report-open"][data-arg="weekly"]')
    p.locator('.rp-sheet[data-kind="report-weekly"] .row').first.wait_for()
    check(f'Weekly on Sunday asks last Monday week ({calls})', ('2026-11-01', '2026-11-17') in calls)
    p.context.close()

    # Monday 3:00 AM -> asks Nov 1..Nov 17 (before 7 AM Monday edge)
    p, calls, _ = setup_page(browser, base, '2026-11-23T03:00:00-06:00')
    open_charts(p)
    calls.clear()
    p.click('[data-act="report-open"][data-arg="weekly"]')
    p.locator('.rp-sheet[data-kind="report-weekly"] .row').first.wait_for()
    check(f'Weekly on Monday 3 AM asks previous week ({calls})', ('2026-11-01', '2026-11-17') in calls)
    p.context.close()

    # Tuesday -> asks Nov 8..Nov 24 (same Mon Nov 16..Sun Nov 22 week), shows old growth point without percentile, closed guide opens
    p, calls, _ = setup_page(browser, base, '2026-11-24T10:00:00-06:00')
    open_charts(p)
    calls.clear()
    p.click('[data-act="report-open"][data-arg="weekly"]')
    p.locator('.rp-sheet[data-kind="report-weekly"] .row').first.wait_for()
    text = p.locator('.rp-sheet').inner_text()
    check(f'Weekly on Tuesday asks Nov 8..Nov 24 ({calls})', ('2026-11-08', '2026-11-24') in calls)
    check('Weekly shows Nov 16 to Nov 22 and plain "more" wording without diagnosis words',
          'Nov 16 to Nov 22' in text and 'more' in text and not WORDS.search(text))
    check('Weekly shows old growth measurement (outside 14-day period) with no percentile',
          '3.90\u00a0kg' in text and 'percentile' not in text.lower() and '%' not in p.locator('.rp-kv-list').inner_text())
    guide = p.locator('details[data-rp-guide]')
    check('Weekly guide starts closed and opens in place', guide.get_attribute('open') is None)
    guide.locator('summary').click()
    check('Weekly guide opened with external source link', guide.get_attribute('open') is not None and guide.locator('a[target="_blank"]').count() == 1)
    p.context.close()

    # Baby under 14 days old (9 days old) -> no prior week comparison
    p, _, _ = setup_page(browser, base, '2026-11-23T09:30:00-06:00', age=9)
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="weekly"]')
    p.locator('.rp-sheet[data-kind="report-weekly"] .row').first.wait_for()
    text = p.locator('.rp-sheet').inner_text()
    check('Baby under 14 days old: hides prior-week delta and shows calm note',
          'Week-to-week comparison starts after 14 days of logs.' in text and 'than last week' not in text)
    p.context.close()


def check_sleep_eating_and_30d(browser, base):
    # Sleep: 17d (under-4-months note), 30-day load splits into 2 calls <= 31 days, 3 AM shifts back 1 day
    p, calls, _ = setup_page(browser, base, '2026-11-23T09:30:00-06:00', age=17)
    open_charts(p)
    check('Charts Option B shows all 4 report rows plus Sleep plan', p.locator('.rp-entry-card [data-act="report-open"]').count() == 4 and p.locator('.rp-entry-card [data-act="extras-plan-open"]').count() == 1)
    check('Charts shows At a glance and Daily rhythm before Reports', p.evaluate("() => {const reports=document.querySelector('.rp-entry-card');return ['[data-chart=glance]','.plot[data-chart=rhythm]'].every(s=>Boolean(document.querySelector(s).compareDocumentPosition(reports) & Node.DOCUMENT_POSITION_FOLLOWING));}"))
    p.click('[data-act="report-open"][data-arg="sleep"]')
    p.locator('.rp-sheet[data-kind="report-sleep"] .rp-table').wait_for()
    text = p.locator('.rp-sheet').inner_text()
    check('Sleep day 17: under-4-months note, Babies vary, no diagnosis words',
          'No recommended range exists before 4 months.' in text and VARY['en'] in text and not WORDS.search(text))
    calls.clear()
    p.click('[data-act="report-period"][data-arg="30"]')
    p.locator('.rp-sheet .rp-period-text:has-text("30 full days")').wait_for()
    p.locator('.rp-sheet .rp-table').wait_for()
    spans = [(datetime.fromisoformat(b).date() - datetime.fromisoformat(a).date()).days for a, b in calls]
    check(f'Sleep 30-day load issues 2 /api/state calls each <= 31 days ({calls})', len(calls) == 2 and all(1 <= s <= 31 for s in spans))
    no_hscroll = p.evaluate("document.querySelector('.rp-sheet').scrollWidth <= document.querySelector('.rp-sheet').clientWidth + 1")
    check('Sleep 30-day sheet has no sideways scroll at 390 px', no_hscroll)
    # Bedtime & wake table shows all 14 days on 14-day period
    p.click('[data-act="report-period"][data-arg="14"]')
    p.locator('.rp-sheet .rp-table tbody tr').nth(13).wait_for()
    check('Sleep 14-day schedule table shows all 14 days', p.locator('.rp-sheet .rp-table tbody tr').count() == 14)

    # Tab focus trap stays inside sheet, and Escape returns focus to opener
    p.locator('.rp-sheet [data-act="report-close"]').focus()
    p.keyboard.press('Shift+Tab')
    inside = p.evaluate("!!document.activeElement?.closest('.rp-sheet')")
    check('Shift+Tab wraps focus inside open report sheet', inside)
    p.keyboard.press('Escape')
    p.locator('.rp-sheet').wait_for(state='detached')
    focused = p.evaluate("document.activeElement?.dataset?.arg || ''")
    check(f'Closing report returns focus to opener ({focused})', focused == 'sleep')

    # Eating: day 17 CDC 8-12 band, gaps, side balance
    p.click('[data-act="report-open"][data-arg="eating"]')
    p.locator('.rp-sheet[data-kind="report-eating"] .rp-balance').wait_for()
    etext = p.locator('.rp-sheet').inner_text()
    check('Eating day 17: CDC band, side balance, feed gaps, Babies vary',
          p.locator('.rp-sheet .nr-band').count() >= 1 and 'Nursing side balance' in etext and 'Feed gaps' in etext and VARY['en'] in etext and not WORDS.search(etext))
    # Adult switch closes open report (checkOwner)
    p.evaluate("()=>{S.me={id:'adult:2',name:'Sage'};render()}")
    check('Adult switch closes open report sheet cleanly', p.locator('.rp-sheet').count() == 0)
    p.context.close()

    # Sleep at day 150 -> AASM 12-16 h band
    p, _, _ = setup_page(browser, base, '2026-11-23T09:30:00-06:00', age=150)
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="sleep"]')
    p.locator('.rp-sheet .nr-band').first.wait_for()
    check('Sleep day 150: AASM 12 to 16 h band rendered', '12 to 16' in p.locator('.rp-sheet .nr-key').inner_text())
    p.context.close()

    # Report opened at 3:00 AM -> shifts back one day (Nov 15 to Nov 21)
    p, _, _ = setup_page(browser, base, '2026-11-23T03:00:00-06:00', age=17)
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="sleep"]')
    p.locator('.rp-sheet .rp-table').wait_for()
    check('Sleep opened at 3 AM excludes unfinished day (Nov 15 to Nov 21)', 'Nov 15 to Nov 21' in p.locator('.rp-period-text').inner_text())
    p.context.close()

    # Partial failure on 30-day chunk -> error card, NO partial averages
    p, _, _ = setup_page(browser, base, '2026-11-23T09:30:00-06:00', fail_chunk=lambda f, t: f == '2026-10-23')
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="sleep"]')
    p.locator('.rp-sheet .rp-table').wait_for()
    p.click('[data-act="report-period"][data-arg="30"]')
    p.locator('[data-rp-error]').wait_for()
    check('Failed chunk shows error card and hides averages', p.locator('.rp-hero').count() == 0 and 'Some days did not load' in p.locator('[data-rp-error]').inner_text())
    p.context.close()

    # 1-record Eating state
    one_feed = [{'id': 'b-only', 'type': 'bottle', 'ml': 110, 'unit': 'ml', 't': -1440 + 600, 'by': 'Rowan'}]
    p, _, _ = setup_page(browser, base, '2026-11-23T09:30:00-06:00', entries=one_feed)
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="eating"]')
    p.locator('.rp-sheet .rp-hero').wait_for()
    text = p.locator('.rp-sheet').inner_text()
    check('1-record Eating shows "1 feed in 7 days", hides side balance, explains gap rule',
          '1 feed' in text and 'in 7 days' in text and p.locator('.rp-balance').count() == 0 and 'Usual gap shows once 2 or more feeds are logged.' in text)
    p.context.close()


def check_doctor_print_csv_es_dim_perms(browser, base):
    # Doctor visit: averages, old growth, medicines, day-by-day, print layout, CSV button, AI off
    p, _, exports = setup_page(browser, base, '2026-11-23T09:30:00-06:00', ai=False)
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="doctor"]')
    p.locator('.rp-sheet .rp-day-list').wait_for()
    check('Doctor export actions sit immediately after the date range', p.evaluate("() => document.querySelector('.rp-sheet .rp-period-block').nextElementSibling.matches('.rp-actions')"))
    dtext = p.locator('.rp-sheet').inner_text()
    check('Doctor visit (AI off): averages, old growth, medicines, day-by-day, 0 errors',
          all(s in dtext for s in ('Averages', 'Latest growth', '3.90\u00a0kg', 'Vitamin D drops', 'Day by day')) and not p.errors)
    href7 = p.locator('[data-act="report-csv"]').get_attribute('href')
    check(f'Doctor visit 7d CSV link ({href7})', href7 == '/api/export?from=2026-11-16&to=2026-11-23')
    p.click('[data-act="report-period"][data-arg="14"]')
    p.locator('.rp-day-item').nth(13).wait_for()
    href14 = p.locator('[data-act="report-csv"]').get_attribute('href')
    check(f'Doctor visit 14d CSV link ({href14})', href14 == '/api/export?from=2026-11-09&to=2026-11-23')

    # Verify print media hides background app, back button, chips, and actions
    p.emulate_media(media='print')
    pr = p.evaluate("""() => ({
      main: getComputedStyle(document.querySelector('.main')).display,
      back: getComputedStyle(document.querySelector('.rp-sheet .bar .back')).display,
      chips: getComputedStyle(document.querySelector('.rp-period-chips')).display,
      actions: getComputedStyle(document.querySelector('.rp-actions')).display,
      sheet: getComputedStyle(document.querySelector('.rp-sheet')).position,
    })""")
    check(f'Print layout hides chrome and flows report ({pr})',
          pr['main'] == 'none' and pr['back'] == 'none' and pr['chips'] == 'none' and pr['actions'] == 'none' and pr['sheet'] == 'static')
    p.emulate_media(media='screen')
    p.context.close()

    # Spanish + Dim theme (including Dim-theme print contrast check)
    p, _, _ = setup_page(browser, base, '2026-11-23T09:30:00-06:00', lang='es', theme='on')
    open_charts(p)
    p.click('[data-act="report-open"][data-arg="doctor"]')
    p.locator('.rp-sheet .rp-day-list').wait_for()
    check('Spanish Doctor visit uses "días de edad" and Dim theme',
          '17 días de edad' in p.locator('.rp-period-text').inner_text() and p.evaluate("document.documentElement.dataset.theme") == 'dim' and not p.errors)
    p.emulate_media(media='print')
    dim_print = p.evaluate("""() => {
      const root = getComputedStyle(document.documentElement);
      return {
        ink: getComputedStyle(document.body).color,
        card: getComputedStyle(document.querySelector('.rp-sheet .card')).backgroundColor,
        feedDark: root.getPropertyValue('--feed-dark').trim().toLowerCase(),
        sleepDay: root.getPropertyValue('--sleep-day').trim().toLowerCase(),
        sleep: root.getPropertyValue('--sleep').trim().toLowerCase(),
      };
    }""")
    check(f'Dim-theme print resets text, card, and data tokens to light palette ({dim_print})',
          dim_print['ink'] == 'rgb(31, 31, 35)' and dim_print['card'] == 'rgb(255, 255, 255)'
          and dim_print['feedDark'] == '#7e4a01' and dim_print['sleepDay'] == '#5f93d6' and dim_print['sleep'] == '#154ba0')
    p.emulate_media(media='screen')
    p.click('[data-act="report-close"]')
    p.click('[data-act="report-open"][data-arg="eating"]')
    p.locator('.rp-sheet .rp-vary').wait_for()
    check('Spanish Eating ends with "Cada bebé es distinto"', VARY['es'] in p.locator('.rp-sheet').inner_text())
    p.context.close()

    # Restricted permissions: hide feedings, changes, medication, weight -> Eating button hidden, Doctor visit hides restricted sections, 0 errors
    p, _, _ = setup_page(browser, base, '2026-11-23T09:30:00-06:00', hide=['feedings', 'changes', 'medication', 'weight', 'height', 'head-circumference'])
    open_charts(p)
    check('Restricted adult: Eating report hidden, Sleep/Weekly/Doctor stay',
          p.locator('[data-act="report-open"][data-arg="eating"]').count() == 0 and p.locator('[data-act="report-open"][data-arg="sleep"]').count() == 1)
    p.click('[data-act="report-open"][data-arg="doctor"]')
    p.locator('.rp-sheet .rp-day-list').wait_for()
    rtext = p.locator('.rp-sheet').inner_text()
    check('Restricted adult: Doctor visit hides unpermitted feeds, diapers, growth, medicines with 0 errors',
          'Sleep' in rtext and 'Feeds' not in rtext and 'Wet diapers' not in rtext and 'Latest growth' not in rtext and 'Medicines given' not in rtext and not p.errors)
    p.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            try:
                check_monday_home_card(browser, base)
                check_weekly_dates_and_ages(browser, base)
                check_sleep_eating_and_30d(browser, base)
                check_doctor_print_csv_es_dim_perms(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
