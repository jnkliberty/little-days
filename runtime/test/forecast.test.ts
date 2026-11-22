import test from 'node:test';
import assert from 'node:assert/strict';

// The forecast rule (plan 2026-11-21, Group 1; look approved 2026-11-21, round 2). web/forecast.js sets globalThis.LittleDaysForecast
// and reuses the session and gap code of web/cry.js. Invented records only. Minute 0 is today at midnight, a day is 1440.
await import('../web/cry.js');
await import('../web/forecast.js');
const {forecast} = (globalThis as any).LittleDaysForecast;

type Entry = Record<string, any>;
const DAYS = [-7, -6, -5, -4, -3, -2, -1, 0];
let seq = 0;
const feedsAt = (times: number[], days = DAYS): Entry[] => days.flatMap(d => times.map(m => ({id: `f${seq++}`, type: 'feed', t: d * 1440 + m, dur: 15})));
const sleepsAt = (spans: [number, number][], days = DAYS): Entry[] => days.flatMap(d => spans.map(([a, b]) => ({id: `s${seq++}`, type: 'sleep', t: d * 1440 + a, dur: b - a})));
// Day feeds 7:00, 9:30, 12:30, 15:00, 18:00; night feeds 9:00 PM, 1:00 AM, 4:00 AM.
const FEEDS = [60, 240, 420, 570, 750, 900, 1080, 1260];
// Night sleep to 7:00 AM; naps 8:00 to 9:00, 11:00 to 12:00, 2:00 to 3:00 PM, 5:00 to 5:30 PM; night from 7:30 PM.
const SLEEPS: [number, number][] = [[0, 420], [480, 540], [660, 720], [840, 900], [1020, 1050], [1170, 1440]];
const all = (now: number) => ({entries: [...feedsAt(FEEDS), ...sleepsAt(SLEEPS)], now, complete: true, feeds: true, sleep: true});

// An independent copy of the rule, so the test does not read its answer from the code under test.
const q = (values: number[], p: number) => { const s = [...values].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const r5 = (m: number) => Math.round(m / 5) * 5;
const startsIn = (from: number, to: number, list: number[]) => list.filter(t => t >= from && t <= to).sort((a, b) => a - b);
const isDay = (m: number) => { const r = ((m % 1440) + 1440) % 1440; return r >= 420 && r < 1140; };

test('the feed window is the last session start plus the 25th to 75th percentile of the same-period gaps, rounded to 5 minutes', () => {
  const now = 13 * 60 + 40, f = forecast(all(now)).feed;
  const starts = startsIn(now - 7 * 1440, now, DAYS.flatMap(d => FEEDS.map(m => d * 1440 + m)));
  const gaps = starts.slice(1).map((t, i) => [t, t - starts[i]]).filter(([t]) => isDay(t)).map(g => g[1]);
  assert.deepEqual([f.state, f.from, f.to, f.period], ['window', r5(750 + q(gaps, .25)), r5(750 + q(gaps, .75)), 'day']);
});

test('feed parts that share a session id count as one feed, from the first part', () => {
  const now = 13 * 60 + 40, base = all(now);
  const split = base.entries.map(e => e.type === 'feed' && e.t === 750 ? {...e, sid: 'x'} : e);
  split.push({id: 'second-side', type: 'feed', t: 765, dur: 10, sid: 'x'});
  assert.deepEqual(forecast({...base, entries: split}).feed, forecast(base).feed);
  // Without the shared id the second side would be the last feed.
  const loose = [...base.entries, {id: 'loose', type: 'feed', t: 765, dur: 10}];
  assert.notEqual(forecast({...base, entries: loose}).feed.from, forecast(base).feed.from);
});

test('at night the feed window uses the night gaps, and there is no nap forecast', () => {
  const now = 22 * 60, out = forecast(all(now));
  assert.equal(out.feed.period, 'night');
  assert.equal(out.feed.from >= 1260, true);
  assert.equal(out.nap, null);
});

test('the nap window is the last wake time plus the 25th to 75th percentile of the day awake times', () => {
  const now = 13 * 60, n = forecast(all(now)).nap;
  const spans = DAYS.flatMap(d => SLEEPS.map(([a, b]) => [d * 1440 + a, d * 1440 + b])).filter(([, b]) => b <= now).sort((x, y) => x[0] - y[0]);
  const awake = spans.slice(1).map(([a], i) => ({before: spans[i], a, g: a - spans[i][1]}))
    .filter(x => x.before[0] >= now - 7 * 1440 && x.g > 0 && isDay(x.a)).map(x => x.g);
  assert.equal(n.state, 'window');
  assert.equal(n.from, r5(720 + q(awake, .25)));
  assert.equal(n.to, r5(720 + q(awake, .75)));
  // An overlapping record (11:10 to 11:30 inside the 11:00 to 12:00 nap) starts later but ends earlier: the last wake stays 12:00.
  const input = all(now), both = forecast({...input, entries: [...input.entries, {id: 'overlap', type: 'sleep', t: 670, dur: 20}]}).nap;
  assert.deepEqual([both.from, both.to, both.last], [n.from, n.to, 720]);
  // Nested records on every day change no awake gap either (Codex round 3: they moved the window end). Without the merge,
  // 14 of the 120-minute gaps become 160 minutes, and the 75th percentile moves.
  const nested = forecast({...input, entries: [...input.entries, ...sleepsAt([[490, 500], [850, 860]])]}).nap;
  assert.deepEqual([nested.from, nested.to, nested.gaps], [n.from, n.to, n.gaps]);
});

test('a row is left out while that care runs, when the adult may not view it, and until the 7 days are loaded', () => {
  const now = 13 * 60;
  assert.equal(forecast({...all(now), run: {t0: now - 5}}).feed, null);
  assert.equal(forecast({...all(now), sleepRun: {t0: now - 5}}).nap, null);
  assert.notEqual(forecast({...all(now), sleepRun: {t0: now - 5}}).feed, null);
  assert.equal(forecast({...all(now), feeds: false}).feed, null);
  assert.equal(forecast({...all(now), sleep: false}).nap, null);
  assert.deepEqual(forecast({...all(now), complete: false}), {feed: null, nap: null});
});

test('fewer than 8 gaps gives "few", and a window that ended says "passed"', () => {
  const now = 13 * 60, base = all(now);
  const short = base.entries.filter(e => e.t >= 0);     // today only: 3 day gaps
  assert.equal(forecast({...base, entries: short}).feed.state, 'few');
  // Last feed 3:00 PM; at 9:30 PM the night window (about 6:00 to 7:00 PM) has ended with no new feed.
  assert.equal(forecast({...all(21 * 60 + 30), entries: base.entries.filter(e => e.t <= 900)}).feed.state, 'passed');
});

test('records after now are left out, and a window is never empty', () => {
  const now = 13 * 60 + 40, base = all(now);
  assert.deepEqual(forecast({...base, entries: [...base.entries, {id: 'future', type: 'feed', t: now + 30, dur: 10}]}).feed, forecast(base).feed);
  const same = Array.from({length: 12}, (_, i) => ({id: `e${i}`, type: 'feed', t: -1440 + 420 + i * 60, dur: 10}));
  const f = forecast({entries: same, now: -1440 + 420 + 11 * 60 + 5, complete: true, feeds: true, sleep: true}).feed;
  assert.equal(f.state, 'window');
  assert.equal(f.to > f.from, true);
});
