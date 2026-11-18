"""A redraw while a parent types keeps the field's text and caret, using the writes suite's fake API.

A record from another phone redraws the open form (syncFamily calls render). The field being typed in must keep
exactly what is on screen and where the caret is, so the next key adds to the value.
"""
from copy import deepcopy
from urllib.parse import urlsplit

FRAME = "() => new Promise(resolve => requestAnimationFrame(resolve))"


def frames(page):
    page.evaluate(FRAME)
    page.evaluate(FRAME)


def tap_and_type(page, fid, text):
    page.evaluate("() => document.activeElement?.blur()")  # a tap on a field that already has focus selects nothing
    page.locator(f'[data-sheet] [data-fid="{fid}"]').click()
    frames(page)  # a tap selects the old value, so the first key replaces it
    page.keyboard.type(text)


def redraw(page):
    page.evaluate("() => render()")
    frames(page)


def value(page, fid):
    return page.locator(f'[data-sheet] [data-fid="{fid}"]').input_value()


def audit_redraw_typing(browser, base, state, check):
    page = browser.new_page()
    page.route("**/*", lambda route: route.continue_() if urlsplit(route.request.url).hostname == "127.0.0.1" else route.abort())
    local = deepcopy(state)
    local.update({"me": "Rowan", "people": ["Rowan", "Sage", "Wren"], "entries": [],
                  "run": None, "sleepRun": None, "pumpRun": None, "pendingOperations": []})
    page.clock.set_fixed_time("2026-11-09T00:00:00.000Z")  # November 8, 6:00 PM in Mexico City
    page.route("**/api/session", lambda route: route.fulfill(json={"me": local["me"], "csrf": "fake"}))
    page.route("**/api/state", lambda route: route.fulfill(json=local))
    try:
        page.goto(base)
        page.locator('.tile[data-act="open-feed"]').wait_for()
        page.evaluate("() => {S.sheet=null;S.drafts={};S.tab='home';act('open-feed');act('ftab','bottle');render();}")
        tap_and_type(page, "ml", "12")
        redraw(page)
        page.keyboard.type("3")
        check("rvsg a redraw while typing an amount keeps both parts", value(page, "ml") == "123")
        check("rvsg the saved amount matches the screen after the redraw", page.evaluate("S.sheet.ml") == 123)
        tap_and_type(page, "ml", "12.")
        redraw(page)
        page.keyboard.type("5")
        check("rvsg a redraw keeps a typed decimal point", value(page, "ml") == "12.5")
        tap_and_type(page, "ml", "125")
        page.keyboard.press("ArrowLeft")
        redraw(page)
        page.keyboard.type("0")
        check("rvsg a redraw keeps the caret in the middle of an amount", value(page, "ml") == "1205")
        tap_and_type(page, "manualClock", "2")
        redraw(page)
        page.keyboard.type("30")
        check("rvsg a redraw while typing a time keeps the formatted time", value(page, "manualClock") == "2:30")
        tap_and_type(page, "ml", "7")
        check("rvsg a tap on an amount still selects it, so the first key replaces it", value(page, "ml") == "7")
    finally:
        page.close()
