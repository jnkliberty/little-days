"""Mocked Chrome checks for home facts and Ask AI. No live account or provider calls."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import shutil
from datetime import datetime, timedelta

from playwright.sync_api import sync_playwright
from check_support import launch_browser, mx_minutes, open_app, start_static_server
from check_ui import navigate, audit_next_side
import check_ui

PASS = FAIL = 0
AT = datetime.fromisoformat('2026-11-08T12:00:00-06:00')
ANSWER = '<img src=x onerror="window.injected=true"> & a recorded pattern'
REPLY = {'answer': ANSWER, 'period': {'from': '2026-11-08', 'to': '2026-11-09', 'label': 'Today / Hoy'}, 'references': [
    {'kind': 'record', 'id': 'e1', 'label': 'Feed record', 'date': '2026-11-08'},
    {'kind': 'source', 'id': 'guide', 'label': 'Source guide', 'url': 'https://www.cdc.gov/child-development/'}]}


def check(name, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print('PASS', name, flush=True)
    else:
        FAIL += 1
        print('FAIL', name, flush=True)


COPY = {
    'en': {'ask': 'Ask AI', 'about': 'Ask AI about {}', 'blank': 'What would you like to know about {}?', 'sources': 'Sources', 'home': 'Home', 'retry': 'Try again', 'failed': 'No answer arrived.'},
    'es': {'ask': 'Preguntar a IA', 'about': 'Preguntar a IA sobre {}', 'blank': '¿Qué le gustaría saber sobre {}?', 'sources': 'Fuentes', 'home': 'Inicio', 'retry': 'Intentar de nuevo', 'failed': 'No llegó una respuesta.'},
}
LONG_ANSWER = ' '.join(['The longest sleep recorded today was 75 minutes and the logs may be incomplete.'] * 8)
# Home title, date, fact heading, body and AI button must fit without overlap.
HEADER_BOXES = """() => {
  const box = e => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
  const pill = document.querySelector('.ask-pill').getBoundingClientRect();
  const card = document.querySelector('.insight').getBoundingClientRect();
  const boxes = [box(document.querySelector('.top h1')), pill, box(document.querySelector('.top .when')), box(document.querySelector('.insight h2')), box(document.querySelector('.fact-body'))];
  const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  const heading = document.querySelector('.insight h2').getBoundingClientRect();
  // Beside the heading at the right edge, or under it when the card is narrow.
  const placed = (pill.left + pill.right) / 2 > card.left + card.width / 2 || pill.top >= heading.bottom - 1;
  return pill.top >= card.top && pill.right <= card.right && placed &&
    boxes.every((a, i) => boxes.slice(i + 1).every(b => apart(a, b))) &&
    boxes.every(a => a.left >= 0 && a.right <= innerWidth) && document.documentElement.scrollWidth <= innerWidth;
}"""


def fits(page):
    return page.evaluate('''() => document.documentElement.scrollWidth <= innerWidth &&
      [...document.querySelectorAll('.insight,.ask-pill,.chat-screen,.chat-answer,.chat-pill,#ai-form')].every(e => {
        const r=e.getBoundingClientRect();return r.left>=-1 && r.right<=innerWidth+1 && e.scrollWidth<=e.clientWidth+1;
      })''')


def shot(page, label):
    path = '/tmp/little-days-insights-after-' + label + '.png'
    page.screenshot(path=path, full_page=True)
    print('SCREENSHOT', path, flush=True)


class Run:
    """One page with the mocked AI routes, and the checks that share it."""

    def __init__(self, browser, base, width, height, lang, theme):
        self.label = f'{width}-{lang}-{theme}'
        self.width, self.lang, self.copy = width, lang, COPY[lang]
        self.page = open_app(browser, base, width, height, AT, lang=lang, theme=theme)
        self.page.set_default_timeout(5000)
        self.requests, self.pending = [], []
        self.mode = {'available': True, 'reply': 'success'}
        self.page.route('**/api/ai/status', lambda r: r.fulfill(json={'available': self.mode['available'], 'provider': 'Anthropic'}))
        self.page.route('**/api/ai/chat', self.chat_route)
        date = AT.date().isoformat()
        cards = [{'id': f'daily-{date}-{index}', 'date': date, 'topic': [topic, topic],
                  'title': [title, spanish_title], 'body': [body, spanish_body],
                  'source': ['CDC', 'CDC'], 'url': 'https://www.cdc.gov/act-early/milestones/2-months.html',
                  'sourceDate': 'Retrieved ' + date}
                 for index, (topic, title, spanish_title, body, spanish_body) in enumerate([
                     ('sounds', 'Take turns with sounds', 'Tomen turnos con sonidos', 'Answer your baby’s sounds.', 'Responda a los sonidos de su bebé.'),
                     ('play', 'Watch for a break', 'Observe si necesita una pausa', 'Turning away can signal a break.', 'Apartar la mirada puede indicar una pausa.'),
                     ('connection', 'Respond and comfort', 'Responda y consuele', 'Respond to your baby’s cues.', 'Responda a las señales de su bebé.'),
                 ], 1)]
        self.page.route('**/api/development', lambda r: r.fulfill(json={'date': date, 'status': 'ready', 'cards': cards}))
        self.page.evaluate('S.developmentAttempt=null; void loadDailyDevelopment()')
        self.page.wait_for_function('S.developmentBatch?.cards.length===3')
        self.name = self.page.st['child']['name']

    def chat_route(self, route):
        self.requests.append(route.request.post_data_json)
        if self.mode['reply'] == 'pending':
            self.pending.append(route)
        elif self.mode['reply'] == '401':
            route.fulfill(status=401, json={'error': 'Sign in'})
        elif self.mode['reply'] == 'error':
            route.fulfill(status=503, json={'error': 'Unavailable'})
        else:
            route.fulfill(json=self.mode.get('body', REPLY))

    def check(self, name, condition):
        check(f'{self.label}: {name}', condition)

    def ask(self, question, how='Enter'):
        """Type a question and send it with the keyboard; wait for one more answer."""
        before = self.page.locator('.chat-answer').count()
        self.page.locator('#ai-question').fill(question)
        self.page.keyboard.press(how)
        self.page.wait_for_function('n => document.querySelectorAll(".chat-answer").length > n', arg=before)

    def open_chat(self):
        self.page.locator('.insight [data-act=ask-ai]').click()
        self.page.wait_for_function('S.chat.available!==null && !S.chat.checking')

    def fresh_chat(self):
        """A new conversation. The chat has no Clear button, so this is what a reload or a person change gives."""
        self.page.evaluate('()=>{const a=S.chat.available;resetChat();S.chat.available=a;render()}')


def audit_home(r):
    page = r.page
    r.check('Home shows exactly one fact and no old development list', page.locator('.insight').count() == 1 and page.locator('.development,.development-card').count() == 0)
    r.check('idle Home puts the insight card under the logging tiles', page.evaluate("() => document.querySelector('.tiles').getBoundingClientRect().bottom <= document.querySelector('.insight').getBoundingClientRect().top"))
    first = page.locator('.insight').get_attribute('data-fact')
    page.locator('[data-act=fact-next]').click()
    second = page.locator('.insight').get_attribute('data-fact')
    r.check('Next changes the fact', bool(first) and first != second)
    page.evaluate('state => {applyServerData(state);render();render();}', page.st)
    r.check('polling retains the chosen fact', page.locator('.insight').get_attribute('data-fact') == second)
    r.check('Feed tile omits next-side text', ('Sigue el lado' if r.lang == 'es' else 'side is next') not in page.locator('.tile[data-act=open-feed]').inner_text())
    r.check('Feed, Sleep and Diaper tiles keep an 8 px gap', page.evaluate("""() => {
      const tiles = [...document.querySelectorAll('.tiles .tile')].map(e => e.getBoundingClientRect());
      return tiles.length >= 2 && tiles.slice(1).every((b, i) => Math.round(b.left - tiles[i].right) === 8);
    }"""))
    r.check('fact card owns one Ask AI button, the nav card has one Ask row (R3); header has none', page.locator('.insight [data-act=ask-ai]').count() == 1 and page.locator('.nav [data-act=ask-ai]').count() == 1 and page.locator('[data-act=ask-ai]').count() == 2 and page.locator('.top button:not(.bunny-btn)').count() == 0)
    r.check('home fits viewport', fits(page))
    r.check('fact heading and Ask button share a vertical center', page.evaluate("""() => {
      const heading = document.querySelector('.insight h2').getBoundingClientRect();
      const ask = document.querySelector('.ask-pill').getBoundingClientRect();
      return Math.abs(heading.top + heading.height / 2 - ask.top - ask.height / 2) <= 1;
    }"""))
    # Direction A: each tile is filled with its care color, and its text keeps 4.5:1 on that fill in both themes.
    # Night is the Deep fills look (DESIGN.md Color rule 5): the dark tile fills, each at 2:1 or more against the page.
    r.check('Feed, Sleep and Diaper tiles use the care fills with readable text', page.evaluate("""() => {
      const night = document.documentElement.dataset.theme === 'dim';
      const want = night ? {'open-feed': [119, 78, 19], 'open-sleep': [73, 83, 137], 'open-dia': [16, 110, 105]} : {'open-feed': [244, 194, 106], 'open-sleep': [174, 204, 252], 'open-dia': [89, 197, 192]};
      const rgb = c => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
      const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      return Object.entries(want).every(([act, fill]) => {
        const tile = document.querySelector(`.tile[data-act=${act}]`); if (!tile) return false;
        const bg = rgb(getComputedStyle(tile).backgroundColor);
        const edge = night ? ratio(bg, rgb(getComputedStyle(document.body).backgroundColor)) >= 2 : true;
        return bg.join() === fill.join() && edge && ratio(rgb(getComputedStyle(tile).color), bg) >= 4.5 && [...tile.querySelectorAll('.w, .n, .s, .log-plus')].every(e => ratio(rgb(getComputedStyle(e).color), bg) >= 4.5);
      });
    }"""))
    shot(page, r.label + '-home')
    # Cycle through the actual facts to exercise both source and record links.
    found_source = found_record = False
    for _ in range(16):
        if page.locator('.insight a[href^="https://"]').count():
            source = page.locator('.insight a[href^="https://"]').first
            found_source = source.get_attribute('target') == '_blank' and 'noopener' in source.get_attribute('rel')
            if r.width == 390:
                shot(page, r.label + '-source')
        found_record = found_record or page.locator('.insight [data-act=fact-log]').count() > 0
        if found_source and found_record:
            break
        page.locator('[data-act=fact-next]').click()
    r.check('facts expose safe source and log references', found_source and found_record)
    # The card keeps one height: every fact shares one cell with the tallest, so nothing below it moves.
    heights = []
    for _ in range(page.evaluate('factPool().length')):
        heights.append(round(page.evaluate("document.querySelector('.insight').getBoundingClientRect().height")))
        page.locator('[data-act=fact-next]').click()
    r.check('insight card keeps one height across every fact', len(heights) >= 2 and len(set(heights)) == 1)


def audit_header(r):
    page, c = r.page, r.copy
    pill = page.locator('.ask-pill')
    box = pill.bounding_box()
    r.check('Ask button shows the spark and the word Ask, 48 px tall', pill.inner_text().strip() == ('Preguntar' if r.lang == 'es' else 'Ask') and pill.locator('svg').count() == 1 and round(box['height']) == 48 and box['width'] >= 48)
    r.check('Ask AI pill is named for the child', pill.get_attribute('aria-label') == c['about'].format(r.name))
    r.check('Home text and fact button do not overlap', page.evaluate(HEADER_BOXES))
    page.evaluate("document.documentElement.style.zoom='2'")
    r.check('200 percent zoom keeps Home text and fact button apart', page.evaluate(HEADER_BOXES) and fits(page))
    shot(page, r.label + '-home-zoom200')
    page.evaluate("document.documentElement.style.zoom=''")
    # The name comes from state, in the title, the pill and the chat.
    page.evaluate("()=>{S.child={...S.child,name:'Rosa'};render()}")
    r.check('title and pill follow the child name from state', page.locator('.top h1').inner_text() == 'Rosa' and pill.get_attribute('aria-label') == c['about'].format('Rosa'))
    page.evaluate("()=>{S.child={...S.child,name:'Ada'};render()}")


def has_privacy_text(page):
    return page.evaluate("/Anthropic|privacy|privacidad|sent to|se envían/i.test(document.getElementById('stage').innerText + document.getElementById('stage').innerHTML)")


def audit_blank(r):
    page, c = r.page, r.copy
    # Touch phones focus the heading, and a redraw (the availability check) must not drop that focus.
    page.evaluate("()=>{const mm=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('pointer: fine')?{matches:false,media:q}:mm(q)}")
    r.open_chat()
    r.check('touch: opening the chat focuses the heading and keeps it through redraws', page.evaluate('document.activeElement.id==="chat-title"'))
    page.reload()
    page.locator('.insight [data-act=ask-ai]').wait_for()
    r.open_chat()
    r.check('fine pointer: opening the chat focuses the field', page.evaluate('document.activeElement.id==="ai-question"'))
    if r.width == 390:
        shot(page, r.label + '-blank')
    r.check('pill opens a blank chat: no messages, one centered line', page.locator('.chat-turn').count() == 0 and page.locator('.chat-blank').inner_text() == c['blank'].format(r.name))
    field = page.locator('#ai-question')
    r.check('field has the Ask AI placeholder and a name, and no visible label', field.get_attribute('placeholder') == c['ask'] and field.get_attribute('aria-label') == c['about'].format(r.name) and page.locator('.chat-screen label').count() == 0)
    r.check('blank chat has no suggestions, context, Clear, privacy line or Anthropic', page.locator('.chat-suggestions,.chat-intro,.chat-context,.chat-privacy,[data-act=ai-clear],[data-act=ai-suggest]').count() == 0 and not has_privacy_text(page))
    heading = page.locator('#chat-title')
    r.check('chat has a visible 24 px title in the shared title bar', heading.inner_text() == c['ask'] and heading.is_visible() and heading.evaluate('e=>e.closest(".bar.screen-top")!==null && getComputedStyle(e).fontSize==="24px"'))
    back = page.locator('.screen-top [data-act=chat-back]')
    r.check('Back is a 48 px tall button that reads Home, and the chat has no Settings link', back.inner_text().strip() == c['home'] and round(back.bounding_box()['height']) == 48 and page.locator(':is(.chat-screen,.main:has(.chat-screen)>.screen-top) :is(.settings-menu,[data-act=open-more],[data-act=open-settings])').count() == 0)
    # Ask and Photos share one title bar: the same Home button class and size, and a visible title on both.
    bar_js = 'e=>{const k=e.querySelector(".back"),b=k.getBoundingClientRect(),h=e.querySelector("h1");return {cls:k.className,w:Math.round(b.width),h:Math.round(b.height),title:h.getBoundingClientRect().height>1}}'
    ask_bar = page.locator('.main>.bar.screen-top').evaluate(bar_js)
    page.evaluate("act('tab','photos')")
    # Photos loads its 31 days when it opens and draws its title bar again; measure after that load.
    page.wait_for_function("S.tab==='photos' && !S.photoLoading && S.photoFrom!=null")
    photos_bar = page.locator('.main>.bar.screen-top').evaluate(bar_js)
    page.evaluate("act('tab','chat')")
    r.check('Ask Home button has the class and size of the Photos Home button, and both titles show', ask_bar == photos_bar and ask_bar['title'])
    r.check('Send is hidden until the field has text', page.locator('[data-ai-send]').is_hidden())
    field.fill('How is sleep <today>?')
    send = page.locator('[data-ai-send]')
    r.check('Send shows at 48 px once the field has text', send.is_visible() and round(send.bounding_box()['height']) == 48 and round(send.bounding_box()['width']) == 48)
    field.fill('')
    r.check('empty question cannot submit', send.is_hidden() and page.locator('.chat-answer').count() == 0)
    back.click()
    r.check('Back returns focus to the pill', page.evaluate('document.activeElement.matches(".ask-pill")'))
    page.locator('.insight [data-act=ask-ai]').click()
    r.check('pill opens the blank chat again when no question was asked', page.locator('.chat-blank').count() == 1 and page.locator('.chat-turn').count() == 0)


def audit_conversation(r):
    page, c = r.page, r.copy
    field = page.locator('#ai-question')
    field.fill('How is sleep <today>?')
    field.evaluate('e=>{e.focus();e.setSelectionRange(4,9)}')
    page.evaluate('state=>{applyServerData(state);render()}', page.st)
    r.check('poll preserves typing focus and caret', field.evaluate('e=>document.activeElement===e && e.selectionStart===4 && e.selectionEnd===9 && e.value==="How is sleep <today>?"'))
    page.locator('[data-ai-send]').click()
    page.locator('.chat-answer').wait_for()
    r.check('response and question are escaped and input clears', page.locator('.chat-answer').inner_text() == ANSWER and page.locator('.chat-answer img,.chat-question today').count() == 0 and page.evaluate('window.injected!==true') and field.input_value() == '')
    r.check('request carries language and question, and no fact', r.requests[-1]['question'] == 'How is sleep <today>?' and r.requests[-1]['lang'] == r.lang and 'factId' not in r.requests[-1])
    r.check('question is a right-aligned bubble over a plain answer, with no You or Answer labels', page.evaluate('''() => {
      const th = document.querySelector('.chat-thread').getBoundingClientRect(), q = document.querySelector('.chat-question').getBoundingClientRect(), a = document.querySelector('.chat-answer');
      return Math.abs(q.right - (th.right - 16)) <= 1 && a.getBoundingClientRect().left - th.left === 16 && getComputedStyle(a).backgroundColor === 'rgba(0, 0, 0, 0)' && !document.querySelector('.chat-turn h2,.chat-part');
    }'''))
    r.check('chat fits viewport', fits(page))
    shot(page, r.label + '-chat')


def audit_sources(r):
    page, c = r.page, r.copy
    sources = page.locator('.chat-sources')
    summary = sources.locator('summary')
    r.check('Sources is one closed control of 48 px under the answer', sources.count() == 1 and sources.evaluate('e=>!e.open') and summary.inner_text() == c['sources'] and summary.bounding_box()['height'] >= 48 and page.locator('.chat-period').is_hidden())
    summary.click()
    page.wait_for_function('S.chat.messages[0].open===true')
    r.check('Sources lists the date range and the references', page.locator('.chat-period').inner_text() == 'Today / Hoy' and page.locator('.chat-references [data-act=fact-log]').count() == 1 and page.locator('.chat-references a').get_attribute('href') == REPLY['references'][1]['url'])
    page.evaluate('state=>{applyServerData(state);render()}', page.st)
    r.check('an open Sources stays open when the screen redraws', page.locator('.chat-sources').evaluate('e=>e.open') and page.locator('.chat-period').is_visible())
    shot(page, r.label + '-sources')


def audit_keys(r):
    page, field = r.page, r.page.locator('#ai-question')
    field.fill('First line')
    page.keyboard.press('Shift+Enter')
    page.keyboard.type('second line')
    count = len(r.requests)
    r.check('Shift+Enter adds a new line and sends nothing', field.input_value() == 'First line\nsecond line' and len(r.requests) == count)
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    r.check('Enter sends the question and the field is empty afterwards', len(r.requests) == count + 1 and r.requests[-1]['question'] == 'First line\nsecond line' and field.input_value() == '' and page.evaluate('S.chat.draft') == '')


def audit_zoom(r):
    page = r.page
    realistic = {**REPLY, 'answer': 'El sueño más largo registrado hoy duró 75 minutos. Los registros pueden estar incompletos.' if r.lang == 'es' else 'The longest sleep recorded today was 75 minutes. Logs may be incomplete.', 'period': {**REPLY['period'], 'label': '8 de noviembre de 2026' if r.lang == 'es' else 'November 8, 2026'}, 'references': [{'kind': 'record', 'id': 'e2', 'date': '2026-11-08', 'label': 'Registro de sueño' if r.lang == 'es' else 'Sleep record'}]}
    r.mode['body'] = realistic
    before = page.locator('.chat-answer').count()
    page.locator('#ai-question').fill('¿Cómo durmió Ada hoy?' if r.lang == 'es' else 'How did Ada sleep today?')
    page.locator('[data-ai-send]').focus()
    page.keyboard.press('Enter')
    page.wait_for_function('n => document.querySelectorAll(".chat-answer").length > n', arg=before)
    r.check('keyboard submits a question from Send', page.locator('.chat-answer').last.inner_text() == realistic['answer'])
    shot(page, r.label + '-representative')
    page.evaluate("document.documentElement.style.zoom='2'")
    r.check('200 percent CSS zoom has no horizontal overflow', fits(page))
    r.check('200 percent zoom keeps the Back button and field apart', page.evaluate('''() => {
      const boxes=[...document.querySelectorAll('.screen-top [data-act=chat-back],.chat-pill')].map(e=>e.getBoundingClientRect());
      return boxes.every((a,i)=>boxes.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
    }'''))
    shot(page, r.label + '-zoom200')
    page.evaluate("document.documentElement.style.zoom=''")
    r.mode.pop('body')


def audit_return(r):
    """A conversation that fills the thread: the pill opens it at the newest turn."""
    page = r.page
    r.mode['body'] = {**REPLY, 'answer': LONG_ANSWER}
    for n in range(4):
        r.ask(f'Question {n}')
    r.mode.pop('body')
    page.locator('.screen-top [data-act=chat-back]').click()
    r.check('Back shows Home from its top, with the pill in view and focused', page.evaluate('document.querySelector("[data-scroll]").scrollTop===0 && document.querySelector(".ask-pill").getBoundingClientRect().top >= 0 && document.activeElement.matches(".ask-pill")'))
    page.locator('.insight [data-act=ask-ai]').click()
    r.check('pill reopens the conversation at the newest turn', page.evaluate('''() => {
      const th = document.querySelector('.chat-thread'), last = th.lastElementChild.getBoundingClientRect(), box = th.getBoundingClientRect();
      return th.scrollTop > 0 && last.top >= box.top - 1 && last.top < box.bottom && document.querySelectorAll('.chat-turn').length >= 5 && !document.querySelector('.chat-blank');
    }'''))
    shot(page, r.label + '-return')


def audit_record_link(r):
    page = r.page
    page.locator('.chat-sources').first.evaluate('e => { e.open = true; }')
    page.locator('.chat-references [data-act=fact-log]').first.click()
    r.check('record link opens the correct log day', page.evaluate('S.tab==="log" && S.day===0'))
    navigate(page, 'home')
    r.open_chat()


def send_pending(r, question):
    """Send a question while the server holds the reply; returns once the chat is loading."""
    r.mode['reply'] = 'pending'
    r.page.locator('#ai-question').fill(question)
    r.page.locator('[data-ai-send]').click()
    r.page.wait_for_function('S.chat.loading')


def audit_sent(r):
    """A sent question is a bubble at once, the field clears, and a second send starts nothing."""
    page, c = r.page, r.copy
    r.fresh_chat()
    send_pending(r, 'Keep this question')
    if r.width == 390:
        shot(page, r.label + '-loading')
    r.check('question shows at once as one bubble and the field is cleared', page.locator('.chat-question').count() == 1 and page.locator('.chat-question').inner_text() == 'Keep this question' and page.locator('#ai-question').input_value() == '')
    r.check('loading line sits under the bubble and there is no answer yet', page.locator('.chat-question + .chat-waiting').count() == 1 and page.locator('.chat-waiting').inner_text() == page.evaluate('()=>t("aiWaiting")') and page.locator('.chat-answer').count() == 0)
    bunny = page.locator('.chat-bunny')
    r.check('pending reply has one decorative bunny inside its named status', bunny.count() == 1 and bunny.get_attribute('aria-hidden') == 'true' and page.locator('.chat-waiting[role=status] .chat-bunny').count() == 1)
    if bunny.count():
        page.wait_for_function("document.querySelector('.chat-bunny').getAnimations({subtree:true}).some(a=>a.playState==='running')")
        before = bunny.evaluate('e=>e.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation).map(a=>a.currentTime)')
        page.wait_for_timeout(180)
        r.check('quiet bunny motion advances while the reply waits', bunny.evaluate('(e,before)=>e.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation).every((a,i)=>a.currentTime>before[i])', before))
        r.check('waiting uses the same drawing and idle timings as the shared bunny', bunny.evaluate("e=>e.matches('.bunny[data-idle]') && e.getAttribute('viewBox')==='0 0 80 80' && e.getAnimations({subtree:true}).find(a=>a.animationName==='bunny-breathe').effect.getTiming().duration===2400"))
        page.evaluate('LittleDaysBunny.twitch()')
        r.check('waiting uses the shared short ear twitch', bunny.evaluate("e=>e.getAnimations({subtree:true}).some(a=>a.id==='bunny-twitch' && a.effect.getTiming().duration<300)"))
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function('LittleDaysBunny.scheduled()===false')
        r.check('reduced motion keeps the bunny without animations or scheduled gestures', bunny.is_visible() and bunny.evaluate('e=>e.getAnimations({subtree:true}).length===0 && LittleDaysBunny.scheduled()===false'))
        page.emulate_media(reduced_motion='no-preference')
        page.locator('.chat-question').evaluate("e=>e.style.minHeight='2000px'")
        page.locator('.chat-thread').evaluate('e=>e.scrollTop=0')
        page.wait_for_function("document.querySelector('.chat-bunny').getAnimations({subtree:true}).every(a=>a.playState==='paused')")
        r.check('offscreen bunny pauses and cancels scheduled gestures', bunny.evaluate("e=>!e.classList.contains('is-visible') && LittleDaysBunny.scheduled()===false"))
        page.locator('.chat-question').evaluate("e=>e.style.minHeight=''")
        page.wait_for_function("document.querySelector('.chat-bunny').getAnimations({subtree:true}).some(a=>a.playState==='running')")
        page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}")
        r.check('hidden document pauses the bunny and cancels scheduled gestures', bunny.evaluate("e=>e.getAnimations({subtree:true}).every(a=>a.playState==='paused') && LittleDaysBunny.scheduled()===false"))
        page.evaluate("()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));}")
    page.evaluate("()=>{S.chat.draft='Second question'}")
    page.locator('#ai-form').evaluate("e=>e.requestSubmit()")
    r.check('a second send during loading starts no request and adds no bubble', len(r.pending) == 1 and page.locator('.chat-question').count() == 1)
    page.evaluate("()=>{S.chat.draft=''}")
    r.pending.pop().fulfill(status=504, json={'error': 'generic-error'})
    page.locator('[role=alert]').wait_for()
    r.check('failed reply cancels the gesture and its schedule', page.evaluate('LittleDaysBunny.scheduled()===false'))
    if r.width == 390:
        shot(page, r.label + '-error')
    retry = page.locator('.chat-retry')
    r.check('failure keeps the bubble and shows one error line and one Try again of 48 px', page.locator('.chat-question').count() == 1 and page.locator('[role=alert]').inner_text() == c['failed'] and retry.count() == 1 and retry.inner_text() == c['retry'] and retry.bounding_box()['height'] >= 48 and page.locator('.chat-waiting').count() == 0)
    r.check('failed question is not put back in the field', page.locator('#ai-question').input_value() == '')
    count = len(r.requests)
    retry.click()
    page.wait_for_function('S.chat.loading')
    r.check('Try again resends the same text', len(r.requests) == count + 1 and r.requests[-1]['question'] == 'Keep this question' and page.locator('.chat-retry').count() == 0 and page.locator('.chat-question').count() == 1)
    r.mode['reply'] = 'success'
    r.pending.pop().fulfill(json=REPLY)
    page.locator('.chat-answer').wait_for()
    r.check('completed reply cancels the gesture and its schedule', page.evaluate('LittleDaysBunny.scheduled()===false'))
    r.check('answer lands under the same bubble with no duplicate bubble or error', page.locator('.chat-question').count() == 1 and page.locator('.chat-turn .chat-question + .chat-answer').count() == 1 and page.locator('[role=alert],.chat-retry,.chat-waiting').count() == 0)


def audit_no_retry(r):
    """A daily limit or a missing provider keeps the bubble and the message, with no Try again."""
    page = r.page
    for status, key in ((429, 'aiLimit'), (503, 'aiUnavailable')):
        r.fresh_chat()
        send_pending(r, 'Keep this question')
        r.pending.pop().fulfill(status=status, json={'error': key})
        page.wait_for_function('error=>S.chat.messages.at(-1).error===error', arg=key)
        r.check(key + ' keeps the bubble and its message, with no Try again', page.locator('.chat-question').count() == 1 and page.locator('[role=alert]').inner_text() == page.evaluate('key=>t(key)', key) and page.locator('.chat-retry').count() == 0)
        if r.width == 390:
            shot(page, r.label + '-' + key)
    r.mode['reply'] = 'success'


def audit_late_answers(r):
    page, field = r.page, r.page.locator('#ai-question')
    for boundary in ('reset', 'account', 'child'):
        r.fresh_chat()
        send_pending(r, 'Keep this question')
        if boundary == 'reset':
            page.evaluate('()=>{resetChat();render()}')
        else:
            state = {**page.st, 'me': {'id': 'adult:2' if boundary == 'account' else 'adult:1', 'name': 'Sage'}, 'child': {**page.st['child'], 'id': 'child:2' if boundary == 'child' else 'child:1'}}
            page.evaluate('state=>{applyServerData(state);render()}', state)
        r.pending.pop().fulfill(json=REPLY)
        page.wait_for_timeout(50)
        r.check('late reply discarded after ' + boundary + ', with its bubble', page.locator('.chat-answer').count() == 0 and page.locator('.chat-question').count() == 0 and field.input_value() == '')
        page.evaluate('()=>{S.chat.available=true;render()}')
    r.mode['reply'] = 'success'


def audit_sign_in(r):
    """An ended sign-in clears the chat, and the same person gets the question back in the field."""
    page = r.page
    r.fresh_chat()
    send_pending(r, 'Keep this question')
    r.mode['reply'] = '401'
    r.pending.pop().fulfill(status=401, json={'error': 'Sign in'})
    check_ui.unlock(page)
    page.locator('#login-form [type=submit]').click()
    page.locator('#ai-question').wait_for()
    page.wait_for_timeout(300)
    r.check('401: after sign-in the question is back in the field, with no bubble', page.locator('#ai-question').input_value() == 'Keep this question' and page.locator('.chat-question').count() == 0 and page.locator('[data-ai-send]').is_enabled())
    r.mode['reply'] = 'success'


def audit_older_failure(r):
    """Q1 fails, Q2 is sent: Q1 keeps its own error, and Try again on Q1 answers under Q1."""
    page = r.page
    r.fresh_chat()
    send_pending(r, 'First question')
    r.pending.pop().fulfill(status=504, json={'error': 'generic-error'})
    page.locator('[role=alert]').wait_for()
    send_pending(r, 'Second question')
    first = page.locator('.chat-turn').nth(0)
    r.check('while Q2 loads, Q1 keeps its error and its Try again waits', first.locator('[role=alert]').count() == 1 and first.locator('.chat-retry').count() == 1 and first.locator('.chat-retry').is_disabled() and page.locator('.chat-turn').nth(1).locator('.chat-waiting').count() == 1)
    count = len(r.requests)
    if first.locator('.chat-retry').count():
        first.locator('.chat-retry').click(force=True)
    page.wait_for_timeout(100)
    r.check('a click on Q1 Try again during the load starts no request', len(r.requests) == count and len(r.pending) == 1)
    r.mode['reply'] = 'success'
    r.pending.pop().fulfill(json=REPLY)
    page.locator('.chat-turn').nth(1).locator('.chat-answer').wait_for()
    r.check('after Q2 is answered, Q1 still shows its error and one enabled Try again', first.locator('[role=alert]').count() == 1 and first.locator('.chat-retry').count() == 1 and first.locator('.chat-retry').is_enabled() and page.locator('[role=alert]').count() == 1 and first.locator('.chat-answer').count() == 0)
    if r.width == 390:
        shot(page, r.label + '-error-older')
    r.mode['reply'] = 'pending'
    first.locator('.chat-retry').click()
    page.wait_for_function('S.chat.loading')
    r.check('Try again on Q1 resends Q1 only, with no history from Q2', r.requests[-1]['question'] == 'First question' and r.requests[-1]['history'] == [] and page.locator('.chat-turn').nth(0).locator('.chat-waiting').count() == 1)
    r.mode['reply'] = 'success'
    r.pending.pop().fulfill(json=REPLY)
    first.locator('.chat-answer').wait_for()
    r.check('Q1 answer lands under Q1 with no new bubble, and no error or Try again is left', page.locator('.chat-question').count() == 2 and first.locator('.chat-question + .chat-answer').count() == 1 and page.locator('[role=alert],.chat-retry,.chat-waiting').count() == 0)


def audit_failures(r):
    audit_sent(r)
    audit_older_failure(r)
    audit_no_retry(r)
    audit_late_answers(r)
    audit_sign_in(r)


def audit_unavailable(r):
    page, field = r.page, r.page.locator('#ai-question')
    page.evaluate('()=>{resetChat();render()}')
    r.mode['available'] = False
    navigate(page, 'home')
    page.locator('.insight [data-act=ask-ai]').click()
    page.wait_for_function('S.chat.available===false')
    field.fill('Unavailable question')
    r.check('unavailable provider explains state and disables send', bool(page.locator('.chat-status').inner_text()) and page.locator('[data-ai-send]').is_disabled())
    if r.width != 390:
        return
    shot(page, r.label + '-unavailable')
    page.evaluate('()=>{S.chat.available=true;render()}')
    field.fill('A' * 500)
    r.check('500 character question stays editable and fits', field.input_value() == 'A' * 500 and fits(page))
    navigate(page, 'home')
    page.locator('.insight [data-act=ask-ai]').click()
    r.check('back to home retains draft until reset or reload', field.input_value() == 'A' * 500)
    page.reload()
    page.locator('.insight [data-act=ask-ai]').click()
    field.wait_for()
    r.check('reload clears chat', field.input_value() == '' and page.locator('.chat-answer').count() == 0)


def audit_fallback(r):
    page = r.page
    navigate(page, 'home')
    page.evaluate("()=>{S.entries=[];S.child={...S.child,birthDate:null};S.developmentBatch=null;S.factId='';S.factRecent=[];render()}")
    r.check('no eligible facts explains empty state, with no arrows, dots, or Pause', page.locator('.insight h2').inner_text() == ('Hay más por descubrir' if r.lang == 'es' else 'A little more to discover') and page.locator('[data-act=fact-next], .fact-dots, [data-act=fact-pause]').count() == 0 and page.locator('.ask-pill').is_enabled())
    shot(page, r.label + '-fallback')


def audit(browser, base, width, height, lang, theme):
    r = Run(browser, base, width, height, lang, theme)
    audit_home(r)
    audit_header(r)
    audit_blank(r)
    audit_conversation(r)
    audit_sources(r)
    audit_keys(r)
    if width in (390, 2000):
        audit_zoom(r)
    if width == 390:
        audit_return(r)
    audit_record_link(r)
    audit_failures(r)
    audit_unavailable(r)
    if width == 390:
        audit_fallback(r)
    r.check('no browser errors', not r.page.errors)
    r.page.context.close()


def audit_widths(browser, base):
    """The AI button inside the fact card, in both languages: 390 and 375 px phones, narrower ones, and 200 percent zoom."""
    r = Run(browser, base, 390, 844, 'en', 'off')
    css = r.page.evaluate("fetch('app.css').then(res => res.text())")
    r.check('app.css has as many closing braces as opening ones', css.count('{') == css.count('}'))
    r.page.context.close()
    for lang in ('en', 'es'):
        for width in (390, 375, 360, 320, 195):
            r = Run(browser, base, width, 844, lang, 'off')
            r.check('Home text and fact button do not overlap', r.page.evaluate(HEADER_BOXES))
            if width >= 320:
                r.page.evaluate("document.documentElement.style.zoom='2'")
                r.check('200 percent zoom keeps Home text and fact button apart', r.page.evaluate(HEADER_BOXES) and fits(r.page))
            r.page.context.close()


def audit_timer(browser, base):
    run = {'id': 'run-1', 'kind': 'feed', 'side': 'L', 'by': 'Rowan', 'startedAt': (AT-timedelta(minutes=5)).isoformat(), 't0': mx_minutes(AT)-5}
    page = open_app(browser, base, 390, 844, AT, theme='on', run=run)
    page.set_default_timeout(5000)
    def timer(route):
        body = route.request.post_data_json
        page.writes.append({'url': route.request.url, **body})
        if route.request.url.endswith('/switch'):
            page.st['run'] = {**run, 'side': body['side']}
        else:
            page.st['run'] = None
        route.fulfill(json={'status': 'saved', 'operationId': body['operationId'], 'state': page.st})
    page.route('**/api/timers/**', timer)
    check('active timer remains above facts and tiles', page.evaluate('document.querySelector(".run-card").getBoundingClientRect().top < document.querySelector(".insight").getBoundingClientRect().top && document.querySelector(".run-card").getBoundingClientRect().top < document.querySelector(".tile").getBoundingClientRect().top'))
    check('active timer keeps one fact under the remaining logging tiles', page.evaluate("() => document.querySelectorAll('.insight').length === 1 && !document.querySelector('.development') && document.querySelector('.tiles').getBoundingClientRect().bottom <= document.querySelector('.insight').getBoundingClientRect().top"))
    shot(page, 'home-active-feed-390')
    page.locator('.run-card [data-act=open-feed]').click()
    page.locator('[data-sheet] [data-act=switch][data-arg=R]').click()
    page.wait_for_function('S.run?.side==="R"')
    check('timer switch control saves the other side', page.writes[-1]['side'] == 'R')
    page.locator('.run-card [data-act=open-feed]').click()
    page.locator('[data-sheet] [data-act=stop]').click()
    page.locator('.confirm [data-act=stop-go]').click()  # Stop asks first since round 3
    page.wait_for_function('!S.run')
    check('timer stop control stops the run', page.writes[-1]['url'].endswith('/stop'))
    page.context.close()
    page = open_app(browser, base, 390, 844, AT)
    audit_next_side(page)
    check('existing next-side checks', check_ui.FAIL == 0)
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for width, height in ((390,844), (1440,900), (2000,860)):
                    for lang, theme in (('en','off'), ('es','on')):
                        audit(browser, base, width, height, lang, theme)
                audit_widths(browser, base)
                audit_timer(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{PASS} passed, {FAIL} failed')
    raise SystemExit(bool(FAIL))


if __name__ == '__main__':
    main()
