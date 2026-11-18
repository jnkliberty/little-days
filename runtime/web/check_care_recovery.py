"""Synthetic recovery and parallel manual-entry checks. No family service access."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import argparse
from datetime import timedelta

from playwright.sync_api import sync_playwright
from check_parent_feedback import AT, SHOTS, RESULTS, check, click, fixture, snapshot, timer
from check_support import launch_browser, start_static_server
from check_feed_ranges import type_clock


def manual(page, kind):
    run = timer('current-' + kind)
    page.st['sleepRun' if kind == 'sleep' else 'run'] = {**run, 'kind':kind, 'side':'L'}
    page.reload()
    click(page, 'open-sleep' if kind == 'sleep' else 'open-feed')
    check(kind + ': opening the form sends no write', not page.calls)
    if kind == 'feed':
        details = page.locator('[data-feed-adjust]')
        check('feed adjustments default closed beside Add note', not details.evaluate('el => el.open') and page.locator('.group [data-act="note-open"]').is_visible())
        page.locator('[data-sheet] [data-act="stop"]').focus()
        page.keyboard.press('Shift+Tab')  # the adjustment summary sits above Stop in the running panel
        check('Shift+Tab from Stop reaches the closed adjustment summary', page.locator('[data-feed-adjust] summary').evaluate('el => el === document.activeElement'))
        page.keyboard.press('Tab')
        check('closed adjustment Tab skips hidden actions and reaches Stop', page.locator('[data-sheet] [data-act="stop"]').evaluate('el => el === document.activeElement'))
        page.keyboard.press('Shift+Tab')
        page.keyboard.press('Enter')
        page.wait_for_function('S.sheet.feedAdjustOpen === true')
        page.keyboard.press('Tab')
        check('open adjustment Tab reaches the first action', page.locator('[data-feed-adjust] .details-body button').first.evaluate('el => el === document.activeElement'))  # the kind choice leads the adjustments since round 3
        page.keyboard.press('Shift+Tab')
        check('reverse Tab returns from the first action to the summary', page.locator('[data-feed-adjust] summary').evaluate('el => el === document.activeElement'))
        page.evaluate('render()')
        check('keyboard opens adjustments and redraw preserves them', page.locator('[data-feed-adjust]').evaluate('el => el.open'))
        click(page, 'note-open')
        note = page.locator('[data-fid="eventNote"]')
        check('expanded feed note stays outside the secondary row and uses full width', note.is_visible() and not note.locator('xpath=ancestor::*[contains(@class,"feed-secondary")]').count() and note.evaluate('el => el.getBoundingClientRect().width > document.querySelector(".sheet").clientWidth * .85'))
    if kind == 'feed':
        click(page, 'wrong-side')
        page.evaluate("() => {S.sheet.feedAdjustOpen=false;render()}")
        check('side correction keeps adjustments open after redraw', page.locator('[data-feed-adjust]').evaluate('el => el.open') and page.locator('[data-sheet] [data-act=correct-side]').count() == 3)
        click(page, 'change-start', 'feed')
        check('start correction stays visible and closes side correction', page.locator('[data-fid=earlyClock]').is_visible() and page.locator('[data-sheet] [data-act=correct-side]').count() == 0)
    if not page.locator('[data-sheet] [data-act="manual"]').count():
        check(kind + ': active timer offers Manual entry', False)
        return
    click(page, 'manual')
    if kind == 'feed':
        click(page, 'manualSide', 'R')
    page.locator('[data-fid="manualDate"]').fill('2026-11-08')
    type_clock(page, 'manual', '8:00', 'AM')
    if kind == 'feed':
        page.locator('[data-fid="manualDuration"]').fill('60')  # R4: the breast form takes Minutes, not an end time
    else:
        type_clock(page, 'manualEnd', '9:00', 'AM')
    snapshot(page, 'parallel-manual-' + kind)
    with page.expect_response('**/api/events'):
        click(page, 'save')
    page.wait_for_function('!S.busy')
    writes = [(path, body) for path, body in page.calls if body is not None]
    event = writes[-1][1].get('event', {}) if writes else {}
    if event.get('duration') != 60 or event.get('start') != '2026-11-08T14:00:00.000Z':
        print('unexpected manual interval:', writes, flush=True)
    check(kind + ': manual save posts one past interval, not a stop', len(writes) == 1 and writes[0][0] == '/api/events' and event.get('duration') == 60 and event.get('start') == '2026-11-08T14:00:00.000Z')
    check(kind + ': current timer stays active', page.evaluate('S.sleepRun?.id' if kind == 'sleep' else 'S.run?.id') == run['id'])
    if kind == 'feed':
        page.st['permissions']['resources']['timers'].update(change=False, delete=False)
        page.evaluate("() => {S.permissions.resources.timers.change=false;S.permissions.resources.timers.delete=false;S.sheet=null;act('open-feed');render()}")
        page.locator('[data-feed-adjust] summary').click()
        check('adjustments preserve denied timer permissions while allowing manual entry', page.locator('[data-sheet] [data-act=change-start],[data-sheet] [data-act=wrong-side],[data-sheet] [data-act=switch-earlier],[data-sheet] [data-act=stop]').count() == 0 and page.locator('[data-sheet] [data-act=manual]').is_visible())


def recovery(page, undo=False):
    parent, child = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
    corrected, parent_reads, undone = [], [], []
    result = {'status':'finishing','operationId':parent,'eventSaved':True,'warning':'Correct sleep','correctionRequired':True,'sleepOperationId':child,'timerId':'old-sleep','start':(AT-timedelta(hours=26)).isoformat(),'maxEnd':AT.isoformat()}
    def event(route):
        page.calls.append(('/api/events', route.request.post_data_json))
        route.fulfill(json={**result,'state':page.st})
    def operation(route):
        path = route.request.url.split('/api/operations/')[1]
        if path == child+'/undo':
            undone.append(route.request.post_data_json)
            route.fulfill(json={'status':'cancelled','operationId':undone[-1]['operationId'],'state':page.st})
        elif route.request.method == 'POST':
            corrected.append((path, route.request.post_data_json))
            route.fulfill(json={'status':'pending','operationId':child,**({'undoUntil':(AT+timedelta(seconds=10)).isoformat()} if undo else {})})
        elif path == child:
            route.fulfill(json={'status':'pending' if undo else 'saved','operationId':child,'state':page.st})
        else:
            parent_reads.append(path)
            route.fulfill(json=({'status':'saved','operationId':parent,'eventSaved':True,'sleepEnded':not undo,**({'sleepCancelled':True} if undo else {}),'state':page.st} if corrected else result))
    if undo:
        page.st['sleepRun'] = timer('old-sleep')
    page.route('**/api/events', event)
    page.route('**/api/operations/**', operation)
    click(page, 'open-dia')
    click(page, 'dkind', 'W')
    click(page, 'save')
    page.wait_for_function('!S.busy')
    if not page.locator('[data-fid="correctDate"]').count():
        check('saved care opens the sleep correction form', False)
        return
    check('correction defaults within the server 24-hour limit', page.locator('[data-sheet] [data-act="save"]').is_enabled())
    page.locator('[data-fid="correctDate"]').fill('2026-11-09')
    type_clock(page, 'correct', '12:00', 'PM')
    check('correction rejects an end beyond 24 hours', page.locator('[data-sheet] [data-act="save"]').is_disabled())
    check('correction error names the range beside the end clock', page.locator('[data-correction-error]').is_visible() and 'within 24 hours' in page.locator('[data-correction-error]').inner_text() and page.locator('[data-save-hint]').is_hidden())
    snapshot(page, 'care-sleep-correction')
    click(page, 'cancel')
    check('dismiss keeps care saved and does not undo the child', not corrected and len(page.calls) == 1)
    page.locator('[data-act="retry-write"]').click()
    page.locator('[data-fid="correctDate"]').wait_for()
    page.locator('[data-fid="correctDate"]').fill('2026-11-08')
    type_clock(page, 'correct', '11:00', 'AM')
    click(page, 'save')
    if undo:
        page.locator('.toast [data-act="undo"]').wait_for()
        click(page, 'undo')
    page.wait_for_function('Object.keys(S.pendingOps).length===0 && !S.busy')
    check('correction targets child operation with selected end', corrected == [(child+'/correct', {'end':'2026-11-08T17:00:00.000Z'})])
    check(('Undo' if undo else 'corrected child') + ' resumes parent without duplicate care', parent_reads == [parent,parent] and len(page.calls) == 1 and page.locator('[data-sheet]').count() == 0)
    if undo:
        check('Undo targets only the child and preserves the active sleep timer', len(undone) == 1 and page.evaluate('S.sleepRun?.id') == 'old-sleep')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.dry_run:
        print('Synthetic Chromium: manual sleep/feed with active timers; saved-care sleep correction, dismiss, retry, parent completion.')
        return 0
    SHOTS.mkdir(exist_ok=True)
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            for name in ('sleep','feed','recovery','undo'):
                page = fixture(browser, base, 'en', 390)
                try:
                    recovery(page,undo=name == 'undo') if name in ('recovery','undo') else manual(page,name)
                finally:
                    page.context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{sum(ok for _, ok in RESULTS)} passed; {sum(not ok for _, ok in RESULTS)} failed')
    return int(any(not ok for _, ok in RESULTS))


if __name__ == '__main__':
    raise SystemExit(main())
