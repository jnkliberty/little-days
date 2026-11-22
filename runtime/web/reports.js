/* Pure report data and calculations for Group 3 (plan 2026-11-21, lines 233 to 253).
   Touches no DOM or network. Calls LittleDaysTrends, LittleDaysCryLog, LittleDaysForecast, LittleDaysAgeNorms and LittleDaysCareGuidance
   so there is never a second copy of the sleep, feed, gap, or age-band math. */
globalThis.LittleDaysReports = (() => {
  const DAY = 1440;
  const MAX_CHUNK = 31;
  const trends = () => globalThis.LittleDaysTrends;
  const cryLog = () => globalThis.LittleDaysCryLog;
  const fc = () => globalThis.LittleDaysForecast;
  const norms = () => globalThis.LittleDaysAgeNorms;
  const guidance = () => globalThis.LittleDaysCareGuidance;
  const finite = Number.isFinite;

  const weekdayOf = iso => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  };
  const clockOf = minute => ((Math.round(minute) % DAY) + DAY) % DAY;
  const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  const quantile = (sorted, p) => (fc()?.quantile ? fc().quantile(sorted, p) : sorted[Math.floor((sorted.length - 1) * p)]);

  // Last Monday at 7:00 AM that has already passed, as a day offset from todayISO.
  function weeklyEndOffset(todayISO, nowMin) {
    const since = (weekdayOf(todayISO) + 6) % 7;
    return since === 0 ? (nowMin < trends().DAY_START ? -7 : 0) : -since;
  }

  // Current chart day offset (excludes the unfinished 7 AM day; at 3 AM this is -1).
  function reportEndOffset(nowMin) {
    return trends().offsetOf(nowMin);
  }

  // Monday Home card (D8): shows on Monday from 7 AM until dismissed for that Monday.
  function weeklyCardReady({todayISO, nowMin, dismissedDate = null, canViewWeekly = true} = {}) {
    return Boolean(canViewWeekly) && weekdayOf(todayISO) === 1 && nowMin >= trends().DAY_START && dismissedDate !== todayISO;
  }

  // /api/state chunks of at most 31 days covering [endOffset - windowDays - 1, endOffset + 1).
  function loadChunks(todayISO, endOffset, windowDays) {
    const first = endOffset - windowDays - 1, stop = endOffset + 1;
    const chunks = [];
    for (let cursor = first; cursor < stop; cursor += MAX_CHUNK) {
      const next = Math.min(stop, cursor + MAX_CHUNK);
      chunks.push({from: trends().shiftDate(todayISO, cursor), to: trends().shiftDate(todayISO, next)});
    }
    return chunks;
  }

  function exportUrl(todayISO, endOffset, windowDays) {
    const from = trends().shiftDate(todayISO, endOffset - windowDays);
    const to = trends().shiftDate(todayISO, endOffset);
    return `/api/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }

  function mergedSleeps(entries, periodEndMin) {
    const list = (Array.isArray(entries) ? entries : [])
      .filter(e => e && e.type === 'sleep' && !e.live && finite(e.t) && finite(e.dur) && e.dur > 0 && e.t < periodEndMin)
      .map(e => [e.t, trends().sleepEnd(e)])
      .sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [s, e] of list) {
      const prev = out.at(-1);
      if (prev && s <= prev[1]) prev[1] = Math.max(prev[1], e);
      else out.push([s, e]);
    }
    return out;
  }

  function daySleepSchedule(sleeps, offset) {
    const {startOf, NIGHT_START} = trends();
    const base = startOf(offset), nightStart = base + NIGHT_START, nightEnd = base + DAY;
    const naps = sleeps.filter(([s]) => s >= base && s < nightStart).length;
    const evening = sleeps.filter(([s, e]) => s >= nightStart - 120 && s < nightEnd && e > nightStart);
    const bedtimeRel = evening.length ? evening[0][0] - base : null;
    const morning = evening.filter(([, e]) => e >= nightStart + 360);
    const wakeSource = morning.length ? morning.at(-1) : evening.at(-1);
    const wakeRel = wakeSource ? wakeSource[1] - base : null;
    return {
      naps,
      bedtimeRel,
      wakeRel,
      bedtimeMin: bedtimeRel !== null ? clockOf(base + bedtimeRel) : null,
      wakeMin: wakeRel !== null ? clockOf(base + wakeRel) : null,
    };
  }

  function medianClock(rels, dayStart) {
    const valid = rels.filter(finite).sort((a, b) => a - b);
    return valid.length ? clockOf(dayStart + quantile(valid, 0.5)) : null;
  }

  function gapStats(list) {
    if (!list.length) return {count: 0, median: null, p25: null, p75: null};
    const sorted = [...list].sort((a, b) => a - b);
    return {
      count: sorted.length,
      median: Math.round(quantile(sorted, 0.5)),
      p25: Math.round(quantile(sorted, 0.25)),
      p75: Math.round(quantile(sorted, 0.75)),
    };
  }

  function feedGaps(entries, firstOffset, endOffset) {
    const {startOf} = trends(), {feedPoints, partOf} = cryLog();
    const from = startOf(firstOffset), stop = startOf(endOffset);
    const points = feedPoints(Array.isArray(entries) ? entries : [], stop).filter(p => p.start >= from && p.start < stop);
    const all = [], day = [], night = [];
    for (let i = 1; i < points.length; i++) {
      const gap = points[i].start - points[i - 1].start;
      if (gap <= 0) continue;
      all.push(gap);
      (partOf(points[i].start) === 'day' ? day : night).push(gap);
    }
    return {all: gapStats(all), day: gapStats(day), night: gapStats(night)};
  }

  function sideBalance(entries, firstOffset, endOffset) {
    const {startOf} = trends(), from = startOf(firstOffset), stop = startOf(endOffset);
    let left = 0, right = 0, both = 0;
    for (const e of Array.isArray(entries) ? entries : []) {
      if (!e || e.type !== 'feed' || e.live || !finite(e.t) || e.t < from || e.t >= stop) continue;
      if (e.side === 'L') left++;
      else if (e.side === 'R') right++;
      else if (e.side === 'B') both++;
    }
    const l = left + both, r = right + both, total = l + r;
    if (!total) return null;
    const leftPct = Math.round(l * 100 / total);
    return {left, right, both, total, leftPct, rightPct: 100 - leftPct};
  }

  function growthSummary(growthEntries, permissions = {}) {
    const list = Array.isArray(growthEntries) ? growthEntries : [];
    const pick = (key, allowed) => {
      if (!allowed) return null;
      const pts = list.filter(e => e && finite(e[key]) && e[key] > 0 && typeof e.date === 'string')
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!pts.length) return null;
      const latest = pts.at(-1), prior = pts.length > 1 ? pts.at(-2) : null;
      return {
        latest: {value: latest[key], date: latest.date},
        prior: prior ? {value: prior[key], date: prior.date} : null,
        delta: prior ? latest[key] - prior[key] : null,
      };
    };
    return {
      weight: pick('kg', permissions.weight !== false),
      length: pick('cm', permissions.height !== false),
      head: pick('head', permissions.head !== false),
    };
  }

  function medicinesGiven(entries, firstOffset, endOffset, allowed) {
    if (!allowed) return [];
    const {startOf, shiftDate} = trends(), from = startOf(firstOffset), stop = startOf(endOffset);
    const groups = new Map();
    for (const e of Array.isArray(entries) ? entries : []) {
      if (!e || e.type !== 'med' || !finite(e.t) || e.t < from || e.t >= stop || !e.name) continue;
      const key = `${String(e.name).trim().toLowerCase()}|${e.dose ?? ''}|${e.unit ?? ''}`;
      const existing = groups.get(key) || {name: String(e.name).trim(), dose: e.dose ?? null, unit: e.unit || '', doses: 0, lastT: -Infinity};
      existing.doses++;
      if (e.t > existing.lastT) existing.lastT = e.t;
      groups.set(key, existing);
    }
    return [...groups.values()]
      .sort((a, b) => b.lastT - a.lastT)
      .map(m => ({...m, lastDayOffset: Math.floor(m.lastT / DAY), lastClockMin: clockOf(m.lastT)}));
  }

  function metricAvg(days, key) {
    const vals = days.map(d => d[key]).filter(v => v !== null && finite(v));
    return vals.length ? mean(vals) : null;
  }

  function metricMax(days, key) {
    const vals = days.map(d => d[key]).filter(v => v !== null && finite(v));
    return vals.length ? Math.max(...vals) : null;
  }

  function deltaOf(current, prior, round) {
    if (current === null || prior === null) return null;
    const diff = round(current - prior);
    if (diff === 0) return {delta: 0, amount: 0, direction: 'same'};
    return {delta: diff, amount: Math.abs(diff), direction: diff > 0 ? 'more' : 'less'};
  }

  function periodDays(entries, todayISO, nowMin, birthDate, windowDays, endOffset) {
    const {days} = trends().rows(entries, todayISO, null, null, nowMin, birthDate, windowDays, endOffset);
    return days.filter(d => !birthDate || d.date >= birthDate);
  }

  function weeklyReport({entries = [], growthEntries = [], todayISO, nowMin, birthDate = null, permissions = {}, spanish = false}) {
    const endOffset = weeklyEndOffset(todayISO, nowMin);
    const allDays = periodDays(entries, todayISO, nowMin, birthDate, 14, endOffset);
    const currentDays = allDays.filter(d => d.offset >= endOffset - 7 && d.offset < endOffset);
    const priorDays = allDays.filter(d => d.offset >= endOffset - 14 && d.offset < endOffset - 7);
    const hasPrior = priorDays.length === 7 && priorDays.some(d => d.logged);
    const sleeps = permissions.sleep !== false ? mergedSleeps(entries, trends().startOf(endOffset)) : [];
    const napCounts = currentDays.filter(d => d.sleepMin !== null).map(d => daySleepSchedule(sleeps, d.offset).naps);
    const sleepAvg = permissions.sleep !== false ? metricAvg(currentDays, 'sleepMin') : null;
    const feedAvg = permissions.feedings !== false ? metricAvg(currentDays, 'feedCount') : null;
    const wetAvg = permissions.changes !== false ? metricAvg(currentDays, 'wet') : null;
    const dirtyAvg = permissions.changes !== false ? metricAvg(currentDays, 'dirty') : null;
    const ageDays = cryLog().ageDaysOf(birthDate, todayISO);
    const round1 = v => Math.round(v * 10) / 10;
    return {
      endOffset,
      currentFrom: trends().shiftDate(todayISO, endOffset - 7),
      currentTo: trends().shiftDate(todayISO, endOffset - 1),
      priorFrom: trends().shiftDate(todayISO, endOffset - 14),
      priorTo: trends().shiftDate(todayISO, endOffset - 8),
      currentDays,
      priorDays,
      hasPrior,
      loggedDays: currentDays.filter(d => d.logged).length,
      averages: {
        sleepMin: sleepAvg,
        napsPerDay: permissions.sleep !== false && napCounts.length ? mean(napCounts) : null,
        longestSleep: permissions.sleep !== false ? metricMax(currentDays, 'longestSleep') : null,
        feeds: feedAvg,
        bottleMl: permissions.feedings !== false ? metricAvg(currentDays, 'bottleMl') : null,
        wet: wetAvg,
        dirty: dirtyAvg,
        diapers: permissions.changes !== false ? mean(currentDays.filter(d => d.wet !== null || d.dirty !== null).map(d => (d.wet || 0) + (d.dirty || 0))) : null,
      },
      deltas: {
        sleepMin: hasPrior && permissions.sleep !== false ? deltaOf(sleepAvg, metricAvg(priorDays, 'sleepMin'), Math.round) : null,
        feeds: hasPrior && permissions.feedings !== false ? deltaOf(feedAvg, metricAvg(priorDays, 'feedCount'), round1) : null,
        wet: hasPrior && permissions.changes !== false ? deltaOf(wetAvg, metricAvg(priorDays, 'wet'), round1) : null,
      },
      growth: growthSummary(growthEntries, permissions),
      guide: guidance().forAge(ageDays, spanish),
      ageDays,
    };
  }

  function sleepReport({entries = [], todayISO, nowMin, windowDays = 7, birthDate = null, spanish = false}) {
    const endOffset = reportEndOffset(nowMin);
    const days = periodDays(entries, todayISO, nowMin, birthDate, windowDays, endOffset);
    const sleeps = mergedSleeps(entries, trends().startOf(endOffset));
    const schedule = days.map(d => ({offset: d.offset, date: d.date, nightMin: d.nightMin, napMin: d.napMin, sleepMin: d.sleepMin, ...daySleepSchedule(sleeps, d.offset)}));
    const logged = schedule.filter(d => d.sleepMin !== null);
    const ageDays = cryLog().ageDaysOf(birthDate, todayISO);
    return {
      endOffset,
      windowDays,
      fromDate: trends().shiftDate(todayISO, endOffset - windowDays),
      toDate: trends().shiftDate(todayISO, endOffset - 1),
      days,
      schedule,
      loggedDays: logged.length,
      totalNaps: logged.reduce((sum, d) => sum + d.naps, 0),
      avgSleepMin: metricAvg(days, 'sleepMin'),
      avgNightMin: metricAvg(days, 'nightMin'),
      avgNapMin: metricAvg(days, 'napMin'),
      avgNaps: logged.length ? mean(logged.map(d => d.naps)) : null,
      longestSleep: metricMax(days, 'longestSleep'),
      typicalBedtimeMin: medianClock(schedule.map(d => d.bedtimeRel), trends().DAY_START),
      typicalWakeMin: medianClock(schedule.map(d => d.wakeRel), trends().DAY_START),
      band: norms().normFor('sleepHours', ageDays),
      guide: guidance().byId('care-safe-sleep', spanish),
      ageDays,
    };
  }

  function eatingReport({entries = [], todayISO, nowMin, windowDays = 7, birthDate = null, spanish = false}) {
    const endOffset = reportEndOffset(nowMin);
    const days = periodDays(entries, todayISO, nowMin, birthDate, windowDays, endOffset);
    const firstOffset = days.length ? days[0].offset : endOffset - windowDays;
    const totalFeeds = days.reduce((sum, d) => sum + (d.feedCount || 0), 0);
    const totalBreast = days.reduce((sum, d) => sum + (d.breastCount || 0), 0);
    const totalBottle = days.reduce((sum, d) => sum + (d.bottleCount || 0), 0);
    const ageDays = cryLog().ageDaysOf(birthDate, todayISO);
    return {
      endOffset,
      windowDays,
      fromDate: trends().shiftDate(todayISO, endOffset - windowDays),
      toDate: trends().shiftDate(todayISO, endOffset - 1),
      days,
      loggedDays: days.filter(d => d.feedCount !== null).length,
      totalFeeds,
      totalBreast,
      totalBottle,
      avgFeeds: metricAvg(days, 'feedCount'),
      avgBottleMl: metricAvg(days, 'bottleMl'),
      avgBottlesPerDay: metricAvg(days, 'bottleCount'),
      gaps: feedGaps(entries, firstOffset, endOffset),
      sideBalance: sideBalance(entries, firstOffset, endOffset),
      band: norms().normFor('feeds', ageDays),
      guide: guidance().byId('care-feeding-cues', spanish),
      ageDays,
    };
  }

  function doctorReport({entries = [], growthEntries = [], todayISO, nowMin, windowDays = 7, birthDate = null, permissions = {}}) {
    const endOffset = reportEndOffset(nowMin);
    const days = periodDays(entries, todayISO, nowMin, birthDate, windowDays, endOffset);
    const firstOffset = days.length ? days[0].offset : endOffset - windowDays;
    const sleeps = permissions.sleep !== false ? mergedSleeps(entries, trends().startOf(endOffset)) : [];
    const dayRows = days.map(d => ({
      offset: d.offset,
      date: d.date,
      feedCount: permissions.feedings !== false ? d.feedCount : null,
      breastCount: permissions.feedings !== false ? d.breastCount : null,
      bottleCount: permissions.feedings !== false ? d.bottleCount : null,
      bottleMl: permissions.feedings !== false ? d.bottleMl : null,
      wet: permissions.changes !== false ? d.wet : null,
      dirty: permissions.changes !== false ? d.dirty : null,
      sleepMin: permissions.sleep !== false ? d.sleepMin : null,
      nightMin: permissions.sleep !== false ? d.nightMin : null,
      napMin: permissions.sleep !== false ? d.napMin : null,
      naps: permissions.sleep !== false ? daySleepSchedule(sleeps, d.offset).naps : null,
    }));
    return {
      endOffset,
      windowDays,
      fromDate: trends().shiftDate(todayISO, endOffset - windowDays),
      toDate: trends().shiftDate(todayISO, endOffset - 1),
      exportUrl: exportUrl(todayISO, endOffset, windowDays),
      ageDays: cryLog().ageDaysOf(birthDate, todayISO),
      averages: {
        feeds: permissions.feedings !== false ? metricAvg(days, 'feedCount') : null,
        sleepMin: permissions.sleep !== false ? metricAvg(days, 'sleepMin') : null,
        wet: permissions.changes !== false ? metricAvg(days, 'wet') : null,
        dirty: permissions.changes !== false ? metricAvg(days, 'dirty') : null,
      },
      growth: growthSummary(growthEntries, permissions),
      medicines: medicinesGiven(entries, firstOffset, endOffset, permissions.medication !== false),
      days: dayRows,
    };
  }

  return {
    weeklyEndOffset,
    reportEndOffset,
    weeklyCardReady,
    loadChunks,
    exportUrl,
    weeklyReport,
    sleepReport,
    eatingReport,
    doctorReport,
  };
})();
