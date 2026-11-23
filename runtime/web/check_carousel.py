"""Fact carousel behavior in Chrome with sample data and no live writes."""
import os
import re
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-08T12:00:00-06:00')
OUT = Path(__file__).resolve().parents[2] / '.evidence/carousel'

def check(name, value):
    assert value, name
    print('PASS', name, flush=True)

def fact(page):
    return page.locator('.insight').get_attribute('data-fact')

def turn_ms(page):
    """The auto-turn time of the shown card: 12 s for a graph card, 7 s for a text card (owner, 2026-11-19)."""
    return 12000 if page.locator('.insight .fact-content .fact-viz').count() else 7000

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
    return page.locator('.insight .fact-content:not([data-fact-outgoing]) .fact-body').evaluate('e=>{'
        'e.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});'
        'const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}')

def audit_drag_tracking(page):
    """Failure cases not covered by release-only swipes: no finger tracking, a release jump, canceled drag, or motion under Reduce Motion."""
    page.emulate_media(reduced_motion='no-preference')
    page.wait_for_function('!factMotion.matches&&!homeReading&&!growthPending&&!refreshingDay')
    page.evaluate('()=>{factPaused=true;render()}')
    x, y = body_point(page)
    first = fact(page)
    height = page.locator('.insight').evaluate('e=>e.offsetHeight')
    page.mouse.move(x, y)
    page.mouse.down()
    press = page.evaluate('factSwipe && {origin:factSwipe.origin, current:factSwipe.content.isConnected, several:factSwipe.several}')
    check(f'a pointer press starts on the current fact at rest ({press})', press and press['current'] and press['several'] and abs(press['origin']) < 1)
    page.mouse.move(x - 25, y, steps=3)
    track = page.locator('.fact-content:not([data-fact-outgoing])').evaluate(
        'e=>({offset:new DOMMatrixReadOnly(getComputedStyle(e).transform).m41,same:e===factSwipe?.content})')
    check(f'a horizontal drag follows the pointer before release ({track})',
          track['same'] and abs(track['offset'] + 25) < 1 and fact(page) == first)
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
    page.clock.run_for(50)  # Let the media change redraw finish before the next drag.
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
    check('a swipe restarts rotation instead of permanently pausing it', page.evaluate('factPaused') is False and page.evaluate('factMoved') is True)
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

def update_backdated(route, history):
    event = route.request.post_data_json['event']
    minute = (datetime.fromisoformat(event['time']) - AT).total_seconds() / 60 + 720
    next(row for row in history if row['id'] == 'feed-8')['t'] = minute
    route.fulfill(json={'status': 'saved', 'id': 'feed-8'})

def audit_household_clock(browser, base):
    evening = AT + timedelta(hours=10)
    page = open_app(browser, base, 390, 844, evening, ai=False)
    try:
        page.st['entries'] = [{'id': f'feed-{hour}', 'type': 'feed', 'side': 'L', 't': hour * 60} for hour in (11, 15, 21)]
        page.st['dutyNoteAt'] = evening.replace(hour=12).isoformat()
        page.evaluate('pollFamily()')
        check('a saved duty handoff does not add a Since the handoff insight card',
              page.evaluate('!factPool().some(f=>f.topic==="handoff")'))
    finally:
        page.context.close()

    after_midnight = AT.replace(hour=0, minute=1)
    page = open_app(browser, base, 390, 844, after_midnight, ai=False)
    try:
        page.st['today'] = (after_midnight - timedelta(days=1)).date().isoformat()
        page.st['entries'] = [{'id': 'late-sleep', 'type': 'sleep', 't': 1420, 'tEnd': 1435, 'dur': 15}]
        page.st['run'] = {'id': 'timer-1', 'kind': 'feed', 'side': 'R', 't0': -9.5,
                          'startedAt': (after_midnight - timedelta(minutes=10, seconds=30)).isoformat()}
        page.reload()
        page.locator('.insight').wait_for()
        check('a state dated before browser midnight still loads the signed-in child',
              page.evaluate('S.auth==="ready"&&S.child.name==="Ada"') and page.locator('#child-form').count() == 0)
        check('the server record retains its household date and sleep interval',
              page.evaluate('S.entries.some(e=>e.id==="late-sleep"&&e.t===-20&&e.tEnd===-5)'))
        check('a live timer keeps its absolute start when its lookup crossed midnight',
              page.evaluate('S.run.t0===-9.5'))
        page.st['child'] = {**page.st['child'], 'id': 'child:2', 'name': 'Sky'}
        page.st['entries'] = [{'id': 'new-child-feed', 'type': 'feed', 'side': 'R', 't': 1438, 'dur': 2}]
        page.st['run'] = None
        page.evaluate('pollFamily()')
        check('a dated state reply replaces the previous child and records',
              page.evaluate('S.child.name==="Sky"&&S.entries.length===1&&S.entries[0].id==="new-child-feed"&&S.entries[0].t===-2'))
    finally:
        page.context.close()


def audit_history(browser, base, lang):
    """Exercise dated reads from Home, including a second browser's backdated correction."""
    page = open_app(browser, base, 390, 844, AT, lang=lang, development=True)
    today = AT.date()
    reads = []
    failing = False
    history = [{'id': f'feed-{d}', 'type': 'bottle', 't': 600 - d * 1440, 'ml': 60, 'unit': 'ml'} for d in range(15)]
    history.append({'id': 'handoff-note', 'type': 'note', 'title': 'handoff', 't': 570})

    def state(route):
        range_ = parse_qs(urlparse(route.request.url).query)
        start = range_.get('from', [(today - timedelta(days=1)).isoformat()])[0]
        end = range_.get('to', [(today + timedelta(days=1)).isoformat()])[0]
        lo = (datetime.fromisoformat(start).date() - today).days
        hi = (datetime.fromisoformat(end).date() - today).days
        reads.append((lo, hi))
        if failing and lo <= -8 < hi:
            route.fulfill(status=503, json={'error': 'History unavailable'})
            return
        preferences = page.st['preferences'] if not range_ else {**page.st['preferences'], 'units': 'us'}
        route.fulfill(json={**page.st, 'today': today.isoformat(), 'preferences': preferences,
                            'entries': [e for e in history if lo <= e['t'] // 1440 < hi]})

    page.st['child']['id'] = '1'
    page.st['preferences']['growthChart'] = {'childId': 1, 'sex': 'girls'}
    measurements = [{'id': 'weight:1', 'type': 'growth', 'date': today.isoformat(), 'kg': 5.45, 'growthPair': 'one'},
                    {'id': 'height:1', 'type': 'growth', 'date': today.isoformat(), 'cm': 60, 'growthPair': 'one', 'recumbent': True}]
    page.route(re.compile(r'/api/state(\?.*)?$'), state)
    page.route('**/api/growth', lambda r: r.fulfill(json={'entries': measurements, 'unavailable': []}))
    page.clock.install(time=AT)
    page.reload()
    try:
        page.wait_for_function('factPool().some(f => f.body.includes("60") && f.body.includes("mL"))')
        check('Home requests older history directly, in chunks of 31 or fewer days', any(lo <= -14 for lo, _ in reads) and all(0 < hi - lo <= 31 for lo, hi in reads))
        check('Home history leaves shared records and preferences unchanged',
              page.evaluate('unitsOf()==="metric"&&!S.entries.some(e=>e.id==="feed-8")'))
        check('a saved handoff note does not add a Since the handoff insight card',
              page.evaluate('!factPool().some(f=>f.topic==="handoff")'))
        page.evaluate('factPaused=true; S.factId=factPool()[0].id; render()')
        ids = []
        for _ in range(page.evaluate('S.renderedFacts.length')):
            ids.append(fact(page))
            page.locator('[data-act=fact-next]').click()
        check('the first two cards are an AI fact, then a personal fact', ids[0].startswith('source:') and not ids[1].startswith('source:'))
        check('both AI cards appear once in a full cycle with more personal cards', len(ids) == len(set(ids)) and sum(i.startswith('source:') for i in ids) == 2 and len(ids) > 4)
        check('the current card wraps to the first card', fact(page) == ids[0])
        page.wait_for_function('factPool().some(f => f.id.startsWith("growth:weight:"))')
        check('no WHO weight-for-length card appears while WHO tables are omitted',
              page.evaluate('!factPool().some(f => f.id.startsWith("growth:weight-for-length:"))'))
        page.evaluate('S.factId=factPool().find(f=>f.id.startsWith("growth:weight:")).id; render()')
        check('the recorded weight card shows the measurement and links to its record',
              page.locator('.insight [data-act=fact-log]').count() >= 1
              and '5.45 kg' in page.locator('.insight .fact-content').inner_text().replace('\xa0', ' '))
        # The bottle graph card (the about-her "Largest bottle" card also names 60 mL).
        volume = page.evaluate('factPool().find(f => f.id.startsWith("trend:bottles:breakdown:")).id')
        page.evaluate('(id) => {S.factId=id; render()}', volume)
        check('a personal fact links to its records', page.locator('.insight [data-act=fact-log]').count() >= 1)
        # A bottle graph shows bare numbers over its bars and names the unit in its title (owner, 2026-11-19).
        numbers = '[...document.querySelectorAll(".insight .fact-content .viz-num")].map(n => n.textContent)'
        before = page.evaluate(numbers)
        page.st['preferences']['units'] = 'us'
        page.evaluate('pollFamily()')
        page.wait_for_function('document.querySelector(".insight .fact-content h2").textContent.endsWith(", oz")')
        after = page.evaluate(numbers)
        check(f'sync converts the bar number from 60 to 2 and preserves the active fact ({before} to {after})',
              '60' in before and '2' in after and '60' not in after and fact(page) == volume)
        if lang == 'en':
            x, y = body_point(page)
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x - 25, y, steps=3)
            page.st['preferences']['units'] = 'metric'
            page.evaluate('pollFamily()')
            page.wait_for_function('unitsOf()==="metric"')
            check('sync leaves the current card in place during a drag',
                  fact(page) == volume and page.evaluate('factSwipe.content.isConnected') and 'oz' in page.evaluate('(document.querySelector(".insight .fact-content").textContent+(document.querySelector(".insight .fact-content svg[role=img]")?.getAttribute("aria-label")||""))'))
            page.mouse.move(x - 80, y, steps=4)
            page.mouse.up()
            check('the swipe completes normally after sync', fact(page) != volume)
            second = open_app(browser, base, 390, 844, AT, ai=False)
            try:
                check('personal trends are available with AI switched off',
                      second.evaluate('factPool().some(f=>f.id.startsWith("trend:"))') and second.locator('.insight [data-act=ask-ai]').count() == 0)
                second.route(re.compile(r'/api/events/feed-8$'), lambda r: update_backdated(r, history))
                # The feeds row of the Last 7 days card compares with the week before only when both weeks are complete (card mix, 2026-11-19).
                weekly = 'factPool().some(f=>f.id.startsWith("trend:week:seven:")&&f.viz.rows.some(r=>r.tone==="c-feed"&&r.change))'
                page.wait_for_function(weekly)
                second.evaluate('(time)=>LittleDaysAPI.writes.updateEntry("feed-8",{type:"bottle",time,ml:60})',
                                (AT - timedelta(days=9, hours=2)).isoformat())
                page.clock.fast_forward(4 * 60000 + 15000)
                page.wait_for_function(f'!({weekly})')
                check('another browser’s backdated bottle edit reaches Home within the refresh interval', not page.evaluate(weekly))
            finally:
                second.context.close()
            failing = True
            page.clock.fast_forward(4 * 60000 + 15000)
            page.wait_for_function('!homeReads.has(dayISO(-8))')
            check('a failed history read removes the affected date from comparison coverage', not page.evaluate('homeReads.has(dayISO(-8))'))
            failing = False
            page.clock.fast_forward(30000)
            page.wait_for_function('homeReads.has(dayISO(-8))')
            page.st['permissions']['resources']['feedings']['view'] = False
            page.evaluate('pollFamily()')
            page.wait_for_function('!resourceAllowed("feedings")')
            check('revoked feeding permission removes bottle facts', not page.evaluate('factPool().some(f=>f.id.startsWith("trend:feeds:")||f.id.startsWith("trend:bottles:"))'))
    finally:
        page.context.close()


CONTROLS_JS = """() => {
  const facts = S.renderedFacts, i = facts.findIndex(f => f.id === S.factId), n = facts.length, first = Math.max(0, Math.min(i - 1, n - 3));
  const dots = [...document.querySelectorAll('.fact-dot')];
  const want = dots.length === Math.min(3, n) && dots.every((d, k) => d.classList.contains('current') === (first + k === i)
    && d.classList.contains('more') === (first + k !== i && ((k === 0 && first > 0) || (k === dots.length - 1 && first + k < n - 1))));
  const label = document.querySelector('.fact-dots').getAttribute('aria-label') === t('factPosition', i + 1, n);
  const nav = document.querySelector('.fact-navigation').getBoundingClientRect();
  const clear = [...document.querySelectorAll('.fact-content:not([data-fact-outgoing]) .fact-actions>*')]
    .every(e => { const r = e.getBoundingClientRect(); return r.right <= nav.left || r.bottom <= nav.top || r.top >= nav.bottom; });
  const stack = document.querySelector('.fact-stack').getBoundingClientRect(), content = document.querySelector('.fact-content:not([data-fact-outgoing])');
  const fits = [...content.children].every(e => e.getBoundingClientRect().bottom <= stack.bottom + 0.5);
  return {i, want, label, clear, fits};
}"""

def audit_controls(browser, base):
    """Failure cases the single screenshot misses: a wrong dot window at either end, a wrong position label,
    a link under the arrows on a narrow phone or in Spanish, with Pause shown or hidden, and a fact clipped by the card."""
    for width, lang, motion in [(364,'es','no-preference'),(364,'en','reduce'),(390,'es','reduce'),(390,'en','no-preference')]:
        page = open_app(browser, base, width, 844, AT, lang=lang, development=True)
        page.clock.install(time=AT)
        page.clock.pause_at(AT + timedelta(seconds=1))
        page.reload()
        page.emulate_media(reduced_motion=motion)
        page.locator('.insight').wait_for()
        page.evaluate('()=>{factPaused=true;S.factId=S.renderedFacts[0].id;render()}')
        n = page.evaluate('S.renderedFacts.length')
        results = []
        for _ in range(n):
            results.append(page.evaluate(CONTROLS_JS))
            page.locator('[data-act=fact-next]').click()
        tag = f'{width}px {lang} motion={motion}'
        check(f'dot window and active dot are right at every position, {tag}', n > 3 and all(r['want'] for r in results))
        check(f'position label names the fact and the total, {tag}', all(r['label'] for r in results))
        check(f'no link sits under the controls, {tag}', all(r['clear'] for r in results))
        check(f'every fact fits the card, {tag}', all(r['fits'] for r in results))
        page.context.close()

def audit_review_r1(browser, base):
    """Review round 1 (2026-11-19). Failure cases: (3) a text card that becomes a graph card under the same id still turns at 7 s;
    (5) an auto-turn counts as someone moving the card, so the daily facts that arrive late no longer open Home on a fun card."""
    page = open_app(browser, base, 390, 844, AT)
    page.clock.install(time=AT)
    page.reload()
    page.locator('.insight').wait_for()
    page.emulate_media(reduced_motion='no-preference')
    page.mouse.move(0, 0)
    page.evaluate('''()=>{ window.__viz = false; const base = {kind:'record', topic:'none', evidence:[]};
      factPool = () => [{...base, id:'r1:a', title:'A', body:'A text card.', ...(window.__viz ? {headline:'1 h', viz:{kind:'columns', bars:[{label:'Today', value:1, today:true}]}} : {})},
                        {...base, id:'r1:b', title:'B', body:'Another card.'}];
      factPaused = false; S.factId = 'r1:a'; render(); }''')
    page.clock.run_for(6000)
    page.evaluate('()=>{ window.__viz = true; render(); }')
    check('r1 the card became a graph card under the same id', page.locator('.insight .fact-content .fact-viz').count() == 1)
    page.clock.run_for(1500)
    check('r1 a card that becomes a graph card does not turn at 7 s', fact(page) == 'r1:a')
    page.clock.run_for(10200)  # 6 s + 12 s = 18 s; now at 17.7 s
    check('r1 not before 12 s after it became a graph card', fact(page) == 'r1:a')
    page.clock.run_for(500)
    check('r1 it turns 12 s after it became a graph card', fact(page) == 'r1:b')
    page.context.close()

    page = open_app(browser, base, 390, 844, AT)
    held = []
    page.route('**/api/development', lambda route: held.append(route))
    page.clock.install(time=AT)
    page.reload()
    page.locator('.insight').wait_for()
    page.wait_for_function('S.developmentAttempt')
    page.emulate_media(reduced_motion='no-preference')
    page.mouse.move(0, 0)
    first = fact(page)
    page.clock.run_for(12500)
    check(f'r1 Home turned on its own while the daily facts were late ({first} to {fact(page)})', fact(page) != first)
    from check_support import development_batch, MX
    held.pop().fulfill(json=development_batch(AT.astimezone(MX).date().isoformat()))
    page.wait_for_function('S.developmentBatch')
    check('r1 an auto-turn is not a person moving the card: late daily facts still open Home on a fun card', fact(page).startswith('source:'))
    page.context.close()

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
                    # The daily facts arrive after the first render and Home then opens on the first fun card.
                    page.wait_for_function('S.developmentBatch && document.querySelector(".insight").dataset.fact.startsWith("source:")')
                    first = fact(page)
                    page.clock.run_for(6999)
                    check('fact remains for seven seconds', fact(page) == first)
                    page.clock.run_for(1)
                    second = fact(page)
                    page.screenshot(path=str(OUT/f'playing-{width}-{lang}.png'), animations='disabled')
                    check('timer advances to another fact', second != first)
                    check('Home opens on a daily fact, then a record fact follows', first.startswith('source:') and not second.startswith('source:'))
                    check('no Pause button is shown; active dot carries a running progress fill',
                          page.locator('[data-act=fact-pause]').count() == 0
                          and page.locator('.fact-dot.current .fact-fill').count() == 1
                          and page.locator('.fact-dot.current .fact-fill').evaluate('(el)=>getComputedStyle(el).animationPlayState') == 'running')
                    check('one active position dot', page.locator('.fact-dot.current').count() == 1)
                    check('at most 3 position dots for more than 3 facts', page.evaluate('S.renderedFacts.length') > 3 and page.locator('.fact-dot').count() == 3)
                    check('position is named for screen readers', '{' not in page.locator('.fact-dots').get_attribute('aria-label'))
                    page.locator('.insight').hover()
                    page.clock.run_for(14000)
                    check('hover pauses rotation and progress fill',
                          fact(page) == second and page.locator('.fact-dot.current .fact-fill').evaluate('(el)=>getComputedStyle(el).animationPlayState') == 'paused')
                    page.mouse.move(0,0)
                    page.clock.run_for(turn_ms(page))
                    check('leaving hover restarts rotation', fact(page) != second)
                    before_manual = fact(page)
                    page.locator('[data-act=fact-next]').click()
                    next_fact = fact(page)
                    page.locator('[data-act=fact-previous]').click()
                    check('Previous returns to the fact before Next', fact(page) == before_manual and next_fact != before_manual)
                    page.mouse.move(0,0)
                    page.locator('[data-act=fact-previous]').evaluate('(el)=>el.blur()')
                    page.clock.run_for(turn_ms(page) - 100)
                    check('manual navigation resets the timer for the chosen fact', fact(page) == before_manual)
                    page.clock.run_for(200)
                    check('manual navigation resumes auto-rotation after the pill fills', fact(page) != before_manual)
                    focused = fact(page)
                    page.locator('.insight [data-act=ask-ai]').focus()
                    page.clock.run_for(14000)
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
                    for _ in range(page.evaluate('S.renderedFacts.length')):
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
                        page.st['entries']=[{'id':'one','type':'feed','side':'L','dur':10,'t':360}]
                        page.st['child']['birthDate']=None  # no birth date: the server sends no daily guidance, so the page drops its batch below
                        page.evaluate("()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))}")
                        page.evaluate("()=>{S.entries=[{id:'one',type:'feed',side:'L',dur:10,t:360}];S.child={...S.child,birthDate:null};S.developmentBatch=null;S.factId='';factPaused=false;render()}")
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
                audit_review_r1(browser, base)
                audit_controls(browser, base)
                for lang in ('en', 'es'):
                    audit_history(browser, base, lang)
                audit_household_clock(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
