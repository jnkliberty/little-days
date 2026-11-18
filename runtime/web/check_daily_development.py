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
         'body': ['Babies learn through back-and-forth sounds. Respond when your baby makes a sound.',
                  'Los bebés aprenden al intercambiar sonidos. Responda cuando su bebé haga un sonido.'],
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
        elif mode['fail']:
            route.fulfill(json={'date': mode['day'], 'status': 'unavailable', 'cards': []})
        else:
            route.fulfill(json=batch(mode['day']))

    page.route('**/api/development', development)
    page.reload()
    page.wait_for_function("S.auth==='ready'")
    page.wait_for_function("S.developmentAttempt!==null && S.developmentAttempt!==undefined")
    page.wait_for_timeout(50)
    assert len(held) == 1
    assert page.locator('.tile[data-act=open-feed]').is_visible(), 'AI must not block logging'
    care = page.evaluate("factPool().filter(f=>f.kind==='record')")
    assert care and not page.evaluate("factPool().some(f=>f.kind==='source')"), 'no stale library fallback'
    assert calls[0].method == 'POST' and calls[0].headers.get('x-csrf-token') == 'c'
    held.pop().fulfill(json=batch(mode['day']))
    page.wait_for_function("factPool().filter(f=>f.kind==='source').length===3")
    assert page.evaluate("factPool().filter(f=>f.kind==='record')") == care
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
    assert not page.evaluate("factPool().some(f=>f.kind==='source')"), 'yesterday is not today'
    held.pop().fulfill(json=batch(mode['day']))
    page.wait_for_function("factPool().filter(f=>f.kind==='source').every(f=>f.id.includes('2026-11-11')) && factPool().some(f=>f.kind==='source')")

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
