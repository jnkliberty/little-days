"""Wave 9 (D6): with AI off the screens show no AI control and send no AI request; with AI on, Chat shows the medical notice and the limit message."""
import os
import time

# The app takes its time zone from the session. These checks send none, so the browser's own zone decides: pin it.
os.environ["TZ"] = "America/Mexico_City"
time.tzset()

import shutil
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright
from check_support import open_app, start_static_server

AT = datetime.fromisoformat("2026-11-08T12:00:00-06:00")
OUT = Path(__file__).resolve().parents[2] / ".evidence/ai-defaults"
PASS = FAIL = 0


def check(name, value):
    global PASS, FAIL
    if value:
        PASS += 1
        print("PASS", name, flush=True)
    else:
        FAIL += 1
        print("FAIL", name, flush=True)


def watch(page):
    """Count every request to an AI route (chat, status, daily development)."""
    seen = []
    page.on("request", lambda request: seen.append(request.url) if any(part in request.url for part in ("/api/ai/", "/api/development")) else None)
    return seen


def audit_ai_off(browser, base, lang):
    page = open_app(browser, base, 390, 844, AT, lang=lang, ai=False)
    seen = watch(page)
    page.evaluate(f"() => {{ S.lang='{lang}'; render(); }}")
    page.wait_for_timeout(300)
    check(f"{lang} AI off: Home shows no Ask button (the facts card stays: its facts need no AI)", page.locator(".ask-pill").count() == 0 and page.locator('[data-act="ask-ai"]').count() == 0)
    check(f"{lang} AI off: Home still shows the log tiles", page.locator('.tile[data-act="open-feed"]').count() == 1)
    page.evaluate("() => { openChat(); }")
    page.wait_for_timeout(300)
    check(f"{lang} AI off: Chat cannot be opened", page.evaluate("S.tab") == "home" and page.locator(".chat-screen").count() == 0)
    page.evaluate("() => { S.tab='chat'; render(); }")
    page.wait_for_timeout(300)
    check(f"{lang} AI off: a Chat route shows nothing AI", page.locator(".chat-screen").count() == 0 and page.locator("#ai-question").count() == 0)
    page.evaluate("() => { S.tab='home'; render(); }")
    text = page.locator("body").inner_text().lower()
    check(f"{lang} AI off: no screen text offers AI", "ask ai" not in text and "preguntar a ia" not in text)
    page.evaluate("async () => { S.auth='ready'; await loadDailyDevelopment(); }")
    check(f"{lang} AI off: the app sends no AI request", seen == [])
    page.context.close()


def audit_ai_on(browser, base, lang):
    page = open_app(browser, base, 390, 844, AT, lang=lang, ai=True)
    chats = []
    page.route("**/api/ai/status", lambda route: route.fulfill(json={"available": True, "provider": "Anthropic"}))
    page.route("**/api/ai/chat", lambda route: (chats.append(1), route.fulfill(status=429, json={"error": "The daily limit was reached."}))[-1])
    page.evaluate(f"() => {{ S.lang='{lang}'; render(); }}")
    check(f"{lang} AI on: Home shows the insight card with its Ask button", page.locator(".insight").count() == 1 and page.locator('.insight [data-act="ask-ai"]').count() == 1)
    page.locator('.insight [data-act="ask-ai"]').click()
    page.locator("#ai-question").wait_for()
    notice = page.locator(".chat-notice")
    want = "Not medical advice" if lang == "en" else "No es consejo médico"
    check(f"{lang} AI on: Chat shows the medical notice", notice.count() == 1 and notice.is_visible() and want in notice.inner_text())
    page.locator("#ai-question").fill("How long should a nap be?")
    page.locator("[data-ai-send]").click()
    page.locator(".chat-turn, .chat-question").first.wait_for()
    page.wait_for_function("document.body.textContent.includes('%s')" % ("daily question limit" if lang == "en" else "límite diario"), timeout=5000)
    shown = page.locator("body").inner_text()
    check(f"{lang} AI on: the question after the limit shows a clear message", len(chats) == 1 and ("daily question limit" if lang == "en" else "límite diario") in shown)
    OUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUT / f"chat-notice-{lang}.png"))
    page.context.close()


def main():
    server, base = start_static_server()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for lang in ("en", "es"):
            audit_ai_off(browser, base, lang)
            audit_ai_on(browser, base, lang)
        browser.close()
    print(f"{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
