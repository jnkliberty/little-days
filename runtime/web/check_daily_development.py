"""Daily fact lifecycle in configured Chrome; synthetic API responses only."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import shutil
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T23:59:00-06:00')
SHOTS = Path('/tmp/little-days-daily-development')


def batch(day):
    return {'date': day, 'status': 'ready', 'cards': [
        {'id': f'daily-{day}-{i}', 'date': day, 'topic': ['communication', 'comunicación'],
         'title': [f'{i}. Sounds become a conversation', f'{i}. Los sonidos se vuelven una conversación'],
         # Each card has its own body: Home shows a repeated body once (card mix, 2026-11-19).
         'body': [f'Babies learn through back-and-forth sounds. Respond when your baby makes a sound ({i}).',
                  f'Los bebés aprenden al intercambiar sonidos. Responda cuando su bebé haga un sonido ({i}).'],
         'source': ['CDC', 'CDC'], 'sourceDate': 'Retrieved ' + day,
         'url': 'https://www.cdc.gov/act-early/milestones/2-months.html'} for i in range(1, 4)]}


def audit(browser, base, width, lang):
    page = open_app(browser, base, width, 844 if width == 390 else 900, AT, lang=lang)
    calls, held = [], []
    mode = {'day': '2026-11-10', 'hold': True, 'fail': False}

    def development(route):
        calls.append(route.request)
        if mode['hold']:
            held.append(route)
        elif mode.get('abort'):
            route.abort()
        elif mode['fail']:
            route.fulfill(json={'date': mode['day'], 'status': 'unavailable', 'cards': []})
        else:
            route.fulfill(json={**batch(mode['day']), 'status': mode.get('status', 'ready')})

    page.route('**/api/development', development)
    page.reload()
    page.wait_for_function("S.auth==='ready'")
    page.wait_for_function("S.developmentAttempt!==null && S.developmentAttempt!==undefined")
    page.wait_for_timeout(50)
    assert len(held) == 1
    assert page.locator('.tile[data-act=open-feed]').is_visible(), 'AI must not block logging'
    # The same record facts before and after the daily facts arrive; their places in the mix may change (fun and record cards alternate).
    records = "factPool().filter(f=>f.kind==='record').sort((a,b)=>a.id.localeCompare(b.id))"
    care = page.evaluate(records)
    assert care and not page.evaluate("factPool().some(f=>f.kind==='source')"), 'no stale library fallback'
    assert calls[0].method == 'POST' and calls[0].headers.get('x-csrf-token') == 'c'
    held.pop().fulfill(json=batch(mode['day']))
    page.wait_for_function("factPool().filter(f=>f.kind==='source').length===3")
    assert page.evaluate(records) == care
    page.evaluate("()=>{S.factId=factPool().find(f=>f.kind==='source').id;render()}")
    expected = 'Los sonidos' if lang == 'es' else 'Sounds become'
    assert expected in page.locator('.insight h2').inner_text()
    assert page.locator('.insight a').get_attribute('href').startswith('https://www.cdc.gov/')
    # Owner 2026-11-11: "i don't need the title of the source in the section... it just adds space". The link says only Source; the title stays for screen readers.
    word = 'Fuente' if lang == 'es' else 'Source'
    link = page.locator('.insight a')
    assert link.inner_text().strip() == word, link.inner_text()
    assert 'CDC' not in page.locator('.insight').inner_text(), 'the source title is not drawn'
    assert link.get_attribute('aria-label') == f'{word}: CDC', link.get_attribute('aria-label')
    assert link.get_attribute('target') == '_blank' and link.get_attribute('rel') == 'noopener noreferrer'
    page.evaluate("()=>{S.factId=factPool().find(f=>f.kind==='record').id;render()}")
    assert page.locator('.insight a').count() == 0, 'a fact with no source shows no Source link'
    page.evaluate("()=>{S.factId=factPool().find(f=>f.kind==='source').id;render()}")
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not page.errors, page.errors
    SHOTS.mkdir(exist_ok=True)
    page.screenshot(path=str(SHOTS / f'{width}-{lang}.png'), full_page=True)

    page.evaluate("async()=>{for(let i=0;i<3;i++){render();await syncFamily();}}")
    assert len(calls) == 1, 'polls must reuse the daily batch'
    page.evaluate("()=>{S.lang=S.lang==='en'?'es':'en';render()}")
    assert len(calls) == 1, 'changing language must not request another batch'

    mode['day'] = '2026-11-11'
    page.clock.set_fixed_time(AT + timedelta(minutes=2))
    page.evaluate('()=>{void syncFamily()}')
    page.wait_for_timeout(100)
    assert len(held) == 1, 'midnight must request a new daily batch'
    # Until the new batch arrives, yesterday's facts stay as earlier-day facts (card mix, 2026-11-19); none is dated today.
    # every() is true for an empty list, so the count is checked too (review r1).
    assert page.evaluate("factPool().filter(f=>f.kind==='source').length") == 3, 'yesterday\'s facts stay until the new set arrives'
    assert page.evaluate("factPool().filter(f=>f.kind==='source').every(f=>f.id.includes('2026-11-10'))"), 'yesterday is not today'
    held.pop().fulfill(json=batch(mode['day']))
    page.wait_for_function("factPool().filter(f=>f.kind==='source').every(f=>f.id.includes('2026-11-11')) && factPool().some(f=>f.kind==='source')")

    # Review r1 (2026-11-20): a slow new day answers 'pending' with the stored cards, and Home asks again after 1 minute.
    mode['hold'], mode['day'], mode['status'] = False, '2026-11-12', 'pending'
    at = AT + timedelta(days=1, minutes=2)
    page.clock.set_fixed_time(at)
    page.evaluate('()=>{void syncFamily()}')
    page.wait_for_function("S.developmentBatch?.status==='pending' && factPool().filter(f=>f.kind==='source').length===3")
    page.evaluate("()=>{S.factId=factPool().filter(f=>f.kind==='source')[1].id;render()}")
    shown = page.evaluate('S.factId')
    count = len(calls)
    page.clock.set_fixed_time(at + timedelta(minutes=1, seconds=1))
    page.evaluate('async()=>{await syncFamily();}')
    # `until` is Infinity while the request is in flight: wait for the finite value that the reply or the failure sets.
    page.wait_for_function(f"Number.isFinite(S.developmentAttempt.until)&&S.developmentAttempt.until>{int((at + timedelta(minutes=2)).timestamp() * 1000)}")
    assert len(calls) == count + 1, 'a pending reply is asked again after 1 minute'
    assert page.evaluate('S.factId') == shown, 'a retry with the same cards keeps the shown card'
    # The next retry fails on the network: the loaded cards stay, and the next try waits 15 minutes.
    mode['abort'] = True
    at += timedelta(minutes=2, seconds=2)
    page.clock.set_fixed_time(at)
    page.evaluate('async()=>{await syncFamily();}')
    page.wait_for_function(f"Number.isFinite(S.developmentAttempt.until)&&S.developmentAttempt.until>{int((at + timedelta(minutes=14)).timestamp() * 1000)}")
    assert len(calls) == count + 2
    assert page.evaluate("factPool().filter(f=>f.kind==='source').length") == 3, 'a failed retry keeps the loaded facts on Home'
    page.clock.set_fixed_time(at + timedelta(minutes=5))
    page.evaluate('async()=>{await syncFamily();}')
    assert len(calls) == count + 2, 'a failed retry waits 15 minutes'
    mode['abort'], mode['status'] = False, 'ready'

    mode['hold'], mode['fail'], mode['day'] = False, True, '2026-11-12'
    page.clock.set_fixed_time(AT + timedelta(days=2))
    page.evaluate('()=>{void syncFamily()}')
    page.wait_for_function("S.developmentBatch?.status==='unavailable'")
    assert page.evaluate("factPool().filter(f=>f.kind==='record').length") > 0
    assert not page.evaluate("factPool().some(f=>f.kind==='source')")
    count = len(calls)
    page.evaluate('async()=>{await syncFamily();await syncFamily();}')
    assert len(calls) == count, 'failure must not request AI on every poll'
    page.st['permissions']['resources']['children']['view'] = False
    page.clock.set_fixed_time(AT + timedelta(days=2, minutes=2))
    page.evaluate('()=>{void syncFamily()}')
    page.wait_for_timeout(100)
    assert len(calls) == count, 'denied child access must not request facts'
    assert not page.errors, page.errors
    page.context.close()
    print(f'PASS {width}px {lang}: loading, three facts, source link, care preservation, polling, language, midnight, failure, permission')


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for width in (390, 1440, 2000):
                    for lang in ('en', 'es'):
                        audit(browser, base, width, lang)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
