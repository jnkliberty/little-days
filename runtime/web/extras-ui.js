/* Extras screens for Group 4 (plan 2026-11-21, lines 255-278; round 1 mockup approved 2026-11-22:
   Option A Timelapse card on Photos, Close + Previous/Pause/Next player controls, "No photos in the last 31 days."
   when older photos exist). Mirrors web/reports-ui.js and sets globalThis.LittleDaysExtrasUI. */
globalThis.LittleDaysExtrasUI = (() => {
  'use strict';
  const NB = '\u00a0';
  const PRELOAD_AHEAD = 3;
  const MAX_LIST_CALLS = 100;
  const SG = () => globalThis.LittleDaysSleepGuides;
  const RP = () => globalThis.LittleDaysReports;

  /* ---------- copy table (checked by test/copy.test.ts) ---------- */
  const W = {
    sleepPlanTitle: ['Sleep plan', 'Plan de sueño'],
    sleepPlanSub: ['Schedule, age guides, weekly steps', 'Horario, guías por edad, pasos semanales'],
    backCharts: ['Charts', 'Gráficas'],
    close: ['Close', 'Cerrar'],
    disclaimer: ['Not medical advice. Ask the pediatrician.', 'No es consejo médico. Consulte al pediatra.'],
    noBirthMeta: [name => `${name} · Birth date not set`, name => `${name} · Sin fecha de nacimiento`],
    birthDay: ['Birth day', 'Día de nacimiento'],
    ageDays: [n => `${n} ${n === 1 ? 'day' : 'days'} old`, n => `${n} ${n === 1 ? 'día' : 'días'} de edad`],
    ageMonths: [n => `${n} ${n === 1 ? 'month' : 'months'} old`, n => `${n} ${n === 1 ? 'mes' : 'meses'} de edad`],
    scheduleHeading: ['Her usual schedule', 'Su horario usual'],
    fromLast7: ['From her last 7 days', 'De sus últimos 7 días'],
    fewGapsNote: [
      'Schedule estimates appear after 8 daytime awake gaps in the last 7 days.',
      'Los horarios estimados aparecen después de 8 ratos despierta de día en los últimos 7 días.',
    ],
    napsPerDay: ['Naps a day', 'Siestas al día'],
    awakeTime: ['Awake time', 'Tiempo despierta'],
    usualNap: ['Usual nap', 'Siesta usual'],
    bedtime: ['Bedtime', 'Hora de dormir'],
    wakeAbout: [w => `Wake about ${w}`, w => `Despertar ${w}`],
    toRange: [(a, b) => `${a} to ${b}`, (a, b) => `${a} a ${b}`],
    shiftHeading: ['How a short nap shifts the day', 'Cómo cambia el día tras una siesta corta'],
    shiftNote: [
      (shortMin, usualDur, shiftMin) => `If Nap 1 ends after ${shortMin}${NB}min instead of ${usualDur}, later naps and bedtime move about ${shiftMin}${NB}min earlier.`,
      (shortMin, usualDur, shiftMin) => `Si la Siesta 1 dura ${shortMin}${NB}min en lugar de ${usualDur}, las siestas siguientes y la hora de dormir se adelantan unos ${shiftMin}${NB}min.`,
    ],
    colBlock: ['Part', 'Bloque'],
    colUsual: ['Usual day', 'Día usual'],
    colShort: ['Short Nap 1', 'Siesta 1 corta'],
    rowWake: ['Wake', 'Despertar'],
    rowNap: [n => `Nap ${n}`, n => `Siesta ${n}`],
    rowBed: ['Bedtime', 'Dormir'],
    strategiesHeading: [band => `Strategies · ${band}`, band => `Estrategias · ${band}`],
    settlingTag: ['Settling method · 6+ months', 'Método para dormirse · 6+ meses'],
    quoteToggle: [src => `Quote and source · ${src}`, src => `Cita y fuente · ${src}`],
    readDate: [d => `Read ${d}`, d => `Leído el ${d}`],
    sourceLink: [src => `Source: ${src}`, src => `Fuente: ${src}`],
    gateTitle: ['Settling methods open at 6 months', 'Los métodos para dormirse por su cuenta se abren a los 6 meses'],
    gateSubAge: [
      age => `At ${age}, focus on safe sleep and day-night rhythm first.`,
      age => `Con ${age}, enfóquese primero en el sueño seguro y el ritmo de día y noche.`,
    ],
    gateNoBirthTitle: ['Add her birth date in Settings', 'Agregue su fecha de nacimiento en Ajustes'],
    gateNoBirthSub: [
      'Age-band strategies appear once her birth date is saved. Settling methods stay locked until 6 months.',
      'Las estrategias por edad aparecen al guardar su fecha de nacimiento. Los métodos para dormirse se mantienen bloqueados hasta los 6 meses.',
    ],
    over12Note: [
      'These guides cover up to 12 months. Ask the pediatrician for toddler sleep guidance.',
      'Estas guías cubren hasta los 12 meses. Consulte al pediatra sobre el sueño después del año.',
    ],
    weeklyStepsHeading: ['Weekly steps', 'Pasos semanales'],
    loadingPlan: ['Loading her sleep plan…', 'Cargando su plan de sueño…'],
    errPlanTitle: ['Could not load sleep records', 'No se pudieron cargar los registros de sueño'],
    errPlanBody: [
      'Her schedule needs the last 7 days of sleep records. Try again.',
      'Su horario necesita los últimos 7 días de registros de sueño. Inténtelo de nuevo.',
    ],
    tlTitle: ['Photo timelapse', 'Secuencia de fotos'],
    tlCountRange: [(n, range) => `${n} ${n === 1 ? 'photo' : 'photos'} · ${range}`, (n, range) => `${n} ${n === 1 ? 'foto' : 'fotos'} · ${range}`],
    photosNoneRecent: ['No photos in the last 31 days.', 'No hay fotos en los últimos 31 días.'],
    play: ['Play', 'Reproducir'],
    pause: ['Pause', 'Pausar'],
    playAgain: ['Play again', 'Repetir'],
    prev: ['Previous', 'Anterior'],
    next: ['Next', 'Siguiente'],
    countOf: [(i, n) => `${i} of ${n}`, (i, n) => `${i} de ${n}`],
    rmNote: [
      'Auto-play is off (Reduce Motion). Use Previous and Next.',
      'La reproducción automática está desactivada (Reducir movimiento). Use Anterior y Siguiente.',
    ],
    tlLoading: ['Loading photos…', 'Cargando fotos…'],
    tlErrTitle: ['Could not load photos', 'No se pudieron cargar las fotos'],
    tlErrBody: [
      'Check your connection to the family server and try again.',
      'Revise la conexión con el servidor familiar e inténtelo de nuevo.',
    ],
    tryAgain: ['Try again', 'Reintentar'],
  };

  const L = () => (S.lang === 'es' ? 1 : 0);
  const tr = (k, ...a) => { const v = W[k][L()]; return typeof v === 'function' ? v(...a) : v; };
  const nb = s => String(s).replace(/ /g, NB);
  const fmtDur = m => (m == null || !Number.isFinite(m) ? '--' : nb(durText(Math.max(0, Math.round(m)))));
  const fmtClock = m => (m == null || !Number.isFinite(m) ? '--' : nb(clk(m)));
  const fmt1 = v => (v == null || !Number.isFinite(v) ? '--' : (Math.round(v * 10) / 10).toFixed(1));
  const MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  };
  const WDS = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  };
  const closeGlyph = () => '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g class="ln"><path d="M7 7l10 10M17 7 7 17"/></g></svg>';
  const chev = () => `<span class="chev">${glyph('chev')}</span>`;

  /* ---------- state ---------- */
  const X = {
    mode: null, // null | 'plan' | 'timelapse'
    owner: '',
    opener: null,
    // Sleep plan state
    planState: 'idle', // idle | loading | ok | error
    planEntries: [],
    planSeq: 0,
    open: {safe: true},
    // Timelapse state
    photosState: 'idle', // idle | loading | ok | error
    photos: [], // sorted oldest -> newest: {id, time, ms, iso, url, title, photoName}
    photosSeq: 0,
    idx: 0,
    playing: false,
    imgError: false,
    preloaded: new Set(),
  };
  let timer = null;

  /* ---------- date & age helpers ---------- */
  function isoFromTime(timeStr) {
    const dt = new Date(timeStr);
    if (!Number.isFinite(dt.getTime())) return '';
    if (typeof localClock === 'function' && globalThis.LittleDaysZone?.get) return localClock(timeStr).date;
    const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function partsOf(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return {y, m, d, wd: dt.getUTCDay()};
  }

  function shortDate(iso) {
    if (!iso) return '';
    const p = partsOf(iso), lang = S.lang === 'es' ? 'es' : 'en';
    const mo = MONTHS[lang][p.m - 1];
    return lang === 'es' ? `${p.d} ${mo}` : `${mo} ${p.d}`;
  }

  function weekdayShortDate(iso) {
    if (!iso) return '';
    const p = partsOf(iso), lang = S.lang === 'es' ? 'es' : 'en';
    return `${WDS[lang][p.wd]}, ${shortDate(iso)}`;
  }

  function rangeLabel(from, to) {
    if (!from || !to) return '';
    if (from === to) return shortDate(from);
    const a = partsOf(from), b = partsOf(to);
    if (S.lang === 'es') return a.m === b.m ? `${a.d} al ${b.d} ${MONTHS.es[b.m - 1]}` : `${shortDate(from)} al ${shortDate(to)}`;
    return `${shortDate(from)} to ${shortDate(to)}`;
  }

  function ageText(ageDays) {
    if (typeof ageDays !== 'number' || !Number.isFinite(ageDays) || ageDays < 0) return '';
    if (ageDays === 0) return tr('birthDay');
    if (ageDays >= 60) return tr('ageMonths', Math.floor(ageDays / 30.44));
    return tr('ageDays', ageDays);
  }

  const prefersReducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Sleep plan data loading ---------- */
  function loadPlanRecords() {
    if (S.auth !== 'ready') return;
    if (!resourceAllowed('sleep')) {
      X.planEntries = [];
      X.planState = 'ok';
      render();
      return;
    }
    const seq = ++X.planSeq, owner = X.owner, today = todayISO(), nowMin = nowM();
    const endOffset = RP().reportEndOffset(nowMin);
    const chunks = RP().loadChunks(today, endOffset, 7);
    X.planState = 'loading';
    render();
    Promise.all(chunks.map(c => LittleDaysAPI.state(c.from, c.to))).then(replies => {
      if (seq !== X.planSeq || owner !== X.owner || X.mode !== 'plan') return;
      const byId = new Map();
      for (const reply of replies) {
        if (!reply || !Array.isArray(reply.entries)) throw new Error('incomplete');
        const serverDay = /^\d{4}-\d{2}-\d{2}$/.test(reply.today || '') ? reply.today : today;
        const offset = isoDay(serverDay, today) * 1440;
        for (const e of reply.entries) byId.set(String(e.id), {...shiftEntry(e, offset), id: String(e.id)});
      }
      X.planEntries = [...byId.values()];
      X.planState = 'ok';
      render();
    }).catch(() => {
      if (seq !== X.planSeq || owner !== X.owner || X.mode !== 'plan') return;
      X.planState = 'error';
      render();
    });
  }

  /* ---------- Photos list loading & bounded preloading ---------- */
  function normalizePhotoItem(item) {
    const ms = Date.parse(item?.time);
    if (!item?.id || !item?.url || !Number.isFinite(ms)) return null;
    return {
      id: String(item.id),
      time: item.time,
      ms,
      iso: isoFromTime(item.time),
      url: item.url,
      title: item.title || '',
      photoName: item.photoName || '',
    };
  }

  async function fetchAllPhotos(seq, owner) {
    const byId = new Map();
    let offset = 0;
    for (let step = 0; step < MAX_LIST_CALLS; step++) {
      const reply = await LittleDaysAPI.photos(offset);
      if (seq !== X.photosSeq || owner !== X.owner) return null;
      if (!reply || !Array.isArray(reply.photos)) throw new Error('invalid');
      for (const raw of reply.photos) {
        const item = normalizePhotoItem(raw);
        if (item) byId.set(item.id, item);
      }
      if (reply.nextOffset == null) break;
      offset = Number(reply.nextOffset);
      if (!Number.isSafeInteger(offset) || offset <= 0) break;
    }
    return [...byId.values()].sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id));
  }

  async function loadPhotosList(force = false) {
    checkOwner();
    if (S.auth !== 'ready' || !resourceAllowed('notes')) return;
    if (!force && (X.photosState === 'loading' || X.photosState === 'ok')) return;
    const seq = ++X.photosSeq, owner = X.owner;
    X.photosState = 'loading';
    if (X.mode === 'timelapse') render();
    try {
      const list = await fetchAllPhotos(seq, owner);
      if (!list) return;
      X.photos = list;
      X.photosState = 'ok';
      if (X.mode === 'timelapse') {
        X.idx = Math.max(0, Math.min(X.idx, Math.max(0, X.photos.length - 1)));
        X.playing = !prefersReducedMotion() && X.photos.length > 1;
        preloadAhead(X.idx);
        syncTimer();
      }
      if (S.tab === 'photos' || X.mode === 'timelapse') render();
    } catch {
      if (seq !== X.photosSeq || owner !== X.owner) return;
      X.photosState = 'error';
      if (S.tab === 'photos' || X.mode === 'timelapse') render();
    }
  }

  function invalidatePhotos() {
    X.photosSeq++;
    X.photosState = 'idle';
    X.preloaded.clear();
  }

  function preloadAhead(fromIdx) {
    const cur = X.photos[fromIdx];
    if (cur) X.preloaded.add(cur.url);
    const end = Math.min(X.photos.length - 1, fromIdx + PRELOAD_AHEAD);
    for (let i = fromIdx + 1; i <= end; i++) {
      const item = X.photos[i];
      if (!item || X.preloaded.has(item.url)) continue;
      X.preloaded.add(item.url);
      if (typeof Image === 'function') {
        const img = new Image();
        img.src = item.url;
      }
    }
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function syncTimer() {
    stopTimer();
    if (X.mode !== 'timelapse' || !X.playing || X.photosState !== 'ok' || X.photos.length <= 1 || prefersReducedMotion()) return;
    timer = setInterval(() => {
      if (X.mode !== 'timelapse' || !X.playing) { stopTimer(); return; }
      if (X.idx >= X.photos.length - 1) {
        X.playing = false;
        stopTimer();
        render();
        return;
      }
      X.idx += 1;
      X.imgError = false;
      preloadAhead(X.idx);
      render();
    }, 1000);
  }

  /* ---------- Charts Reports card 5th row ---------- */
  function chartsRowHTML() {
    return `<li class="t-sleep"><button type="button" class="nav-row" data-act="extras-plan-open">${iconBlock('cal')}<span class="cry-text"><strong>${esc(tr('sleepPlanTitle'))}</strong><span class="sub">${esc(tr('sleepPlanSub'))}</span></span>${chev()}</button></li>`;
  }

  /* ---------- Photos Timelapse card (Option A, approved 2026-11-22) ---------- */
  function photosCardHTML() {
    if (!resourceAllowed('notes') || X.photosState !== 'ok' || !X.photos.length) return '';
    const first = X.photos[0].iso, last = X.photos[X.photos.length - 1].iso;
    const sub = tr('tlCountRange', X.photos.length, rangeLabel(first, last));
    return `<section class="card tl-card t-plain" data-tl-entry aria-labelledby="tl-entry-h">`
      + `<div class="tl-card-top">${iconBlock('camera')}<div><h2 id="tl-entry-h">${esc(tr('tlTitle'))}</h2><span class="sub">${esc(sub)}</span></div></div>`
      + `<button type="button" class="btn-primary tl-play-btn" data-act="extras-tl-open">${glyph('play')}${esc(tr('play'))}</button>`
      + `</section>`;
  }

  function photosEmptyText() {
    return resourceAllowed('notes') && X.photosState === 'ok' && X.photos.length > 0 ? tr('photosNoneRecent') : '';
  }

  /* ---------- Sleep plan sheet HTML ---------- */
  function planScheduleHTML() {
    if (!resourceAllowed('sleep')) return '';
    if (X.planState === 'loading') {
      return `<section class="card rp-skel-card" role="status" aria-label="${esc(tr('loadingPlan'))}">`
        + `<p class="sub">${esc(tr('loadingPlan'))}</p><span class="rp-skel h32" aria-hidden="true"></span>`
        + `<div class="rp-stats"><span class="rp-skel h64" aria-hidden="true"></span><span class="rp-skel h64" aria-hidden="true"></span><span class="rp-skel h64" aria-hidden="true"></span><span class="rp-skel h64" aria-hidden="true"></span></div>`
        + `</section>`;
    }
    if (X.planState === 'error') {
      return `<section class="card rp-error" role="alert"><div class="warn">${glyph('warn')}<span>${esc(tr('errPlanTitle'))}</span></div>`
        + `<p>${esc(tr('errPlanBody'))}</p><button type="button" class="back" data-act="extras-plan-retry">${esc(tr('tryAgain'))}</button></section>`;
    }
    const sched = SG().scheduleFromEntries({entries: X.planEntries, nowMin: nowM()});
    if (!sched.ready) {
      return `<section class="card t-sleep"><div class="chart-head">${iconBlock('moon')}<h2>${esc(tr('scheduleHeading'))}</h2></div>`
        + `<p class="sub">${esc(tr('fewGapsNote'))}</p></section>`;
    }
    const awakeRange = tr('toRange', fmtDur(sched.awakeP25Min), fmtDur(sched.awakeP75Min));
    const wakeSub = sched.typicalWakeMin != null ? `<span class="rp-stat-sub">${esc(tr('wakeAbout', fmtClock(sched.typicalWakeMin)))}</span>` : '';
    const rows = sched.rows.map(r => {
      const lbl = r.kind === 'wake' ? tr('rowWake') : r.kind === 'bed' ? tr('rowBed') : tr('rowNap', r.index);
      return `<tr><th scope="row">${esc(lbl)}</th><td>${esc(fmtClock(r.usualMin))}</td><td${r.changed ? ' class="rp-strong"' : ''}>${esc(fmtClock(r.shiftedMin))}</td></tr>`;
    }).join('');
    return `<section class="card t-sleep"><div class="chart-head">${iconBlock('moon')}<h2>${esc(tr('scheduleHeading'))}</h2></div>`
      + `<p class="sub" style="margin-bottom:12px">${esc(tr('fromLast7'))}</p>`
      + `<div class="rp-stats">`
      + `<div class="rp-stat"><span class="rp-stat-label">${esc(tr('napsPerDay'))}</span><span class="rp-stat-val">${esc(fmt1(sched.avgNaps))}</span></div>`
      + `<div class="rp-stat"><span class="rp-stat-label">${esc(tr('awakeTime'))}</span><span class="rp-stat-val">${esc(fmtDur(sched.awakeMedianMin))}</span><span class="rp-stat-sub">${esc(awakeRange)}</span></div>`
      + `<div class="rp-stat"><span class="rp-stat-label">${esc(tr('usualNap'))}</span><span class="rp-stat-val">${esc(fmtDur(sched.typicalNapMin))}</span></div>`
      + `<div class="rp-stat"><span class="rp-stat-label">${esc(tr('bedtime'))}</span><span class="rp-stat-val">${esc(fmtClock(sched.typicalBedtimeMin))}</span>${wakeSub}</div>`
      + `</div>`
      + `<div class="sp-shift"><h3>${esc(tr('shiftHeading'))}</h3>`
      + `<p class="sp-shift-note">${esc(tr('shiftNote', sched.shortNapMin, fmtDur(sched.typicalNapMin), sched.shiftMin))}</p>`
      + `<div class="rp-table-wrap"><table class="rp-table"><thead><tr><th scope="col">${esc(tr('colBlock'))}</th><th scope="col">${esc(tr('colUsual'))}</th><th scope="col">${esc(tr('colShort'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + `</div></section>`;
  }

  function planGuidesHTML(plan, ageDays) {
    const safe = plan.safeSleep;
    const safeSrc = String(safe?.title || '').split(':')[0] || 'NICHD';
    const safeOpen = X.open.safe !== false ? ' open' : '';
    const safeCard = safe
      ? `<section class="card nav"><ul><li><details data-sp-open="safe"${safeOpen}><summary class="nav-row"><strong>${esc(safe.title)}</strong>${chev()}</summary>`
        + `<div class="rp-guide-body"><p>${esc(safe.body)}</p><a class="textlink" href="${esc(safe.url)}" target="_blank" rel="noopener noreferrer">${esc(tr('sourceLink', safeSrc))}${glyph('ext')}</a></div>`
        + `</details></li></ul></section>`
      : '';
    if (!plan.band) {
      return safeCard + `<section class="card"><div class="sp-gate-box" style="margin-top:0"><strong>${esc(tr('gateNoBirthTitle'))}</strong><span>${esc(tr('gateNoBirthSub'))}</span></div></section>`;
    }
    const items = plan.strategies.map(st => {
      const openAttr = X.open[`q:${st.code}`] ? ' open' : '';
      return `<div class="sp-strat-item"><span class="sp-code">${esc(st.code)}</span><div class="sp-strat-body">`
        + `<p class="sp-strat-text">${esc(st.text)}</p>`
        + (st.settling ? `<span class="sp-settling-note">${esc(tr('settlingTag'))}</span>` : '')
        + `<details class="sp-quote" data-sp-open="q:${esc(st.code)}"${openAttr}><summary>${esc(tr('quoteToggle', st.src))}${glyph('chev')}</summary>`
        + `<div class="sp-quote-body"><blockquote class="sp-quote-text">${esc(st.quote)}</blockquote>`
        + `<span class="sp-quote-meta">${esc(tr('readDate', st.read))}</span>`
        + `<a class="textlink" href="${esc(st.url)}" target="_blank" rel="noopener noreferrer">${esc(tr('sourceLink', st.src))}${glyph('ext')}</a></div>`
        + `</details></div></div>`;
    }).join('');
    const gateBox = !plan.settlingUnlocked
      ? `<div class="sp-gate-box"><strong>${esc(tr('gateTitle'))}</strong><span>${esc(tr('gateSubAge', ageText(ageDays)))}</span></div>`
      : '';
    const over12 = plan.over12Months ? `<p class="rp-vary">${esc(tr('over12Note'))}</p>` : '';
    const stratCard = `<section class="card t-sleep"><h2>${esc(tr('strategiesHeading', plan.band.label))}</h2><div class="sp-strat-list">${items}</div>${gateBox}${over12}</section>`;
    const weeks = plan.weeks.map((wk, idx) =>
      `<li class="sp-week-item"><span class="sp-week-num">${S.lang === 'es' ? 'S' : 'W'}${idx + 1}</span><p class="sp-week-text">${esc(wk)}</p></li>`
    ).join('');
    const weeksCard = `<section class="card"><h2>${esc(tr('weeklyStepsHeading'))}</h2><ol class="sp-weeks">${weeks}</ol></section>`;
    return safeCard + stratCard + weeksCard;
  }

  function sleepPlanHTML() {
    const today = todayISO();
    const ageDays = LittleDaysCryLog.ageDaysOf(S.child?.birthDate, today);
    const plan = SG().planForAge(ageDays, S.lang === 'es');
    const name = babyName();
    const meta = plan.band ? `${name} · ${ageText(ageDays)} · ${plan.band.label}` : tr('noBirthMeta', name);
    const metaBlock = `<div class="sp-meta-block"><p class="sp-meta-line">${esc(meta)}</p><p class="sp-disclaimer">${esc(tr('disclaimer'))}</p></div>`;
    return `<div class="formscreen rp-sheet" data-kind="sleep-plan" role="dialog" aria-modal="true" aria-label="${esc(tr('sleepPlanTitle'))}"><div class="wrap t-plain charts-page">`
      + `<header class="bar"><button type="button" class="back" data-act="extras-plan-close">${glyph('back')}${esc(tr('backCharts'))}</button><h1>${esc(tr('sleepPlanTitle'))}</h1><span></span></header>`
      + metaBlock + planScheduleHTML() + planGuidesHTML(plan, ageDays)
      + `</div></div>`;
  }

  /* ---------- Full-screen Photo timelapse player HTML ---------- */
  function timelapseHTML() {
    if (X.photosState === 'loading') {
      return `<div class="tl-player" data-kind="timelapse" role="dialog" aria-modal="true" aria-label="${esc(tr('tlTitle'))}"><div class="tl-inner">`
        + `<header class="tl-bar"><button type="button" class="back" data-act="extras-tl-close">${closeGlyph()}${esc(tr('close'))}</button><span class="tl-count">${esc(tr('tlLoading'))}</span></header>`
        + `<div class="tl-content"><div class="tl-stage" role="status" aria-label="${esc(tr('tlLoading'))}"><span class="tl-skel-stage" aria-hidden="true"></span></div>`
        + `<div class="tl-meta"><span class="rp-skel h32" aria-hidden="true"></span><span class="rp-skel h16" aria-hidden="true"></span></div></div>`
        + `</div></div>`;
    }
    if (X.photosState === 'error' || !X.photos.length) {
      return `<div class="tl-player" data-kind="timelapse" role="dialog" aria-modal="true" aria-label="${esc(tr('tlTitle'))}"><div class="tl-inner">`
        + `<header class="tl-bar"><button type="button" class="back" data-act="extras-tl-close">${closeGlyph()}${esc(tr('close'))}</button><span></span></header>`
        + `<div class="tl-error-wrap"><section class="card rp-error" style="padding:16px" role="alert"><div class="warn">${glyph('warn')}<span>${esc(tr('tlErrTitle'))}</span></div>`
        + `<p>${esc(tr('tlErrBody'))}</p><button type="button" class="back" data-act="extras-tl-retry">${esc(tr('tryAgain'))}</button></section></div>`
        + `</div></div>`;
    }
    const total = X.photos.length;
    const idx = Math.max(0, Math.min(total - 1, X.idx));
    X.idx = idx;
    const item = X.photos[idx];
    const atStart = idx === 0, atEnd = idx === total - 1;
    const pct = Math.round(((idx + 1) / total) * 100);
    const photoAgeDays = item.iso ? LittleDaysCryLog.ageDaysOf(S.child?.birthDate, item.iso) : null;
    const ageLine = ageText(photoAgeDays);
    const dateStr = weekdayShortDate(item.iso);
    const caption = item.title || item.photoName || '';
    const headline = ageLine || dateStr;
    const subParts = ageLine ? [dateStr, caption].filter(Boolean) : [caption].filter(Boolean);
    const rm = prefersReducedMotion();
    const toggleIcon = X.playing ? glyph('pause') : glyph('play');
    const toggleLabel = X.playing ? tr('pause') : (atEnd && total > 1 ? tr('playAgain') : tr('play'));
    const stageBody = X.imgError
      ? `<div class="rp-error" style="padding:16px;width:100%" role="alert"><div class="warn">${glyph('warn')}<span>${esc(tr('tlErrTitle'))}</span></div><button type="button" class="back" data-act="extras-tl-img-retry">${esc(tr('tryAgain'))}</button></div>`
      : `<img class="tl-img" src="${esc(item.url)}" alt="${esc(caption || dateStr || tr('tlTitle'))}" data-tl-img>`;

    return `<div class="tl-player" data-kind="timelapse" role="dialog" aria-modal="true" aria-label="${esc(tr('tlTitle'))}"><div class="tl-inner">`
      + `<header class="tl-bar"><button type="button" class="back" data-act="extras-tl-close">${closeGlyph()}${esc(tr('close'))}</button><span class="tl-count">${esc(tr('countOf', idx + 1, total))}</span></header>`
      + `<div class="tl-content">`
      + `<div class="tl-stage">${stageBody}</div>`
      + `<div class="tl-meta">`
      + `<div class="tl-age">${esc(headline)}</div>`
      + (subParts.length ? `<div class="tl-date-cap">${esc(subParts.join(' · '))}</div>` : '')
      + `<span class="prog" role="progressbar" aria-label="${esc(tr('tlTitle'))}" aria-valuenow="${idx + 1}" aria-valuemin="1" aria-valuemax="${total}"><i style="width:${pct}%"></i></span>`
      + (rm ? `<div class="tl-rm-note">${esc(tr('rmNote'))}</div>` : '')
      + `</div></div>`
      + `<div class="tl-controls">`
      + `<button type="button" class="back tl-ctrl" data-act="extras-tl-prev"${atStart ? ' disabled' : ''}>${glyph('back')}<span>${esc(tr('prev'))}</span></button>`
      + `<button type="button" class="btn-primary tl-ctrl" data-act="extras-tl-toggle"${total === 1 || rm ? ' disabled' : ''}>${toggleIcon}<span>${esc(toggleLabel)}</span></button>`
      + `<button type="button" class="back tl-ctrl" data-act="extras-tl-next"${atEnd ? ' disabled' : ''}>${glyph('chev')}<span>${esc(tr('next'))}</span></button>`
      + `</div>`
      + `</div></div>`;
  }

  /* ---------- open / close / actions ---------- */
  function openPlan() {
    X.opener = S.lastClick || keyOf(document.activeElement) || null;
    X.mode = 'plan';
    X.open = {safe: true};
    loadPlanRecords();
    requestAnimationFrame(() => document.querySelector('[data-kind="sleep-plan"] [data-act="extras-plan-close"]')?.focus({preventScroll: true}));
  }

  function closeLayer() {
    const opener = X.opener;
    stopTimer();
    X.mode = null; X.playing = false; X.imgError = false; X.opener = null; X.planSeq++;
    render();
    if (opener) { const el = byKey(opener); if (el) el.focus({preventScroll: true}); }
  }

  function openTimelapse() {
    if (!resourceAllowed('notes')) return;
    X.opener = S.lastClick || keyOf(document.activeElement) || null;
    X.mode = 'timelapse';
    X.idx = 0;
    X.imgError = false;
    X.playing = !prefersReducedMotion() && X.photos.length > 1;
    if (X.photosState === 'ok' && X.photos.length) {
      preloadAhead(0);
      render();
      syncTimer();
    } else {
      void loadPhotosList(true);
    }
    requestAnimationFrame(() => document.querySelector('.tl-player [data-act="extras-tl-close"]')?.focus({preventScroll: true}));
  }

  function stepTimelapse(delta) {
    const next = X.idx + delta;
    if (next < 0 || next >= X.photos.length) return;
    X.playing = false;
    stopTimer();
    X.idx = next;
    X.imgError = false;
    preloadAhead(X.idx);
    render();
  }

  function toggleTimelapse() {
    if (X.photos.length <= 1 || prefersReducedMotion()) return;
    if (X.playing) {
      X.playing = false;
      stopTimer();
    } else {
      if (X.idx >= X.photos.length - 1) X.idx = 0;
      X.imgError = false;
      X.playing = true;
      preloadAhead(X.idx);
      syncTimer();
    }
    render();
  }

  function handle(a) {
    if (a === 'extras-plan-open') { openPlan(); return true; }
    if (a === 'extras-plan-close') { closeLayer(); return true; }
    if (a === 'extras-plan-retry') { loadPlanRecords(); return true; }
    if (a === 'extras-tl-open') { openTimelapse(); return true; }
    if (a === 'extras-tl-close') { closeLayer(); return true; }
    if (a === 'extras-tl-retry') { void loadPhotosList(true); return true; }
    if (a === 'extras-tl-img-retry') { X.imgError = false; render(); return true; }
    if (a === 'extras-tl-prev') { stepTimelapse(-1); return true; }
    if (a === 'extras-tl-next') { stepTimelapse(1); return true; }
    if (a === 'extras-tl-toggle') { toggleTimelapse(); return true; }
    return false;
  }

  function checkOwner() {
    const owner = S.auth === 'ready' ? `${meKey()}:${S.child?.id || ''}` : '';
    if (owner === X.owner) return;
    stopTimer();
    X.owner = owner; X.mode = null; X.planState = 'idle'; X.planEntries = []; X.planSeq++;
    X.photosState = 'idle'; X.photos = []; X.photosSeq++; X.idx = 0; X.playing = false; X.imgError = false; X.preloaded.clear();
  }

  function layerHTML() {
    checkOwner();
    if (!X.mode || S.sheet) return '';
    return X.mode === 'plan' ? sleepPlanHTML() : timelapseHTML();
  }

  document.addEventListener('toggle', ev => {
    const el = ev.target;
    if (el?.isConnected && el.matches?.('details[data-sp-open]')) X.open[el.dataset.spOpen] = el.open;
  }, true);

  document.addEventListener('error', ev => {
    const el = ev.target;
    if (X.mode === 'timelapse' && el?.matches?.('img[data-tl-img]')) {
      X.imgError = true;
      X.playing = false;
      stopTimer();
      render();
    }
  }, true);

  document.addEventListener('keydown', ev => {
    if (!X.mode || S.sheet || S.confirmStop) return;
    if (ev.key === 'Tab') {
      const sel = X.mode === 'plan'
        ? '[data-kind="sleep-plan"] button:not([disabled]), [data-kind="sleep-plan"] a[href], [data-kind="sleep-plan"] summary'
        : '.tl-player button:not([disabled])';
      trapTab(ev, sel);
      return;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); closeLayer(); return; }
    if (X.mode === 'timelapse' && X.photosState === 'ok') {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepTimelapse(-1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); stepTimelapse(1); }
      else if (ev.key === ' ' && ev.target?.tagName !== 'BUTTON') { ev.preventDefault(); toggleTimelapse(); }
    }
  });

  return {
    W,
    handle,
    layerHTML,
    chartsRowHTML,
    photosCardHTML,
    photosEmptyText,
    loadPhotosList,
    invalidatePhotos,
    checkOwner,
    open: () => Boolean(X.mode) && !S.sheet,
    state: X,
  };
})();
