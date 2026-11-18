globalThis.LittleDaysTrends = (() => {
  const DAY = 1440;
  const DAY_START = 7 * 60;
  const NIGHT_START = 12 * 60;  // 7 PM, counted from the 7 AM day start
  const WINDOW = 7;  // full days before today on every chart and in At a glance (owner request, 2026-11-11, R6)
  const feedSessionKey = (entry, index) => entry.sid ? `session:${entry.sid}` : `entry:${entry.id ?? index}`;
  const sleepEnd = entry => Number.isFinite(entry.tEnd) ? entry.tEnd : entry.t + entry.dur;
  const offsetOf = minute => Math.floor((minute - DAY_START) / DAY);
  const startOf = offset => offset * DAY + DAY_START;
  const shiftDate = (date, days) => {
    const [y, m, d] = date.split('-').map(Number), next = new Date(Date.UTC(y, m - 1, d + days));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  };
  const makeDay = offset => ({offset, logged: false, feeds: [], wet: null, dirty: null, bottleMl: null, pumpMl: null, sleep: [], liveSleep: [], sleepParts: [], sleepCount: 0, change: null});

  // A sleep ends at `tEnd` on the wall-clock axis of `t` (the server sends it). `shift` marks the one clock change inside the sleep:
  // `at` is the minute after the change and `minutes` is how far the real minutes differ from the wall-clock minutes (-60 when the clock
  // jumps ahead, +60 when it falls back). The wall clock resumes at `at - 1 - minutes`, so a sleep across the change is two wall-clock
  // parts: one before the change and one after it. The parts draw on the wall-clock axis; sleep minutes come from `realSleep`.
  function addSleep(entry, byOffset) {
    const end = sleepEnd(entry);
    const change = entry.shift && !entry.live && Number.isFinite(entry.shift.at) && Number.isFinite(entry.shift.minutes) ? {at: entry.shift.at - 1, minutes: entry.shift.minutes} : null;
    const parts = change ? [[entry.t, change.at, 0], [change.at - change.minutes, end, 1]] : [[entry.t, end, null]];
    // The real start (minutes since 1970) tells the two passes of a repeated hour apart: a sleep with no clock-change marker still has it.
    const instant = Date.parse(entry.startISO) / 60000;
    for (const [offset, day] of byOffset) {
      const base = day.start ?? startOf(offset), limit = day.end ?? base + DAY;
      if (change && change.at >= base && change.at < limit) day.change = {at: change.at - base, minutes: change.minutes, instant: instant + change.at - entry.t};
      for (const [from, to, phase] of parts) {
        const start = Math.max(from, base), stop = Math.min(to, limit);
        if (start >= stop) continue;
        (entry.live ? day.liveSleep : day.sleep).push([start - base, stop - base]);
        day.sleepParts.push([start - base, stop - base, phase, instant]);
        day.logged = true;
      }
    }
  }

  // The day's sleep on a real-minute axis: a part after the clock change moves by the change, so a sleep across it stays one piece,
  // a repeated hour counts twice and a skipped hour counts none. Overlapping records merge here, once. A day with no change is the wall-clock axis.
  function realSleep(day) {
    const change = day.change;
    return mergeIntervals(day.sleepParts.map(([start, end, phase, instant]) => {
      const known = Number.isFinite(instant) && Number.isFinite(change?.instant);
      const after = phase === 1 || (phase === null && change && (known ? instant >= change.instant : start >= Math.max(change.at, change.at - change.minutes)));
      return change && after ? [start + change.minutes, end + change.minutes] : [start, end];
    }));
  }

  function addFeed(entry, index, feedSessions) {
    const key = feedSessionKey(entry, index);
    const session = feedSessions.get(key) || {segments: []};
    session.segments.push(entry);
    feedSessions.set(key, session);
  }

  function addEntry(entry, index, byOffset, feedSessions) {
    if (!entry || !Number.isFinite(entry.t)) return;
    const day = byOffset.get(offsetOf(entry.t));
    if (day) day.logged = true;
    if (entry.type === 'feed' || entry.type === 'bottle') {
      addFeed(entry, index, feedSessions);
      if (entry.type === 'bottle' && day && !entry.live) {
        day.bottleMl ??= 0;
        if (Number.isFinite(entry.ml) && entry.ml > 0) day.bottleMl += entry.ml;
      }
    } else if (entry.type === 'diaper' && day) {
      day.wet ??= 0;
      day.dirty ??= 0;
      if (entry.kind === 'W' || entry.kind === 'B') day.wet++;
      if (entry.kind === 'D' || entry.kind === 'B') day.dirty++;
    } else if (entry.type === 'pump' && day && Number.isFinite(entry.ml) && entry.ml > 0) {
      day.pumpMl += entry.ml;
    } else if (entry.type === 'sleep' && Number.isFinite(entry.dur) && entry.dur > 0) addSleep(entry, byOffset);
  }

  function mergeSleep(day) {
    const completed = mergeIntervals(day.sleep);
    let live = mergeIntervals(day.liveSleep);
    for (const [start, end] of completed) {
      live = live.flatMap(([a, b]) => {
        if (end <= a || start >= b) return [[a, b]];
        const remaining = [];
        if (a < start) remaining.push([a, start]);
        if (end < b) remaining.push([end, b]);
        return remaining;
      });
    }
    day.liveSleep = live;
    day.sleep = mergeIntervals([...completed, ...live]);
    const real = realSleep(day);
    day.sleepCount = real.length;
    day.sleepMin = real.length ? real.reduce((sum, [start, end]) => sum + end - start, 0) : null;
    day.longestSleep = real.length ? real.reduce((longest, [start, end]) => Math.max(longest, end - start), 0) : null;
    // Night is 7 PM to 7 AM. A chart day starts at 7 AM, so its minutes from NIGHT_START to the end are night and the rest is nap.
    // Both come from the real-minute intervals, so night and nap always add up to the day's sleep, also on a clock-change day.
    day.nightMin = real.length ? real.reduce((sum, [start, end]) => sum + Math.max(0, end - Math.max(start, NIGHT_START)), 0) : null;
    day.napMin = real.length ? day.sleepMin - day.nightMin : null;
  }

  function mergeIntervals(intervals) {
    const merged = [];
    intervals.sort((a, b) => a[0] - b[0]);
    for (const [start, end] of intervals) {
      const previous = merged.at(-1);
      if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
      else merged.push([start, end]);
    }
    return merged;
  }

  // The average of the days that have a value. A day with no record is left out, not counted as zero.
  function metric(days, key) {
    const recorded = days.filter(day => day[key] !== null), loggedDays = recorded.length;
    return {values: days.map(day => day[key]), loggedDays, average: loggedDays ? recorded.reduce((sum, day) => sum + day[key], 0) / loggedDays : null};
  }

  function addSession(segments, byOffset) {
    segments.sort((a, b) => a.t - b.t);
    const breast = segments.filter(entry => entry.type === 'feed');
    const marker = {t: segments[0].t, L: breast.length ? breast.map(entry => entry.side || '').join('') : 'B', kind: breast.length ? 'breast' : 'bottle'};
    const ml = segments.filter(entry => entry.type === 'bottle' && Number.isFinite(entry.ml) && entry.ml > 0).reduce((sum, entry) => sum + entry.ml, 0);
    if (ml) marker.ml = ml;
    if (segments.some(entry => entry.live)) marker.live = true;
    // A bottle's time never becomes breast time, even in a shared session.
    if (!breast.length) {
      byOffset.get(offsetOf(marker.t))?.feeds.push(marker);
      return;
    }
    if (!breast.every(entry => Number.isFinite(entry.dur) && entry.dur > 0)) {
      byOffset.get(offsetOf(marker.t))?.feeds.push(marker);
      return;
    }
    const intervals = mergeIntervals(breast.map(entry => [entry.t, entry.t + entry.dur]));
    const startDay = offsetOf(marker.t);
    for (const [offset, day] of byOffset) {
      const base = startOf(offset), clipped = intervals.map(([a,b]) => [Math.max(a, base), Math.min(b, base + DAY)]).filter(([a,b]) => a < b);
      if (!clipped.length && offset !== startDay) continue;
      day.logged = true;
      day.feeds.push({...marker, t: offset === startDay ? marker.t : clipped[0][0], dur: clipped.reduce((sum, [a,b]) => sum + b - a, 0),
        ...(startDay !== offset ? {carry: true} : {})});
    }
  }

  function collect(entries, offsets, activeSleep, activeFeed) {
    const days = offsets.map(makeDay), byOffset = new Map(days.map(day => [day.offset, day])), sessions = new Map();
    for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) addEntry(entry, index, byOffset, sessions);
    if (activeSleep) addEntry({type: 'sleep', t: activeSleep.t0, dur: activeSleep.now - activeSleep.t0, live: true}, 'active', byOffset, sessions);
    if (activeFeed) addEntry({...activeFeed, type: activeFeed.side === 'bottle' ? 'bottle' : 'feed', t: activeFeed.t0, live: true}, 'active', byOffset, sessions);
    for (const {segments} of sessions.values()) addSession(segments, byOffset);
    for (const day of days) {
      day.feeds.sort((a, b) => a.t - b.t);
      const starts = day.feeds.filter(feed => !feed.carry);
      day.feedCount = starts.length || null;
      day.breastCount = starts.length ? starts.filter(feed => feed.kind === 'breast').length : null;
      day.bottleCount = starts.length ? starts.filter(feed => feed.kind === 'bottle').length : null;
      if (starts.length) day.bottleMl ??= 0;
      mergeSleep(day);
    }
    return days;
  }

  // dayStart is the minute after midnight when a day begins: 7 AM for the Charts, 0 for day totals.
  // A later start is counted by moving every record by the difference, so the one set of rules stays the only set.
  function day(entries, offset, activeSleep = null, activeFeed = null, dayStart = DAY_START) {
    const shift = DAY_START - dayStart;
    if (!shift) return collect(entries, [offset], activeSleep, activeFeed)[0];
    const moved = (Array.isArray(entries) ? entries : []).map(entry => entry && Number.isFinite(entry.t) ? {...entry, t: entry.t + shift,
      ...(Number.isFinite(entry.tEnd) ? {tEnd: entry.tEnd + shift} : {}), ...(entry.shift && Number.isFinite(entry.shift.at) ? {shift: {...entry.shift, at: entry.shift.at + shift}} : {})} : entry);
    const result = collect(moved, [offset], activeSleep && {...activeSleep, t0: activeSleep.t0 + shift, now: activeSleep.now + shift},
      activeFeed && {...activeFeed, t0: activeFeed.t0 + shift})[0];
    for (const feed of result.feeds) feed.t -= shift;
    return result;
  }

  // One calendar day, midnight to midnight, as the numbers a Home card or a Timeline day shows.
  function totals(entries, offset, activeSleep = null, activeFeed = null) {
    // A feed counts once, on its start day. Its nursing minutes split at midnight, as sleep minutes do.
    const recorded = day(entries, offset, activeSleep, activeFeed, 0);
    return {
      feeds: recorded.feeds.filter(feed => !feed.carry).length,
      nurseMin: recorded.feeds.reduce((sum, feed) => sum + (feed.dur || 0), 0),
      bottleMl: recorded.bottleMl || 0,
      sleepMin: recorded.sleepMin || 0,
      sleeps: recorded.sleepCount,
    };
  }

  function firstOffset(entries, today, birthDate, current, activeSleep, activeFeed) {
    const birth = (Date.parse(birthDate) - Date.parse(today)) / 86400000;
    if (!Number.isFinite(birth)) return current - WINDOW;
    const times = [...(entries || []).map(entry => entry?.t), activeSleep?.t0, activeFeed?.t0];
    const early = times.some(t => t >= birth * DAY && t < startOf(birth));
    return Math.min(current, Math.max(current - WINDOW, birth - (early ? 1 : 0)));
  }

  function rows(entries, today, activeSleep = null, activeFeed = null, now = DAY_START, birthDate = null) {
    const current = offsetOf(now);
    const first = firstOffset(entries, today, birthDate, current, activeSleep, activeFeed);
    const days = collect(entries, Array.from({length: current - first + 1}, (_, i) => first + i), activeSleep, activeFeed);
    for (const day of days) day.date = shiftDate(today, day.offset);
    return {days: days.slice(0, -1), today: days.at(-1)};
  }

  function summarize(entries, today, activeSleep = null, activeFeed = null, now = DAY_START, birthDate = null) {
    const {days: full} = rows(entries, today, activeSleep, activeFeed, now, birthDate);
    const days = full.filter(day => !birthDate || day.date >= birthDate);
    const series = key => metric(days, key);
    return {
      days: days.map(({date, offset}) => ({date, offset})),
      loggedDays: days.filter(day => day.logged).length,
      metrics: {
        feeds: series('feedCount'), wet: series('wet'), dirty: series('dirty'),
        sleepMin: series('sleepMin'), longestSleep: series('longestSleep'),
        bottleMl: series('bottleMl'), pumpMl: series('pumpMl'),
      },
    };
  }

  function sleepWithin(entries, start, end) {
    const day = {...makeDay(0), start, end}, windows = new Map([[0, day]]);
    const evidence = [];
    for (const entry of entries) {
      const previous = day.sleepParts.length;
      addSleep(entry, windows);
      if (day.sleepParts.length > previous) evidence.push(entry);
    }
    const intervals = realSleep(day).map(([a,b]) => b - a);
    return {total: intervals.reduce((sum, minutes) => sum + minutes, 0), longest: Math.max(0, ...intervals), evidence};
  }

  return {summarize, day, rows, totals, sleepWithin, sleepEnd, feedSessionKey, DAY_START, NIGHT_START, WINDOW};
})();
