import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/trends.js');
const { summarize, day, rows, totals } = (globalThis as any).LittleDaysTrends;

test('mixed feeds count once while bottle volume and breast duration remain separate', () => {
  const entries = [
    {type:'bottle', sid:'mixed', t:-840, dur:5, ml:60},
    {type:'feed', sid:'mixed', side:'L', t:-835, dur:10},
    {type:'feed', sid:'mixed', side:'R', t:-825, dur:15},
    {type:'bottle', sid:'mixed', t:-810, dur:5, ml:30},
  ];
  const recorded = day(entries, -1);
  assert.equal(recorded.feedCount, 1);
  assert.equal(recorded.bottleMl, 90);
  assert.equal(recorded.feeds[0].dur, 25);
  const summary = summarize(entries, '2026-11-10');
  assert.equal(summary.metrics.feeds.average, 1);
  assert.equal(summary.metrics.bottleMl.average, 90);
  assert.equal(day(entries.slice(0, 2), -1, null, {sid:'mixed', side:'R', t0:-825, dur:2}).feedCount, 1);
});

test('a mixed feed across 7 AM counts on its start day and keeps milk on its recorded day', () => {
  const entries = [{type:'bottle', sid:'mixed', t:410, dur:5, ml:60}, {type:'feed', sid:'mixed', t:415, dur:15, side:'L'}];
  assert.equal(day(entries, -1).feedCount, 1);
  assert.equal(day(entries, 0).feedCount, null);
  assert.equal(day(entries, -1).bottleMl, 60);
  assert.equal(day(entries, 0).bottleMl, null);
  assert.equal(day(entries, -1).feeds[0].dur, 5);
  assert.equal(day(entries, 0).feeds[0].dur, 10);
});

test('R1 C1 running sleep and feed cross 7 AM in both rows and averages', () => {
  const sleep = {t0:240, now:450}, feed = {t0:410, dur:40, side:'L'};
  const args = [[], '2026-11-18', sleep, feed, 450];
  const row = rows(...args).days.at(-1), summary = summarize(...args);
  assert.equal(row.sleepMin, 180);
  assert.equal(summary.metrics.sleepMin.average, 180);
  assert.equal(summary.metrics.feeds.average, 1);
});

test('F2 averages each measure on its recorded days, keeping real zero bottle milk', () => {
  const entries = [{type: 'bottle', t: -1440 + 600, ml: 100},
    {type: 'diaper', t: -2880 + 600, kind: 'W'},
    {type: 'feed', t: -4320 + 600, side: 'B', dur: 10}];
  const result = summarize(entries, '2026-10-26');
  assert.equal(result.metrics.bottleMl.average, 50);
  assert.equal(result.metrics.feeds.average, 1);
  assert.equal(result.metrics.wet.average, 1);
  assert.equal(result.metrics.dirty.average, 0);
  assert.equal(result.metrics.sleepMin.average, null);
  assert.equal(result.metrics.bottleMl.loggedDays, 2);
  assert.equal(result.metrics.feeds.values[0], null);
  assert.equal(result.metrics.feeds.values[6], 1);
  assert.equal(result.metrics.bottleMl.values[5], null);
  assert.equal(result.metrics.bottleMl.values[4], 0);
  const empty = summarize([], '2026-10-26');
  for (const metric of Object.values(empty.metrics) as any[]) {
    assert.equal(metric.average, null);
    assert.equal(metric.loggedDays, 0);
  }
});

test('F1 newborn rows and week windows start at birth, with the 7 AM carry row when needed', () => {
  const entries = [{type:'bottle', t:-2880+600, ml:60}, {type:'bottle', t:-1440+600, ml:90}];
  const args = [entries, '2026-11-18', null, null, 720, '2026-11-16'];
  assert.deepEqual(rows(...args).days.map(d=>d.date), ['2026-11-16','2026-11-17']);
  assert.equal(rows(...args).today.date, '2026-11-18');
  assert.equal(summarize(...args).days.length, 2);
  const early = {type:'bottle', t:-2880+180, ml:30};
  const withEarly = rows([early,...entries], ...args.slice(1));
  assert.equal(withEarly.days[0].date, '2026-11-15');
  assert.equal(withEarly.days[0].bottleMl, 30);
  assert.equal(withEarly.days.slice(1).reduce((sum,d)=>sum+d.feedCount,0), 2);
  assert.equal(rows(entries,'2026-11-18').days.length,7);
  assert.equal(rows(entries,'2026-11-18',null,null,720,'2025-01-01').days.length,7);
  const beforeBirth = Array.from({length:4},(_,i)=>({type:'bottle',t:-(8+i)*1440+600,ml:30}));
  const afterBirth = summarize([...beforeBirth,...entries],...args.slice(1)).metrics.bottleMl;
  assert.equal(afterBirth.loggedDays,2);
  assert.equal(afterBirth.average,75);
});

test('F2 missing measures do not enter averages', () => {
  const entries = [{type:'sleep',t:-1440+600,dur:120},
    {type:'bottle',t:-2880+600,ml:60},
    ...Array.from({length:4},(_,i)=>({type:'diaper',t:-(8+i)*1440+600,kind:'W'}))];
  const summary = summarize(entries,'2026-11-18');
  assert.equal(summary.metrics.sleepMin.average,120);
  assert.equal(summary.metrics.sleepMin.loggedDays,1);
  assert.equal(summary.metrics.feeds.average,1);
  assert.equal(summary.metrics.wet.average,null);
  assert.equal(day(entries,-2).sleepMin,null);
  assert.equal(day(entries,-1).wet,null);
});

test('F3 a both-breasts session has breast kind and bottles have bottle kind', () => {
  const feeds = day([{type:'feed',side:'B',t:600,dur:10},{type:'bottle',t:700,ml:60}],0).feeds;
  assert.deepEqual(feeds.map(feed=>feed.kind),['breast','bottle']);
});

test('does not use today partial logs in the completed-day pattern', () => {
  const result = summarize([{type: 'bottle', t: 600, ml: 120}], '2026-10-26');
  assert.equal(result.metrics.feeds.loggedDays, 0);
  assert.equal(result.metrics.bottleMl.values.every(value => value === null), true);
});

test('counts a both diaper as one wet and one dirty record', () => {
  const result = summarize([
    {type: 'diaper', kind: 'B', t: -60},
    {type: 'diaper', kind: 'W', t: -30},
  ], '2026-10-26');
  assert.equal(result.metrics.wet.values[6], 2);
  assert.equal(result.metrics.dirty.values[6], 1);
  assert.equal(result.metrics.wet.values[5], null);
});

test('counts two breast-side rows with one session ID as one feed', () => {
  const result = summarize([
    {type: 'feed', sid: 'switching-feed', side: 'L', t: -100},
    {type: 'feed', sid: 'switching-feed', side: 'R', t: -80},
    {type: 'feed', sid: 'next-feed', side: 'L', t: -20},
  ], '2026-10-26');
  assert.equal(result.metrics.feeds.values[6], 2);
});

test('C1 splits a 6 AM to 8 AM sleep at 7 AM and clips the longest sleep on both sides', () => {
  const result = summarize([
    {type: 'sleep', t: -1440 + 360, dur: 120},
    {type: 'sleep', t: -1440 + 390, dur: 90},
  ], '2026-10-26');
  assert.equal(result.metrics.sleepMin.values[5], 60);
  assert.equal(result.metrics.sleepMin.values[6], 60);
  assert.equal(result.metrics.longestSleep.values[5], 60);
  assert.equal(result.metrics.longestSleep.values[6], 60);
});

test('C1 clips carry-in sleep and breast minutes at 7 AM while counting each session once', () => {
  const result = summarize([
    {type: 'sleep', t: -7 * 1440 + 390, dur: 90},
    {type: 'sleep', t: -7 * 1440 + 660, dur: 60},
    {type: 'feed', sid: 'carry-session', side: 'L', t: -7 * 1440 + 410, dur: 10},
    {type: 'feed', sid: 'carry-session', side: 'R', t: -7 * 1440 + 420, dur: 10},
    {type: 'feed', sid: 'same-day-session', side: 'L', t: -7 * 1440 + 600, dur: 20},
  ], '2026-10-26');
  assert.equal(result.metrics.sleepMin.values[0], 120);
  assert.equal(result.metrics.feeds.values[0], 1);
  const carried = day([{type:'feed', t:410, dur:20, side:'L'}], 0);
  assert.equal(carried.feeds[0].dur, 10);
  assert.equal(carried.feedCount, null);
  assert.equal(carried.bottleMl, null);
});

test('R1-3 a carry-only full day does not count in feed or bottle averages', () => {
  const entries = [{type:'feed',t:-1440+410,dur:30,side:'L'}];
  const summary = summarize(entries,'2026-11-18');
  assert.equal(summary.metrics.feeds.loggedDays,1);
  assert.equal(summary.metrics.feeds.average,1);
  assert.equal(summary.metrics.bottleMl.loggedDays,1);
  assert.equal(day(entries,-1).feeds[0].carry,true);
});

test('keeps bottle and pump volume separate on the first complete date', () => {
  const result = summarize([
    {type: 'bottle', t: -7 * 1440 + 600, ml: 60},
    {type: 'pump', t: -7 * 1440 + 610, ml: 80},
    {type: 'bottle', t: -8 * 1440, ml: 999},
    {type: 'pump', t: 600, ml: 999},
  ], '2026-10-26');
  assert.equal(result.metrics.feeds.values[0], 1);
  assert.equal(result.metrics.bottleMl.values[0], 60);
  assert.equal(result.metrics.pumpMl.values[0], 80);
  assert.equal(result.metrics.bottleMl.values[1], null);
  assert.equal(result.metrics.bottleMl.loggedDays, 1);
});

test('calculates the mean when all seven complete dates have logs', () => {
  const entries = Array.from({length: 7}, (_, i) => ({type: 'bottle', t: -(i + 1) * 1440 + 600, ml: 60 + i * 10}));
  const result = summarize(entries, '2026-10-26');
  assert.equal(result.metrics.feeds.loggedDays, 7);
  assert.equal(result.metrics.feeds.average, 1);
  assert.equal(result.metrics.bottleMl.average, 90);
});

test('feed exact values retain bottle amounts and union completed breast segments', () => {
  const feeds = day([
    {type:'bottle', t:620, ml:70},
    {type:'feed', t:640, dur:10, sid:'one', side:'L'},
    {type:'feed', t:645, dur:15, sid:'one', side:'R'},
  ], 0).feeds;
  assert.deepEqual(feeds, [{t:620,L:'B',kind:'bottle',ml:70}, {t:640,L:'LR',kind:'breast',dur:20}]);
});

test('C1 daily sleep clips 7 AM and merges overlaps without changing entries', () => {
  const entries = Object.freeze([
    Object.freeze({type: 'sleep', t: 390, dur: 90}),
    Object.freeze({type: 'sleep', t: 430, dur: 30}),
  ]);
  assert.deepEqual(day(entries, -1).sleep, [[1410, 1440]]);
  assert.deepEqual(day(entries, 0).sleep, [[0, 60]]);
  assert.equal(day(entries, -1).sleepMin, 30);
  assert.equal(day(entries, 0).sleepMin, 60);
});

test('feed markers belong to the earliest session date even with unordered side rows', () => {
  const entries = [
    {type: 'feed', sid: 'cross', side: 'R', t: -5},
    {type: 'feed', sid: 'cross', side: 'L', t: -10},
    {type: 'bottle', id: 'bottle', t: 620, ml: 60},
    {type: 'feed', id: 'standalone-a', side: 'L', t: 630},
    {type: 'feed', id: 'standalone-b', side: 'R', t: 640},
  ];
  assert.deepEqual(day(entries, -1).feeds, [{t: -10, L: 'LR', kind:'breast'}]);
  assert.deepEqual(day(entries, 0).feeds, [{t: 620, L: 'B', kind:'bottle', ml: 60}, {t: 630, L: 'L', kind:'breast'}, {t: 640, L: 'R', kind:'breast'}]);
  assert.equal(day(entries, 0).feedCount, 3);
  assert.equal(day(entries, 0).bottleMl, 60);
});

test('C1 active sleep clips 7 AM and only exposes uncovered live intervals', () => {
  const entries = [{type: 'sleep', t: 400, dur: 40}, {type: 'sleep', t: 450, dur: 10}];
  const active = {t0: 390, now: 480};
  assert.deepEqual(day(entries, -1, active).sleep, [[1410, 1440]]);
  assert.deepEqual(day(entries, -1, active).liveSleep, [[1410, 1420]]);
  assert.deepEqual(day(entries, 0, active).sleep, [[0, 60]]);
  assert.deepEqual(day(entries, 0, active).liveSleep, [[20, 30], [40, 60]]);
  assert.equal(day(entries, 0, active).sleepMin, 60);
});

test('active feed joins its earlier session and missing IDs remain separate', () => {
  const entries = [{type: 'feed', sid: 'cross', side: 'L', t: -10}];
  assert.deepEqual(day(entries, -1, null, {t0: -5, sid: 'cross', side: 'R'}).feeds,
    [{t: -10, L: 'LR', kind:'breast', live: true}]);
  assert.deepEqual(day(entries, 0, null, {t0: -5, sid: 'cross', side: 'R'}).feeds, []);
  assert.deepEqual(day([{type: 'feed', t: 610, side: 'L'}], 0, null, {t0: 620, side: 'R'}).feeds,
    [{t: 610, L: 'L', kind:'breast'}, {t: 620, L: 'R', kind:'breast', live: true}]);
});

test('C1 rows retain seven full days and at 3 AM today has yesterday’s 7 AM date', () => {
  const result = rows([{type: 'sleep', t: -30, dur: 90}], '2026-03-01', null, null, 180);
  assert.equal(result.today.date, '2026-02-28');
  assert.equal(result.today.offset, -1);
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].date, '2026-02-21');
  assert.equal(result.days[6].date, '2026-02-27');
  assert.equal(result.days[0].sleepMin, null);
  assert.deepEqual(result.days[0].feeds, []);
  assert.equal(result.today.sleepMin, 90);
});

test('R6 a record eight days back is in no row and no average; the breast and bottle counts add up to the feed count', () => {
  const old = {type:'bottle', t:-8*1440+600, ml:500};
  const inside = [{type:'bottle', t:-1440+600, ml:100}, {type:'feed', side:'L', t:-1440+700, dur:10}, {type:'feed', side:'R', t:-1440+720, dur:10}];
  const result = rows([old,...inside], '2026-10-26');
  assert.equal(result.days.length, 7);
  assert.equal(result.days.reduce((sum,d)=>sum+(d.feedCount||0),0), 3);
  const last = result.days.at(-1);
  assert.deepEqual([last.feedCount, last.breastCount, last.bottleCount], [3, 2, 1]);
  assert.equal(result.days[0].breastCount, null);
  const bottle = summarize([old,...inside], '2026-10-26').metrics.bottleMl;
  assert.equal(bottle.average, 100);
  assert.equal(bottle.loggedDays, 1);
});

test('ignores invalid sleep durations, times, and reversed active timers', () => {
  const entries = [null, {type: 'sleep', t: 20, dur: -1}, {type: 'sleep', t: 20, dur: Infinity},
    {type: 'sleep', t: NaN, dur: 20}, {type: 'sleep', t: 20, dur: 0}];
  assert.equal(day(entries, 0, {t0: 30, now: 20}, {t0: NaN, side: 'L'}).sleepMin, null);
  assert.deepEqual(day(entries, 0).feeds, []);
  assert.deepEqual(day(null, 0).sleep, []);
});

// Day totals for Home and the Timeline. A day runs from local midnight; times are minutes from today's midnight.

test('day totals: a day start of 0 puts early-morning records in their own calendar day, while the default keeps the 7 AM day', () => {
  // Failure case: counting by the 7 AM day moves the 12:05 AM and 3:20 AM feeds into yesterday.
  const entries = [{type:'feed', side:'L', t:-10, dur:10}, {type:'feed', side:'R', t:5, dur:10}, {type:'feed', side:'L', t:200, dur:8}, {type:'bottle', t:500, ml:90}];
  assert.equal(day(entries, 0, null, null, 0).feedCount, 3);
  assert.equal(day(entries, -1, null, null, 0).feedCount, 1);
  assert.equal(day(entries, 0).feedCount, 1);
  assert.equal(day(entries, -1).feedCount, 3);
  assert.deepEqual(day(entries, 0), day(entries, 0, null, null, 7 * 60));
});

test('day totals: a mixed feed is 1 feed with its breast minutes and bottle volume, and a day with no bottle volume reports none', () => {
  // Failure case: counting every bottle and breast piece as its own feed, or showing "0 ml" on a day with no bottle.
  const mixed = [
    {type:'bottle', sid:'m', t:600, dur:5, ml:60}, {type:'feed', sid:'m', side:'L', t:605, dur:10},
    {type:'feed', sid:'m', side:'R', t:615, dur:15}, {type:'bottle', sid:'m', t:630, dur:5, ml:30},
    {type:'feed', side:'L', t:900, dur:20},
  ];
  assert.deepEqual(totals(mixed, 0), {feeds:2, nurseMin:45, bottleMl:90, sleepMin:0, sleeps:0});
  assert.deepEqual(totals([{type:'feed', side:'L', t:100, dur:20}, {type:'feed', side:'R', t:300, dur:15}], 0),
    {feeds:2, nurseMin:35, bottleMl:0, sleepMin:0, sleeps:0});
  assert.equal(totals([{type:'bottle', t:100}], 0).bottleMl, 0);
  assert.equal(totals([{type:'bottle', t:100}], 0).feeds, 1);
  assert.equal(totals([{type:'pump', t:100, ml:80}], 0).feeds, 0);
});

test('day totals: a feed that runs past midnight counts once, on its start day, and its nursing minutes split at midnight', () => {
  // Failure case: counting the feed in both days, or losing the 15 minutes after midnight.
  const entries = [{type:'feed', side:'L', t:-10, dur:25}];
  assert.equal(totals(entries, -1).feeds, 1);
  assert.equal(totals(entries, -1).nurseMin, 10);
  assert.equal(totals(entries, 0).feeds, 0);
  assert.equal(totals(entries, 0).nurseMin, 15);
  const sides = [{type:'feed', sid:'s', side:'L', t:-10, dur:15}, {type:'feed', sid:'s', side:'R', t:5, dur:10}, {type:'feed', side:'L', t:600, dur:20}];
  assert.equal(totals(sides, -1).nurseMin + totals(sides, 0).nurseMin, 15 + 10 + 20);
  assert.equal(totals(sides, 0).feeds, 1);
});

test('day totals: a sleep across midnight gives each day only its own minutes and counts as 1 sleep in each', () => {
  // Failure case: giving all 240 minutes to one day, or splitting at 7 AM.
  const entries = [{type:'sleep', t:-120, dur:240}, {type:'sleep', t:600, dur:70}, {type:'sleep', t:400, dur:60}];
  const before = totals(entries, -1), after = totals(entries, 0);
  assert.equal(before.sleepMin, 120);
  assert.equal(before.sleeps, 1);
  assert.equal(after.sleepMin, 120 + 70 + 60);
  assert.equal(after.sleeps, 3);
});

test('day totals: a running sleep counts up to now and a running feed counts as 1 feed', () => {
  // Failure case: ignoring the running timers until they are saved.
  const sleep = {t0:-30, now:90}, feed = {side:'L', t0:60, dur:10};
  assert.deepEqual(totals([], -1, sleep, feed), {feeds:0, nurseMin:0, bottleMl:0, sleepMin:30, sleeps:1});
  assert.deepEqual(totals([], 0, sleep, feed), {feeds:1, nurseMin:10, bottleMl:0, sleepMin:90, sleeps:1});
  assert.equal(totals([{type:'bottle', t:20, ml:50}], 0, null, {side:'bottle', t0:60, dur:5}).bottleMl, 50);
});

test('day totals: an empty day, and missing or invalid records, give zeros', () => {
  const zero = {feeds:0, nurseMin:0, bottleMl:0, sleepMin:0, sleeps:0};
  assert.deepEqual(totals([], 0), zero);
  assert.deepEqual(totals([null, {type:'sleep', t:Number.NaN, dur:30}, {type:'sleep', t:10, dur:0}, {type:'diaper', t:10, kind:'W'}], 0), zero);
  assert.deepEqual(totals(undefined, 0), zero);
});

test('W5 night is 7 PM to 7 AM: a day splits its sleep into night and nap minutes', () => {
  // The chart day runs 7 AM to 7 AM, so minutes 0 to 720 of a day are 7 AM to 7 PM (nap) and 720 to 1440 are 7 PM to 7 AM (night).
  const entries = [
    {type:'sleep', t:420, dur:60},        // 7 AM to 8 AM: 60 nap
    {type:'sleep', t:1080, dur:120},      // 6 PM to 8 PM: 60 nap, 60 night
    {type:'sleep', t:1320, dur:300},      // 10 PM to 3 AM: 300 night
  ];
  const recorded = day(entries, 0);
  assert.equal(recorded.sleepMin, 480);
  assert.equal(recorded.nightMin, 360);
  assert.equal(recorded.napMin, 120);
  assert.equal(recorded.nightMin + recorded.napMin, recorded.sleepMin);
});

test('W5 a sleep across 7 AM gives each day its own night and nap minutes, and a day with no sleep has none', () => {
  const entries = [{type:'sleep', t:300, dur:180}];  // 5 AM to 8 AM
  const before = day(entries, -1), after = day(entries, 0);
  assert.equal(before.nightMin, 120);               // 5 AM to 7 AM ends the night of the day before
  assert.equal(before.napMin, 0);
  assert.equal(after.nightMin, 0);
  assert.equal(after.napMin, 60);                   // 7 AM to 8 AM
  assert.equal(day([], 0).nightMin, null);
  assert.equal(day([], 0).napMin, null);
});
