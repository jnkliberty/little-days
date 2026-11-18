import assert from 'node:assert/strict';
import test from 'node:test';
import { eventTimestamp, localDate, localMidnight, mapBabyBuddyRecord, relativeMinutes } from '../server/mapping.ts';
import { setZone, zoneFromEnv } from '../server/zone.ts';
import '../web/trends.js';

// America/Chicago changes its clock on 2026-03-08 (a 23-hour day) and 2026-11-01 (a 25-hour day).
setZone('America/Chicago');
const trends = (globalThis as any).LittleDaysTrends;
const sleepRow = (start: string, end: string) => ({ id: 1, start, end, nap: false });
const entryFor = (start: string, end: string, now: string) => mapBabyBuddyRecord('sleep', sleepRow(start, end), null, new Date(now), 'adult');
const sleepMinutes = (entry: unknown, offset: number) => trends.totals([entry], offset).sleepMin;

test('the install zone is read from TZ one time and a wrong value stops the server', () => {
  assert.equal(zoneFromEnv({ TZ: 'America/Chicago' }), 'America/Chicago');
  assert.equal(zoneFromEnv({ TZ: 'Europe/Madrid' }), 'Europe/Madrid');
  assert.throws(() => zoneFromEnv({ TZ: 'Not/AZone' }), /TZ/);
  assert.equal(zoneFromEnv({}), Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('a sleep from 12:30 AM on 2026-03-08 to 12:30 AM on 2026-03-09 gives 30 minutes to March 9', () => {
  const entry = entryFor('2026-03-08T06:30:00Z', '2026-03-09T05:30:00Z', '2026-03-09T18:00:00Z');
  assert.equal(entry.dur, 23 * 60);
  assert.equal(sleepMinutes(entry, 0), 30, 'March 9');
  assert.equal(sleepMinutes(entry, -1), 23 * 60 - 30, 'March 8 has 23 hours, so the rest of the sleep is 22 h 30 min');
});

test('a sleep across the November clock change keeps its real minutes on each day', () => {
  const entry = entryFor('2026-11-01T05:30:00Z', '2026-11-02T06:30:00Z', '2026-11-02T18:00:00Z');
  assert.equal(entry.dur, 25 * 60);
  assert.equal(sleepMinutes(entry, 0), 30, 'November 2');
  assert.equal(sleepMinutes(entry, -1), 25 * 60 - 30, 'November 1 has 25 hours');
});

test('a night sleep across the 2 AM change splits at midnight and counts the skipped hour once', () => {
  // 8 PM on March 7 to 7 AM on March 8: the clock face shows 11 hours, 10 hours pass.
  const entry = entryFor('2026-03-08T02:00:00Z', '2026-03-08T12:00:00Z', '2026-03-08T18:00:00Z');
  assert.equal(entry.dur, 600);
  assert.equal(sleepMinutes(entry, -1), 4 * 60, 'March 7 from 8 PM');
  assert.equal(sleepMinutes(entry, 0), 6 * 60, 'March 8 until 7 AM, with one hour skipped');
});

test('a sleep with no clock change keeps the old arithmetic', () => {
  // 10 PM on October 19 to 8 AM on October 20 (CDT).
  const entry = entryFor('2026-10-20T03:00:00Z', '2026-10-20T13:00:00Z', '2026-10-20T18:00:00Z');
  assert.equal(sleepMinutes(entry, -1), 120);
  assert.equal(sleepMinutes(entry, 0), 480);
});

// Codex review round 1 of 3 on Wave 7. Charts day 7 AM to 7 AM (`day`) and Home day midnight to midnight (`totals`).
test('a sleep that ends at an earlier clock time after the November change keeps its real 30 minutes', () => {
  // 1:45 AM CDT to 1:15 AM CST: the clock face runs backward, 30 minutes pass.
  const entry = entryFor('2026-11-01T06:45:00Z', '2026-11-01T07:15:00Z', '2026-11-01T18:00:00Z');
  assert.equal(entry.dur, 30);
  assert.equal(sleepMinutes(entry, 0), 30, 'Home total for November 1');
  const chart = trends.day([entry], -1);
  assert.equal(chart.sleepMin, 30, 'the chart day that holds 1 AM');
  assert.equal(chart.longestSleep, 30);
  assert.ok(chart.sleep.length > 0 && chart.logged, 'the chart still draws it');
});

test('two overlapping sleeps across the March change count the skipped hour once', () => {
  // 12:30 AM CST to 7:00 AM CDT, and 1:00 AM CST to 6:00 AM CDT: 5 h 30 min of sleep.
  const a = entryFor('2026-03-08T06:30:00Z', '2026-03-08T12:00:00Z', '2026-03-08T18:00:00Z');
  const b = entryFor('2026-03-08T07:00:00Z', '2026-03-08T11:00:00Z', '2026-03-08T18:00:00Z');
  assert.equal(trends.totals([a, b], 0).sleepMin, 330, 'Home total');
  const chart = trends.day([a, b], -1);
  assert.equal(chart.sleepMin, 330);
  assert.equal(chart.longestSleep, 330, 'one unbroken sleep');
});

test('one continuous sleep across the March change counts as one sleep', () => {
  // 12:30 AM CST to 7:00 AM CDT: the chart draws two wall-clock parts, but one sleep happened.
  const entry = entryFor('2026-03-08T06:30:00Z', '2026-03-08T12:00:00Z', '2026-03-08T18:00:00Z');
  const home = trends.totals([entry], 0);
  assert.deepEqual([home.sleeps, home.sleepMin], [1, 330]);
  assert.equal(trends.day([entry], -1).sleep.length, 2, 'the chart still draws two parts');
  // Two separate sleeps on the same day stay two.
  const nap = entryFor('2026-03-08T16:00:00Z', '2026-03-08T17:00:00Z', '2026-03-08T18:00:00Z');
  assert.equal(trends.totals([entry, nap], 0).sleeps, 2);
});

test('two separate sleeps in the repeated November hour stay two sleeps', () => {
  // 12:30 AM CDT to 1:15 AM CST (105 minutes), then 1:30 AM to 1:45 AM CST (15 minutes). The second has no clock-change marker.
  const first = entryFor('2026-11-01T05:30:00Z', '2026-11-01T07:15:00Z', '2026-11-01T18:00:00Z');
  const second = entryFor('2026-11-01T07:30:00Z', '2026-11-01T07:45:00Z', '2026-11-01T18:00:00Z');
  assert.ok(first.shift && !second.shift);
  const home = trends.totals([first, second], 0);
  assert.deepEqual([home.sleeps, home.sleepMin], [2, 120]);
  const chart = trends.day([first, second], -1);
  assert.deepEqual([chart.sleepCount, chart.sleepMin, chart.longestSleep], [2, 120, 105]);
  // A sleep in the first 1 AM hour (CDT) lies inside the first sleep, so it adds nothing.
  const inside = entryFor('2026-11-01T06:30:00Z', '2026-11-01T06:45:00Z', '2026-11-01T18:00:00Z');
  const merged = trends.totals([first, inside], 0);
  assert.deepEqual([merged.sleeps, merged.sleepMin], [1, 105]);
});

test('night and nap minutes add up to the day\'s sleep on a clock-change day', () => {
  // 12:30 AM CST to 7:00 AM CDT on March 8 is all night: 5 h 30 min, with the skipped hour counted once.
  const entry = entryFor('2026-03-08T06:30:00Z', '2026-03-08T12:00:00Z', '2026-03-08T18:00:00Z');
  const chart = trends.day([entry], -1);
  assert.deepEqual([chart.sleepMin, chart.nightMin, chart.napMin], [330, 330, 0]);
  // And a November night with a nap the same chart day: the sums still match.
  const night = entryFor('2026-11-01T05:30:00Z', '2026-11-01T12:00:00Z', '2026-11-01T18:00:00Z');
  const nap = entryFor('2026-10-31T19:00:00Z', '2026-10-31T20:00:00Z', '2026-11-01T18:00:00Z');
  const both = trends.day([night, nap], -1);
  assert.equal(both.nightMin + both.napMin, both.sleepMin);
});

test('the longest sleep uses elapsed time on the March change day and is unchanged on other days', () => {
  // 12:30 AM CST to 3:00 AM CDT: the clock face shows 2 h 30 min, 90 minutes pass.
  const across = entryFor('2026-03-08T06:30:00Z', '2026-03-08T08:00:00Z', '2026-03-08T18:00:00Z');
  const chart = trends.day([across], -1);
  assert.equal(chart.sleepMin, 90);
  assert.equal(chart.longestSleep, 90);
  // A day with no change: 10 PM to 8 AM on October 19 and 20 (CDT), and a nap that overlaps its end.
  const night = entryFor('2026-10-20T03:00:00Z', '2026-10-20T13:00:00Z', '2026-10-20T18:00:00Z');
  const nap = entryFor('2026-10-20T11:00:00Z', '2026-10-20T14:00:00Z', '2026-10-20T18:00:00Z');
  const plain = trends.day([night, nap], 0);
  assert.equal(plain.sleepMin, 120, 'the union from 7 AM to 9 AM within the 7 AM day start');
  assert.equal(plain.longestSleep, 120);
});

test('day groups and day totals follow the wall-clock date on both clock-change days', () => {
  const cases: [string, string, string, number][] = [
    // instant, today for the viewer, wall-clock date, minute of that day
    ['2026-03-08T05:59:00Z', '2026-03-08', '2026-03-07', 23 * 60 + 59],
    ['2026-03-08T06:00:00Z', '2026-03-08', '2026-03-08', 0],
    ['2026-03-08T07:59:00Z', '2026-03-08', '2026-03-08', 119],
    ['2026-03-08T08:00:00Z', '2026-03-08', '2026-03-08', 180],
    ['2026-03-09T04:59:00Z', '2026-03-09', '2026-03-08', 23 * 60 + 59],
    ['2026-03-09T05:00:00Z', '2026-03-09', '2026-03-09', 0],
    ['2026-11-01T04:59:00Z', '2026-11-01', '2026-10-31', 23 * 60 + 59],
    ['2026-11-01T05:00:00Z', '2026-11-01', '2026-11-01', 0],
    ['2026-11-01T07:30:00Z', '2026-11-01', '2026-11-01', 90],
    ['2026-11-02T05:59:00Z', '2026-11-02', '2026-11-01', 23 * 60 + 59],
    ['2026-11-02T06:00:00Z', '2026-11-02', '2026-11-02', 0],
  ];
  for (const [instant, today, date, minute] of cases) {
    const now = new Date(`${today}T18:00:00Z`);
    assert.equal(localDate(new Date(instant)), date, instant);
    const t = relativeMinutes(new Date(instant), now);
    const dayIndex = Math.floor(t / 1440), expectedDay = (Date.parse(date) - Date.parse(today)) / 86_400_000;
    assert.equal(dayIndex, expectedDay, `${instant} groups on ${date}`);
    assert.equal(t - dayIndex * 1440, minute, `${instant} minute of day`);
  }
  const diaper = (instant: string, today: string) => mapBabyBuddyRecord('changes', { id: 5, time: instant, wet: true, solid: false }, null, new Date(`${today}T18:00:00Z`), 'adult');
  const late = diaper('2026-03-09T04:59:00Z', '2026-03-09'), first = diaper('2026-03-09T05:00:00Z', '2026-03-09');
  assert.deepEqual([late, first].map(entry => trends.day([entry], -1, null, null, 0).logged), [true, false], 'a diaper at 11:59 PM counts on March 8 only');
});

test('a time typed for a day becomes the right instant on and around each clock change', () => {
  const at = (minute: number, today: string) => eventTimestamp({ type: 'diaper', t: minute }, new Date(`${today}T20:00:00Z`));
  assert.equal(at(30, '2026-03-08'), '2026-03-08T06:30:00.000Z');
  assert.equal(at(3 * 60 + 30, '2026-03-08'), '2026-03-08T08:30:00.000Z', '3:30 AM is after the jump');
  assert.equal(at(30, '2026-03-09'), '2026-03-09T05:30:00.000Z');
  assert.equal(at(30, '2026-11-01'), '2026-11-01T05:30:00.000Z');
  assert.equal(at(3 * 60, '2026-11-01'), '2026-11-01T09:00:00.000Z', '3 AM is after the fall back');
});

test('the start of each day, as a query bound, is local midnight on both clock-change days', () => {
  assert.equal(localMidnight('2026-03-07'), '2026-03-07T06:00:00.000Z');
  assert.equal(localMidnight('2026-03-08'), '2026-03-08T06:00:00.000Z');
  assert.equal(localMidnight('2026-03-09'), '2026-03-09T05:00:00.000Z');
  assert.equal(localMidnight('2026-11-01'), '2026-11-01T05:00:00.000Z');
  assert.equal(localMidnight('2026-11-02'), '2026-11-02T06:00:00.000Z');
});
