"""Browser check of the Crying button.

Each case starts its own real local gateway (the server code of runtime/server with an empty SQLite file and two invented adults,
Sam and Alex) and drives the real pages in Chromium with a fake microphone. The gateway serves the pages too. Only the state
replies of Baby Buddy (/api/state, growth, development, AI status) are faked, so the log rows are exact. Replies of the cry routes
are held, lost, refused or delayed with Playwright routes, and the saved rows are read from the SQLite file.

Time: the page clock (Playwright clock) and the gateway clock both start at 2026-11-20 3 PM Mexico City and run at real speed, so
a recording takes real seconds and the tap time passes the server rule. Long waits (the retries of 2, 5 and 15 s and the late
microphone answer at 16 s) use clock.fast_forward, which fires the same timers.

One PASS or FAIL line prints for each case of the plan. The sound is synthetic and the names are invented.
Needs Node (the gateway) and Chromium, with local ports.  Run: python3 check_cry.py
"""
import contextlib
import json
import queue
import re
import shutil
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

from check_ui import NIGHT_PROBE

ROOT = Path(__file__).resolve().parent
SERVER = ROOT.parent / "server"
MX = ZoneInfo("America/Mexico_City")
TODAY = "2026-11-20"
START = datetime(2026, 11, 20, 15, 0, tzinfo=MX)
OFFSET_MS = int(START.timestamp() * 1000 - time.time() * 1000)
COOKIE = {"Sam": "S" * 43, "Alex": "A" * 43}
PASS = FAIL = 0
WORK = Path(tempfile.mkdtemp(prefix="check-cry-"))

GATEWAY = f"""
import {{ createApp }} from '{SERVER}/app.ts';
import {{ createCries }} from '{SERVER}/cries.ts';
import {{ createHousehold }} from '{SERVER}/household.ts';
import {{ createRecords }} from '{SERVER}/records.ts';
import {{ createRouter }} from '{SERVER}/router.ts';
import {{ openStore }} from '{SERVER}/store.ts';
import {{ setZone }} from '{SERVER}/zone.ts';
const [port, db, web, offset] = process.argv.slice(2);
setZone('America/Mexico_City');
const MODELS = ['child','feeding','pumping','diaperchange','sleep','medication','note','temperature','weight','height','headcircumference','tummytime','timer'];
const ALL = MODELS.flatMap(m => ['view','add','change','delete'].map(a => `core.${{a}}_${{m}}`));
const ADULTS = {{ Sam: {{ sid: 'S'.repeat(43), user: 17 }}, Alex: {{ sid: 'A'.repeat(43), user: 18 }} }};
const now = () => Date.now() + Number(offset);
const store = openStore(db);
for (const [name, p] of Object.entries(ADULTS)) {{
  store.createSession({{ sessionId: p.sid, csrfToken: 'csrf', adult: name, babyBuddyUserId: p.user, expiresAt: Date.now() + 36_000_000 }});
  store.putSetting(`user:${{p.user}}`, 'permissions', ALL);
}}
store.putSetting('app', 'child', {{ id: 7, slug: 'test-child', dueDate: null }});
const child = {{ id: 7, first_name: 'Luna', last_name: '', birth_date: '2026-09-18', slug: 'test-child' }};
const records = createRecords({{ store, now: () => new Date(now()), sessions: {{ request: async (_id, input) => input.resource === 'children' ? child : [] }} }});
const find = id => Object.entries(ADULTS).find(([, p]) => p.sid === id);
const sessions = {{ passcodeSet: () => true, renew: () => {{}}, csrfFor: () => 'csrf', people: () => ['Sam', 'Alex'], labels: () => ({{}}), issueLoginCsrf: () => 'login',
  get: id => {{ const f = find(id); return f ? {{ sessionId: f[1].sid, csrfToken: 'csrf', adult: f[0] }} : null; }},
  requireCsrf: (_id, token) => {{ if (token !== 'csrf') throw new Error('csrf'); }} }};
const household = createHousehold({{ store, sessions, records }});
const router = createRouter({{ store, records, household, cries: createCries({{ store, now }}), timers: {{ active: async () => ({{}}) }} }});
const server = createApp({{ sessions, origin: `http://127.0.0.1:${{port}}`, webDir: web, domain: router.handle, integration: async () => {{}}, now }});
server.listen(Number(port), '127.0.0.1', () => console.log('READY'));
"""

# Runs before the page scripts: counts getUserMedia calls, keeps each track, and can refuse or delay the microphone.
INIT = """(() => {
  const g = window.__gum = {calls: 0, tracks: [], delay: 0, deny: false, constraints: null};
  const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
  md.getUserMedia = async constraints => {
    g.calls++; g.constraints = constraints;
    if (g.deny) throw new DOMException('Permission denied', 'NotAllowedError');
    if (g.delay) await new Promise(resolve => setTimeout(resolve, g.delay));
    const stream = await orig(constraints);
    for (const track of stream.getTracks()) g.tracks.push(track);
    return stream;
  };
  try { localStorage.setItem('little-days-theme', '__THEME__'); } catch (e) { /* no storage */ }
})();"""


def fake_now():
    return datetime.fromtimestamp((time.time() * 1000 + OFFSET_MS) / 1000, MX)


def iso(at):
    return at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{at.microsecond // 1000:03d}Z"


def tone(seconds=4, rate=8000):
    """A synthetic WAV in the one form the app writes: 44 byte header, 16 bit, one channel."""
    count = int(seconds * rate)
    data = b"".join(struct.pack("<h", int(6000 * __import__("math").sin(i / 20))) for i in range(count))
    head = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(data))
    return head + data


# ---------------------------------------------------------------------------------------------------------------- records

def week():
    """Invented care records on the axis of the app: minute 0 is today at midnight, a day is 1440 minutes.
    Days -6 to -2 are full (diaper every 2 h, so her usual is 2 h; feed every 3 h; naps 150 min apart). Yesterday and today are
    thin: the memory of the first load holds under 5 gaps of each kind, so the usual shows only after the ranged reply."""
    out = []

    def add(day, minute, **entry):
        out.append({"id": f"r{len(out)}", "by": "Sam", "t": day * 1440 + minute, **entry})

    plans = {d: ([460 + 120 * k for k in range(6)], [440, 620, 800, 980, 1160], [510, 720, 930]) for d in range(-6, -1)}
    plans[-1] = ([580, 820, 1060], [500, 860, 1220], [600])
    plans[0] = ([460, 700], [440, 800], [510, 720])
    for day, (diapers, feeds, naps) in plans.items():
        for m in diapers:
            add(day, m, type="diaper", kind="W")
        for m in feeds:
            add(day, m, type="bottle", ml=90, milk="formula")
        for m in naps:
            add(day, m, type="sleep", dur=60, nap=True)
    return out


def state_json(adult, lang, entries, lo, hi):
    mine = 1 if adult == "Sam" else 2
    resources = {n: {"view": True, "add": True, "change": True, "delete": True} for n in ["feedings", "changes", "sleep", "pumping", "weight", "height", "head-circumference", "children", "timers", "notes"]}
    return {"me": {"id": f"adult:{mine}", "name": adult}, "people": [{"id": "adult:1", "name": "Sam", "onDuty": True}, {"id": "adult:2", "name": "Alex"}],
            "child": {"id": "child:1", "name": "Luna", "birthDate": "2026-09-18"}, "run": None, "sleepRun": None, "today": TODAY,
            "permissions": {"canStopOtherAdultsTimers": True, "resources": resources}, "entries": [e for e in entries if lo <= e["t"] // 1440 < hi],
            "preferences": {"units": "metric", "language": lang, "palette": "Sorbet", "night": False}}


# ---------------------------------------------------------------------------------------------------------------- gateway

class Gateway:
    """One real gateway on a free port with its own SQLite file."""

    def __init__(self):
        self.dir = Path(tempfile.mkdtemp(dir=WORK))
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        self.port = sock.getsockname()[1]
        sock.close()
        self.db = self.dir / "gateway.sqlite"
        self.proc = subprocess.Popen(["node", str(WORK / "gateway.mjs"), str(self.port), str(self.db), str(ROOT), str(OFFSET_MS)],
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        # Node can print warnings (node:sqlite) before READY. A thread reads every line, so the pipe never fills.
        lines = queue.Queue()
        threading.Thread(target=lambda: [lines.put(x) for x in self.proc.stdout], daemon=True).start()
        seen, end = [], time.time() + 15
        while not any("READY" in x for x in seen):
            try:
                seen.append(lines.get(timeout=max(0.1, end - time.time())))
            except queue.Empty:
                raise RuntimeError(f"the gateway did not start in 15 s: {''.join(seen)[-300:].strip()}") from None
        self.base = f"http://127.0.0.1:{self.port}"

    def call(self, method, path, adult="Sam", body=None, raw=None, headers=None):
        """One signed-in request from outside the page. Returns (status, json or None)."""
        head = {"origin": self.base, "x-csrf-token": "csrf", "cookie": f"__Host-little-days={COOKIE[adult]}", **(headers or {})}
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            head["content-type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=head)
        try:
            with urllib.request.urlopen(request, timeout=10) as reply:
                text = reply.read()
                status = reply.status
        except urllib.error.HTTPError as err:
            text, status = err.read(), err.code
        try:
            return status, json.loads(text)
        except ValueError:
            return status, None

    def sql(self, query, args=()):
        con = sqlite3.connect(self.db, timeout=5)
        con.row_factory = sqlite3.Row
        try:
            rows = [dict(r) for r in con.execute(query, args).fetchall()]
            con.commit()
            return rows
        finally:
            con.close()

    def cries(self):
        return self.sql("SELECT id, adult, sound_on, clip_state, length(clip) AS clip_bytes, clip_json, snapshot_json, stopped_by, skipped, noisy FROM cries ORDER BY occurred_at")

    def marks(self):
        """The fields of the method fixes (plan 2026-11-20), and the clip end cause. Fields only, never the clip bytes."""
        rows = self.sql("SELECT distress, row_tap, row_tap_ms, no_clip, clip_state, clip_json FROM cries ORDER BY occurred_at")
        for r in rows:
            meta = json.loads(r.pop("clip_json")) if r["clip_json"] else {}
            r.update(end=meta.get("end"), peak=meta.get("peak"), clipped=meta.get("clipped"))
        return rows

    def sound(self, adult, value):
        return self.call("PUT", "/api/cries/sound", adult, {"sound": value})

    def seed(self, minutes_ago, adult="Sam", stopped_by=None, clip=False, noisy=0):
        """A cry of any age (the create route refuses a tap older than 15 minutes, so a seed goes straight into the table)."""
        cid = str(uuid.uuid4())
        wav = tone(4) if clip else None
        meta = json.dumps({"bytes": len(wav), "durationMs": 10000, "startMs": 300, "sampleRate": 8000, "capture": {}}) if clip else None
        self.sql("INSERT INTO cries (id, adult, occurred_at, sound_on, snapshot_json, stopped_by, clip_state, clip, clip_json, noisy) VALUES (?,?,?,?,?,?,?,?,?,?)",
                 (cid, adult, iso(fake_now() - timedelta(minutes=minutes_ago)), 1 if clip else 0, json.dumps({"complete": False}), stopped_by, "kept" if clip else "none", wav, meta, noisy))
        return cid

    def close(self):
        self.proc.terminate()
        with contextlib.suppress(Exception):
            self.proc.wait(timeout=5)


# ---------------------------------------------------------------------------------------------------------------- network control

def classify(method, path, query):
    q = parse_qs(query)
    if path == "/api/state":
        old = "from" in q and q["from"][0] < "2026-11-19"
        return "old" if old else "state"
    if path == "/api/care-passages":
        return "passages"
    if not path.startswith("/api/cries"):
        return "other"
    if path == "/api/cries":
        return {"POST": "create"}.get(method, "home" if q.get("home") == ["1"] else "list")
    tail = path[len("/api/cries/"):]
    if tail == "sound":
        return "sound"
    if tail == "clips":
        return "delclips"
    if tail.endswith("/clip"):
        return {"PUT": "clip", "GET": "clipget", "DELETE": "delclip"}.get(method, "other")
    return {"PATCH": "patch", "DELETE": "delcry"}.get(method, "other")


class Net:
    """Routes for one page. Actions per kind of request: pass, abort (the server never sees it), lost (the server saves, the reply is
    lost), delay (held before it is sent, until release), hold (sent now, reply held until release) and ('status', n) (a made-up reply)."""

    def __init__(self, gateway, adult, lang):
        self.gw, self.adult, self.lang = gateway, adult, lang
        self.entries = week()
        self.queue, self.always, self.held, self.log = {}, {}, {}, []

    def next(self, kind, action, times=1):
        self.queue.setdefault(kind, deque()).extend([action] * times)

    def count(self, kind):
        return sum(1 for r in self.log if r["kind"] == kind)

    def release(self, kind):
        for thunk in self.held.pop(kind, []):
            with contextlib.suppress(Exception):
                thunk()

    def kinds(self):
        return [r["kind"] for r in self.log]

    def _action(self, kind):
        queued = self.queue.get(kind)
        if queued:
            return queued.popleft()
        return self.always.get(kind, "pass")

    def _local(self, kind, query, path):
        q = parse_qs(query)
        if kind in ("state", "old"):
            lo, hi = ((datetime.fromisoformat(q[k][0]).date() - datetime.fromisoformat(TODAY).date()).days for k in ("from", "to")) if "from" in q else (-1, 1)
            return state_json(self.adult, self.lang, self.entries, lo, hi)
        if path.endswith("/growth"):
            return {"entries": [], "unavailable": []}
        if path.endswith("/development"):
            return {"date": TODAY, "status": "ready", "cards": []}
        return {"available": False}

    def handle(self, route):
        req = route.request
        url = urlparse(req.url)
        if url.path.startswith("/api/session"):
            return route.continue_()
        kind = classify(req.method, url.path, url.query)
        action = self._action(kind)
        entry = {"kind": kind, "method": req.method, "path": url.path, "t": time.time(), "action": action, "status": None, "bytes": len(req.post_data_buffer or b"") if req.method == "PUT" else None}
        if kind == "create":
            entry["body"] = req.post_data_json
        self.log.append(entry)
        local = kind in ("state", "old", "other")
        body = self._local(kind, url.query, url.path) if local else None
        if action == "abort":
            return route.abort("failed")
        if isinstance(action, tuple):
            entry["status"] = action[1]
            return route.fulfill(status=action[1], json={"error": "made up by the check"})
        if action == "cut":  # the server saves; the page gets a 200 whose JSON is cut off
            reply = route.fetch()
            entry["status"] = reply.status
            return route.fulfill(status=200, headers={"content-type": "application/json"}, body='{"id":')
        send = (lambda: route.fulfill(json=body)) if local else (lambda: self._forward(route, entry, action))
        if action == "delay":
            self.held.setdefault(kind, []).append(send)
            return None
        if action == "delay-abort":  # held before it is sent; the release fails it as a network error
            self.held.setdefault(kind, []).append(lambda: route.abort("failed"))
            return None
        return send()

    def _forward(self, route, entry, action):
        reply = route.fetch()
        entry["status"] = reply.status
        if action == "lost":
            return route.abort("failed")
        if action == "hold":
            self.held.setdefault(entry["kind"], []).append(lambda: route.fulfill(response=reply))
            return None
        return route.fulfill(response=reply)


# ---------------------------------------------------------------------------------------------------------------- pages and cases

class Page:
    def __init__(self, case, adult, lang, width, height, theme):
        self.case, self.adult = case, adult
        self.ctx = case.env.new_context(viewport={"width": width, "height": height}, timezone_id="America/Mexico_City", locale="es-MX" if lang == "es" else "en-US", permissions=["microphone"])
        self.ctx.add_cookies([{"name": "__Host-little-days", "value": COOKIE[adult], "domain": "127.0.0.1", "path": "/", "secure": True, "httpOnly": True}])
        self.ctx.add_init_script(INIT.replace("__THEME__", theme))
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(8000)
        self.page.clock.install(time=fake_now())
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.net = Net(case.gw, adult, lang)
        self.ctx.route(re.compile(r"/api/"), self.net.handle)
        self.t0 = None

    def go(self, wait_home=True):
        self.page.goto(self.case.gw.base + "/index.html")
        self.page.locator('.tile[data-act="open-feed"]').first.wait_for()
        if wait_home:
            self.until(lambda: self.js("LittleDaysCryUI.state.home.loaded"), 6)

    def js(self, expr):
        return self.page.evaluate(expr)

    def until(self, cond, secs=8.0, step=0.05):
        end = time.time() + secs
        while time.time() < end:
            if cond():
                return True
            self.page.wait_for_timeout(step * 1000)
        return bool(cond())

    def visible(self, selector):
        return self.page.locator(selector).first.is_visible()

    def click(self, selector):
        self.page.locator(selector).first.click()

    def tap(self):
        """The tap on card C. Returns the real time of the tap."""
        self.click('[data-act="cry-open"]')
        self.t0 = time.time()
        return self.t0

    def since(self):
        return time.time() - self.t0

    def wait_until_since(self, secs):
        self.page.wait_for_timeout(max(0, (secs - self.since()) * 1000))

    def strip(self):
        return self.js("document.querySelector('.cry-rec')?.dataset.state || ''")

    def strip_text(self):
        return self.js("document.querySelector('.cry-rec')?.textContent || ''")

    def ui_strip(self):
        return self.js("LittleDaysCryUI.state.tap?.strip ?? null")

    def left(self):
        text = self.js("document.querySelector('.cry-rec .n')?.textContent || ''")
        found = re.search(r"\d+", text)
        return int(found.group()) if found else None

    def mic_calls(self):
        return self.js("window.__gum.calls")

    def tracks(self):
        return self.js("window.__gum.tracks.map(t => t.readyState)")

    def tracks_ended(self):
        states = self.tracks()
        return bool(states) and all(s == "ended" for s in states)

    def ff(self, ms):
        self.page.clock.fast_forward(ms)


class Case:
    def __init__(self, env, name, aliases=()):
        self.env, self.name, self.aliases = env, name, aliases
        self.errors, self.pages, self.gw = [], [], None

    def ok(self, cond, message):
        if not cond:
            self.errors.append(message)

    def open(self, adult="Sam", lang="en", width=390, height=844, theme="off", wait_home=True, before=None):
        page = Page(self, adult, lang, width, height, theme)
        self.pages.append(page)
        if before:
            before(page)
        page.go(wait_home)
        return page

    def report(self):
        global PASS, FAIL
        for name in (self.name, *self.aliases):
            if self.errors:
                FAIL += 1
                print(f"FAIL {name}: " + "; ".join(self.errors))
            else:
                PASS += 1
                print(f"PASS {name}")


@contextlib.contextmanager
def case(env, name, *aliases):
    c = Case(env, name, aliases)
    try:
        c.gw = Gateway()
        yield c
    except Exception as err:  # a case that crashes is a failed case, and the run goes on
        c.errors.append(f"{type(err).__name__}: {str(err)[:300]}")
    finally:
        for page in c.pages:
            c.ok(not page.errors, f"page errors: {page.errors[:2]}")
            for kind in list(page.net.held):
                page.net.release(kind)
            with contextlib.suppress(Exception):  # requests that a release starts end before the close, so no route error reaches the next case
                page.page.wait_for_timeout(400)
            with contextlib.suppress(Exception):
                page.ctx.close()
        if c.gw:
            c.gw.close()
        c.report()


def snap(row):
    return json.loads(row["snapshot_json"]) if row["snapshot_json"] else {}


def watch_strip(p):
    """Before the tap: keep the height of the strip in each state it shows, in window.__strips."""
    p.js("window.__strips = {}; new MutationObserver(() => { const el = document.querySelector('.cry-rec'); if (el) window.__strips[el.dataset.state] = Math.round(el.getBoundingClientRect().height); }).observe(document.body, {childList: true, subtree: true, attributes: true})")


def rate_box(p):
    """The rating card and the rows: the card height, the top of each row, the pressed chip and the closed state."""
    # Positions are from the top of the screen content, so a scroll does not count as a move.
    return p.js("""(() => { const card = document.querySelector('.cry-rate'); if (!card) return null;
      const top0 = document.querySelector('.formscreen[data-kind="cry"] .wrap').getBoundingClientRect().top, y = el => Math.round(el.getBoundingClientRect().top - top0);
      return {
      h: Math.round(card.getBoundingClientRect().height), rows: [...document.querySelectorAll('.cry-row')].map(y),
      more: y(document.querySelector('.cry-more')),
      pressed: [...card.querySelectorAll('[data-act="cry-rate"]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.arg),
      disabled: [...card.querySelectorAll('[data-act="cry-rate"]')].every(b => b.disabled), shut: card.classList.contains('shut'), text: card.textContent,
      fits: [...card.querySelectorAll('[data-act="cry-rate"]')].every(b => b.scrollWidth <= b.clientWidth),
      below: card.getBoundingClientRect().top >= document.querySelector('.cry-compare').getBoundingClientRect().bottom }; })()""")


def clip_ms(row):
    return json.loads(row["clip_json"])["durationMs"] if row["clip_json"] else None


# ---------------------------------------------------------------------------------------------------------------- the cases

def case_tap_and_clip(env):
    with case(env, "tap opens the screen and sends the cry; a clip goes up after the recording") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        c.ok(p.until(lambda: p.js("LittleDaysCryLog.isComplete(new Set(homeReads), todayISO())"), 8), "the 7-day history never arrived")
        watch_strip(p)
        p.tap()
        c.ok(p.visible('.formscreen[data-kind="cry"]'), "the screen did not open at once")
        c.ok(p.until(lambda: p.strip() == "rec", 5), "the strip never read Recording")
        c.ok("Hold the phone about 30 cm from her." in p.strip_text(), f"M7 no hold line while it records: {p.strip_text()!r}")
        c.ok(p.until(lambda: p.strip() == "saved", 16), f"the strip never read Clip saved (it reads {p.strip()})")
        heights = p.js("window.__strips")
        c.ok({"start", "rec", "saved"} <= set(heights) and len(set(heights.values())) == 1, f"M7 the strip height changes with its state: {heights}")
        mark = c.gw.marks()
        c.ok(mark and mark[0]["end"] == "full" and 0 < (mark[0]["peak"] or 0) <= 1 and mark[0]["clipped"] is not None, f"M5 M6 end, peak and clipped of a full clip: {mark}")
        rows = c.gw.cries()
        c.ok(len(rows) == 1 and rows[0]["clip_state"] == "kept" and rows[0]["sound_on"] == 1, f"saved rows: {rows}")
        c.ok(rows and 9000 <= (clip_ms(rows[0]) or 0) <= 11000, f"clip length {rows and clip_ms(rows[0])} ms")
        meta = json.loads(rows[0]["clip_json"]) if rows else {}
        c.ok(meta.get("capture", {}).get("echoCancellation") is False, f"capture settings were not sent: {meta.get('capture')}")
        c.ok(p.mic_calls() == 1 and p.tracks_ended(), f"microphone calls {p.mic_calls()}, tracks {p.tracks()}")
        c.ok(snap(rows[0]).get("complete") is True and snap(rows[0]).get("rank") == ["diaper", "sleep", "feed"], f"snapshot of a full memory: {snap(rows[0])}")
        c.ok(snap(rows[0]).get("order") == "home" and order_now(p) == ["feed", "sleep", "diaper"], f"M1 the rows read {order_now(p)}, order {snap(rows[0]).get('order')}")
        c.ok(p.js("window.__gum.constraints.audio.echoCancellation === false && window.__gum.constraints.audio.channelCount === 1"), "the microphone request did not ask for the raw sound")
        order = [k for k in p.net.kinds() if k in ("create", "clip")]
        c.ok(order == ["create", "clip"] and p.net.log[[r["kind"] for r in p.net.log].index("create")]["body"]["sound"] is True, f"requests {order}")
        c.ok(p.until(lambda: p.js("LittleDaysCryUI.state.live.length") == 0, 2), f"R2 the finished recorder and queue stayed in memory: {p.js('LittleDaysCryUI.state.live.length')}")


def case_row_during_slow_create(env):
    with case(env, "row tap 5 s after the tap, create takes 3 s: the form opens at once, the cry is saved with no clip") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("create", "delay"))
        p.tap()
        p.wait_until_since(3.0)
        p.net.release("create")
        p.wait_until_since(5.0)
        p.click('.cry-row[data-arg="diaper"]')
        c.ok(p.until(lambda: p.visible("[data-sheet]"), 0.6), "the diaper form did not open at once")
        p.page.wait_for_timeout(2500)
        rows = c.gw.cries()
        c.ok(len(rows) == 1 and rows[0]["clip_state"] == "none", f"rows {rows}")
        c.ok(p.net.count("clip") == 0, "a clip was sent although the recording was under 3 s")
        c.ok(p.mic_calls() == 1 and p.tracks_ended(), f"microphone {p.mic_calls()} {p.tracks()}")
        mark = c.gw.marks()
        c.ok(mark and mark[0]["row_tap"] == "diaper" and 4500 <= (mark[0]["row_tap_ms"] or 0) <= 7000, f"M5 the row tap of a slow create: {mark}")
        c.ok(p.until(lambda: c.gw.marks()[0]["no_clip"] in ("too-short", "stopped"), 2), f"M5 a recording under 3 s stored no reason: {c.gw.marks()}")


def case_row_after_recording(env):
    with case(env, "row tap after 4 s of recording: the form opens at once, the cry and a clip of about 4 s are saved") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        p.tap()
        c.ok(p.until(lambda: p.strip() == "rec", 5), "no recording started")
        c.ok(p.until(lambda: (p.left() or 10) <= 6, 6), "the countdown did not pass 4 s")
        p.click('.cry-row[data-arg="sleep"]')
        c.ok(p.until(lambda: p.visible("[data-sheet]"), 0.6), "the sleep form did not open at once")
        c.ok(p.until(lambda: any(r["clip_state"] == "kept" for r in c.gw.cries()), 6), f"no clip was saved: {c.gw.cries()}")
        rows = c.gw.cries()
        c.ok(len(rows) == 1 and 3500 <= (clip_ms(rows[0]) or 0) <= 5600, f"clip length {rows and clip_ms(rows[0])} ms")
        c.ok(p.tracks_ended(), f"tracks {p.tracks()}")
        mark = c.gw.marks()
        c.ok(mark and mark[0]["end"] == "row", f"M5 the clip of a row tap does not end with row: {mark}")
        c.ok(p.until(lambda: c.gw.marks()[0]["row_tap"] == "sleep", 3), f"M5 the row tap was not stored: {c.gw.marks()}")
        c.ok(4000 <= (c.gw.marks()[0]["row_tap_ms"] or 0) <= 9000, f"M5 the row tap time is {c.gw.marks()[0]['row_tap_ms']} ms after a tap about 4 s into the recording")
        # A second row tap changes nothing: the form closes, the Crying screen comes back, and Feed is tapped.
        p.page.keyboard.press("Escape")
        if p.until(lambda: p.visible('.cry-row[data-arg="feed"]'), 2):
            p.click('.cry-row[data-arg="feed"]')
            p.page.wait_for_timeout(800)
        c.ok(c.gw.marks()[0]["row_tap"] == "sleep", f"M5 a second row tap changed the first: {c.gw.marks()}")


def case_new_adult_before_home(env):
    with case(env, "a new adult taps before the Home reply: the screen opens at once, the sheet shows when the reply arrives") as c:
        p = c.open("Alex", wait_home=False, before=lambda q: q.net.next("home", "delay"))
        p.tap()
        c.ok(p.visible('.formscreen[data-kind="cry"]'), "the screen did not open at once")
        c.ok(not p.visible('[data-cry-sheet="first"]'), "the sheet showed before the Home reply")
        c.ok(p.net.count("create") == 0 and p.mic_calls() == 0, "a request or the microphone started before the sheet")
        p.net.release("home")
        c.ok(p.until(lambda: p.visible('[data-cry-sheet="first"]'), 3), "the sheet did not show after the Home reply")
        c.ok(p.until(lambda: p.js("!!document.activeElement.closest('[data-cry-sheet]')"), 1), "R2 the first-use sheet did not take the focus")
        c.ok(p.net.count("create") == 0, "the cry was sent before the answer of the sheet")


def case_first_use_record(env):
    with case(env, 'first use: "Record 10 seconds" saves the choice, then the cry, then a clip') as c:
        p = c.open("Alex")
        p.tap()
        c.ok(p.until(lambda: p.visible('[data-cry-sheet="first"]'), 3), "no sheet")
        c.ok(p.until(lambda: p.js("!!document.activeElement.closest('[data-cry-sheet]')"), 1), "R2 the first-use sheet did not take the focus")
        c.ok(p.net.count("sound") == 0 and p.net.count("create") == 0 and p.mic_calls() == 0, "something started before the answer")
        p.click('[data-act="cry-first-record"]')
        c.ok(p.until(lambda: p.strip() == "saved", 20), f"no clip saved (strip {p.strip()})")
        order = [k for k in p.net.kinds() if k in ("sound", "create", "clip")]
        c.ok(order == ["sound", "create", "clip"], f"request order {order}")
        c.ok(c.gw.call("GET", "/api/cries?home=1", "Alex")[1].get("sound") == "on", "the choice was not saved as on")
        c.ok(len(c.gw.cries()) == 1 and c.gw.cries()[0]["clip_state"] == "kept" and p.mic_calls() == 1, f"rows {c.gw.cries()}")


def case_first_use_not_now(env):
    # Family report of 2026-11-20: "Not now" saved the choice `off`, so the app never asked again and no cry got a clip.
    with case(env, 'first use: "Not now" saves the cry and no sound choice, the microphone gets 0 calls, and the next tap asks again',
              '"Not now" on the first-use sheet asks for no microphone and saves the cry') as c:
        p = c.open("Alex")
        p.tap()
        c.ok(p.until(lambda: p.visible('[data-cry-sheet="first"]'), 3), "no sheet")
        p.click('[data-act="cry-first-later"]')
        c.ok(p.until(lambda: len(c.gw.cries()) == 1, 4), "the cry was not saved")
        p.page.wait_for_timeout(800)
        rows = c.gw.cries()
        c.ok(p.mic_calls() == 0, f"microphone calls {p.mic_calls()}")
        c.ok(rows and rows[0]["sound_on"] == 0 and rows[0]["clip_state"] == "none", f"rows {rows}")
        c.ok(p.strip() == "off" and p.visible('.cry-rec [data-act="cry-sound"]') and p.net.count("clip") == 0, f'strip "{p.strip()}", not the Off line with Turn on; clip requests {p.net.count("clip")}')
        c.ok(p.net.count("sound") == 0, f'"Not now" sent {p.net.count("sound")} save of the sound choice')
        c.ok(c.gw.call("GET", "/api/cries?home=1", "Alex")[1].get("sound") is None, '"Not now" saved a sound choice')
        # The next tap asks again, and "Record 10 seconds" then records that cry.
        p.click('[data-act="cry-close"]')
        p.tap()
        asked = p.until(lambda: p.visible('[data-cry-sheet="first"]'), 3)
        c.ok(asked, "the next tap did not ask again")
        if not asked:
            return
        c.ok(len(c.gw.cries()) == 1, "the second cry was sent before the answer of the sheet")
        p.click('[data-act="cry-first-record"]')
        c.ok(p.until(lambda: p.strip() == "saved", 20), f"no clip after the second question (strip {p.strip()})")
        rows = c.gw.cries()
        c.ok(sorted(r["clip_state"] for r in rows) == ["kept", "none"] and p.mic_calls() == 1, f"rows {rows}")
        c.ok(c.gw.call("GET", "/api/cries?home=1", "Alex")[1].get("sound") == "on", "the choice was not saved as on")


def case_settings_on_after_off(env):
    # The switch in Settings is one of the two ways back from a saved Off, so it must lead to a clip.
    with case(env, "a saved Off asks nothing and records nothing; On in Settings makes the next tap record") as c:
        c.gw.sound("Sam", "off")
        p = c.open()
        p.tap()
        c.ok(p.until(lambda: len(c.gw.cries()) == 1, 4), "the cry was not saved")
        c.ok(not p.visible('[data-cry-sheet="first"]') and p.mic_calls() == 0, "a saved Off asked the question or opened the microphone")
        p.click('[data-act="cry-close"]')
        open_settings(p)
        p.click('[data-act="cry-sound"][data-arg="on"]')
        c.ok(p.until(lambda: c.gw.call("GET", "/api/cries?home=1", "Sam")[1].get("sound") == "on", 3), "On was not saved")
        p.page.keyboard.press("Escape")
        p.tap()
        c.ok(p.until(lambda: p.strip() == "saved", 20), f"no clip after On in Settings (strip {p.strip()})")
        rows = c.gw.cries()
        c.ok(sorted(r["clip_state"] for r in rows) == ["kept", "none"] and p.mic_calls() == 1, f"rows {rows}")


def case_off_line_turn_on(env):
    # Family report of 2026-11-20, with a picture of the screen: with the sound Off the Crying screen had no line about the recording
    # and no way to switch it on.
    with case(env, 'a cry with no sound shows "Recording is off" with Turn on; a failed save keeps the line; a save shows "Recording is on" with no new cry, and the next tap records') as c:
        c.gw.sound("Sam", "off")
        p = c.open(before=lambda q: q.net.next("sound", "abort"))
        p.tap()
        c.ok(p.until(lambda: p.strip() == "off" and "Saved with no sound" in p.strip_text(), 4), f'strip "{p.strip()}": {p.strip_text()}')
        c.ok("Recording is off" in p.strip_text() and p.mic_calls() == 0, f"line {p.strip_text()}, microphone calls {p.mic_calls()}")
        turn_on = '.cry-rec [data-act="cry-sound"][data-arg="on"]'
        p.click(turn_on)
        c.ok(p.until(lambda: p.net.count("sound") == 1 and p.js("LittleDaysCryUI.state.home.saving") is False, 3), "the failed save did not end")
        held = p.js("LittleDaysCryUI.state.home.sound")
        c.ok(held == "off" and p.strip() == "off" and p.visible(turn_on), f'after a failed save the strip reads "{p.strip()}" and the page holds {held}')
        c.ok(c.gw.call("GET", "/api/cries?home=1", "Sam")[1].get("sound") == "off", "the failed save changed the choice")
        p.click(turn_on)
        c.ok(p.until(lambda: c.gw.call("GET", "/api/cries?home=1", "Sam")[1].get("sound") == "on", 3), "On was not saved")
        c.ok(p.until(lambda: p.strip() == "next", 3) and "Recording is on" in p.strip_text(), f'strip "{p.strip()}": {p.strip_text()}')
        c.ok(not p.visible(turn_on), "Turn on still shows with the sound on")
        p.page.wait_for_timeout(600)
        c.ok(len(c.gw.cries()) == 1 and p.mic_calls() == 0 and p.net.count("clip") == 0, f"rows {len(c.gw.cries())}, microphone calls {p.mic_calls()}")
        p.click('[data-act="cry-close"]')
        p.tap()
        c.ok(p.until(lambda: p.strip() == "saved", 20), f"no clip after Turn on (strip {p.strip()})")
        rows = c.gw.cries()
        c.ok(sorted(r["clip_state"] for r in rows) == ["kept", "none"] and p.mic_calls() == 1, f"rows {rows}")


def case_turn_on_during_home_poll(env):
    # Review round 2: each cry with no sound asks for the Home reply. A reply that was asked for before "Turn on" holds the old choice.
    with case(env, 'a Home reply that was asked for before "Turn on" does not put the line back to "Recording is off"') as c:
        c.gw.sound("Sam", "off")
        p = c.open()
        p.net.next("home", "hold")
        p.tap()
        c.ok(p.until(lambda: "home" in p.net.held and p.strip() == "off", 4), f'no held Home request, or the strip reads "{p.strip()}"')
        p.click('.cry-rec [data-act="cry-sound"][data-arg="on"]')
        c.ok(p.until(lambda: p.strip() == "next" and c.gw.call("GET", "/api/cries?home=1", "Sam")[1].get("sound") == "on", 3), f'On was not saved (strip "{p.strip()}")')
        p.net.release("home")
        p.page.wait_for_timeout(500)
        held = p.js("LittleDaysCryUI.state.home.sound")
        c.ok(p.strip() == "next" and held == "on", f'the old Home reply put the strip back to "{p.strip()}" (the page holds {held})')


def case_late_create_reply(env):
    with case(env, "a create reply 6 s after the tap: the microphone gets 0 calls and the cry is saved") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("create", "delay"))
        p.tap()
        p.wait_until_since(6.0)
        p.net.release("create")
        c.ok(p.until(lambda: p.strip() == "lost", 4), f"the strip reads {p.strip()}, not No clip saved")
        rows = c.gw.cries()
        c.ok(p.mic_calls() == 0, f"microphone calls {p.mic_calls()}")
        c.ok(len(rows) == 1 and rows[0]["clip_state"] == "none", f"rows {rows}")


def case_late_microphone(env):
    with case(env, "fast create reply, microphone answer 16 s after the tap: the stream is stopped, no clip, the strip reads No clip saved") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        p.js("window.__gum.delay = 16000")
        p.tap()
        c.ok(p.until(lambda: p.mic_calls() == 1 and p.net.count("create") == 1, 4), "the microphone was not asked for")
        c.ok(p.strip() == "start", f"strip {p.strip()}")
        p.ff(16100)
        c.ok(p.until(lambda: p.strip() == "lost", 5), f"strip {p.strip()}")
        c.ok(p.until(p.tracks_ended, 3), f"the late stream was not stopped: {p.tracks()}")
        c.ok(p.net.count("clip") == 0 and c.gw.cries()[0]["clip_state"] == "none", "a clip was sent")


def case_lost_create_then_sound_off(env):
    with case(env, "create reply lost, sound switched off on the server, then the retry: microphone 0 calls, one cry in Past cries") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("create", "lost"))
        p.tap()
        c.ok(p.until(lambda: p.net.count("create") == 1 and len(c.gw.cries()) == 1, 4), "the first create did not reach the server")
        c.gw.sound("Sam", "off")
        p.ff(2100)
        c.ok(p.until(lambda: p.net.count("create") == 2, 4), "no retry")
        p.page.wait_for_timeout(600)
        ids = {r["body"]["id"] for r in p.net.log if r["kind"] == "create"}
        c.ok(len(ids) == 1 and len(c.gw.cries()) == 1, f"ids {ids}, rows {len(c.gw.cries())}")
        c.ok(p.mic_calls() == 0, f"microphone calls {p.mic_calls()}")
        p.click('[data-act="cry-past"]')
        c.ok(p.until(lambda: p.page.locator("details[data-cry-id]").count() == 1, 4), f"Past cries shows {p.page.locator('details[data-cry-id]').count()} cries")


def case_answer_without_reply(env):
    with case(env, "an answer save that gets no reply: the page loads the saved answer again and shows it; no request is repeated") as c:
        saved = c.gw.seed(14, stopped_by=None)
        p = c.open(before=lambda q: q.net.next("patch", "lost"))
        c.ok(p.until(lambda: p.visible(".cry-ask"), 4), "no Home card")
        homes = p.net.count("home")
        p.click('[data-act="cry-ask-answer"][data-arg="feed"]')
        c.ok(p.until(lambda: p.net.count("home") > homes, 5), "the page did not load the state again")
        p.ff(20000)
        p.page.wait_for_timeout(500)
        c.ok(p.net.count("patch") == 1, f"the answer was sent {p.net.count('patch')} times")
        c.ok(not p.visible(".cry-ask"), "the card still shows after the saved answer")
        c.ok([r["stopped_by"] for r in c.gw.cries()] == ["feed"], f"rows {c.gw.cries()}")
        second = c.gw.seed(40, stopped_by=None)
        p.page.reload()
        p.page.locator(".cry-ask").first.wait_for()
        p.net.next("patch", "abort")
        before = p.net.count("home")
        p.click('[data-act="cry-ask-answer"][data-arg="sleep"]')
        c.ok(p.until(lambda: p.net.count("home") > before, 5) and p.until(lambda: p.visible(".cry-ask"), 3), "an answer that never reached the server hid the question")
        c.ok(p.net.count("patch") == 2 and [r["stopped_by"] for r in c.gw.cries() if r["id"] == second] == [None], "the refused answer was repeated or saved")
        c.ok(saved != second, "seed")


def case_leaving(env):
    with case(env, "leaving the screen, a hidden page and a change of adult each stop the recording and the microphone track") as c:
        c.gw.sound("Sam", "on")
        for how, trigger in (
            ("leave", lambda p: p.click('[data-act="cry-close"]')),
            ("hidden", lambda p: p.js("Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")),
            ("adult", lambda p: p.js("S.me = {id: 'adult:2', name: 'Alex'}; render()")),
        ):
            p = c.open()
            p.tap()
            c.ok(p.until(lambda: p.strip() == "rec", 5), f"{how}: no recording")
            trigger(p)
            c.ok(p.until(p.tracks_ended, 2), f"{how}: the track stayed open {p.tracks()}")
            c.ok(p.js("LittleDaysCryUI.state.tap ? LittleDaysCryUI.state.tap.rec.done : true"), f"{how}: the recording went on")
            p.page.wait_for_timeout(300)
            c.ok(p.strip() != "rec", f"{how}: the strip still reads Recording")
        late = c.open()
        late.js("window.__gum.delay = 3000")
        late.tap()
        c.ok(late.until(lambda: late.mic_calls() == 1, 3), "late: no microphone request")
        late.click('[data-act="cry-close"]')
        late.ff(3100)
        c.ok(late.until(late.tracks_ended, 4), f"late: the stream that came after the parent left stayed open {late.tracks()}")
        c.ok(late.js("LittleDaysCryUI.state.tap.rec.count") == 0 and late.net.count("clip") == 0, "late: a recording started after the parent left")


def case_refused_microphone(env):
    with case(env, "a refused microphone shows its line and still saves the cry") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        p.js("window.__gum.deny = true")
        p.tap()
        c.ok(p.until(lambda: p.strip() == "micoff", 5), f"strip {p.strip()}")
        text = p.js("document.querySelector('.cry-rec')?.textContent || ''")
        c.ok("Microphone blocked" in text and "Saved with no sound" in text, f"strip text {text!r}")
        c.ok(p.visible('[data-act="cry-retry-mic"]'), "no Try again button")
        rows = c.gw.cries()
        c.ok(len(rows) == 1 and rows[0]["clip_state"] == "none", f"rows {rows}")
        c.ok(p.until(lambda: c.gw.marks()[0]["no_clip"] == "denied", 3), f"M5 a refused microphone stored no reason: {c.gw.marks()}")
        patch = next((r for r in p.net.log if r["kind"] == "patch"), None)
        c.ok(patch is not None, "M5 no request carried the reason")
        # "Try again" with the microphone allowed: the clip is saved and the reason goes.
        p.js("window.__gum.deny = false")
        p.click('[data-act="cry-retry-mic"]')
        c.ok(p.until(lambda: p.strip() == "saved", 18), f"the second try saved no clip (strip {p.strip()})")
        c.ok(p.until(lambda: c.gw.marks()[0]["no_clip"] is None and c.gw.marks()[0]["clip_state"] == "kept", 3), f"M5 a saved clip left the reason: {c.gw.marks()}")


def order_now(p):
    return p.js("[...document.querySelectorAll('.cry-row')].map(r => r.dataset.arg)")


def open_missing(c, tail):
    """A page whose memory holds only today and yesterday: the app's own reads of the older days (3 at start) are refused, then
    the request that the tap makes gets the action `tail`."""
    p = c.open(before=lambda q: q.net.always.update({"old": "abort"}))
    p.until(lambda: p.net.count("old") > 0, 4)
    seen = -1
    while seen != p.net.count("old"):
        seen = p.net.count("old")
        p.page.wait_for_timeout(700)
    p.net.always.clear()
    p.net.next("old", tail)
    p.before = p.net.count("old")
    return p


def case_missing_days_rows(env):
    with case(env, "days missing: one ranged request; rows show at once in the Home order with the loading line; a row tap opens its form") as c:
        c.gw.sound("Sam", "off")
        p = open_missing(c, "delay")
        p.tap()
        c.ok(p.until(lambda: len(order_now(p)) == 3, 2), "the rows did not show at once")
        c.ok(order_now(p) == ["feed", "sleep", "diaper"], f"order {order_now(p)}")
        c.ok("Loading the last 7 days" in p.js("document.querySelector('.cry-key').textContent"), "no loading line")
        c.ok(p.net.count("old") - p.before == 1, f"ranged requests {p.net.count('old') - p.before}")
        p.click('.cry-row[data-arg="diaper"]')
        c.ok(p.until(lambda: p.visible("[data-sheet]"), 0.6), "the diaper form did not open")
        p.net.release("old")
        c.ok(p.until(lambda: len(c.gw.cries()) == 1, 3), "the cry was not saved")
        row = snap(c.gw.cries()[0])
        c.ok(row.get("complete") is False and not row.get("rank"), f"snapshot complete {row.get('complete')} rank {row.get('rank')}")


def case_missing_days_reply(env):
    with case(env, "days missing, reply after 4 s: the rows keep their places and get their captions in place; the snapshot keeps no reply data") as c:
        c.gw.sound("Sam", "off")
        p = open_missing(c, "delay")
        # The order only: the bars that come with the reply make the rows taller (as in the loading state of the mockup).
        p.js("window.__orders = []; new MutationObserver(() => { const o = [...document.querySelectorAll('.cry-row')].map(r => r.dataset.arg).join(); const l = window.__orders; if (o && l.at(-1) !== o) l.push(o); }).observe(document.body, {childList: true, subtree: true})")
        p.tap()
        p.wait_until_since(4.0)
        c.ok(order_now(p) == ["feed", "sleep", "diaper"], f"the rows moved before the reply: {order_now(p)}")
        p.net.release("old")
        compare = "document.querySelector('.cry-compare').textContent"
        c.ok(p.until(lambda: "Loading" not in p.js(compare), 3), "the captions never came")
        p.page.wait_for_timeout(1500)
        c.ok(order_now(p) == ["feed", "sleep", "diaper"], f"M1 final order {order_now(p)}")
        c.ok(len(p.js("window.__orders")) == 1, f"M1 the rows moved {p.js('window.__orders')}")
        text = p.js(compare)
        c.ok(re.search(r"over", text) and "usual 2 h" in text, f"comparison text {text!r}")
        row = snap(c.gw.cries()[0])
        diaper = (row.get("log") or {}).get("diaper") or {}
        c.ok(row.get("complete") is False and not row.get("rank") and diaper.get("usualMin") is None, f"snapshot {row}")


def case_missing_days_failure(env):
    with case(env, "days missing, ranged request fails: the rows stay in the Home order") as c:
        c.gw.sound("Sam", "off")
        p = open_missing(c, "abort")
        p.tap()
        c.ok(p.until(lambda: "Loading" not in p.js("document.querySelector('.cry-key')?.textContent || 'Loading'"), 4), "the loading line stayed")
        p.page.wait_for_timeout(500)
        c.ok(order_now(p) == ["feed", "sleep", "diaper"], f"order {order_now(p)}")
        c.ok(p.net.count("old") - p.before == 1, f"ranged requests {p.net.count('old') - p.before}")
        c.ok(c.gw.cries() and not snap(c.gw.cries()[0]).get("rank"), "a rank was saved")


def case_old_page_sound(env):
    with case(env, "sound off on the server, on in an old page: the microphone gets 0 calls, the line never reads Recording is on, and the page takes the new choice") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        c.ok(p.js("LittleDaysCryUI.state.home.sound") == "on", "the page did not start with on")
        c.gw.sound("Sam", "off")
        p.net.next("home", "hold")  # the Home request that follows the refused sound: until its reply the page holds no choice
        p.tap()
        c.ok(p.until(lambda: "home" in p.net.held and len(c.gw.cries()) == 1, 4), "no cry, or no Home request after it")
        held = p.js("LittleDaysCryUI.state.home.sound")
        c.ok(p.strip() == "off" and held is None, f'before the Home reply the strip reads "{p.strip()}" and the page holds {held}')
        p.net.release("home")
        c.ok(p.until(lambda: p.js("LittleDaysCryUI.state.home.sound") == "off", 5), "the page kept the old choice")
        c.ok(p.mic_calls() == 0 and p.net.count("clip") == 0, f"microphone calls {p.mic_calls()}")
        c.ok(p.strip() == "off" and len(c.gw.cries()) == 1, f'the strip reads "{p.strip()}", not the Off line, or the cry is missing')


def fail_create_then_retry(c, adult, sound):
    c.gw.sound(adult, sound)
    p = c.open(adult, before=lambda q: q.net.always.update({"create": "abort"}))
    p.tap()
    for _ in range(8):
        if p.strip() == "unsaved":
            break
        p.until(lambda: p.net.count("create") > 0, 3)
        p.page.wait_for_timeout(250)
        p.ff(5500)
    c.ok(p.strip() == "unsaved", f"{adult}: strip {p.strip()} after {p.net.count('create')} requests")
    c.ok(p.net.count("create") == 4 and p.mic_calls() == 0, f"{adult}: {p.net.count('create')} requests, microphone {p.mic_calls()}")
    c.ok("Not saved yet" in p.js("document.querySelector('.cry-rec')?.textContent || ''") and p.visible('[data-act="cry-retry-save"]'), f"{adult}: no Not saved yet with Try again")
    c.ok(len(order_now(p)) == 3, f"{adult}: the comparison is gone")
    p.net.always.clear()
    p.click('[data-act="cry-retry-save"]')
    c.ok(p.until(lambda: any(r["adult"] == adult for r in c.gw.cries()), 4), f"{adult}: Try again saved no cry")
    ids = {r["body"]["id"] for r in p.net.log if r["kind"] == "create"}
    mine = [r for r in c.gw.cries() if r["adult"] == adult]
    c.ok(len(ids) == 1 and mine and mine[0]["id"] in ids and mine[0]["clip_state"] == "none", f"{adult}: ids {ids}, rows {mine}")
    c.ok(p.mic_calls() == 0, f"{adult}: Try again opened the microphone")


def case_create_failing(env):
    with case(env, 'each create request failing: the microphone gets 0 calls, the strip reads "Not saved yet"; Try again saves the same id with no clip; also with the sound off') as c:
        fail_create_then_retry(c, "Sam", "on")
        fail_create_then_retry(c, "Alex", "off")


def tap_and_leave_after_clip(c, p):
    """Tap, record about 4 s, leave the screen: the partial clip goes up while the page is on Home."""
    p.tap()
    c.ok(p.until(lambda: p.strip() == "rec", 5), "no recording")
    c.ok(p.until(lambda: (p.left() or 10) <= 6, 6), "the countdown did not pass 4 s")
    p.click('[data-act="cry-close"]')


def case_clip_has_a_clip(env):
    with case(env, 'a reply "has a clip" shows "Clip saved"') as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("clip", "lost"))
        p.tap()
        c.ok(p.until(lambda: p.strip() == "saved" or p.net.count("clip") == 1, 16), "the clip was never sent")
        p.ff(2100)
        c.ok(p.until(lambda: p.strip() == "saved", 4), f"strip {p.strip()}")
        c.ok([r["status"] for r in p.net.log if r["kind"] == "clip"] == [200, 409], f"clip replies {[r['status'] for r in p.net.log if r['kind'] == 'clip']}")
        c.ok("Clip saved" in p.js("document.querySelector('.cry-rec')?.textContent || ''") and c.gw.cries()[0]["clip_state"] == "kept", "the strip did not read Clip saved")


def case_clip_400(env):
    with case(env, "a 400 reply to a clip is not sent again") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("clip", ("status", 400)))
        tap_and_leave_after_clip(c, p)
        c.ok(p.until(lambda: p.net.count("clip") == 1, 6), "no clip request")
        p.ff(20000)
        p.page.wait_for_timeout(500)
        c.ok(p.net.count("clip") == 1 and p.ui_strip() == "lost", f"clip requests {p.net.count('clip')}, strip {p.ui_strip()}")
        c.ok(c.gw.cries()[0]["clip_state"] == "none", "the made-up 400 left a clip")


def case_clip_network_failure(env):
    with case(env, 'a network failure of a clip is tried 3 times, then the strip reads "No clip saved"') as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.always.update({"clip": "abort"}))
        tap_and_leave_after_clip(c, p)
        for gap in (2100, 5100, 15100):
            c.ok(p.until(lambda: p.net.count("clip") >= 1, 6), "no clip request")
            p.page.wait_for_timeout(300)
            p.ff(gap)
        p.page.wait_for_timeout(600)
        c.ok(p.net.count("clip") == 4, f"clip requests {p.net.count('clip')}")
        c.ok(p.ui_strip() == "lost", f"strip {p.ui_strip()}")
        p.ff(30000)
        p.page.wait_for_timeout(400)
        c.ok(p.net.count("clip") == 4, "a fifth request went out")


def case_home_card(env):
    with case(env, "the Home card shows after a reload and in a second browser with the other adult; Skip in one hides it in the other") as c:
        older = c.gw.seed(30, adult="Sam")
        c.gw.seed(14, adult="Sam")
        one = c.open("Sam")
        c.ok(one.until(lambda: one.visible(".cry-ask"), 4), "no card")
        c.ok(re.search(r"What stopped the \d{1,2}:\d{2}\s?[AP]M cry\?", one.js("document.querySelector('.cry-ask h2').textContent")) is not None, "the question has no time")
        one.page.reload()
        c.ok(one.until(lambda: one.visible(".cry-ask"), 6), "no card after the reload")
        two = c.open("Alex")
        c.ok(two.until(lambda: two.visible(".cry-ask"), 4), "no card for the other adult")
        one.js("LittleDaysCryUI.state.home.inflight")
        one.net.next("home", "hold")  # A failed Skip refreshes Home before the adult retries.
        one.net.next("patch", "abort")
        one.click('[data-act="cry-ask-skip"]')
        c.ok(one.until(lambda: one.net.count("patch") == 1 and one.visible(".cry-ask"), 4), "a failed Skip did not restore the question")
        c.ok(one.until(lambda: "home" in one.net.held, 4), "the old Home reply was not held")
        one.click('[data-act="cry-ask-skip"]')
        c.ok(one.until(lambda: c.gw.cries()[1]["skipped"] == 1, 3), "Skip was not saved")
        one.net.release("home")
        one.ff(15000)
        one.js("LittleDaysCryUI.tick()")
        two.js("LittleDaysCryUI.tick()")
        c.ok(two.until(lambda: not two.visible(".cry-ask"), 4), "the card still shows for the other adult")
        c.ok(not one.visible(".cry-ask"), "the card still shows after Skip")
        one.page.reload()
        c.ok(one.until(lambda: one.js("LittleDaysCryUI.state.home.loaded"), 6), "Home did not load again")
        c.ok(not one.visible(".cry-ask"), "an older question returned after the reload")
        c.ok(len(c.gw.cries()) == 2 and next(r for r in c.gw.cries() if r["id"] == older)["skipped"] == 0, "Skip changed the older cry")


def case_passage_with_list_failing(env):
    with case(env, "a passage opens while the request for the Past cries list fails") as c:
        c.gw.sound("Sam", "off")
        p = c.open(before=lambda q: q.net.always.update({"list": "abort"}))
        p.tap()
        for key in ("help", "comfort"):
            p.click(f'[data-cry-passage="{key}"] summary')
            c.ok(p.until(lambda: p.js(f"document.querySelector('[data-cry-passage=\"{key}\"]').open"), 2), f"the {key} passage did not open")
            c.ok(p.js(f"document.querySelector('[data-cry-passage=\"{key}\"] .cry-passage p').textContent.length") > 30, f"the {key} passage has no text")
            c.ok(p.js(f"/^Source: /.test(document.querySelector('[data-cry-passage=\"{key}\"] a').textContent.trim())"), f"the {key} passage has no Source link")
        p.click('[data-act="cry-past"]')
        c.ok(p.until(lambda: p.visible('[data-empty="error"]'), 4), "the failing list showed no error line")


# ---------------------------------------------------------------------------------------------------------------- Codex screens review, round 1

def case_leave_before_home(env):
    with case(env, "R1 leaving before the Home reply (no choice yet): no first-use sheet later, no microphone, the cry is saved with no sound") as c:
        for how in ("close", "row"):
            p = c.open("Alex", wait_home=False, before=lambda q: q.net.next("home", "delay"))
            p.tap()
            p.click('[data-act="cry-close"]' if how == "close" else '.cry-row[data-arg="diaper"]')
            p.net.release("home")
            p.page.wait_for_timeout(1200)
            c.ok(not p.visible('[data-cry-sheet="first"]'), f"{how}: the first-use sheet showed after leaving")
            c.ok(p.mic_calls() == 0, f"{how}: microphone calls {p.mic_calls()}")
            mine = [r for r in c.gw.cries() if r["adult"] == "Alex"]
            c.ok(len(mine) == (1 if how == "close" else 2) and all(r["sound_on"] == 0 for r in mine), f"{how}: rows {mine}")
            c.ok(p.net.count("sound") == 0, f"{how}: a choice was saved without the question")


def case_adult_change_stops_every_queue(env):
    with case(env, "R1 sign-out stops every live queue of the adult, also an older tap's") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.always.update({"create": "abort"}))
        p.tap()
        c.ok(p.until(lambda: p.net.count("create") == 1, 3), "no first create")
        p.click('[data-act="cry-close"]')
        p.tap()
        c.ok(p.until(lambda: p.net.count("create") == 2, 3), "no second create")
        p.js("S.auth = 'login'; render()")
        sent = p.net.count("create")
        for _ in range(4):
            p.ff(5600)
            p.page.wait_for_timeout(250)
        c.ok(p.net.count("create") == sent, f"create requests went on after the sign-out: {sent} -> {p.net.count('create')}")
        c.ok(p.tracks_ended() or not p.tracks(), f"a microphone track stayed open {p.tracks()}")


def open_settings(p):
    p.click('[data-act="open-settings"]')
    p.page.locator("#cry-settings").wait_for()


def case_delete_all_before_list(env):
    with case(env, 'R1 "Delete all sound clips" before the list loads says "all", never 0; the number comes with the list') as c:
        for minutes in (40, 70, 150):
            c.gw.seed(minutes, stopped_by="held", clip=True)
        p = c.open(before=lambda q: q.net.always.update({"list": "delay"}))
        open_settings(p)
        p.click('[data-act="cry-delall"]')
        text = p.js("document.querySelector('[data-cry-sheet=\"deleteall\"]')?.textContent || ''")
        c.ok("all sound clips" in text and "Delete all clips" in text and not re.search(r"\d", text), f"sheet before the list: {text!r}")
        p.net.always.clear()
        p.net.release("list")
        c.ok(p.until(lambda: "Delete 3 clips" in p.js("document.querySelector('[data-cry-sheet=\"deleteall\"]')?.textContent || ''"), 4), "the sheet did not take the count of the list")


def case_sheet_over_settings_keys(env):
    with case(env, "R1 the delete-all sheet over Settings: Tab stays in the sheet; Escape closes only the sheet") as c:
        c.gw.seed(40, stopped_by="held", clip=True)
        p = c.open()
        open_settings(p)
        p.click('[data-act="cry-delall"]')
        p.page.wait_for_timeout(200)
        inside = []
        for _ in range(5):
            p.page.keyboard.press("Tab")
            inside.append(p.js("!!document.activeElement.closest('[data-cry-sheet]')"))
        c.ok(all(inside), f"Tab left the sheet: {inside}")
        p.page.keyboard.press("Escape")
        p.page.wait_for_timeout(300)
        c.ok(not p.visible("[data-cry-sheet]") and p.visible("#cry-settings"), "Escape did not close only the sheet")
        c.ok(p.js("document.activeElement?.dataset?.act") == "cry-delall", f"focus went to {p.js('document.activeElement?.outerHTML?.slice(0, 80)')}")


def case_sound_buttons_wait(env):
    with case(env, "R1 the two sound buttons are disabled while a sound save is in flight") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("sound", "hold"))
        open_settings(p)
        p.click('[data-act="cry-sound"][data-arg="off"]')
        c.ok(p.until(lambda: "sound" in p.net.held, 3), "no sound request held")
        both = p.js("[...document.querySelectorAll('#cry-settings [data-act=\"cry-sound\"]')].map(b => b.disabled)")
        c.ok(both == [True, True], f"buttons during the save: {both}")
        p.net.release("sound")
        c.ok(p.until(lambda: p.js("[...document.querySelectorAll('#cry-settings [data-act=\"cry-sound\"]')].every(b => !b.disabled)"), 3), "the buttons stayed disabled")
        c.ok(p.net.count("sound") == 1, f"sound requests {p.net.count('sound')}")


def case_undo_keeps_pending_stop(env):
    with case(env, "R1 an answer does not replace a pending Stop feed Undo line") as c:
        c.gw.seed(14)
        p = c.open()
        c.ok(p.until(lambda: p.visible(".cry-ask"), 4), "no Home card")
        p.js("S.toast = {text: () => 'Feed stopped', undoId: 'op-1', undoUntil: null, pending: true, k: 7, total: 600000, until: Date.now() + 600000}; render()")
        p.click('[data-act="cry-ask-answer"][data-arg="feed"]')
        c.ok(p.until(lambda: c.gw.cries()[0]["stopped_by"] == "feed", 3), "the answer was not saved")
        p.page.wait_for_timeout(400)
        c.ok(p.js("S.toast && S.toast.undoId === 'op-1' && !S.toast.cryUndo"), f"the Stop line was replaced: {p.js('JSON.stringify(S.toast)')}")


def case_undo_changed_false(env):
    with case(env, 'R1 Undo after another answer was saved: no "Undone", the page names the answer that stays') as c:
        cid = c.gw.seed(14)
        p = c.open()
        c.ok(p.until(lambda: p.visible(".cry-ask"), 4), "no Home card")
        p.click('[data-act="cry-ask-answer"][data-arg="feed"]')
        c.ok(p.until(lambda: p.visible('[data-act="cry-undo"]'), 3), "no Undo")
        c.gw.call("PATCH", f"/api/cries/{cid}", "Alex", {"stoppedBy": "sleep"})
        p.click('[data-act="cry-undo"]')
        c.ok(p.until(lambda: "Not undone" in (p.js("S.message") or ""), 3), f"message {p.js('S.message')!r}")
        c.ok(c.gw.cries()[0]["stopped_by"] == "sleep", f"rows {c.gw.cries()}")
        c.ok(p.js(f"!LittleDaysCryUI.state.home.hidden.has('{cid}')"), "R2 the cry stayed hidden on Home after the conflicting Undo")


# ---------------------------------------------------------------------------------------------------------------- Codex screens review, round 2

def case_first_answer_after_adult_change(env):
    with case(env, "R2 a sound-save reply after a change of adult creates no cry") as c:
        p = c.open("Alex", before=lambda q: q.net.next("sound", "hold"))
        p.tap()
        c.ok(p.until(lambda: p.visible('[data-cry-sheet="first"]'), 3), "no sheet")
        p.click('[data-act="cry-first-record"]')  # "Not now" saves no choice, so only "Record 10 seconds" sends this request
        c.ok(p.until(lambda: "sound" in p.net.held, 3), "no sound request held")
        p.js("S.me = {id: 'adult:1', name: 'Sam'}; render()")
        p.net.release("sound")
        p.page.wait_for_timeout(1000)
        c.ok(p.net.count("create") == 0 and not c.gw.cries() and p.mic_calls() == 0, f"creates {p.net.count('create')}, rows {c.gw.cries()}, microphone calls {p.mic_calls()}")


def case_adult_change_two_pending_creates(env):
    with case(env, "R3 an adult change with two creates pending stops both queues: no create request after the change") as c:
        c.gw.sound("Sam", "off")
        p = c.open(before=lambda q: q.net.next("create", "delay-abort", 2))
        p.tap()
        p.click('[data-act="cry-close"]')
        p.tap()
        c.ok(p.until(lambda: len(p.net.held.get("create", [])) == 2, 3), f"two creates were not pending: {len(p.net.held.get('create', []))}")
        c.ok(p.js("LittleDaysCryUI.state.live.length") == 2, f"queues in C.live: {p.js('LittleDaysCryUI.state.live.length')}")
        p.js("S.me = {id: 'adult:2', name: 'Alex'}; render()")
        sent = p.net.count("create")
        p.net.release("create")
        for _ in range(4):
            p.page.wait_for_timeout(300)
            p.ff(5600)
        p.page.wait_for_timeout(500)
        c.ok(p.net.count("create") == sent, f"create requests after the change: {p.net.count('create') - sent}")


def case_delete_question_target_gone(env):
    with case(env, "R2 a delete question for a cry removed on another phone goes away; the screen is not stuck") as c:
        cid = c.gw.seed(40, stopped_by="held", clip=True)
        p = c.open()
        p.js("LittleDaysCryUI.handle('cry-past')")
        p.click('[data-act="cry-filter"][data-arg="all"]')
        p.js(f"document.querySelector('details[data-cry-id=\"{cid}\"]').open = true")
        p.click(f'[data-act="cry-delete"][data-arg="{cid}"]')
        c.ok(p.until(lambda: p.visible('[data-cry-sheet="deletecry"]'), 2), "no question")
        c.gw.call("DELETE", f"/api/cries/{cid}", "Alex")
        p.js("LittleDaysCryUI.handle('cry-list-retry')")
        c.ok(p.until(lambda: p.js("!document.querySelector('.formscreen[inert], [data-cry-sheet]')"), 3), "the screen stayed inert under a missing question")


def case_delete_all_fresh_count(env):
    with case(env, 'R2 delete-all with a loaded list says "all" until the new list arrives, then the new number') as c:
        for minutes in (40, 70):
            c.gw.seed(minutes, stopped_by="held", clip=True)
        p = c.open()
        open_settings(p)
        c.ok(p.until(lambda: p.js("LittleDaysCryUI.state.list.state") == "ok", 4), "no list")
        c.gw.seed(150, stopped_by="held", clip=True)
        p.net.next("list", "delay")
        p.click('[data-act="cry-delall"]')
        text = "document.querySelector('[data-cry-sheet=\"deleteall\"]')?.textContent || ''"
        c.ok(p.until(lambda: "list" in p.net.held, 3) and "Delete all clips" in p.js(text) and "Delete 2" not in p.js(text), f"stale count: {p.js(text)!r}")
        p.net.release("list")
        c.ok(p.until(lambda: "Delete 3 clips" in p.js(text), 3), f"no new count: {p.js(text)!r}")


def case_strip_delete_relists(env):
    with case(env, "R2 Delete on the strip updates the loaded list (the Settings clip count)") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        open_settings(p)
        c.ok(p.until(lambda: p.js("LittleDaysCryUI.state.list.state") == "ok", 4), "no list")
        p.page.keyboard.press("Escape")
        p.tap()
        c.ok(p.until(lambda: p.strip() == "saved", 18), f"strip {p.strip()}")
        kept = "LittleDaysCryUI.state.list.cries.filter(c => c.clipState === 'kept').length"
        c.ok(p.until(lambda: p.js(kept) == 1, 3), "the list did not take the new clip")
        p.click('[data-act="cry-strip-delete"]')
        c.ok(p.until(lambda: p.strip() == "gone", 3), f"strip {p.strip()}")
        c.ok(p.until(lambda: p.js(kept) == 0, 3), f"the list still counts {p.js(kept)} kept clips")


def case_row_form_returns(env):
    with case(env, "R1 a row opens its form over the Crying screen; Cancel brings the Crying screen back") as c:
        c.gw.sound("Sam", "off")
        p = c.open()
        p.tap()
        p.click('.cry-row[data-arg="diaper"]')
        c.ok(p.until(lambda: p.visible("[data-sheet]"), 1), "no form")
        p.page.keyboard.press("Escape")
        c.ok(p.until(lambda: p.visible('.formscreen[data-kind="cry"]'), 2), "the Crying screen did not come back")


def case_list_refresh_on_clip(env):
    with case(env, "R1 Past cries opened during a recording shows the clip when its upload ends") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("clip", "delay"))
        p.tap()
        c.ok(p.until(lambda: (p.left() or 10) <= 6, 8), "the countdown did not pass 4 s")
        p.click('[data-act="cry-past"]')
        c.ok(p.until(lambda: p.page.locator("details[data-cry-id]").count() == 1, 4), "no row")
        c.ok(p.until(lambda: p.net.count("clip") == 1, 4), "no clip request")
        p.net.release("clip")
        row = "document.querySelector('details[data-cry-id] summary').textContent"
        c.ok(p.until(lambda: "s clip" in p.js(row), 4), f"row {p.js(row)!r}")


def case_settings_before_home(env):
    with case(env, "R1 Settings opened before the Home reply shows the sound choice when the reply arrives") as c:
        c.gw.sound("Sam", "on")
        p = c.open(wait_home=False, before=lambda q: q.net.next("home", "delay"))
        open_settings(p)
        p.net.release("home")
        c.ok(p.until(lambda: p.js("document.querySelector('#cry-settings [data-arg=\"on\"]').getAttribute('aria-pressed')") == "true", 3), "no choice shown")


def case_retry_mic_countdown(env):
    with case(env, "R1 Try again after a refused microphone counts down from 10 s") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        p.js("window.__gum.deny = true")
        p.tap()
        c.ok(p.until(lambda: p.strip() == "micoff", 5), f"strip {p.strip()}")
        p.js("window.__gum.deny = false")
        p.click('[data-act="cry-retry-mic"]')
        c.ok(p.until(lambda: p.strip() == "rec", 5), f"strip {p.strip()}")
        c.ok(p.until(lambda: (p.left() or 10) <= 8, 4), f"the countdown stayed at {p.left()} s")


def case_cut_off_reply(env):
    with case(env, "R1 a create reply of 200 with cut-off JSON counts as lost: the page tries again and records") as c:
        c.gw.sound("Sam", "on")
        p = c.open(before=lambda q: q.net.next("create", "cut"))
        p.tap()
        c.ok(p.until(lambda: p.net.count("create") == 1, 3), "no create")
        p.ff(2100)
        c.ok(p.until(lambda: p.net.count("create") == 2, 4), f"no retry after the cut-off reply ({p.net.count('create')} creates)")
        c.ok(p.until(lambda: p.mic_calls() == 1, 4), f"microphone calls {p.mic_calls()}")
        c.ok(len(c.gw.cries()) == 1, f"rows {len(c.gw.cries())}")


# ---------------------------------------------------------------------------------------------------------------- layout and contrast

FIT = """() => {
  const vw = innerWidth, bad = [];
  const roots = [...document.querySelectorAll('.formscreen, .cry-home, .cry-ask, .confirm, #cry-settings, .toast')];
  for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!el.getClientRects().length || el.tagName === 'INPUT') continue;  // a hidden file input of Settings is not part of this feature
    const b = el.getBoundingClientRect(), name = (el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ':' + (el.textContent || '').trim().slice(0, 24);
    if (b.width && (b.right > vw + 0.5 || b.left < -0.5)) bad.push('edge ' + name);
    const ox = getComputedStyle(el).overflowX;
    if (el.clientWidth && el.scrollWidth > el.clientWidth + 1 && ox !== 'auto' && ox !== 'scroll') bad.push('clipped ' + name);
  }
  const fs = document.querySelector('.formscreen');
  if (document.documentElement.scrollWidth > vw) bad.push('page scrolls sideways');
  if (fs && fs.scrollWidth > fs.clientWidth + 1) bad.push('screen scrolls sideways');
  return bad.slice(0, 5);
}"""

TEXT = ("text", 4.5)
PARTS = {
    "home": [("card C title", ".cry-home .cry-text strong", "text"), ("card C line", ".cry-home .cry-text .sub", "text"), ("card C chevron", ".cry-home .chev svg", "glyph"),
             ("ask question", ".cry-ask h2", "text"), ("ask chip", ".cry-ask .chip", "text"), ("ask chip border", ".cry-ask .chip", "border"), ("ask skip", ".cry-ask .textlink", "text")],
    "cry": [("title", ".bar h1", "text"), ("back", ".bar .back", "text"), ("back border", ".bar .back", "border"), ("row title", ".cry-row strong", "text"), ("row line", ".cry-row .sub", "text"),
            ("compare heading", ".cry-compare h2", "text"), ("key line", ".cry-key", "text"), ("strip title", ".cry-rec strong", "text"), ("strip line", ".cry-rec .sub", "text"),
            ("strip button", ".cry-rec .back", "text"), ("strip button border", ".cry-rec .back", "border"), ("passage row", ".cry-more .nav-row", "text"), ("chevron", ".cry-more .chev svg", "glyph")],
    "past": [("count", ".cry-count h2", "text"), ("count line", ".cry-count .sub", "text"), ("filter chip", ".chips .chip", "text"), ("filter border", ".chips .chip", "border"),
             ("day heading", ".day > h2", "text"), ("cry time", ".cry-list summary strong", "text"), ("cry line", ".cry-list summary .sub", "text"), ("answer chip", ".cry-body .chip", "text"), ("delete link", ".cry-tools .textlink", "text")],
    "settings": [("group heading", "#cry-settings h2", "text"), ("sound chip", "#cry-settings .chip", "text"), ("sound chip border", "#cry-settings .chip", "border"), ("row", "#cry-settings .nav-row", "text"), ("row line", "#cry-settings .sub", "text")],
    "sheet": [("sheet title", ".confirm h2", "text"), ("sheet text", ".confirm .sub", "text"), ("sheet primary", ".confirm .btn-primary", "text"), ("sheet other", ".confirm .back", "text"), ("sheet other border", ".confirm .back", "border")],
}


def audit(c, p, label, screen):
    bad = p.js(FIT)
    c.ok(not bad, f"{label}: {bad}")
    rows = p.js(f"({NIGHT_PROBE})({json.dumps(PARTS[screen])})")
    weak = sorted({(r[0], r[2], r[3]) for r in rows if r[3] < r[2]})
    c.ok(not weak and len(rows) >= 3, f"{label}: contrast {weak or 'measured only ' + str(len(rows))}")


def look(c, width, lang, theme):
    tag = f"{width}px {lang} {'night' if theme == 'on' else 'day'}"
    c.gw.sound("Sam", "on")
    done = c.gw.seed(40, stopped_by="held", clip=True)
    c.gw.seed(70, stopped_by=None)
    c.gw.seed(150, stopped_by="nothing", clip=True, noisy=1)
    c.gw.seed(14, stopped_by=None)
    p = c.open(lang=lang, width=width, theme=theme)
    p.page.wait_for_timeout(300)
    audit(c, p, f"{tag} Home", "home")
    p.tap()
    c.ok(p.until(lambda: p.strip() in ("start", "rec"), 4), f"{tag}: no strip")
    p.page.wait_for_timeout(900)
    p.click("details[data-cry-passage] summary")
    audit(c, p, f"{tag} Crying screen", "cry")
    p.click('[data-act="cry-past"]')
    c.ok(p.until(lambda: p.page.locator("details[data-cry-id]").count() > 0, 4), f"{tag}: no list")
    p.click('[data-act="cry-filter"][data-arg="all"]')
    p.page.wait_for_timeout(200)
    p.js(f"document.querySelector('details[data-cry-id=\"{done}\"]').open = true")
    p.page.wait_for_timeout(150)
    audit(c, p, f"{tag} Past cries", "past")
    p.click(f'[data-act="cry-delete"][data-arg="{done}"]')
    p.page.wait_for_timeout(200)
    audit(c, p, f"{tag} delete sheet", "sheet")
    p.click('[data-act="cry-sheet-keep"]')
    p.click('[data-act="cry-close"]')
    p.click('[data-act="open-settings"]')
    p.page.wait_for_timeout(500)
    p.js("document.querySelector('#cry-settings').scrollIntoView()")
    audit(c, p, f"{tag} Settings", "settings")
    p.click('[data-act="cry-delall"]')
    p.page.wait_for_timeout(200)
    audit(c, p, f"{tag} delete-all sheet", "sheet")


def quiet_look(c, width, lang, theme):
    """The two lines of a cry with no sound: "Recording is off" with Turn on, then "Recording is on"."""
    tag = f"{width}px {lang} {'night' if theme == 'on' else 'day'}"
    c.gw.sound("Sam", "off")
    p = c.open(lang=lang, width=width, theme=theme)
    p.tap()
    c.ok(p.until(lambda: p.strip() == "off" and p.visible(".cry-rec .sub"), 4), f'{tag}: no Off line (strip "{p.strip()}")')
    audit(c, p, f"{tag} Off line", "cry")
    p.click('.cry-rec [data-act="cry-sound"]')
    c.ok(p.until(lambda: p.strip() == "next", 3), f'{tag}: no On line (strip "{p.strip()}")')
    audit(c, p, f"{tag} On line", "cry")


def first_sheet_look(c, width, lang, theme):
    p = c.open("Alex", lang=lang, width=width, theme=theme)
    p.tap()
    c.ok(p.until(lambda: p.visible('[data-cry-sheet="first"]'), 3), "no first-use sheet")
    audit(c, p, f"{width}px {lang} first-use sheet", "sheet")


def case_layout(env):
    with case(env, "390 px and 320 px: no sideways scroll; the night look passes the contrast check; the Spanish lines fit") as c:
        for width, lang, theme in ((390, "en", "off"), (320, "en", "off"), (390, "es", "off"), (320, "es", "off"), (390, "en", "on"), (320, "es", "on")):
            look(c, width, lang, theme)
            quiet_look(c, width, lang, theme)
            first_sheet_look(c, width, lang, theme)
            for page in c.pages:  # the page errors are read before the close
                c.ok(not page.errors, f"{width}px {lang}: page errors {page.errors[:2]}")
                page.ctx.close()
            c.pages.clear()
            c.gw.sql("DELETE FROM cries")


# ---------------------------------------------------------------------------------------------------------------- plan 2026-11-20

def case_rating_saves_last(env):
    with case(env, "M2 a rating tap saves; a second tap replaces it, also while the first request is on its way") as c:
        c.gw.sound("Sam", "off")
        p = c.open()
        p.tap()
        c.ok(p.until(lambda: len(c.gw.cries()) == 1, 3), "the cry was not saved")
        box = rate_box(p)
        c.ok(box and box["below"] and box["pressed"] == [], f"the rating card is not below the rows with no choice: {box}")
        p.click('[data-act="cry-rate"][data-arg="2"]')
        c.ok(p.until(lambda: c.gw.marks()[0]["distress"] == 2, 3), f"the first rating was not saved: {c.gw.marks()}")
        p.net.next("patch", "hold")  # the next request reaches the server; its reply waits
        p.click('[data-act="cry-rate"][data-arg="1"]')
        c.ok(p.until(lambda: p.net.count("patch") == 2, 2), "the second rating was not sent")
        p.click('[data-act="cry-rate"][data-arg="3"]')
        p.page.wait_for_timeout(400)
        c.ok(p.net.count("patch") == 2, f"a request went while one was on its way: {p.net.count('patch')} requests")
        c.ok(rate_box(p)["pressed"] == ["3"], f"the screen does not show the last choice: {rate_box(p)}")
        p.net.release("patch")
        c.ok(p.until(lambda: c.gw.marks()[0]["distress"] == 3, 3), f"the last of two quick taps does not count: {c.gw.marks()}")
        c.ok(p.net.count("patch") == 3, f"requests {p.net.count('patch')}")


def case_rating_before_saved(env):
    with case(env, "M2 a rating tap before the cry is saved is sent after it; a failed rating shows no error and the screen stays usable") as c:
        c.gw.sound("Sam", "off")
        p = c.open(before=lambda q: q.net.next("create", "delay"))
        p.tap()
        p.click('[data-act="cry-rate"][data-arg="1"]')
        p.page.wait_for_timeout(500)
        c.ok(p.net.count("patch") == 0, "a rating went before the cry had its id")
        p.net.release("create")
        c.ok(p.until(lambda: c.gw.cries() and c.gw.marks()[0]["distress"] == 1, 3), f"the waiting rating was not sent: {c.gw.marks()}")
        p.net.next("patch", ("status", 500))
        p.click('[data-act="cry-rate"][data-arg="3"]')
        c.ok(p.until(lambda: p.net.count("patch") == 2, 2), "the second rating was not sent")
        p.page.wait_for_timeout(500)
        c.ok(c.gw.marks()[0]["distress"] == 1, f"a lost request changed the field: {c.gw.marks()}")
        c.ok(not p.js("S.message") and not p.visible(".toast"), f"a failed rating shows an error: {p.js('S.message')!r}")
        p.net.next("patch", "abort")
        p.click('[data-act="cry-rate"][data-arg="2"]')
        p.page.wait_for_timeout(500)
        c.ok(not p.js("S.message"), "a network failure of a rating shows an error")
        p.click('.cry-row[data-arg="feed"]')
        c.ok(p.until(lambda: p.visible("[data-sheet]"), 1), "after a failed rating a row tap opens no form")


def case_rating_closed_layout(env):
    with case(env, "M2 M7 320 px Spanish: one strip height in each state; the rating card keeps one height and the rows stay in place; closed after 15 min") as c:
        c.gw.sound("Sam", "on")
        p = c.open(lang="es", width=320, height=740)
        watch_strip(p)
        p.tap()
        c.ok(p.until(lambda: p.strip() == "rec", 5), "no recording")
        first = rate_box(p)
        boxes = [first]
        for k in ("1", "2", "3"):
            p.click(f'[data-act="cry-rate"][data-arg="{k}"]')
            p.page.wait_for_timeout(150)
            boxes.append(rate_box(p))
        c.ok(first["fits"] and all(b["fits"] for b in boxes), f"a rating word overflows its chip: {boxes}")
        c.ok("¿Qué tan alterada está?" in first["text"] and "Gritando" in first["text"], f"Spanish words {first['text']!r}")
        c.ok("Ponga el teléfono a unos 30 cm de ella." in p.strip_text(), f"Spanish hold line {p.strip_text()!r}")
        c.ok(p.until(lambda: p.strip() == "saved", 16), f"no clip saved (strip {p.strip()})")
        heights = p.js("window.__strips")
        c.ok({"start", "rec", "saved"} <= set(heights) and len(set(heights.values())) == 1, f"M7 the strip height changes with its state at 320 px: {heights}")
        boxes.append(rate_box(p))
        same = lambda group: len({b["h"] for b in group}) == 1 and len({tuple(b["rows"]) for b in group}) == 1 and len({b["more"] for b in group}) == 1
        c.ok(same(boxes), f"the card or the rows moved with a choice: {[(b['h'], b['rows'], b['more']) for b in boxes]}")
        # The captions follow the clock, so the closed state is compared with the screen 3 s before the lock.
        p.ff(15 * 60 * 1000 - 3000 - int(p.since() * 1000))
        p.page.wait_for_timeout(300)
        late = rate_box(p)
        c.ok(not late["shut"] and not late["disabled"], f"the rating line closed before 15 minutes: {late}")
        p.ff(4000)
        c.ok(p.until(lambda: rate_box(p)["shut"], 2), "the rating line did not close after 15 minutes")
        shut = rate_box(p)
        c.ok(shut["disabled"] and shut["pressed"] == ["3"] and "Cerrado" in shut["text"], f"the closed line {shut}")
        c.ok(same([late, shut]) and shut["h"] == first["h"], f"the closed line moved the card or the rows: {[(b['h'], b['rows'], b['more']) for b in (late, shut)]}")
        before = p.net.count("patch")
        p.js("document.querySelector('[data-act=\"cry-rate\"][data-arg=\"1\"]').click()")
        p.page.wait_for_timeout(300)
        c.ok(p.net.count("patch") == before and rate_box(p)["pressed"] == ["3"], "the closed line took a tap")


def case_strip_375(env):
    with case(env, "M7 375 px Spanish: the strip keeps one height from Recording to Clip saved (Gemini review, 2026-11-20)") as c:
        c.gw.sound("Sam", "on")
        p = c.open(lang="es", width=375, height=740)
        watch_strip(p)
        p.tap()
        c.ok(p.until(lambda: p.strip() == "saved", 16), f"no clip saved (strip {p.strip()})")
        heights = p.js("window.__strips")
        c.ok({"start", "rec", "saved"} <= set(heights) and len(set(heights.values())) == 1, f"M7 the strip height changes with its state at 375 px: {heights}")


def case_no_clip_not_queued(env):
    with case(env, "M5 the no-clip reason of a hidden page is sent at once, also while a rating request waits for its reply") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        p.tap()
        c.ok(p.until(lambda: p.strip() == "rec", 5), "no recording")
        p.net.next("patch", "hold")  # the rating reaches the server; its reply waits
        p.click('[data-act="cry-rate"][data-arg="2"]')
        c.ok(p.until(lambda: "patch" in p.net.held, 2), "no rating request held")
        p.js("Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
        c.ok(p.until(lambda: c.gw.marks()[0]["no_clip"] == "hidden", 3), f"M5 the no-clip reason waited behind the rating request: {c.gw.marks()}")
        p.net.release("patch")


def case_leave_end(env):
    with case(env, "M5 leaving the screen after 4 s of recording keeps the clip with end left") as c:
        c.gw.sound("Sam", "on")
        p = c.open()
        p.tap()
        c.ok(p.until(lambda: p.strip() == "rec", 5), "no recording")
        c.ok(p.until(lambda: (p.left() or 10) <= 6, 6), "the countdown did not pass 4 s")
        p.click('[data-act="cry-close"]')
        c.ok(p.until(lambda: any(r["clip_state"] == "kept" for r in c.gw.marks()), 6), f"no clip was saved: {c.gw.marks()}")
        mark = c.gw.marks()[0]
        c.ok(mark["end"] == "left" and mark["row_tap"] is None, f"the clip of a left screen: {mark}")


def case_gas_and_playback(env):
    with case(env, "Gas is an answer option, and Play 10 s unlocks audio synchronously and plays an answered cry's clip") as c:
        cid = c.gw.seed(15, stopped_by=None, clip=True)
        p = c.open()
        c.ok(p.until(lambda: p.visible('[data-act="cry-ask-answer"][data-arg="gas"]'), 4), "Gas chip did not show on Home")
        p.click('[data-act="cry-ask-answer"][data-arg="gas"]')
        c.ok(p.until(lambda: c.gw.cries()[0]["stopped_by"] == "gas", 4), f"Gas answer did not save: {c.gw.cries()}")
        p.js("""(() => {
          window.__plays = [];
          const RealAudio = window.Audio;
          window.Audio = function FakeAudio() {
            const a = new RealAudio();
            const origPlay = a.play.bind(a);
            a.play = () => { window.__plays.push(a.src); return Promise.resolve(); };
            a.pause = () => {};
            window.__lastAudio = a;
            return a;
          };
        })()""")
        p.js("LittleDaysCryUI.handle('cry-past')")
        c.ok(p.until(lambda: p.visible('[data-act="cry-filter"][data-arg="all"]'), 4), "Past cries did not open")
        p.click('[data-act="cry-filter"][data-arg="all"]')
        p.click(f'details[data-cry-id="{cid}"] summary')
        c.ok(p.visible(f'[data-act="cry-answer"][data-arg="{cid}:gas"][aria-pressed="true"]'), "Gas chip is not pressed in Past cries")
        play_btn = f'[data-act="cry-play"][data-arg="{cid}"]'
        c.ok(p.visible(play_btn) and "Play 10 s" in p.js(f"document.querySelector('{play_btn}').textContent"), "Play 10 s button missing on answered cry")
        p.click(play_btn)
        c.ok(p.until(lambda: len(p.js("window.__plays")) >= 2, 4), f"audio did not unlock synchronously and play the fetched clip: {p.js('window.__plays')}")
        plays = p.js("window.__plays")
        c.ok(all(src.startswith("blob:") for src in plays) and plays[0] != plays[1], f"expected silent unlock blob then clip blob: {plays}")
        c.ok("Stop" in p.js(f"document.querySelector('{play_btn}').textContent") and p.js(f"document.querySelector('{play_btn}').getAttribute('aria-pressed')") == "true", "button did not toggle to Stop while playing")
        p.click(play_btn)
        c.ok("Play 10 s" in p.js(f"document.querySelector('{play_btn}').textContent") and p.js(f"document.querySelector('{play_btn}').getAttribute('aria-pressed')") == "false", "tapping Stop did not restore Play 10 s")


CASES = [case_tap_and_clip, case_row_during_slow_create, case_row_after_recording, case_new_adult_before_home, case_first_use_record, case_first_use_not_now,
         case_settings_on_after_off, case_off_line_turn_on, case_turn_on_during_home_poll, case_late_create_reply, case_late_microphone, case_lost_create_then_sound_off, case_answer_without_reply, case_leaving, case_refused_microphone,
         case_missing_days_rows, case_missing_days_reply, case_missing_days_failure, case_old_page_sound, case_create_failing, case_clip_has_a_clip,
         case_clip_400, case_clip_network_failure, case_home_card, case_passage_with_list_failing, case_layout,
         case_leave_before_home, case_adult_change_stops_every_queue, case_delete_all_before_list, case_sheet_over_settings_keys, case_sound_buttons_wait,
         case_undo_keeps_pending_stop, case_undo_changed_false, case_row_form_returns, case_list_refresh_on_clip, case_settings_before_home,
         case_retry_mic_countdown, case_cut_off_reply,
         case_first_answer_after_adult_change, case_adult_change_two_pending_creates, case_delete_question_target_gone, case_delete_all_fresh_count, case_strip_delete_relists,
         case_rating_saves_last, case_rating_before_saved, case_rating_closed_layout, case_strip_375, case_no_clip_not_queued, case_leave_end, case_gas_and_playback]


def main():
    (WORK / "gateway.mjs").write_text(GATEWAY)
    only = sys.argv[1:]
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            for run in CASES:
                if not only or any(o in run.__name__ for o in only):
                    run(browser)
            browser.close()
    finally:
        shutil.rmtree(WORK, ignore_errors=True)
    print(f"{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
