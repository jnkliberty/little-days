"""Synthetic Chrome checks for photo upload. Invented images and mocked APIs only; no family writes.

Failure cases covered:
  1. The Photos screen "Add photo" button did nothing (no handler for data-act="open-photo").
  2. A file the server refuses (HEIC, wrong type) or the app refuses (too large) must show a message
     in the adult's language, never silence.
  3. A server refusal of a chosen photo (HTTP 415) must show the message in the adult's language.
  4. (Owner, 2026-11-11: "the add photo section still isn't working".) A phone photo over 5 MB, or one the app could not
     send, was refused. The browser now shrinks any photo it can decode to a JPEG of 2048 px or less; the limit is 25 MB for a file
     it cannot decode. Failure cases: a large JPEG refused or posted at full size, a portrait that does not save in Settings,
     a file that cannot be decoded refused below 25 MB, a text file that no longer shows the type message.
  5. The family state refresh (every 15 seconds, and when the other adult saves) redraws the screen. A redraw
     while the phone's photo picker is open replaced the file input, so the chosen photo went to a node that
     was no longer on the page and nothing happened.
"""
import argparse
import io
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T12:00:00-06:00')
SHOTS = Path('/tmp/little-days-photos')
PNG = bytes([137, 80, 78, 71, 13, 10, 26, 10]) + bytes(32)
JPEG = bytes([255, 216, 255, 224]) + bytes(64)
WORDS = {
    'en': {'size': 'Choose an image under 25 MB.', 'type': 'Choose a JPEG, PNG, or WebP photo.'},
    'es': {'size': 'Elija una imagen de menos de 25 MB.', 'type': 'Elija una foto JPEG, PNG o WebP.'},
}
FAILS = []
PREP = {'en': 'Preparing photo', 'es': 'Preparando la foto'}


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def open_photos(browser, base, lang, width=390, height=844):
    page = open_app(browser, base, width, height, AT, lang=lang)
    page.set_default_timeout(4000)
    page.locator('[data-act="tab"][data-arg="photos"]').first.click()
    return page


def sheet_text(page):
    return page.locator('[data-sheet]').inner_text() if page.locator('[data-sheet]').count() else ''


def flow_captions(browser, base, lang):
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    now = page.st['entries'][0]['t'] + 95
    photo = {'photo': '/fixture.jpg', 'photoName': 'fixture.jpg', 'by': 'Rowan'}
    long_note = 'Long photo note <sample> ' * 12 + 'End.'
    entries = [
        {**photo, 'id': 'notes:101', 'type': 'note', 'title': 'Note', 'text': 'Little Days sample photo <caption>', 't': now},
        {**photo, 'id': 'notes:102', 'type': 'other', 'what': 'mile', 'title': 'First smile', 'text': 'Milestone details', 't': now - 1},
        {**photo, 'id': 'notes:103', 'type': 'note', 'what': 'visit', 'title': 'Visit', 'text': 'Provider details', 't': now - 2},
        {**photo, 'id': 'notes:104', 'type': 'note', 'title': '', 'text': '', 't': now - 3},
        {**photo, 'id': 'notes:106', 'type': 'note', 'title': 'Note', 'text': long_note, 't': now - 4},
    ]
    page.st['entries'].extend(entries)
    page.locator('[data-act="tab"][data-arg="photos"]').first.click()
    page.wait_for_function('S.photoFrom !== null')
    for entry, expected in zip(entries, ('Little Days sample photo <caption>', 'First smile', 'Visit', 'fixture.jpg')):
        page.evaluate('(id)=>{S.photoId=id;render()}', entry['id'])
        check(f'{lang}: photo {entry["id"]} has the intended caption', page.locator('.pcap').inner_text() == expected)
    page.evaluate('S.photoId="notes:101";render()')
    check(f'{lang}: the photo image and thumbnail use the caption',
          page.locator('.pbig img').get_attribute('alt') == entries[0]['text'] and
          page.locator('[data-act="photo"][aria-pressed="true"]').get_attribute('aria-label') == entries[0]['text'])
    page.evaluate('S.photoId="notes:106";render()')
    details = page.locator('.pcap details')
    label = page.locator('[data-act="photo"][aria-pressed="true"]').get_attribute('aria-label')
    check(f'{lang}: long notes keep the gallery and thumbnail compact', details.is_visible() and
          not details.evaluate('(el) => el.open') and label.startswith('Foto ' if lang == 'es' else 'Photo ') and
          'Long photo note <sample>' in label and len(label) < len(long_note))
    details.locator('summary').click()
    page.evaluate('render()')
    check(f'{lang}: the complete photo note stays readable after refresh', long_note in details.inner_text() and details.evaluate('(el) => el.open'))
    older = {**photo, 'id': 'notes:105', 'type': 'note', 'title': 'Note', 'text': 'An older photo caption', 't': now - 40 * 1440}
    page.st['entries'].append(older)
    page.locator('[data-act="photos-older"]').click()
    page.wait_for_function('S.entries.some(e=>e.id==="notes:105")')
    page.evaluate('S.photoId="notes:105";render()')
    check(f'{lang}: an older photo keeps its caption after paging', page.locator('.pcap').inner_text() == older['text'])
    page.context.close()


def pick(page, name, mime, data):
    page.locator('[data-sheet] [data-fid="photo"]').set_input_files({'name': name, 'mimeType': mime, 'buffer': data})


def shot(page, label):
    SHOTS.mkdir(exist_ok=True)
    page.screenshot(path=str(SHOTS / f'{label}.png'), full_page=True)


def flow_add_and_save(browser, base, lang):
    page = open_photos(browser, base, lang)
    posts = []

    def photo(route):
        if route.request.method != 'POST':
            route.fallback()
            return
        posts.append((route.request.method, route.request.headers.get('content-type', ''), route.request.post_data_buffer or b''))
        body = route.request.post_data_buffer or b''
        op = body.split(b'name="operationId"\r\n\r\n')[1].split(b'\r\n')[0].decode()
        route.fulfill(json={'status': 'saved', 'operationId': op, 'state': page.st})

    page.route('**/api/photos', photo)
    page.locator('[data-act="open-photo"]').click()
    opened = page.locator('[data-sheet] [data-fid="photo"]').count() == 1
    check(f'{lang}: Add photo on the Photos screen opens the photo sheet', opened)
    if not opened:
        return
    shot(page, f'{lang}-photo-sheet')
    pick(page, 'fixture.png', 'image/png', PNG)
    page.locator('.photo-picker', has_text='fixture.png').wait_for()
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")')
    check(f'{lang}: a chosen PNG uploads once as multipart and the sheet closes',
          len(posts) == 1 and posts[0][0] == 'POST' and posts[0][1].startswith('multipart/form-data; boundary=') and b'fixture.png' in posts[0][2])
    check(f'{lang}: no page error', not page.errors)
    page.context.close()


def other_adult_saves(page):
    """The other adult logs a diaper; the next state refresh redraws the open screen."""
    page.st['entries'].append({'id': 'other-diaper', 'type': 'diaper', 'kind': 'D', 't': 700, 'by': 'Sage'})
    page.evaluate('syncFamily()')
    page.wait_for_function('S.entries.some(e=>e.id==="other-diaper")')
    page.wait_for_timeout(100)


def flow_redraw_during_picker(browser, base, lang):
    page = open_photos(browser, base, lang)
    with page.expect_file_chooser() as chooser_info:
        page.locator('[data-act="open-photo"]').click()
    chooser = chooser_info.value
    other_adult_saves(page)
    chooser.set_files({'name': 'chosen.png', 'mimeType': 'image/png', 'buffer': PNG})
    try:
        page.locator('.photo-picker', has_text='chosen.png').wait_for(timeout=2000)
        shown = True
    except Exception:
        shown = False
    check(f'{lang}: a photo chosen while the screen redraws still appears in the photo sheet', shown)
    shot(page, f'{lang}-redraw-during-picker')
    if shown:
        again = page.locator('[data-sheet] [data-fid="photo"]').evaluate('el=>el.value')
        check(f'{lang}: the picker is cleared after a pick, so the same photo can be chosen again', again == '')
    page.context.close()


def flow_portrait_redraw(browser, base, lang):
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(4000)
    page.locator('[data-act="open-settings"]').click()  # The baby photo moved into Settings (R3).
    if not page.locator('.portrait-file').count():
        check(f'{lang}: portrait picker is in Settings', False)
        return
    with page.expect_file_chooser() as chooser_info:
        page.locator('.portrait-file').click()
    other_adult_saves(page)
    chooser_info.value.set_files({'name': 'portrait.png', 'mimeType': 'image/png', 'buffer': PNG})
    try:
        page.locator('.portrait-name', has_text='portrait.png').wait_for(timeout=2000)
        shown = True
    except Exception:
        shown = False
    check(f'{lang}: a portrait chosen while the screen redraws still appears', shown)
    page.context.close()


def flow_refused_files(browser, base, lang):
    page = open_photos(browser, base, lang)
    posts = []
    page.route('**/api/photos', lambda route: (posts.append(1), route.abort()))
    page.locator('[data-act="open-photo"]').click()
    if not page.locator('[data-sheet] [data-fid="photo"]').count():
        check(f'{lang}: photo sheet exists for refused-file checks', False)
        return
    # Limit change by owner decision (2026-11-11): 5 MB became 25 MB, for a file the browser cannot shrink.
    pick(page, 'large.jpg', 'image/jpeg', JPEG + bytes(25 * 1024 * 1024))
    page.locator('[data-sheet] [role="alert"]').first.wait_for()
    check(f'{lang}: a file over 25 MB shows the size message in the adult language', WORDS[lang]['size'] in sheet_text(page))
    pick(page, 'notes.txt', 'text/plain', b'not a picture')
    page.wait_for_function('(w)=>document.querySelector("[data-sheet]")?.innerText.includes(w)', arg=WORDS[lang]['type'])
    check(f'{lang}: a text file still shows the file-type message', WORDS[lang]['type'] in sheet_text(page))
    pick(page, 'IMG_0001.HEIC', 'image/heic', bytes(2048))
    page.wait_for_function('(w)=>document.querySelector("[data-sheet]")?.innerText.includes(w)', arg=WORDS[lang]['type'])
    check(f'{lang}: a HEIC file shows the file-type message in the adult language', WORDS[lang]['type'] in sheet_text(page))
    shot(page, f'{lang}-heic-refused')
    box = page.locator('[data-sheet] .photo-error').bounding_box()
    check(f'{lang}: the file message sits next to the picker, inside the 390 x 844 screen', bool(box) and box['y'] + box['height'] <= 844)
    check(f'{lang}: a refused file is never sent', not posts)
    page.context.close()


def flow_server_refusal(browser, base, lang):
    page = open_photos(browser, base, lang)
    page.route('**/api/photos', lambda route: route.fulfill(status=415, json={'error': 'Choose a JPEG, PNG, or WebP photo.'}))
    page.locator('[data-act="open-photo"]').click()
    if not page.locator('[data-sheet] [data-fid="photo"]').count():
        check(f'{lang}: photo sheet exists for server-refusal check', False)
        return
    pick(page, 'fixture.jpg', 'image/jpeg', JPEG)
    page.locator('.photo-picker', has_text='fixture.jpg').wait_for()
    page.locator('[data-sheet] [data-act="save"]').click()
    page.locator('[data-sheet] [data-status][role="alert"]').wait_for()
    check(f'{lang}: a server refusal of the photo shows the message in the adult language', WORDS[lang]['type'] in sheet_text(page))
    shot(page, f'{lang}-server-refusal')
    page.context.close()


def flow_portrait(browser, base, lang):
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(4000)
    page.locator('[data-act="open-settings"]').click()  # The baby photo moved into Settings (R3).
    if not page.locator('.portrait-file').count():
        check(f'{lang}: portrait picker is in Settings', False)
        return
    page.locator('.portrait-file').set_input_files({'name': 'IMG_0002.heic', 'mimeType': 'image/heic', 'buffer': bytes(2048)})
    page.locator('[role="alert"]', has_text=WORDS[lang]['type']).wait_for()
    check(f'{lang}: a HEIC portrait shows the file-type message, not the size message', True)
    page.context.close()


def noise_jpeg(width, height):
    """A phone-sized photo: random pixels do not compress, so 4032 x 3024 is about 14 MB as a JPEG."""
    out = io.BytesIO()
    Image.frombytes('RGB', (width, height), os.urandom(width * height * 3)).save(out, 'JPEG', quality=95)
    return out.getvalue()


def posted_parts(buffer, content_type):
    """The multipart fields of a request body: {name: (header, data)}."""
    boundary = content_type.split('boundary=')[1].encode()
    parts = {}
    for part in buffer.split(b'--' + boundary)[1:-1]:
        header, _, data = part.lstrip(b'\r\n').partition(b'\r\n\r\n')
        match = re.search(rb'name="([^"]+)"', header)
        parts[match.group(1).decode()] = (header.decode('latin1'), data.rsplit(b'\r\n', 1)[0])
    return parts


def capture(page, pattern, posts):
    def handler(route):
        if route.request.method == 'GET':
            route.fallback()
            return
        body = route.request.post_data_buffer or b''
        posts.append((route.request.method, route.request.headers.get('content-type', ''), body))
        op = posted_parts(body, route.request.headers['content-type'])['operationId'][1].decode()
        route.fulfill(json={'status': 'saved', 'operationId': op, 'state': page.st})
    page.route(pattern, handler)


def sent_jpeg_ok(posts, label, lang, fields):
    parts = posted_parts(posts[0][2], posts[0][1]) if posts else {}
    header, data = parts.get('file', ('', b''))
    size = Image.open(io.BytesIO(data)).size if data[:3] == bytes([255, 216, 255]) else None
    ok = bool(posts) and data[:3] == bytes([255, 216, 255]) and 'image/jpeg' in header and len(data) < 5 * 1024 * 1024 and size and max(size) <= 2048 and size[0] > size[1]
    check(f'{lang}: {label}: the posted file is a JPEG under 5 MB, 2048 px or less on the long side ({len(data)} bytes, {size})', bool(ok))
    check(f'{lang}: {label}: the multipart field names are unchanged ({sorted(parts)})', sorted(parts) == sorted(fields))


def flow_big_photo_note(browser, base, lang):
    """Failure case: a 14 MB phone JPEG refused with the size message, or posted at full size."""
    page = open_photos(browser, base, lang)
    posts = []
    capture(page, '**/api/photos', posts)
    page.locator('[data-act="open-photo"]').click()
    pick(page, 'IMG_4021.jpg', 'image/jpeg', noise_jpeg(4032, 3024))
    page.locator('.photo-picker', has_text='IMG_4021.jpg').wait_for(timeout=15000)
    check(f'{lang}: a JPEG over 5 MB is accepted: no size message, the name shows', page.locator('[data-sheet] .photo-error').count() == 0)
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")')
    check(f'{lang}: the large photo uploads once', len(posts) == 1 and posts[0][0] == 'POST')
    sent_jpeg_ok(posts, 'note photo', lang, ['event', 'file', 'operationId'])
    page.context.close()


def flow_big_photo_portrait(browser, base, lang):
    """Failure case: the portrait in Settings refuses a phone photo, or does not save."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(15000)
    posts = []
    capture(page, '**/api/child/portrait', posts)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'IMG_4022.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(4032, 3024)})
    # The pick saves itself (owner, 2026-11-19); there is no Save tap.
    wait_puts(page, posts, 1)
    page.wait_for_function('!S.portraitDraft && !S.busy')
    check(f'{lang}: a portrait over 5 MB is accepted with no message and no Save button', page.locator('[role="alert"]').count() == 0 and page.locator('[data-act="portrait-save"]').count() == 0)
    check(f'{lang}: the portrait saves with one PUT and a saved message', len(posts) == 1 and posts[0][0] == 'PUT' and any('Portrait saved' in t or 'Foto guardada' in t or 'guard' in t for t in page.locator('[role="status"]').all_inner_texts()))
    sent_jpeg_ok(posts, 'portrait', lang, ['file', 'operationId'])
    page.context.close()


def flow_img_fallback(browser, base, lang):
    """Failure case: a browser without createImageBitmap sends the photo at full size, or refuses it."""
    page = open_photos(browser, base, lang)
    page.evaluate('window.createImageBitmap = undefined')
    posts = []
    capture(page, '**/api/photos', posts)
    page.locator('[data-act="open-photo"]').click()
    pick(page, 'IMG_4023.jpg', 'image/jpeg', noise_jpeg(4032, 3024))
    page.locator('.photo-picker', has_text='IMG_4023.jpg').wait_for(timeout=15000)
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")')
    sent_jpeg_ok(posts, 'no createImageBitmap, <img> decode', lang, ['event', 'file', 'operationId'])
    page.context.close()


DELAY = """() => { const real = window.shrinkPhoto; window.__calls = 0; window.shrinkPhoto = async file => { const n = ++window.__calls; await new Promise(done => setTimeout(done, n === 1 && window.__firstSlow ? 900 : 500)); return real(file); }; }"""


def flow_busy_note(browser, base, lang):
    """R1-1 (Codex): Save stayed enabled while a picked photo was still shrinking, so a note with text saved without the photo and the photo was lost.
    Failure case: a post during the shrink, Save enabled during it, no status text, or a post after it that lacks the photo."""
    page = open_photos(browser, base, lang)
    page.evaluate(DELAY)
    posts = []
    capture(page, '**/api/photos', posts)
    page.locator('[data-act="open-photo"]').click()
    page.locator('[data-fid="note"]').fill('First smile')
    pick(page, 'IMG_5001.jpg', 'image/jpeg', noise_jpeg(1200, 900))
    page.get_by_text(PREP[lang]).wait_for(timeout=2000)
    save = page.locator('[data-sheet] [data-act="save"]')
    check(f'{lang}: while the photo is prepared, Save is disabled and a status says why', save.is_disabled() and PREP[lang] in sheet_text(page))
    page.evaluate('save()')
    page.wait_for_timeout(100)
    check(f'{lang}: a save call during the shrink posts nothing and keeps the sheet', not posts and page.locator('[data-sheet]').count() == 1)
    page.evaluate("Object.defineProperty(document, 'hidden', {value: true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide'))")
    page.evaluate('save()')
    page.wait_for_timeout(100)
    check(f'{lang}: hiding the page mid-shrink keeps the busy mark, Save off, and a save call posts nothing (the read is still running)', page.evaluate('S.photoBusy') is True and save.is_disabled() and not posts and page.locator('[data-sheet]').count() == 1)
    page.evaluate("delete document.hidden")
    page.wait_for_function('S.photoBusy === false', timeout=4000)
    page.locator('.photo-picker', has_text='IMG_5001.jpg').wait_for()
    check(f'{lang}: after the shrink Save is enabled and the status is gone', save.is_enabled() and PREP[lang] not in sheet_text(page))
    save.click()
    page.wait_for_function('!document.querySelector("[data-sheet]")')
    parts = posted_parts(posts[0][2], posts[0][1]) if posts else {}
    check(f'{lang}: the note posts once, with the photo', len(posts) == 1 and parts.get('file', ('', b''))[1][:3] == bytes([255, 216, 255]))
    page.context.close()


def flow_busy_portrait(browser, base, lang):
    """R1-1, now with the automatic save (owner, 2026-11-19): two quick portrait picks while the first still shrinks.
    Failure case: anything posts during the shrink, the first pick is posted, or both are."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    posts = []
    capture(page, '**/api/child/portrait', posts)
    page.locator('[data-act="open-settings"]').click()
    page.evaluate('window.__firstSlow = true')
    page.evaluate(DELAY)
    page.locator('.portrait-file').set_input_files({'name': 'first.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(800, 600)})
    page.get_by_text(PREP[lang]).wait_for(timeout=2000)
    page.locator('.portrait-file').set_input_files({'name': 'second.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1000, 700)})
    check(f'{lang}: while a portrait is prepared, a status says why, nothing posts and there is no Save button',
          PREP[lang] in page.locator('body').inner_text() and not posts and page.locator('[data-act="portrait-save"]').count() == 0)
    page.wait_for_timeout(1200)  # the first, slower shrink ends after the second and must be dropped
    page.wait_for_function('!S.portraitDraft && !S.busy')
    parts = posted_parts(posts[0][2], posts[0][1]) if posts else {}
    size = Image.open(io.BytesIO(parts['file'][1])).size if parts else None
    check(f'{lang}: the portrait posts once, the second pick, after the shrink ({len(posts)} PUT, {size})', len(posts) == 1 and size == (1000, 700))
    page.context.close()


def flow_two_picks(browser, base, lang):
    """R1-1: two quick picks while the first still shrinks. Failure case: the first pick wins or both show."""
    page = open_photos(browser, base, lang)
    page.evaluate('window.__firstSlow = true')
    page.evaluate(DELAY)
    posts = []
    capture(page, '**/api/photos', posts)
    page.locator('[data-act="open-photo"]').click()
    pick(page, 'first.jpg', 'image/jpeg', noise_jpeg(1600, 1200))
    page.wait_for_function('S.photoBusy === true', timeout=2000)
    pick(page, 'second.jpg', 'image/jpeg', noise_jpeg(1000, 800))
    page.locator('.photo-picker', has_text='second.jpg').wait_for(timeout=4000)
    page.wait_for_timeout(1200)  # the first, slower shrink finishes after the second and must be dropped
    check(f'{lang}: with two quick picks only the last one is shown ({page.locator(".photo-picker").inner_text()!r})', 'first.jpg' not in sheet_text(page) and 'second.jpg' in sheet_text(page) and page.evaluate('S.photoBusy') is False)
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")')
    parts = posted_parts(posts[0][2], posts[0][1]) if posts else {}
    size = Image.open(io.BytesIO(parts['file'][1])).size if parts else None
    check(f'{lang}: the posted file is the second pick ({size})', len(posts) == 1 and size == (1000, 800))
    page.context.close()


HANG = "() => { window.shrinkPhoto = () => new Promise(() => {}); }"


def flow_stuck_shrink(browser, base, lang):
    """Owner 2026-11-11: Save stayed off after a photo pick. A shrink that never ends must not keep Save off.
    Failure case: S.photoBusy stays true after 6 s, Save stays disabled, or the posted file is not the original."""
    page = open_photos(browser, base, lang)
    page.evaluate(HANG)
    posts = []
    capture(page, '**/api/photos', posts)
    page.locator('[data-act="open-photo"]').click()
    original = noise_jpeg(1200, 900)
    pick(page, 'IMG_6001.jpg', 'image/jpeg', original)
    page.wait_for_function('S.photoBusy === true', timeout=2000)
    save = page.locator('[data-sheet] [data-act="save"]')
    check(f'{lang}: while the shrink hangs, Save is off and a status says why', save.is_disabled())
    page.wait_for_function('S.photoBusy === false', timeout=8000)
    page.locator('.photo-picker', has_text='IMG_6001.jpg').wait_for()
    check(f'{lang}: after 6 s the busy mark is gone and Save is on', save.is_enabled() and PREP[lang] not in sheet_text(page))
    save.click()
    page.wait_for_function('!document.querySelector("[data-sheet]")')
    parts = posted_parts(posts[0][2], posts[0][1]) if posts else {}
    check(f'{lang}: the photo posts once, as the original file', len(posts) == 1 and parts.get('file', ('', b''))[1] == original)
    page.context.close()


def flow_stuck_other_form(browser, base, lang):
    """Failure case: a pick that hangs in one sheet keeps Save off in a Feed form opened next (S.photoBusy was global)."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    page.evaluate(HANG)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'p.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(800, 600)})
    page.wait_for_function('S.photoBusy === true', timeout=2000)
    page.evaluate("() => { S.sheet = null; render(); }")
    page.locator('.tile[data-act="open-feed"]').click()
    page.locator('[data-act="ftab"][data-arg="bottle"]').click()
    page.locator('[data-sheet] [data-act="ml-set"]').first.click()
    page.locator('[data-sheet] [data-act="milk"]').first.click()
    save = page.locator('[data-sheet] [data-act="save"]')
    check(f'{lang}: a Feed form opened during a stuck pick has Save on at once', save.is_enabled() and page.evaluate('S.photoBusy') is False)
    save.click()
    page.wait_for_function('!document.querySelector("[data-sheet]")', timeout=3000)
    check(f'{lang}: and it posts at once', len(page.writes) == 1)
    page.context.close()


def flow_undecodable_passes(browser, base, lang):
    """Failure case: a JPEG the browser cannot decode (kept as it is) refused below the new 25 MB limit."""
    page = open_photos(browser, base, lang)
    posts = []
    capture(page, '**/api/photos', posts)
    page.locator('[data-act="open-photo"]').click()
    broken = bytes([255, 216, 255, 224]) + os.urandom(8 * 1024 * 1024)
    pick(page, 'odd.jpg', 'image/jpeg', broken)
    page.locator('.photo-picker', has_text='odd.jpg').wait_for(timeout=15000)
    page.locator('[data-sheet] [data-act="save"]').click()
    page.wait_for_function('!document.querySelector("[data-sheet]")')
    parts = posted_parts(posts[0][2], posts[0][1]) if posts else {}
    check(f'{lang}: an 8 MB file the browser cannot decode is posted unchanged ({len(parts.get("file", ("", b""))[1])} bytes)', parts.get('file', ('', b''))[1] == broken)
    page.context.close()


PORTRAIT_SHOTS = SHOTS / 'polish'
SAVING = {'en': 'Saving', 'es': 'Guardando'}
# Hold the portrait upload until window.__release() runs, so the saving state can be seen.
HOLD = """() => { const real = LittleDaysAPI.writes.savePortrait; window.__release = null;
  let first = true;
  LittleDaysAPI.writes.savePortrait = (file, op) => { if (!first) return real(file, op); first = false;
    return new Promise(done => { window.__release = () => done(real(file, op)); }); }; }"""


def portrait_server(page, puts, fail=0, status=500, pending=0):
    """PUT /api/child/portrait: the first `fail` uploads answer `status` (a 500 also gets a 404 operation check), later ones save."""
    def handler(route):
        if route.request.method != 'PUT':
            route.fulfill(body=noise_jpeg(64, 64), content_type='image/jpeg')
            return
        body = route.request.post_data_buffer or b''
        parts = posted_parts(body, route.request.headers['content-type'])
        op = parts['operationId'][1].decode()
        puts.append(op)
        try:  # WebKit's request body can reach the route without the file bytes; then the upload order identifies the pick
            size = Image.open(io.BytesIO(parts['file'][1])).size
        except Exception:
            size = None
        page.sizes = getattr(page, 'sizes', []) + [size]
        if pending:
            route.fulfill(json={'status': 'pending', 'operationId': op})
            return
        if len(puts) <= fail:
            route.fulfill(status=status, json={'error': 'boom'})
            return
        page.st['child'] = {**page.st['child'], 'portrait': f'/api/child/portrait?v={len(puts)}'}
        route.fulfill(json={'status': 'saved', 'operationId': op, 'state': page.st})
    page.route(re.compile(r'/api/child/portrait(\?.*)?$'), handler)
    if pending:
        checks = {}

        def operation(route):  # each pending upload is still pending at its first `pending` checks, then saved
            op = route.request.url.rsplit('/', 1)[1]
            checks[op] = checks.get(op, 0) + 1
            if checks[op] <= pending:
                route.fulfill(json={'status': 'pending', 'operationId': op})
                return
            page.st['child'] = {**page.st['child'], 'portrait': f'/api/child/portrait?v={puts.index(op) + 1}'}
            route.fulfill(json={'status': 'saved', 'operationId': op, 'state': page.st})
        page.route('**/api/operations/*', operation)
    if fail:
        page.route('**/api/operations/*', lambda route: route.fulfill(status=404, json={'error': 'not found'}))


def baby_shot(page, name):
    PORTRAIT_SHOTS.mkdir(parents=True, exist_ok=True)
    page.evaluate('document.querySelector(".portrait-upload").scrollIntoView({block: "center"})')
    page.screenshot(path=str(PORTRAIT_SHOTS / f'{name}.png'))


def pick_portrait(page, name, data):
    """Pick as a person does: tap Change photo, then choose in the file chooser. The tap marks the input, so a redraw while the
    chooser is open keeps it; setting files on the input directly can land on a node that a queued redraw just replaced."""
    with page.expect_file_chooser() as chooser:
        page.locator('.portrait-file').click()
    chooser.value.set_files({'name': name, 'mimeType': 'image/jpeg', 'buffer': data})


def wait_puts(page, puts, count):
    for _ in range(50):
        if len(puts) >= count:
            break
        page.wait_for_timeout(100)
    page.wait_for_timeout(300)  # a second, unwanted upload would land here


def flow_portrait_autosave(browser, base, lang, engine):
    """Owner, 2026-11-19: the Settings portrait never reached the server, because it waited for a separate Save tap.
    Failure cases: no PUT unless Save is tapped, more than one PUT, the Home header keeps the bunny, a Save button while saving."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts = []
    portrait_server(page, puts)
    page.evaluate(HOLD)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'IMG_5001.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
    page.wait_for_function('typeof window.__release === "function"', timeout=8000)
    page.get_by_text(SAVING[lang]).first.wait_for()
    check(f'{engine} {lang}: while the picked portrait saves, the draft shows, "{SAVING[lang]}" shows and there is no Save button',
          page.locator('img.mini-portrait').count() == 1 and page.locator('[data-act="portrait-save"]').count() == 0)
    baby_shot(page, f'portrait-saving-{lang}')
    page.evaluate('window.__release()')
    wait_puts(page, puts, 1)
    page.wait_for_function('!S.portraitDraft')
    baby_shot(page, f'portrait-saved-{lang}')
    page.locator('[data-sheet] [data-act="cancel"]').click()
    page.locator('header.top img.home-portrait').wait_for(timeout=4000)
    check(f'{engine} {lang}: a picked portrait saves with exactly one PUT and no other tap, and Home shows it ({len(puts)} PUT)',
          len(puts) == 1 and page.locator('header.top img.home-portrait').count() == 1)
    page.context.close()


def flow_portrait_failed(browser, base, lang, engine):
    """Failure cases: a failed upload drops the draft, shows no message, or leaves no way to try again.
    A lost request (500, unknown to the server) retries from the shared status bar with the same operation;
    a refused file (415) shows the file-type message and a Retry button in the Baby section."""
    for status, key, button in ((500, 'retrySame', '[data-act="retry-write"]'), (415, 'photoType', '[data-act="portrait-save"]')):
        page = open_app(browser, base, 390, 844, AT, lang=lang)
        page.set_default_timeout(8000)
        puts = []
        portrait_server(page, puts, fail=1, status=status)
        page.locator('[data-act="open-settings"]').click()
        page.locator('.portrait-file').set_input_files({'name': 'IMG_5002.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
        wait_puts(page, puts, 1)
        retry = page.locator(button)
        retry.wait_for()
        expected = page.evaluate(f't("{key}")')
        check(f'{engine} {lang} {status}: a failed upload keeps the draft, shows {expected!r} and one enabled Retry ({button})',
              len(puts) == 1 and page.locator('img.mini-portrait').count() == 1 and expected in page.locator('body').inner_text()
              and retry.is_enabled() and page.evaluate('t("retry")') in retry.inner_text()
              and page.locator('[data-act="retry-write"], [data-act="portrait-save"]').count() == 1)
        if status == 500:
            baby_shot(page, f'portrait-failed-{lang}')
        retry.click()
        wait_puts(page, puts, 2)
        page.wait_for_function('!S.portraitDraft')
        same = puts[0] == puts[1] if status == 500 else True
        check(f'{engine} {lang} {status}: Retry uploads again and saves{" with the same operation" if status == 500 else ""}', len(puts) == 2 and same)
        page.context.close()


def final_portrait(page, puts, count):
    wait_puts(page, puts, count)
    page.wait_for_function('!S.portraitDraft && !S.busy && !Object.keys(S.pendingOps || {}).length', timeout=12000)
    return page.evaluate('[S.child.portrait, S.message === t("portraitSaved")]')


def flow_portrait_second_pick(browser, base, lang, engine):
    """Codex r1-1. Failure cases: the picker is disabled during an upload, B is not uploaded, or A's result replaces B."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts = []
    portrait_server(page, puts)
    page.evaluate(HOLD)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'A.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
    page.wait_for_function('typeof window.__release === "function"', timeout=8000)
    enabled = page.locator('.portrait-file').is_enabled()
    check(f'{engine} {lang}: during an upload the photo picker stays enabled', enabled)
    if not enabled:
        page.context.close()
        return
    pick_portrait(page, 'B.jpg', noise_jpeg(1000, 700))
    page.locator('.portrait-name', has_text='B.jpg').wait_for()
    check(f'{engine} {lang}: B waits for A: no second upload and no Retry yet', len(puts) == 0 and page.locator('[data-act="portrait-save"]').count() == 0)
    page.evaluate('window.__release()')
    photo, saved = final_portrait(page, puts, 2)
    check(f'{engine} {lang}: A then B upload once each, B is the saved photo with the saved message ({photo}, {page.sizes})',
          len(puts) == 2 and page.sizes[1] in ((1000, 700), None) and photo.endswith('v=2') and saved)
    page.context.close()


def flow_portrait_language(browser, base, lang, engine):
    """Codex r1-2. Failure case: a language change still open when the pick is ready leaves zero uploads and a dead Retry."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts = []
    portrait_server(page, puts)
    page.evaluate(DELAY)
    page.evaluate("""() => { const real = LittleDaysAPI.writes.savePreferences;
      LittleDaysAPI.writes.savePreferences = (p, op) => new Promise(done => { window.__prefs = () => done(real(p, op)); }); }""")
    page.route('**/api/preferences', lambda route: route.fulfill(json={'status': 'saved', 'operationId': 'p', 'state': page.st}))
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'A.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
    other = 'es' if lang == 'en' else 'en'
    page.locator(f'[data-setting="lang"][data-value="{other}"]').click()
    page.wait_for_function('typeof window.__prefs === "function" && !S.photoBusy && S.portraitDraft', timeout=8000)
    check(f'{engine} {lang}: while the language change is open, the ready pick waits with no Retry', len(puts) == 0 and page.locator('[data-act="portrait-save"]').count() == 0)
    page.evaluate('window.__prefs()')
    photo, _ = final_portrait(page, puts, 1)
    check(f'{engine} {lang}: after the language change ends, the pick uploads once ({len(puts)} PUT, {photo})', len(puts) == 1 and photo.endswith('v=1'))
    page.context.close()


def flow_portrait_pending(browser, base, lang, engine):
    """Codex r1-3. Failure cases: Retry during a pending save, a second PUT for A, or A's late check replacing B."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts = []
    portrait_server(page, puts, pending=2)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'A.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
    wait_puts(page, puts, 1)
    page.wait_for_timeout(500)  # the first check (700 ms) has not answered yet
    check(f'{engine} {lang}: while A is pending, "{SAVING[lang]}" shows and there is no Retry',
          page.locator('[data-act="portrait-save"]').count() == 0 and SAVING[lang] in page.locator('body').inner_text())
    pick_portrait(page, 'B.jpg', noise_jpeg(1000, 700))
    page.locator('.portrait-name', has_text='B.jpg').wait_for()
    check(f'{engine} {lang}: B waits while A is pending, with no Retry', len(puts) == 1 and page.locator('[data-act="portrait-save"]').count() == 0)
    photo, saved = final_portrait(page, puts, 2)
    check(f'{engine} {lang}: A and B upload once each and B wins ({photo}, saved message {saved})', len(puts) == 2 and page.sizes[1] in ((1000, 700), None) and photo.endswith('v=2') and saved)
    page.context.close()


def flow_portrait_permission(browser, base, lang, engine):
    """Codex r1-5. Failure case: permission removed during preparation leaves an enabled Retry that does nothing."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts = []
    portrait_server(page, puts)
    page.evaluate(DELAY)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'A.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
    page.wait_for_function('S.photoBusy === true', timeout=2000)
    page.evaluate('S.permissions.resources.children.change = false; render()')
    page.wait_for_function('!S.photoBusy', timeout=8000)
    page.wait_for_timeout(300)
    message = page.evaluate('t("photoNotAllowed")')
    check(f'{engine} {lang}: without permission no upload, no Retry, and the message {message!r} shows',
          len(puts) == 0 and page.locator('[data-act="portrait-save"]').count() == 0 and message in page.locator('body').inner_text())
    page.context.close()


def flow_portrait_failed_with_newer(browser, base, lang, engine):
    """Codex r2-1. Failure case: A fails (500, then 404 on its check) while B waits; Settings locks on A's Retry and B never uploads."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts = []
    portrait_server(page, puts, fail=1)
    page.evaluate(HOLD)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'A.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
    page.wait_for_function('typeof window.__release === "function"', timeout=8000)
    pick_portrait(page, 'B.jpg', noise_jpeg(1000, 700))
    page.locator('.portrait-name', has_text='B.jpg').wait_for()
    page.evaluate('window.__release()')
    try:
        photo, saved = final_portrait(page, puts, 2)
    except Exception:
        photo, saved = None, False
    check(f'{engine} {lang}: after A fails, the waiting B uploads and is saved, with no lock left ({len(puts)} PUT, {photo})',
          len(puts) == 2 and bool(photo) and photo.endswith('v=2') and saved and not page.evaluate('S.pendingSheetOperation || S.retryAction'))
    page.context.close()


def flow_portrait_photo_retry(browser, base, lang, engine):
    """Codex r2-2. Failure case: the server asks for the photo again (needsRetry, requiresPhoto); Retry shows but sends nothing."""
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts = []

    def upload(route):
        if route.request.method != 'PUT':
            route.fulfill(body=noise_jpeg(64, 64), content_type='image/jpeg')
            return
        body = route.request.post_data_buffer or b''
        op = posted_parts(body, route.request.headers['content-type'])['operationId'][1].decode()
        puts.append(op)
        if len(puts) == 1:
            route.fulfill(json={'status': 'pending', 'operationId': op})
            return
        page.st['child'] = {**page.st['child'], 'portrait': '/api/child/portrait?v=2'}
        route.fulfill(json={'status': 'saved', 'operationId': op, 'state': page.st})
    page.route(re.compile(r'/api/child/portrait(\?.*)?$'), upload)
    page.route('**/api/operations/*', lambda route: route.fulfill(json={'status': 'pending', 'operationId': route.request.url.rsplit('/', 1)[1],
                                                                         'needsRetry': True, 'requiresPhoto': True, 'portrait': True}))
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'A.jpg', 'mimeType': 'image/jpeg', 'buffer': noise_jpeg(1200, 900)})
    retry = page.locator('[data-act="retry-write"]')
    retry.wait_for()
    check(f'{engine} {lang}: the server asks for the photo again: one Retry shows ({page.locator("[data-act=retry-write], [data-act=portrait-save]").count()})',
          page.locator('[data-act="retry-write"], [data-act="portrait-save"]').count() == 1)
    retry.click()
    try:
        photo, saved = final_portrait(page, puts, 2)
    except Exception:
        photo, saved = None, False
    check(f'{engine} {lang}: Retry resends the same operation and saves ({len(puts)} PUT, {photo})',
          len(puts) == 2 and puts[0] == puts[1] and bool(photo) and photo.endswith('v=2') and saved)
    page.context.close()


def flow_portrait_same_photo(browser, base, lang, engine):
    """Codex r3. The server answers a second upload of the same photo with the first, still pending, operation id
    (runtime/server/photos.ts pendingDuplicate). Failure case: Retry keeps sending the second id, the server keeps answering
    with the first, and the portrait never saves (uploads A, B, B, B ...)."""
    import hashlib
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(8000)
    puts, pending = [], {}  # pending: operation id -> photo digest

    def upload(route):
        if route.request.method != 'PUT':
            route.fulfill(body=noise_jpeg(64, 64), content_type='image/jpeg')
            return
        body = route.request.post_data_buffer or b''
        parts = posted_parts(body, route.request.headers['content-type'])
        op, digest = parts['operationId'][1].decode(), hashlib.sha256(parts['file'][1]).hexdigest()
        puts.append(op)
        if op in pending:  # the photo the server asked for again: the save finishes
            del pending[op]
            page.st['child'] = {**page.st['child'], 'portrait': f'/api/child/portrait?v={len(puts)}'}
            route.fulfill(json={'status': 'saved', 'operationId': op, 'state': page.st})
            return
        same = next((old for old, d in pending.items() if d == digest), None)
        if same:
            route.fulfill(json={'status': 'pending', 'operationId': same})
            return
        pending[op] = digest
        route.fulfill(json={'status': 'pending', 'operationId': op})
    page.route(re.compile(r'/api/child/portrait(\?.*)?$'), upload)
    page.route('**/api/operations/*', lambda route: route.fulfill(json={'status': 'pending', 'operationId': route.request.url.rsplit('/', 1)[1],
                                                                         'needsRetry': True, 'requiresPhoto': True, 'portrait': True}))
    photo_bytes = noise_jpeg(1200, 900)
    page.locator('[data-act="open-settings"]').click()
    page.locator('.portrait-file').set_input_files({'name': 'A.jpg', 'mimeType': 'image/jpeg', 'buffer': photo_bytes})
    page.locator('[data-act="retry-write"]').wait_for()
    pick_portrait(page, 'A-again.jpg', photo_bytes)
    wait_puts(page, puts, 2)
    page.locator('[data-act="retry-write"]').wait_for()
    page.locator('[data-act="retry-write"]').click()
    try:
        photo, saved = final_portrait(page, puts, 3)
    except Exception:
        photo, saved = None, False
    page.wait_for_timeout(1000)  # an endless resend would add uploads here
    check(f'{engine} {lang}: the same photo picked twice ends saved; Retry uses the server\'s operation id ({len(puts)} uploads, {photo})',
          len(puts) == 3 and puts[2] == puts[0] != puts[1] and bool(photo) and saved)
    page.context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.dry_run:
        print('Chrome agent launcher; mocked APIs only; photo add, refused files, server refusal, portrait; EN/ES; 390 px; screenshots:', SHOTS)
        return
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for lang in ('en', 'es'):
                    flow_captions(browser, base, lang)
                    for flow in (flow_add_and_save, flow_big_photo_note, flow_big_photo_portrait, flow_img_fallback, flow_busy_note, flow_busy_portrait, flow_two_picks, flow_stuck_shrink, flow_stuck_other_form, flow_undecodable_passes, flow_redraw_during_picker, flow_portrait_redraw, flow_refused_files, flow_server_refusal, flow_portrait):
                        try:
                            flow(browser, base, lang)
                        except Exception as error:  # a timeout is a failed check, not a crash
                            check(f'{lang}: {flow.__name__} completed ({type(error).__name__})', False)
            finally:
                browser.close()
            # The portrait saves when the pick finishes (owner, 2026-11-19), in Chromium and WebKit (the iPhone engine).
            for engine in ('chromium', 'webkit'):
                browser = launch_browser(pw, engine)
                try:
                    for lang in ('en', 'es'):
                        for flow in (flow_portrait_autosave, flow_portrait_failed, flow_portrait_second_pick, flow_portrait_language, flow_portrait_pending, flow_portrait_permission, flow_portrait_failed_with_newer, flow_portrait_photo_retry, flow_portrait_same_photo):
                            try:
                                flow(browser, base, lang, engine)
                            except Exception as error:
                                check(f'{engine} {lang}: {flow.__name__} completed ({type(error).__name__}: {str(error).splitlines()[0][:120]})', False)
                finally:
                    browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
