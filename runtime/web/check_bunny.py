"""Wave 6 browser checks: bunny idle motion (Home header, Chat, empty states) and the save reaction.

Test-only mocked server responses; nothing here reaches a live app. Run it from this folder with the Playwright Python:
  python check_bunny.py

Done-check from the plan: motion runs, stops off screen, is still when the phone asks for reduced motion, and no layout shift at 390 px.
"""
import re
from datetime import datetime

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server
from forms_support import save_diaper
from check_ui import navigate

PASS = 0
FAIL = 0
NOON = datetime.fromisoformat("2026-11-03T12:00:00-06:00")


def check(name, condition, detail=None):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name}" + (f": {detail}" if detail is not None else ""))


def guarded(audit, *args):
    try:
        audit(*args)
    except Exception as error:  # noqa: BLE001
        check(f"{audit.__name__} ran without error ({type(error).__name__})", False, str(error)[:200])


RUNNING = """(sel) => [...document.querySelector(sel).getAnimations({subtree: true})].filter(a => a.playState === 'running').map(a => a.animationName || a.id || 'web')"""
ALL_PAUSED = """(sel) => [...document.querySelector(sel).getAnimations({subtree: true})].every(a => a.playState !== 'running')"""


def audit_home_idle(browser, base):
    """Failure case: a Home bunny with no motion, or motion with no rule for when it stops."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    bunny = page.locator('.top .bunny[data-idle]')
    check("W6 Home header has one bunny with idle motion on", bunny.count() == 1 and bunny.get_attribute('aria-hidden') == 'true')
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    names = page.evaluate(RUNNING, '.top .bunny')
    check(f"W6 Home bunny breathes and blinks while on screen: {names}", 'bunny-breathe' in names and 'bunny-blink' in names)
    check("W6 the ear twitch is scheduled while the bunny is on screen", page.evaluate("LittleDaysBunny.scheduled()") is True)
    page.evaluate("LittleDaysBunny.twitch()")
    twitch = page.evaluate("""() => { const a = document.querySelector('.top .bunny-ear-r').getAnimations().at(-1); if (!a) return null;
        return {props: [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))], ms: a.effect.getTiming().duration}; }""")
    check(f"W6 the ear twitch moves transform only and takes under 300 ms: {twitch}", bool(twitch) and twitch['props'] == ['transform'] and twitch['ms'] < 300)
    page.context.close()


def audit_header_date_only(browser, base):
    """Owner 2026-11-11: "date is fine but time is unnecessary". Failure case: a time of day, or a second line, beside the date in the Home header."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    when = page.locator('.top .when')
    text = when.inner_text().strip()
    check(f"N2 the Home header shows the date only: {text!r}", text == "Tue, Nov 3")
    check("N2 the Home header has no time of day (no 12-hour clock text, no line break)", not re.search(r"\d:\d\d|\b[AP]M\b", page.locator('.top').inner_text()) and when.evaluate("e => e.querySelector('br') === null"))
    page.context.close()


def audit_header_size_and_timing(browser, base):
    """Owner 2026-11-11: "can the rabbit logo be a bit larger ... or make it a tad faster". Failure case: a header bunny under 64 px, a header that wraps to two rows at 320 px, or idle timings that are still the old 3.2 s and 5.6 s."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    size = page.locator('.top .bunny').evaluate("e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]")
    check(f"N1 the Home header bunny is 64 px: {size}", size == [64, 64])
    timing = page.evaluate("""() => Object.fromEntries(document.querySelector('.top .bunny').getAnimations({subtree: true}).filter(a => a.animationName).map(a => [a.animationName, a.effect.getTiming().duration]))""")
    check(f"N1 the idle loop is about 25 percent faster: breathe 2400 ms, blink 4200 ms: {timing}", timing.get('bunny-breathe') == 2400 and timing.get('bunny-blink') == 4200)
    page.context.close()
    for name in ("Luna", "Josephine"):
        page = open_app(browser, base, 320, 700, NOON, theme="off")
        page.evaluate("name => { S.child = {...S.child, name}; render(); }", name)
        rows = page.evaluate("""() => { const t = e => document.querySelector(e).getBoundingClientRect(); const top = t('.top');
            return {top: Math.round(top.height), bunny: [Math.round(t('.top .bunny').width), Math.round(t('.top .bunny').height)], name: Math.round(t('.top h1').top - top.top), when: Math.round(t('.top .when').top - top.top), whenRight: Math.round(top.right - t('.top .when').right), over: document.documentElement.scrollWidth > innerWidth}; }""")
        check(f"N1 320 px, name {name}: the bunny, the name and the date share one row, no sideways scroll: {rows}", rows['top'] <= 64 and rows['bunny'] == [64, 64] and rows['when'] < 40 and rows['name'] < 40 and not rows['over'])
        page.context.close()


def audit_tap_reaction(browser, base):
    """Owner 2026-11-11: "add more animations to it". Failure case: a header bunny that is not a button with a name and a 44 px target, a tap that does nothing, a hop that is not transform-only, or a tap that moves anything under reduced motion."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    button = page.locator('.top button.bunny-btn')
    box = button.bounding_box() if button.count() == 1 else {'width': 0, 'height': 0}
    name = button.get_attribute('aria-label') if button.count() == 1 else None
    check(f"N1 the header bunny is one button with an accessible name and a target of 44 px or more: {name!r} {box['width']}x{box['height']}", bool(name) and box['width'] >= 44 and box['height'] >= 44 and button.locator('svg.bunny').count() == 1)
    check("N1 no tap reaction runs on page load", page.evaluate("document.getAnimations().filter(a => ['bunny-tap', 'bunny-react'].includes(a.id)).length") == 0)
    button.click()
    got = page.evaluate("""() => { const all = document.querySelector('.top .bunny').getAnimations({subtree: true}).filter(a => a.id === 'bunny-tap');
        return {n: all.length, props: [...new Set(all.flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)))))], max: Math.max(...all.map(a => a.effect.getTiming().duration)), targets: all.map(a => a.effect.target.getAttribute('class') || 'svg')}; }""")
    check(f"N1 a tap hops the bunny and wiggles both ears, transform only, each under 300 ms: {got}", got['n'] == 3 and got['props'] == ['transform'] and got['max'] < 300 and any('ear-l' in t for t in got['targets']) and any('ear-r' in t for t in got['targets']))
    page.wait_for_timeout(400)
    check("N1 the tap reaction ends by itself", page.evaluate("document.getAnimations().filter(a => a.id === 'bunny-tap').length") == 0)
    page.locator('.top .bunny-btn').focus()
    page.keyboard.press('Enter')
    check("N1 the keyboard (Enter) plays the same reaction", page.evaluate("document.getAnimations().filter(a => a.id === 'bunny-tap').length") == 3)
    page.context.close()

    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function("LittleDaysBunny.scheduled() === false")
    page.locator('.top .bunny-btn').click()
    check("N1 reduced motion: a tap on the bunny starts no animation", page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length") == 0)
    page.context.close()

    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    page.evaluate("() => { LittleDaysBunny.tap(document.querySelector('.bunny-btn')); document.getAnimations().filter(a => a.id === 'bunny-tap').forEach(a => { a.playbackRate = 0.001; }); window.render = () => {}; }")
    page.emulate_media(reduced_motion='reduce')
    # Wait for the browser to deliver the preference change (a loaded machine delays it); the reaction must then be gone.
    try:
        page.wait_for_function("document.getAnimations().filter(a => a.id === 'bunny-tap').length === 0", timeout=3000)
    except Exception:  # noqa: BLE001
        pass
    left = page.evaluate("document.getAnimations().filter(a => a.id === 'bunny-tap').length")
    check(f"N1 reduced motion turned on mid-reaction: the tap reaction is cancelled: {left}", left == 0)
    page.context.close()


def audit_stops_off_screen(browser, base):
    """Failure case: the bunny keeps breathing, or the twitch timer keeps running, after it scrolls out of view or the page hides."""
    page = open_app(browser, base, 390, 420, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    room = page.evaluate("(() => { const s = document.querySelector('[data-scroll]'); return s.scrollHeight - s.clientHeight; })()")
    check(f"W6 the short Home screen scrolls far enough to hide the header: {room}", room > 120)
    page.evaluate("document.querySelector('[data-scroll]').scrollTop = 10000")
    page.wait_for_function("!document.querySelector('.top .bunny').classList.contains('is-visible')")
    check("W6 off screen: every bunny animation is paused", page.evaluate(ALL_PAUSED, '.top .bunny'))
    check("W6 off screen: no twitch is scheduled and a twitch call does nothing", page.evaluate("LittleDaysBunny.scheduled()") is False
          and page.evaluate("(() => { LittleDaysBunny.twitch(); return document.querySelector('.top .bunny-ear-r').getAnimations().length; })()") == 0)
    page.evaluate("document.querySelector('[data-scroll]').scrollTop = 0")
    page.wait_for_function("document.querySelector('.top .bunny').classList.contains('is-visible')")
    check("W6 back on screen: the motion runs again", 'bunny-breathe' in page.evaluate(RUNNING, '.top .bunny') and page.evaluate("LittleDaysBunny.scheduled()") is True)
    page.evaluate("() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange')); }")
    page.wait_for_function("document.documentElement.hasAttribute('data-page-hidden')")
    check("W6 hidden page: animations pause and no twitch is scheduled", page.evaluate(ALL_PAUSED, '.top .bunny') and page.evaluate("LittleDaysBunny.scheduled()") is False)
    page.context.close()


def audit_reduced_motion(browser, base):
    """Failure case: any bunny motion under prefers-reduced-motion, including the save reaction."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function("LittleDaysBunny.scheduled() === false")
    bunny = page.locator('.top .bunny')
    check("W6 reduced motion: the bunny stays on screen with no running animation", bunny.is_visible() and page.evaluate(RUNNING, '.top .bunny') == [])
    page.evaluate("LittleDaysBunny.twitch(); LittleDaysBunny.react()")
    check("W6 reduced motion: a twitch and a save reaction start nothing", page.evaluate("document.querySelector('.top .bunny').getAnimations({subtree: true}).filter(a => a.playState === 'running').length") == 0)
    page.locator('.tile[data-act="open-dia"]').click()
    save_diaper(page)  # R4: pick Wet, then Save diaper
    page.wait_for_function("!document.querySelector('[data-sheet]')")
    page.wait_for_timeout(300)
    check("W6 reduced motion: saving a record leaves the bunny still", page.evaluate(RUNNING, '.top .bunny') == [])
    page.context.close()


def audit_no_layout_shift(browser, base):
    """Failure case: the bunny motion moves the name, the date or the first tile at 390 px."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.evaluate("""() => { window.__shift = 0; new PerformanceObserver(list => list.getEntries().forEach(e => { window.__shift += e.value; })).observe({type: 'layout-shift', buffered: true}); }""")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    # A transform moves the drawing but not the layout, so the bunny itself is read by its layout box (offset*), the rest by their boxes.
    probe = """() => ['.top', '.top h1', '.top .when', '.tile'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, r.x, r.y, r.width, r.height].join(); }).join('|') + '|' + ((e) => [e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight].join())(document.querySelector('.top .bunny'))"""
    before = page.evaluate(probe)
    seen = set()
    for step in range(14):
        if step == 3:
            page.evaluate("LittleDaysBunny.twitch()")
        if step == 7:
            page.evaluate("LittleDaysBunny.react()")
        seen.add(page.evaluate(probe))
        page.wait_for_timeout(120)
    check(f"W6 390 px: the header and the first tile keep the same box through breathing, blink, twitch and reaction ({len(seen)} readings)", seen == {before})
    shift = page.evaluate("window.__shift")
    check(f"W6 390 px: the browser reports no layout shift: {shift}", shift == 0)
    page.context.close()


def audit_save_reaction(browser, base):
    """Failure case: no feedback from the bunny when a record saves, or a reaction that is not a short transform."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    page.locator('.tile[data-act="open-dia"]').click()
    save_diaper(page)  # R4: pick Wet, then Save diaper
    page.wait_for_function("!document.querySelector('[data-sheet]')")
    page.wait_for_function("document.querySelector('.top .bunny')?.getAnimations().some(a => a.id === 'bunny-react')", timeout=2000)
    got = page.evaluate("""() => { const a = document.querySelector('.top .bunny').getAnimations().find(a => a.id === 'bunny-react');
        return {props: [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))], ms: a.effect.getTiming().duration, running: document.querySelectorAll('.bunny').length}; }""")
    check(f"W6 saving a record makes the Home bunny hop once: transform only, under 300 ms: {got}", got['props'] == ['transform'] and got['ms'] < 300)
    wiggle = page.evaluate("""() => document.querySelector('.top .bunny').getAnimations().find(a => a.id === 'bunny-react').effect.getKeyframes().some(k => /rotate/.test(k.transform || ''))""")
    check("N1 the save reaction is a hop with a short happy wiggle (the keyframes turn the bunny)", wiggle)
    page.context.close()


def audit_one_hop_per_save(browser, base):
    """Codex Wave 6 round 1, P2 1: one save is one hop. A save with an Undo deadline once hopped when the toast appeared and again when the Undo window ended. A plain message is not a save and does not hop."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    page.evaluate("() => { window.__hops = 0; const react = LittleDaysBunny.react; LittleDaysBunny.react = (...args) => { window.__hops += 1; return react(...args); }; }")

    # The completion path every save goes through: a save with an Undo window, shown for 1.2 s, then the plain message.
    page.evaluate("() => announceSaved({undoUntil: new Date(Date.now() + 1200).toISOString()}, 'op-1', 'Saved', {})")
    page.wait_for_timeout(2600)
    hops = page.evaluate("window.__hops")
    check(f"W6 a save with an Undo window hops once, not again when the window ends: {hops}", hops == 1, hops)
    page.evaluate("() => { window.__hops = 0; showDone('Plain message'); }")
    page.wait_for_timeout(300)
    check("W6 a plain message that is not a save does not hop", page.evaluate("window.__hops") == 0)
    page.context.close()


def audit_reduced_motion_cancels_moves(browser, base):
    """Codex Wave 6 round 1, P2 2: when reduced motion turns on in the middle of a hop or a twitch, the running move is cancelled, not only the timer."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.wait_for_function("document.querySelector('.top .bunny')?.classList.contains('is-visible')")
    # Slow both moves down so they are still running when the preference changes.
    page.evaluate("() => { LittleDaysBunny.react(); LittleDaysBunny.twitch(); document.getAnimations().filter(a => ['bunny-react', 'bunny-twitch'].includes(a.id)).forEach(a => { a.playbackRate = 0.001; }); }")
    moving = page.evaluate("() => document.querySelector('.top .bunny').getAnimations({subtree: true}).filter(a => ['bunny-react', 'bunny-twitch'].includes(a.id) && a.playState === 'running').map(a => a.id)")
    check(f"W6 a hop and a twitch are running before the preference changes: {moving}", sorted(moving) == ['bunny-react', 'bunny-twitch'])
    # The Home screen redraws when the preference changes, and a redraw would remove the moves by accident. Stop the redraw so only the bunny code can cancel them.
    page.evaluate("() => { window.render = () => {}; }")
    page.emulate_media(reduced_motion='reduce')
    # The change event reaches the bunny code a few ms later, so wait up to 2 s for the moves to go. They must still go: a move that never stops fails here.
    try:
        page.wait_for_function("() => document.getAnimations().every(a => !['bunny-react', 'bunny-twitch'].includes(a.id))", timeout=2000)
    except Exception:  # noqa: BLE001
        pass
    left = page.evaluate("() => document.getAnimations().filter(a => ['bunny-react', 'bunny-twitch'].includes(a.id)).map(a => a.id + ':' + a.playState)")
    check(f"W6 reduced motion turned on mid-move: the hop and the twitch are cancelled: {left}", left == [])
    page.context.close()


def audit_chat_and_empty_states(browser, base):
    """Failure case: no bunny in an empty Chat or an empty Photos screen, or one that does not move."""
    page = open_app(browser, base, 390, 844, NOON, theme="off")
    page.st["entries"] = []
    page.reload()
    page.locator('.tile[data-act="open-feed"]').wait_for()
    navigate(page, "photos")  # R5 (look match): the Timeline's empty day is a heading and one line, so the empty-state bunny is checked on Photos
    bunny = page.locator('.empty-state .bunny[data-idle]')
    page.wait_for_function("document.querySelector('.empty-state .bunny')?.classList.contains('is-visible')")
    size = bunny.evaluate("e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]")
    check(f"W6 an empty Photos screen shows a 48 px bunny that breathes: {size}", bunny.count() == 1 and size == [48, 48] and 'bunny-breathe' in page.evaluate(RUNNING, '.empty-state .bunny'))
    check("W6 the empty state keeps its words and its action", page.locator('.empty-state p').inner_text().strip() != "")
    page.evaluate("S.tab='chat';render()")
    page.wait_for_function("document.querySelector('.chat-blank .bunny')?.classList.contains('is-visible')")
    box = "() => { const r = document.querySelector('.chat-blank').getBoundingClientRect(); const b = document.querySelector('.chat-blank .bunny').getBoundingClientRect(); return [r.x, r.y, r.width, r.height, b.width, b.height].join(); }"
    first = page.evaluate(box)
    page.evaluate("LittleDaysBunny.twitch()")
    page.wait_for_timeout(500)
    check(f"W6 an empty Chat shows a 48 px bunny that breathes, and the text does not move: {first}", first.endswith(",48,48") and page.evaluate(box) == first and 'bunny-breathe' in page.evaluate(RUNNING, '.chat-blank .bunny'))
    check("W6 the empty Chat keeps its sentence", page.locator('.chat-blank').inner_text().strip() != "")
    page.context.close()


def audit_settings_bunny(pw, base):
    """Failure case (owner, 2026-11-18, iPhone): the Settings bunny filled the Baby row and covered the name and Change photo.
    Chromium shrinks an SVG with no size to 40 px, so the check also runs in WebKit, the iPhone engine."""
    for engine in ("chromium", "webkit"):
        other = launch_browser(pw, engine)
        page = open_app(other, base, 390, 844, NOON)
        page.locator('[data-act="open-settings"]').click()
        size = page.locator('.settings-bunny').evaluate("e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]")
        check(f"Settings bunny is 48 x 48 px in {engine}: {size}", size == [48, 48])
        other.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            for audit in (audit_home_idle, audit_header_date_only, audit_header_size_and_timing, audit_tap_reaction, audit_stops_off_screen, audit_reduced_motion, audit_no_layout_shift, audit_save_reaction, audit_one_hop_per_save, audit_reduced_motion_cancels_moves, audit_chat_and_empty_states):
                guarded(audit, browser, base)
            browser.close()
            guarded(audit_settings_bunny, pw, base)
    finally:
        server.shutdown()
        server.server_close()
    print(f"\n{PASS} passed, {FAIL} failed")
    return int(bool(FAIL))


if __name__ == "__main__":
    raise SystemExit(main())
