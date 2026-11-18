"""Synthetic Chrome checks for mixed feeds and one-tap sleep stop. No family writes."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import shutil
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from forms_support import stop_click
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T12:00:00-06:00')
SHOTS = Path('/tmp/little-days-mixed-feeds-after')


def click(page, action, arg=None):
    selector = f'[data-act="{action}"]' + (f'[data-arg="{arg}"]' if arg else '')
    inside = page.locator('[data-sheet] ' + selector)
    (inside if inside.count() else page.locator(selector)).first.click()


def capture(page, label):
    page.screenshot(path=str(SHOTS / f'{label}.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), label + ': overflow'
    assert not page.errors, page.errors
    targets = page.locator('[data-sheet] [data-act="switch"],[data-sheet] [data-act="stop"],.sleep-stop')
    assert all(box['height'] >= 44 for box in targets.evaluate_all('els=>els.map(e=>({height:e.getBoundingClientRect().height}))'))


def flow(browser, base, width, height, lang):
    page = open_app(browser, base, width, height, AT, lang=lang, theme='on' if lang == 'es' else 'off')
    page.set_default_timeout(5000)
    page.st['entries'] = []
    page.now = 720
    calls = []

    def timers(route):
        body = route.request.post_data_json
        path = urlparse(route.request.url).path
        calls.append((path, body))
        if path == '/api/timers':
            page.st['run'] = {'id':'1','kind':'feed','side':body['side'],'t0':page.now,'by':'Rowan','sid':body['operationId']}
        elif path.endswith('/stop') and page.st.get('sleepRun') and '/sleep-' in path:
            page.st['sleepRun'] = None
        else:
            run = page.st['run']
            entry = {'id':f'feedings:{len(calls)}','sid':run['sid'],'t':run['t0'],'dur':page.now-run['t0'],'by':'Rowan'}
            if run['side'] == 'bottle':
                entry.update(type='bottle', **body['amounts'])
            else:
                entry.update(type='feed', side=run['side'])
            page.st['entries'].append(entry)
            page.st['run'] = {**run,'id':str(len(calls)),'side':body['side'],'t0':page.now} if path.endswith('/switch') else None
        route.fulfill(json={'status':'saved','operationId':body['operationId'],'state':page.st})

    page.route('**/api/timers', timers)
    page.route('**/api/timers/*/*', timers)
    page.reload()
    label = f'{lang}-{width}'
    for owner in ('Rowan','Sage'):
        page.st['sleepRun'] = {'id':f'sleep-{owner}','kind':'sleep','t0':600,'by':owner}
        page.reload()
        before = len(calls)
        click(page, 'stop-sleep')
        click(page, 'stop-go')  # Home's Stop asks once, through the shared confirm
        page.wait_for_function('S.sleepRun === null')
        assert len(calls) == before + 1 and calls[-1][1]['confirmOther'] is True
        assert page.locator('[data-sheet]').count() == 0
    capture(page, label + '-sleep-stopped')
    print('PASS', label, 'Stop sleep sends one request for either adult; no Change screen', flush=True)

    click(page, 'open-feed')
    click(page, 'ftab', 'bottle')
    capture(page, label + '-bottle-start')
    click(page, 'start', 'bottle')
    page.wait_for_function("S.run?.side === 'bottle'")
    for minutes, target, amount in [(5,'L',60),(10,'R',None),(15,'bottle',None),(5,None,30)]:
        page.now += minutes
        page.clock.set_fixed_time(AT + timedelta(minutes=page.now-720))
        page.reload()
        click(page, 'open-feed')
        if amount is not None:
            assert page.locator('[data-sheet] [data-act="stop"]').is_disabled()
            if page.locator('[data-act="milk"][data-arg="breast"]').get_attribute('aria-pressed') != 'true':
                click(page, 'milk', 'breast')
            page.locator('[data-fid="ml"]').fill('invalid')
            assert page.locator('[data-sheet] [data-act="stop"]').is_disabled()
            page.locator('[data-fid="ml"]').fill(str(amount))
            assert page.locator('[data-sheet] [data-act="stop"]').is_enabled()
        capture(page, label + '-' + page.st['run']['side'] + ('-end' if target is None else ''))
        before = len(calls)
        if target:
            click(page, 'switch', target)
            page.wait_for_function('(side)=>S.run?.side===side', arg=target)
        else:
            stop_click(page, '[data-sheet] [data-act="stop"]')
            page.wait_for_function('S.run === null')
        assert len(calls) == before + 1
        if amount is not None:
            assert calls[-1][1]['amounts'] == {'ml':amount,'milk':'breast'}
    result = page.evaluate('LittleDaysTrends.day(S.entries,0)')
    assert result['feedCount'] == 1 and result['bottleMl'] == 90 and result['feeds'][0]['dur'] == 25, result
    assert len(page.st['entries']) == 4
    assert not page.errors, page.errors
    capture(page, label + '-saved')
    print('PASS', label, 'bottle → left → right → bottle; reloads, input validation, 1 feed, 90 ml, 25 breast minutes', flush=True)
    page.context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.dry_run:
        print('Chrome agent launcher; mocked APIs only; mixed-feed and sleep-stop flows; EN/ES; 390/1440/2000 px; screenshots:', SHOTS)
        return
    SHOTS.mkdir(exist_ok=True)
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for lang in ('en','es'):
                    for width,height in ((390,844),(1440,900),(2000,860)):
                        flow(browser, base, width, height, lang)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
