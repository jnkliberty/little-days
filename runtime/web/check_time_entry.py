"""Number fields request a keypad; digit entry preserves the saved feed time."""
from datetime import datetime
from pathlib import Path
from shutil import which
from playwright.sync_api import sync_playwright
from check_support import launch_browser, open_app, start_static_server


def audit_number_keypads(browser, base):
    page = open_app(browser, base, 390, 844, datetime.fromisoformat('2026-11-13T16:47:00-06:00'))
    try:
        cases = [
            ('medicine', "act('open-med')", {'dose':'decimal', 'medClock':'numeric'}),
            ('temperature', "act('open-temp')", {'temperature':'decimal', 'tempClock':'numeric'}),
            ('growth', "act('open-growth')", {'weight':'decimal', 'length':'decimal', 'head':'decimal'}),
            ('visit', "act('open-visit')", {'visitWeight':'decimal', 'visitLength':'decimal', 'visitHead':'decimal'}),
            ('tummy time', "act('quick','tummy')", {'duration':'numeric', 'manualClock':'numeric'}),
            ('diaper', "act('open-dia')", {'manualClock':'numeric'}),
            ('sleep', "act('open-sleep');act('manual')", {'manualClock':'numeric','manualEndClock':'numeric'}),
        ]
        for name, action, fields in cases:
            page.evaluate("() => {S.sheet=null;S.drafts={};" + action + ";render()}")
            for field, mode in fields.items():
                assert page.locator(f'[data-fid="{field}"]').get_attribute('inputmode') == mode, f'{name}: {field} needs {mode}'
            if name == 'medicine':
                page.locator('[data-fid="dose"]').fill('0.5')
                assert page.evaluate('S.sheet.dose') == '0.5'
                assert page.locator('[data-fid="name"]').get_attribute('inputmode') is None
            print(f'PASS {name}: number fields request the correct keypad')
        page.evaluate("() => {S.sheet=null;S.drafts={};act('edit','e1');render()}")
        assert page.locator('[data-fid="valueDur"]').get_attribute('inputmode') == 'numeric'
        assert page.locator('[data-fid="editClock"]').get_attribute('inputmode') == 'numeric'
        print('PASS feed edit: existing numeric duration and numeric time keypad remain available')
        assert not page.errors
    finally:
        page.close()


def main():
    server, base = start_static_server()
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw, executable_path=which('agent-browser-chrome'))
            try:
                audit_number_keypads(browser, base)
                for width, lang in ((390,'en'), (390,'es'), (1440,'en'), (2000,'en')):
                    page = open_app(browser, base, width, {390:844,1440:900,2000:860}[width], datetime.fromisoformat('2026-11-13T16:47:00-06:00'), lang=lang)
                    page.evaluate("() => {S.sheet=null;act('open-feed');act('ftab','bottle');render()}")
                    # open_app opens details for old tests; close it to exercise the real default.
                    page.evaluate("() => {document.querySelectorAll('details').forEach(d=>d.open=false);S.sheet.detailsOpen=false}")
                    evidence = Path(__file__).resolve().parents[2] / '.evidence' / 'time-entry-final'
                    evidence.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(evidence / f'feed-{width}.png'))
                    assert page.locator('[data-fid="manualEndClock"]').is_visible(), 'End must be visible without More details'
                    assert page.locator('[data-act="start"][data-arg="bottle"]').is_visible()
                    start = page.locator('[data-fid="manualClock"]')
                    assert start.get_attribute('inputmode') == 'numeric'
                    start.fill('35')
                    assert page.locator('[data-fid="manualEndClock"]').input_value() == ''
                    start.fill('')
                    start.press_sequentially('1257')
                    assert start.input_value() == '12:57'
                    start.fill('')
                    start.press_sequentially('357')
                    assert start.input_value() == '3:57'
                    page.locator('[data-act="clock-period"][data-arg="manual:PM"]').click()
                    end = page.locator('[data-fid="manualEndClock"]')
                    end.fill('420')
                    assert end.input_value() == '4:20'
                    page.locator('[data-act="clock-period"][data-arg="manualEnd:PM"]').click()
                    page.locator('[data-act="ml-set"]').first.click()
                    page.locator('[data-act="milk"]').first.click()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    assert page.locator('[data-act="clock-period"]').evaluate_all('buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)')
                    page.evaluate("() => {document.querySelectorAll('details').forEach(d=>d.open=false);S.sheet.detailsOpen=false}")
                    assert page.locator('[data-sheet] [data-act="save"]').evaluate('b=>b.getBoundingClientRect().bottom <= innerHeight')
                    page.screenshot(path=str(evidence / f'feed-{width}-{lang}.png'))
                    page.locator('[data-sheet] [data-act="save"]').click()
                    page.wait_for_function('!S.busy && !S.sheet')
                    event = page.writes[-1]['event']
                    assert event['start'] == '2026-11-13T21:57:00.000Z'
                    assert event['end'] == '2026-11-13T22:20:00.000Z'
                    assert not page.errors
                    page.close()
                    print(f'PASS {width}px: visible clocks, numeric entry, AM/PM buttons, correct saved times')
            finally:
                browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
