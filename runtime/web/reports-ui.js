/* Reports screens and Home/Charts entries for Group 3 (plan 2026-11-21, lines 233 to 253; Option B approved 2026-11-22).
   Mirrors web/cry-ui.js: sets globalThis.LittleDaysReportsUI and uses app.js helpers (S, t, esc, render, glyph, iconBlock,
   clk, durText, fmtWt, fmtLen, fmtVol, todayISO, nowM, shiftISO, isoDay, shiftEntry, homeEntries, homeReads, resourceAllowed,
   babyName, meKey, unitsOf, trapTab). Nothing here runs before app.js has loaded. */
globalThis.LittleDaysReportsUI = (() => {
  'use strict';
  const NB = '\u00a0';
  const RP = () => globalThis.LittleDaysReports;
  const CH = () => globalThis.LittleDaysCharts;
  const CG = () => globalThis.LittleDaysCareGuidance;

  /* ---------- copy table (checked by test/copy.test.ts) ---------- */
  const W = {
    reports: ['Reports', 'Reportes'],
    weeklyTitle: ['Weekly report', 'Reporte semanal'],
    sleepTitle: ['Sleep report', 'Reporte de sueño'],
    sleepSub: ['Day and night split, bedtime, naps', 'Día y noche, hora de dormir, siestas'],
    eatingTitle: ['Eating report', 'Reporte de tomas'],
    eatingSub: ['Feeds, gaps, side balance, bottles', 'Tomas, intervalos, lados, biberón'],
    doctorTitle: ['Doctor visit', 'Consulta médica'],
    doctorSub: ['Averages, growth, medicines, each day', 'Promedios, crecimiento, medicinas, cada día'],
    backCharts: ['Charts', 'Gráficas'],
    backHome: ['Home', 'Inicio'],
    weekReady: ['Her week is ready', 'Su semana está lista'],
    weekHomeSummary: [(s, f) => `${s} sleep and ${f} feeds a day.`, (s, f) => `${s} de sueño y ${f} tomas al día.`],
    weekHomeSleepOnly: [s => `${s} sleep a day.`, s => `${s} de sueño al día.`],
    weekHomeFeedsOnly: [f => `${f} feeds a day.`, f => `${f} tomas al día.`],
    openReport: ['Open report', 'Abrir reporte'],
    dismiss: ['Dismiss', 'Ocultar'],
    daysN: [n => `${n} days`, n => `${n} días`],
    lastNDays: [n => `Last ${n} days`, n => `Últimos ${n} días`],
    periodAria: ['Period', 'Periodo'],
    fullDays: [n => `${n} full days`, n => `${n} días completos`],
    vsRange: [r => `vs. ${r}`, r => `vs. ${r}`],
    thisWeek: ['This week', 'Esta semana'],
    overview7: ['7-day overview', 'Resumen de 7 días'],
    vsWeekBefore: ['vs. last week', 'vs. semana pasada'],
    youngNote: ['Week-to-week comparison starts after 14 days of logs.', 'La comparación semanal aparece después de 14 días de registros.'],
    aDay: ['a day', 'al día'],
    feedsADay: [n => `${n} feeds a day`, n => `${n} tomas al día`],
    napsADay: [n => `${n} naps a day`, n => `${n} siestas al día`],
    longestLabel: [d => `Longest sleep ${d}`, d => `Más largo: ${d}`],
    bottleADay: [v => `${v} bottle a day`, v => `${v} de biberón al día`],
    wetDirtyADay: [(w, d) => `${w} wet · ${d} dirty a day`, (w, d) => `Pipí ${w} · Popó ${d} al día`],
    diapersADay: [n => `${n} diaper changes a day`, n => `${n} cambios de pañal al día`],
    moreSleep: [d => `${d} more sleep than last week.`, d => `${d} más de sueño que la semana pasada.`],
    lessSleep: [d => `${d} less sleep than last week.`, d => `${d} menos de sueño que la semana pasada.`],
    sameSleep: ['Same sleep as last week.', 'Igual sueño que la semana pasada.'],
    moreFeeds: [n => `${n} more feeds than last week.`, n => `${n} tomas más que la semana pasada.`],
    lessFeeds: [n => `${n} less feeds than last week.`, n => `${n} tomas menos que la semana pasada.`],
    sameFeeds: ['Same feeds as last week.', 'Igual número de tomas que la semana pasada.'],
    moreWet: [n => `${n} more wet diapers than last week.`, n => `${n} pañales con pipí más que la semana pasada.`],
    lessWet: [n => `${n} less wet diapers than last week.`, n => `${n} pañales con pipí menos que la semana pasada.`],
    sameWet: ['Same wet diapers as last week.', 'Igual número de pañales con pipí que la semana pasada.'],
    growthHeading: ['Growth', 'Crecimiento'],
    latestGrowth: ['Latest growth', 'Último crecimiento'],
    weight: ['Weight', 'Peso'],
    length: ['Length', 'Estatura'],
    head: ['Head', 'Cabeza'],
    sinceDate: [(delta, date) => `${delta} since ${date}`, (delta, date) => `${delta} desde el ${date}`],
    source: [s => `Source: ${s}`, s => `Fuente: ${s}`],
    nightWord: ['Night', 'Noche'],
    napsWord: ['Naps', 'Siestas'],
    dayWord: ['Day', 'Día'],
    nightHours: [`7${NB}PM to 7${NB}AM`, `7${NB}p.${NB}m. a 7${NB}a.${NB}m.`],
    dayHours: [`7${NB}AM to 7${NB}PM`, `7${NB}a.${NB}m. a 7${NB}p.${NB}m.`],
    napsPerDay: ['Naps a day', 'Siestas al día'],
    longestSleep: ['Longest sleep', 'Sueño más largo'],
    sleepPerDay: ['Sleep per day', 'Sueño por día'],
    sleepLoggedNote: [(naps, days) => `${naps} naps across ${days} logged days.`, (naps, days) => `${naps} siestas en ${days} días con registros.`],
    bedAndWake: ['Bedtime and wake time', 'Hora de dormir y despertar'],
    bedSummary: [(b, w) => `Bedtime about ${b} · Wake about ${w}`, (b, w) => `Dormir cerca de ${b} · Despertar ${w}`],
    colDay: ['Day', 'Día'],
    colBed: ['Bedtime', 'Dormir'],
    colWake: ['Wake', 'Despertar'],
    colNight: ['Night', 'Noche'],
    colNaps: ['Naps', 'Siestas'],
    under4: ['No recommended range exists before 4 months. Babies this age vary widely.', 'No existe un rango recomendado antes de los 4 meses. A esta edad los bebés varían mucho.'],
    bandSleepKey: [(lo, hi) => `Typical for her age: ${lo} to ${hi}${NB}h a day`, (lo, hi) => `Típico para su edad: ${lo} a ${hi}${NB}h al día`],
    bandFeedKey: [(lo, hi) => `Typical for her age: ${lo} to ${hi} a day`, (lo, hi) => `Típico para su edad: ${lo} a ${hi} al día`],
    vary: ['Babies vary. Ask the pediatrician if you are concerned.', 'Cada bebé es distinto. Consulte al pediatra si le preocupa algo.'],
    feedsUnit: ['feeds a day', 'tomas al día'],
    feedInDays: [n => `in ${n} days`, n => `en ${n} días`],
    oneFeedWord: ['1 feed', '1 toma'],
    usualGap: ['Usual gap', 'Intervalo usual'],
    betweenStarts: ['Between feed starts', 'Entre inicios de toma'],
    bottleAvg: ['Bottle volume', 'Volumen de biberón'],
    bottlesDay: [n => `${n} bottles a day`, n => `${n} biberones al día`],
    bottlesSingle: ['1 bottle logged', '1 biberón registrado'],
    sideBalance: ['Nursing side balance', 'Balance de pecho'],
    leftSide: ['Left', 'Izquierdo'],
    rightSide: ['Right', 'Derecho'],
    feedsPerDay: ['Feeds per day', 'Tomas por día'],
    feedsLoggedNote: [(total, days, b, bot) => `${total} feeds across ${days} days (${b} breast, ${bot} bottle).`, (total, days, b, bot) => `${total} tomas en ${days} días (${b} pecho, ${bot} biberón).`],
    feedGaps: ['Feed gaps', 'Intervalos entre tomas'],
    gapNeeds2: ['Usual gap shows once 2 or more feeds are logged.', 'El intervalo usual aparece con 2 o más tomas registradas.'],
    oneFeedNote: [d => `1 feed logged in this period (${d}).`, d => `1 toma registrada en este periodo (${d}).`],
    breast: ['Breast', 'Pecho'],
    bottle: ['Bottle', 'Biberón'],
    toWord: ['to', 'a'],
    ageDays: [n => `${n} ${n === 1 ? 'day' : 'days'} old`, n => `${n} ${n === 1 ? 'día' : 'días'} de edad`],
    ageMonths: [n => `${n} ${n === 1 ? 'month' : 'months'} old`, n => `${n} ${n === 1 ? 'mes' : 'meses'} de edad`],
    averages: ['Averages', 'Promedios'],
    feedsLabel: ['Feeds', 'Tomas'],
    sleepLabel: ['Sleep', 'Sueño'],
    diapersLabel: ['Diapers', 'Pañales'],
    wetWord: ['wet', 'pipí'],
    dirtyWord: ['dirty', 'popó'],
    wetLabel: ['Wet diapers', 'Pipí'],
    dirtyLabel: ['Dirty diapers', 'Popó'],
    medsHeading: ['Medicines given', 'Medicinas dadas'],
    medsEmpty: ['No medicines logged in this period.', 'No hay medicinas registradas en este periodo.'],
    medDoses: [(dose, count, days) => `${dose}${dose ? ' · ' : ''}${count} ${count === 1 ? 'dose' : 'doses'} in ${days} days`, (dose, count, days) => `${dose}${dose ? ' · ' : ''}${count} dosis en ${days} días`],
    medLast: [(date, time) => `Last given: ${date}, ${time}`, (date, time) => `Última dosis: ${date}, ${time}`],
    dayByDay: ['Day by day', 'Día por día'],
    dayByDaySub: [n => `${n} full days, 7:00${NB}AM to 7:00${NB}AM`, n => `${n} días completos, 7:00${NB}a.${NB}m. a 7:00${NB}a.${NB}m.`],
    noRecordsDay: ['No records logged', 'Sin registros'],
    printReport: ['Print report', 'Imprimir reporte'],
    downloadCsv: ['Download CSV', 'Descargar CSV'],
    loadingReport: ['Loading her records…', 'Cargando sus registros…'],
    emptyWeekly: ['No records logged in this week.', 'No hay registros en esta semana.'],
    emptySleep: ['No sleep logged in this period.', 'No hay sueño registrado en este periodo.'],
    emptyFeeds: ['No feeds logged in this period.', 'No hay tomas registradas en este periodo.'],
    emptyDoctor: ['No records logged in this period.', 'No hay registros en este periodo.'],
    emptyHint: ['Records appear here once you log them on Home.', 'Los registros aparecen aquí cuando los agrega en Inicio.'],
    backToCharts: ['Back to Charts', 'Volver a Gráficas'],
    backToHome: ['Back to Home', 'Volver a Inicio'],
    errTitle: ['Some days did not load', 'Algunos días no cargaron'],
    errBody: ['Some days could not load. Averages stay hidden until every day loads so no number is smaller than it is.', 'Algunos días no pudieron cargar. Los promedios se ocultan hasta cargar todos los días para no mostrar un promedio menor.'],
    tryAgain: ['Try again', 'Reintentar'],
  };
  const L = () => (S.lang === 'es' ? 1 : 0);
  const tr = (k, ...a) => { const v = W[k][L()]; return typeof v === 'function' ? v(...a) : v; };

  /* ---------- state ---------- */
  const R = {kind: null, period: 7, backTo: 'charts', opener: null, state: 'idle', entries: [], growth: [], open: {}, seq: 0, owner: ''};
  const MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  };
  const WDS = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  };
  const LETTERS = {
    en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    es: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  };

  /* ---------- formatting helpers ---------- */
  const nb = s => String(s).replace(/ /g, NB);
  const fmtDur = m => (m == null || !Number.isFinite(m) ? '--' : nb(durText(Math.max(0, Math.round(m)))));
  const fmtClock = m => (m == null || !Number.isFinite(m) ? '--' : nb(clk(m)));
  const fmt1 = v => (v == null || !Number.isFinite(v) ? '--' : (Math.round(v * 10) / 10).toFixed(1));
  const fmtVolume = ml => {
    if (ml == null || !Number.isFinite(ml)) return '--';
    const u = unitsOf() === 'us' ? 'oz' : 'mL';
    if (u === 'oz') return `${(Math.round((ml / 29.5735) * 10) / 10).toFixed(1)}${NB}oz`;
    return `${Math.round(ml)}${NB}mL`;
  };
  const partsOf = iso => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return {y, m, d, wd: dt.getUTCDay()};
  };
  const shortDate = iso => {
    const p = partsOf(iso), mo = MONTHS[S.lang === 'es' ? 'es' : 'en'][p.m - 1];
    return S.lang === 'es' ? `${p.d} ${mo}` : `${mo} ${p.d}`;
  };
  const rangeLabel = (from, to) => {
    const a = partsOf(from), b = partsOf(to);
    if (S.lang === 'es') return a.m === b.m ? `${a.d} al ${b.d} ${MONTHS.es[b.m - 1]}` : `${shortDate(from)} al ${shortDate(to)}`;
    return `${shortDate(from)} to ${shortDate(to)}`;
  };
  const ageText = ageDays => {
    if (!Number.isFinite(ageDays) || ageDays < 0) return '';
    if (ageDays >= 60) return tr('ageMonths', Math.floor(ageDays / 30.4375));
    return tr('ageDays', ageDays);
  };
  const fmtWeightDelta = kg => {
    if (kg == null || !Number.isFinite(kg)) return '';
    const sign = kg >= 0 ? '+' : '−', abs = Math.abs(kg);
    if (unitsOf() === 'us') return `${sign}${Math.round(abs / 0.0283495)}${NB}oz`;
    return abs < 1 ? `${sign}${Math.round(abs * 1000)}${NB}g` : `${sign}${abs.toFixed(2)}${NB}kg`;
  };
  const fmtLenDelta = cm => {
    if (cm == null || !Number.isFinite(cm)) return '';
    const sign = cm >= 0 ? '+' : '−', abs = Math.abs(cm);
    if (unitsOf() === 'us') return `${sign}${(abs / 2.54).toFixed(1)}${NB}${S.lang === 'es' ? 'pulg' : 'in'}`;
    return `${sign}${abs.toFixed(1)}${NB}cm`;
  };

  /* ---------- permissions & storage ---------- */
  function permissions() {
    return {
      sleep: resourceAllowed('sleep'),
      feedings: resourceAllowed('feedings'),
      changes: resourceAllowed('changes'),
      weight: resourceAllowed('weight'),
      height: resourceAllowed('height'),
      head: resourceAllowed('head-circumference'),
      medication: resourceAllowed('medication'),
      children: resourceAllowed('children'),
    };
  }
  function canView(kind) {
    const p = permissions();
    if (kind === 'sleep') return p.sleep;
    if (kind === 'eating') return p.feedings;
    if (kind === 'weekly') return p.sleep || p.feedings || p.changes || p.weight || p.height || p.head;
    if (kind === 'doctor') return p.sleep || p.feedings || p.changes || p.weight || p.height || p.head || p.medication;
    return false;
  }
  const dismissKey = () => `little-days-weekly-dismissed:${meKey()}:${S.child?.id || ''}`;
  function getDismissed() { try { return localStorage.getItem(dismissKey()); } catch { return null; } }
  function setDismissed(date) { try { localStorage.setItem(dismissKey(), date); } catch {} }

  /* ---------- icons ---------- */
  const chartBlock = () => '<svg class="ico" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect class="plate" width="40" height="40" rx="14"/><g class="ln" transform="translate(6 6) scale(1.1667)"><path d="M6 19v-6M12 19V5M18 19v-9"/></g></svg>';
  const chev = () => `<span class="chev">${glyph('chev')}</span>`;

  /* ---------- data loading ---------- */
  function loadStateChunks(chunks, today) {
    return Promise.all(chunks.map(c => LittleDaysAPI.state(c.from, c.to))).then(replies => {
      const byId = new Map();
      for (const reply of replies) {
        if (!reply || !Array.isArray(reply.entries)) throw new Error('incomplete');
        const serverDay = /^\d{4}-\d{2}-\d{2}$/.test(reply.today || '') ? reply.today : today;
        const offset = isoDay(serverDay, today) * 1440;
        for (const e of reply.entries) byId.set(String(e.id), {...shiftEntry(e, offset), id: String(e.id)});
      }
      return [...byId.values()];
    });
  }

  function needsGrowth(kind) {
    const p = permissions();
    return (kind === 'weekly' || kind === 'doctor') && p.children && (p.weight || p.height || p.head);
  }

  function loadReport() {
    const kind = R.kind;
    if (!kind || S.auth !== 'ready') return;
    const seq = ++R.seq, owner = R.owner, today = todayISO(), nowMin = nowM();
    const endOffset = kind === 'weekly' ? RP().weeklyEndOffset(today, nowMin) : RP().reportEndOffset(nowMin);
    const windowDays = kind === 'weekly' ? 14 : R.period;
    const chunks = RP().loadChunks(today, endOffset, windowDays);
    R.state = 'loading';
    render();
    const tasks = [loadStateChunks(chunks, today), needsGrowth(kind) ? LittleDaysAPI.growth() : Promise.resolve({entries: []})];
    Promise.all(tasks).then(([entries, growthReply]) => {
      if (seq !== R.seq || owner !== R.owner || R.kind !== kind) return;
      if (!growthReply || !Array.isArray(growthReply.entries)) throw new Error('growth');
      R.entries = entries;
      R.growth = growthReply.entries;
      R.state = 'ok';
      render();
    }).catch(() => {
      if (seq !== R.seq || owner !== R.owner || R.kind !== kind) return;
      R.state = 'error';
      render();
    });
  }

  /* ---------- Charts entry (Option B: 4-row icon list) ---------- */
  function chartsCardHTML() {
    const today = todayISO(), nowMin = nowM();
    const endOffset = RP().weeklyEndOffset(today, nowMin);
    const priorStart = shiftISO(today, endOffset - 14);
    const cur = rangeLabel(shiftISO(today, endOffset - 7), shiftISO(today, endOffset - 1));
    const prev = rangeLabel(priorStart, shiftISO(today, endOffset - 8));
    const hasFullPrior = !S.child?.birthDate || S.child.birthDate <= priorStart;
    const weeklySub = hasFullPrior ? `${cur} · ${tr('vsRange', prev)}` : `${cur} · ${tr('fullDays', 7)}`;
    const items = [
      ['weekly', 't-plain', chartBlock(), tr('weeklyTitle'), weeklySub],
      ['sleep', 't-sleep', iconBlock('moon'), tr('sleepTitle'), tr('sleepSub')],
      ['eating', 't-feed', iconBlock('bottle'), tr('eatingTitle'), tr('eatingSub')],
      ['doctor', 't-plain', iconBlock('clipboard'), tr('doctorTitle'), tr('doctorSub')],
    ].filter(([k]) => canView(k));
    const rows = items.map(([k, cls, ico, title, sub]) =>
      `<li class="${cls}"><button type="button" class="nav-row" data-act="report-open" data-arg="${k}">${ico}<span class="cry-text"><strong>${esc(title)}</strong><span class="sub">${esc(sub)}</span></span>${chev()}</button></li>`
    ).join('') + (globalThis.LittleDaysExtrasUI?.chartsRowHTML?.() || '');
    if (!rows) return '';
    return `<section class="card nav icons rp-entry-card" aria-labelledby="rp-entry-h"><h2 id="rp-entry-h">${esc(tr('reports'))}</h2><ul>${rows}</ul></section>`;
  }

  /* ---------- Home Monday card ("Her week is ready") ---------- */
  function homeSummaryText(today, nowMin) {
    const p = permissions();
    const weekDates = Array.from({length: 9}, (_, i) => shiftISO(today, -8 + i));
    const haveAll = weekDates.every(d => homeReads.has(d));
    if (!haveAll) return '';
    const rep = RP().weeklyReport({entries: homeEntries(today), growthEntries: [], todayISO: today, nowMin, birthDate: S.child?.birthDate, permissions: p});
    const sleep = p.sleep && rep.averages.sleepMin != null ? fmtDur(rep.averages.sleepMin) : null;
    const feeds = p.feedings && rep.averages.feeds != null ? fmt1(rep.averages.feeds) : null;
    if (sleep && feeds) return tr('weekHomeSummary', sleep, feeds);
    if (sleep) return tr('weekHomeSleepOnly', sleep);
    if (feeds) return tr('weekHomeFeedsOnly', feeds);
    return '';
  }

  function homeCardHTML() {
    const today = todayISO(), nowMin = nowM();
    if (!RP().weeklyCardReady({todayISO: today, nowMin, dismissedDate: getDismissed(), canViewWeekly: canView('weekly')})) return '';
    const curRange = rangeLabel(shiftISO(today, -7), shiftISO(today, -1));
    const summary = homeSummaryText(today, nowMin);
    return `<section class="card rp-home t-plain" data-rp-home aria-labelledby="rp-home-h">`
      + `<div class="rp-home-top">${chartBlock()}<div><h2 id="rp-home-h">${esc(tr('weekReady'))}</h2><p class="sub">${esc(curRange)}</p></div></div>`
      + (summary ? `<p class="rp-home-summary">${esc(summary)}</p>` : '')
      + `<div class="rp-home-actions"><button type="button" class="back" data-act="report-open" data-arg="weekly">${esc(tr('openReport'))}</button><button type="button" class="textlink" data-act="report-dismiss">${esc(tr('dismiss'))}</button></div>`
      + `</section>`;
  }

  /* ---------- shared sheet building blocks ---------- */
  function sheetWrap(title, bodyHTML) {
    const back = R.backTo === 'home' ? tr('backHome') : tr('backCharts');
    return `<div class="formscreen rp-sheet" data-kind="report-${esc(R.kind)}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="wrap t-plain charts-page">`
      + `<header class="bar"><button type="button" class="back" data-act="report-close">${glyph('back')}${esc(back)}</button><h1>${esc(title)}</h1><span></span></header>`
      + bodyHTML + `</div></div>`;
  }

  function periodBar(choices, active, metaText) {
    const chips = choices.map(n =>
      `<button type="button" class="chip" data-act="report-period" data-arg="${n}" aria-pressed="${n === active}">${glyph('check')}${esc(tr(choices.length === 2 ? 'lastNDays' : 'daysN', n))}</button>`
    ).join('');
    return `<div class="rp-period-block"><div class="rp-period-chips seg-control" role="group" aria-label="${esc(tr('periodAria'))}">${chips}</div><p class="rp-period-text">${esc(metaText)}</p></div>`;
  }

  function guideCard(guide) {
    if (!guide) return '';
    const src = String(guide.title || '').split(':')[0];
    const open = R.open[guide.id] ? ' open' : '';
    return `<section class="card nav"><ul><li><details data-rp-guide="${esc(guide.id)}"${open}><summary class="nav-row"><strong>${esc(guide.title)}</strong>${chev()}</summary>`
      + `<div class="rp-guide-body"><p>${esc(guide.body)}</p><a class="textlink" href="${esc(guide.url)}" target="_blank" rel="noopener noreferrer">${esc(tr('source', src))}${glyph('ext')}</a></div>`
      + `</details></li></ul></section>`;
  }

  function loadingCards() {
    return `<section class="card rp-skel-card" role="status" aria-label="${esc(tr('loadingReport'))}">`
      + `<p class="sub">${esc(tr('loadingReport'))}</p><span class="rp-skel h32" aria-hidden="true"></span>`
      + `<div class="rp-stats"><span class="rp-skel h64" aria-hidden="true"></span><span class="rp-skel h64" aria-hidden="true"></span><span class="rp-skel h64" aria-hidden="true"></span><span class="rp-skel h64" aria-hidden="true"></span></div>`
      + `<span class="rp-skel h16" aria-hidden="true"></span></section>`
      + `<section class="card rp-skel-card" aria-hidden="true"><span class="rp-skel h16"></span><span class="rp-skel h160"></span></section>`;
  }

  function emptyCard(msgKey) {
    return `<section class="card"><div class="empty-state"><p><strong>${esc(tr(msgKey))}</strong></p><p class="sub">${esc(tr('emptyHint'))}</p><button type="button" class="back" data-act="report-close">${esc(tr(R.backTo === 'home' ? 'backToHome' : 'backToCharts'))}</button></div></section>`;
  }

  function errorCard() {
    return `<section class="card rp-error" data-rp-error role="alert"><div class="warn">${glyph('warn')}<span>${esc(tr('errTitle'))}</span></div>`
      + `<p>${esc(tr('errBody'))}</p><button type="button" class="back" data-act="report-retry">${esc(tr('tryAgain'))}</button></section>`;
  }

  function growthRowsHTML(growth, withDelta) {
    const defs = [
      ['weight', tr('weight'), v => nb(fmtWt(v)), fmtWeightDelta],
      ['length', tr('length'), v => nb(fmtLen(v)), fmtLenDelta],
      ['head', tr('head'), v => nb(fmtLen(v)), fmtLenDelta],
    ];
    return defs.map(([k, label, fmt, fmtD]) => {
      const item = growth[k];
      if (!item) return '';
      const sub = withDelta && item.delta != null && item.prior ? tr('sinceDate', fmtD(item.delta), shortDate(item.prior.date)) : '';
      const rightSub = withDelta ? `<span class="sub">${esc(shortDate(item.latest.date))}</span>` : '';
      const leftSub = withDelta ? (sub ? `<span class="sub">${esc(sub)}</span>` : '') : `<span class="sub">${esc(shortDate(item.latest.date))}</span>`;
      return `<div class="rp-kv-row"><div class="rp-kv-main"><strong>${esc(label)}</strong>${leftSub}</div><div class="rp-kv-val"><strong>${esc(fmt(item.latest.value))}</strong>${rightSub}</div></div>`;
    }).filter(Boolean).join('');
  }

  function xLabels(days) {
    const n = days.length, lang = S.lang === 'es' ? 'es' : 'en';
    if (n <= 7) return days.map(d => ({x: LETTERS[lang][partsOf(d.date).wd], anchor: 'middle'}));
    const mid = Math.floor((n - 1) / 2);
    return days.map((d, i) => i === 0 ? {x: shortDate(d.date), anchor: 'start'}
      : i === mid ? {x: shortDate(d.date), anchor: 'middle'}
      : i === n - 1 ? {x: shortDate(d.date), anchor: 'end'}
      : {x: '', anchor: 'middle'});
  }

  /* ---------- Report 1: Weekly ---------- */
  function deltaLine(delta, moreKey, lessKey, sameKey, fmt) {
    if (!delta) return '';
    if (delta.direction === 'same') return tr(sameKey);
    return tr(delta.direction === 'more' ? moreKey : lessKey, fmt(delta.amount));
  }
  function deltaShort(delta, fmt) {
    if (!delta) return '';
    if (delta.direction === 'same') return '0';
    return `${delta.direction === 'more' ? '+' : '−'}${fmt(delta.amount)}`;
  }

  function weeklySummaryRows(rep) {
    const a = rep.averages, rows = [];
    const row = (cls, ico, main, sub, delta) =>
      `<li class="row ${cls}">${iconBlock(ico)}<div><strong>${esc(main)}</strong>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${delta ? `<span class="rp-row-delta">${esc(delta)}</span>` : ''}</div></li>`;
    if (a.sleepMin != null) {
      const sub = [a.napsPerDay != null && tr('napsADay', fmt1(a.napsPerDay)), a.longestSleep != null && tr('longestLabel', fmtDur(a.longestSleep))].filter(Boolean).join(' · ');
      rows.push(row('t-sleep', 'moon', `${fmtDur(a.sleepMin)} ${tr('aDay')}`, sub, deltaLine(rep.deltas.sleepMin, 'moreSleep', 'lessSleep', 'sameSleep', fmtDur)));
    }
    if (a.feeds != null) {
      const sub = a.bottleMl != null && a.bottleMl > 0 ? tr('bottleADay', fmtVolume(a.bottleMl)) : '';
      rows.push(row('t-feed', 'bottle', tr('feedsADay', fmt1(a.feeds)), sub, deltaLine(rep.deltas.feeds, 'moreFeeds', 'lessFeeds', 'sameFeeds', fmt1)));
    }
    if (a.wet != null || a.dirty != null) {
      const sub = a.diapers != null ? tr('diapersADay', fmt1(a.diapers)) : '';
      rows.push(row('t-dia', 'diaper', tr('wetDirtyADay', fmt1(a.wet || 0), fmt1(a.dirty || 0)), sub, deltaLine(rep.deltas.wet, 'moreWet', 'lessWet', 'sameWet', fmt1)));
    }
    return rows.join('');
  }

  function weeklyOverviewCard(rep) {
    const a = rep.averages, list = [];
    if (a.sleepMin != null) list.push(['c-sleep', tr('sleepLabel'), fmtDur(a.sleepMin), rep.currentDays.map(d => (d.sleepMin || 0) / 60), deltaShort(rep.deltas.sleepMin, fmtDur)]);
    if (a.feeds != null) list.push(['c-feed', tr('feedsLabel'), fmt1(a.feeds), rep.currentDays.map(d => d.feedCount || 0), deltaShort(rep.deltas.feeds, fmt1)]);
    if (a.wet != null) list.push(['c-dia', tr('wetLabel'), fmt1(a.wet), rep.currentDays.map(d => d.wet || 0), deltaShort(rep.deltas.wet, fmt1)]);
    if (!list.length) return '';
    const hasDelta = rep.hasPrior && list.some(x => x[4]);
    const rows = list.map(([cls, name, avg, vals, delta], i) =>
      `<div class="wk-row ${cls}"><span class="wk-name">${esc(name)}</span>${i === 0 && hasDelta ? `<span class="wk-head">${esc(tr('vsWeekBefore'))}</span>` : ''}`
      + `<span class="wk-avg">${esc(avg)}</span><span class="wk-bars">${CH().week(vals)}</span>${hasDelta ? `<span class="wk-change">${esc(delta)}</span>` : ''}</div>`
    ).join('');
    return `<section class="card"><h2>${esc(tr('overview7'))}</h2><div class="viz-week${hasDelta ? ' with-change' : ''}">${rows}</div></section>`;
  }

  function weeklyHTML() {
    if (R.state === 'loading') return sheetWrap(tr('weeklyTitle'), loadingCards());
    if (R.state === 'error') return sheetWrap(tr('weeklyTitle'), errorCard());
    const rep = RP().weeklyReport({entries: R.entries, growthEntries: R.growth, todayISO: todayISO(), nowMin: nowM(), birthDate: S.child?.birthDate, permissions: permissions(), spanish: S.lang === 'es'});
    const rowsHTML = weeklySummaryRows(rep);
    const growthHTML = growthRowsHTML(rep.growth, true);
    if (!rowsHTML && !growthHTML) return sheetWrap(tr('weeklyTitle'), emptyCard('emptyWeekly') + guideCard(rep.guide));
    const cur = rangeLabel(rep.currentFrom, rep.currentTo), prev = rangeLabel(rep.priorFrom, rep.priorTo);
    const sub = rep.hasPrior ? `${cur} · ${tr('vsRange', prev)}` : `${cur} · ${tr('fullDays', rep.currentDays.length || 7)}`;
    const youngNote = !rep.hasPrior && rep.priorDays.length < 7 ? `<p class="rp-vary">${esc(tr('youngNote'))}</p>` : '';
    const summary = rowsHTML ? `<section class="card"><h2>${esc(tr('thisWeek'))}</h2><p class="sub">${esc(sub)}</p><ul>${rowsHTML}</ul>${youngNote}</section>` : '';
    const growthCard = growthHTML ? `<section class="card t-plain"><div class="chart-head">${iconBlock('sprout')}<h2>${esc(tr('growthHeading'))}</h2></div><div class="rp-kv-list">${growthHTML}</div></section>` : '';
    return sheetWrap(tr('weeklyTitle'), summary + weeklyOverviewCard(rep) + growthCard + guideCard(rep.guide));
  }

  const wideReportsMQ = globalThis.matchMedia?.('(min-width: 960px)');
  wideReportsMQ?.addEventListener?.('change', () => { if (R.kind) render(); });
  const reportPlotWidth = () => (wideReportsMQ ? (wideReportsMQ.matches ? 640 : 326) : (globalThis.innerWidth >= 960 ? 640 : 326));

  /* ---------- Report 2: Sleep ---------- */
  function sleepPlot(rep) {
    const band = rep.band?.kind === 'range' ? {low: rep.band.low, high: rep.band.high, open: false} : null;
    const maxVal = Math.max(band ? band.high : 0, ...rep.days.map(d => (d.sleepMin || 0) / 60));
    const panel = {
      ...CH().scale(18, 6, maxVal),
      tick: h => (h ? `${h}${NB}h` : '0'),
      colors: ['var(--chart-sleep)', 'var(--chart-nap)'],
      names: [tr('colNight'), tr('colNaps')],
      band,
    };
    const labels = xLabels(rep.days);
    const rows = rep.days.map((d, i) => ({x: labels[i].x, anchor: labels[i].anchor, v: [(d.nightMin || 0) / 60, (d.napMin || 0) / 60]}));
    return CH().reportColumns(reportPlotWidth(), tr('sleepPerDay'), rows, panel);
  }

  function sleepScheduleCard(rep) {
    const lang = S.lang === 'es' ? 'es' : 'en';
    const sub = rep.typicalBedtimeMin != null && rep.typicalWakeMin != null ? `<p class="sub rp-sub-gap">${esc(tr('bedSummary', fmtClock(rep.typicalBedtimeMin), fmtClock(rep.typicalWakeMin)))}</p>` : '';
    const rows = rep.schedule.slice().reverse().map(d => {
      const p = partsOf(d.date);
      return `<tr><th scope="row">${esc(`${WDS[lang][p.wd]} ${p.d}`)}</th><td>${esc(fmtClock(d.bedtimeMin))}</td><td>${esc(fmtClock(d.wakeMin))}</td><td class="rp-strong">${esc(fmtDur(d.nightMin))}</td></tr>`;
    }).join('');
    return `<section class="card"><h2>${esc(tr('bedAndWake'))}</h2>${sub}<div class="rp-table-wrap"><table class="rp-table"><thead><tr><th scope="col">${esc(tr('colDay'))}</th><th scope="col">${esc(tr('colBed'))}</th><th scope="col">${esc(tr('colWake'))}</th><th scope="col">${esc(tr('colNight'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function sleepHTML() {
    const today = todayISO(), nowMin = nowM(), endOffset = RP().reportEndOffset(nowMin);
    const meta = `${rangeLabel(shiftISO(today, endOffset - R.period), shiftISO(today, endOffset - 1))} · ${tr('fullDays', R.period)}`;
    const head = `<div class="t-sleep">${periodBar([7, 14, 30], R.period, meta)}</div>`;
    if (R.state === 'loading') return sheetWrap(tr('sleepTitle'), head + loadingCards());
    if (R.state === 'error') return sheetWrap(tr('sleepTitle'), head + errorCard());
    const rep = RP().sleepReport({entries: R.entries, todayISO: today, nowMin, windowDays: R.period, birthDate: S.child?.birthDate, spanish: S.lang === 'es'});
    if (!rep.loggedDays) return sheetWrap(tr('sleepTitle'), head + emptyCard('emptySleep') + guideCard(rep.guide));
    const summary = `<section class="card t-sleep"><div class="rp-hero"><p class="rp-hero-val">${esc(fmtDur(rep.avgSleepMin))}<span class="rp-hero-unit">${esc(tr('aDay'))}</span></p></div>`
      + `<div class="rp-stats">`
      + `<div class="rp-stat tinted"><span class="rp-stat-label"><i class="rp-swatch sleep-night" aria-hidden="true"></i>${esc(tr('nightWord'))}</span><span class="rp-stat-hours">${esc(tr('nightHours'))}</span><span class="rp-stat-val">${esc(fmtDur(rep.avgNightMin))}</span></div>`
      + `<div class="rp-stat tinted"><span class="rp-stat-label"><i class="rp-swatch sleep-nap" aria-hidden="true"></i>${esc(tr('napsWord'))}</span><span class="rp-stat-hours">${esc(tr('dayHours'))}</span><span class="rp-stat-val">${esc(fmtDur(rep.avgNapMin))}</span></div>`
      + `<div class="rp-stat"><span class="rp-stat-label">${esc(tr('napsPerDay'))}</span><span class="rp-stat-val">${esc(fmt1(rep.avgNaps))}</span></div>`
      + `<div class="rp-stat"><span class="rp-stat-label">${esc(tr('longestSleep'))}</span><span class="rp-stat-val">${esc(fmtDur(rep.longestSleep))}</span></div>`
      + `</div><p class="rp-delta">${esc(tr('sleepLoggedNote', rep.totalNaps, rep.loggedDays))}</p></section>`;
    const last = rep.days.at(-1), lp = last ? partsOf(last.date) : null;
    const readout = last ? `<p class="readout"><b>${esc(`${WDS[S.lang === 'es' ? 'es' : 'en'][lp.wd]}, ${shortDate(last.date)}`)}</b> · ${esc(fmtDur(last.sleepMin))}</p>` : '';
    const bandNote = rep.band?.kind === 'range'
      ? `<p class="nr-key"><svg width="16" height="12" aria-hidden="true"><rect x="1" y="1" width="14" height="10" rx="2" class="nr-band"/></svg>${esc(tr('bandSleepKey', rep.band.low, rep.band.high))}</p>`
      : rep.band?.kind === 'under4' ? `<p class="rp-vary">${esc(tr('under4'))}</p>` : '';
    const chart = `<section class="card t-sleep"><div class="chart-head">${iconBlock('moon')}<h2>${esc(tr('sleepPerDay'))}</h2></div>${readout}<div class="plot">${sleepPlot(rep)}</div>${bandNote}<p class="rp-vary">${esc(tr('vary'))}</p></section>`;
    return sheetWrap(tr('sleepTitle'), head + summary + chart + sleepScheduleCard(rep) + guideCard(rep.guide));
  }

  /* ---------- Report 3: Eating ---------- */
  function feedPlot(rep) {
    const band = rep.band?.kind === 'range' ? {low: rep.band.low, high: rep.band.high, open: false} : null;
    const maxVal = Math.max(band ? band.high : 0, ...rep.days.map(d => d.feedCount || 0));
    const panel = {
      ...CH().scale(10, 5, maxVal),
      tick: String,
      colors: ['var(--chart-breast)', 'var(--chart-bottle)'],
      names: [tr('breast'), tr('bottle')],
      band,
    };
    const labels = xLabels(rep.days);
    const rows = rep.days.map((d, i) => ({x: labels[i].x, anchor: labels[i].anchor, v: [d.breastCount || 0, d.bottleCount || 0]}));
    return CH().reportColumns(reportPlotWidth(), tr('feedsPerDay'), rows, panel);
  }

  function sideBalanceHTML(sb) {
    if (!sb) return '';
    return `<div class="rp-balance"><div class="rp-balance-head"><span class="rp-balance-title">${esc(tr('sideBalance'))}</span></div>`
      + `<div class="rp-balance-bar" aria-hidden="true"><i class="rp-balance-seg left" style="width:${sb.leftPct}%"></i><i class="rp-balance-seg right" style="width:${sb.rightPct}%"></i></div>`
      + `<div class="rp-balance-labels"><span><i class="rp-swatch feed-breast" aria-hidden="true"></i>${esc(`${tr('leftSide')} ${sb.leftPct}% (${sb.left + sb.both})`)}</span><span><i class="rp-swatch feed-bottle" aria-hidden="true"></i>${esc(`${tr('rightSide')} ${sb.rightPct}% (${sb.right + sb.both})`)}</span></div></div>`;
  }

  function feedGapsCard(rep, isOne) {
    if (isOne || rep.gaps.all.median == null) return `<section class="card"><h2>${esc(tr('feedGaps'))}</h2><p class="sub">${esc(tr('gapNeeds2'))}</p></section>`;
    const cell = (title, hours, g) => {
      const range = g.p25 != null && g.p75 != null ? `<span class="rp-stat-sub"><span class="rp-nowrap">${esc(fmtDur(g.p25))}</span><span class="rp-nowrap">${esc(`${tr('toWord')} ${fmtDur(g.p75)}`)}</span></span>` : '';
      return `<div class="rp-stat"><span class="rp-stat-label">${esc(title)}</span><span class="rp-stat-hours">${esc(hours)}</span><span class="rp-stat-val">${esc(fmtDur(g.median))}</span>${range}</div>`;
    };
    return `<section class="card"><h2>${esc(tr('feedGaps'))}</h2><div class="rp-stats">${cell(tr('dayWord'), tr('dayHours'), rep.gaps.day)}${cell(tr('nightWord'), tr('nightHours'), rep.gaps.night)}</div></section>`;
  }

  function eatingHTML() {
    const today = todayISO(), nowMin = nowM(), endOffset = RP().reportEndOffset(nowMin);
    const meta = `${rangeLabel(shiftISO(today, endOffset - R.period), shiftISO(today, endOffset - 1))} · ${tr('fullDays', R.period)}`;
    const head = `<div class="t-feed">${periodBar([7, 14, 30], R.period, meta)}</div>`;
    if (R.state === 'loading') return sheetWrap(tr('eatingTitle'), head + loadingCards());
    if (R.state === 'error') return sheetWrap(tr('eatingTitle'), head + errorCard());
    const rep = RP().eatingReport({entries: R.entries, todayISO: today, nowMin, windowDays: R.period, birthDate: S.child?.birthDate, spanish: S.lang === 'es'});
    if (!rep.totalFeeds) return sheetWrap(tr('eatingTitle'), head + emptyCard('emptyFeeds') + guideCard(rep.guide));
    const isOne = rep.totalFeeds === 1;
    const onlyDay = isOne ? rep.days.find(d => d.feedCount > 0) : null;
    const hero = isOne ? `${esc(tr('oneFeedWord'))}<span class="rp-hero-unit">${esc(tr('feedInDays', R.period))}</span>`
      : `${esc(fmt1(rep.avgFeeds))}<span class="rp-hero-unit">${esc(tr('feedsUnit'))}</span>`;
    const stats = isOne
      ? (rep.avgBottleMl > 0 ? `<div class="rp-stats"><div class="rp-stat tinted rp-stat-wide"><span class="rp-stat-label">${esc(tr('bottleAvg'))}</span><span class="rp-stat-val">${esc(fmtVolume(rep.avgBottleMl))}</span><span class="rp-stat-sub">${esc(tr('bottlesSingle'))}</span></div></div>` : '')
      : `<div class="rp-stats"><div class="rp-stat tinted"><span class="rp-stat-label">${esc(tr('usualGap'))}</span><span class="rp-stat-val">${esc(fmtDur(rep.gaps.all.median))}</span><span class="rp-stat-sub">${esc(tr('betweenStarts'))}</span></div>`
        + `<div class="rp-stat tinted"><span class="rp-stat-label">${esc(tr('bottleAvg'))}</span><span class="rp-stat-val">${esc(fmtVolume(rep.avgBottleMl))}</span><span class="rp-stat-sub">${esc(tr('bottlesDay', fmt1(rep.avgBottlesPerDay || 0)))}</span></div></div>`;
    const note = isOne && onlyDay ? tr('oneFeedNote', `${WDS[S.lang === 'es' ? 'es' : 'en'][partsOf(onlyDay.date).wd]}, ${shortDate(onlyDay.date)}`)
      : tr('feedsLoggedNote', rep.totalFeeds, rep.loggedDays, rep.totalBreast, rep.totalBottle);
    const summary = `<section class="card t-feed"><div class="rp-hero"><p class="rp-hero-val">${hero}</p></div>${stats}${isOne ? '' : sideBalanceHTML(rep.sideBalance)}<p class="rp-delta">${esc(note)}</p></section>`;
    const last = rep.days.at(-1), lp = last ? partsOf(last.date) : null;
    const readout = last ? `<p class="readout"><b>${esc(`${WDS[S.lang === 'es' ? 'es' : 'en'][lp.wd]}, ${shortDate(last.date)}`)}</b> · ${esc(`${last.feedCount || 0} (${last.breastCount || 0} ${tr('breast').toLowerCase()}, ${last.bottleCount || 0} ${tr('bottle').toLowerCase()})`)}</p>` : '';
    const bandNote = rep.band?.kind === 'range' ? `<p class="nr-key"><svg width="16" height="12" aria-hidden="true"><rect x="1" y="1" width="14" height="10" rx="2" class="nr-band"/></svg>${esc(tr('bandFeedKey', rep.band.low, rep.band.high))}</p>` : '';
    const chart = `<section class="card t-feed"><div class="chart-head">${iconBlock('bottle')}<h2>${esc(tr('feedsPerDay'))}</h2></div>${readout}<div class="plot">${feedPlot(rep)}</div>${bandNote}<p class="rp-vary">${esc(tr('vary'))}</p></section>`;
    return sheetWrap(tr('eatingTitle'), head + summary + chart + feedGapsCard(rep, isOne) + guideCard(rep.guide));
  }

  /* ---------- Report 4: Doctor visit ---------- */
  function doctorDayLines(d) {
    const lines = [];
    if (d.feedCount != null) {
      const vol = d.bottleMl ? ` · ${fmtVolume(d.bottleMl)}` : '';
      lines.push(`<div><b>${esc(tr('feedsLabel'))}:</b> ${esc(`${d.feedCount} (${d.breastCount || 0} ${tr('breast').toLowerCase()}, ${d.bottleCount || 0} ${tr('bottle').toLowerCase()}${vol})`)}</div>`);
    }
    if (d.wet != null || d.dirty != null) {
      lines.push(`<div><b>${esc(tr('diapersLabel'))}:</b> ${esc(`${d.wet || 0} ${tr('wetWord')}, ${d.dirty || 0} ${tr('dirtyWord')}`)}</div>`);
    }
    if (d.sleepMin != null) {
      lines.push(`<div><b>${esc(tr('sleepLabel'))}:</b> ${esc(fmtDur(d.sleepMin))}</div>`);
      lines.push(`<div class="rp-day-sub">${esc(`${fmtDur(d.nightMin)} ${tr('colNight').toLowerCase()} · ${d.naps || 0}${NB}${tr('colNaps').toLowerCase()}`)}</div>`);
    }
    return lines.length ? lines.join('') : `<div class="rp-day-sub">${esc(tr('noRecordsDay'))}</div>`;
  }

  function doctorAveragesCard(a) {
    const tiles = [
      a.feeds != null && `<div class="rp-stat t-feed tinted"><span class="rp-stat-label">${esc(tr('feedsLabel'))}</span><span class="rp-stat-val">${esc(`${fmt1(a.feeds)} ${tr('aDay')}`)}</span></div>`,
      a.sleepMin != null && `<div class="rp-stat t-sleep tinted"><span class="rp-stat-label">${esc(tr('sleepLabel'))}</span><span class="rp-stat-val">${esc(fmtDur(a.sleepMin))}</span></div>`,
      a.wet != null && `<div class="rp-stat t-dia tinted"><span class="rp-stat-label">${esc(tr('wetLabel'))}</span><span class="rp-stat-val">${esc(`${fmt1(a.wet)} ${tr('aDay')}`)}</span></div>`,
      a.dirty != null && `<div class="rp-stat t-dia tinted"><span class="rp-stat-label">${esc(tr('dirtyLabel'))}</span><span class="rp-stat-val">${esc(`${fmt1(a.dirty)} ${tr('aDay')}`)}</span></div>`,
    ].filter(Boolean);
    return tiles.length ? `<section class="card"><h2>${esc(tr('averages'))}</h2><div class="rp-stats">${tiles.join('')}</div></section>` : '';
  }

  function doctorMedsCard(rep, p, today) {
    if (!p.medication) return '';
    const rows = rep.medicines.map(m => {
      const unit = m.unit === 'ml' ? 'mL' : m.unit;
      const dose = m.dose != null ? `${m.dose}${unit ? NB + unit : ''}` : '';
      const lastDate = shortDate(shiftISO(today, m.lastDayOffset));
      return `<div class="rp-kv-row"><div class="rp-kv-main"><strong>${esc(m.name)}</strong><span class="sub">${esc(tr('medDoses', dose, m.doses, rep.windowDays))}</span><span class="sub">${esc(tr('medLast', lastDate, fmtClock(m.lastClockMin)))}</span></div></div>`;
    }).join('');
    return `<section class="card"><h2>${esc(tr('medsHeading'))}</h2>${rows ? `<div class="rp-kv-list">${rows}</div>` : `<p class="sub">${esc(tr('medsEmpty'))}</p>`}</section>`;
  }

  function doctorHTML() {
    const p = permissions(), days = R.period === 14 ? 14 : 7, today = todayISO(), nowMin = nowM();
    const endOffset = RP().reportEndOffset(nowMin);
    const range = rangeLabel(shiftISO(today, endOffset - days), shiftISO(today, endOffset - 1));
    const age = ageText(LittleDaysCryLog.ageDaysOf(S.child?.birthDate, today));
    const meta = [babyName(), age, range].filter(Boolean).join(' · ');
    const head = periodBar([7, 14], days, meta);
    if (R.state === 'loading') return sheetWrap(tr('doctorTitle'), head + loadingCards());
    if (R.state === 'error') return sheetWrap(tr('doctorTitle'), head + errorCard());
    const rep = RP().doctorReport({entries: R.entries, growthEntries: R.growth, todayISO: today, nowMin, windowDays: days, birthDate: S.child?.birthDate, permissions: p});
    const avgs = doctorAveragesCard(rep.averages);
    const growthRows = growthRowsHTML(rep.growth, false);
    const growth = growthRows ? `<section class="card"><h2>${esc(tr('latestGrowth'))}</h2><div class="rp-kv-list">${growthRows}</div></section>` : '';
    const meds = doctorMedsCard(rep, p, today);
    const lang = S.lang === 'es' ? 'es' : 'en';
    const dayItems = rep.days.slice().reverse().map(d => {
      const dp = partsOf(d.date);
      return `<div class="rp-day-item"><div class="rp-day-date"><span class="wd">${esc(WDS[lang][dp.wd])}</span><span class="num">${dp.d}</span></div><div class="rp-day-lines">${doctorDayLines(d)}</div></div>`;
    }).join('');
    const dayList = dayItems ? `<section class="card"><h2>${esc(tr('dayByDay'))}</h2><p class="sub rp-sub-gap">${esc(tr('dayByDaySub', days))}</p><div class="rp-day-list">${dayItems}</div></section>` : '';
    const actions = `<div class="rp-actions"><button type="button" class="btn-primary" data-act="report-print">${esc(tr('printReport'))}</button><a class="textlink" href="${esc(rep.exportUrl)}" download="little-days.csv" data-act="report-csv">${esc(tr('downloadCsv'))}${glyph('chev')}</a></div>`;
    if (!avgs && !growth && !rep.medicines.length && !dayItems) return sheetWrap(tr('doctorTitle'), head + emptyCard('emptyDoctor'));
    return sheetWrap(tr('doctorTitle'), head + actions + avgs + growth + meds + dayList);
  }

  /* ---------- open / close / actions ---------- */
  function openReport(kind) {
    if (!['weekly', 'sleep', 'eating', 'doctor'].includes(kind) || !canView(kind)) return;
    R.backTo = S.tab === 'home' ? 'home' : 'charts';
    R.opener = S.lastClick || keyOf(document.activeElement) || null;
    R.kind = kind;
    R.period = 7;
    R.open = {};
    loadReport();
    requestAnimationFrame(() => document.querySelector('.rp-sheet [data-act="report-close"]')?.focus({preventScroll: true}));
  }

  function closeReport() {
    const opener = R.opener;
    R.kind = null; R.state = 'idle'; R.opener = null; R.seq++;
    render();
    if (opener) { const el = byKey(opener); if (el) el.focus({preventScroll: true}); }
  }

  function setPeriod(arg) {
    const n = Number(arg);
    if (![7, 14, 30].includes(n) || n === R.period) return;
    R.period = n;
    loadReport();
  }

  function handle(a, arg) {
    if (a === 'report-open') { openReport(arg); return true; }
    if (a === 'report-close') { closeReport(); return true; }
    if (a === 'report-period') { setPeriod(arg); return true; }
    if (a === 'report-retry') { loadReport(); return true; }
    if (a === 'report-dismiss') { setDismissed(todayISO()); render(); return true; }
    if (a === 'report-print') { window.print(); return true; }
    if (a === 'report-csv') return true;
    return false;
  }

  function checkOwner() {
    const owner = S.auth === 'ready' ? `${meKey()}:${S.child?.id || ''}` : '';
    if (owner === R.owner) return;
    R.owner = owner; R.kind = null; R.state = 'idle'; R.entries = []; R.growth = []; R.open = {}; R.seq++;
  }

  function layerHTML() {
    checkOwner();
    if (!R.kind || S.sheet) return '';
    if (R.kind === 'weekly') return weeklyHTML();
    if (R.kind === 'sleep') return sleepHTML();
    if (R.kind === 'eating') return eatingHTML();
    if (R.kind === 'doctor') return doctorHTML();
    return '';
  }

  document.addEventListener('toggle', ev => {
    const el = ev.target;
    if (el?.isConnected && el.matches?.('details[data-rp-guide]')) R.open[el.dataset.rpGuide] = el.open;
  }, true);

  document.addEventListener('keydown', ev => {
    if (!R.kind || S.sheet || S.confirmStop) return;
    if (ev.key === 'Tab') { trapTab(ev, '.rp-sheet button:not([disabled]), .rp-sheet a[href], .rp-sheet summary'); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); closeReport(); }
  });

  return {
    W,
    handle,
    layerHTML,
    chartsCardHTML,
    homeCardHTML,
    checkOwner,
    open: () => Boolean(R.kind) && !S.sheet,
    state: R,
  };
})();
