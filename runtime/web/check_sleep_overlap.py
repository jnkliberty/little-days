"""Owner 2026-11-19: a sleep save that crosses a saved sleep showed "Baby Buddy rejected this entry." 35 times in 8 days.

Proven case (Nov 16): a manual sleep 9:40 AM to 1:00 PM crossed a 6 min sleep saved from 9:39:05 to 9:45:00.
The error now names the saved sleep in the adult's language and says how to fix it. No button deletes anything.
Failure cases: the generic text or the English server text shown; any button on the error; "a. m." that can break across
lines; a doubled period after "a. m."; a stop refused after Undo that loses the sleep's name.
"""
import os
import shutil
import time
from datetime import datetime

os.environ["TZ"] = "America/Mexico_City"
time.tzset()
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-16T14:00:00-06:00')
SHOTS = os.environ.get('OVERLAP_SHOTS')
CONFLICT = {'id': 'sleep:42', 'start': '2026-11-16T15:39:05.000Z', 'end': '2026-11-16T15:45:00.000Z'}
SERVER_TEXT = 'This time overlaps the sleep saved from 9:39 to 9:45 AM. Change the start or end, or delete that sleep in the timeline.'
NB = ' '
TEXT = {
    'en': f'This overlaps the sleep from 9:39 to 9:45{NB}AM. Change the start or end, or delete that sleep in the timeline.',
    'es': f'Se cruza con el sueño de 9:39 a 9:45{NB}a.{NB}m. Cambie el inicio o el final, o borre ese sueño en el Historial.',
}
FAILS = []


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def status(page):
    return page.evaluate("""() => { const box = document.querySelector('[data-status]');
        return {text: box?.querySelector('p')?.textContent || '', buttons: box ? box.querySelectorAll('button').length : -1}; }""")


def shoot(page, name):
    if not SHOTS:
        return
    os.makedirs(SHOTS, exist_ok=True)
    page.locator('[data-status]').scroll_into_view_if_needed()
    page.screenshot(path=os.path.join(SHOTS, f'{name}.png'))


def flow_manual(browser, base, lang, theme):
    page = open_app(browser, base, 390, 844, AT, lang=lang, theme=theme)
    page.set_default_timeout(4000)
    posts = []

    def events(route):
        posts.append(route.request.post_data_json)
        route.fulfill(status=400, json={'error': SERVER_TEXT, 'code': 'sleep_overlap', 'conflicts': [CONFLICT]})

    page.route('**/api/events', events)
    page.locator('.tile[data-act="open-sleep"]').click()
    page.locator('[data-sheet] [data-act="manual"]').click()
    for fid, text in (('manualClock', '9:40 AM'), ('manualEndClock', '1:00 PM')):
        page.locator(f'[data-fid="{fid}"]').fill(text)
        page.locator(f'[data-fid="{fid}"]').blur()
    save = page.locator('[data-sheet] [data-act="save"]')
    save.scroll_into_view_if_needed()
    save.click()
    page.wait_for_function('!S.busy && !!document.querySelector("[data-status]")')
    s = status(page)
    check(f'{lang} {theme}: the error names the saved sleep and the fix ({s["text"]!r})', s['text'] == TEXT[lang])
    check(f'{lang} {theme}: the error has no button', s['buttons'] == 0)
    check(f'{lang} {theme}: the form stays open for a change and nothing else is sent', page.locator('[data-sheet]').count() == 1 and len(posts) == 1 and 'replace' not in posts[0])
    check(f'{lang} {theme}: no page errors ({page.errors})', not page.errors)
    shoot(page, f'message-{lang}-{theme}-390')
    page.context.close()


def flow_late_stop(browser, base, lang):
    """A stop refused after Undo (another phone saved a sleep meanwhile) still names that sleep."""
    page = open_app(browser, base, 390, 844, AT, lang=lang, theme='off')
    page.set_default_timeout(4000)
    failed = {'status': 'failed', 'operationId': 'op-late', 'error': 'The timer entry was not saved. Check its start and end times, then try again.', 'code': 'sleep_overlap', 'conflicts': [CONFLICT]}
    page.evaluate("result => finalOperation(result, () => t('savedSleep'), {})", failed)
    s = status(page)
    check(f'{lang}: a stop refused after Undo names the saved sleep ({s["text"]!r})', s['text'] == TEXT[lang])
    page.context.close()


def flow_correction(browser, base, lang):
    """Codex r2: a Stop or Pause end corrected to 9:50 AM yesterday crosses the saved 9:39 to 9:45 AM sleep."""
    page = open_app(browser, base, 390, 844, AT, lang=lang, theme='off')
    page.set_default_timeout(4000)
    page.route('**/api/operations/op-c/correct', lambda route: route.fulfill(status=400, json={'error': 'This nap overlaps the sleep saved from 9:39 AM to 9:45 AM. Choose an end before that sleep starts, or delete that sleep.', 'code': 'sleep_overlap', 'conflicts': [CONFLICT]}))
    page.evaluate("""() => { const c = localClock('2026-11-15T15:50:00.000Z');
        S.sheet = {kind: 'correction', operationId: 'op-c', start: '2026-11-15T15:00:00.000Z', maxEnd: '2026-11-16T15:00:00.000Z', date: c.date, hour: c.hour, minute: c.minute, period: c.period}; render(); }""")
    page.evaluate('saveCorrection(S.sheet)')
    page.wait_for_function('!S.busy && !!document.querySelector("[data-status]")')
    s = status(page)
    check(f'{lang}: a corrected end over a saved sleep names that sleep ({s["text"]!r})', s['text'] == TEXT[lang])
    page.context.close()


def flow_lost_stop(browser, base, lang):
    """Codex r2: the Stop reply is lost, and the later check finds the stop refused for an overlap."""
    page = open_app(browser, base, 390, 844, AT, lang=lang, theme='off')
    page.set_default_timeout(4000)
    page.route('**/api/operations/op-lost', lambda route: route.fulfill(json={'status': 'failed', 'operationId': 'op-lost', 'error': 'The timer entry was not saved. Check its start and end times, then try again.', 'code': 'sleep_overlap', 'conflicts': [CONFLICT]}))
    page.evaluate("recoverWrite(Object.assign(new Error('lost'), {operationId: 'op-lost'}), () => t('savedSleep'), {})")
    page.wait_for_function('!!document.querySelector("[data-status]")')
    s = status(page)
    check(f'{lang}: a lost Stop refused for an overlap names the saved sleep ({s["text"]!r})', s['text'] == TEXT[lang])
    check(f'{lang}: a lost Stop refused for an overlap offers no Check again', s['buttons'] == 0 and page.evaluate("!S.pendingOps?.['op-lost']"))
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for lang in ('en', 'es'):
                    for name, flow in [(f'manual {theme}', lambda theme=theme: flow_manual(browser, base, lang, theme)) for theme in ('off', 'on')] + [('late stop', lambda: flow_late_stop(browser, base, lang)), ('correction', lambda: flow_correction(browser, base, lang)), ('lost stop', lambda: flow_lost_stop(browser, base, lang))]:
                        try:
                            flow()
                        except Exception as error:  # a timeout is a failed check, not a crash
                            check(f'{name} {lang} completed ({type(error).__name__}: {str(error)[:160]})', False)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
