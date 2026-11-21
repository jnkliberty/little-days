"""Browser checks for the Home card graphs and the Home photo (owner, 2026-11-18 and 2026-11-19). Mocked data only; nothing reaches a live app.

Run from this folder with the Playwright Python:  python check_home_graphs.py
Each check runs in Chromium and in WebKit (the iPhone engine), in English and Spanish.

Failure cases covered:
  1. The header keeps the bunny after a photo is saved, or shows a broken photo when none is saved.
  2. A by-this-time headline repeats today's total instead of a verdict, or uses a judging word.
  3. The columns lose a day, today is not the one solid column, the "usual" label is off the dashed line, or weekday letters come back.
  4. A week where every day and today are equal still draws a row of equal columns.
  5. The bottle card loses the hollow bar for a bottle with no amount, a number sits off its bar, or the old key comes back.
  6. Hour labels under the bottle line overlap each other (Spanish "12 p. m." is the longest).
  7. On a 320 px phone a label runs past the card edge.
  8. A graph card turns before 12 s or never, or has no Pause; a text card stops turning after 7 s.
"""
import io
import os
import random
import re
import time
from datetime import datetime
from urllib.parse import parse_qs, urlparse

os.environ["TZ"] = "America/Mexico_City"
time.tzset()

from PIL import Image
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-18T22:23:00-06:00')
NOW = 22 * 60 + 23
FAILS = []
# The exact verdict for each fixture card and language (review round 1, C6): sleep falls inside last week's range,
# and every day has 8 diaper changes by 10:23 PM.
VERDICTS = {
    'en': {'sleep': 'About usual', 'diapers': 'Same as each of the last 7 days'},
    'es': {'sleep': 'Cerca de lo usual', 'diapers': 'Igual que cada uno de los últimos 7 días'},
}
WORDS = {'en': ('usual', 'Last 7 days', 'Today', 'bottle', 'nursing'), 'es': ('lo usual', 'Últimos 7 días', 'Hoy', 'biber', 'al pecho')}


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not ok:
        FAILS.append(name)


def history():
    """Sixteen days of sleeps, bottles (one today with no amount), nursing and diapers (8 a day, so that card has no drawing)."""
    rng, rows = random.Random(7), []
    for d in range(16):
        base, t = -d * 1440, 30
        while t < 1440:
            dur = rng.randint(70, 190)
            if d == 0 and t + dur > NOW:
                break
            rows.append({'id': f's{d}-{t}', 'type': 'sleep', 't': base + t, 'dur': dur, 'tEnd': base + t + dur})
            t += dur + rng.randint(25, 60)
        for k, h in enumerate([1, 4, 7, 10, 13, 15, 18, 20, 22]):
            m = h * 60 + rng.randint(0, 40)
            if d == 0 and m > NOW - 10:
                continue
            if k % 3 == 1:
                rows.append({'id': f'n{d}-{k}', 'type': 'feed', 'side': 'L', 't': base + m, 'dur': 15})
            elif d == 0 and k == 5:
                rows.append({'id': f'b{d}-{k}', 'type': 'bottle', 't': base + m, 'unit': 'ml'})
            else:
                rows.append({'id': f'b{d}-{k}', 'type': 'bottle', 't': base + m, 'ml': rng.choice([40, 50, 60, 70]), 'unit': 'ml'})
        for h in range(0, 24, 3):
            if not (d == 0 and h * 60 > NOW):
                rows.append({'id': f'd{d}-{h}', 'type': 'diaper', 'kind': 'W', 't': base + h * 60 + 5})
    return rows


def photo():
    out = io.BytesIO()
    Image.new('RGB', (200, 200), (236, 214, 190)).save(out, 'JPEG')
    return out.getvalue()


HISTORY, PHOTO = history(), photo()


def open_home(browser, base, lang, portrait):
    return open_home_at(browser, base, lang, 390, 844, portrait)


def open_home_at(browser, base, lang, width, height, portrait=True):
    page = open_app(browser, base, width, height, AT, lang=lang)
    page.st['child'] = {**page.st['child'], 'birthDate': '2026-11-06', 'portrait': '/api/child/portrait?v=abc123' if portrait else None}
    today = AT.date()

    def state(route):
        q = parse_qs(urlparse(route.request.url).query)
        lo = (datetime.fromisoformat(q['from'][0]).date() - today).days if 'from' in q else -1
        hi = (datetime.fromisoformat(q['to'][0]).date() - today).days if 'to' in q else 1
        route.fulfill(json={**page.st, 'today': today.isoformat(), 'entries': [e for e in HISTORY if lo <= e['t'] // 1440 < hi]})

    page.route(re.compile(r'/api/state(\?.*)?$'), state)
    page.route('**/api/child/portrait*', lambda r: r.fulfill(body=PHOTO, content_type='image/jpeg'))
    page.clock.install(time=AT)
    page.reload()
    page.wait_for_function('factPool().some(f=>f.id.startsWith("trend:sleep:baseline"))&&factPool().some(f=>f.id.startsWith("trend:bottles:"))', timeout=15000)
    return page


def show(page, prefix):
    page.evaluate(f'factPaused=true; S.factId=factPool().find(f=>f.id.startsWith("{prefix}")).id; render()')


# Every text box in the visible fact, as [left, right, top, bottom], and the fact's own box.
BOXES = '''() => { const card = document.querySelector('.insight .fact-content'), c = card.getBoundingClientRect();
  const boxes = [...card.querySelectorAll('.viz-usual, .viz-foot span, .viz-num, .viz-hours span, .fact-figure, .fact-note')].map(s => {
    const r = document.createRange(); r.selectNodeContents(s); const b = r.getBoundingClientRect(); return [b.left, b.right, b.top, b.bottom]; });
  return {card: [c.left, c.right, c.top, c.bottom], boxes}; }'''


def text(locator):
    """Visible text with the no-break spaces that keep a number with its unit read as plain spaces."""
    return locator.inner_text().replace('\xa0', ' ')


def inside(page):
    got = page.evaluate(BOXES)
    left, right = got['card'][0], got['card'][1]
    return all(b[0] >= left - 0.5 and b[1] <= right + 0.5 for b in got['boxes'])


def audit_sleep(page, tag, lang):
    show(page, 'trend:sleep:baseline')
    card = page.locator('.insight .fact-content')
    headline = text(card.locator('.fact-figure'))
    check(f'{tag}: the sleep headline is the verdict {VERDICTS[lang]["sleep"]!r} ({headline!r})', headline == VERDICTS[lang]['sleep'])
    # Card mix (2026-11-19): the note is one line with the amount and the usual; the title already says "by this time".
    note = card.locator('.fact-note')
    check(f'{tag}: the note under the headline is one line with the usual amount',
          ('usual' in note.inner_text() or 'usual' in note.inner_text().lower()) and note.evaluate('e => e.getClientRects().length && e.offsetHeight < 1.6 * parseFloat(getComputedStyle(e).lineHeight)'))
    fills = card.locator('svg rect.past').evaluate_all('els => els.map(e => getComputedStyle(e).fill)')
    card_fill = page.evaluate('getComputedStyle(document.querySelector(".insight")).backgroundColor')
    check(f'{tag}: the sleep drawing has 7 outlined past boxes filled with the card color and 1 solid today',
          len(fills) == 7 and all(f == card_fill for f in fills) and card.locator('svg rect.today').count() == 1
          and card.locator('svg line.usual').count() == 1)
    heights = card.locator('svg rect.past, svg rect.today').evaluate_all('els => els.map(e => +e.getAttribute("height") + (e.classList.contains("past") ? 2 : 0))')
    check(f'{tag}: every column is at least 8 drawing units tall: {heights}', heights and min(heights) >= 8 - 1e-6)
    usual, span, today = WORDS[lang][:3]
    foot = card.locator('.viz-foot span').all_inner_texts()
    check(f'{tag}: the labels are "{usual}", "{span}" and "{today}", with no weekday letters',
          card.locator('.viz-usual').inner_text() == usual and foot == [span, today] and card.locator('.viz-days').count() == 0)
    centers = page.evaluate('''() => { const u = document.querySelector('.insight .fact-content .viz-usual').getBoundingClientRect();
      const l = document.querySelector('.insight .fact-content svg line.usual').getBoundingClientRect(); return [u.top + u.height / 2, l.top + l.height / 2]; }''')
    check(f'{tag}: "{usual}" is centered on the dashed line: {[round(v, 1) for v in centers]}', abs(centers[0] - centers[1]) <= 2)
    body = page.evaluate('factPool().find(f => f.id === S.factId).body')
    check(f'{tag}: the drawing label is the active fact\'s full sentence', card.locator('svg[role=img]').get_attribute('aria-label') == body)


def audit_diapers(page, tag, lang):
    show(page, 'trend:diapers:baseline')
    card = page.locator('.insight .fact-content')
    check(f'{tag}: a week of equal diaper counts shows the headline and note only, no drawing',
          text(card.locator('.fact-figure')) == VERDICTS[lang]['diapers']
          and card.locator('.fact-viz').count() == 0 and card.locator('.fact-note').count() == 1)


def audit_bottles(page, tag, lang):
    show(page, 'trend:bottles:breakdown')
    card = page.locator('.insight .fact-content')
    bottle, nursing = WORDS[lang][3:]
    headline = text(card.locator('.fact-figure'))
    bars = card.locator('svg rect.bottle')
    check(f'{tag}: the bottle headline counts every bar ({headline!r})',
          # Spanish keeps the nursing count in the note so the headline fits 320 px (card mix, 2026-11-19).
          headline.startswith(f'{bars.count()} {bottle}') and (f'· ' in headline and nursing in headline if lang == 'en'
                                                             else nursing in text(card.locator('.fact-note'))))
    check(f'{tag}: one hollow bar for the bottle with no amount, nursing dots, and no key list',
          card.locator('svg rect.bottle.hollow').count() == 1 and card.locator('svg circle.nurse').count() >= 1
          and card.locator('.viz-key').count() == 0 and card.locator('.fact-note .note-mark').count() == 1)
    above = page.evaluate('''() => { const card = document.querySelector('.insight .fact-content');
      const bars = [...card.querySelectorAll('svg rect.bottle')].map(b => b.getBoundingClientRect());
      return [...card.querySelectorAll('.viz-num')].map(n => { const r = n.getBoundingClientRect(), x = r.left + r.width / 2;
        const bar = bars.reduce((best, b) => Math.abs(b.left + b.width / 2 - x) < Math.abs(best.left + best.width / 2 - x) ? b : best);
        return [n.textContent, Math.abs(bar.left + bar.width / 2 - x) <= 1, r.bottom <= bar.top + 1 && r.bottom >= bar.top - 6]; }); }''')
    check(f'{tag}: each number sits just above its bar ({[a[0] for a in above]}), "?" included',
          above and all(a[1] and a[2] for a in above) and any(a[0] == '?' for a in above))
    check(f'{tag}: the title names the unit', text(card.locator('h2')).endswith(', mL'))
    # The skip rule, worked out here from the rendered bar centers (viewBox units, R5 review round 2): a number is left out only
    # when its center is closer to the last number shown than 6 + 9 x the longer label's characters. Bars run left to right in
    # time order, so the rendered centers, sorted, pair with the marks sorted by time. Shown numbers never overlap.
    centers = sorted(card.locator('svg rect.bottle').evaluate_all('els => els.map(e => +e.getAttribute("x") + +e.getAttribute("width") / 2)'))
    labels = page.evaluate('''() => factPool().find(f => f.id === S.factId).viz.marks.filter(m => !m.nurse)
      .map((m, i) => [m.t, i, m.shown]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(m => m[2])''')
    marks = list(zip(centers, labels))
    want, last = [], None
    for x, label in marks:
        if last is None or x - last[0] >= 6 + 9 * max(len(last[1]), len(label)):
            want.append(label)
            last = (x, label)
    shown = card.locator('.viz-num').all_inner_texts()
    spans = card.locator('.viz-num').evaluate_all('els => els.map(e => e.getBoundingClientRect()).map(r => [r.left, r.right])')
    check(f'{tag}: numbers follow the length-based skip rule ({shown} == {want}) and none overlaps',
          shown == want and all(spans[i][1] <= spans[i + 1][0] for i in range(len(spans) - 1)))
    boxes = card.locator('.viz-hours span').evaluate_all('els => els.map(e => e.getBoundingClientRect()).map(r => [r.left, r.right])')
    apart = all(boxes[i][1] + 8 <= boxes[i + 1][0] for i in range(len(boxes) - 1))
    check(f'{tag}: the 3 hour labels keep at least 8 px apart: {[[round(a), round(b)] for a, b in boxes]}', len(boxes) == 3 and apart)


def audit_zero_usual(page, tag):
    """R1 (review round 2): a by-this-time card whose usual is 0 still draws the difference columns and its labels."""
    html = page.evaluate('''() => factViz({body: 'x', viz: {kind: 'columns', usual: 0, floor: 0, usualLabel: 'usual', span: 'Last 7 days',
      todayLabel: 'Today', bars: [0, 0, null, 0, 0, 0, 0].map(value => ({value})).concat([{value: 1, today: true}])}})''')
    check(f'{tag}: a usual of 0 draws the usual line and labels, never "undefined"',
          'undefined' not in html and 'class="usual"' in html and 'viz-usual' in html and html.count('<rect') == 7)


def audit_turn(page, tag):
    """No Pause button; the active pill fills for 12 s on a graph card and 7 s on a text card before turning."""
    current = 'document.querySelector(".insight").dataset.fact'
    fill_dur = 'document.querySelector(".insight .fact-dot.current .fact-fill")?.style.animationDuration'
    page.evaluate('factPaused=false; S.factId=factPool().find(f=>f.id.startsWith("trend:sleep:baseline")).id; render(); syncFactCarousel()')
    before = page.evaluate(current)
    graph_pause = page.locator('.insight .fact-pause').count()
    graph_dur = page.evaluate(fill_dur)
    page.clock.run_for(11900)
    stayed = page.evaluate(current) == before
    page.clock.run_for(200)
    check(f'{tag}: a graph card has no Pause, fills for 12 s and then turns ({graph_dur})',
          graph_pause == 0 and graph_dur == '12000ms' and stayed and page.evaluate(current) != before)
    page.evaluate('factPaused=false; S.factId=factPool().find(f=>f.id.startsWith("trend:sleep:baseline")).id; render(); syncFactCarousel()')
    next_x = 'document.querySelector(".insight [data-act=fact-next]").getBoundingClientRect().left'
    graph_next = page.evaluate(next_x)
    page.evaluate('factPaused=false; S.factId=factPool().find(f=>!f.viz).id; render(); syncFactCarousel()')
    before = page.evaluate(current)
    pause = page.locator('.insight .fact-pause').count()
    text_dur = page.evaluate(fill_dur)
    order = page.evaluate('[...document.querySelectorAll(".insight .fact-navigation button")].map(b => b.dataset.act)')
    text_next = page.evaluate(next_x)
    check(f'{tag}: only previous and next arrows show, and the next arrow keeps its place ({round(graph_next)} and {round(text_next)} px)',
          order == ['fact-previous', 'fact-next'] and abs(graph_next - text_next) < 0.5)
    page.clock.run_for(8000)
    check(f'{tag}: a text card has no Pause, fills for 7 s and turns after 7 s ({text_dur})',
          pause == 0 and text_dur == '7000ms' and page.evaluate(current) != before)


def audit(browser, base, engine, lang):
    tag = f'{engine} {lang}'
    page = open_home(browser, base, lang, portrait=True)
    try:
        img = page.locator('header.top img.home-portrait')
        check(f'{tag}: a saved photo replaces the header bunny, with empty alt (the name is beside it)',
              img.count() == 1 and img.get_attribute('alt') == '' and page.locator('header.top .bunny-btn').count() == 0
              and page.evaluate("document.querySelector('header.top img').naturalWidth") > 0)
        audit_sleep(page, tag, lang)
        audit_diapers(page, tag, lang)
        audit_bottles(page, tag, lang)
        audit_zero_usual(page, tag)
        audit_turn(page, tag)
    finally:
        page.context.close()

    page = open_home(browser, base, lang, portrait=False)
    try:
        check(f'{tag}: with no saved photo the header keeps the bunny', page.locator('header.top .bunny-btn').count() == 1
              and page.locator('header.top img').count() == 0)
    finally:
        page.context.close()


def audit_small(browser, base, engine, lang):
    page = open_home_at(browser, base, lang, 320, 700)
    try:
        for prefix in ('trend:sleep:baseline', 'trend:bottles:breakdown'):
            show(page, prefix)
            check(f'{engine} {lang} 320 px: every label of {prefix} stays inside the card', inside(page))
    finally:
        page.context.close()


def audit_fixed_height(browser, base, engine):
    """Failure case (card mix review, 2026-11-19): the card is as tall as its tallest fact, so Home with one short fact is short and a
    fact that joins later (a 30 px number card) pushes everything below it down (a layout shift)."""
    short = {"id": "source:short", "kind": "source", "title": "Short", "body": "One line.", "evidence": []}
    number = {"id": "trend:sleep:longest:x", "kind": "record", "topic": "sleep", "title": "Longest sleep so far", "body": "Longest sleep so far: 4 h 10 min.",
              "headline": "4 h 10 min", "note": "Nov 16", "big": True, "evidence": []}
    for width, lang, expected in ((390, "en", 264), (390, "es", 264), (320, "en", 320)):
        page = open_app(browser, base, width, 844, AT, lang=lang)
        try:
            page.evaluate("(f) => { factPool = () => f; factPaused = true; S.factId = f[0].id; render(); }", [short])
            one = page.locator(".insight").evaluate("e => e.offsetHeight")
            page.evaluate("(f) => { factPool = () => f; render(); }", [short, number])
            both = page.locator(".insight").evaluate("e => e.offsetHeight")
            check(f"{engine} {lang} {width} px: one short fact gives the designed {expected} px card, and a number card joining keeps it ({one}, {both})",
                  abs(one - expected) <= 1 and both == one)
        finally:
            page.context.close()


def audit_sleep_dock(browser, base, engine, width, height, inset, lang):
    page = open_home_at(browser, base, lang, width, height, portrait=False)
    try:
        # Desktop browser engines report zero safe-area insets. Reserve the iPhone system bars.
        page.add_style_tag(content=f'.page{{padding-top:{inset}px;padding-bottom:34px}}')
        ask = {'id': 'sample-cry', 'occurredAt': AT.isoformat()}
        page.route('**/api/cries?home=1', lambda r: r.fulfill(json={'ask': ask, 'sound': 'off'}))
        page.route('**/api/cries/sample-cry', lambda r: r.fulfill(json={'changed': True}))
        page.st['sleepRun'] = page.evaluate("""() => {
          setThemeMode('off');
          S.sleepRun = {id:'sleep', by:S.me.name, t0:nowM()-116, startedAt:new Date(Date.now()-116*60000).toISOString()};
          const facts = factPool().map(f => f.id.startsWith('trend:sleep:baseline')
            ? {...f, headline:'Less than any of the last 7 days'} : f);
          factPool = () => facts;
          return S.sleepRun;
        }""")
        show(page, 'trend:feeds:baseline')
        page.evaluate('LittleDaysCryUI.tick()')
        question = page.locator('.cry-ask')
        question.wait_for()
        reference = question.bounding_box()
        dock_top = page.locator('.dock').bounding_box()['y']
        crying_bottom = page.locator('.cry-home').evaluate('e => e.getBoundingClientRect().bottom')
        # Home keeps its normal spacing (2026-11-20): spare screen height must not spread into the gaps.
        check(f'{engine} {lang} {width}: the cry question sits 16 px under the Crying row '
              f'(gap {reference["y"]-crying_bottom:.0f})', abs(reference['y'] - crying_bottom - 16) <= 1)
        # Only a tall phone (440 x 956, English) must show the whole card. Smaller phones and Spanish scroll.
        fits = lang == 'en' and width == 440
        with page.expect_response(lambda r: r.url.endswith('/api/cries/sample-cry')) as skipped:
            page.locator('[data-act="cry-ask-skip"]').click()
        assert skipped.value.ok
        question.wait_for(state='detached')
        page.locator('.scroll').evaluate('e => e.scrollTop = 0')
        card = page.locator('.insight').bounding_box()
        check(f'{engine} {lang} {width}: after Skip the insight takes the question place '
              f'(gap {card["y"]-crying_bottom:.0f})', abs(card['y'] - crying_bottom - 16) <= 1)
        if fits:
            check(f'{engine} {lang} {width}: the whole insight card fits with an 8 px gap '
                  f'({card["height"]:.0f} vs {reference["height"]:.0f}, gap {dock_top-card["y"]-card["height"]:.0f})',
                  card['y'] + card['height'] <= dock_top - 8)
        controls = page.locator('.fact-content [data-act="fact-log"], .fact-navigation button')
        boxes = controls.evaluate_all('els => els.map(e => {const r=e.getBoundingClientRect(); return [r.bottom,r.height]})')
        check(f'{engine} {lang} {width}: all three insight buttons keep 48 px and clear Stop sleep on 440 ({boxes}, dock {dock_top})',
              len(boxes) == 3 and all(height >= 48 and (not fits or bottom <= dock_top) for bottom, height in boxes))
        height = page.locator('.insight').bounding_box()['height']
        show(page, 'trend:sleep:baseline')
        link_bottom = page.locator('.fact-content [data-act="fact-log"]').evaluate('e => e.getBoundingClientRect().bottom')
        check(f'{engine} {lang} {width}: the longer sleep verdict keeps the card height',
              page.locator('.insight').bounding_box()['height'] == height
              and (not fits or 0 < link_bottom <= dock_top))
    finally:
        page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            for engine in ('chromium', 'webkit'):
                browser = launch_browser(pw, engine)
                for lang in ('en', 'es'):
                    audit(browser, base, engine, lang)
                    audit_small(browser, base, engine, lang)
                audit_fixed_height(browser, base, engine)
                for size in ((440, 956, 62), (430, 932, 59), (414, 896, 48), (390, 844, 47), (360, 782, 40)):
                    for lang in ('en', 'es'):
                        audit_sleep_dock(browser, base, engine, *size, lang)
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'\n{len(FAILS)} failed')
    return int(bool(FAILS))


if __name__ == '__main__':
    raise SystemExit(main())
