"""One Home fact card is one language. Synthetic API responses only; no family data.

Failure case: the daily facts come from a model that writes [English, Spanish] pairs. The server checks only that
each slot holds text, so a pair whose Spanish slot holds English (or the reverse), or whose two slots are the same
sentence, gave a card with a Spanish title and an English body. A source label is the English article title in both
languages, so a Spanish screen reader read the link in English. The app must skip a fact that has no text in the
chosen language, and must not put another language into a link label.
"""
import re
import shutil
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server

AT = datetime.fromisoformat('2026-11-10T12:00:00-06:00')
DAY = '2026-11-10'
SHOTS = Path('/tmp/little-days-fact-language')
URL = 'https://www.cdc.gov/act-early/milestones/2-months.html'
# Test-side word lists, written apart from the app's, so the check does not grade the app with its own ruler.
EN = set('the and of to is are with your you baby babies when this that from for by can most may they their how while after before'.split())
ES = set('el la los las de del y en un una su sus que por con para al se es más como cuando bebé bebés puede pueden'.split())
FAILS = []


def words(text):
    return re.findall(r"[a-záéíóúñü]+", text.lower())


def wrong_language(text, lang):
    text = re.sub(r"[\"“”«»][^\"“”«»]*[\"“”«»]|(?<![a-z])'[^']*'(?![a-z])", ' ', text.lower())
    tokens = words(re.sub(r"[a-záéíóúñü]+(?:-[a-záéíóúñü]+)+", ' ', text))
    en, es = len(EN & set(tokens)), len(ES & set(tokens))  # distinct marker words
    return en > es if lang == 'es' else es > en


def card(i, title, body, source):
    return {'id': f'daily-{DAY}-{i}', 'date': DAY, 'topic': [f'topic{i}', f'tema{i}'], 'title': title, 'body': body,
            'source': source, 'sourceDate': 'Retrieved ' + DAY, 'url': URL}


GOOD = card(1, ['Sounds become a conversation', 'Los sonidos se vuelven una conversación'],
            ['Babies learn through back-and-forth sounds. Respond when your baby makes a sound.',
             'Los bebés aprenden al intercambiar sonidos. Responda cuando su bebé haga un sonido.'], ['CDC', 'CDC'])
LABEL = card(2, ['Faces are easiest to see nearby', 'Los rostros se ven mejor de cerca'],
             ['Newborns see light, shapes, and faces. Faces are easiest to see at about 20 cm.',
              'Los recién nacidos ven la luz, las formas y los rostros. Los rostros se ven mejor a unos 20 cm.'],
             ['Your Baby Vision Development | HealthyChildren.org', 'Your Baby Vision Development | HealthyChildren.org'])
ENGLISH_BODY = card(3, ['Talk back to your baby', 'Responda a su bebé'],
                    ['Most babies make cooing sounds and make sounds back when someone talks to them.',
                     'Most babies make cooing sounds and make sounds back when someone talks to them.'], ['CDC', 'CDC'])
ENGLISH_IN_SPANISH_SLOT = card(4, ['Hold and respond to your baby', 'Hold and respond to your baby'],
                               ['Hold, cuddle, and respond to your baby in the early months so your baby feels safe.',
                                'Cargue, abrace y responda a su bebé en los primeros meses para que se sienta seguro.'], ['CDC', 'CDC'])
SWAPPED = card(5, ['Observe si necesita una pausa', 'Watch for a break'],
               ['Durante el juego, observe si su bebé necesita una pausa de los sonidos.',
                'During play, watch for signs that your baby needs a break from the sounds.'], ['CDC', 'CDC'])
# Quoted examples are not the language of the sentence. The English card has three "la" tokens against one English word.
QUOTED_SYLLABLES = card(6, ['Repeating sounds', 'Sonidos repetidos'],
                        ["Babies repeat syllables such as 'la-la-la'.", 'Los bebés repiten sílabas como «la-la-la» cuando juegan.'], ['CDC', 'CDC'])
QUOTED_ENGLISH = card(7, ['First words', 'Primeras palabras'],
                      ['Babies copy words such as "mom" when you talk to them.',
                       'Los bebés dicen "the", "and", "of" y "to".'], ['CDC', 'CDC'])
# A word that repeats is one marker word, not three. Unquoted syllables and repeated words must not decide the language.
REPEATED_SYLLABLES = card(8, ['Repeating syllables', 'Sílabas repetidas'],
                          ['Babies repeat syllables such as la, la, la.', 'Los bebés repiten sílabas como la, la, la cuando juegan.'], ['CDC', 'CDC'])
REPEATED_NO = card(9, ['Saying no', 'Decir no'],
                   ['Babies say no, no, no when they play.', 'Los bebés dicen no, no, no cuando juegan.'], ['CDC', 'CDC'])
REPEATED_ENGLISH = card(10, ['Echo words', 'Palabras eco'],
                        ['Babies copy the sound of a word.', 'Los bebés dicen the, the, the, the.'], ['CDC', 'CDC'])
BATCH = {'date': DAY, 'status': 'ready', 'cards': [GOOD, LABEL, ENGLISH_BODY, ENGLISH_IN_SPANISH_SLOT, SWAPPED, QUOTED_SYLLABLES, QUOTED_ENGLISH,
                                                  REPEATED_SYLLABLES, REPEATED_NO, REPEATED_ENGLISH]}
# A card is shown in a language only when that language's slots hold that language. Card 3 and card 4 are fine in English.
QUOTED = {QUOTED_SYLLABLES['id'], QUOTED_ENGLISH['id'], REPEATED_SYLLABLES['id'], REPEATED_NO['id'], REPEATED_ENGLISH['id']}
KEEP = {'es': {GOOD['id'], LABEL['id']} | QUOTED, 'en': {GOOD['id'], LABEL['id'], ENGLISH_BODY['id'], ENGLISH_IN_SPANISH_SLOT['id']} | QUOTED}


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail and not ok else ''), flush=True)
    if not ok:
        FAILS.append(name)


def audit(browser, base, lang):
    page = open_app(browser, base, 390, 844, AT, lang=lang)
    page.set_default_timeout(5000)
    page.route('**/api/development', lambda route: route.fulfill(json=BATCH))
    page.reload()
    page.wait_for_function("S.developmentBatch?.status==='ready'")
    facts = page.evaluate("factPool().map(f=>({id:f.id,kind:f.kind,topic:f.topic}))")
    shown = {f['id'] for f in facts if f['kind'] == 'source'}
    check(f'{lang}: only the facts that have text in the chosen language are shown', shown == {f"source:{i}" for i in KEEP[lang]}, sorted(shown))
    SHOTS.mkdir(exist_ok=True)
    mixed = []
    for fact in facts:
        page.evaluate("(id)=>{S.factId=id;render()}", fact['id'])
        page.locator('.insight h2').wait_for()
        parts = {'title': page.locator('.insight h2').inner_text(), 'body': page.locator('.insight .fact-body').inner_text()}
        for link in page.locator('.insight a[aria-label], .insight a').all():
            parts['link'] = (link.get_attribute('aria-label') or '') + ' ' + link.inner_text()
        if fact['topic'] == 'milestone':
            parts.pop('body')  # the adult's own words
        mixed += [f"{fact['id']}:{k}" for k, text in parts.items() if wrong_language(text, lang)]
        if fact['id'] == f"source:{LABEL['id']}":
            page.screenshot(path=str(SHOTS / f'{lang}-label-card.png'), full_page=True)
    check(f'{lang}: no visible fact card has a title, body, or link label in the other language', not mixed, mixed)
    kept = page.evaluate("""(lang) => {
      const seen = new Map();
      for (let m = 0; m < 14; m++) {
        const birth = new Date(Date.UTC(2026, 10, 10) - m * 30.5 * 864e5).toISOString().slice(0, 10);
        for (const c of LITTLE_DAYS_DEVELOPMENT.cardsForAge(birth, '2026-11-10')) seen.set(c.id, {...c, date: '2026-11-10'});
      }
      const facts = LittleDaysInsights.pool({entries: [], child: {}, permissions: S.permissions, today: '2026-11-10', nowMinutes: 600, lang, developmentCards: [...seen.values()]});
      return [seen.size, facts.length];
    }""", lang)
    check(f'{lang}: the built-in age guidance (written in both languages) is never skipped', kept[0] > 0 and kept[0] == kept[1], kept)
    check(f'{lang}: no page error', not page.errors, page.errors)
    page.context.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=shutil.which('agent-browser-chrome'))
            try:
                for lang in ('es', 'en'):
                    try:
                        audit(browser, base, lang)
                    except Exception as error:
                        check(f'{lang}: audit completed ({type(error).__name__})', False, str(error)[:200])
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'{len(FAILS)} failed')
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
