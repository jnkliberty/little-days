"""Fact carousel behavior in Chrome with sample data and no live writes."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

from datetime import datetime, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-08T12:00:00-06:00')
OUT = Path(__file__).resolve().parents[2] / '.evidence/carousel'

def check(name, value):
    assert value, name
    print('PASS', name, flush=True)

def fact(page):
    return page.locator('.insight').get_attribute('data-fact')

def drag(page, start, end, touch=False):
    """One drag with the mouse, or one touch (a finger) through the browser's own input: pointer events are the same either way."""
    (x0, y0), (x1, y1) = start, end
    if touch:
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
        for step in range(1, 6):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * step / 5, 'y': y0 + (y1 - y0) * step / 5}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        return
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move(x1, y1, steps=6)
    page.mouse.up()

def body_point(page):
    box = page.locator('.insight .fact-body').bounding_box()
    return box['x'] + box['width'] / 2, box['y'] + box['height'] / 2

def audit_drag_tracking(page):
    """Failure cases not covered by release-only swipes: no finger tracking, a release jump, canceled drag, or motion under Reduce Motion."""
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate('()=>{factPaused=true;render()}')
    x, y = body_point(page)
    first = fact(page)
    height = page.locator('.insight').evaluate('e=>e.offsetHeight')
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 25, y, steps=3)
    offset = page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41')
    check('a horizontal drag follows the pointer before release', abs(offset + 25) < 1 and fact(page) == first)
    page.mouse.up()
    check('a short fast drag keeps the 40px threshold and settles back', fact(page) == first and page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>e.getAnimations().some(a=>new DOMMatrixReadOnly(a.effect.getKeyframes().at(-1).transform).m41===0 && a.effect.getTiming().duration<300)'))
    page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>e.getAnimations().forEach(a=>a.finish())')
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 80, y, steps=4)
    page.mouse.up()
    check('a committed swipe keeps the outgoing card at its release position across redraw', fact(page) != first and page.locator('[data-fact-outgoing]').evaluate('e=>Math.abs(new DOMMatrixReadOnly(e.getAnimations()[0].effect.getKeyframes()[0].transform).m41+80)<1'))
    check('dragging and release keep the fixed card height', page.locator('.insight').evaluate('e=>e.offsetHeight') == height)
    page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>e.getAnimations().forEach(a=>{a.pause();a.currentTime=80;})')
    page.locator('[data-fact-outgoing]').evaluate('e=>e.getAnimations().forEach(a=>a.finish())')
    caught = page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41')
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 10, y)
    check('a new drag catches the current position without a jump', page.locator('.fact-content:not([data-fact-outgoing])').evaluate('(e,caught)=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m41-(caught-10))<1', caught))
    page.mouse.up()
    page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>e.getAnimations().forEach(a=>a.finish())')
    current = fact(page)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 30, y, steps=3)
    page.evaluate("()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:factSwipe.id}))")
    page.mouse.up()
    check('pointer cancellation clears drag state and keeps the fact', fact(page) == current and page.evaluate('factSwipe===null') and page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>e.style.transform===""'))
    page.emulate_media(reduced_motion='reduce')
    x, y = body_point(page)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 80, y, steps=4)
    check('reduced motion keeps the card still during a drag', page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>getComputedStyle(e).transform==="none"'))
    page.mouse.up()
    check('reduced motion retains swipe navigation without release motion', fact(page) != current and page.locator('.fact-content:not([data-fact-outgoing])').evaluate('e=>e.getAnimations().length===0') and page.locator('[data-fact-outgoing]').count() == 0)

def audit_swipe(page):
    """Owner 2026-11-11: "for the carousel can we make it swipeable... so i don't have to click the arrows".
    Failure case: no swipe at all, a swipe that moves the wrong way, a vertical drag or a short drag that moves the fact, or a swipe that presses a button under the finger."""
    x, y = body_point(page)
    check('the card keeps vertical page scroll: touch-action is pan-y', page.locator('.insight').evaluate('e=>getComputedStyle(e).touchAction') == 'pan-y')
    start = fact(page)
    page.locator('[data-act=fact-next]').click()
    via_arrow = fact(page)
    page.locator('[data-act=fact-previous]').click()
    page.evaluate('()=>{factPaused=false}')
    drag(page, (x + 40, y), (x - 40, y))
    check('swipe left shows the next fact, the one the Next arrow shows', fact(page) != start and fact(page) == via_arrow)
    check('a swipe is a manual move: it pauses the rotation as an arrow tap does', page.evaluate('factPaused') is True)
    x, y = body_point(page)
    drag(page, (x - 40, y), (x + 40, y))
    check('swipe right shows the previous fact', fact(page) == start)
    x, y = body_point(page)
    drag(page, (x, y), (x - 20, y))
    check('a 20 px drag does not move the fact', fact(page) == start)
    drag(page, (x, y - 30), (x - 50, y + 30))
    check('a drag that is more vertical than horizontal does not move the fact', fact(page) == start)
    drag(page, (x, y - 30), (x + 4, y + 50))
    check('a vertical drag does not move the fact', fact(page) == start)
    cdp_start = fact(page)
    drag(page, (x + 40, y), (x - 40, y), touch=True)
    check('a finger swipe left moves the fact', fact(page) != cdp_start)
    drag(page, (x - 40, y), (x + 40, y), touch=True)
    check('a finger swipe right moves it back', fact(page) == cdp_start)
    # A swipe that starts and ends on one button must not press it. Each button is tried on the fact that has it.
    page.evaluate('()=>{factPaused=true}')
    pages_before = len(page.context.pages)
    for label, selector, wants in [('Ask', '.insight [data-act=ask-ai]', 'record'), ('View log', '.insight [data-act=fact-log]', 'record'), ('Source', '.insight a[href^="https://"]', 'source')]:
        for _ in range(8):
            if page.locator(selector).count():
                break
            page.locator('[data-act=fact-next]').click()
        box = page.locator(selector).bounding_box()
        here = fact(page)
        drag(page, (box['x'] + 4, box['y'] + box['height'] / 2), (box['x'] + min(box['width'] - 4, 48), box['y'] + box['height'] / 2))
        page.wait_for_timeout(500)
        check(f'a swipe that starts on {label} does not press it', page.evaluate("S.tab") == 'home' and not page.evaluate('S.sheet') and len(page.context.pages) == pages_before)
        check(f'a swipe that starts on {label} still moves the fact', fact(page) != here)
        page.evaluate("()=>{S.factId=factPool()[0].id;render()}")
    page.locator('.insight [data-act=ask-ai]').click()
    check('a plain tap on Ask still works after swipes', page.evaluate('S.tab') == 'chat')
    page.evaluate("()=>{S.tab='home';render()}")

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server, base = start_static_server()
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, channel='chrome')
            try:
                for width, height, lang in [(390,844,'en'),(1440,900,'en'),(2000,860,'en'),(390,844,'es')]:
                    page = open_app(browser, base, width, height, AT, lang=lang, development=True)
                    page.clock.install(time=AT)
                    page.clock.pause_at(AT + timedelta(seconds=1))
                    page.reload()
                    page.locator('.insight').wait_for()
                    first = fact(page)
                    page.clock.run_for(6999)
                    check('fact remains for seven seconds', fact(page) == first)
                    page.clock.run_for(1)
                    second = fact(page)
                    page.screenshot(path=str(OUT/f'playing-{width}-{lang}.png'), animations='disabled')
                    check('timer advances to another fact', second != first)
                    check('daily records alternate with age-based guidance', first.startswith('record:') and second.startswith('source:'))
                    check('one active position dot', page.locator('.fact-dot.current').count() == 1)
                    check('position is named for screen readers', '{' not in page.locator('.fact-dots').get_attribute('aria-label'))
                    page.locator('.insight').hover()
                    page.clock.run_for(14000)
                    check('hover pauses rotation', fact(page) == second)
                    page.mouse.move(0,0)
                    page.clock.run_for(7000)
                    check('leaving hover restarts rotation', fact(page) != second)
                    before_manual = fact(page)
                    page.locator('[data-act=fact-next]').click()
                    next_fact = fact(page)
                    page.locator('[data-act=fact-previous]').click()
                    check('Previous returns to the fact before Next', fact(page) == before_manual and next_fact != before_manual)
                    page.mouse.move(0,0)
                    page.locator('[data-act=fact-previous]').evaluate('(el)=>el.blur()')
                    page.clock.run_for(14000)
                    check('manual navigation stays paused', fact(page) == before_manual)
                    page.locator('[data-act=fact-pause]').click()
                    page.mouse.move(0,0)
                    page.locator('[data-act=fact-pause]').evaluate('(el)=>el.blur()')
                    page.clock.run_for(7000)
                    check('Play resumes rotation', fact(page) != before_manual)
                    focused = fact(page)
                    page.locator('.insight [data-act=ask-ai]').focus()
                    page.clock.run_for(7000)
                    check('keyboard focus pauses rotation', fact(page) == focused)
                    page.locator('.insight [data-act=ask-ai]').evaluate('(el)=>el.blur()')
                    page.emulate_media(reduced_motion='reduce')
                    page.clock.run_for(14000)
                    check('reduced motion stops automatic rotation', fact(page) == focused)
                    page.locator('[data-act=fact-next]').click()
                    check('reduced motion retains manual navigation', fact(page) != focused)
                    check('carousel controls have 44px targets', page.locator('.fact-navigation button').evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44)'))
                    check('no horizontal overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    page.mouse.move(0,0)
                    page.locator('[data-act=fact-next]').evaluate('(el)=>el.blur()')
                    page.screenshot(path=str(OUT/f'after-{width}-{lang}.png'))
                    ids=[]
                    for _ in range(page.locator('.fact-dot').count()):
                        ids.append(fact(page))
                        page.locator('[data-act=fact-next]').click()
                    check('one full cycle visits every fact and wraps', len(ids)==len(set(ids)) and fact(page)==ids[0])
                    if width == 390 and lang == 'en':
                        audit_drag_tracking(page)
                        audit_swipe(page)
                        page.emulate_media(reduced_motion='no-preference')
                        page.evaluate('()=>{factPaused=false;document.activeElement.blur();render()}')
                        page.mouse.move(0,0)
                        page.locator('[data-act=open-feed]').click()
                        before_sheet=page.evaluate('S.factId')
                        page.clock.run_for(14000)
                        check('an open form stops rotation', page.evaluate('S.factId') == before_sheet)
                        page.locator('[data-sheet] [data-act=cancel]').click()
                        page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))}")
                        hidden=page.evaluate('S.factId')
                        page.clock.run_for(14000)
                        check('a hidden page stops rotation', page.evaluate('S.factId') == hidden)
                        page.st['entries']=[{'id':'one','type':'feed','side':'L','dur':10,'t':600}]
                        page.st['child']['birthDate']=None  # no birth date: the server sends no daily guidance, so the page drops its batch below
                        page.evaluate("()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))}")
                        page.evaluate("()=>{S.entries=[{id:'one',type:'feed',side:'L',dur:10,t:600}];S.child={...S.child,birthDate:null};S.developmentBatch=null;S.factId='';factPaused=false;render()}")
                        single=fact(page)
                        page.clock.run_for(14000)
                        check('one fact shows no arrows, dots, or Pause and stays visible', bool(single) and fact(page)==single and page.locator('[data-act=fact-next], [data-act=fact-previous], .fact-dots, [data-act=fact-pause]').count()==0)
                        x, y = body_point(page)
                        drag(page, (x + 40, y), (x - 40, y))
                        drag(page, (x - 40, y), (x + 40, y), touch=True)
                        check('swipes on a one-fact card do nothing', fact(page) == single and page.evaluate('factPaused') is False)
                        if page.locator('.insight [data-act=fact-log]').count():
                            # With one fact the card does not redraw, so the click after the drag reaches the button itself: the guard is what stops it.
                            box = page.locator('.insight [data-act=fact-log]').bounding_box()
                            drag(page, (box['x'] + 4, box['y'] + box['height'] / 2), (box['x'] + 48, box['y'] + box['height'] / 2))
                            check('a swipe that starts and ends on View log does not open the Timeline', page.evaluate('S.tab') == 'home')
                        page.st['entries']=[]
                        page.evaluate("()=>{S.entries=[];S.factId='';render()}")
                        page.clock.run_for(7000)
                        check('empty facts keep the empty state and show no navigation', fact(page)=='' and page.locator('[data-act=fact-next], .fact-dots, [data-act=fact-pause]').count()==0 and page.locator('.fact-dot').count()==0)
                    check('no browser errors', not page.errors)
                    page.context.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
