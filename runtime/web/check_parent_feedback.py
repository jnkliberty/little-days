"""Synthetic browser proof for parent feedback; no family API is contacted.

Run with the existing Playwright Python. Use --dry-run to preview the checks.
LITTLE_DAYS_BROWSER or --browser selects chromium/webkit.
"""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import argparse
import base64
import json
import re
from datetime import datetime, timedelta
from email import policy
from email.parser import BytesParser
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from forms_support import stop_click
from check_support import browser_engine, launch_browser, mx_minutes, open_app, start_static_server
from check_ui import navigate
from check_feed_ranges import open_feed_adjustments

AT = datetime.fromisoformat('2026-11-09T12:00:00-06:00')
SHOTS = Path('/tmp/little-days-parent-feedback-shots')
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
RESULTS = []


def check(name, condition):
    RESULTS.append((name, bool(condition)))
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)


def click(page, action, arg=None):
    if action in ("manual", "switch-earlier", "change-start", "wrong-side"):
        open_feed_adjustments(page)
    selector = f'[data-act="{action}"]'
    if arg is not None:
        selector += f'[data-arg="{arg}"]'
    page.locator(("[data-sheet] " if page.locator("[data-sheet]").count() else "") + selector).first.click()  # Home's run card and Resume bar repeat some actions under an open sheet


def last_write(page):
    return next((path, body) for path, body in reversed(page.calls) if body is not None)


def snapshot(page, name):
    page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=True)
    check(name + ': no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
    check(name + ': no browser errors', not page.errors)


def fixture(browser, base, lang, width, dim=False):
    height=844 if width==390 else 860 if width==2000 else 900
    page = open_app(browser, base, width, height, AT, lang=lang, theme='on' if dim else 'off')
    page.set_default_timeout(4000)
    page.calls = []
    page.food_mode = 'ready'
    page.food_pending = []
    page.foods = [
        {'id':'old-apple','type':'other','what':'solids','food':'Apple','foodId':'apple','preference':'liked','startISO':'2025-01-01T12:00:00Z'},
        {'id':'old-pear','type':'other','what':'solids','food':'Pera','foodId':'pear','preference':'disliked','startISO':'2025-02-01T12:00:00Z'},
        {'id':'old-rice','type':'other','what':'solids','food':'Rice','foodId':'rice','preference':None,'startISO':'2025-03-01T12:00:00Z'},
    ]

    def api(route):
        request = route.request
        path = urlparse(request.url).path
        if request.method == 'GET':
            if path == '/api/foods':
                page.calls.append((path, None))
                if page.food_mode == 'loading':
                    page.food_pending.append(route)
                    return
                if page.food_mode == 'error':
                    route.fulfill(status=503, json={'error':'Synthetic unavailable'})
                    return
                route.fulfill(json={'entries':page.foods,'unavailable':[]})
            elif path == '/api/state':
                route.fulfill(json=page.st)
            elif path == '/api/session':
                route.fulfill(json={'me':page.st['me'],'csrf':'synthetic','people':page.st['people']})
            else:
                route.fulfill(json={'entries':[],'unavailable':[]})
            return
        if path == '/api/development':
            # Daily guidance is read at sign-in. It is not a write and must not count as one.
            route.fulfill(json={'date':'2026-11-08','status':'unavailable','cards':[]})
            return
        if path == '/api/photos':
            message = BytesParser(policy=policy.default).parsebytes(
                ('Content-Type: ' + request.headers['content-type'] + '\r\n\r\n').encode() + request.post_data_buffer)
            parts = {part.get_param('name', header='content-disposition'):part for part in message.iter_parts()}
            body = {'event':json.loads(parts['event'].get_payload(decode=True)),
                    'operationId':parts['operationId'].get_payload(decode=True).decode(),
                    'filename':parts['file'].get_filename(), 'fileBytes':len(parts['file'].get_payload(decode=True))}
        else:
            body = request.post_data_json
        page.calls.append((path, body))
        entry_id = None
        if path == '/api/events' or path == '/api/photos':
            entry_id = f'new-{len(page.calls)}'
            event = {**body['event'],'id':entry_id,'by':'Rowan','t':mx_minutes(AT)}
            if path == '/api/photos':
                event.update(photo='data:image/png;base64,' + base64.b64encode(PNG).decode(), photoName=body['filename'])
            page.st['entries'].append(event)
            if event.get('what') == 'solids':
                page.foods.append(event)
        elif path.startswith('/api/events/'):
            entry_id = path.rsplit('/',1)[1]
            for entry in page.st['entries']:
                if entry['id'] == entry_id:
                    entry.update(body['event'])
        elif path == '/api/timers/sleep/resume':
            page.st['sleepRun'] = timer('resumed-nap')
            page.st['sleepPaused'] = None
        elif path == '/api/timers/sleep/end':
            page.st['sleepPaused'] = None
        elif path.endswith('/pause'):
            page.st['entries'].append({'id':'saved-nap','type':'sleep','nap':True,'dur':20,'t':700,'by':'Rowan'})
            page.st['sleepRun'] = None
            page.st['sleepPaused'] = {'id':'pause-1','nap':True,'by':'Rowan'}
        elif path.endswith('/discard'):
            page.st['sleepRun'] = None
        elif path.endswith('/stop'):
            page.st['sleepRun'] = None
            page.st['entries'].append({'id':'ended-nap','type':'sleep','nap':True,'dur':20,'t':700,'by':'Rowan'})
        else:
            route.fulfill(status=400, json={'error':'Unexpected synthetic write: '+path})
            return
        route.fulfill(json={'status':'saved','operationId':body['operationId'],'id':entry_id,'state':page.st})

    page.route('**/api/**', api)
    return page


def timer(timer_id='active-nap'):
    return {'id':timer_id,'kind':'sleep','nap':True,'by':'Rowan','t0':700,'startedAt':(AT-timedelta(minutes=20)).isoformat()}


def photos(page, label):
    navigate(page,'photos')
    check(label+': empty Photos offers Add photo', page.locator('[data-act="open-photo"]').is_visible())
    snapshot(page,label+'-photos-empty')
    for caption in ('', 'First smile'):
        with page.expect_file_chooser() as chooser:
            click(page,'open-photo')
        chooser.value.set_files({'name':'synthetic.png','mimeType':'image/png','buffer':PNG})
        page.locator('.note-photo').wait_for()
        # Decision 2026-11-11 (owner: "the add photo section still isn't working"): the browser re-encodes a picked photo as a JPEG (2048 px or less), so the preview and the upload are that JPEG, not the PNG bytes.
        preview = page.locator('.note-photo').evaluate('async e=>{const b=await (await fetch(e.src)).blob();return [b.size,b.type]}')
        check(label+': selected photo retains image bytes (as the re-encoded JPEG that is uploaded)', preview[0]>0 and preview[1]=='image/jpeg')
        check(label+': photo uses Notes form', page.locator('[data-sheet][data-kind="note"]').count()==1)
        check(label+': caption is optional and localized', ('Descripción (opcional)' if page.st['preferences']['language']=='es' else 'Caption (optional)') in page.locator('[data-sheet]').inner_text())
        if caption:
            page.locator('[data-fid="note"]').fill(caption)
        snapshot(page,label+('-photo-caption' if caption else '-photo-no-caption'))
        click(page,'save')
        page.locator('[data-sheet]').wait_for(state='detached')
        saved = [body for path,body in page.calls if path=='/api/photos'][-1]
        check(label+': photo upload contains filename and optional caption', saved['filename']=='synthetic.jpg' and saved['event'].get('text','')==caption)
        # shortcut: WebKit interception omits file bytes, use a real HTTP upload check if that engine needs byte proof.
        if page.context.browser.browser_type.name=='chromium':
            check(label+': upload transmits image bytes', saved['fileBytes']==preview[0])
        check(label+': confirmed photo appears in Photos', page.locator('.pbig img').count()==1)
    snapshot(page,label+'-photos-populated')


def sleeps(page,label):
    page.st['sleepRun'] = timer()
    page.st['sleepPaused'] = None
    page.reload()
    click(page,'open-sleep')
    check(label+': active sleep has end, pause, cancel', all(page.locator(f'[data-sheet] [data-act="{a}"]').count()==1 for a in ('stop-sleep','pause-sleep','cancel-sleep')))
    snapshot(page,label+'-nap-active')
    click(page,'pause-sleep')
    page.locator('[data-sheet]').wait_for(state='detached')
    check(label+': pause uses active timer route', last_write(page)[0]=='/api/timers/active-nap/pause')
    page.reload()
    click(page,'open-sleep')
    check(label+': paused state survives reload with Resume and End', page.locator('[data-sheet] [data-act="resume-sleep"]').is_visible() and page.locator('[data-sheet] [data-act="end-paused-sleep"]').is_visible())
    snapshot(page,label+'-nap-paused')
    click(page,'resume-sleep')
    page.locator('[data-sheet]').wait_for(state='detached')
    check(label+': Resume sends pause ID to resume route', last_write(page)[0]=='/api/timers/sleep/resume' and last_write(page)[1].get('pauseId')=='pause-1')
    page.reload()
    click(page,'open-sleep')
    click(page,'pause-sleep')
    page.locator('[data-sheet]').wait_for(state='detached')
    page.reload()
    click(page,'open-sleep')
    click(page,'end-paused-sleep')
    page.locator('[data-sheet]').wait_for(state='detached')
    check(label+': paused End uses end route', last_write(page)[0]=='/api/timers/sleep/end' and last_write(page)[1].get('pauseId')=='pause-1')
    page.reload()
    click(page,'open-sleep')
    check(label+': ended pause stays ended after reload', page.locator('[data-act="resume-sleep"]').count()==0)
    click(page,'cancel')
    page.st['sleepRun'] = timer()
    page.reload()
    click(page,'open-sleep')
    before = len(page.calls)
    entries_before = len(page.st['entries'])
    click(page,'cancel-sleep')
    check(label+': cancel requires confirmation before request', len(page.calls)==before and page.locator('[data-act="discard-sleep"]').is_visible())
    snapshot(page,label+'-nap-cancel-confirm')
    click(page,'cancel')
    check(label+': dismiss cancel keeps active timer', page.locator('[data-sheet] [data-act="pause-sleep"]').is_visible())
    click(page,'cancel-sleep')
    click(page,'discard-sleep')
    page.locator('[data-sheet]').wait_for(state='detached')
    check(label+': confirmed cancel discards without event save', last_write(page)[0]=='/api/timers/active-nap/discard' and len(page.st['entries'])==entries_before)
    page.reload()
    click(page,'open-sleep')
    check(label+': cancelled timer stays absent after reload', page.locator('[data-act="pause-sleep"]').count()==0)
    click(page,'cancel')
    page.st['sleepRun'] = timer()
    page.reload()
    click(page,'open-sleep')
    stop_click(page, '[data-sheet] [data-act="stop-sleep"]')
    page.locator('[data-sheet]').wait_for(state='detached')
    check(label+': active End stops the active timer', last_write(page)[0]=='/api/timers/active-nap/stop')
    page.reload()
    click(page,'open-sleep')
    check(label+': active End stays ended after reload', page.locator('[data-act="pause-sleep"]').count()==0)


def open_solids(page):
    navigate(page,'home')
    click(page,'open-more')
    click(page,'quick','solids')


def solids(page,label,lang):
    open_solids(page)
    page.locator('.food-liked').wait_for()
    expected = [('apple','Liked','Le gustó'),('pear',"Didn't like",'No le gustó'),('rice','Tried; preference unknown','Probado; gusto sin registrar'),('banana','Not tried','Sin probar')]
    for food,en,es in expected:
        check(label+': all-date history '+food, (es if lang=='es' else en) in page.locator(f'[data-act="food-select"][data-arg="{food}"]').inner_text())
    check(label+': history comes from foods API', any(path=='/api/foods' for path,_ in page.calls))
    snapshot(page,label+'-foods-history')
    click(page,'food-select','avocado')
    check(label+': catalog selection opens named food form', page.locator('[data-fid="food"]').input_value()==('Aguacate' if lang=='es' else 'Avocado'))
    click(page,'food-preference','liked')
    visible_selection=page.evaluate("""() => {
      const selected=document.querySelector('[data-act="food-preference"][aria-pressed="true"]');
      const other=document.querySelector('[data-act="food-preference"][aria-pressed="false"]');
      return selected&&other&&getComputedStyle(selected).backgroundColor!==getComputedStyle(other).backgroundColor;
    }""")
    check(label+': selected preference has a visible filled state',visible_selection)
    snapshot(page,label+'-food-form')
    click(page,'save')
    page.locator('[data-sheet]').wait_for(state='detached')
    event = [body['event'] for path,body in page.calls if path=='/api/events'][-1]
    check(label+': save preserves food identity and preference', event.get('foodId')=='avocado' and event.get('preference')=='liked')
    navigate(page,'log')
    entry_id = page.st['entries'][-1]['id']
    click(page,'edit',entry_id)
    click(page,'edit-food-preference','disliked')
    click(page,'save')
    page.locator('[data-sheet]').wait_for(state='detached')
    update = [body['event'] for path,body in page.calls if path.startswith('/api/events/')][-1]
    check(label+': edit persists preference with identity', update.get('preference')=='disliked' and update.get('foodId')=='avocado')
    open_solids(page)
    click(page,'food-custom')
    page.locator('[data-fid="food"]').fill('Dragon fruit')
    click(page,'food-preference','disliked')
    click(page,'save')
    page.locator('[data-sheet]').wait_for(state='detached')
    custom = [body['event'] for path,body in page.calls if path=='/api/events'][-1]
    check(label+': custom food keeps text and preference', custom.get('food')=='Dragon fruit' and custom.get('foodId') is None and custom.get('preference')=='disliked')
    page.food_mode='loading'
    open_solids(page)
    page.locator('.food-tile').first.wait_for()
    check(label+': loading history never claims untried', page.locator('.food-not-tried').count()==0 and ('Cargando' if lang=='es' else 'Loading') in page.locator('.food-status').first.inner_text())
    snapshot(page,label+'-foods-loading')
    for route in page.food_pending:
        route.fulfill(status=503,json={'error':'Synthetic unavailable'})
    page.locator('[data-sheet] [role="alert"]').wait_for()
    check(label+': failed history never claims untried', page.locator('.food-not-tried').count()==0 and page.locator('[data-act="retry-foods"]').is_visible())
    snapshot(page,label+'-foods-error')
    page.food_mode='ready'
    click(page,'retry-foods')
    page.locator('.food-liked').wait_for()
    check(label+': retry restores food history', page.locator('[data-sheet] [role="alert"]').count()==0)


def gate_captures(page,label):
    navigate(page,'photos')
    snapshot(page,label+'-photos-empty')
    with page.expect_file_chooser() as chooser:
        click(page,'open-photo')
    chooser.value.set_files({'name':'synthetic.png','mimeType':'image/png','buffer':PNG})
    page.locator('.note-photo').wait_for()
    snapshot(page,label+'-photo-upload')
    page.st['sleepRun']=timer()
    page.reload()
    click(page,'open-sleep')
    snapshot(page,label+'-nap-active')
    click(page,'pause-sleep')
    page.locator('[data-sheet]').wait_for(state='detached')
    click(page,'open-sleep')
    snapshot(page,label+'-nap-paused')
    click(page,'cancel')
    open_solids(page)
    page.locator('.food-liked').wait_for()
    snapshot(page,label+'-foods-history')
    click(page,'food-select','avocado')
    snapshot(page,label+'-food-form')
    page.food_mode='loading'
    click(page,'food-list')
    page.locator('.food-tile').first.wait_for()
    snapshot(page,label+'-foods-loading')
    for route in page.food_pending:
        route.fulfill(status=503,json={'error':'Synthetic unavailable'})
    page.locator('[data-sheet] [role="alert"]').wait_for()
    snapshot(page,label+'-foods-error')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--browser',choices=['chromium','webkit'],default=browser_engine())
    args=parser.parse_args()
    if args.dry_run:
        print(f'{args.browser}: synthetic Photos, Sleep, Foods; EN/ES; 390x844/768x900(dim)/1440x900; captures 2000x860: {SHOTS}; no family writes')
        return 0
    SHOTS.mkdir(parents=True,exist_ok=True)
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser=launch_browser(pw, args.browser)
            for lang in ('en','es'):
                for width in (390,768,1440,2000):
                    label=f'{args.browser}-{lang}-{width}'+('-dim' if width==768 else '-day')
                    for audit in ((gate_captures,) if width==2000 else (photos,sleeps,solids)):
                        page=fixture(browser,base,lang,width,dim=width==768)
                        try:
                            audit(page,label,lang) if audit is solids else audit(page,label)
                        except Exception as error:
                            check(label+': '+audit.__name__+' completed: '+str(error),False)
                            page.screenshot(path=str(SHOTS/f'{label}-{audit.__name__}-failure.png'),full_page=True)
                        finally:
                            check(label+': '+audit.__name__+' no page errors',not page.errors)
                            page.context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    passed=sum(ok for _,ok in RESULTS)
    print(f'{passed} passed, {len(RESULTS)-passed} failed; screenshots: {SHOTS}')
    return int(passed != len(RESULTS))


if __name__=='__main__':
    raise SystemExit(main())
