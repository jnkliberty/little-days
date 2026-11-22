"""'Is this normal?' on the Charts screen (plan 2026-11-21, Group 2; look A approved 2026-11-22) in Chrome, sample data, no live writes."""
import os
import re
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-21T14:40:00-06:00')
FEEDS = [60, 240, 420, 570, 750, 900, 1260]                  # 7 a day: below CDC 8 to 12
WET = [100, 280, 460, 610, 790, 940]                         # 6 a day: inside "at least 5 to 6"
DIRTY = [300, 800]
SLEEPS = [(0, 420), (480, 540), (660, 720), (840, 900), (1170, 1440)]
# The wording rule: no diagnosis and no instruction on a range screen (plan, shared rules).
WORDS = re.compile(r'\b(should|must|too (few|many|little|much)|problem|worry|abnormal|warning)\b', re.I)
VARY = {'en': 'Babies vary. Ask the pediatrician if you are concerned.', 'es': 'Cada bebé es distinto. Consulte al pediatra si le preocupa algo.'}
CHARTS = "(async()=>{S.tab='charts';S.sheet=null;S.chartDetail=null;await loadTrendRange();render()})()"


def check(name, value):
    assert value, name
    print('PASS', name, flush=True)


def history(now):
    out = []
    for day in range(-8, 1):
        out += [{'id': f'f{day}-{m}', 'type': 'feed', 'side': 'L', 'dur': 15, 't': day * 1440 + m, 'by': 'Rowan'} for m in FEEDS]
        out += [{'id': f'w{day}-{m}', 'type': 'diaper', 'kind': 'W', 't': day * 1440 + m, 'by': 'Sage'} for m in WET]
        out += [{'id': f'd{day}-{m}', 'type': 'diaper', 'kind': 'D', 't': day * 1440 + m, 'by': 'Sage'} for m in DIRTY]
        out += [{'id': f's{day}-{a}', 'type': 'sleep', 'nap': 420 <= a < 1140, 'dur': b - a, 't': day * 1440 + a, 'by': 'Sage'} for a, b in SLEEPS]
    return [e for e in out if e['t'] + (e['dur'] if e['type'] == 'sleep' else 0) <= now]


def open_charts(browser, base, age, lang='en', theme=None, hide=None):
    page = open_app(browser, base, 390, 844, AT, lang=lang, theme=theme)
    page.st['child']['birthDate'] = (AT.date() - timedelta(days=age)).isoformat() if age is not None else None
    if hide:
        page.st['permissions']['resources'][hide]['view'] = False
    today = AT.date()

    def state(route):
        query = parse_qs(urlparse(route.request.url).query)
        lo, hi = ((datetime.fromisoformat(query[k][0]).date() - today).days for k in ('from', 'to')) if 'from' in query else (-1, 1)
        route.fulfill(json={**page.st, 'today': today.isoformat(), 'entries': [e for e in history(14 * 60 + 40) if lo <= e['t'] // 1440 < hi]})
    page.route(re.compile(r'/api/state(\?.*)?$'), state)
    page.reload()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    page.evaluate(CHARTS)
    page.locator('.plot[data-chart="feeds"] svg').wait_for()
    return page


def bands(page):
    return page.evaluate("""()=>Object.fromEntries([...document.querySelectorAll('.plot[data-chart]')].map(p=>{
      const b=p.querySelector('.nr-band'),top=[...p.querySelectorAll('svg text')].find(x=>x.getAttribute('y')==='13');
      return [p.dataset.chart,{band:!!b,open:!!p.querySelector('.nr-band.open'),edge:!!p.querySelector('.nr-edge'),y:b?+b.getAttribute('y'):null,
        top:top?.textContent,key:p.parentElement.querySelector('.nr-key')?.textContent||''}]}))""")


def sheet(page, kind):
    page.click(f'button[data-act="normal"][data-arg="{kind}"]')
    page.locator('.bsheet[data-kind="normal"]').wait_for()
    info = page.evaluate("""()=>{const s=document.querySelector('.bsheet[data-kind="normal"]'),body=s.querySelector('.sh-body');
      const plain=[...body.querySelectorAll('p:not(.sub):not(.nr-avg):not(.nr-typ):not(.nr-src)')].map(p=>getComputedStyle(p).color);
      return {text:body.innerText,last:body.lastElementChild.innerText,links:[...body.querySelectorAll('a')].map(a=>[a.textContent,a.href,a.target,a.rel]),
        colors:new Set(plain).size,ink:plain[0]===getComputedStyle(document.querySelector('.sh-head h2')).color}}""")
    page.click('.bsheet button[data-act="cancel"]')
    page.locator('.bsheet').wait_for(state='detached')
    return info


def wording(info, lang):
    return info['last'] == VARY[lang] and not WORDS.search(info['text'])


def check_newborn(browser, base):
    page = open_charts(browser, base, 15)
    b = bands(page)
    check('day 15: Feeds band 8 to 12 inside the plot, axis grown to 15', b['feeds']['band'] and not b['feeds']['open'] and b['feeds']['y'] >= 8 and b['feeds']['top'] == '15')
    check('day 15: Feeds key line', b['feeds']['key'] == 'Typical for her age: 8 to 12 a day')
    check('day 15: Wet band open at the top with an edge line', b['wet']['open'] and b['wet']['edge'])
    check('day 15: Wet key line lowercase', b['wet']['key'] == 'Typical for her age: at least 5 to 6 a day')
    check('day 15: no band on Sleep (under 4 months) or Dirty (no trusted figure)', not b['sleep']['band'] and not b['dirty']['band'])
    page.click('button[data-act="normal"][data-arg="feeds"]')
    seen = page.evaluate("getComputedStyle(document.querySelector('.main')).visibility")
    page.locator('.bsheet [data-act="cancel"]').focus()
    tabbed = []
    for _ in range(3):
        page.keyboard.press('Tab')
        tabbed.append(page.evaluate("document.activeElement.textContent"))
    check(f'the Charts screen stays visible behind the sheet ({seen})', seen == 'visible')
    check(f'Tab reaches the source links ({tabbed})', tabbed == ['CDC, breastfeeding', 'CDC, formula', 'Close'])
    page.click('.bsheet button[data-act="cancel"]')
    feeds = sheet(page, 'feeds')
    check('Feeds sheet: 7-day average, range and "Below" in plain words', all(s in feeds['text'] for s in ('7.0', 'Typical at 15', '8 to 12 a day', 'Below the typical range for her age.')))
    check('Feeds sheet: two CDC links open in a new tab', [l[0] for l in feeds['links']] == ['CDC, breastfeeding', 'CDC, formula'] and all(l[2] == '_blank' and 'noopener' in l[3] for l in feeds['links']))
    check('Feeds sheet: no alarm color (sentence in the ink of the title)', feeds['ink'] and feeds['colors'] == 1)
    wet = sheet(page, 'wet')
    check('Wet sheet: inside "at least 5 to 6"', 'Inside the typical range for her age.' in wet['text'] and 'At least 5 to 6 a day' in wet['text'])
    sleep = sheet(page, 'sleep')
    check('Sleep sheet: the under-4-months sentence and the AASM link', 'No recommended range exists before 4 months.' in sleep['text'] and sleep['links'][0][0] == 'AASM, 2016')
    dirty = sheet(page, 'dirty')
    check('Dirty sheet: no trusted figure, no source', 'No trusted source gives a range for her age.' in dirty['text'] and not dirty['links'])
    check('every sheet ends with "Babies vary" and has no diagnosis or instruction', all(wording(x, 'en') for x in (feeds, wet, sleep, dirty)))
    check('no page error at day 15', not page.errors)
    page.context.close()


def check_ages(browser, base):
    page = open_charts(browser, base, 3)
    young = sheet(page, 'feeds')['text']
    check('day 3: "Typical at 3 days" and the average names its 3 full days', 'Typical at 3 days' in young and 'Her last 3 full days' in young)
    page.context.close()
    page = open_charts(browser, base, 29)
    b = bands(page)
    check('day 29: the newborn rows ended, no band on any chart', not any(v['band'] for v in b.values()))
    check('day 29: Feeds axis back at 10', b['feeds']['top'] == '10')
    check('day 29: Feeds sheet says no trusted source', 'No trusted source gives a range for her age.' in sheet(page, 'feeds')['text'])
    page.context.close()
    page = open_charts(browser, base, 200)
    b = bands(page)
    check('day 200: Sleep band 12 to 16 h, only band on screen', b['sleep']['band'] and b['sleep']['key'] == 'Typical for her age: 12 to 16 h a day' and [k for k, v in b.items() if v['band']] == ['sleep'])
    check('day 200: Sleep sheet says "Typical at 6 months"', 'Typical at 6 months' in sheet(page, 'sleep')['text'])
    page.context.close()
    page = open_charts(browser, base, None)
    check('no birth date: no band, no error', not any(v['band'] for v in bands(page).values()) and 'No trusted source' in sheet(page, 'feeds')['text'] and not page.errors)
    page.context.close()


def check_spanish_dim_and_permissions(browser, base):
    page = open_charts(browser, base, 15, lang='es', theme='on')
    b = bands(page)
    check('Spanish: key line', b['feeds']['key'] == 'Típico para su edad: 8 a 12 al día')
    es = sheet(page, 'feeds')
    check('Spanish sheet: usted words, translated sources, "Cada bebé es distinto" last',
          'Por debajo del rango típico para su edad.' in es['text'] and es['links'][0][0] == 'CDC, lactancia (en inglés)' and es['last'] == VARY['es'])
    fill = page.evaluate("getComputedStyle(document.querySelector('.plot[data-chart=\"feeds\"] .nr-band')).fill")
    check(f'dim screen: the band uses the dim gray ({fill})', page.evaluate("document.documentElement.dataset.theme") == 'dim' and fill == 'rgb(64, 58, 51)')
    page.context.close()
    page = open_charts(browser, base, 15, hide='changes')
    check('an adult who may not view diapers sees no Wet or Dirty link and no error',
          page.locator('button[data-act="normal"][data-arg="wet"], button[data-act="normal"][data-arg="dirty"]').count() == 0 and not page.errors)
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            try:
                check_newborn(browser, base)
                check_ages(browser, base)
                check_spanish_dim_and_permissions(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
