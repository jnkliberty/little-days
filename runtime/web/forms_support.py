"""Shared helpers for the browser checks that fill the full-screen forms (look-match, forms builder)."""
import re

# The form keeps Day, Ended, Logged by and Note behind a "More details" link. The checks that fill those fields
# open it first, once for each drawn form. The one check that clicks the link itself is in check_writes.py.
OPEN_DETAILS = """new MutationObserver(() => {
  for (const d of document.querySelectorAll('details[data-more-details]:not([data-test-opened])')) { d.setAttribute('data-test-opened', ''); d.open = true; }
}).observe(document, { childList: true, subtree: true });"""


def set_period(page, prefix, period):
    """Use the visible AM/PM button, or type the period on older forms."""
    button = page.locator(f'[data-act="clock-period"][data-arg="{prefix}:{period}"]')
    if button.count():
        button.click()
        return
    box = page.locator(f'[data-fid="{prefix}Clock"]')
    digits = re.sub(r"\s*[ap]\.?\s*m?\.?\s*$", "", box.input_value(), flags=re.I).strip()
    box.fill(f"{digits} {period}")


def save_diaper(page, kind="W"):
    """The diaper form has Wet / Dirty / Wet and dirty chips and a Save button: pick the kind, then save."""
    page.locator(f'[data-sheet] [data-act="dkind"][data-arg="{kind}"]').evaluate("el => el.click()")
    page.locator('[data-sheet] [data-act="save"]').evaluate("el => el.click()")


def stop_click(page, selector, evaluate=False):
    """Stop now asks first: click the Stop button, then the confirm's own Stop button (the Keep button would cancel)."""
    button = page.locator(selector)
    if evaluate:
        button.evaluate("el => el.click()")
    else:
        button.click()
    page.locator('.confirm [data-act="stop-go"]').click()


def pick_setting(page, key, value):
    """Settings picks (language, units) are chips now: click the chip that carries the value."""
    page.locator(f'[data-setting="{key}"][data-value="{value}"]').click()
