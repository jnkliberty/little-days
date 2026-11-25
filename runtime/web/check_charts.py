"""Chart regressions against local assets and invented API responses only."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import json
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from check_support import browser_engine, launch_browser, start_static_server
from check_ui import state_response

ENGINE = browser_engine()
EVIDENCE = ROOT.parents[1] / '.evidence' / ENGINE
RESULTS = []
TODAY = date(2026, 11, 18)


def check(name, passed, detail=None):
    RESULTS.append({'name': name, 'passed': bool(passed), 'detail': detail})
    print(f"{'PASS' if passed else 'FAIL'} {name}" + (f': {detail}' if not passed else ''), flush=True)


def fixture_state():
    state = state_response()
    state['child']['birthDate'] = '2025-12-01'
    for offset in range(-14, 1):
        start = offset * 1440
        state['entries'].extend([
            {'id': f'sleep{offset}', 'type': 'sleep', 't': start+420, 'dur': 60},
            {'id': f'left{offset}', 'type': 'feed', 'sid': f'session{offset}', 'side': 'L', 't': start+540, 'dur': 10},
            {'id': f'right{offset}', 'type': 'feed', 'sid': f'session{offset}', 'side': 'R', 't': start+550, 'dur': 10},
            {'id': f'bottle{offset}', 'type': 'bottle', 't': start+600, 'ml': 100, 'milk': 'breast'},
            {'id': f'both{offset}', 'type': 'diaper', 'kind': 'B', 't': start+640},
            {'id': f'wet{offset}', 'type': 'diaper', 'kind': 'W', 't': start+660},
            {'id': f'pump{offset}', 'type': 'pump', 't': start+680, 'ml': 40},
        ])
        if offset < 0:
            state['entries'].append({'id': f'night{offset}', 'type': 'sleep', 't': start+1140, 'dur': 480})
    return state


def newborn_fixture():
    state = state_response()
    state['child']['birthDate'] = str(TODAY-timedelta(days=2))
    for i in range(10):
        entry = {'id':f'newborn-first-{i}', 't':-2880+450+i*120}
        entry.update({'type':'bottle','ml':60} if i < 8 else
                     {'type':'feed','side':'B' if i == 8 else 'R','dur':10})
        state['entries'].append(entry)
    times = [440,450,470,500,620,630,650,680,900,910,930,960,1140,1150,1170,1200]
    for i, minute in enumerate(times):
        entry = {'id':f'newborn-second-{i}', 't':-1440+minute}
        entry.update({'type':'bottle','ml':60} if i < 12 else
                     {'type':'feed','side':'L','dur':10})
        state['entries'].append(entry)
    for i, (minute, duration) in enumerate(zip([480,560,720,810,1000,1105,1240,1380],
                                              [5,10,20,75,100,60,120,90])):
        state['entries'].append({'id':f'newborn-nap-{i}','type':'sleep','t':-1440+minute,'dur':duration})
    state['entries'].extend([
        {'id':'newborn-diaper','type':'diaper','kind':'B','t':-1440+600},
        {'id':'newborn-today-bottle','type':'bottle','ml':60,'t':480},
        {'id':'newborn-today-breast','type':'feed','side':'L','dur':12,'t':600},
        {'id':'newborn-today-sleep','type':'sleep','dur':30,'t':540},
        {'id':'newborn-today-diaper','type':'diaper','kind':'W','t':620},
    ])
    return state


def growth_fixture(revision=0):
    return {'entries': [
        {'id': 'growth-old', 'type': 'growth', 'date': '2025-12-20', 't': -500000, 'kg': 3.2, 'cm': 50, 'head': 34, '_testRevision': revision},
        {'id': 'growth-new', 'type': 'growth', 'date': '2026-01-20', 't': -450000, 'kg': 4.2, 'cm': 55, 'head': 36, '_testRevision': revision},
    ], 'unavailable': []}


def serve_state(route, page, state):
    query = parse_qs(urlparse(route.request.url).query)
    start = date.fromisoformat(query.get('from', [str(TODAY-timedelta(days=1))])[0])
    end = date.fromisoformat(query.get('to', [str(TODAY+timedelta(days=1))])[0])
    page.chart_requests.append((str(start), str(end)))
    lo, hi = (start-TODAY).days*1440, (end-TODAY).days*1440
    response = dict(state)
    response['entries'] = [e for e in state['entries'] if lo <= e['t'] < hi]
    route.fulfill(json=response)


def mount(page, base, state):
    page.clock.install(time='2026-11-18T18:00:00Z')
    page.chart_requests = []
    page.chart_errors = []
    page.on('pageerror', lambda error: page.chart_errors.append(str(error)))
    page.route('**/*', lambda route: route.fallback() if urlparse(route.request.url).hostname == '127.0.0.1' else route.abort())
    page.route('**/api/session', lambda route: route.fulfill(json={
        'me': state['me'], 'csrf': 'fake-csrf', 'people': ['Care Adult']}))
    page.route('**/api/state*', lambda route: serve_state(route, page, state))
    page.route('**/api/growth', lambda route: route.fulfill(json=growth_fixture(state.get('_chartRevision', 0))))
    page.goto(base)
    page.locator('[data-act="tab"][data-arg="charts"]').click()
    page.wait_for_function('S.growthEntries.length === 2 && !S.growthLoading && !S.trendsLoading')


def run_case(browser, base, name, audit, state=None):
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    state = fixture_state() if state is None else state
    try:
        mount(page, base, state)
        audit(page, state)
    except Exception as error:
        check(f'{name} audit completes', False, str(error))
        page.screenshot(path=str(EVIDENCE / f'{name}-failure.png'))
    finally:
        check(f'{name}: zero JavaScript errors', not page.chart_errors, page.chart_errors)
        page.close()


def audit_r1_form(page, state):
    page.evaluate("()=>{S.tab='home';S.sheet={kind:'feed',tab:'bottle',ml:60,vu:'ml',milk:'breast'};render()}")
    page.locator('[data-fid="ml"]').fill('73')
    state['dutyNote'] = 'fake changed note'
    page.evaluate('async()=>{await syncFamily()}')
    check('R1 C3 changed records render with a feed form open', page.locator('[data-handoff]').count() == 1)
    check('R1 C3 the feed form keeps the typed value', page.locator('[data-fid="ml"]').input_value() == '73')


def audit_r2_offline(page, state):
    page.evaluate("()=>{S.tab='home';S.sheet={kind:'feed',tab:'bottle',ml:60,vu:'ml',milk:'breast'};render()}")
    page.locator('[data-fid="ml"]').fill('73')
    page.evaluate("window.originalInput=document.querySelector('[data-fid=ml]')")
    page.route('**/api/state*',lambda route:route.fulfill(status=503,json={'message':'fake offline'}))
    page.evaluate('async()=>await syncFamily()')
    check('R2 R1 offline refresh preserves the input node',page.evaluate("originalInput===document.querySelector('[data-fid=ml]')"))
    check('R2 R1 offline refresh preserves the typed value',page.locator('[data-fid="ml"]').input_value()=='73')


# ---------------------------------------------------------------------------------------------------------------------
# Charts, rebuilt to the approved mockup (look-match, 2026-11-11). The plots are SVG drawn by charts.js inside `.plot[data-chart]`;
# the day pick is the slider `.hit` of each bar chart (tap, drag, arrow keys); each card has its own `.readout`.
# ---------------------------------------------------------------------------------------------------------------------

def card_of(page, kind):
    return page.locator(f'.plot[data-chart="{kind}"]').locator('xpath=ancestor::section[1]')


def readout(page, kind):
    return card_of(page, kind).locator('.readout')


def hit_point(page, kind, index):
    """A point inside the picker rectangle over the bar of day `index` (the picker spans the days, so a day is 1/n of its width)."""
    hit = page.locator(f'.plot[data-chart="{kind}"] .hit')
    hit.scroll_into_view_if_needed()
    box = hit.bounding_box()
    n = len(hit.get_attribute('data-dates').split('|'))
    return box['x'] + box['width'] * (index + .5) / n, box['y'] + 20, n


def table_cells(page, kind, row=0):
    return page.locator(f'details[data-chart-numbers="{kind}"] tbody tr').nth(row).locator('th,td').all_text_contents()


def table_rows(page, kind):
    return page.locator(f'details[data-chart-numbers="{kind}"] tbody tr').count()


def pick_by_key(page, kind, keys):
    page.locator(f'.plot[data-chart="{kind}"] .hit').focus()
    for key in keys:
        page.keyboard.press(key)


def marks_outside(page, kind):
    """Every drawn mark of one plot that leaves the plot: a bar above its top, or any mark outside the picture."""
    return page.locator(f'.plot[data-chart="{kind}"] svg').evaluate("""svg=>{
      const w=+svg.getAttribute('width'), h=+svg.getAttribute('height'), bad=[];
      for (const e of svg.querySelectorAll('rect:not(.hit):not(.col):not(.now),path,circle')) {
        const b=e.getBBox(), bar=/chart-(breast|bottle|sleep|nap|diaper)/.test(e.getAttribute('fill')||'')||(e.getAttribute('stroke')||'').includes('c-ink');
        const pad=e.tagName==='circle'?0:0;
        if (b.x<-.01+pad||b.y<-.01||b.x+b.width>w+.01||b.y+b.height>h+.01||(bar&&b.y<8-.01)||[b.x,b.y,b.width,b.height].some(v=>!Number.isFinite(v)))
          bad.push([e.tagName,e.getAttribute('fill'),+b.x.toFixed(1),+b.y.toFixed(1),+b.width.toFixed(1),+b.height.toFixed(1)]);
      }
      return bad;
    }""")


def audit_glance(page, state):
    for lang, want in [('en', ['2.0 feeds', '9 h of sleep', 'Wet 2.0 · Dirty 1.0']), ('es', ['2.0 tomas', '9 h de sueño', 'Pipí 2.0 · Popó 1.0'])]:
        page.evaluate("l=>{S.lang=l;render()}", lang)
        strong = page.locator('[data-chart="glance"] li strong').all_text_contents()
        strong = [s.replace(' ', ' ') for s in strong]
        check(f'G1 {lang} three icon rows with the daily averages', strong == want, strong)
        subs = [[s.replace(' ', ' ') for s in li.locator('.sub').all_text_contents()] for li in page.locator('[data-chart="glance"] li').all()]
        gap = 'Usual gap 1 h' if lang == 'en' else 'Intervalo habitual 1 h'
        bottle = '100 mL from the bottle' if lang == 'en' else '100 mL de biberón'
        check(f'G2 {lang} the feed row has the bottle ml, then the usual gap (the middle gap between feed starts in the 7 full days); the others keep their one line',
              subs[0] == [bottle, gap] and subs[1] == [('Longest sleep 8 h' if lang == 'en' else 'Sueño más largo 8 h')] and subs[2] == [('Diapers' if lang == 'en' else 'Pañales')], subs)
        check(f'G2 {lang} the usual gap line is the one marked R2', page.locator('[data-chart="glance"] [data-r="R2"]').count() == 1
              and page.locator('[data-chart="glance"] [data-r="R2"]').inner_text().replace(' ', ' ') == gap)
        period = page.locator('[data-chart="glance"] > .sub').inner_text()
        check(f'G3 {lang} the period line names 7 full days', period == ('Daily averages for the last 7 full days' if lang == 'en' else 'Promedios diarios de los últimos 7 días completos'), period)
    page.evaluate("()=>{S.lang='en';S.entries=S.entries.filter(e=>e.type!=='bottle');render()}")
    page.evaluate("()=>{S.lang='en';S.entries.push({id:'one-long',type:'sleep',t:-4*1440+30,dur:700});render()}")
    longest = page.locator('[data-chart="glance"] li').nth(1).locator('.sub').inner_text().replace('\u00a0', ' ')
    check('G5 the longest sleep is the one longest sleep in the 7 full days, not an average of the daily longest', longest == 'Longest sleep 11 h 40 min', longest)
    check('G4 no bottle record leaves out the bottle ml line, and the usual gap stays or goes with the feeds',
          'from the bottle' not in page.locator('[data-chart="glance"]').inner_text())


def audit_layout(page, language, theme):
    page.evaluate("([lang,theme])=>{S.lang=lang;S.chartDetail=null;setThemeMode(theme);render()}", [language, theme])
    label = f'C6 {language} {theme}'
    en = language == 'en'
    heads = page.locator('.charts-page .chart-head h2, .charts-page > .card > h2').all_text_contents()
    want = (['At a glance', 'Daily rhythm', 'Reports', 'Feeds per day', 'Sleep per day', 'Wet per day', 'Dirty per day', 'Growth'] if en else
            ['De un vistazo', 'Ritmo diario', 'Reportes', 'Tomas por día', 'Sueño por día', 'Pipí por día', 'Popó por día', 'Crecimiento'])
    check(f'{label}: At a glance and Daily rhythm precede Reports', heads == want, heads)
    check(f'{label}: eight bars (seven full days and Today) in each bar chart', all(len(page.locator(f'.plot[data-chart="{k}"] .col').all()) == 8 for k in ['feeds', 'sleep', 'wet', 'dirty']))
    rows = page.locator('.plot[data-chart="rhythm"] text[x="0"]').all_text_contents()
    check(f'{label}: eight rhythm rows, Today last', len(rows) == 8 and rows[-1] == ('Today' if en else 'Hoy'), rows)
    ticks = page.locator('.plot[data-chart="rhythm"] text[y="16"]').all_text_contents()
    expected = ['7 AM', '1 PM', '7 PM', '1 AM', '7 AM'] if en else ['7 a. m.', '1 p. m.', '7 p. m.', '1 a. m.', '7 a. m.']
    check(f'{label}: five 12-hour ticks from 7 AM to 7 AM', ticks == expected, ticks)
    letters = page.locator('.plot[data-chart="feeds"] text').all_text_contents()
    check(f'{label}: weekday letters and Today under the bars', letters[-1] != '' and 'Today' in letters if en else 'Hoy' in letters, letters)
    check(f'{label}: every chart has a label and the pickers are sliders', page.locator('.plot svg[role="img"][aria-label]').count() == 6 and page.locator('.hit[role="slider"]').count() == 4)
    for kind in ['feeds', 'sleep', 'wet', 'dirty', 'rhythm', 'growth']:
        outside = marks_outside(page, kind)
        check(f'{label}: every {kind} mark stays inside its plot', not outside, outside)
    overlap = page.locator('.charts-page').evaluate('''root=>{
      const nodes=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), rects=[];
      while(nodes.nextNode()){
        const node=nodes.currentNode;if(!node.textContent.trim())continue;
        if(node.parentElement.closest('details:not([open])')&&!node.parentElement.closest('summary'))continue;
        const range=document.createRange();range.selectNodeContents(node);
        rects.push(...[...range.getClientRects()].filter(r=>r.width&&r.height));
      }
      return rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
    }''')
    check(f'{label}: text boxes do not overlap', not overlap)
    check(f'{label}: no horizontal page overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.screenshot(path=str(EVIDENCE / f'{language}-{theme}-390.png'), full_page=False)
    page.locator('.charts-page').screenshot(path=str(EVIDENCE / f'{language}-{theme}-390-full.png'))


def audit_themes(page, state):
    for language in ['en', 'es']:
        for theme in ['off', 'on']:
            audit_layout(page, language, theme)


def audit_marks(page, state):
    """The marks keep the DESIGN.md colors in day and night, and each series has a second cue: a dot for Breast, a diamond for Bottle, a bar for sleep."""
    expected = {'off': {'breast': 'rgb(187, 136, 26)', 'bottle': 'rgb(126, 74, 1)', 'sleep': 'rgb(21, 75, 160)', 'night': 'rgb(236, 236, 241)'},
                'on': {'breast': 'rgb(214, 152, 44)', 'bottle': 'rgb(246, 226, 182)', 'sleep': 'rgb(125, 157, 242)', 'night': 'rgb(64, 58, 51)'}}  # Deep fills night look (DESIGN.md Color rule 5)
    for theme in ['off', 'on']:
        page.evaluate("t=>{setThemeMode(t);render()}", theme)
        got = page.evaluate("""() => { const fill = e => getComputedStyle(e).fill, svg = document.querySelector('.plot[data-chart="rhythm"] svg');
            const circle = svg.querySelector('circle'), diamond = [...svg.querySelectorAll('path')].find(p => /l6 6-6 6-6-6Z/.test(p.getAttribute('d'))), sleep = svg.querySelector('rect[height="10"]'), night = svg.querySelector('rect');
            const legend = [...document.querySelectorAll('.charts-page .legend li')].map(li => li.textContent.trim());
            return {breast: fill(circle), bottle: fill(diamond), sleep: fill(sleep), night: fill(night), r: circle.getAttribute('r'), legend,
              shapes: [document.querySelectorAll('.legend circle').length, document.querySelectorAll('.legend path').length, document.querySelectorAll('.legend rect').length]}; }""")
        want = expected[theme]
        check(f'W5-1 {theme}: Breast and Bottle use two gold shades, a dot and a diamond', got['breast'] == want['breast'] and got['bottle'] == want['bottle'] and got['r'] == '5', got)
        check(f'W5-1 {theme}: sleep bars and the night band use the DESIGN.md blues', got['sleep'] == want['sleep'] and got['night'] == want['night'], got)
        if theme == 'on':
            marks = page.evaluate("""() => { const lum = c => { const [r, g, b] = c.match(/\\d+/g).slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
                const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + .05) / (y + .05)).toFixed(2); };
                const svg = document.querySelector('.plot[data-chart="rhythm"] svg'), card = getComputedStyle(svg.closest('.card')).backgroundColor, band = getComputedStyle(svg.querySelector('rect')).fill;
                const fills = [...new Set([...document.querySelectorAll('.charts-page .plot :is(circle, path, rect):not(.now, .hit, .col)')].map(e => getComputedStyle(e).fill).filter(f => f !== 'none' && !f.startsWith('rgba') && f !== band && f !== card))];
                const rhythm = [svg.querySelector('circle'), [...svg.querySelectorAll('path')].find(p => /l6 6-6 6-6-6Z/.test(p.getAttribute('d'))), svg.querySelector('rect[height="10"]')].map(e => getComputedStyle(e).fill);
                return {card: fills.map(f => [f, ratio(f, card)]), band: rhythm.map(f => [f, ratio(f, band)])}; }""")
            check(f'W5-1 on: every chart mark reads at 3:1 or more on the dark card: {marks["card"]}', len(marks['card']) >= 3 and all(r >= 3 for _, r in marks['card']), marks)
            check(f'W5-1 on: each Daily rhythm mark reads at 3:1 or more on the night band: {marks["band"]}', all(r >= 3 for _, r in marks['band']), marks)
        check(f'W5-1 {theme}: the legend names Sleep, Breast, Bottle and the night band, with a shape each', got['legend'] == ['Sleep', 'Breast', 'Bottle', 'Night, 7 PM to 7 AM'] and got['shapes'] == [1, 1, 2], got)
        head = page.evaluate("""() => { const lum = c => { const [r, g, b] = c.match(/\\d+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
            return [...document.querySelectorAll('.chart-head')].map(h => { const a = lum(getComputedStyle(h).backgroundColor), b = lum(getComputedStyle(h).color); return [getComputedStyle(h).backgroundColor, getComputedStyle(h).color, +((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(1)]; }); }""")
        check(f'W5-1 {theme}: each card head is a band whose title reads at 4.5:1 or more', len(head) == 6 and all(c[2] >= 4.5 for c in head), head)
        check(f'W5-1 {theme}: chart parts have no motion', page.locator('.plot *').evaluate_all(
            "els=>els.every(e=>getComputedStyle(e).animationName==='none'&&getComputedStyle(e).transitionDuration==='0s')"))


def audit_axis(page, state):
    """The Daily rhythm axis labels never touch, in English and Spanish, at 320, 360, 375 and 390 px."""
    for language in ['en', 'es']:
        page.evaluate("l=>{S.lang=l;render()}", language)
        for width in [320, 360, 375, 390]:
            page.set_viewport_size({'width': width, 'height': 844})
            page.wait_for_timeout(100)
            boxes = page.evaluate("""() => [...document.querySelectorAll('.plot[data-chart="rhythm"] text[y="16"]')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; })""")
            gaps = [round(b[0] - a[1], 1) for a, b in zip(boxes, boxes[1:])]
            check(f'W5-1 {language} {width}px: axis labels keep at least 3 px apart (a narrow phone keeps 7 AM, 7 PM, 7 AM only)', len(gaps) in (2, 4) and min(gaps) >= 3, gaps)
            if (language, width) == ('en', 390):
                check('W5-1 en 390px: all five axis labels stay on a wide phone', len(gaps) == 4, gaps)
            check(f'W5-1 {language} {width}px: the plots fit the card', page.evaluate('document.documentElement.scrollWidth<=innerWidth'))


def audit_bars(page, state):
    """Feeds, Sleep (night and naps) and the two diaper cards: eight bars, the mockup's axes, the numbers tables, Today on top of a tint band."""
    for language in ['en', 'es']:
        page.evaluate("l=>{S.lang=l;S.chartDetail=null;setThemeMode('off');render()}", language)
        en = language == 'en'
        for kind, ticks, today_parts in [('feeds', ['0', '5', '10'], 2), ('sleep', ['0', '6 h', '12 h', '18 h'], 0), ('wet', ['0', '4', '8'], 1), ('dirty', ['0', '2', '4'], 1)]:
            texts = page.locator(f'.plot[data-chart="{kind}"] svg text').all_text_contents()
            shown = [x for x in texts if x in ticks or x.replace(' ', ' ') in [t.replace(' ', ' ') for t in ticks]]
            check(f'W5-2 {language} {kind} axis uses the mockup limits: {ticks}', [x.replace(' ', ' ') for x in shown[:len(ticks)]] == [t.replace(' ', ' ') for t in ticks], texts)
            check(f'W5-2 {language} {kind} plot is 192 px tall and its table lists eight days', page.locator(f'.plot[data-chart="{kind}"] svg').get_attribute('height') == '192' and table_rows(page, kind) == 8)
        # Fixture day: 480 night minutes over 60 nap minutes, 1 breast feed and 1 bottle, 2 wet and 1 dirty diaper.
        check(f'W5-2 {language} the sleep table splits night from naps', table_cells(page, 'sleep', 0)[1:] == ['8 h', '1 h'] and
              [h for h in page.locator('details[data-chart-numbers="sleep"] thead th').all_text_contents()] == (['Day', 'Night sleep', 'Naps'] if en else ['Día', 'Sueño nocturno', 'Siestas']),
              table_cells(page, 'sleep', 0))
        check(f'W5-2 {language} the feeds table splits breast from bottle', table_cells(page, 'feeds', 0)[1:] == ['1', '1'], table_cells(page, 'feeds', 0))
        check(f'W5-2 {language} wet and dirty each have their own table', table_cells(page, 'wet', 0)[1:] == ['2'] and table_cells(page, 'dirty', 0)[1:] == ['1'])
        last = table_cells(page, 'feeds', 7)[0]
        check(f'W5-2 {language} the last table row is Today so far', last == ('Today so far' if en else 'Hoy hasta ahora'), last)
        first = table_cells(page, 'feeds', 0)[0]
        check(f'W5-2 {language} a table row names the weekday and the day', first == ('Wed, Nov 11' if en else 'mié, 11 nov'), first)
        check(f'W5-2 {language} Today is a hollow bar on a tint band with the part names beside it',
              page.locator('.plot[data-chart="feeds"] .now').count() == 1 and page.locator('.plot[data-chart="feeds"] [stroke="var(--c-ink)"]').count() >= 1
              and page.locator('.plot[data-chart="feeds"] .name').all_text_contents() == (['Breast', 'Bottle'] if en else ['Pecho', 'Biberón']),
              page.locator('.plot[data-chart="feeds"] .name').all_text_contents())


def audit_pick(page, state):
    """Day pick: tap, second tap, drag, arrow keys; one outline; a readout in each card (Today so far until a day is picked)."""
    page.evaluate("()=>{S.lang='en';S.chartDetail=null;setThemeMode('off');render()}")
    base = readout(page, 'sleep').inner_text().replace(' ', ' ')
    check(f'P1 each card starts on Today so far with no outline: {base}', base.startswith('Today so far · ') and page.locator('.plot .col.on').count() == 0, base)
    x, y, n = hit_point(page, 'sleep', 3)
    page.mouse.click(x, y)
    text = readout(page, 'sleep').inner_text().replace(' ', ' ')
    check(f'P2 a tap picks the day under the finger: {text}', text.startswith('Sat, Nov 14 · 9 h'), text)
    check('P2 exactly one day is outlined, in the card that was picked', page.locator('.plot .col.on').count() == 1 and card_of(page, 'sleep').locator('.col.on').count() == 1)
    check('P2 the other cards still say Today so far', readout(page, 'feeds').inner_text().startswith('Today so far'))
    check('P2 each readout is a polite live region', all(r.get_attribute('aria-live') == 'polite' for r in page.locator('.readout').all()))
    check('P2 the slider says which day it is on', 'Sat, Nov 14' in page.locator('.plot[data-chart="sleep"] .hit').get_attribute('aria-valuetext') and
          page.locator('.plot[data-chart="sleep"] .hit').get_attribute('aria-valuenow') == '4')
    page.mouse.click(x, y)
    check('P3 a second tap clears the pick', page.locator('.plot .col.on').count() == 0 and readout(page, 'sleep').inner_text().startswith('Today so far'))
    x1, y1, _ = hit_point(page, 'sleep', 1)
    x2, y2, _ = hit_point(page, 'sleep', 5)
    page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move(x2, y2, steps=6); page.mouse.up()
    check('P4 dragging across the bars picks the day under the pointer', page.evaluate('S.chartDetail') == '2026-11-16', page.evaluate('S.chartDetail'))
    page.evaluate('async()=>{await syncFamily()}')
    check('P4 a refresh keeps the picked day and its outline', page.evaluate('S.chartDetail') == '2026-11-16' and card_of(page, 'sleep').locator('.col.on').count() == 1)
    page.evaluate("()=>{S.chartDetail=null;render()}")
    pick_by_key(page, 'feeds', ['Home'])
    first = readout(page, 'feeds').inner_text()
    pick_by_key(page, 'feeds', ['ArrowRight', 'ArrowRight'])
    third = page.evaluate('S.chartDetail')
    pick_by_key(page, 'feeds', ['End'])
    last = page.evaluate('S.chartDetail')
    check(f'P5 keys move over the eight bars: {first} | {third} | {last}', first.startswith('Wed, Nov 11') and third == '2026-11-13' and last == '2026-11-18', (first, third, last))
    check('P5 the slider keeps the focus after a refresh', (page.evaluate('async()=>{await syncFamily()}') or True) and page.evaluate("document.activeElement?.dataset?.focus") in ('chart-feeds',), page.evaluate("document.activeElement?.dataset?.focus"))
    touch = page.locator('.plot[data-chart="sleep"]').evaluate('e=>getComputedStyle(e).touchAction')
    check(f'P6 the plots allow vertical page scrolling: {touch}', touch == 'pan-y')
    page.evaluate("()=>{S.chartDetail=null;render()}")
    for event in ['pointercancel', 'lostpointercapture']:
        x, y, _ = hit_point(page, 'wet', 2)
        page.mouse.move(x, y); page.mouse.down()
        state['dutyNote'] = 'fake ' + event
        page.evaluate('async()=>{await syncFamily()}')
        page.locator('.plot[data-chart="wet"]').dispatch_event(event, {'pointerId': 1, 'bubbles': True})
        check(f'P7 {event} drains the waiting render immediately and picks no day', page.evaluate('chartDrag===null&&!S.chartDirty&&S.chartDetail===null'))
        page.mouse.up()
    sleep = page.locator('.plot[data-chart="rhythm"]')
    sleep.scroll_into_view_if_needed()
    before = page.locator('[data-scroll]').evaluate('e=>e.scrollTop')
    sleep.hover()
    page.mouse.wheel(0, 200)
    page.wait_for_function('(before)=>document.querySelector("[data-scroll]").scrollTop>before', arg=before)
    check('P8 the page scrolls over the rhythm chart', page.locator('[data-scroll]').evaluate('e=>e.scrollTop') > before)


def audit_pick_missing(page, state):
    """A day with no record says so in words, and a keyboard can reach it."""
    entries = [{'id': 'sparse-c', 'type': 'sleep', 't': -6*1440+600, 'dur': 30},
               {'id': 'sparse-a', 'type': 'sleep', 't': -3*1440+600, 'dur': 60},
               {'id': 'sparse-b', 'type': 'sleep', 't': -1440+600, 'dur': 120}]
    page.evaluate('entries=>{S.entries=entries;S.chartDetail=null;S.lang="en";render()}', entries)
    check('C6 sparse sleep has three bars and no line', page.locator('.plot[data-chart="sleep"] path[fill="var(--chart-sleep)"],.plot[data-chart="sleep"] rect[fill="var(--chart-nap)"],.plot[data-chart="sleep"] path[fill="var(--chart-nap)"]').count() >= 3)
    x, y, n = hit_point(page, 'sleep', 5)
    page.mouse.click(x, y)
    text = readout(page, 'sleep').inner_text()
    check('C6 tapping a day with no record says no records', text == 'Mon, Nov 16 · No records.', text)
    pick_by_key(page, 'sleep', ['ArrowRight'])
    check('C6 the keyboard can reach the next day', page.evaluate('S.chartDetail') == '2026-11-17')


def audit_rhythm(page, state):
    svg = page.locator('.plot[data-chart="rhythm"] svg')
    got = svg.evaluate("""svg=>{
      const w=+svg.getAttribute('width'), plot=w-52, rows=[...svg.querySelectorAll('text[x="0"]')].map(t=>t.textContent);
      const night=svg.querySelector('rect'), nightBox=night.getBBox();
      const circles=svg.querySelectorAll('circle').length, diamonds=[...svg.querySelectorAll('path')].filter(p=>/l6 6-6 6-6-6Z/.test(p.getAttribute('d'))).length;
      const sleeps=[...svg.querySelectorAll('rect[height="10"]')].map(r=>r.getBBox().width);
      return {rows, nightStart:(nightBox.x-52)/plot, nightEnd:(nightBox.x+nightBox.width-w)/plot, circles, diamonds, sleeps};
    }""")
    check(f'R1 the night band is the right half of the 7 AM to 7 AM row: {got["nightStart"]}', abs(got['nightStart'] - .5) < .01 and abs(got['nightEnd']) < .01, got)
    check('R1 the rows run from Nov 10 to Today and each draws its feeds and its sleep', got['rows'][0] == 'Nov 11' and got['rows'][-1] == 'Today' and got['circles'] == 8 and got['diamonds'] == 8 and len(got['sleeps']) >= 8, got)
    check('R1 every sleep bar is at least 2 px wide', min(got['sleeps']) >= 1.99, got['sleeps'])
    link = page.locator('.rhythm-link, .charts-page .t-plain [data-act="tab"][data-arg="log"]')
    check('R1 the See the timeline link opens the Timeline', link.count() == 1 and link.inner_text().strip() == 'See the timeline')
    link.click()
    check('R1 the link lands on the Timeline tab', page.evaluate('S.tab') == 'log')


def audit_limits(page, state):
    """A 6-month-old with 9 kg, 70 cm and 14 feeds in one day: every mark stays inside its plot, and the axes grow in whole steps."""
    page.evaluate('''()=>{
      S.child.birthDate='2026-05-18';
      S.entries=S.entries.filter(e=>!(e.t>=-1440&&e.t<-1440+1440));
      for(let i=0;i<14;i++)S.entries.push({id:'many-'+i,type:'bottle',t:-1440+450+i*60,ml:60,milk:'formula'});
      for(let i=0;i<11;i++)S.entries.push({id:'wet-'+i,type:'diaper',kind:'W',t:-1440+450+i*60});
      for(let i=0;i<5;i++)S.entries.push({id:'dirty-'+i,type:'diaper',kind:'D',t:-1440+480+i*60});
      S.entries.push({id:'sleep-big',type:'sleep',t:-1440+420,dur:1260},{id:'sleep-big-night',type:'sleep',t:-1440+1700,dur:60});
      S.growthEntries=[{id:'g0',type:'growth',date:'2026-05-18',kg:3.4,cm:50,head:34.5},{id:'g1',type:'growth',date:'2026-08-18',kg:6.8,cm:62,head:40},{id:'g2',type:'growth',date:'2026-11-17',kg:9,cm:70,head:44.5}];
      render();
    }''')
    for kind in ['feeds', 'sleep', 'wet', 'dirty', 'rhythm', 'growth']:
        outside = marks_outside(page, kind)
        check(f'L1 {kind}: every mark stays inside its plot with the large records', not outside, outside)
    ticks = {k: page.locator(f'.plot[data-chart="{k}"] text').all_text_contents() for k in ['feeds', 'wet', 'dirty']}
    check('L2 the feeds axis grows from 10 to 15, the wet axis from 8 to 12 and the dirty axis stays at 4 or grows', '15' in ticks['feeds'] and '12' in ticks['wet'] and '5' not in ticks['wet'] and 'Day' not in ticks['dirty'], ticks)
    check('L2 the sleep axis grows past 18 hours', any(x.replace(' ', ' ') == '24 h' for x in page.locator('.plot[data-chart="sleep"] text').all_text_contents()))
    for measure, want in [('weight', 'Latest 9.0 kg at 26 weeks'), ('length', 'Latest 70.0 cm at 26 weeks'), ('head', 'Latest 44.5 cm at 26 weeks')]:
        page.locator(f'[data-act="growth-measure"][data-arg="{measure}"]').click()
        text = card_of(page, 'growth').locator('.readout').inner_text()
        check(f'L3 growth {measure}: the latest value and its age', text == want, text)
        labels = page.locator('.plot[data-chart="growth"] text').all_text_contents()
        check(f'L3 growth {measure}: the age axis runs Birth, 14 weeks, 28 weeks (an even week count past 26)', 'Birth' in labels and '14 weeks' in labels and '28 weeks' in labels, labels)
        outside = marks_outside(page, 'growth')
        check(f'L3 growth {measure}: the points stay inside the plot', not outside, outside)
    page.evaluate("()=>{S.units[meKey()]='us';render()}")
    for measure in ['weight', 'length', 'head']:
        page.locator(f'[data-act="growth-measure"][data-arg="{measure}"]').click()
        outside = marks_outside(page, 'growth')
        check(f'L4 growth {measure} in pounds and inches: the points stay inside the plot', not outside, outside)
    check('L4 weight reads in pounds and ounces', (page.locator('[data-act="growth-measure"][data-arg="weight"]').click() or True) and 'lb' in card_of(page, 'growth').locator('.readout').inner_text())


def audit_empty(page, state):
    for lang, text, heads in [('en', 'No records yet.', ['At a glance', 'Daily rhythm', 'Feeds per day', 'Sleep per day', 'Wet per day', 'Dirty per day', 'Growth']),
                              ('es', 'Todavía no hay registros.', ['De un vistazo', 'Ritmo diario', 'Tomas por día', 'Sueño por día', 'Pipí por día', 'Popó por día', 'Crecimiento'])]:
        page.evaluate("lang=>{S.lang=lang;S.entries=[];S.growthEntries=[];render()}", lang)
        cards = page.locator('.charts-page > .card:not(.rp-entry-card), .charts-page .group > .card')
        got = [[c.locator('h2').inner_text(), c.locator('p.sub').inner_text()] for c in cards.all()]
        check(f'E1 {lang} with no record each card shows its head and the line {text}', got == [[h, text] for h in heads], got)
        check(f'E1 {lang} no plot and no table is drawn', page.locator('.plot, details').count() == 0)
        page.evaluate("()=>{S.entries=[{id:'one-feed',type:'bottle',t:nowM()-60,ml:60},{id:'old-feed',type:'bottle',t:nowM()-60-3*1440,ml:60}];render()}")
        rows = page.locator('.plot[data-chart="rhythm"] text[x="0"]').all_text_contents()
        check(f'E2 {lang} the rhythm starts at the older feed: four rows', len(rows) == 4, rows)
        words = page.locator('.plot[data-chart="rhythm"] text', has_text='No records' if lang == 'en' else 'Sin registros').all_text_contents()
        check(f'E2 {lang} each day with no record says so inside its row', len(words) == 2, words)
        check(f'E2 {lang} the sleep card says no records yet while feeds draw', card_of_h2(page, 'Sleep per day' if lang == 'en' else 'Sueño por día') == text and page.locator('.plot[data-chart="feeds"]').count() == 1)


def audit_growth(page, state):
    check('GR1 one Growth card with three chips and the Weight chip on', page.locator('.growth-chips .chip').all_text_contents() == ['Weight', 'Length', 'Head size'] and
          page.locator('.growth-chips .chip[aria-pressed="true"]').inner_text() == 'Weight' and page.locator('.charts-page .card:not(.rp-entry-card)', has_text='Growth').count() == 1)
    check('GR1 the head is the plain band and there is no percentile band or curve', page.locator('.t-plain .chart-head h2', has_text='Growth').count() == 1 and
          page.locator('.plot[data-chart="growth"] [fill="var(--band)"]').count() == 0)
    for measure, label, readout_text, table in [('weight', 'Weight', 'Latest 4.2 kg at 7 weeks', [['2 weeks', '3.2 kg'], ['7 weeks', '4.2 kg']]),
                                                ('length', 'Length', 'Latest 55.0 cm at 7 weeks', [['2 weeks', '50.0 cm'], ['7 weeks', '55.0 cm']]),
                                                ('head', 'Head size', 'Latest 36.0 cm at 7 weeks', [['2 weeks', '34.0 cm'], ['7 weeks', '36.0 cm']])]:
        page.locator(f'[data-act="growth-measure"][data-arg="{measure}"]').click()
        check(f'GR2 {measure}: the chip is on and the readout names the latest value', page.locator(f'[data-arg="{measure}"]').get_attribute('aria-pressed') == 'true' and
              card_of(page, 'growth').locator('.readout').inner_text() == readout_text, card_of(page, 'growth').locator('.readout').inner_text())
        rows = [[c.replace(' ', ' ') for c in r] for r in [table_cells(page, 'growth', 0), table_cells(page, 'growth', 1)]]
        check(f'GR2 {measure}: the numbers table lists each measurement with its age', rows == table, rows)
    fonts = page.locator('.plot[data-chart="growth"] text').evaluate_all('els=>els.map(e=>parseFloat(getComputedStyle(e).fontSize))')
    check('GR3 growth labels remain at least 14px on a 390px phone', bool(fonts) and min(fonts) >= 14, fonts)
    page.locator('[data-act="growth-measure"][data-arg="weight"]').click()
    page.evaluate("l=>{S.lang=l;render()}", 'es')
    check('GR4 Spanish chips and readout', page.locator('.growth-chips .chip').all_text_contents() == ['Peso', 'Estatura', 'Cabeza'] and
          card_of(page, 'growth').locator('.readout').inner_text() == 'Último 4.2 kg con 7 semanas', card_of(page, 'growth').locator('.readout').inner_text())
    page.evaluate("l=>{S.lang=l;render()}", 'en')
    page.locator('.plot[data-chart="growth"]').scroll_into_view_if_needed()
    page.screenshot(path=str(EVIDENCE / 'growth-390.png'))


def audit_delayed_growth(page):
    page.evaluate('''() => {
      window.chartOriginalFetch=window.fetch;
      window.fetch=(...args)=>window.chartOriginalFetch(...args).then(response=>
        String(args[0]).includes('/api/growth')?new Promise(resolve=>{
          window.releaseChartGrowth=()=>resolve(response);
        }):response);
      window.chartGrowthSettled=false;
      void loadGrowthHistory().finally(()=>{window.chartGrowthSettled=true});
    }''')
    page.wait_for_function('typeof window.releaseChartGrowth === "function"')
    check('background growth reload keeps the chart and its chips visible', page.locator('.plot[data-chart="growth"] svg').count() == 1 and page.locator('.growth-chips .chip').count() == 3 and
          page.get_by_text('Loading measurements…', exact=True).count() == 0)
    page.evaluate('''() => {window.fetch=window.chartOriginalFetch;window.releaseChartGrowth();}''')
    page.wait_for_function('window.chartGrowthSettled===true')


def sync_changed_state(page, state, revision):
    """A poll that finds a changed state does not reload growth history (audit item 20); a saved growth record does."""
    growth_requests = []
    listener = lambda request: growth_requests.append(request.url) if '/api/growth' in request.url else None
    page.on('request', listener)
    state['entries'].append({'id': f'revision-{revision}', 'type': 'diaper', 'kind': 'W', 't': 1})
    state['_chartRevision'] = revision
    page.evaluate('async()=>{await syncFamily()}')
    page.wait_for_load_state('networkidle')
    check(f'revision {revision}: a changed poll on Charts does not reload growth history', not growth_requests and page.evaluate('S.growthEntries.every(e=>e._testRevision!==%d)' % revision), growth_requests)
    page.evaluate("finalOperation({status:'saved',operationId:'growth-save'},()=>'saved',{growth:true})")
    page.wait_for_function('(revision)=>S.growthEntries.length===2 && S.growthEntries.every(e=>e._testRevision===revision)', arg=revision)
    page.remove_listener('request', listener)
    check(f'revision {revision}: a saved growth record reloads growth history', len(growth_requests) == 1, growth_requests)


def audit_focus(page, state):
    revision = 0
    for kind in ['growth', 'feeds', 'sleep', 'wet', 'dirty']:
        summary = page.locator(f'details[data-chart-numbers="{kind}"] summary')
        summary.scroll_into_view_if_needed()
        if not page.locator(f'details[data-chart-numbers="{kind}"]').evaluate('e=>e.open'):
            summary.click()
        page.wait_for_function('(kind)=>S.chartNumbers?.[kind]===true', arg=kind)
        summary.focus()
        revision += 1
        sync_changed_state(page, state, revision)
        active = page.evaluate('document.activeElement?.dataset.focus')
        check(f'{kind} numbers summary retains unique focus after family sync', active == f'chart-numbers-{kind}', active)
        check(f'{kind} exact values stay open after family sync', page.locator(f'details[data-chart-numbers="{kind}"]').evaluate('e=>e.open'))


def audit_range(page, state):
    expected = ('2026-11-09', '2026-11-19')
    check('C4 first load reads 11 calendar dates: 7 full days, today, the day before and tomorrow', page.chart_requests[-1] == expected, page.chart_requests)
    older = next(e for e in state['entries'] if e['id'] == 'night-6')
    older['dur'] = 600
    page.evaluate('async()=>{await syncFamily()}')
    check('C4 refresh reads the same 11 dates', page.chart_requests[-1] == expected, page.chart_requests[-1])
    check('C4 an edit six days back replaces the cached value', page.evaluate("S.entries.find(e=>e.id==='night-6')?.dur") == 600)
    sleep = [c.replace(' ', ' ') for c in table_cells(page, 'sleep', 1)]
    check('C4 the older chart total changes after an edit', sleep[0] == 'Thu, Nov 12' and sleep[1:] == ['10 h', '1 h'], sleep)
    state['entries'].remove(older)
    page.evaluate('async()=>{await syncFamily()}')
    check('C4 a deletion six days back removes the cached value', page.evaluate("!S.entries.some(e=>e.id==='night-6')"))
    sleep = [c.replace(' ', ' ') for c in table_cells(page, 'sleep', 1)]
    check('C4 the older chart total changes after a deletion', sleep[1:] == ['0 min', '1 h'], sleep)
    old = [e for e in state['entries'] if e['t'] < -8*1440]
    check('C4 a record eight days back is not in the chart rows', page.evaluate("S.chartRows.length") == 8 and page.evaluate("S.chartRows[0].date") == '2026-11-11' and bool(old))


def audit_permissions(page, state):
    values = [v.replace(' ', ' ') for v in page.locator('[data-chart="glance"] li strong').all_text_contents()]
    check('C5 the sleep row says unavailable rather than zero', values[1] == 'Not available for this account', values)
    check('C5 no sleep marks are drawn', page.locator('.plot[data-chart="rhythm"] rect[height="10"]').count() == 0 and page.locator('.legend li', has_text='Sleep').count() == 0)
    check('C5 the Sleep per day card is not drawn without sleep access', page.locator('.plot[data-chart="sleep"]').count() == 0 and page.locator('.charts-page h2', has_text='Sleep per day').count() == 0)
    check('C5 the other cards stay', page.locator('.plot[data-chart="feeds"]').count() == 1 and page.locator('.plot[data-chart="wet"]').count() == 1)


def audit_clock(page, state):
    page.clock.set_fixed_time('2026-11-18T12:59:00Z')
    page.evaluate('async()=>{await syncFamily();render()}')
    before = page.evaluate('S.chartRows.at(-1).date')
    average = page.locator('[data-chart="glance"] li .sub', has_text='from the bottle').all_text_contents()
    check('C7 before 7 AM today is yesterday and is excluded from the average',
          before == '2026-11-17' and average == ['60 mL from the bottle'], {'date': before, 'average': average})
    page.evaluate('''()=>{window.clockRenders=0;window.clockRender=render;
      render=()=>{window.clockRenders++;window.clockRender()};}''')
    page.clock.set_fixed_time('2026-11-18T13:01:00Z')
    page.evaluate('()=>tick()')
    page.wait_for_function('!refreshingDay')
    check('C7 unchanged server data still renders after the clock changes', page.evaluate('window.clockRenders>0'))
    check('C7 the next tick moves today to the new 7 AM day', page.evaluate('S.chartRows.at(-1).date') == '2026-11-18')
    check('C7 the average includes the day that just ended',
          page.locator('[data-chart="glance"] li .sub', has_text='from the bottle').all_text_contents() == ['100 mL from the bottle'])
    check('C7 the so-far end moves to 7:01 AM', page.evaluate('rhythmRows(S.chartRows).at(-1).until') == 1)
    page.clock.set_fixed_time('2026-11-18T13:03:00Z')
    page.evaluate('()=>tick()')
    page.wait_for_function('!refreshingDay')
    check('C7 the so-far end also moves within the same day', page.evaluate('rhythmRows(S.chartRows).at(-1).until') == 3)


def audit_live_sleep(page):
    for language in ['en', 'es']:
        page.evaluate('''lang=>{S.lang=lang;S.chartDetail=null;S.sleepRun={id:'fake-live',t0:nowM()-20,
          startedAt:new Date(Date.now()-1200000).toISOString(),by:'Care Adult'};render()}''', language)
        text = readout(page, 'sleep').inner_text().lower()
        check(f'{language} active sleep in the Today readout identifies the running interval', ('en curso' if language == 'es' else 'running') in text, text)
    page.evaluate('()=>{S.chartDetail=null;S.sleepRun=null;render()}')


def growth_from_poll_and_swipe(page, state):
    """Another adult's measurement change on a loaded day, and a swipe delete of a measurement, both reload growth history (final review round 1)."""
    growth_requests = []
    listener = lambda request: growth_requests.append(request.url) if '/api/growth' in request.url else None
    page.on('request', listener)

    def poll(expected_kg):
        page.evaluate('async()=>{await syncFamily()}')
        page.wait_for_function('(kg)=>S.entries.find(e=>e.id==="weight:900")?.kg===kg', arg=expected_kg)
        page.wait_for_function('!growthPending && !growthReloadQueued && S.growthLoaded')

    state['entries'].append({'id': 'weight:900', 'type': 'growth', 't': 2, 'kg': 5.0, 'cm': 56, 'head': 37, 'by': 'Sage'})
    poll(5.0)
    check("another adult's new measurement today reloads growth history", len(growth_requests) == 1, growth_requests)
    state['entries'][-1]['kg'] = 5.2
    poll(5.2)
    check("another adult's changed measurement reloads growth history", len(growth_requests) == 2, growth_requests)
    poll(5.2)
    check('a poll with no measurement change does not reload growth history', len(growth_requests) == 2, growth_requests)
    page.wait_for_function('S.growthLoaded===true')
    state['entries'].pop()
    page.evaluate('''async()=>{LittleDaysAPI.writes.deleteEntry=async(id,op)=>({status:'saved',operationId:op,state:null});
      startSwipeDelete('weight:900');commitSwipeDelete();await new Promise(r=>setTimeout(r,50));}''')
    page.wait_for_load_state('networkidle')
    check('a swipe delete of a measurement reloads growth history', len(growth_requests) == 3, growth_requests)
    page.wait_for_function('S.growthLoaded===true')
    state['entries'].append({'id': 'weight:901', 'type': 'growth', 't': 3, 'kg': 5.4, 'cm': 57, 'head': 37.5, 'by': 'Rowan'})
    page.evaluate('''async()=>{finalOperation({status:'saved',operationId:'growth-save-2',state:await LittleDaysAPI.state()},()=>'saved',{growth:true});
      await new Promise(r=>setTimeout(r,50));}''')
    page.wait_for_load_state('networkidle')
    page.remove_listener('request', listener)
    check('a growth save whose reply also changes a measurement reloads growth history once', len(growth_requests) == 4, growth_requests)


def audit_existing(page, state):
    audit_delayed_growth(page)
    audit_focus(page, state)
    growth_from_poll_and_swipe(page, state)
    audit_live_sleep(page)


# Newborn cases: the records start at birth, so the rows and the tables do too.
def audit_newborn_range(page, state):
    rows = page.locator('.plot[data-chart="rhythm"] text[x="0"]').all_text_contents()
    check('F1 newborn rhythm starts at birth with three rows', rows == ['Nov 16', 'Nov 17', 'Today'], rows)
    check('F1 the bar tables start at birth and include Today', [table_rows(page, k) for k in ['feeds', 'sleep', 'wet', 'dirty']] == [3, 3, 3, 3])
    summary = page.evaluate('LittleDaysTrends.summarize(...chartArguments())')
    expected = [str(TODAY+timedelta(days=i)) for i in [-2, -1]]
    check('F1 glance windows contain only the two full newborn days', [d['date'] for d in summary['days']] == expected, summary['days'])
    check('F1 the period line says two full days', page.locator('[data-chart="glance"] > .sub').inner_text() == 'Daily averages for the last 2 full days')
    check('F1 there are no empty rows before birth', all('No records' not in t for t in page.locator('.plot[data-chart="rhythm"] text').all_text_contents()))
    early = {'id': 'newborn-early', 'type': 'bottle', 't': -2880+180, 'ml': 30}
    page.evaluate('entry=>{S.entries.push(entry);render()}', early)
    check('F1 a 3 AM birth-date record keeps its preceding 7 AM row', page.evaluate('S.chartRows.find(d=>d.offset===-3)?.bottleMl') == 30 and
          page.locator('.plot[data-chart="rhythm"] text[x="0"]').first.text_content() == 'Nov 15')


def audit_newborn_missing(page, state):
    for lang, sleep, diaper in [('en', 'no sleep logged', 'no diapers logged'), ('es', 'sin sueño registrado', 'sin pañales registrados')]:
        page.evaluate('lang=>{S.lang=lang;S.chartDetail=null;render()}', lang)
        for kind, word in [('sleep', sleep), ('wet', diaper), ('dirty', diaper)]:
            pick_by_key(page, kind, ['Home'])
            text = readout(page, kind).inner_text().lower()
            check(f'F2 {lang} {kind}: a day with a missing measure has words rather than zeros', word in text and '0 min' not in text and '0 wet' not in text and '0 pañales' not in text, text)
        no_log = page.evaluate("t('trendNoLog')")
        check(f'F2 {lang} tables keep each unlogged measure empty', table_cells(page, 'sleep', 0)[1:] == [no_log, no_log] and table_cells(page, 'wet', 0)[1:] == [no_log] and
              table_cells(page, 'feeds', 0)[1:] == ['2', '8'], [table_cells(page, 'sleep', 0), table_cells(page, 'feeds', 0)])
    summary = page.evaluate('LittleDaysTrends.summarize(...chartArguments())')
    metric = summary['metrics']['sleepMin']
    check('F2 sleep average counts only the full day with sleep records', metric['average'] == 480 and metric['loggedDays'] == 1, metric)
    check('F2 feed and diaper averages use their own recorded days', summary['metrics']['feeds']['average'] == 13 and summary['metrics']['wet']['average'] == 1, summary['metrics'])


def audit_newborn_kinds(page, state):
    got = page.locator('.plot[data-chart="rhythm"] svg').evaluate("""svg=>({
      circles: [...svg.querySelectorAll('circle')].filter(c=>c.getAttribute('cy')==='36').length,
      diamonds: [...svg.querySelectorAll('path')].filter(p=>/ 30l6 6-6 6-6-6Z/.test(p.getAttribute('d'))).length})""")
    check('F3 both-breasts feed stays in the breast kind as a dot; bottles are diamonds', got == {'circles': 2, 'diamonds': 8}, got)
    kinds = page.evaluate('S.chartRows.flatMap(d=>d.feeds).map(f=>f.kind)')
    check('F3 all markers have explicit kinds, including 21 bottles', kinds.count('bottle') == 21 and kinds.count('breast') == 7, kinds)
    check('F3 legend repeats breast and bottle shapes', page.locator('.legend circle').count() == 1 and page.locator('.legend path').count() == 1)
    outside = marks_outside(page, 'rhythm')
    check('F4 every rhythm mark stays inside the plot', not outside, outside)


def audit_newborn_naps(page, state):
    widths = page.locator('.plot[data-chart="rhythm"] rect[height="10"][y="76"]').evaluate_all('els=>els.map(e=>e.getBBox().width)')
    check('F5 all eight naps, including five minutes, are at least 2px wide', len(widths) == 8 and min(widths) >= 1.99, widths)


def audit_review_carry(page, state):
    page.clock.set_fixed_time('2026-11-18T13:10:00Z')
    page.evaluate("()=>{S.entries=[{type:'feed',side:'L',t:410,dur:30}];S.chartDetail=null;render()}")
    text = readout(page, 'feeds').inner_text()
    check('R1-3 a carry-only today says no feed logged', 'No feed logged.' in text and '0 feeds' not in text, text)
    today_marks = page.locator('.plot[data-chart="rhythm"] svg').evaluate(
        "svg=>{const n=svg.querySelectorAll('text[x=\"0\"]').length,top=28+(n-1)*32;return [...svg.querySelectorAll('circle,path')].filter(e=>e.getBBox().y>=top&&e.getBBox().y<top+32&&e.getAttribute('fill')!=='none').length}")
    check('R1-3 the carry is not drawn as a second feed mark in the Today row', today_marks == 0, today_marks)


def audit_newborn_sleep_start(page, state):
    for lang in ['en', 'es']:
        page.evaluate('lang=>{S.lang=lang;render()}', lang)
        check(f'F6 {lang} one newborn sleep day still draws its numbers table', table_rows(page, 'sleep') == 3)
        check(f'F6 {lang} no line chart is drawn for sleep', page.locator('.sleep-chart,.sleep-line,.sleep-point').count() == 0)
    page.evaluate('''()=>{
      S.child.birthDate=shiftISO(todayISO(),-3);
      S.entries.push({type:'sleep',t:-3*1440+600,dur:60},{type:'sleep',t:-2*1440+600,dur:30});
      render();
    }''')
    check('F6 the sleep table lists every day from birth', table_rows(page, 'sleep') == 4)


def late_start_fixture():
    """Records begin five days ago and skip one day, with an older birth date, so earlier days hold no record at all."""
    state = state_response()
    state['child']['birthDate'] = '2025-12-01'
    for offset in [-5, -4, -2, -1, 0]:
        start = offset * 1440
        state['entries'].extend([
            {'id': f'late-sleep{offset}', 'type': 'sleep', 't': start+480, 'dur': 90},
            {'id': f'late-bottle{offset}', 'type': 'bottle', 't': start+600, 'ml': 80, 'milk': 'formula'},
        ])
    return state


def audit_late_start(page, state):
    for language in ['en', 'es']:
        page.evaluate("l=>{S.lang=l;render()}", language)
        rows = page.locator('.plot[data-chart="rhythm"] text[x="0"]').all_text_contents()
        check(f'W5-3 {language} Daily rhythm starts at the first record and keeps the gap day: {rows}', len(rows) == 6 and rows[-1] == ('Today' if language == 'en' else 'Hoy'))
        empty = page.locator('.plot[data-chart="rhythm"] text', has_text='No records' if language == 'en' else 'Sin registros').count()
        check(f'W5-3 {language} only the gap day says it has no records', empty == 1, empty)
    page.evaluate("S.lang='en';render()")


def diaper_only_fixture():
    """An account that records only diapers: no sleep or feed marks."""
    state = state_response()
    state['child']['birthDate'] = '2025-12-01'
    for offset in [-6, -3, -2, 0]:
        state['entries'].extend([{'id': f'dia-w{offset}', 'type': 'diaper', 'kind': 'W', 't': offset*1440+600},
                                 {'id': f'dia-b{offset}', 'type': 'diaper', 'kind': 'B', 't': offset*1440+700}])
    return state


def audit_diaper_only(page, state):
    check('W5-6 the wet and dirty cards draw their charts', page.locator('.plot[data-chart="wet"]').count() == 1 and page.locator('.plot[data-chart="dirty"]').count() == 1)
    check('W5-6 the rhythm, feeds and sleep cards show their head and no records yet',
          [card_of_h2(page, h) for h in ['Daily rhythm', 'Feeds per day', 'Sleep per day']] == ['No records yet.'] * 3)
    check('W5-6 the table dates are plain text, not buttons', page.locator('details[data-chart-numbers] tbody th button').count() == 0)


def card_of_h2(page, title):
    return page.locator('.charts-page .card', has=page.locator('h2', has_text=title)).locator('p.sub').first.inner_text()


def audit_words(page, state):
    for lang in ['en', 'es']:
        result = page.evaluate("""lang=>{S.lang=lang;return {period:t('chartPeriod',1),feed:t('chartFeedTip',1,1,0),wet:t('chartWetTip',1),dirty:t('chartDirtyTip',1)}}""", lang)
        check(f'R1 C7 {lang} singular day', result['period'] == ('Daily average for the last full day' if lang == 'en' else 'Promedio diario del último día completo'), result)
        check(f'R1 C7 {lang} singular feed', result['feed'].startswith('1 feed.' if lang == 'en' else '1 toma.'), result)
        check(f'R1 C7 {lang} singular diaper', result['wet'] == ('1 wet diaper' if lang == 'en' else '1 pañal con pipí') and result['dirty'] == ('1 dirty diaper' if lang == 'en' else '1 pañal con popó'), result)


def audit_tables(page, state):
    for kind in ['feeds', 'growth']:
        details = page.locator(f'details[data-chart-numbers="{kind}"]')
        details.locator('summary').scroll_into_view_if_needed()
        details.locator('summary').click()
        check(f'R1 C6 {kind} table opens', details.evaluate('e=>e.open'))
        page.clock.set_fixed_time('2026-11-18T18:01:00Z' if kind == 'feeds' else '2026-11-18T18:02:00Z')
        page.evaluate('async()=>{await syncFamily()}')
        check(f'R1 C6 {kind} table stays open after minute render', details.evaluate('e=>e.open'))
        link = details.locator('summary').evaluate('e=>{const c=getComputedStyle(e);return [c.fontWeight,c.textDecorationLine,c.color]}')
        check(f'R3-1 {kind} Show the numbers is the bold text link, not underlined: {link}', link[0] == '700' and link[1] == 'none')
        details.locator('summary').click()


def run_checks(browser, base):
    run_case(browser, base, 'G-glance', audit_glance)
    for name, audit in [('F1-newborn', audit_newborn_range), ('F2-newborn', audit_newborn_missing), ('F3-newborn', audit_newborn_kinds),
                        ('F5-newborn', audit_newborn_naps), ('F6-newborn', audit_newborn_sleep_start)]:
        run_case(browser, base, name, audit, newborn_fixture())
    run_case(browser, base, 'R1-3-carry', audit_review_carry, newborn_fixture())
    run_case(browser, base, 'P-pick', audit_pick)
    run_case(browser, base, 'P-missing', audit_pick_missing)
    run_case(browser, base, 'R-rhythm', audit_rhythm)
    run_case(browser, base, 'W5-1', audit_marks)
    run_case(browser, base, 'W5-1-axis', audit_axis)
    run_case(browser, base, 'W5-2', audit_bars)
    run_case(browser, base, 'W5-3', audit_late_start, late_start_fixture())
    run_case(browser, base, 'W5-6', audit_diaper_only, diaper_only_fixture())
    run_case(browser, base, 'L-limits', audit_limits)
    run_case(browser, base, 'E-empty', audit_empty)
    run_case(browser, base, 'GR-growth', audit_growth)
    run_case(browser, base, 'R1-words', audit_words)
    run_case(browser, base, 'R1-tables', audit_tables)
    run_case(browser, base, 'R1-form', audit_r1_form)
    run_case(browser, base, 'C4', audit_range)
    restricted = fixture_state()
    restricted['permissions']['resources']['sleep']['view'] = False
    restricted['entries'] = [e for e in restricted['entries'] if e['type'] != 'sleep']
    run_case(browser, base, 'C5', audit_permissions, restricted)
    run_case(browser, base, 'C6', audit_themes)
    clock = state_response()
    clock['entries'] = [{'id': 'rollover', 'type': 'bottle', 't': -1440+600, 'ml': 140},
                        {'id': 'earlier', 'type': 'bottle', 't': -2880+600, 'ml': 60}]
    run_case(browser, base, 'C7', audit_clock, clock)
    run_case(browser, base, 'existing', audit_existing)
    run_case(browser, base, 'R2-offline', audit_r2_offline)


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            run_checks(browser, base)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    (EVIDENCE / 'checks.json').write_text(json.dumps(RESULTS, indent=2, ensure_ascii=False))
    failures = sum(not result['passed'] for result in RESULTS)
    print(f'{len(RESULTS)-failures} passed, {failures} failed; evidence: {EVIDENCE}')
    return int(bool(failures))


if __name__ == '__main__':
    raise SystemExit(main())
