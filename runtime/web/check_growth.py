"""Synthetic Chrome checks for growth saves and birth measurements. No family writes."""
import argparse
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-12T12:00:00-06:00')
SHOTS = Path('/tmp/little-days-growth-feedback')


def flow(browser, base, width, height, lang):
    page = open_app(browser, base, width, height, AT, lang=lang, theme='off')
    page.set_default_timeout(5000)
    page.route('**/*', lambda route: route.fallback() if urlparse(route.request.url).hostname == '127.0.0.1' else route.abort())
    state = page.st
    state['entries'] = []
    history, posts = [], []
    refused = {'on': False}
    page.route('**/api/growth', lambda route: route.fulfill(json={'entries': history, 'unavailable': []}))

    def save(route):
        body = route.request.post_data_json
        posts.append(body)
        if refused['on']:
            return route.fulfill(status=400, json={'error': 'Test: measurement refused'})
        event = body['event']
        for key, resource in [('kg', 'weight'), ('cm', 'height'), ('head', 'head-circumference')]:
            if key not in event:
                continue
            entry = {'id': f'{resource}:{len(history)+1}', 'type': 'growth', key: event[key], 'date': event['date'], 't': 720, 'by': 'Rowan'}
            history.append(entry)
            state['entries'].append(entry)
        route.fulfill(json={'status': 'saved', 'id': history[-1]['id'], 'operationId': body['operationId'], 'state': state})

    page.route('**/api/events', save)
    page.reload()

    def opened():
        page.locator('[data-act="open-more"]').click()
        page.locator('[data-act="open-growth"]').click()

    opened()
    birth = page.locator('[data-act="growth-birth"]')
    page.screenshot(path=str(SHOTS / f'{lang}-{width}-form.png'), full_page=True)
    assert birth.count() == 1, 'Growth needs a Use birth date action'
    birth.click()
    assert page.locator('[data-fid="manualDate"]').input_value() == state['child']['birthDate']
    page.locator('[data-fid="weight"]').fill('3.2')
    page.locator('[data-fid="length"]').fill('50')
    page.locator('[data-fid="head"]').fill('34.5')
    page.screenshot(path=str(SHOTS / f'{lang}-{width}-birth.png'), full_page=True)
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!S.sheet && !S.busy')
    assert len(posts) == 1
    assert posts[0]['event']['date'] == state['child']['birthDate']
    assert {key: posts[0]['event'][key] for key in ('kg', 'cm', 'head')} == {'kg': 3.2, 'cm': 50, 'head': 34.5}

    for reload in (False, True):
        if reload:
            page.reload()
        page.locator('[data-act="tab"][data-arg="charts"]').click()
        page.wait_for_function('S.growthEntries.length === 3 && !S.growthLoading')
        for measure in ('weight', 'length', 'head'):
            page.locator(f'[data-act="growth-measure"][data-arg="{measure}"]').click()
            assert page.locator('[data-chart="growth"] svg').count() == 1
        assert page.locator('[data-chart="growth"]').locator('..').inner_text().find('NaN') == -1
        assert page.evaluate('growthPoints(GROWTH_MEASURES[0])[0].week') == 0
    page.screenshot(path=str(SHOTS / f'{lang}-{width}-chart.png'), full_page=True)
    page.locator('[data-act="tab"][data-arg="home"]').click()

    opened()
    page.locator('[data-fid="weight"]').fill('0')
    assert page.locator('[data-sheet] [data-act="save"]').is_disabled(), 'Zero must not enable a save that does nothing'
    page.locator('[data-fid="weight"]').fill('4.1')
    page.locator('[data-fid="length"]').fill('-1')
    assert page.locator('[data-sheet] [data-act="save"]').is_disabled(), 'Invalid optional measurement must block saving'
    page.locator('[data-fid="length"]').fill('')
    refused['on'] = True
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function("!S.busy && S.message === 'Test: measurement refused'")
    assert len(posts) == 2, 'The refused save must reach the server'
    assert page.locator('[data-fid="weight"]').input_value() == '4.1'
    assert len(history) == 3
    page.screenshot(path=str(SHOTS / f'{lang}-{width}-refused.png'), full_page=True)
    refused['on'] = False
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!S.sheet && !S.busy')
    assert posts[-1]['event']['date'] == '2026-11-12'
    assert len(history) == 4
    assert not page.errors, page.errors
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    print('PASS', lang, width, 'birth measurements, chart after reload, invalid input, refused save and retry', flush=True)
    page.context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.dry_run:
        print('Chrome agent launcher; synthetic growth APIs; EN/ES at 390/1440/2000 px; screenshots:', SHOTS)
        return
    SHOTS.mkdir(exist_ok=True)
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for lang in ('en', 'es'):
                    for width, height in ((390, 844), (1440, 900), (2000, 860)):
                        flow(browser, base, width, height, lang)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
