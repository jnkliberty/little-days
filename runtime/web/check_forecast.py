"""Forecast facts of the insight card (plan 2026-11-21, Group 1; look approved 2026-11-21, round 2) in Chrome, sample data, no live writes."""
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

AT = datetime.fromisoformat('2026-11-21T13:40:00-06:00')     # Sat, 1:40 PM: day hours, between feeds and between naps
FEEDS = [60, 240, 420, 570, 750, 900, 1080, 1260]              # day 7:00, 9:30, 12:30, 3:00 PM, 6:00 PM; night 9 PM, 1 AM, 4 AM
SLEEPS = [(0, 420), (480, 540), (660, 720), (840, 900), (1020, 1050), (1170, 1440)]
WORDS = re.compile(r'\b(normal|should|must|too (few|many|late|early)|problem|worry)\b', re.I)


def check(name, value):
    assert value, name
    print('PASS', name, flush=True)


def history(now):
    out = []
    for day in range(-8, 1):
        out += [{'id': f'f{day}-{m}', 'type': 'feed', 'side': 'L', 'dur': 15, 't': day * 1440 + m, 'by': 'Rowan'} for m in FEEDS]
        out += [{'id': f's{day}-{a}', 'type': 'sleep', 'nap': 420 <= a < 1140, 'dur': b - a, 't': day * 1440 + a, 'by': 'Sage'} for a, b in SLEEPS]
    return [e for e in out if e['t'] + (e['dur'] if e['type'] == 'sleep' else 0) <= now]


def serve_history(page, now, broken=False):
    today = AT.date()

    def state(route):
        query = parse_qs(urlparse(route.request.url).query)
        lo, hi = ((datetime.fromisoformat(query[k][0]).date() - today).days for k in ('from', 'to')) if 'from' in query else (-1, 1)
        if broken and lo < -2:
            route.fulfill(status=503, json={'error': 'History unavailable'})
            return
        route.fulfill(json={**page.st, 'today': today.isoformat(), 'entries': [e for e in history(now) if lo <= e['t'] // 1440 < hi]})
    page.route(re.compile(r'/api/state(\?.*)?$'), state)


def open_home(browser, base, lang='en', broken=False, at=AT, prefs=None):
    page = open_app(browser, base, 390, 844, at, lang=lang, ai=True)
    if prefs:
        page.st['preferences'].update(prefs)
    serve_history(page, at.hour * 60 + at.minute, broken)
    page.clock.install(time=at)
    page.reload()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    return page


def forecasts(page):
    return page.evaluate("factPool().filter(f=>f.kind==='forecast').map(f=>({id:f.id,title:f.title,headline:f.headline,note:f.note}))")


def wait_forecast(page):
    page.wait_for_function("factPool().some(f=>f.kind==='forecast')", timeout=8000)


def check_home(browser, base):
    page = open_home(browser, base)
    wait_forecast(page)
    facts = forecasts(page)
    check(f'Home opens on the feed forecast, then the nap forecast ({[f["id"] for f in facts]})',
          page.locator('.insight').get_attribute('data-fact').startswith('forecast:feed:') and [f['id'].split(':')[1] for f in facts] == ['feed', 'nap'])
    card = page.locator('.insight .fact-content')
    check('the fact reads "Feed forecast", a 12-hour window, and "From her last 7 days"',
          card.locator('h2').inner_text() == 'Feed forecast' and re.fullmatch(r'\d{1,2}:\d\d to \d{1,2}:\d\d (AM|PM)', facts[0]['headline'])
          and card.locator('.fact-note').inner_text().replace('\xa0', ' ') == 'From her last 7 days')
    check('the drawing has the window box, a now tick and the "Now" label',
          card.locator('.fc-win').count() == 1 and card.locator('.now-tick').count() == 1 and card.locator('.fc-foot .val').inner_text() == 'Now')
    check('the forecast words make no judgment', not WORDS.search(' '.join(f['title'] + ' ' + f['note'] for f in facts)))
    check('a screen reader hears the whole fact', (card.locator('.fc-draw').get_attribute('aria-label') or '').startswith('Feed forecast: '))
    page.evaluate("()=>{S.sleepRun={id:'fake',t0:nowM()-5,startedAt:new Date(Date.now()-5*60000).toISOString(),by:'Rowan'};renderHomeCard()}")
    check('while she sleeps there is no nap forecast', [f['id'].split(':')[1] for f in forecasts(page)] == ['feed'])
    page.evaluate("()=>{S.sleepRun=null;S.run={id:'fake-feed',side:'L',t0:nowM()-5,startedAt:new Date(Date.now()-5*60000).toISOString(),by:'Rowan'};renderHomeCard()}")
    check('while she feeds there is no feed forecast', [f['id'].split(':')[1] for f in forecasts(page)] == ['nap'])
    page.evaluate("()=>{S.run=null;S.permissions.resources.feedings.view=false;renderHomeCard()}")
    check('an adult who may not view feeds gets no feed forecast', [f['id'].split(':')[1] for f in forecasts(page)] == ['nap'])
    page.evaluate("()=>{S.permissions.resources.sleep.view=false;renderHomeCard()}")
    check('an adult who may view neither gets no forecast and no error', forecasts(page) == [] and page.locator('.insight').count() == 1)
    page.evaluate("()=>{S.permissions.resources.sleep.view=true;S.permissions.resources.feedings.view=true;renderHomeCard()}")
    page.evaluate("()=>{homeReads.delete(todayISO());renderHomeCard()}")
    check('when a poll fails and today is unread, no forecast shows from old records', forecasts(page) == [])
    page.evaluate("()=>{homeReads.add(todayISO());renderHomeCard()}")
    page.evaluate("()=>{fcSeen.clear();S.factId=factPool().find(f=>f.kind!=='forecast').id;factMoved=false;factPaused=false;renderHomeCard()}")
    check('a forecast that arrives after Home opened still leads the card once',
          page.locator('.insight').get_attribute('data-fact').startswith('forecast:feed:'))
    # The minute redraw: past the end of the feed window, the same fact says the window passed, with no reload.
    end = page.evaluate("LittleDaysForecast.forecast({entries:homeEntries(todayISO()),now:nowExactM(),complete:true}).feed.to")
    page.clock.fast_forward((end - (AT.hour * 60 + AT.minute) + 2) * 60000)   # one jump: due timers fire once
    page.wait_for_function("factPool().some(f=>f.id.startsWith('forecast:feed')&&f.note==='Window passed')", timeout=8000)
    page.evaluate("()=>{S.factId=factPool()[0].id;renderHomeCard()}")
    check('after the window, the fact says "Window passed" and the box is gray', page.locator('.insight .fact-content .fc-win.past').count() == 1)
    page.clock.fast_forward(5 * 3600000)   # no feed logged for hours (same day): a long time line
    page.wait_for_timeout(300)
    page.evaluate("()=>{S.factId=factPool()[0].id;renderHomeCard()}")
    gaps = page.evaluate("""()=>{const r=[...document.querySelectorAll('.insight .fact-content .fc-foot span')].map(s=>s.getBoundingClientRect()).sort((a,b)=>a.left-b.left);
        return r.slice(1).map((b,i)=>Math.round(b.left-r[i].right))}""")
    check(f'hours after a passed window the labels do not overlap ({gaps})', gaps and min(gaps) >= 4)
    # A new identity (here: another child) on the same page starts with the card not moved, so its forecast can lead.
    moved = page.evaluate("()=>{factMoved=true;applyIdentity({...S,child:{...S.child,id:'another-child'}});return factMoved}")
    check('a new adult or child on the same page starts with the card not moved', moved is False)
    check('no page error on Home', not page.errors)
    page.context.close()


def check_ask(browser, base):
    page = open_home(browser, base)
    asked = []
    page.route('**/api/ai/status', lambda r: r.fulfill(json={'available': True}))
    page.route('**/api/ai/chat', lambda r: (asked.append(r.request.post_data_json), r.fulfill(json={'answer': 'Sample answer.', 'references': []})))
    wait_forecast(page)
    page.evaluate("()=>{S.factId=factPool()[0].id;factPaused=true;renderHomeCard()}")
    page.locator('.insight .ask-pill[data-arg="forecast"]').click()
    page.wait_for_function('S.chat.messages.length>0', timeout=8000)
    check(f'Ask on a forecast fact sends one question about its window ({asked[0]["question"] if asked else None})',
          len(asked) == 1 and asked[0]['question'].startswith('Why is her next feed forecast for '))
    page.evaluate("()=>closeChat()")
    page.evaluate("()=>{S.chat.draft='My own question';S.factId=factPool()[0].id;renderHomeCard()}")
    page.locator('.insight .ask-pill[data-arg="forecast"]').click()
    page.wait_for_timeout(500)
    check('Ask on a forecast keeps an unsent draft and sends nothing', page.input_value('#ai-question') == 'My own question' and len(asked) == 1)
    page.evaluate("()=>{S.chat.draft='';closeChat()}")
    page.evaluate("()=>{S.factId=factPool().find(f=>f.kind!=='forecast')?.id;renderHomeCard()}")
    check('Ask on another fact carries no forecast question', page.locator('.insight .ask-pill[data-arg="forecast"]').count() == 0)
    check('no page error with Ask', not page.errors)
    page.context.close()


def check_switch_and_loading(browser, base):
    page = open_home(browser, base, prefs={'forecast': 'off'})
    page.wait_for_function("factPool().length>0")
    page.wait_for_timeout(800)
    check('with the switch off there is no forecast fact', forecasts(page) == [])
    page.evaluate("()=>{S.sheet={kind:'settings'};render()}")
    off = page.locator('[data-setting="forecast"][data-value="off"]')
    check('Settings shows the forecast switch with Off chosen', off.get_attribute('aria-pressed') == 'true'
          and page.locator('#fc-l').inner_text() == 'Feed and nap forecasts')
    saved = []

    def preferences(route):
        body = route.request.post_data_json
        saved.append(body)
        page.st['preferences'] = {k: v for k, v in body.items() if k != 'operationId'}
        route.fulfill(json={'status': 'saved', 'id': 'preferences:1', 'state': page.st})
    page.route('**/api/preferences', preferences)
    page.locator('[data-setting="forecast"][data-value="on"]').click()
    page.wait_for_function("S.preferences.forecast==='on'", timeout=8000)
    check(f'a tap on On saves forecast "on" with the other settings ({saved[-1] if saved else None})',
          saved and saved[-1].get('forecast') == 'on' and saved[-1].get('lang') == 'en')
    page.context.close()
    page = open_home(browser, base, broken=True)
    page.wait_for_timeout(1500)
    check('until the 7 days are loaded there is no forecast fact', forecasts(page) == [])
    page.context.close()
    page = open_home(browser, base, at=datetime.fromisoformat('2026-11-21T21:30:00-06:00'))
    wait_forecast(page)
    check('at night only the feed forecast shows', [f['id'].split(':')[1] for f in forecasts(page)] == ['feed'])
    page.context.close()
    page = open_home(browser, base, at=datetime.fromisoformat('2026-11-21T00:30:00-06:00'))   # last feed 9 PM yesterday
    wait_forecast(page)
    date = page.evaluate("factPool().find(f=>f.id.startsWith('forecast:feed')).evidence[0].date")
    check(f'after midnight, View log opens the day of the feed that set the window ({date})', date == '2026-11-20')
    page.context.close()


def check_spanish(browser, base):
    page = open_home(browser, base, lang='es')
    wait_forecast(page)
    facts = forecasts(page)
    check(f'Spanish reads "Pronóstico de toma" with a 12-hour range ({facts[0]["headline"]})',
          facts[0]['title'] == 'Pronóstico de toma' and re.fullmatch(r'\d{1,2}:\d\d a \d{1,2}:\d\d [ap]\. m\.', facts[0]['headline'])
          and facts[0]['note'] == 'Según sus últimos 7 días')
    page.context.close()


def check_widths(browser, base):
    off = {}
    for width in (360, 430, 768):
        page = open_app(browser, base, width, 844, AT, ai=True)
        serve_history(page, AT.hour * 60 + AT.minute)
        page.clock.install(time=AT)
        page.reload()
        wait_forecast(page)
        off[width] = page.evaluate("""()=>{const c=document.querySelector('.insight .fact-content'),t=c.querySelector('.now-tick').getBoundingClientRect(),l=c.querySelector('.fc-foot .val').getBoundingClientRect();
            return Math.round(Math.abs(t.left-(l.left+l.width/2)))}""")
        page.context.close()
    check(f'"Now" sits under its tick at 360, 430 and 768 px (px off: {off})', max(off.values()) <= 2)
    page = open_app(browser, base, 440, 956, AT, ai=True)
    serve_history(page, AT.hour * 60 + AT.minute)
    page.clock.install(time=AT)
    page.reload()
    wait_forecast(page)
    page.evaluate("()=>{S.sleepRun={id:'fake',t0:nowM()-5,startedAt:new Date(Date.now()-5*60000).toISOString(),by:'Rowan'};render()}")
    sleep_check = page.evaluate("""()=>{const h=document.querySelector('.insight .fact-content h2').getBoundingClientRect(),
        a=document.querySelector('.insight .fact-content .ask-pill').getBoundingClientRect(),
        viz=document.querySelector('.insight .fact-content .fact-viz').getBoundingClientRect(),
        t=document.querySelector('.insight .fact-content .now-tick').getBoundingClientRect(),
        l=document.querySelector('.insight .fact-content .fc-foot .val').getBoundingClientRect();
        return {leftDiff:Math.round(viz.left-h.left),rightDiff:Math.round(a.right-viz.right),off:Math.round(Math.abs(t.left-(l.left+l.width/2)))};}""")
    page.context.close()
    check(f'with Stop sleep at 440 px, forecast aligns under title to Ask and keeps "Now" under its tick ({sleep_check})',
          abs(sleep_check['leftDiff']) <= 2 and abs(sleep_check['rightDiff']) <= 2 and sleep_check['off'] <= 2)


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            try:
                check_home(browser, base)
                check_ask(browser, base)
                check_switch_and_loading(browser, base)
                check_spanish(browser, base)
                check_widths(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
