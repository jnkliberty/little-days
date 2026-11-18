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

  return {columns, rhythm, growth, scale};
})();
