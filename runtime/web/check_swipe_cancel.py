"""Swipe an action closed through Cancel, with drafts and running timers intact."""
from datetime import datetime
from pathlib import Path
from shutil import which
from playwright.sync_api import sync_playwright
from check_support import browser_engine, launch_browser, open_app, start_static_server
from check_swipe_delete import Touchy


def drag(page, dx, dy=0, selector='.form-head h1', cancel=False):
    page.locator(selector).scroll_into_view_if_needed()
    box = page.locator(selector).bounding_box()
    x = box['x'] + box['width'] * .7
    y = min(400, box['y'] + box['height'] / 2)
    if browser_engine() == 'chromium':
        cdp = page.context.new_cdp_session(page)
        try:
            cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            for i in range(1, 9):
                cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x+dx*i/8,'y':y+dy*i/8}]})
                if i == 4 and getattr(page, 'swipe_shot', None):
                    page.screenshot(path=str(page.swipe_shot))
            cdp.send('Input.dispatchTouchEvent', {'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
        finally:
            cdp.detach()
    else:
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x+dx, y+dy, steps=8)
        if cancel:
            page.dispatch_event('.formscreen', 'pointercancel', {'pointerId':1,'isPrimary':True,'pointerType':'mouse'})
        page.mouse.up()
    page.wait_for_timeout(220)


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=which('agent-browser-chrome'))
            try:
                page = open_app(Touchy(browser, has_touch=True), base, 390, 844, datetime.fromisoformat('2026-11-13T16:47:00-06:00'))
                writes = []
                page.on('request', lambda r: writes.append(r.url) if r.method not in ('GET','HEAD') else None)
                def opened(action="act('open-feed')"):
                    page.evaluate("() => {S.sheet=null;S.drafts={};" + action + ";render();document.querySelector('.formscreen.with-save>.wrap, .formscreen:not(.with-save)').scrollTop=0}")
                opened()
                page.evaluate("""() => {window.actionMoves=[];let origin=0;document.addEventListener('pointerdown',e=>origin=e.clientX);document.addEventListener('pointermove',e=>{if(formDrag?.on)actionMoves.push([e.clientX-origin,new DOMMatrixReadOnly(getComputedStyle(formDrag.node).transform).m41])})}""")
                drag(page, -120)
                assert page.evaluate('S.sheet === null'), 'a left swipe must close Feeding'
                assert page.evaluate('actionMoves.length>0 && actionMoves.every(([dx,offset])=>Math.abs(dx-offset)<1)'), 'the action must follow the finger without easing'
                print('PASS left swipe closes the action')
                for dx, dy, cancel in [(-20,0,False),(100,0,False),(-100,0,True),(-20,-100,False)]:
                    opened()
                    drag(page, dx, dy, cancel=cancel)
                    assert page.evaluate("S.sheet?.kind === 'feed'")
                    assert page.locator('.formscreen').evaluate('e=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m41)<1')
                print('PASS short, right, vertical and cancelled gestures keep the action open')
                opened("act('open-feed');act('ftab','bottle')")
                page.locator('[data-fid="ml"]').fill('90')
                drag(page, -120)
                assert page.evaluate("S.sheet?.kind === 'discard' && S.sheet.draft.ml === 90")
                page.locator('[data-act="keep"]').click()
                assert page.locator('[data-fid="ml"]').input_value() == '90'
                drag(page, -100, selector='[data-fid="ml"]')
                assert page.evaluate("S.sheet?.kind === 'feed'")
                print('PASS swipe uses draft confirmation and ignores number-field gestures')
                opened("act('open-feed');act('ftab','bottle')")
                drag(page, 0, -160, selector='.formscreen')
                if browser_engine() != 'chromium':
                    page.mouse.wheel(0, 160)
                    page.wait_for_timeout(100)
                assert page.locator('.formscreen.with-save>.wrap, .formscreen:not(.with-save)').evaluate('e=>e.scrollTop>0')
                print('PASS the action still scrolls vertically')
                opened()
                page.evaluate('() => {S.busy=true;render()}')
                drag(page, -120)
                assert page.evaluate("S.sheet?.kind === 'feed'")
                page.evaluate('() => {S.busy=false;render()}')
                page.locator('[data-sheet] [data-act="cancel"]').click()
                assert page.evaluate('S.sheet === null')
                print('PASS saving prevents swipe dismissal and the Cancel button still works')
                page.evaluate("() => {S.run={id:'running-test',side:'L',t0:900,by:'Rowan'};act('open-feed');render()}")
                drag(page, -120)
                assert page.evaluate("S.sheet === null && S.run.id === 'running-test'")
                for action in ["act('open-sleep')", "act('open-dia')", "act('open-more')", "act('open-settings')"]:
                    opened(action)
                    drag(page, -120, selector='[data-sheet] h1')
                    assert page.evaluate('S.sheet === null')
                assert not writes and not page.errors
                print('PASS other actions dismiss, running feed survives, and no writes occur')
                page.evaluate('S.run=null')
                evidence = Path(__file__).resolve().parents[2] / '.evidence' / f'swipe-cancel-{browser_engine()}'
                evidence.mkdir(parents=True, exist_ok=True)
                for width, height in [(390,844),(1440,900),(2000,860)]:
                    page.set_viewport_size({'width':width,'height':height})
                    opened()
                    page.screenshot(path=str(evidence / f'before-{width}.png'))
                    if browser_engine() == 'chromium':
                        page.swipe_shot=evidence / f'during-{width}.png'
                    drag(page, -120)
                    assert page.evaluate('S.sheet === null')
                    page.swipe_shot=None
                page.emulate_media(reduced_motion='reduce')
                opened()
                drag(page, -120)
                assert page.evaluate('S.sheet === null')
                print('PASS screen sizes and reduced motion keep dismissal available')
                page.close()
            finally:
                browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
