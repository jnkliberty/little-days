import test from 'node:test';
import assert from 'node:assert/strict';

// The logic file of the Crying button. It sets globalThis.LittleDaysCryLog and touches no browser object.
// Invented records only. Time is in minutes: minute 0 is today at midnight, a day is 1440 (the axis of S.entries).
import {captureOf} from '../server/cries.ts';   // the server's own header check, so the two sides cannot drift
await import('../web/cry.js');
const {careRows, order, rankOf, aboutUsual, median, snapshot, missingDays, isComplete, ageDaysOf, captureHeader, createQueue} = (globalThis as any).LittleDaysCryLog;

type Entry = Record<string, any>;
const DAYS = [-6, -5, -4, -3, -2, -1, 0];
// The same times on each of the days -6..0. careRows ignores a record after `now`, so today's later times fall away.
const daily = (type: string, times: number[], extra: Entry = {}, days = DAYS): Entry[] => days.flatMap(d => times.map(t => ({type, t: d * 1440 + t, ...extra})));
const row = (rows: Entry[], type: string) => rows.find(r => r.type === type)!;
const TWO_HOURS = [480, 600, 720, 840, 960];   // 8 AM to 4 PM, every 2 hours

// ---- the usual gap ----

// Failure case: a night gap counted in the day usual (or the reverse), so a parent reads a wrong "over" at night.
test('the usual gap is the median of the gaps that end in the same part of the day', () => {
  // Each day: 3 AM, then 8 AM to 6 PM every 2 h, then 10 PM. Day gaps: 5 x 120 and 300 (3 AM to 8 AM ends in the day). Night gaps: 240 and 300.
  const entries = daily('feed', [180, 480, 600, 720, 840, 960, 1080, 1320]);
  const noon = careRows({entries, now: 12 * 60}), late = careRows({entries, now: 23 * 60 + 30});
  assert.equal(noon.dayPart, 'day');
  assert.equal(row(noon.rows, 'feed').usualMin, 120);
  assert.equal(row(noon.rows, 'feed').gaps, 39, '6 days x 6 gaps, and 3 gaps of today; the 3 AM to 8 AM gap ends in the day and counts there');
  assert.equal(late.dayPart, 'night');
  assert.equal(row(late.rows, 'feed').usualMin, 240);
  assert.equal(row(late.rows, 'feed').gaps, 13, '7 gaps of 240 and 6 gaps of 300');
});

// Failure case: a median from 4 gaps saved as the usual, so a parent compares with a number that rests on almost nothing.
test('under 5 gaps there is no usual, and 5 gaps give one', () => {
  const feeds = (n: number) => Array.from({length: n}, (_, i) => ({type: 'feed', t: 480 + i * 60}));
  const four = careRows({entries: feeds(5), now: 800}), five = careRows({entries: feeds(6), now: 800});
  assert.equal(row(four.rows, 'feed').gaps, 4);
  assert.equal(row(four.rows, 'feed').usualMin, null);
  assert.equal(row(four.rows, 'feed').state, 'noUsual');
  assert.equal(row(five.rows, 'feed').gaps, 5);
  assert.equal(row(five.rows, 'feed').usualMin, 60);
  assert.equal(median([1, 2, 3, 4]), null);
  assert.equal(median([100, 110, 130, 150, 90, 120]), 115, 'an even count takes the middle of the two middle gaps');
});

// Failure case: a gap with one record older than 7 days counts as if both were inside, so the usual rests on 8 days.
test('a gap counts only when both of its records are inside the 7 days', () => {
  // now = 720, so the window starts at -9360. The record at -9400 is outside; the 5 records from -9300 give 4 gaps.
  const entries = [-9400, -9300, -9240, -9180, -9120, -9060].map(t => ({type: 'feed', t}));
  const feed = row(careRows({entries, now: 720}).rows, 'feed');
  assert.equal(feed.gaps, 4, 'the gap from the record outside the window does not count');
  assert.equal(feed.usualMin, null);
});

// Failure case: the usual is read from the sleep start, or a sleep gap counts the sleep itself, so "Awake" shows a wrong time.
test('the awake gap runs from the end of one sleep to the start of the next', () => {
  const entries = daily('sleep', [780], {dur: 60});   // a nap 1 PM to 2 PM every day
  const sleep = row(careRows({entries, now: 900}).rows, 'sleep');
  assert.equal(sleep.sinceMin, 900 - 840, 'awake since the end of the nap');
  assert.equal(sleep.usualMin, 1380, '24 h minus the 60 min nap');
  // A sleep that ends at tEnd (a clock change) counts its tEnd, not t + dur.
  const shifted = row(careRows({entries: [{type: 'sleep', t: 600, dur: 60, tEnd: 720}], now: 800}).rows, 'sleep');
  assert.equal(shifted.sinceMin, 80);
});

test('a diaper gap runs from one change to the next and keeps the kind of the last change', () => {
  const entries = daily('diaper', [480, 660, 840, 1020], {kind: 'W'});
  entries.find((e: Entry) => e.t === 840)!.kind = 'D';   // today's 2 PM change
  const diaper = row(careRows({entries, now: 990}).rows, 'diaper');
  assert.equal(diaper.usualMin, 180);
  assert.equal(diaper.sinceMin, 990 - 840);
  assert.equal(diaper.lastKind, 'dirty');
  assert.equal(row(careRows({entries: [{type: 'diaper', t: 600, kind: 'B'}], now: 700}).rows, 'diaper').lastKind, 'both');
});

// Failure case: the part of the day flips at the wrong minute, so a 7 AM gap is read against the night usual.
test('the day runs from 7 AM to 7 PM', () => {
  const part = (now: number) => careRows({entries: [], now}).dayPart;
  assert.deepEqual([419, 420, 1139, 1140, 1].map(part), ['night', 'day', 'day', 'night', 'night']);
  assert.equal(part(-1440 + 600), 'day', 'a minute of a past day uses the same clock');
});

// ---- running timers ----

// Failure case: a running timer is read as "time since the last feed" and shows a wrong "over".
test('a running feed or sleep timer has no since and no ratio and comes last', () => {
  const entries = [...daily('feed', TWO_HOURS), ...daily('sleep', [780], {dur: 60}), ...daily('diaper', [480, 660, 840, 1020])];
  const {rows} = careRows({entries, now: 1000, run: {t0: 990}, sleepRun: {t0: 995}});
  const feed = row(rows, 'feed'), sleep = row(rows, 'sleep');
  assert.deepEqual([feed.state, sleep.state], ['running', 'running']);
  assert.deepEqual([feed.sinceMin, feed.ratio, sleep.sinceMin, sleep.ratio], [null, null, null, null]);
  assert.equal(feed.usualMin, 120, 'the usual stays known');
  assert.deepEqual(rankOf(rows), ['diaper', 'feed', 'sleep']);
  const snap = snapshot({entries, now: 1000, run: {t0: 990}, sleepRun: {t0: 995}, complete: true, ageDays: 40});
  assert.equal(snap.log.feed.running, true);
  assert.equal(snap.log.feed.sinceMin, null);
  assert.equal(snap.log.sleep.running, true);
  assert.equal(snap.log.sleep.awakeMin, null);
});

// ---- order and the 10 percent rule ----

// Failure case: the rows keep the Home order, so the care type furthest past her usual does not come first.
test('the rows go by ratio, largest first; no usual last; equal rows keep their place', () => {
  const entries = [...daily('feed', TWO_HOURS), ...daily('sleep', [780], {dur: 60}), ...daily('diaper', [480, 660, 840, 1020])];
  const {rows} = careRows({entries, now: 990});
  assert.equal(row(rows, 'feed').sinceMin, 30);
  assert.equal(row(rows, 'diaper').sinceMin, 150);
  assert.deepEqual(order(rows).map((r: Entry) => r.type), ['diaper', 'feed', 'sleep'], 'diaper 150 of 180, feed 30 of 120, sleep 150 of 1380');
  assert.deepEqual(rankOf(rows), ['diaper', 'feed', 'sleep']);
  assert.deepEqual(rows.map((r: Entry) => r.type), ['feed', 'sleep', 'diaper'], 'the input array is not reordered');
  const synthetic = [{type: 'feed', ratio: null}, {type: 'sleep', ratio: 1}, {type: 'diaper', ratio: 1}];
  assert.deepEqual(order(synthetic).map((r: Entry) => r.type), ['sleep', 'diaper', 'feed'], 'a tie keeps the input order, no ratio last');
  assert.deepEqual(rankOf(careRows({entries: [], now: 700}).rows), ['feed', 'sleep', 'diaper'], 'with no records the order is the Home order');
});

// Failure case: the screen shows the rows in the ratio order again (plan 2026-11-20 M1), so the top row steers the action,
// or the fixed order also changes the stored `rank`. Gap: the test above checks the ratio order only, not what the screen shows.
test('the rows come in the Home order for each ratio order, and rank keeps the ratio order', () => {
  const now = 900, PAST = [-6, -5, -4, -3, -2, -1], HOURS = [480, 540, 600, 660, 720];
  const perms = [['feed', 'sleep', 'diaper'], ['feed', 'diaper', 'sleep'], ['sleep', 'feed', 'diaper'], ['sleep', 'diaper', 'feed'], ['diaper', 'feed', 'sleep'], ['diaper', 'sleep', 'feed']];
  for (const perm of perms) {
    // Usual gaps: feed 60, awake 30, diaper 60. Today's last record of each type sets its ratio: 3, 2 and 1.5 in the order of `perm`.
    const ratio: Record<string, number> = {[perm[0]]: 3, [perm[1]]: 2, [perm[2]]: 1.5};
    const entries: Entry[] = [
      ...daily('feed', HOURS, {}, PAST), ...daily('sleep', HOURS, {dur: 30}, PAST), ...daily('diaper', HOURS, {kind: 'W'}, PAST),
      {type: 'feed', t: now - 60 * ratio.feed}, {type: 'sleep', t: now - 30 * ratio.sleep - 30, dur: 30}, {type: 'diaper', t: now - 60 * ratio.diaper, kind: 'W'},
    ];
    const {rows} = careRows({entries, now});
    assert.deepEqual(rows.map((r: Entry) => r.type), ['feed', 'sleep', 'diaper'], `the shown order for ratio order ${perm}`);
    assert.deepEqual(rankOf(rows), perm, `rank for ${perm}`);
    const snap = snapshot({entries, now, complete: true, ageDays: 60});
    assert.deepEqual([snap.rank, snap.order], [perm, 'home']);
  }
});

// Failure case: 2 min off the usual shows "over" or "under" and a parent worries over a normal gap.
test('inside 10 percent of the usual the row is about usual', () => {
  assert.equal(aboutUsual(108, 120), true, 'exactly 10 percent under is inside');
  assert.equal(aboutUsual(132, 120), true, 'exactly 10 percent over is inside');
  assert.equal(aboutUsual(107, 120), false);
  assert.equal(aboutUsual(133, 120), false);
  assert.equal(aboutUsual(null, 120), false);
  assert.equal(aboutUsual(50, null), false);
  const entries = daily('feed', TWO_HOURS);
  const at = (now: number) => row(careRows({entries, now}).rows, 'feed');
  assert.deepEqual([at(1080).state, at(1080).diffMin], ['about', 0]);
  assert.deepEqual([at(1110).state, at(1110).diffMin], ['over', 30], 'the caption reads "30 min over"');
  assert.deepEqual([at(990).state, at(990).diffMin], ['under', -90]);
});

// ---- the feed session ----

// Failure case: each part of one feed counts as a feed, so the gaps are 10 min long and the usual is wrong.
test('a feed with a change of side is one feed that starts at its first part', () => {
  const entries = DAYS.flatMap(d => TWO_HOURS.flatMap(t => [
    {type: 'feed', sid: `s${d}-${t}`, side: 'L', t: d * 1440 + t, dur: 10}, {type: 'feed', sid: `s${d}-${t}`, side: 'R', t: d * 1440 + t + 10, dur: 10},
  ]));
  const feed = row(careRows({entries, now: 990}).rows, 'feed');
  assert.equal(feed.usualMin, 120);
  assert.equal(feed.sinceMin, 30, 'from the start of the last feed (960), not from its last part (970)');
  assert.equal(feed.lastKind, 'breast');
});

test('a feed with breast then bottle is one feed with its amount', () => {
  const entries = [
    {type: 'feed', sid: 'x', side: 'L', t: 600, dur: 10}, {type: 'bottle', sid: 'x', t: 612, dur: 5, ml: 60}, {type: 'bottle', sid: 'x', t: 620, dur: 5, ml: 30},
  ];
  const feed = row(careRows({entries, now: 700}).rows, 'feed');
  assert.equal(feed.sinceMin, 100);
  assert.deepEqual([feed.lastKind, feed.lastAmountMl], ['mixed', 90]);
  const bottle = row(careRows({entries: [{type: 'bottle', t: 600, ml: 120}], now: 700}).rows, 'feed');
  assert.deepEqual([bottle.lastKind, bottle.lastAmountMl], ['bottle', 120]);
});

// Failure case: older feeds with no session id merge into one feed, so a day of feeds shows as one gap.
test('older feeds with no session id are one feed each', () => {
  const alone = [{type: 'feed', id: 11, t: 600}, {type: 'feed', id: 12, t: 610}, {type: 'feed', id: 13, t: 620}, {type: 'feed', id: 14, t: 625}];
  assert.equal(row(careRows({entries: alone, now: 700}).rows, 'feed').sinceMin, 75, 'the newest of four separate feeds');
  assert.equal(row(careRows({entries: alone, now: 700}).rows, 'feed').gaps, 3, 'four feeds, three gaps, under 5 so no usual');
  const sixty = Array.from({length: 6}, (_, i) => ({type: 'feed', t: 480 + i * 60}));
  assert.equal(row(careRows({entries: sixty, now: 800}).rows, 'feed').usualMin, 60, 'no id and no sid: six feeds, five gaps');
  const joined = [{type: 'feed', sid: 'one', t: 600}, {type: 'feed', sid: 'one', t: 610}];
  assert.equal(row(careRows({entries: joined, now: 700}).rows, 'feed').sinceMin, 100, 'the same sid is one feed');
});

// ---- no last event ----

// Failure case: a care type with no record shows "0 min" or breaks the snapshot, instead of an empty value.
test('a care type with no record has no since, and the snapshot holds null', () => {
  const entries = [{type: 'feed', t: 600}];
  const {rows} = careRows({entries, now: 700});
  assert.deepEqual([row(rows, 'sleep').sinceMin, row(rows, 'sleep').state, row(rows, 'diaper').sinceMin, row(rows, 'diaper').ratio], [null, 'empty', null, null]);
  const snap = snapshot({entries, now: 700, complete: true, ageDays: null});
  assert.deepEqual(snap.log.sleep, {awakeMin: null, usualMin: null, gaps: 0, running: false});
  assert.deepEqual(snap.log.diaper, {sinceMin: null, usualMin: null, gaps: 0, lastKind: null});
  assert.equal(snap.ageDays, null);
  assert.deepEqual(snap.log.feed, {sinceMin: 100, usualMin: null, gaps: 0, lastKind: 'breast', lastAmountMl: null, running: false});
});

// ---- the snapshot ----

// Failure case: a median from 2 days is saved as the usual of 7 days, with a row order that the parent never saw in full.
test('a snapshot with days missing says complete false and holds no row order', () => {
  const twoDays = daily('feed', [360, 480, 600, 720, 840, 960, 1080, 1200], {}, [-1, 0]);
  const today = '2026-11-20', held = new Set(['2026-11-19', today]);
  assert.equal(isComplete(held, today), false);
  assert.deepEqual(missingDays(held, today), ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
  const partial = snapshot({entries: twoDays, now: 1000, complete: isComplete(held, today), ageDays: 12});
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.rank, []);
  assert.equal(partial.log.feed.usualMin, 120, 'the log holds what the memory held');
  assert.equal(snapshot({entries: twoDays, now: 1000, ageDays: 12}).complete, false, 'no value means not complete');
  const all = new Set(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
  assert.equal(isComplete(all, today), true, 'yesterday and today come with the normal load');
  assert.deepEqual(missingDays(new Set([...all].filter(d => d !== '2026-11-15')), today), ['2026-11-15']);
  const full = snapshot({entries: twoDays, now: 1000, complete: true, ageDays: 12});
  assert.deepEqual(full.rank, ['feed', 'sleep', 'diaper']);
  assert.equal(ageDaysOf('2026-11-08', today), 12);
  assert.equal(ageDaysOf('2026-12-01', today), null);
  assert.equal(ageDaysOf('nope', today), null);
});

// Failure case: the saved snapshot follows the live records, so a record that arrives after the tap changes what the cry stored.
test('a snapshot does not change when records arrive after the tap', () => {
  const entries: Entry[] = daily('feed', TWO_HOURS);
  const snap = snapshot({entries, now: 990, complete: true, ageDays: 30});
  const frozen = JSON.stringify(snap);
  entries.push({type: 'feed', t: 985});
  entries.push({type: 'diaper', t: 980, kind: 'W'});
  entries[entries.length - 3].t = 0;
  assert.equal(JSON.stringify(snap), frozen);
  assert.notEqual(JSON.stringify(snapshot({entries, now: 990, complete: true, ageDays: 30})), frozen, 'a new snapshot does see them');
});

// Failure case: the body does not match what POST /api/cries accepts, so every cry is refused with a 400.
test('the snapshot has the exact fields of the server', () => {
  const snap = snapshot({entries: [], now: 700, complete: true, ageDays: 5});
  assert.deepEqual(Object.keys(snap).sort(), ['ageDays', 'complete', 'dayPart', 'log', 'order', 'rank']);
  assert.deepEqual(Object.keys(snap.log.feed).sort(), ['gaps', 'lastAmountMl', 'lastKind', 'running', 'sinceMin', 'usualMin']);
  assert.deepEqual(Object.keys(snap.log.sleep).sort(), ['awakeMin', 'gaps', 'running', 'usualMin']);
  assert.deepEqual(Object.keys(snap.log.diaper).sort(), ['gaps', 'lastKind', 'sinceMin', 'usualMin']);
});

// The keys that the server takes in x-cry-capture (runtime/server/cries.ts, commit ae3f49e).
const HEADER_KEYS = ['autoGainControl', 'channelCount', 'contextRate', 'echoCancellation', 'mode', 'noiseSuppression', 'sampleRate', 'startMs', 'supported', 'ua'];

// Failure case: the clip upload is refused with a 400 because the header holds a key or a value that the server does not accept.
test('the capture header holds only what the server accepts', () => {
  const result = {startMs: 420.4, capture: {mode: 'homescreen', ua: 'Mozilla/5.0 (iPhone) é'.padEnd(200, 'x'), contextRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: true,
    channelCount: 1, sampleRate: 48000.2, supported: {echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: true, sampleRate: true}}};
  const header = captureHeader(result), parsed = JSON.parse(header);
  assert.deepEqual(Object.keys(parsed).sort(), HEADER_KEYS);
  assert.deepEqual(Object.keys(parsed.supported).sort(), ['autoGainControl', 'channelCount', 'echoCancellation', 'noiseSuppression', 'sampleRate'], 'exactly 5 booleans');
  assert.ok(Object.values(parsed.supported).every(v => typeof v === 'boolean'));
  assert.equal(parsed.startMs, 420);
  assert.equal(parsed.mode, 'homescreen');
  assert.equal(parsed.sampleRate, 48000.2, 'a rate is not rounded');
  assert.match(parsed.ua, /^[\x20-\x7e]{0,160}$/);
  assert.equal(parsed.ua.length, 160);
  assert.ok(header.length <= 1024);
  const bare = JSON.parse(captureHeader({startMs: 99999, capture: {}}));
  assert.deepEqual(Object.keys(bare).sort(), HEADER_KEYS, 'every key is there even with nothing reported');
  assert.deepEqual([bare.startMs, bare.echoCancellation, bare.contextRate, bare.ua, bare.mode], [15000, null, null, '', 'browser']);
});

// Failure case: the clip end cause (plan 2026-11-20 M5) is lost on the way, or a word the server does not know gets every clip a 400.
// Gap: the header tests above never carry `end`.
test('the capture header carries a known end word, and leaves out one that is not known', () => {
  for (const end of ['full', 'left', 'row', 'ended']) {
    const header = captureHeader({startMs: 300, end, capture: {}});
    assert.deepEqual(Object.keys(JSON.parse(header)).sort(), [...HEADER_KEYS, 'end'].sort(), end);
    assert.equal(captureOf(header).end, end, `the server takes ${end}`);
  }
  const odd = JSON.parse(captureHeader({startMs: 300, end: 'stopped', capture: {}}));
  assert.ok(!('end' in odd), 'a word that is not known is left out');
  assert.equal(captureOf(JSON.stringify(odd)).end, null);
});

// Failure case: the two sides drift apart again (a key renamed on one side) and every clip gets a 400 that no test on either side sees.
test('the server validator accepts the header of captureHeader and refuses the old shape', () => {
  const full = {startMs: 420, capture: {mode: 'homescreen', ua: 'Mozilla/5.0 (iPhone)', contextRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: true,
    channelCount: 1, sampleRate: 48000, supported: {echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: true, sampleRate: false}}};
  const nulls = {startMs: 0, capture: {mode: 'browser', ua: null, contextRate: null, echoCancellation: null, noiseSuppression: null, autoGainControl: null, channelCount: null, sampleRate: null, supported: {}}};
  for (const [name, result] of [['full', full], ['every value null', nulls], ['missing', {startMs: 5, capture: {}}], ['nothing at all', {}], ['long ua', {startMs: 15000, capture: {ua: 'é'.repeat(300) + 'x'.repeat(300)}}]] as const) {
    const accepted = captureOf(captureHeader(result));
    assert.equal(typeof accepted.startMs, 'number', name);
  }
  assert.equal(captureOf(captureHeader(full)).capture.supported.sampleRate, false);
  assert.equal(captureOf(captureHeader(full)).capture.contextRate, 48000);
  assert.throws(() => captureOf(JSON.stringify({startMs: 1, settings: {}, supported: {}, browser: 'Safari', standalone: false})), /capture settings/, 'the old shape is refused');
});

// ---- the queue of one tap ----

const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const BODY = {id: ID, occurredAt: '2026-11-20T10:00:00.000Z', snapshot: {}, sound: true};
const WAV = new Uint8Array([1, 2, 3]);
const GOOD_CLIP = {ok: true, wav: WAV, startMs: 300, capture: {mode: 'browser', ua: 'Safari'}};
const tick = () => new Promise(resolve => setImmediate(resolve));

// A scripted request function: each call takes the next item. A number is a status, 'net' is a network failure.
function script(items: Array<number | 'net'>, log: Entry[], name: string, body: Entry = {}) {
  let n = 0;
  return (...args: any[]) => {
    log.push({name, args});
    const item = items[Math.min(n++, items.length - 1)];
    return item === 'net' ? Promise.reject(new Error('offline')) : Promise.resolve({status: item, body});
  };
}

function rig(createItems: Array<number | 'net'>, clipItems: Array<number | 'net'> = [200], more: Entry = {}) {
  const log: Entry[] = [], states: Array<[string, Entry]> = [], timers: Array<{fn: () => void; ms: number; cleared: boolean}> = [];
  const timer = {set: (fn: () => void, ms: number) => { timers.push({fn, ms, cleared: false}); return timers.length - 1; }, clear: (handle: number) => { timers[handle].cleared = true; }};
  const q = createQueue({
    body: BODY, timer, onState: (state: string, detail: Entry) => states.push([state, detail]),
    create: script(createItems, log, 'create', {id: ID, clipState: 'none', sound: true}), clip: script(clipItems, log, 'clip'), ...more,
  });
  // Fires the next pending timer, as the clock would.
  const fire = async () => { const next = timers.find(t => !t.cleared && !(t as any).fired); assert.ok(next, 'a timer is waiting'); (next as any).fired = true; next.fn(); await tick(); };
  const pending = () => timers.filter(t => !t.cleared && !(t as any).fired).length;
  return {q, log, states, timers, fire, pending, names: () => states.map(s => s[0]), calls: () => log.map(c => c.name)};
}

// Failure case: the clip goes up before the cry is saved, and the server refuses it for a cry that it does not hold.
test('the queue sends the create request first and the clip after it', async () => {
  const r = rig([200], [200]);
  r.q.start();
  r.q.clipReady(GOOD_CLIP);   // the clip is ready before the reply: it waits
  await tick();
  assert.deepEqual(r.names(), ['creating', 'created', 'clip-sending', 'clip-saved']);
  assert.deepEqual(r.calls(), ['create', 'clip']);
  assert.equal(r.states[1][1].sound, true);
  assert.equal(r.log[1].args[0], ID);
  assert.deepEqual(JSON.parse(r.log[1].args[2]).startMs, 300);
  r.q.start();
  await tick();
  assert.deepEqual(r.calls(), ['create', 'clip'], 'a second start sends nothing');
});

// Failure case: a retry comes at the wrong time or runs a 5th time, so the phone floods a gateway that is down, or gives up too soon.
test('a create request is tried again after 2 s, 5 s and 15 s, and then not saved yet shows Try again', async () => {
  const r = rig(['net', 503, 'net', 502]);
  r.q.start();
  await tick();
  assert.deepEqual(r.timers.map(t => t.ms), [2000]);
  await r.fire();
  assert.deepEqual(r.timers.map(t => t.ms), [2000, 5000]);
  await r.fire();
  assert.deepEqual(r.timers.map(t => t.ms), [2000, 5000, 15000]);
  await r.fire();
  assert.equal(r.calls().length, 4, 'one request and 3 tries');
  assert.equal(r.pending(), 0);
  assert.deepEqual(r.q.current(), {state: 'not-saved', detail: {canRetry: true, reason: 'network', status: 502}});
  assert.deepEqual(r.states.filter(s => s[0] === 'create-retry').map(s => s[1].inMs), [2000, 5000, 15000]);
});

// Failure case: a 4xx is tried again, or its strip offers a button that cannot work, so the parent taps in vain.
test('a 4xx reply to the create request is final', async () => {
  const r = rig([400]);
  r.q.start();
  await tick();
  assert.equal(r.calls().length, 1);
  assert.equal(r.pending(), 0);
  assert.deepEqual(r.q.current(), {state: 'not-saved', detail: {canRetry: false, reason: 'refused', status: 400}});
  r.q.tryAgain();
  await tick();
  assert.equal(r.calls().length, 1, 'no button, no new request');
});

// Failure case: Try again opens the microphone for a cry whose sound choice may have changed, so a clip records against the choice.
test('Try again sends the same id with no sound and opens no microphone', async () => {
  const r = rig(['net', 'net', 'net', 'net', 200]);
  r.q.start();
  await tick();
  for (let i = 0; i < 3; i++) await r.fire();
  assert.equal(r.q.current().state, 'not-saved');
  r.q.tryAgain();
  await tick();
  assert.equal(r.calls().length, 5);
  assert.deepEqual(r.log[4].args[0], {...BODY, sound: false}, 'the same id, sound false');
  assert.deepEqual(r.q.current().detail, {sound: true, openMic: false, manual: true}, 'the reply says sound on, and the queue still opens no microphone');
});

// Failure case: a create reply that comes 6 s after the tap opens the microphone, so a clip starts long after its tap.
test('the microphone opens only for a reply that says sound on and comes inside 5 s', async () => {
  const at = async (elapsed: number, sound: boolean) => {
    let seen: Entry = {};
    const q = createQueue({
      body: BODY, tappedAt: 1000, now: () => 1000 + elapsed, create: () => Promise.resolve({status: 200, body: {id: ID, clipState: 'none', sound}}),
      clip: () => Promise.resolve({status: 200}), onState: (state: string, detail: Entry) => { if (state === 'created') seen = detail; },
    });
    q.start();
    await tick();
    return seen;
  };
  assert.equal((await at(4999, true)).openMic, true);
  assert.equal((await at(5000, true)).openMic, true);
  assert.equal((await at(5001, true)).openMic, false, 'late');
  assert.equal((await at(100, false)).openMic, false, 'the server says sound off');
  assert.equal((await at(100, false)).sound, false);
});

// Failure case: a clip that the server already holds is shown as an error, so the parent sees "No clip saved" for a clip that is saved.
test('409 on the clip counts as saved, a 4xx is final and a network failure is tried 3 times', async () => {
  const saved = rig([200], [409]);
  saved.q.start(); saved.q.clipReady(GOOD_CLIP);
  await tick();
  assert.deepEqual(saved.q.current(), {state: 'clip-saved', detail: {already: true}});
  assert.equal(saved.calls().length, 2);

  const refused = rig([200], [400]);
  refused.q.start(); refused.q.clipReady(GOOD_CLIP);
  await tick();
  assert.deepEqual(refused.q.current(), {state: 'no-clip', detail: {reason: 'refused', status: 400}});
  assert.equal(refused.calls().length, 2, 'a 400 is not sent again');
  assert.equal(refused.pending(), 0);

  const offline = rig([200], ['net']);
  offline.q.start(); offline.q.clipReady(GOOD_CLIP);
  await tick();
  assert.deepEqual(offline.timers.map(t => t.ms), [2000]);
  assert.equal(offline.q.current().state, 'clip-retry');
  for (let i = 0; i < 3; i++) await offline.fire();
  assert.equal(offline.calls().filter(c => c === 'clip').length, 4);
  assert.deepEqual(offline.timers.map(t => t.ms), [2000, 5000, 15000]);
  assert.deepEqual(offline.q.current(), {state: 'no-clip', detail: {reason: 'network', status: undefined}});

  const flaky = rig([200], [500, 200]);
  flaky.q.start(); flaky.q.clipReady(GOOD_CLIP);
  await tick(); await flaky.fire();
  assert.equal(flaky.q.current().state, 'clip-saved');
});

// Failure case: the phone keeps sending for a cry that a parent deleted, so the clip comes back after the delete.
test('a deleted cry or clip stops the queue', async () => {
  const gone = rig([410]);
  gone.q.start();
  await tick();
  assert.deepEqual(gone.q.current(), {state: 'stopped', detail: {reason: 'cry-deleted'}}, '410 on the create request');
  assert.equal(gone.calls().length, 1);

  const clip410 = rig([200], [410]);
  clip410.q.start(); clip410.q.clipReady(GOOD_CLIP);
  await tick();
  assert.equal(clip410.q.current().detail.reason, 'cry-deleted', '410 on the clip');

  // A delete on this phone while a clip retry waits: the timer is cleared and nothing more is sent.
  const waiting = rig([200], ['net']);
  waiting.q.start(); waiting.q.clipReady(GOOD_CLIP);
  await tick();
  assert.equal(waiting.pending(), 1);
  waiting.q.stop('clip-deleted');
  assert.equal(waiting.pending(), 0);
  assert.deepEqual(waiting.q.current(), {state: 'stopped', detail: {reason: 'clip-deleted'}});
  assert.equal(waiting.calls().filter(c => c === 'clip').length, 1);

  // A delete while the create request is out: the late reply changes nothing and no clip goes up.
  let release: (reply: Entry) => void = () => {};
  const states: string[] = [], calls: string[] = [];
  const q = createQueue({body: BODY, onState: (s: string) => states.push(s), create: () => new Promise(resolve => { release = resolve; }), clip: () => { calls.push('clip'); return Promise.resolve({status: 200}); }});
  q.start();
  await tick();
  q.stop('cry-deleted');
  release({status: 200, body: {sound: true}});
  q.clipReady(GOOD_CLIP);
  await tick();
  assert.deepEqual(states, ['creating', 'stopped']);
  assert.deepEqual(calls, []);
});

// Failure case: the adult changes and the phone still sends the next try or the clip under the new adult.
test('a change of adult stops the queue, also while a create retry waits', async () => {
  const r = rig(['net']);
  r.q.start();
  await tick();
  assert.equal(r.pending(), 1);
  r.q.stop('adult-changed');
  assert.equal(r.pending(), 0);
  assert.equal(r.calls().length, 1);
  assert.deepEqual(r.q.current().detail, {reason: 'adult-changed'});
  r.q.stop('page-closed');
  assert.deepEqual(r.names().filter(n => n === 'stopped').length, 1, 'stopped is emitted once');
});

// Failure case: a recording that failed leaves the strip on "Starting" for ever, because nothing tells the queue.
test('a recording that gives no clip ends as no clip and sends nothing', async () => {
  const r = rig([200]);
  r.q.start();
  await tick();
  r.q.clipReady({ok: false, reason: 'late-microphone'});
  assert.deepEqual(r.q.current(), {state: 'no-clip', detail: {reason: 'late-microphone'}});
  r.q.clipReady(GOOD_CLIP);
  await tick();
  assert.deepEqual(r.calls(), ['create'], 'a later clip is not sent');
});

// Failure case: the queue sends a header with a key or type that the server refuses, so every clip gets a 400 and "No clip saved".
test('the clip upload carries the capture header with exactly the keys of the server', async () => {
  const r = rig([200], [200]);
  const capture = {mode: 'homescreen', ua: 'Safari', contextRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    channelCount: 1, sampleRate: 48000, supported: {echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: true, sampleRate: true}};
  r.q.start();
  r.q.clipReady({ok: true, wav: WAV, startMs: 812, capture});
  await tick();
  const sent = JSON.parse(r.log[1].args[2]);
  assert.deepEqual(Object.keys(sent).sort(), HEADER_KEYS);
  assert.equal(sent.startMs, 812);
  assert.deepEqual(r.log[1].args[1], WAV, 'the WAV bytes go as the body');
  assert.equal(sent.supported.channelCount, true);
});

// Failure case: a recorder result that arrives after "not saved" replaces the last state, so "Try again" disappears.
test('a recorder result after not-saved changes nothing and Try again still saves the cry', async () => {
  const r = rig(['net', 'net', 'net', 'net', 200]);
  r.q.start();
  await tick();
  for (let i = 0; i < 3; i++) await r.fire();
  assert.equal(r.q.current().state, 'not-saved');
  assert.equal(r.q.current().detail.canRetry, true);
  const before = r.names().length;
  r.q.clipReady(GOOD_CLIP);
  r.q.noClip('hidden');
  await tick();
  assert.equal(r.names().length, before, 'no state is emitted');
  assert.equal(r.q.current().state, 'not-saved');
  r.q.tryAgain();
  await tick();
  assert.equal(r.names().at(-1), 'created');
  assert.deepEqual(r.calls().filter(c => c === 'clip'), [], 'the manual retry saves the cry with no clip');
});

// Failure case: start() then stop() in one turn still sends the create request from the queued microtask.
test('a queue that stops in the same turn as its start sends nothing', async () => {
  const r = rig([200]);
  r.q.start();
  r.q.stop('adult-changed');
  await tick();
  assert.deepEqual(r.calls(), []);
  assert.deepEqual(r.names(), ['creating', 'stopped']);
});

// Failure case: a bottle whose unit is unknown adds its number to the amount as ml.
test('a bottle with a unit that is not ml stays a feed and leaves its amount out', () => {
  const unknown = row(careRows({entries: [{type: 'bottle', t: 600, ml: 90, unit: 'unknown'}], now: 700}).rows, 'feed');
  assert.deepEqual([unknown.sinceMin, unknown.lastKind, unknown.lastAmountMl], [100, 'bottle', null]);
  const ml = row(careRows({entries: [{type: 'bottle', t: 600, ml: 90, unit: 'ml'}], now: 700}).rows, 'feed');
  assert.equal(ml.lastAmountMl, 90);
  const mixed = row(careRows({entries: [{type: 'bottle', sid: 'x', t: 600, ml: 60, unit: 'ml'}, {type: 'bottle', sid: 'x', t: 610, ml: 30, unit: 'oz'}], now: 700}).rows, 'feed');
  assert.equal(mixed.lastAmountMl, 60);
});

// Failure case: a clip that waited during the create retries is uploaded after Try again, though the plan saves that cry with no clip.
test('a clip that waited through failed create tries is dropped, so Try again sends no clip', async () => {
  const r = rig(['net', 'net', 'net', 'net', 200]);
  r.q.start();
  r.q.clipReady(GOOD_CLIP);
  await tick();
  for (let i = 0; i < 3; i++) await r.fire();
  assert.equal(r.q.current().state, 'not-saved');
  r.q.tryAgain();
  await tick();
  assert.equal(r.names().at(-1), 'created');
  assert.deepEqual(r.calls().filter(c => c === 'clip'), []);
});
