/* The logic of the Crying button.
   Plain browser JS, no DOM, no network, no clock of its own: every function takes what it needs, so a test can feed it invented data.
   It sets globalThis.LittleDaysCryLog. Time is in minutes on the axis of S.entries: minute 0 is today at midnight (local), a day is 1440.

   ---- Records (the same objects as S.entries, S.run, S.sleepRun) ----
   feed or bottle {type, t, sid?, id?, ml?}   sleep {type, t, dur, tEnd?, live?}   diaper {type, t, kind: 'W'|'D'|'B'}
   A feed session is every entry with the same `sid`; an entry with no `sid` is a session of its own. It starts at its first part.

   ---- The usual gap and the rows ----
   careRows({entries, now, run, sleepRun})
     now: minutes now (fraction allowed). run: the feed timer (truthy when one runs). sleepRun: the sleep timer (truthy when one runs
     or is paused; Home treats both as active).
     -> {dayPart: 'day'|'night', rows: [feedRow, sleepRow, diaperRow]} in the Home order. A row:
        {type, sinceMin, usualMin, gaps, running, lastKind, lastAmountMl, ratio, diffMin, about, state}
        sinceMin  whole minutes since the last feed START, the last sleep END (awake time) or the last change; null with no record
                  in memory, and null while the timer of that type runs
        usualMin  D6: median of the gaps of the last 7 days that END in the same part of the day as `now` (day 7 AM to 7 PM,
                  night 7 PM to 7 AM); null under 5 gaps. A gap counts only when both records start inside the 7 days
                  (t >= now - 10080). A gap of 0 minutes or less is ignored. Rounded to whole minutes.
        gaps      how many gaps were found for that part of the day (also when under 5, so "2 gaps" can be told)
        ratio     sinceMin / usualMin, or null with no since or no usual     diffMin  sinceMin - usualMin (both rounded), or null
        about     true inside 10 percent of the usual (|diffMin| <= 0.1 * usualMin), so the caption reads "About usual"
        state     'running' | 'empty' (no record) | 'noUsual' | 'about' | 'over' | 'under'
        lastKind  feed: 'breast' | 'bottle' | 'mixed' (the parts of the last session); diaper: 'wet' | 'dirty' | 'both'; else null
        lastAmountMl  feed only: the ml of the bottle parts of the last session, or null
   order(rows) -> a new array: ratio, largest first. A row with no ratio (no usual, no record, running) comes last. Ties and
     those last rows keep their input order (stable).
   rankOf(rows) -> ['feed','sleep','diaper'] in that order: the `rank` of the snapshot.
   aboutUsual(sinceMin, usualMin) -> boolean, the 10 percent rule alone.
   median(gaps) -> the usual of a list of gap minutes, or null under 5 values.

   ---- The snapshot of the tap ----
   snapshot({entries, now, run, sleepRun, complete, ageDays})
     -> {ageDays, dayPart, complete, rank, order, log: {feed, sleep, diaper}}: the body of `snapshot` in POST /api/cries, field for field
        (every empty value is null; `rank` is [] when `complete` is false; `order` is 'home': the screen shows the rows in the Home order). Built from the arguments only and holds no reference to them,
        so a record that arrives after the tap cannot change it. log.feed {sinceMin, usualMin, gaps, lastKind, lastAmountMl, running},
        log.sleep {awakeMin, usualMin, gaps, running}, log.diaper {sinceMin, usualMin, gaps, lastKind}.
   missingDays(held, todayISO) -> the 'YYYY-MM-DD' days from 7 days ago to 2 days ago that `held` (a Set of day strings, S.loadedRanges)
     lacks. Yesterday and today come with the normal state load and are never listed. It lists the days for the ranged request.
   isComplete(held, todayISO) -> true when missingDays is empty: the `complete` of the snapshot.
   ageDaysOf(birthISO, todayISO) -> whole days old, or null.

   ---- The queue of one tap (create first, then the clip) ----
   const q = createQueue({body, create, clip, onState, tappedAt, timer, now, retryMs});
     body      the POST body {id, occurredAt, snapshot, sound}
     create(body) -> Promise<{status, body?}>        rejects on a network failure. The screen wraps the real request.
     clip(id, wav, captureHeader) -> Promise<{status}>   rejects on a network failure. captureHeader goes in the header x-cry-capture.
     onState(state, detail)    see the states below
     tappedAt  ms of the sound tap (Date.now at the tap). timer {set(fn, ms) -> handle, clear(handle)}, now() -> ms, retryMs: for tests.
   q.start()            sends the create request.
   q.clipReady(result)  the settled value of the recording (LittleDaysCry rec.result). {ok: true, wav, startMs, capture} uploads the clip
                        once the cry is saved (it waits for that). {ok: false} ends as 'no-clip'.
   q.noClip(reason)     the screen says no clip will come: emits 'no-clip'.
   q.tryAgain()         the "Try again" button of 'not-saved' with canRetry: sends the same id again with sound false; opens no microphone.
   q.stop(reason)       'adult-changed' | 'cry-deleted' | 'clip-deleted' | 'page-closed': clears the timers, ignores any reply, sends nothing more.
   q.current()          {state, detail} of the last emit.
   Retries: only after a network failure or a 5xx reply, 3 times, after 2 s, 5 s and 15 s (4 requests in all). A 4xx reply is final.
   States (the strip of the mockup in brackets):
     'creating' {attempt}                  the create request is out ('Starting')
     'create-retry' {attempt, inMs}        it failed; the next try comes in inMs ('Starting')
     'created' {sound, openMic, manual}    saved. openMic is true only when the reply says sound on, the reply came inside 5 s of
                                           tappedAt and this is not a manual retry: then the screen calls rec.start() ('Starting' / 'Recording')
     'not-saved' {canRetry, reason, status}  create failed. canRetry true after the last try on a network failure or 5xx (button 'Try again');
                                           false after a 4xx ('Not saved yet')
     'clip-sending' {attempt}              the clip upload is out
     'clip-retry' {attempt, inMs}          it failed; the next try comes in inMs ('Clip not sent yet')
     'clip-saved' {already}                saved; `already` is true for the reply 409 'has a clip' ('Clip saved')
     'no-clip' {reason, status?}           'network' (after the last try) | 'refused' (a 4xx) | the reason of noClip or the recording ('No clip saved')
     'stopped' {reason}                    the queue ended: 410 (reason 'cry-deleted'), or q.stop (no strip: the screen is gone or the clip is deleted)
*/
globalThis.LittleDaysCryLog = (() => {
  const DAY = 1440, WINDOW = 7 * DAY, DAY_FROM = 7 * 60, NIGHT_FROM = 19 * 60, MIN_GAPS = 5;
  const TYPES = ['feed', 'sleep', 'diaper'];
  const finite = Number.isFinite;
  const partOf = minute => { const m = ((minute % DAY) + DAY) % DAY; return m >= DAY_FROM && m < NIGHT_FROM ? 'day' : 'night'; };
  const sleepEnd = entry => finite(entry.tEnd) ? entry.tEnd : entry.t + entry.dur;

  function median(gaps) {
    if (gaps.length < MIN_GAPS) return null;
    const sorted = [...gaps].sort((a, b) => a - b), mid = sorted.length >> 1;
    return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
  }
  const aboutUsual = (since, usual) => finite(since) && finite(usual) && usual > 0 && Math.abs(since - usual) * 10 <= usual;

  // ---- The records of each care type as points {start, end, ...}, oldest first ----

  function feedPoints(entries, now) {
    const sessions = new Map();
    entries.forEach((entry, index) => {
      if (!entry || (entry.type !== 'feed' && entry.type !== 'bottle') || !finite(entry.t) || entry.t > now) return;
      const key = entry.sid ? `session:${entry.sid}` : `entry:${entry.id ?? index}`;
      sessions.set(key, [...(sessions.get(key) || []), entry]);
    });
    return [...sessions.values()].map(parts => {
      const start = Math.min(...parts.map(p => p.t)), bottles = parts.filter(p => p.type === 'bottle');
      // A bottle with a unit that is not ml (the server says 'unknown' when it cannot tell) stays a feed; only its amount is left out.
      const ml = bottles.reduce((sum, p) => sum + (finite(p.ml) && p.ml > 0 && (p.unit === undefined || p.unit === 'ml') ? p.ml : 0), 0);
      const kind = bottles.length === 0 ? 'breast' : bottles.length === parts.length ? 'bottle' : 'mixed';
      return {start, end: start, kind, ml: ml > 0 ? ml : null};
    }).sort((a, b) => a.start - b.start);
  }

  function sleepPoints(entries, now) {
    return entries
      .filter(e => e && e.type === 'sleep' && !e.live && finite(e.t) && finite(e.dur) && e.dur > 0 && sleepEnd(e) <= now)
      .map(e => ({start: e.t, end: sleepEnd(e)})).sort((a, b) => a.start - b.start);
  }

  const KINDS = {W: 'wet', D: 'dirty', B: 'both'};
  function diaperPoints(entries, now) {
    return entries.filter(e => e && e.type === 'diaper' && finite(e.t) && e.t <= now)
      .map(e => ({start: e.t, end: e.t, kind: KINDS[e.kind] ?? null})).sort((a, b) => a.start - b.start);
  }

  // The gaps (minutes) that end in `part` and have both records inside the 7 days. Feed: start to next start. Sleep: end to next start.
  function gapsOf(points, now, part) {
    const from = now - WINDOW, out = [];
    for (let i = 1; i < points.length; i++) {
      const before = points[i - 1], after = points[i], gap = after.start - before.end;
      if (before.start >= from && gap > 0 && partOf(after.start) === part) out.push(gap);
    }
    return out;
  }

  function rowOf(type, points, now, part, running) {
    const gaps = gapsOf(points, now, part), usual = median(gaps), last = points.at(-1) || null;
    const since = last && !running ? Math.max(0, Math.round(now - last.end)) : null;
    const diff = since !== null && usual !== null ? since - usual : null;
    const about = aboutUsual(since, usual);
    const state = running ? 'running' : since === null ? 'empty' : usual === null || usual <= 0 ? 'noUsual' : about ? 'about' : diff > 0 ? 'over' : 'under';
    return {
      type, sinceMin: since, usualMin: usual, gaps: gaps.length, running: !!running, lastKind: last?.kind ?? null, lastAmountMl: last?.ml ?? null,
      ratio: since !== null && usual > 0 ? since / usual : null, diffMin: diff, about, state,
    };
  }

  function careRows({entries = [], now, run = null, sleepRun = null}) {
    const part = partOf(now), list = Array.isArray(entries) ? entries : [];
    // Only the feed points carry an amount and only the feed and diaper points carry a kind, so the other rows read null.
    const rows = [
      rowOf('feed', feedPoints(list, now), now, part, run),
      rowOf('sleep', sleepPoints(list, now), now, part, sleepRun),
      rowOf('diaper', diaperPoints(list, now), now, part, false),
    ];
    return {dayPart: part, rows};
  }

  function order(rows) {
    return rows.map((row, index) => [row, index]).sort((a, b) => (b[0].ratio ?? -1) - (a[0].ratio ?? -1) || a[1] - b[1]).map(pair => pair[0]);
  }
  const rankOf = rows => order(rows).map(row => row.type);

  // ---- The snapshot of the tap ----

  function snapshot({entries, now, run, sleepRun, complete, ageDays}) {
    const {dayPart, rows} = careRows({entries, now, run, sleepRun});
    const [feed, sleep, diaper] = rows, done = complete === true;
    return {
      // `rank` is the ratio order at the tap, as before; the screen shows the Home order (`order`, plan 2026-11-20 M1).
      ageDays: Number.isInteger(ageDays) && ageDays >= 0 ? ageDays : null, dayPart, complete: done, rank: done ? rankOf(rows) : [], order: 'home',
      log: {
        feed: {sinceMin: feed.sinceMin, usualMin: feed.usualMin, gaps: feed.gaps, lastKind: feed.lastKind, lastAmountMl: feed.lastAmountMl, running: feed.running},
        sleep: {awakeMin: sleep.sinceMin, usualMin: sleep.usualMin, gaps: sleep.gaps, running: sleep.running},
        diaper: {sinceMin: diaper.sinceMin, usualMin: diaper.usualMin, gaps: diaper.gaps, lastKind: diaper.lastKind},
      },
    };
  }

  const isoOf = ms => new Date(ms).toISOString().slice(0, 10);
  const dayMs = iso => /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? Date.parse(`${iso}T00:00:00Z`) : NaN;
  function missingDays(held, todayISO) {
    const today = dayMs(todayISO), out = [];
    if (!finite(today)) return out;
    for (let back = 7; back >= 2; back--) { const day = isoOf(today - back * DAY * 60000); if (!held || !held.has(day)) out.push(day); }
    return out;
  }
  const isComplete = (held, todayISO) => finite(dayMs(todayISO)) && missingDays(held, todayISO).length === 0;
  function ageDaysOf(birthISO, todayISO) {
    const days = Math.round((dayMs(todayISO) - dayMs(birthISO)) / (DAY * 60000));
    return finite(days) && days >= 0 ? days : null;
  }

  // ---- The queue of one tap ----

  // The header x-cry-capture, exactly the keys the server takes (commit ae3f49e): startMs (integer 0 to 15000), mode ('homescreen' | 'browser'),
  // ua (printable ASCII, at most 160), contextRate, echoCancellation, noiseSuppression, autoGainControl, channelCount, sampleRate (a value the
  // phone does not report is null) and supported (exactly 5 booleans). It comes from the settled value of the recording: {startMs, capture}.
  const FLAGS = ['echoCancellation', 'noiseSuppression', 'autoGainControl'], SUPPORTED = [...FLAGS, 'channelCount', 'sampleRate'];
  const ENDS = ['full', 'left', 'row', 'ended'];
  const rated = v => (finite(v) && v >= 1 && v <= 400000 ? v : null);
  function captureHeader(result) {
    const c = (result && result.capture) || {};
    const out = {startMs: Math.min(15000, Math.max(0, Math.round(finite(result && result.startMs) ? result.startMs : 0)))};
    out.mode = c.mode === 'homescreen' ? 'homescreen' : 'browser';
    out.ua = String(c.ua || '').replace(/[^\x20-\x7e]/g, '').slice(0, 160);
    out.contextRate = rated(c.contextRate);
    for (const key of FLAGS) out[key] = typeof c[key] === 'boolean' ? c[key] : null;
    out.channelCount = finite(c.channelCount) && c.channelCount >= 1 && c.channelCount <= 32 ? Math.round(c.channelCount) : null;
    out.sampleRate = rated(c.sampleRate);
    out.supported = Object.fromEntries(SUPPORTED.map(key => [key, !!(c.supported && c.supported[key] === true)]));
    // What ended the clip (plan 2026-11-20 M5). A value that is not known is left out; the server accepts a header without it.
    if (result && ENDS.includes(result.end)) out.end = result.end;
    return JSON.stringify(out);
  }

  // How a reply is read: 'ok', 'retry' (network or 5xx), 'gone' (410) or 'final' (any other). For a clip, 409 'has a clip' is 'ok'.
  function judge(reply, forClip) {
    const status = reply && reply.status;
    if (!finite(status)) return 'retry';
    if (status >= 200 && status < 300) return 'ok';
    if (forClip && status === 409) return 'ok';
    if (status === 410) return 'gone';
    return status >= 500 ? 'retry' : 'final';
  }

  function createQueue(options) {
    const o = {
      retryMs: [2000, 5000, 15000], onState() {}, now: Date.now, tappedAt: null, replyWaitMs: 5000,
      timer: {set: (fn, ms) => setTimeout(fn, ms), clear: handle => clearTimeout(handle)}, ...options,
    };
    const q = {stopped: false, started: false, created: false, clipUsed: false, waiting: null, handle: null, last: {state: null, detail: {}}};
    const emit = (state, detail = {}) => { q.last = {state, detail}; o.onState(state, detail); };
    const live = () => !q.stopped;

    // One request with its retries. `done(outcome, reply)` runs once: 'ok', 'gone', 'final' or 'out' (the retries ran out).
    function attempt(kind, call, done, n = 0) {
      if (!live()) return;
      emit(kind === 'create' ? 'creating' : 'clip-sending', {attempt: n});
      const next = reply => {
        if (!live()) return;
        const outcome = judge(reply, kind === 'clip');
        if (outcome !== 'retry') return done(outcome, reply);
        if (n >= o.retryMs.length) return done('out', reply);
        emit(kind === 'create' ? 'create-retry' : 'clip-retry', {attempt: n + 1, inMs: o.retryMs[n]});
        q.handle = o.timer.set(() => { q.handle = null; attempt(kind, call, done, n + 1); }, o.retryMs[n]);
      };
      Promise.resolve().then(() => (live() ? call() : null)).then(next, () => next(null));
    }

    function created(reply, manual) {
      q.created = true;
      const sound = !!(reply && reply.body && reply.body.sound === true);
      const inTime = o.tappedAt === null || o.now() - o.tappedAt <= o.replyWaitMs;
      emit('created', {sound, openMic: sound && inTime && !manual, manual});
      if (q.waiting) { const result = q.waiting; q.waiting = null; upload(result); }
    }

    function createDone(manual) {
      return (outcome, reply) => {
        if (outcome === 'ok') return created(reply, manual);
        if (outcome === 'gone') return q.stop('cry-deleted');
        const status = reply ? reply.status : undefined;
        // A manual Try again saves the cry with no clip, so a clip that waited is dropped.
        q.waiting = null; q.clipUsed = true;
        emit('not-saved', {canRetry: outcome === 'out', reason: outcome === 'out' ? 'network' : 'refused', status});
      };
    }

    function upload(result) {
      if (!live() || q.clipUsed) return;
      q.clipUsed = true;
      const header = captureHeader(result);
      attempt('clip', () => o.clip(o.body.id, result.wav, header), (outcome, reply) => {
        if (outcome === 'ok') return emit('clip-saved', {already: !!(reply && reply.status === 409)});
        if (outcome === 'gone') return q.stop('cry-deleted');
        emit('no-clip', {reason: outcome === 'out' ? 'network' : 'refused', status: reply ? reply.status : undefined});
      });
    }

    q.start = () => {
      if (q.started || !live()) return;
      q.started = true;
      attempt('create', () => o.create(o.body), createDone(false));
    };
    q.tryAgain = () => {
      if (!live() || q.created || q.last.state !== 'not-saved' || !q.last.detail.canRetry) return;
      attempt('create', () => o.create({...o.body, sound: false}), createDone(true));
    };
    // A cry that was not saved takes no clip: a late recorder result must not hide "Try again", which saves the cry with no clip.
    const unsaved = () => !q.created && q.last.state === 'not-saved';
    q.clipReady = result => {
      if (!live() || q.clipUsed || unsaved()) return;
      if (!result || result.ok !== true || !result.wav) return q.noClip((result && result.reason) || 'recording');
      if (q.created) upload(result); else q.waiting = result;
    };
    q.noClip = reason => { if (live() && !unsaved()) { q.clipUsed = true; emit('no-clip', {reason}); } };
    q.stop = reason => {
      if (q.stopped) return;
      q.stopped = true;
      if (q.handle !== null) o.timer.clear(q.handle);
      q.handle = null; q.waiting = null;
      emit('stopped', {reason});
    };
    q.current = () => q.last;
    return q;
  }

  return {careRows, order, rankOf, aboutUsual, median, snapshot, missingDays, isComplete, ageDaysOf, captureHeader, createQueue};
})();
