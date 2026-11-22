import assert from 'node:assert/strict';
import test from 'node:test';
import { careGuidance as serverCareGuidance } from '../server/care-guidance.ts';

const DAY = 1440;
const DAY_START = 420; // 7:00 AM

async function loadModules() {
  await import('../web/trends.js');
  await import('../web/cry.js');
  await import('../web/forecast.js');
  await import('../web/age-norms.js');
  await import('../web/charts.js');
  await import('../web/care-guidance.js');
  await import('../web/reports.js');
  return {
    trends: (globalThis as any).LittleDaysTrends,
    charts: (globalThis as any).LittleDaysCharts,
    guidance: (globalThis as any).LittleDaysCareGuidance,
    reports: (globalThis as any).LittleDaysReports,
  };
}

// Helper: build full 7 AM-to-7 AM care records for a list of chart day offsets
function makeDayRecords(offsets: number[], opts: { feedsPerDay?: number; sleepNight?: number; sleepNap?: number; naps?: number; wet?: number; dirty?: number } = {}) {
  const feedsPerDay = opts.feedsPerDay ?? 8;
  const sleepNight = opts.sleepNight ?? 600; // 10 h
  const naps = opts.naps ?? 3;
  const sleepNap = opts.sleepNap ?? 120; // each nap 2 h
  const wet = opts.wet ?? 6;
  const dirty = opts.dirty ?? 2;
  const out: any[] = [];
  for (const offset of offsets) {
    const base = offset * DAY + DAY_START; // 7:00 AM of that day
    for (let i = 0; i < feedsPerDay; i++) {
      const t = base + 30 + i * 165;
      if (i % 4 === 3) out.push({ id: `b-${offset}-${i}`, type: 'bottle', ml: 100, unit: 'ml', t });
      else out.push({ id: `f-${offset}-${i}`, type: 'feed', side: i % 2 === 0 ? 'L' : 'R', dur: 15, t });
    }
    for (let i = 0; i < naps; i++) {
      out.push({ id: `sn-${offset}-${i}`, type: 'sleep', nap: true, t: base + 90 + i * 150, dur: sleepNap });
    }
    // Night sleep starting at 8:15 PM (base + 795) and waking at 6:15 AM or 7:15 AM
    out.push({ id: `s-${offset}-night`, type: 'sleep', nap: false, t: base + 795, dur: sleepNight });
    for (let i = 0; i < wet; i++) out.push({ id: `w-${offset}-${i}`, type: 'diaper', kind: 'W', t: base + 60 + i * 180 });
    for (let i = 0; i < dirty; i++) out.push({ id: `d-${offset}-${i}`, type: 'diaper', kind: 'D', t: base + 100 + i * 360 });
  }
  return out;
}

test('G3-1 shared care-guidance.js matches server re-export and selects age guide cleanly', async () => {
  const { guidance } = await loadModules();
  assert.ok(guidance, 'LittleDaysCareGuidance should load');
  assert.deepEqual(guidance.careGuidance(false), serverCareGuidance(false));
  assert.deepEqual(guidance.careGuidance(true), serverCareGuidance(true));
  assert.equal(guidance.careGuidance(false).length, 11);
  assert.equal(guidance.byId('care-safe-sleep', false).title, 'NICHD: safe sleep space');
  assert.equal(guidance.byId('care-feeding-cues', true).title, 'CDC: señales de hambre y saciedad');
  assert.equal(guidance.byId('missing-id', false), null);
  assert.equal(guidance.forAge(17, false).id, 'care-early-play');
  assert.equal(guidance.forAge(65, false).id, 'care-milestones-2');
  assert.equal(guidance.forAge(125, false).id, 'care-milestones-4');
  assert.equal(guidance.forAge(190, false).id, 'care-milestones-6');
  assert.equal(guidance.forAge(280, false).id, 'care-milestones-9');
  assert.equal(guidance.forAge(360, false).id, 'care-milestones-12');
  assert.equal(guidance.forAge(null, true).id, 'care-early-play');
});

test('G3-2 trends.js accepts windowDays and endOffset and passes nightMin/napMin in summarize', async () => {
  const { trends } = await loadModules();
  // 14 full days before today (-14..-1), baby 20 days old
  const entries = makeDayRecords(Array.from({ length: 14 }, (_, i) => -14 + i), { sleepNight: 600, naps: 2, sleepNap: 90 });
  const r14 = trends.rows(entries, '2026-11-23', null, null, 570, '2026-11-01', 14, 0);
  assert.equal(r14.days.length, 14);
  assert.equal(r14.days[0].offset, -14);
  assert.equal(r14.days.at(-1).offset, -1);

  // Shifted endOffset (-6, e.g. Sunday weekly report ending last Monday)
  const rShifted = trends.rows(entries, '2026-11-22', null, null, 840, '2026-10-01', 7, -6);
  assert.equal(rShifted.days.length, 7);
  assert.equal(rShifted.days[0].offset, -13);
  assert.equal(rShifted.days.at(-1).offset, -7);

  // Baby under 14 days old: summarize clips to birthDate (9 full days), offsets stay accurate
  const youngSummary = trends.summarize(entries, '2026-11-23', null, null, 570, '2026-11-14', 14, 0);
  assert.equal(youngSummary.days.length, 9);
  assert.equal(youngSummary.days[0].date, '2026-11-14');
  assert.equal(youngSummary.days[0].offset, -9);

  // summarize includes nightMin and napMin that sum to sleepMin
  const s = trends.summarize(entries, '2026-11-23', null, null, 570, '2026-11-01', 7, 0);
  assert.equal(s.metrics.nightMin.average, 600);
  assert.equal(s.metrics.napMin.average, 180);
  assert.equal(s.metrics.sleepMin.average, 780);
});

test('G3-3 charts.reportColumns renders 7, 14, and 30 day bars with positive widths and no NaN', async () => {
  const { charts } = await loadModules();
  for (const n of [7, 14, 30]) {
    const rows = Array.from({ length: n }, (_, i) => ({
      x: i === 0 ? 'Oct 24' : i === n - 1 ? 'Nov 22' : '',
      anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      v: [10.5, 5.5],
    }));
    const panel = {
      ...charts.scale(18, 6, 16),
      colors: ['var(--chart-sleep)', 'var(--chart-nap)'],
      names: ['Night', 'Naps'],
      band: { low: 12, high: 16, open: false },
    };
    const svg = charts.reportColumns(326, 'Sleep per day', rows, panel);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    for (const m of svg.matchAll(/width="([-\d.]+)"/g)) {
      assert.ok(Number(m[1]) > 0, `width ${m[1]} must be positive for ${n} days`);
    }
    assert.match(svg, /class="nr-band"/);
    assert.match(svg, /class="name"[^>]*>Night</);
    assert.match(svg, /class="name"[^>]*>Naps</);
  }
});

test('G3-4 week edges at 7 AM and /api/state date chunks on Sunday, Monday 3 AM, Monday 9:30 AM, Tuesday, and 30-day load', async () => {
  const { reports } = await loadModules();
  // Monday Nov 23, 2026 at 9:30 AM (nowMin = 570): last Monday 7 AM is today (offset 0)
  assert.equal(reports.weeklyEndOffset('2026-11-23', 570), 0);
  assert.deepEqual(reports.loadChunks('2026-11-23', 0, 14), [{ from: '2026-11-08', to: '2026-11-24' }]);

  // Monday Nov 23, 2026 at 3:00 AM (nowMin = 180): before 7 AM -> last Monday 7 AM was Nov 16 (offset -7)
  assert.equal(reports.weeklyEndOffset('2026-11-23', 180), -7);
  assert.deepEqual(reports.loadChunks('2026-11-23', -7, 14), [{ from: '2026-11-01', to: '2026-11-17' }]);

  // Sunday Nov 22, 2026 at 2:00 PM (nowMin = 840): last Monday 7 AM was Nov 16 (offset -6)
  assert.equal(reports.weeklyEndOffset('2026-11-22', 840), -6);
  assert.deepEqual(reports.loadChunks('2026-11-22', -6, 14), [{ from: '2026-11-01', to: '2026-11-17' }]);

  // Tuesday Nov 24, 2026 at 10:00 AM (nowMin = 600): last Monday 7 AM was Nov 23 (offset -1)
  assert.equal(reports.weeklyEndOffset('2026-11-24', 600), -1);
  assert.deepEqual(reports.loadChunks('2026-11-24', -1, 14), [{ from: '2026-11-08', to: '2026-11-24' }]);

  // Non-weekly report opened at 3:00 AM (nowMin = 180): unfinished day excluded (endOffset = -1)
  assert.equal(reports.reportEndOffset(180), -1);
  assert.equal(reports.reportEndOffset(420), 0);
  assert.equal(reports.reportEndOffset(570), 0);

  // 30-day report splits into 2 /api/state calls, each <= 31 days, covering endOffset - 31 through endOffset + 1
  const chunks30 = reports.loadChunks('2026-11-23', 0, 30);
  assert.equal(chunks30.length, 2);
  assert.equal(chunks30[0].from, '2026-10-23');
  assert.equal(chunks30[0].to, chunks30[1].from);
  assert.equal(chunks30[1].to, '2026-11-24');
  for (const c of chunks30) {
    const span = (Date.parse(`${c.to}T00:00:00Z`) - Date.parse(`${c.from}T00:00:00Z`)) / 86400000;
    assert.ok(span >= 1 && span <= 31, `chunk ${c.from}..${c.to} span ${span} must be 1..31 days`);
  }
});

test('G3-5 "Her week is ready" Home card shows only from 7 AM Monday and respects dismissal', async () => {
  const { reports } = await loadModules();
  // Monday 6:59 AM -> hidden
  assert.equal(reports.weeklyCardReady({ todayISO: '2026-11-23', nowMin: 419, dismissedDate: null, canViewWeekly: true }), false);
  // Monday 7:00 AM -> visible
  assert.equal(reports.weeklyCardReady({ todayISO: '2026-11-23', nowMin: 420, dismissedDate: null, canViewWeekly: true }), true);
  // Monday dismissed today -> hidden
  assert.equal(reports.weeklyCardReady({ todayISO: '2026-11-23', nowMin: 570, dismissedDate: '2026-11-23', canViewWeekly: true }), false);
  // Next Monday -> visible again
  assert.equal(reports.weeklyCardReady({ todayISO: '2026-11-30', nowMin: 420, dismissedDate: '2026-11-23', canViewWeekly: true }), true);
  // Tuesday and Sunday -> hidden
  assert.equal(reports.weeklyCardReady({ todayISO: '2026-11-24', nowMin: 570, dismissedDate: null, canViewWeekly: true }), false);
  assert.equal(reports.weeklyCardReady({ todayISO: '2026-11-22', nowMin: 570, dismissedDate: null, canViewWeekly: true }), false);
  // Without view permission -> hidden
  assert.equal(reports.weeklyCardReady({ todayISO: '2026-11-23', nowMin: 570, dismissedDate: null, canViewWeekly: false }), false);
});

test('G3-6 Weekly report handles baby under 14 days old, Tuesday open, 3 AM open, and old growth points without percentiles', async () => {
  const { reports } = await loadModules();
  const allPerm = { sleep: true, feedings: true, changes: true, weight: true, height: true, head: true, medication: true };
  // Baby 9 days old (born Nov 14, today Mon Nov 23 9:30 AM): current week Nov 16..22, no full prior week -> hasPrior false
  const youngEntries = makeDayRecords([-9, -8, -7, -6, -5, -4, -3, -2, -1]);
  const young = reports.weeklyReport({
    entries: youngEntries,
    growthEntries: [{ id: 'weight:1', date: '2026-11-14', kg: 3.4 }, { id: 'weight:2', date: '2026-11-21', kg: 3.7 }],
    todayISO: '2026-11-23',
    nowMin: 570,
    birthDate: '2026-11-14',
    permissions: allPerm,
  });
  assert.equal(young.hasPrior, false);
  assert.equal(young.currentDays.length, 7);
  assert.equal(young.currentFrom, '2026-11-16');
  assert.equal(young.currentTo, '2026-11-22');
  assert.equal(young.deltas.sleepMin, null);
  assert.equal(young.growth.weight.latest.value, 3.7);
  assert.ok(Math.abs(young.growth.weight.delta - 0.3) < 1e-9);
  assert.equal('percentile' in young.growth.weight, false);

  // Baby 20 days old on Tuesday Nov 24 -> same week (Nov 16..22 vs Nov 9..15), deltas use more/less
  const curEntries = makeDayRecords([-8, -7, -6, -5, -4, -3, -2], { sleepNight: 630, feedsPerDay: 9, wet: 7 });
  const prevEntries = makeDayRecords([-15, -14, -13, -12, -11, -10, -9], { sleepNight: 600, feedsPerDay: 8, wet: 6 });
  const tue = reports.weeklyReport({
    entries: [...prevEntries, ...curEntries],
    growthEntries: [{ id: 'weight:1', date: '2026-10-20', kg: 3.2 }, { id: 'weight:2', date: '2026-11-01', kg: 3.5 }], // older than 14 days!
    todayISO: '2026-11-24',
    nowMin: 600,
    birthDate: '2026-10-15',
    permissions: allPerm,
  });
  assert.equal(tue.hasPrior, true);
  assert.equal(tue.currentFrom, '2026-11-16');
  assert.equal(tue.currentTo, '2026-11-22');
  assert.equal(tue.priorFrom, '2026-11-09');
  assert.equal(tue.priorTo, '2026-11-15');
  assert.equal(tue.deltas.sleepMin.direction, 'more');
  assert.equal(Math.round(tue.deltas.sleepMin.amount), 30);
  assert.equal(tue.deltas.feeds.direction, 'more');
  assert.equal(tue.deltas.wet.direction, 'more');
  assert.equal(tue.growth.weight.latest.date, '2026-11-01', 'old growth point outside the 14-day period is still shown');
});

test('G3-7 Sleep report computes night/nap split, nap count, bedtime/wake across 7 AM, and Group 2 age band', async () => {
  const { reports } = await loadModules();
  // Night sleep from 8:15 PM (base + 795) for 660 min -> wakes at 7:15 AM next morning (past 7 AM!)
  const entries = makeDayRecords([-7, -6, -5, -4, -3, -2, -1], { sleepNight: 660, naps: 3, sleepNap: 90 });
  const r = reports.sleepReport({
    entries,
    todayISO: '2026-11-23',
    nowMin: 570,
    windowDays: 7,
    birthDate: '2026-06-20', // ~156 days old -> AASM 12-16 h band
  });
  assert.equal(r.days.length, 7);
  assert.equal(r.avgNaps, 3);
  assert.equal(r.band?.low, 12);
  assert.equal(r.band?.high, 16);
  // Check bedtime (8:15 PM = 20*60 + 15 = 1215) and wake (7:15 AM = 7*60 + 15 = 435)
  const last = r.schedule.at(-1);
  assert.equal(last.bedtimeMin, 20 * 60 + 15);
  assert.equal(last.wakeMin, 7 * 60 + 15);
  assert.equal(r.typicalBedtimeMin, 20 * 60 + 15);
  assert.equal(r.typicalWakeMin, 7 * 60 + 15);

  // Under 4 months -> AASM under4 note, no band range
  const young = reports.sleepReport({ entries, todayISO: '2026-11-23', nowMin: 570, windowDays: 7, birthDate: '2026-11-06' });
  assert.equal(young.band?.kind, 'under4');

  // Unlogged days do not pull down weekly napsPerDay, and longestSleep is the period maximum (not average of daily longest)
  const sparse = [
    ...makeDayRecords([-7], { sleepNight: 480, naps: 4, sleepNap: 60 }),
    ...makeDayRecords([-1], { sleepNight: 600, naps: 2, sleepNap: 60 }),
  ];
  const wkSparse = reports.weeklyReport({
    entries: sparse,
    growthEntries: [],
    todayISO: '2026-11-23',
    nowMin: 570,
    birthDate: '2026-10-01',
    permissions: { sleep: true, feedings: true, changes: true },
  });
  assert.equal(wkSparse.averages.napsPerDay, 3, 'average of 4 and 2 logged sleep days, not divided by 7');
  assert.equal(wkSparse.averages.longestSleep, 600, 'period maximum, not average of 480 and 600');
  const slSparse = reports.sleepReport({ entries: sparse, todayISO: '2026-11-23', nowMin: 570, windowDays: 7, birthDate: '2026-10-01' });
  assert.equal(slSparse.longestSleep, 600, 'Sleep report longestSleep is the period maximum');
});

test('G3-8 Eating report computes feed gaps, nursing side balance, 1-feed state, and CDC newborn band', async () => {
  const { reports } = await loadModules();
  const entries = makeDayRecords([-7, -6, -5, -4, -3, -2, -1], { feedsPerDay: 8 });
  const r = reports.eatingReport({
    entries,
    todayISO: '2026-11-23',
    nowMin: 570,
    windowDays: 7,
    birthDate: '2026-11-06', // 17 days old -> CDC 8-12 band
  });
  assert.equal(r.avgFeeds, 8);
  assert.equal(r.totalFeeds, 56);
  assert.equal(r.band?.low, 8);
  assert.equal(r.band?.high, 12);
  assert.equal(r.gaps.all.median, 165);
  assert.ok(r.gaps.day.median !== null && r.gaps.night.median !== null);
  assert.equal(r.sideBalance.left, 28);
  assert.equal(r.sideBalance.right, 14);
  assert.equal(r.sideBalance.leftPct, 67);
  assert.equal(r.sideBalance.rightPct, 33);

  // 1-feed state: totalFeeds === 1, no gaps, no side balance
  const one = reports.eatingReport({
    entries: [{ id: 'b1', type: 'bottle', ml: 110, unit: 'ml', t: -1440 + 600 }],
    todayISO: '2026-11-23',
    nowMin: 570,
    windowDays: 7,
    birthDate: '2026-11-06',
  });
  assert.equal(one.totalFeeds, 1);
  assert.equal(one.gaps.all.median, null);
  assert.equal(one.sideBalance, null);
});

test('G3-9 Doctor visit report groups medicines, filters by permissions, and builds exact CSV export URL', async () => {
  const { reports } = await loadModules();
  const entries = [
    ...makeDayRecords([-7, -6, -5, -4, -3, -2, -1], { feedsPerDay: 7, wet: 6, dirty: 2 }),
    { id: 'med:1', type: 'med', name: 'Vitamin D drops', dose: 1, unit: 'drops', t: -2 * DAY + 555 },
    { id: 'med:2', type: 'med', name: 'Vitamin D drops', dose: 1, unit: 'drops', t: -1 * DAY + 555 },
  ];
  const full = reports.doctorReport({
    entries,
    growthEntries: [
      { id: 'weight:1', date: '2026-10-15', kg: 3.9 },
      { id: 'height:1', date: '2026-10-15', cm: 53.2 },
      { id: 'head-circumference:1', date: '2026-10-15', head: 36.1 },
    ],
    todayISO: '2026-11-23',
    nowMin: 570,
    windowDays: 7,
    birthDate: '2026-11-06',
    permissions: { sleep: true, feedings: true, changes: true, weight: true, height: true, head: true, medication: true },
  });
  assert.equal(full.medicines.length, 1);
  assert.equal(full.medicines[0].doses, 2);
  assert.equal(full.medicines[0].name, 'Vitamin D drops');
  assert.equal(full.exportUrl, '/api/export?from=2026-11-16&to=2026-11-23');
  assert.equal(full.days.length, 7);

  // Restricted permissions hide diapers, growth, and medicines cleanly
  const restricted = reports.doctorReport({
    entries,
    growthEntries: [{ id: 'weight:1', date: '2026-10-15', kg: 3.9 }],
    todayISO: '2026-11-23',
    nowMin: 570,
    windowDays: 7,
    birthDate: '2026-11-06',
    permissions: { sleep: true, feedings: false, changes: false, weight: false, height: false, head: false, medication: false },
  });
  assert.equal(restricted.averages.feeds, null);
  assert.equal(restricted.averages.wet, null);
  assert.equal(restricted.averages.sleepMin !== null, true);
  assert.equal(restricted.growth.weight, null);
  assert.deepEqual(restricted.medicines, []);

  // Opened at 3:00 AM -> endOffset is -1, period shifts back one day (Nov 15 to Nov 21)
  const at3am = reports.doctorReport({
    entries,
    growthEntries: [],
    todayISO: '2026-11-23',
    nowMin: 180,
    windowDays: 7,
    birthDate: '2026-11-06',
    permissions: { sleep: true, feedings: true, changes: true, weight: true, height: true, head: true, medication: true },
  });
  assert.equal(at3am.fromDate, '2026-11-15');
  assert.equal(at3am.toDate, '2026-11-21');
  assert.equal(at3am.exportUrl, '/api/export?from=2026-11-15&to=2026-11-22');
});
