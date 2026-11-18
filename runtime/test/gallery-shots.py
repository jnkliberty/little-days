"""Capture Gallery states from existing synthetic browser fixtures.

Run it with a Python that has Playwright installed.
Use --dry-run to list the capture count without starting a browser or server.
"""
import argparse
import base64
import io
import json
import sys
import threading
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "runtime/web"))
from check_review_20261103 import QuietHandler, open_app
from check_charts import growth_fixture

OUT = ROOT / "design/2026-11-06-redesign/build-shots"
AT = datetime.fromisoformat("2026-11-07T11:56:00-06:00")
STATES = [
    ("home", "", None),
    ("home-running", "S.run=fixtureRun", None),
    ("home-extras", "", ".home-extras"),
    ("home-fact", "", ".insight"),
    ("timeline", "S.tab='log'", None),
    ("timeline-empty", "S.tab='log';S.entries=[]", None),
    ("charts", "S.tab='charts'", None),
    ("charts-sleep", "S.tab='charts'", ".sleep-card"),
    ("charts-growth", "S.tab='charts'", ".growth-series"),
    ("charts-rhythm", "S.tab='charts'", ".rhythm-card"),
    ("charts-loading", "S.tab='charts';S.trendsLoading=true;S.growthLoading=true", None),
    ("charts-error", "S.tab='charts';S.trendsError=true;S.growthError=true", None),
    ("photos", "S.tab='photos'", None),
    ("photos-empty", "S.tab='photos';S.entries=[]", None),
    ("more", "act('open-more')", None),
    ("more-bottom", "act('open-more')", ".theme-row"),
    ("feed", "act('open-feed')", None),
    ("feed-bottle", "act('open-feed');act('ftab','bottle')", None),
    ("feed-pump", "act('open-feed');act('ftab','pump')", None),
    ("feed-manual", "act('open-feed');act('manual')", None),
    ("feed-manual-filled", "act('open-feed');act('manual');Object.assign(S.sheet,{hour:'11',minute:'20',period:'AM',endHour:'11',endMinute:'38',endPeriod:'AM',manualDuration:'18'})", None),
    ("feed-manual-future", "act('open-feed');act('manual');Object.assign(S.sheet,{hour:'11',minute:'40',period:'AM',endHour:'12',endMinute:'30',endPeriod:'PM',manualDuration:'50'})", None),
    ("feed-bottle-typed", "act('open-feed');act('ftab','bottle');S.sheet.ml=15", None),
    ("feed-running-panel", "S.run=fixtureRun;act('open-feed')", None),
    ("sleep", "act('open-sleep')", None),
    ("sleep-manual", "act('open-sleep');act('manual')", None),
    ("sleep-running", "S.sleepRun={...fixtureRun,kind:'sleep',nap:true};act('open-sleep')", None),
    ("home-sleep-running", "S.sleepRun={...fixtureRun,kind:'sleep',nap:true}", None),
    ("home-both-running", "S.run=fixtureRun;S.sleepRun={...fixtureRun,id:'sleep-fixture',kind:'sleep',nap:true}", None),
    ("diaper", "act('open-dia')", None),
    ("edit-diaper", "act('edit','e3')", None),
    ("edit-feed", "act('edit','e1')", None),
    ("edit-sleep", "act('edit','e2')", None),
    ("medicine", "act('open-med')", None),
    ("temperature", "act('open-temp')", None),
    ("note", "act('open-note')", None),
    ("growth", "act('open-growth')", None),
    ("appointment", "act('open-appointment')", None),
    ("visit", "act('open-visit')", None),
    ("handoff", "act('open-handoff')", None),
    ("reminder", "act('open-reminder')", None),
    ("solids", "act('quick','solids')", None),
    ("tummy", "act('quick','tummy')", None),
    ("bath", "act('quick','bath')", None),
    ("milestone", "act('quick','mile')", None),
    ("duty", "act('duty')", None),
    ("care", "S.careData=fixtureCare;S.sheet={kind:'care',careStart:'2026-11-07T09:00',careEnd:'2026-11-07T11:00'}", None),
    ("care-history", "S.careData=fixtureCare;S.sheet={kind:'care'}", ".care-list"),
    ("care-loading", "S.careLoading=true;S.sheet={kind:'care'}", None),
    ("care-error", "S.careData=null;S.careError=t('careUnavailable');S.sheet={kind:'care'}", None),
    ("confirm-timer", "S.sheet={kind:'confirm',by:'Sage',act:'stop'}", None),
    ("correct-timer", "S.sheet={kind:'correction',start:fixtureRun.startedAt,maxEnd:new Date().toISOString(),date:todayISO(),hour:'11',minute:'50',period:'AM'}", None),
    ("discard", "S.sheet={kind:'discard',draft:{kind:'note',text:'A draft note'}}", None),
    ("undo", "setToast(t('savedFeed'),'fixture-undo',new Date(Date.now()+10000).toISOString())", None),
    ("save-error", "act('open-note');S.sheet.text='Keep this draft';S.message=t('saveFailed')", None),
    ("login", "S.auth='login';S.people=['Rowan','Sage']", None),
    ("login-error", "S.auth='login';S.people=['Rowan','Sage'];S.message=t('loginFailed')", None),
    ("setup", "S.auth='setup';S.child=null", None),
    ("setup-waiting", "S.auth='setup';S.child=null;S.permissions.resources.children.add=false", None),
    ("loading", "S.auth='loading'", None),
    ("connection-error", "S.auth='error';S.message=t('tryAgain')", None),
]


def photo_fixture():
    image = Image.new("RGB", (400, 280), "#e6e6ea")
    draw = ImageDraw.Draw(image)
    draw.rectangle((24, 24, 376, 256), outline="#5f5f66", width=2)
    draw.text((132, 132), "Synthetic photo fixture", fill="#1f1f23")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def capture_group(browser, base, width, height, theme):
    page = open_app(browser, base, width, height, AT, theme=theme)
    page.clock.pause_at(AT + timedelta(seconds=1))
    state = page.st
    state["entries"][0].update(t=680)
    state["entries"][1].update(t=565, dur=89)
    state["entries"][2].update(t=705, kind="B", col="pale")
    state["entries"] += [
        {"id":"older-feed", "type":"bottle", "t":515, "ml":60, "milk":"breast", "by":"Sage"},
        {"id":"photo", "type":"note", "t":550, "text":"Synthetic image for layout checks", "title":"Test photo", "photo":photo_fixture(), "by":"Rowan"},
    ]
    run = {"id":"fixture-run", "kind":"feed", "side":"L", "by":"Rowan", "t0":702, "startedAt":(AT-timedelta(minutes=14)).isoformat()}
    care = {"exportOptIn":False, "confirmations":[{"id":"fixture-care", "start":"2026-11-07T15:00:00Z", "end":"2026-11-07T17:00:00Z"}],
            "dutyHistory":[{"who":"Rowan", "adult":"Sage", "note":"After the morning feed", "occurredAt":"2026-11-07T15:00:00Z"}]}
    page.evaluate("([run,care])=>{window.fixtureRun=run;window.fixtureCare=care}", [run, care])
    files = []
    for name, code, target in STATES:
        page.evaluate("""([state,growth])=>{
            loadServerState(state);S.auth='ready';S.tab='home';S.sheet=null;S.drafts={};S.toast=null;S.message='';S.retryAction=null;
            S.busy=false;S.careLoading=false;S.careData=null;S.trendsLoading=false;S.trendsError=false;S.growthLoading=false;S.growthError=false;
            S.growthEntries=growth.entries;S.growthOpen={};S.chartDetail=null;S.search='';S.filter='all';render();
        }""", [state, growth_fixture()])
        page.evaluate("() => {" + code + ";render();document.querySelector('[data-scroll]')?.scrollTo(0,0);document.querySelector('.sh-body')?.scrollTo(0,0)}")
        if target:
            page.locator(target).first.scroll_into_view_if_needed()
        assert not page.errors, (name, page.errors)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), name
        file = OUT / f"{width}-{theme}-{name}.png"
        page.screenshot(path=str(file))
        files.append(file)
    page.context.close()
    return files


def contact_sheets(files, width, theme):
    # Wide captures retain the whole viewport; these copies show their center for inspection.
    cell_width = min(width, 480)
    for start in range(0, len(files), 8):
        group = files[start:start+8]
        canvas = Image.new("RGB", (cell_width*4, 900*2), "#ffffff")
        draw = ImageDraw.Draw(canvas)
        for i, path in enumerate(group):
            shot = Image.open(path)
            if width > 480:
                shot = shot.crop(((width-480)//2, 0, (width+480)//2, shot.height))
            x, y = i % 4 * cell_width, i // 4 * 900
            draw.text((x+8,y+8), path.stem, fill="#1f1f23")
            canvas.paste(shot, (x,y+32))
        canvas.save(OUT / f"contact-{width}-{theme}-{start//8+1:02d}.png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    expected = len(STATES)*4
    if args.dry_run:
        print(f"{len(STATES)} states × 2 sizes × 2 themes = {expected} screenshots, with local synthetic responses only.")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1",0), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    files = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            for width,height in [(390,844),(2000,860)]:
                for theme in ["off","on"]:
                    group = capture_group(browser, f"http://127.0.0.1:{server.server_port}", width, height, theme)
                    contact_sheets(group,width,theme)
                    files += group
                    print(f"{width}×{height}, {theme}: {len(group)} screenshots; no JavaScript errors or document overflow", flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    assert len(files) == expected and all(f.is_file() and f.stat().st_size for f in files)
    (OUT / "manifest.json").write_text(json.dumps({"count":len(files),"states":[name for name,_,_ in STATES],"files":[f.name for f in files]},indent=2)+"\n")
    print(f"Saved and checked {len(files)} screenshots in {OUT}")


if __name__ == "__main__":
    main()
