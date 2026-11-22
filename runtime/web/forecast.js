/* The feed and nap forecasts of the insight card (plan 2026-11-21, Group 1; look approved by owner 2026-11-21, round 2).
   It sets globalThis.LittleDaysForecast and touches no browser object, so a node script can load it (tools/forecast-replay.mjs).
   Load after web/cry.js: the sessions, the gaps and the day split come from LittleDaysCryLog. Time is in minutes on the axis of
   S.entries: minute 0 is today at midnight (local), a day is 1440.

   forecast({entries, now, run, sleepRun, complete, feeds, sleep}) -> {feed, nap}
     Each is null when it is left out: that care runs (a paused sleep counts as asleep), the adult may not view it (`feeds`, `sleep`),
     the 7 days are not loaded (`complete`), or, for the nap, it is night (7 PM to 7 AM). Otherwise:
     {state: 'window' | 'passed' | 'few', from, to, gaps, period}
       few     fewer than 8 gaps in the last 7 days (no from or to)
       window  from and to are minutes, rounded to 5: the last feed start (or wake time) plus the 25th and 75th percentile
               of the gaps of the same period (feed: day or night; nap: day awake times)
       passed  as window, and now is after `to` with no new record
*/
globalThis.LittleDaysForecast = (() => {
  const MIN_GAPS = 8;
  const log = () => globalThis.LittleDaysCryLog;
  const quantile = (sorted, p) => { const i = (sorted.length - 1) * p, lo = Math.floor(i); return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo); };
  const round5 = m => Math.round(m / 5) * 5;

  function windowOf(gaps, last, now, period) {
    if (gaps.length < MIN_GAPS || last == null) return {state: 'few', gaps: gaps.length, period};
    const sorted = [...gaps].sort((a, b) => a - b), from = round5(last + quantile(sorted, 0.25));
    const to = Math.max(from + 5, round5(last + quantile(sorted, 0.75)));
    return {state: now > to ? 'passed' : 'window', from, to, last, gaps: gaps.length, period};
  }

  function forecast({entries = [], now, run = null, sleepRun = null, complete = false, feeds = true, sleep = true}) {
    if (complete !== true || !Number.isFinite(now)) return {feed: null, nap: null};
    const {feedPoints, sleepPoints, gapsOf, partOf} = log(), list = Array.isArray(entries) ? entries : [], period = partOf(now);
    let feed = null, nap = null;
    if (feeds && !run) {
      const points = feedPoints(list, now);
      feed = windowOf(gapsOf(points, now, period), points.at(-1)?.start, now, period);
    }
    if (sleep && !sleepRun && period === 'day') {
      // Overlapping sleep records (a duplicate log) merge into one sleep, so a record inside another moves no gap and no wake.
      const points = sleepPoints(list, now).reduce((out, p) => {
        const prev = out.at(-1);
        if (prev && p.start <= prev.end) prev.end = Math.max(prev.end, p.end); else out.push({...p});
        return out;
      }, []);
      nap = windowOf(gapsOf(points, now, 'day'), points.at(-1)?.end, now, 'day');
    }
    return {feed, nap};
  }

  return {forecast, quantile, MIN_GAPS};
})();
