/* Chart drawings, ported from the approved mockup (design/2026-11-10-release-look/round-2 and round-3: columns, rhythm, growth).
   They draw SVG text only. The app owns the words, the colors (CSS variables) and the day pick.
   An axis uses the mockup's limits while the records fit inside them and grows when a record is larger. */
globalThis.LittleDaysCharts = (() => {
  const svg = (w, h, label, body) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body}</svg>`;
  const lap = (a, z, lo, hi) => Math.max(0, Math.min(z, hi) - Math.max(a, lo));

  // The top of an axis and its gridlines. `base` is the mockup's top; `step` is the gap between lines.
  // A bigger value moves the top up to the next step, so no bar leaves its plot.
  function scale(base, step, biggest) {
    const max = biggest > base ? Math.ceil(biggest / step - 1e-9) * step : base;
    const ticks = [];
    for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
    return {max, ticks};
  }

  // Bars for each day. Each row is {x, part, v: [stacked parts], tip}. `part` marks Today: a hollow bar on a tint band, with its part names beside it.
  // panel = {max, ticks, tick, colors, names}. The hit rectangle is the day picker (a slider); the app reads data-dates.
  function columns(w, label, rows, panel, dates, focus, valueText) {
    const L = 40, R = 56, top = 8, ph = 152, n = rows.length, band = (w - L - R) / n, bw = Math.min(20, band - 8);
    const px = ph / panel.max, h = top + ph + 32, colX = i => L + i * band + 2, base = top + ph;
    let out = `<rect class="now" x="${colX(n - 1)}" y="${top - 4}" width="${band - 4}" height="${ph + 4}" rx="8"/>`;
    const names = [];
    for (const t of panel.ticks) {
      const y = base - t * px;
      out += `<line class="grid" x1="${L}" x2="${w - R}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 5}" text-anchor="end">${(panel.tick || String)(t)}</text>`;
    }
    rows.forEach((r, i) => {
      const x = L + i * band + (band - bw) / 2, o = r.part ? 1 : 0;
      let y = base;
      r.v.forEach((v, k) => {
        if (!v) { if (r.part && panel.names[k]) names.push([panel.names[k], y - 2]); return; }
        const hh = v * px, yT = y - hh, hg = hh - (y < base ? 2 : 0), rr = Math.max(o + 1, Math.min(8, hg - o)), c = rr - o;
        const paint = o ? 'fill="var(--card)" stroke="var(--c-ink)" stroke-width="2"' : `fill="${panel.colors[k]}"`;
        out += r.v.slice(k + 1).some(Boolean) ? `<rect x="${x + o}" y="${yT + o}" width="${bw - 2 * o}" height="${hg - 2 * o}" ${paint}/>`
          : `<path d="M${x + o} ${yT + hg - o}V${yT + rr}a${c} ${c} 0 0 1 ${c}-${c}h${bw - 2 * rr}a${c} ${c} 0 0 1 ${c} ${c}V${yT + hg - o}Z" ${paint}/>`;
        if (r.part && panel.names[k]) names.push([panel.names[k], yT + hg / 2 + 5]);
        y = yT;
      });
    });
    names.forEach((m, k) => { if (k && names[k - 1][1] - m[1] < 16) m[1] = names[k - 1][1] - 16; out += `<text class="name" x="${w - R + 8}" y="${m[1]}">${m[0]}</text>`; });
    rows.forEach((r, i) => {
      out += `<text${r.part ? ` class="val" x="${L + i * band + (band - bw) / 2}"` : ` x="${L + (i + .5) * band}" text-anchor="middle"`} y="${h - 8}">${r.x}</text><rect class="col" x="${colX(i)}" y="${top - 4}" width="${band - 4}" height="${ph + 4}" rx="8"/>`;
    });
    out += `<rect class="hit" x="${L}" y="${top - 4}" width="${w - L - R}" height="${ph + 32}" rx="8" tabindex="0" role="slider" data-focus="${focus}" aria-label="${label}" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${n}" aria-valuetext="${valueText}" data-i="${n - 1}" data-dates="${dates.join('|')}"/>`;
    return svg(w, h, label, out);
  }

  // Daily rhythm: one row for each chart day, from 7 AM to 7 AM. The night band is 7 PM to 7 AM, the right half of the row.
  // A row is {label, today, sleep: [[from, to]] (minutes after 7 AM), feeds: [{t (minutes after 7 AM), kind}], until (minutes drawn), empty (words or '')}.
  function rhythm(w, rows, axis, label) {
    const L = 52, pw = w - L, rh = 32, top = 28, n = rows.length, h = top + n * rh + 4, X = m => L + pw * m / 1440;
    let out = `<rect x="${X(720)}" y="${top}" width="${w - X(720)}" height="${n * rh}" fill="var(--chart-night)"/>`;
    out += axis.map(([m, text, anchor]) => `<text x="${X(m)}" y="16" text-anchor="${anchor}">${text}</text>`).join('');
    rows.forEach((r, d) => {
      const y = top + d * rh;
      let marks = '';
      for (const [a, z] of r.sleep) {
        const m = lap(a, z, 0, r.until);
        if (m) marks += `<rect x="${X(Math.max(a, 0))}" y="${y + 16}" width="${Math.max(2, pw * m / 1440)}" height="10" rx="5" fill="var(--chart-sleep)"/>`;
      }
      for (const f of r.feeds) {
        if (f.t < 0 || f.t > r.until) continue;
        const x = X(f.t);
        marks += f.kind === 'bottle' ? `<path d="M${x} ${y + 2}l6 6-6 6-6-6Z" fill="var(--chart-bottle)" stroke="var(--card)" stroke-width="2"/>`
          : `<circle cx="${x}" cy="${y + 8}" r="5" fill="var(--chart-breast)" stroke="var(--card)" stroke-width="2"/>`;
      }
      if (r.empty) marks += `<text x="${L + 8}" y="${y + 21}">${r.empty}</text>`;
      out += `<line class="grid" x1="0" x2="${w}" y1="${y + rh}" y2="${y + rh}"/><text x="0" y="${y + 22}"${r.today ? ' class="val"' : ''}>${r.label}</text>${marks}`;
    });
    return svg(w, h, label, out);
  }

  // Growth: the measurements only (R8). m = {lo, hi, ticks, weeks (the right end of the age axis), points: [{week, value}]}; words = {birth, weeks (text for the right end), mid}.
  function growth(w, m, words, label) {
    const L = 32, R = 16, h = 216, top = 12, base = h - 32, X = k => L + (w - L - R) * k / m.weeks, Y = v => base - (base - top) * (v - m.lo) / (m.hi - m.lo);
    let out = '';
    for (const t of m.ticks) out += `<line class="grid" x1="${L}" x2="${w - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 8}" y="${Y(t) + 5}" text-anchor="end">${t}</text>`;
    const end = m.points[m.points.length - 1];
    if (m.points.length > 1) out += `<path d="M${m.points.map(p => `${X(p.week)} ${Y(p.value)}`).join('L')}" fill="none" stroke="var(--chart-line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    out += m.points.map(p => `<circle cx="${X(p.week)}" cy="${Y(p.value)}" r="5" fill="var(--chart-line)" stroke="var(--card)" stroke-width="2"/>`).join('');
    out += `<text class="val" x="${Math.max(L + 24, X(end.week) - 4)}" y="${Y(end.value) - 12}" text-anchor="end">${words.name}</text>`;
    out += `<text x="${L}" y="${h - 8}">${words.birth}</text><text x="${X(m.weeks / 2)}" y="${h - 8}" text-anchor="middle">${words.mid}</text><text x="${X(m.weeks)}" y="${h - 8}" text-anchor="end">${words.end}</text>`;
    return svg(w, h, label, out);
  }

  // Home card graphs (owner, 2026-11-18: the text cards should be "better visual and easier to understand").
  // They draw marks only; the app puts the labels under them as page text, so labels stay 14 px at any card width.
  // mini: one column per day. Past days are outlined, today is solid.
  // bars = [{value, today}], usual = a value or null, floor = the smallest half-scale in the unit (2 for counts, 0 for durations).
  // With no usual level (null, the today card), columns stand on zero. A usual of 0 is still a usual level.
  // With a usual level, each column runs from the dashed usual line up (more) or down (less) (owner, 2026-11-19).
  function mini(bars, usual, label, floor = 0) {
    return usual != null ? fromUsual(bars, usual, label, floor) : fromZero(bars, label);
  }
  // Past columns are outlined with the card color inside, so the dashed line never shows through them; today is solid.
  const column = (b, x, bw, y0, y1, extra = '') => b.today ? `<rect class="today${extra}" x="${x}" y="${y0}" width="${bw}" height="${y1 - y0}" rx="3"/>`
    : `<rect class="past${extra}" x="${x + 1}" y="${y0 + 1}" width="${bw - 2}" height="${Math.max(0, y1 - y0 - 2)}" rx="2" vector-effect="non-scaling-stroke"/>`;
  function fromZero(bars, label) {
    const w = 280, ph = 48, n = bars.length, band = w / n, bw = Math.min(n > 2 ? 24 : 48, band - 8);
    const top = 1.2 * Math.max(...bars.map(b => b.value)) || 1, Y = v => ph - ph * v / top;
    let out = `<line class="base" x1="0" x2="${w}" y1="${ph}" y2="${ph}" vector-effect="non-scaling-stroke"/>`;
    // A positive value is at least 8 units tall on the base line, so a small past day keeps its outline (review, 2026-11-19).
    bars.forEach((b, i) => { if (b.value) out += column(b, i * band + (band - bw) / 2, bw, Math.min(Y(b.value), ph - 8), ph); });
    return svg(w, ph, label, out);
  }
  // Half the plot is one half-scale: max(largest difference, 10 percent of usual, unit floor), so a small difference never looks dramatic.
  // A day that differs from usual is at least 8 units tall in its direction. A day equal to usual is an 8-unit box centered on the line
  // (outlined for a past day, solid for today). A day with no record (value null) draws nothing; a recorded 0 draws. There is no zero line (review, 2026-11-19).
  // 48 units tall (was 64), so the Home card fits 264 px at 390 px (card mix, owner, 2026-11-19).
  const MINI_H = 48;
  function fromUsual(bars, usual, label, floor) {
    const w = 280, mid = MINI_H / 2, n = bars.length, band = w / n, bw = Math.min(24, band - 8);
    const half = Math.max(...bars.filter(b => b.value != null).map(b => Math.abs(b.value - usual)), 0.1 * usual, floor) || 1, k = (mid - 1) / half;
    // The line goes first, so every box sits on top of it.
    let out = `<line class="usual" x1="0" x2="${w}" y1="${mid}" y2="${mid}" vector-effect="non-scaling-stroke"/>`;
    bars.forEach((b, i) => {
      if (b.value == null) return;
      const x = i * band + (band - bw) / 2, d = b.value - usual;
      if (Math.abs(d) < 0.5) { out += column(b, x, bw, mid - 4, mid + 4, ' same'); return; }
      const y = mid - Math.sign(d) * Math.max(8, Math.abs(d) * k);
      out += column(b, x, bw, Math.min(y, mid), Math.max(y, mid));
    });
    return svg(w, MINI_H, label, out);
  }

  // dayline: today's feeds from midnight to midnight. Each bottle is a thin bar at its time, as tall as its mL; a bottle with
  // no amount is a short hollow bar. Nursing sessions are dots in a band under the base line, so a dot never hides under a bar.
  // A gray line marks now. marks = [{t (minutes after midnight), ml (or null), nurse, shown}]. DAYLINE_PAD is the side inset, as a share of the width.
  // The app writes each bottle's number above its bar as page text, at the place daylineLabels gives.
  // Card mix (owner, 2026-11-19): 40 units tall (was 76). Bars 2 to 20 units, room 12 above the tallest for its number, nursing dots r 3.
  const DAYLINE_PAD = 10 / 280, DL = {w:280, h:40, base:32, room:12, hollow:6, bar:6, dot:37, r:3};
  const dlX = m => DL.w * DAYLINE_PAD + DL.w * (1 - 2 * DAYLINE_PAD) * Math.max(0, Math.min(1440, m)) / 1440;
  // A measured bottle maps linearly onto 2 to 34 units (2 + 32 x mL / largest), so a larger amount is always a taller bar.
  // Bars go left to right by time; each center is at least bar width + 1 units right of the one before, and a run that would
  // pass the now line shifts left to end there, so no bar is ever drawn after now (owner, 2026-11-19). Numbers use the moved centers.
  // Whole bars stay inside: centers run from midnight + half a bar to now - half a bar (Codex r1, 2026-11-19). When the bars
  // do not fit there at that spacing (just after midnight, or about 40 bottles), the spacing shrinks evenly to fit; bars may
  // then touch. In the first 33 minutes the space is narrower than one bar, so the bars start at midnight and may reach past now.
  function dlBars(marks, now = 1440) {
    const bottles = marks.filter(m => !m.nurse), most = Math.max(0, ...bottles.map(m => m.ml || 0)) || 1;
    const lo = dlX(0) + DL.bar / 2, hi = Math.max(lo, dlX(now) - DL.bar / 2);
    const step = bottles.length > 1 ? Math.min(DL.bar + 1, (hi - lo) / (bottles.length - 1)) : DL.bar + 1;
    const tall = DL.base - DL.room - 2;
    const bars = bottles.map(m => ({...m, x:Math.max(lo, dlX(m.t)), top:DL.base - (m.ml ? 2 + tall * m.ml / most : DL.hollow)})).sort((a, b) => a.t - b.t);
    bars.forEach((b, i) => { if (i) b.x = Math.max(b.x, bars[i - 1].x + step); });
    for (let i = bars.length - 1; i >= 0; i--) bars[i].x = Math.min(bars[i].x, i === bars.length - 1 ? hi : bars[i + 1].x - step);
    return bars;
  }
  function dayline(marks, now, label) {
    const {w, h, base, bar, dot, r} = DL;
    let out = `<line class="base" x1="${dlX(0)}" x2="${dlX(1440)}" y1="${base}" y2="${base}" vector-effect="non-scaling-stroke"/>`
      + `<line class="now-tick" x1="${dlX(now)}" x2="${dlX(now)}" y1="2" y2="${h - 1}" vector-effect="non-scaling-stroke"/>`;
    for (const m of marks.filter(m => m.nurse)) out += `<circle class="nurse" cx="${dlX(m.t)}" cy="${dot}" r="${r}"/>`;
    // Taller bars first, so a short bar close in time is drawn over a tall one, never hidden under it.
    for (const b of dlBars(marks, now).sort((a, z) => a.top - z.top)) {
      out += b.ml ? `<rect class="bottle" x="${b.x - bar / 2}" y="${b.top}" width="${bar}" height="${base - b.top}" rx="1"/>`
        : `<rect class="bottle hollow" x="${b.x - bar / 2 + 0.75}" y="${b.top + 0.75}" width="${bar - 1.5}" height="${base - b.top - 1.5}" rx="1"/>`;
    }
    return svg(w, h, label, out);
  }
  // Number places as shares of the drawing (0 to 1): x is the center, y is the bottom of the number.
  // A number is skipped when its center is closer to the last number shown than 6 + 9 x the longer label's characters.
  const labelGap = (a, b) => 6 + 9 * Math.max(String(a).length, String(b).length);
  function daylineLabels(marks, now) {
    let last = null;
    return dlBars(marks, now).sort((a, b) => a.x - b.x).filter(b => (!last || b.x - last.x >= labelGap(last.shown, b.shown)) && (last = b, true))
      .map(b => ({x:b.x / DL.w, y:(b.top - 1) / DL.h, text:b.shown, hollow:!b.ml}));
  }

  // Last 7 days: 7 small solid columns from zero for one care row (at 8 px wide an outlined column reads as a "0").
  // The row is wider than 84 units on most phones, so the drawing stretches to its box (preserveAspectRatio none).
  function week(values, w = 84, H = 18) {
    const n = values.length, band = w / n, bw = band - 4, top = Math.max(0, ...values.filter(Number.isFinite)) || 1;
    let out = `<line class="base" x1="0" x2="${w}" y1="${H}" y2="${H}" vector-effect="non-scaling-stroke"/>`;
    values.forEach((v, i) => { if (v > 0) { const y = Math.min(H - (H - 2) * v / top, H - 6); out += `<rect class="bar" x="${i * band + 2}" y="${y}" width="${bw}" height="${H - y}" rx="2"/>`; } });
    return `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${out}</svg>`;
  }
  // Recorded weight or length: a line through every record; past records outlined, the latest solid. points = [{d (days), v}].
  function growthLine(points, label, H = 40) {
    const w = 280, pad = 6, values = points.map(p => p.v), lo = Math.min(...values), span = (Math.max(...values) - lo) || 1;
    const d0 = points[0].d, d1 = points.at(-1).d, X = d => pad + (w - 2 * pad) * (d - d0) / ((d1 - d0) || 1), Y = v => H - pad - (H - 2 * pad) * (v - lo) / span;
    let out = `<path class="trend" d="M${points.map(p => `${X(p.d)} ${Y(p.v)}`).join('L')}" vector-effect="non-scaling-stroke"/>`;
    out += points.map((p, i) => `<circle class="${i === points.length - 1 ? 'today' : 'past'}" cx="${X(p.d)}" cy="${Y(p.v)}" r="4.5" vector-effect="non-scaling-stroke"/>`).join('');
    return svg(w, H, label, out);
  }

  return {columns, rhythm, growth, scale, mini, dayline, daylineLabels, labelGap, DAYLINE_PAD, week, growthLine};
})();
