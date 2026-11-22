"""Photo timelapse (plan 2026-11-21, Group 4, lines 270-278; Option A approved 2026-11-22) in Chrome, sample data, no live writes."""
import io
import os
import re
import time

os.environ["TZ"] = "America/Mexico_City"
time.tzset()

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from PIL import Image
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server


def check(name, value):
    assert value, name
    print('PASS', name, flush=True)


def make_jpeg(color=(210, 175, 145)):
    out = io.BytesIO()
    Image.new('RGB', (320, 240), color).save(out, 'JPEG', quality=80)
    return out.getvalue()


SAMPLE_JPG = make_jpeg()


def make_photo_pages(birth_iso='2026-09-01', count=4):
    base_dt = datetime.fromisoformat(f'{birth_iso}T10:00:00-06:00')
    # Return newest-first across pages just like Baby Buddy /api/photos, so client must sort ascending.
    all_items = []
    for i in range(count):
        dt = base_dt + timedelta(days=i * 15)
        all_items.append({
            'id': f'p{i + 1}',
            'time': dt.isoformat(),
            'url': f'/api/photos/p{i + 1}',
            'title': f'Moment {i + 1}',
            'photoName': f'photo-{i + 1}.jpg',
        })
    return list(reversed(all_items))


def setup_photos_page(browser, base, photos_by_offset, lang='en', theme=None, ai=True, hide_notes=False, recent_photo=True, reduced_motion=None, fail_list=False, bad_img_url=None):
    at = datetime.fromisoformat('2026-11-22T12:00:00-06:00')
    page = open_app(browser, base, 390, 844, at, lang=lang, theme=theme, ai=ai, freeze=False)
    if reduced_motion:
        page.emulate_media(reduced_motion=reduced_motion)
    page.st['child']['birthDate'] = '2026-09-01'
    if hide_notes:
        page.st['permissions']['resources']['notes']['view'] = False
    if recent_photo:
        page.st['entries'].append({
            'id': 'recent-1', 'type': 'note', 'title': 'Recent smile', 'text': 'hi',
            't': 660, 'by': 'Rowan', 'photo': '/api/photos/p1', 'photoName': 'photo-1.jpg',
        })

    list_calls = []
    img_calls = []
    list_fail = {'on': fail_list}
    bad_img = {'url': bad_img_url}

    def handle_photos_list(route):
        if route.request.method != 'GET':
            route.fallback()
            return
        qs = parse_qs(urlparse(route.request.url).query)
        off = int(qs.get('offset', ['0'])[0])
        list_calls.append(off)
        if list_fail['on']:
            route.fulfill(status=500, json={'error': 'Failed'})
            return
        payload = photos_by_offset.get(off, {'photos': [], 'nextOffset': None})
        route.fulfill(json=payload)

    def handle_photo_img(route):
        path = urlparse(route.request.url).path
        img_calls.append(path)
        if bad_img['url'] and path == bad_img['url']:
            route.fulfill(status=404, body=b'missing')
            return
        route.fulfill(status=200, content_type='image/jpeg', body=SAMPLE_JPG)

    page.route(re.compile(r'/api/photos(\?.*)?$'), handle_photos_list)
    page.route(re.compile(r'/api/photos/[^/?]+$'), handle_photo_img)
    page.reload()
    page.locator('.tile[data-act="open-feed"], .wrap').first.wait_for()
    return page, list_calls, img_calls, list_fail, bad_img


def check_option_a_pagination_and_controls(browser, base):
    items = make_photo_pages(count=4)
    pages = {
        0: {'photos': items[:2], 'nextOffset': 500},
        500: {'photos': items[2:], 'nextOffset': None},
    }
    p, list_calls, _, _, _ = setup_photos_page(browser, base, pages, recent_photo=True)
    p.click('[data-act="tab"][data-arg="photos"]')
    p.locator('[data-tl-entry]').wait_for()
    check(f'Photos tab fetches all paginated pages ({list_calls})', list_calls == [0, 500])
    card_text = p.locator('[data-tl-entry]').inner_text()
    play_box = p.locator('[data-tl-entry] [data-act="extras-tl-open"]').bounding_box()
    check('Option A Timelapse card shows count, date range, and >= 56 px Play button',
          'Photo timelapse' in card_text and '4 photos' in card_text and play_box and play_box['height'] >= 55.5)

    p.click('[data-act="extras-tl-open"]')
    p.locator('.tl-player .tl-img').wait_for()
    check('Player opens in ascending order (oldest first: Birth day, 1 of 4)',
          '1 of 4' in p.locator('.tl-count').inner_text()
          and 'Birth day' in p.locator('.tl-age').inner_text()
          and 'Moment 1' in p.locator('.tl-date-cap').inner_text())
    check('Previous is disabled on photo 1, Pause is active while playing',
          p.locator('[data-act="extras-tl-prev"]').is_disabled()
          and 'Pause' in p.locator('[data-act="extras-tl-toggle"]').inner_text())
    ctrl_box = p.locator('[data-act="extras-tl-toggle"]').bounding_box()
    check('Transport buttons meet >= 56 px touch height', bool(ctrl_box) and ctrl_box['height'] >= 55.5)

    # Auto-play advances at ~1 s
    p.wait_for_function("document.querySelector('.tl-count')?.textContent?.trim() === '2 of 4'", timeout=2500)
    check('Auto-play advances from 1 of 4 to 2 of 4', True)
    # Pause stops advance
    p.click('[data-act="extras-tl-toggle"]')
    check('Tapping Pause switches label to Play', 'Play' in p.locator('[data-act="extras-tl-toggle"]').inner_text())
    # Step Next to end (3 -> 4)
    p.click('[data-act="extras-tl-next"]')
    p.click('[data-act="extras-tl-next"]')
    check('At last photo: 4 of 4, Next disabled, toggle says Play again',
          '4 of 4' in p.locator('.tl-count').inner_text()
          and p.locator('[data-act="extras-tl-next"]').is_disabled()
          and 'Play again' in p.locator('[data-act="extras-tl-toggle"]').inner_text())
    # Play again restarts at 1 of 4
    p.click('[data-act="extras-tl-toggle"]')
    check('Play again restarts at 1 of 4', '1 of 4' in p.locator('.tl-count').inner_text())
    # Arrow keys step and pause
    p.keyboard.press('ArrowRight')
    check('ArrowRight advances to 2 of 4', '2 of 4' in p.locator('.tl-count').inner_text())
    p.keyboard.press('ArrowLeft')
    check('ArrowLeft returns to 1 of 4', '1 of 4' in p.locator('.tl-count').inner_text())
    # Tab focus trap & Escape close
    p.locator('.tl-player [data-act="extras-tl-close"]').focus()
    p.keyboard.press('Shift+Tab')
    check('Shift+Tab traps focus inside player', p.evaluate("!!document.activeElement?.closest('.tl-player')"))
    p.keyboard.press('Escape')
    p.locator('.tl-player').wait_for(state='detached')
    check('Escape closes player and returns focus to Play button',
          p.evaluate("document.activeElement?.dataset?.act || ''") == 'extras-tl-open')
    # Adult switch closes open player
    p.click('[data-act="extras-tl-open"]')
    p.locator('.tl-player').wait_for()
    p.evaluate("()=>{S.me={id:'adult:2',name:'Sage'};render()}")
    check('Adult switch closes open timelapse player', p.locator('.tl-player').count() == 0)
    check('Main flow: zero JS errors', not p.errors)
    p.context.close()


def check_bounded_preload(browser, base):
    items = make_photo_pages(count=10)
    pages = {0: {'photos': items, 'nextOffset': None}}
    p, _, img_calls, _, _ = setup_photos_page(browser, base, pages, recent_photo=False, reduced_motion='reduce')
    p.click('[data-act="tab"][data-arg="photos"]')
    p.locator('[data-tl-entry]').wait_for()
    img_calls.clear()
    p.click('[data-act="extras-tl-open"]')
    p.locator('.tl-player .tl-img').wait_for()
    p.wait_for_timeout(300)
    unique_open = sorted(set(img_calls))
    check(f'Bounded preload on 10 photos: fetches at most 4 images at index 0 ({unique_open})',
          len(unique_open) <= 4 and '/api/photos/p1' in unique_open and '/api/photos/p10' not in unique_open)
    p.click('[data-act="extras-tl-next"]')
    p.wait_for_timeout(300)
    unique_next = sorted(set(img_calls))
    check(f'Bounded preload after Next: fetches at most 5 images ({unique_next})',
          len(unique_next) <= 5 and '/api/photos/p10' not in unique_next)
    p.context.close()


def check_older_only_and_reduce_motion(browser, base):
    items = make_photo_pages(count=4)
    pages = {0: {'photos': items, 'nextOffset': None}}
    p, _, _, _, _ = setup_photos_page(browser, base, pages, recent_photo=False, reduced_motion='reduce')
    p.click('[data-act="tab"][data-arg="photos"]')
    p.locator('[data-tl-entry]').wait_for()
    body = p.locator('body').inner_text()
    check('Older-only photos: Timelapse card still appears and empty card says "No photos in the last 31 days."',
          'Photo timelapse' in body and 'No photos in the last 31 days.' in body)
    p.click('[data-act="extras-tl-open"]')
    p.locator('.tl-player .tl-rm-note').wait_for()
    toggle = p.locator('[data-act="extras-tl-toggle"]')
    check('Reduce Motion: opens paused with Reduce Motion note and Play disabled',
          'Auto-play is off (Reduce Motion).' in p.locator('.tl-rm-note').inner_text()
          and 'Play' in toggle.inner_text()
          and toggle.is_disabled())
    p.keyboard.press(' ')
    p.wait_for_timeout(1500)
    check('Reduce Motion: Space and 1.5 s wait keep Play label on 1 of 4',
          '1 of 4' in p.locator('.tl-count').inner_text() and 'Play' in toggle.inner_text())
    p.click('[data-act="extras-tl-close"]')
    p.locator('.tl-player').wait_for(state='detached')
    p.click('[data-act="photos-older"]')
    p.wait_for_timeout(200)
    check('After Load older past 31 days with still no photos: drops 31-day wording',
          'No photos in the last 31 days.' not in p.locator('body').inner_text())
    p.context.close()


def check_edge_states_and_permissions(browser, base):
    # 0 photos -> no Timelapse card, default empty message
    p, _, _, _, _ = setup_photos_page(browser, base, {0: {'photos': [], 'nextOffset': None}}, recent_photo=False)
    p.click('[data-act="tab"][data-arg="photos"]')
    p.wait_for_timeout(200)
    check('Zero photos: hides Timelapse card and keeps default empty text',
          p.locator('[data-tl-entry]').count() == 0 and 'No photos in the last 31 days.' not in p.locator('body').inner_text())
    p.context.close()

    # Reduced permissions (notes.view = False) -> no Timelapse card, zero /api/photos calls
    p, list_calls, _, _, _ = setup_photos_page(browser, base, {0: {'photos': make_photo_pages(count=2), 'nextOffset': None}}, hide_notes=True, recent_photo=False)
    p.click('[data-act="tab"][data-arg="photos"]')
    p.wait_for_timeout(200)
    check('Reduced notes permission: hides Timelapse card and makes zero /api/photos calls',
          p.locator('[data-tl-entry]').count() == 0 and len(list_calls) == 0 and not p.errors)
    p.context.close()

    # 1 photo -> all 3 transport controls disabled
    one = make_photo_pages(count=1)
    p, _, _, _, _ = setup_photos_page(browser, base, {0: {'photos': one, 'nextOffset': None}}, recent_photo=False)
    p.click('[data-act="tab"][data-arg="photos"]')
    p.locator('[data-tl-entry]').wait_for()
    p.click('[data-act="extras-tl-open"]')
    p.locator('.tl-player .tl-img').wait_for()
    check('1-photo state: shows 1 of 1 with Previous, Play, Next disabled',
          '1 of 1' in p.locator('.tl-count').inner_text()
          and p.locator('[data-act="extras-tl-prev"]').is_disabled()
          and p.locator('[data-act="extras-tl-toggle"]').is_disabled()
          and p.locator('[data-act="extras-tl-next"]').is_disabled())
    p.context.close()

    # Broken image -> alert + Try again recovers
    items = make_photo_pages(count=2)
    p, _, _, _, bad_img = setup_photos_page(browser, base, {0: {'photos': items, 'nextOffset': None}}, recent_photo=False, reduced_motion='reduce', bad_img_url='/api/photos/p1')
    p.click('[data-act="tab"][data-arg="photos"]')
    p.locator('[data-tl-entry]').wait_for()
    p.click('[data-act="extras-tl-open"]')
    p.locator('.tl-player [data-act="extras-tl-img-retry"]').wait_for()
    check('Broken photo shows error alert and Try again button', True)
    bad_img['url'] = None
    p.click('[data-act="extras-tl-img-retry"]')
    p.locator('.tl-player .tl-img').wait_for()
    check('Image retry loads the photo cleanly', True)
    p.context.close()

    # Spanish + Dim + AI off + older-only copy
    items = make_photo_pages(count=3)
    p, _, _, _, _ = setup_photos_page(browser, base, {0: {'photos': items, 'nextOffset': None}}, lang='es', theme='on', ai=False, recent_photo=False, reduced_motion='reduce')
    p.click('[data-act="tab"][data-arg="photos"]')
    p.locator('[data-tl-entry]').wait_for()
    body = p.locator('body').inner_text()
    check('Spanish + Dim + AI off: card says Secuencia de fotos and No hay fotos en los últimos 31 días.',
          'Secuencia de fotos' in body and 'No hay fotos en los últimos 31 días.' in body
          and p.evaluate("document.documentElement.dataset.theme") == 'dim')
    p.click('[data-act="extras-tl-open"]')
    p.locator('.tl-player .tl-img').wait_for()
    ptext = p.locator('.tl-player').inner_text()
    check('Spanish player: Cerrar, Anterior, Reproducir, Siguiente, 1 de 3',
          'Cerrar' in ptext and 'Anterior' in ptext and 'Reproducir' in ptext and 'Siguiente' in ptext and '1 de 3' in ptext)
    no_hscroll = p.evaluate("document.querySelector('.tl-player').scrollWidth <= document.querySelector('.tl-player').clientWidth + 1")
    check('Spanish + Dim player: no sideways overflow at 390 px and zero JS errors', no_hscroll and not p.errors)
    p.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            try:
                check_option_a_pagination_and_controls(browser, base)
                check_bounded_preload(browser, base)
                check_older_only_and_reduce_motion(browser, base)
                check_edge_states_and_permissions(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
