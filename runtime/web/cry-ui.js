/* The screens of the Crying button.
   The look is mockup round 2 (design/2026-11-19-crying-button/round-2/), the behavior is the plan.
   It sets globalThis.LittleDaysCryUI. app.js calls it for the Home card, the answer card, the Settings group, the screens on top of
   the app, the status line with Undo, the 15 s tick and every data-act that starts with "cry-". It uses the app's own helpers
   (S, t, render, glyph, iconBlock, emptyState, clk, durText, homeEntries ...), the logic (LittleDaysCryLog, cry.js), the capture
   (LittleDaysCry, cry-capture.js) and the cry routes (LittleDaysAPI.cries, transport.js). Nothing here runs before app.js has loaded.

   Hooks for the browser check (data-act and classes):
     Home    .cry-home (the group of tiles and card C), [data-act=cry-open] (card C), .cry-ask, [data-act=cry-ask-answer][data-arg=<answer>],
             [data-act=cry-ask-skip], the status line .toast[data-cry-toast] with [data-act=cry-undo]
     Crying  .formscreen[data-kind=cry], [data-act=cry-close], .cry-rec[data-state=<strip state>], [data-act=cry-strip-delete],
             .cry-rec[data-state=off] with [data-act=cry-sound][data-arg=on] ("Turn on"), .cry-rec[data-state=next],
             [data-act=cry-retry-save], [data-act=cry-retry-mic], .cry-compare, .cry-row[data-arg=feed|sleep|diaper] ([data-act=cry-row]),
             .cry-key, .cry-none, .cry-rate (.shut after 15 min) with [data-act=cry-rate][data-arg=1|2|3],
             details[data-cry-passage=comfort|help], [data-act=cry-past]
   Plan 2026-11-20 (crying method fixes): the rows stay in the Home order, the rating line, the row tap record, the no-clip reason
   and the hold line in the strip.
     Sheets  .overlay .confirm[data-cry-sheet=first|deleteall|deletecry], [data-act=cry-first-record], [data-act=cry-first-later],
             [data-act=cry-delall-go], [data-act=cry-delcry-go], [data-act=cry-sheet-keep]
     Past    .formscreen[data-kind=cries], .cry-count, [data-act=cry-filter][data-arg=no|all], details[data-cry-id=<id>],
             [data-act=cry-answer][data-arg=<id>:<answer>], [data-act=cry-play], [data-act=cry-noisy], [data-act=cry-delete],
             [data-act=cry-list-retry], [data-empty=cries|alldone|error]
     Settings #cry-settings, [data-act=cry-sound][data-arg=on|off], [data-act=cry-delall] */
globalThis.LittleDaysCryUI = (() => {
  'use strict';
  const api = () => LittleDaysAPI.cries;
  const LOG = () => globalThis.LittleDaysCryLog;
  const ANSWERS = ['feed', 'diaper', 'sleep', 'burp', 'gas', 'poop', 'held', 'nothing'];
  const TYPES = ['feed', 'sleep', 'diaper'];
  const UNDO_MS = 10000;

  /* ---------- words: the string table T of the mockup, English then Spanish ---------- */
  // Spanish says "la 1:05" and "las 11:05": the article follows the hour.
  const las = c => (/^1:/.test(c) ? 'la' : 'las');
  const W = {
    crying: ['Crying?', '¿Llora?'], cryTitle: ['Crying', 'Llanto'],
    entrySub: ['Compare the log. Record 10 s.', 'Comparar el registro. Grabar 10 s.'],
    recording: ['Recording', 'Grabando'], left: [n => `${n} s left`, n => `faltan ${n} s`],
    clipSaved: ['Clip saved', 'Clip guardado'], secs: [n => `${n} s`, n => `${n} s`], del: ['Delete', 'Borrar'],
    noClip: ['No clip saved', 'Sin clip'], lostSub: ['The connection failed', 'Falló la conexión'],
    micOff: ['Microphone blocked', 'Micrófono bloqueado'], micOffSub: ['Saved with no sound', 'Guardado sin sonido'], tryAgain: ['Try again', 'Reintentar'],
    recOff: ['Recording is off', 'Grabación desactivada'], turnOn: ['Turn on', 'Activar'],
    recOn: ['Recording is on', 'Grabación activada'], recOnSub: ['It starts with the next cry', 'Empieza con el próximo llanto'],
    // The hold line of the strip while it records (plan 2026-11-20 M7). The distance words wait for the iPhone test: this one entry
    // holds the longest candidate, so a later change is one edit. No-break spaces keep "30 cm" and "si puede" on one line.
    hold: ['Hold the phone about 30 cm from her. Stay quiet if you can.', 'Ponga el teléfono a unos 30 cm de ella. Guarde silencio si puede.'],
    // The rating line (plan 2026-11-20 M2).
    rateQ: ['How upset is she?', '¿Qué tan alterada está?'], rateShut: ['Closed', 'Cerrado'],
    waitT: ['Clip not sent yet', 'Clip aún sin enviar'], waitSub: ['The app tries again soon', 'La app reintenta pronto'],
    goneT: ['Clip deleted', 'Clip borrado'],
    startT: ['Starting', 'Iniciando'], unsavedT: ['Not saved yet', 'Aún sin guardar'],
    keyLoad: ['Loading the last 7 days', 'Cargando los últimos 7 días'],
    compare: ['Compared with the usual', 'Comparado con lo usual'],
    fedAgo: [x => `Fed ${x} ago`, x => `Toma hace ${x}`], awakeFor: [x => `Awake ${x}`, x => `Despierta hace ${x}`], changedAgo: [x => `Changed ${x} ago`, x => `Cambio hace ${x}`],
    overBy: [d => `${d} over`, d => `${d} más`], underBy: [d => `${d} under`, d => `${d} menos`], aboutUsual: ['About usual', 'Cerca de lo usual'],
    usualIs: [u => `usual ${u}`, u => `usual ${u}`],
    noUsual: ['No usual yet', 'Aún sin dato usual'],
    feedingNow: ['Feeding now', 'Toma en curso'], sleepOn: ['Sleep timer is on', 'Sueño en curso'], startedAt: [c => `Started ${c}`, c => `Inició: ${c}`],
    keyDay: ['The usual for 7 AM to 7 PM, from the last 7 days', 'Lo usual de 7 a. m. a 7 p. m., en los últimos 7 días'],
    keyNight: ['The usual for 7 PM to 7 AM, from the last 7 days', 'Lo usual de 7 p. m. a 7 a. m., en los últimos 7 días'],
    keyNew: ['The usual shows when the last 7 days have enough records.', 'Lo usual aparece cuando los últimos 7 días tienen suficientes registros.'],
    nonePast: ['Nothing is past the usual.', 'Nada pasa de lo usual.'],
    comfort: [n => `Ways to comfort ${n}`, n => `Formas de calmar a ${n}`], help: ['When to get medical help', 'Cuándo buscar ayuda médica'],
    source: [s => `Source: ${s}`, s => `Fuente: ${s}`], past: ['Past cries', 'Llantos anteriores'],
    askWhat: [c => `What stopped the ${c} cry?`, c => `¿Qué calmó el llanto de ${las(c)} ${c}?`],
    skip: ['Skip', 'Omitir'],
    savedAns: [(a, c) => `Saved. ${a} stopped the ${c} cry.`, (a, c) => `Guardado. ${a} calmó el llanto de ${las(c)} ${c}.`],
    savedNone: [c => `Saved. Nothing worked for the ${c} cry.`, c => `Guardado. Nada funcionó con el llanto de ${las(c)} ${c}.`],
    stopped: [a => `${a} stopped it`, a => `${a} lo calmó`], noAnswer: ['No answer yet', 'Sin respuesta'],
    clipS: [n => `${n} s clip`, n => `Clip de ${n} s`], noClipRow: ['No clip', 'Sin clip'], markedNoisy: ['noisy', 'con ruido'],
    count: [n => `${n} of 100`, n => `${n} de 100`], countSub: ['cries that the sound test can use', 'llantos que la prueba de sonido puede usar'],
    countNote: ['A cry counts with a clip and an answer. Noisy clips and "Nothing worked" do not count. The goal is 100.', 'Un llanto cuenta con clip y respuesta. Los clips con ruido y «Nada funcionó» no cuentan. La meta es 100.'],
    show: ['Show', 'Mostrar'], fNo: [n => `No answer (${n})`, n => `Sin respuesta (${n})`], fAll: [n => `All (${n})`, n => `Todos (${n})`],
    today: ['Today', 'Hoy'], yesterday: ['Yesterday', 'Ayer'],
    whatStopped: ['What stopped it?', '¿Qué lo calmó?'], play: [n => `Play ${n} s`, n => `Oír ${n} s`], stopPlay: ['Stop', 'Detener'], noisy: ['Noisy clip', 'Clip con ruido'], delCry: ['Delete this cry', 'Borrar este llanto'],
    emptyCries: [n => `No cries yet. Tap "Crying?" on Home when ${n} cries.`, n => `Aún no hay llantos. Toque "¿Llora?" en Inicio cuando ${n} llore.`],
    allDone: ['Each cry has an answer.', 'Cada llanto tiene respuesta.'],
    loadErr: ['The cries did not load. Check your connection and try again.', 'Los llantos no cargaron. Revise su conexión e intente de nuevo.'],
    setSound: ['Record the cry (10 seconds)', 'Grabar el llanto (10 segundos)'], on: ['On', 'Activado'], off: ['Off', 'Desactivado'],
    pastSub: [n => `${n} of 100 with an answer and a clip`, n => `${n} de 100 con respuesta y clip`],
    delAll: ['Delete all sound clips', 'Borrar todos los clips de sonido'], delAllSub: [n => `${n} clips on the family computer`, n => `${n} clips en la computadora familiar`],
    delAllQ: ['Delete all sound clips?', '¿Borrar todos los clips de sonido?'],
    delAllBody: [n => `This deletes ${n} clips from the family computer. The answers stay. Older backups keep their copies.`, n => `Se borran ${n} clips de la computadora familiar. Las respuestas se quedan. Los respaldos anteriores conservan sus copias.`],
    delAllGo: [n => `Delete ${n} clips`, n => `Borrar ${n} clips`],
    delAllBodyAll: ['This deletes all sound clips from the family computer. The answers stay. Older backups keep their copies.', 'Se borran todos los clips de sonido de la computadora familiar. Las respuestas se quedan. Los respaldos anteriores conservan sus copias.'],
    delAllGoAll: ['Delete all clips', 'Borrar todos los clips'],
    notUndone: [a => `Not undone. The answer is now ${a}.`, a => `No se deshizo. La respuesta ahora es ${a}.`], keepClips: ['Keep the clips', 'Conservar los clips'],
    delCryQ: ['Delete this cry?', '¿Borrar este llanto?'],
    delCryBody: [c => `The ${c} cry, its answer and its sound clip are deleted.`, c => `Se borran el llanto de ${las(c)} ${c}, su respuesta y su clip.`],
    delCryGo: ['Delete the cry', 'Borrar el llanto'], keepCry: ['Keep the cry', 'Conservar el llanto'],
    firstQ: ['Record the cry?', '¿Grabar el llanto?'],
    firstBody: [s => `Each time this screen opens, the app can record 10 seconds of sound. The clip stays on the family computer. ${s} can switch this off.`, s => `Cada vez que se abre esta pantalla, la app puede grabar 10 segundos de sonido. El clip se queda en la computadora familiar. Se desactiva en ${s}.`],
    firstGo: ['Record 10 seconds', 'Grabar 10 segundos'], notNow: ['Not now', 'Ahora no'],
    rate: {1: ['Fussing', 'Inquieta'], 2: ['Crying', 'Llorando'], 3: ['Screaming', 'Gritando']},
    ans: {feed: ['A feed', 'Una toma'], diaper: ['A diaper change', 'Un cambio de pañal'], sleep: ['Sleep', 'Dormir'], burp: ['A burp', 'Un eructo'], gas: ['Gas', 'Sacar gases'], poop: ['Pooping', 'Hacer popó'], held: ['Being held', 'Estar en brazos'], nothing: ['Nothing worked', 'Nada funcionó']},
  };
  const L = () => (S.lang === 'es' ? 1 : 0);
  const tr = (k, ...a) => { const v = W[k][L()]; return typeof v === 'function' ? v(...a) : v; };
  const answerWord = k => W.ans[k][L()];
  // The clock time never breaks across two lines.
  const clock = m => clk(m).replace(/ /g, ' ');
  const clockOfISO = iso => clock(instantMinutes(iso));

  /* ---------- drawings: the cry face of the mockup, in the style of the other icons ---------- */
  const CRY_LINE = '<path d="M19.6 12.4A7.6 7.6 0 1 1 12 4.8"/><path d="M8 11l2.3-1.1M16 11l-2.3-1.1"/><path d="M9.2 17.3c.2-2.3 1.3-3.6 2.8-3.6s2.6 1.3 2.8 3.6Z"/><path d="M15.9 4.1l.7-1.6M19 6.5l1.6-1.3M21.1 10l1.5-.4"/>';
  const CRY_SHAPE = 'M12 4.8a7.6 7.6 0 1 1 0 15.2 7.6 7.6 0 0 1 0-15.2Z';
  const cryArt = `<g transform="rotate(-6 12 12)"><path class="shape" transform="translate(1.44 1) scale(1.1)" d="${CRY_SHAPE}"/><g class="ln">${CRY_LINE}</g></g>`;
  const cryBlock = `<svg class="ico" data-art="cry" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect class="plate" width="40" height="40" rx="14"/><g transform="translate(6 6) scale(1.1667)">${cryArt}</g></svg>`;
  const chev = () => `<span class="chev">${glyph('chev')}</span>`;
  const CARE = {feed: 't-feed', sleep: 't-sleep', diaper: 't-dia'};
  const FORM = {feed: 'open-feed', sleep: 'open-sleep', diaper: 'open-dia'};

  /* ---------- state ---------- */
  // `rev` counts the times the page learned the sound choice by itself (a save, or a create reply that refused the sound).
  const freshHome = () => ({loaded: false, failed: false, ask: null, sound: null, saving: false, rev: 0, hidden: new Set(), inflight: null, owner: ''});
  const freshList = () => ({state: 'idle', cries: [], count: null, goal: 100, filter: 'no', open: {}, seq: 0});
  // `live` keeps every queue and recording this adult started, so a change of adult stops all of them, not only the last tap's.
  const C = {home: freshHome(), list: freshList(), passages: null, passagesLoading: false, screen: null, tap: null, sheet: null, owner: '', live: [], playing: null};

  const can = action => resourceAllowed('notes', action);
  const changeFailed = () => { S.message = t('tryAgain'); };

  /* ---------- Home reply: the open question and the sound choice (GET /api/cries?home=1) ---------- */
  function pollHome() {
    if (C.home.inflight || S.auth !== 'ready' || !can('view')) return C.home.inflight;
    const home = C.home, rev = home.rev;
    home.inflight = api().home().then(reply => {
      if (C.home !== home) return;
      if (reply.status !== 200 || !reply.body) { home.failed = true; return; }
      const before = `${home.ask?.id}:${home.sound}`;
      // A reply that was asked for before the page learned the choice by itself, or that comes while a save is in flight, can hold
      // the choice of before: the page keeps its own. (Else "Turn on" on the Crying screen could go back to "Recording is off".)
      const old = home.saving || rev !== home.rev;
      const sound = old ? home.sound : reply.body.sound === 'on' || reply.body.sound === 'off' ? reply.body.sound : null;
      Object.assign(home, {loaded: true, failed: false, ask: reply.body.ask || null, sound});
      if (before === `${home.ask?.id}:${home.sound}`) return;
      if (S.tab === 'home' && !S.sheet) render();
      else if (S.sheet?.kind === 'settings' && !C.sheet) syncSound();
    }, () => { if (C.home === home) home.failed = true; }).finally(() => {
      if (C.home !== home) return;
      home.inflight = null;
      if (C.tap?.waitHome) homeArrived(C.tap);
    });
    return home.inflight;
  }

  function loadPassages() {
    if (C.passages || C.passagesLoading || S.auth !== 'ready') return;
    C.passagesLoading = true;
    api().passages().then(reply => { if (reply.status === 200 && reply.body) { C.passages = reply.body; if (C.screen === 'cry') render(); } })
      .catch(() => {}).finally(() => { C.passagesLoading = false; });
  }

  /* ---------- the records in memory, and the rows ---------- */
  // Only days whose reply has arrived: applyEntries and the Home evidence add a day to homeReads when its records are in.
  // S.loadedRanges is not used: loadDayRange marks a day there before its request finishes, and keeps it if the reply is old.
  const heldDays = () => new Set(homeReads);
  function memoryEntries(extra = []) {
    const byId = new Map();
    for (const entry of [...extra, ...homeEntries(todayISO())]) byId.set(String(entry.id), entry);
    return [...byId.values()];
  }
  const sleepTimer = () => shownRun(S.sleepRun) || S.sleepPaused || null;
  const rowsAt = (entries, now) => LOG().careRows({entries, now, run: shownRun(), sleepRun: sleepTimer()});

  // The days the memory lacks, in one ranged state request. The reply fills the rows; it never goes into the snapshot.
  // The rows keep their places (plan 2026-11-20 M1): the reply gives them their captions and bars in place.
  function loadMissing(tap, today) {
    const days = LOG().missingDays(heldDays(), today);
    if (!days.length) { tap.loading = false; return; }
    LittleDaysAPI.state(days[0], shiftISO(days.at(-1), 1)).then(state => {
      const serverDay = validDate(state?.today) ? state.today : today, offset = isoDay(serverDay, today) * 1440;
      tap.extra = (Array.isArray(state?.entries) ? state.entries : []).map(e => ({...shiftEntry(e, offset), id: String(e.id)}));
      tap.compared = true;
    }, () => { tap.loadFailed = true; }).finally(() => { tap.loading = false; if (C.tap === tap) render(); });
  }

  /* ---------- the tap ---------- */
  function newTap() {
    const today = todayISO(), now = nowExactM(), complete = LOG().isComplete(heldDays(), today);
    const snapshot = LOG().snapshot({entries: memoryEntries(), now, run: shownRun(), sleepRun: sleepTimer(), complete, ageDays: LOG().ageDaysOf(S.child?.birthDate, today)});
    // `compared`: the 7 days are in memory, so the rows show their captions and bars. `perfAt` is the monotonic time of the tap, for
    // the row tap time. `marks` holds the writes of the rating, the row tap and the no-clip reason that wait for the cry id or a reply.
    return {
      id: crypto.randomUUID(), occurredAt: new Date().toISOString(), tappedAt: Date.now(), soundAt: Date.now(), perfAt: performance.now(), adult: meKey(), snapshot, complete,
      compared: complete, loading: !complete, extra: [], open: {}, strip: null, want: null, rec: null, queue: null,
      saved: false, distress: null, rowTapped: false, marks: {wait: {}, busy: false},
    };
  }

  // Called inside the tap handler, so the AudioContext is made by the tap (the iPhone lets it run).
  function prepareRec(tap) {
    cancelRec(tap);
    const rec = tap.rec = LittleDaysCry.prepare({onState: state => recState(tap, state)});
    C.live.push(rec);
    rec.result.then(() => drop(rec));
    return rec;
  }
  function recState(tap, state) {
    if (state !== 'recording' || tap.strip === 'saved') return;
    tap.strip = 'rec'; tap.recAt = performance.now();
    if (C.tap === tap) render();
  }
  function cancelRec(tap) { if (tap.rec) tap.rec.cancel('no-sound'); }

  function openCry() {
    if (!can('add') || S.auth !== 'ready') return;
    leaveCry();
    const tap = newTap();
    C.tap = tap; C.screen = 'cry'; C.sheet = null;
    loadPassages();
    if (!tap.complete) loadMissing(tap, todayISO());
    if (!C.home.loaded) { tap.waitHome = true; prepareRec(tap); tap.strip = 'start'; if (!pollHome()) homeArrived(tap); }
    else afterChoice(tap);
    show();
  }

  // The Home reply arrived (or failed) while a tap waited for it.
  function homeArrived(tap) {
    tap.waitHome = false;
    if (C.home.loaded) afterChoice(tap); else send(tap, false);
    if (C.tap === tap) render();
  }

  function afterChoice(tap) {
    const choice = C.home.sound;
    if (choice === 'on') { if (!tap.rec) prepareRec(tap); send(tap, true); return; }
    if (choice === 'off') { send(tap, false); return; }
    cancelRec(tap); tap.strip = null; openSheet({kind: 'first'});
  }

  // The sheet "Record the cry?". "Record 10 seconds": this tap is the sound tap, then the choice `on` is saved, then the cry is created.
  // "Not now" saves no choice: the cry is created with no sound, and the sheet shows again with the next tap. Only Settings saves `off`.
  // Until 2026-11-20 "Not now" saved `off`. The app then never asked again, and a family recorded no cry.
  function firstAnswer(record) {
    const tap = C.tap;
    C.sheet = null;
    if (!tap) return render();
    tap.soundAt = Date.now();
    if (!record) { send(tap, false); return render(); }
    prepareRec(tap); tap.strip = 'start';
    const owner = C.owner;
    // A reply that comes after a change of adult creates nothing: the tap belonged to the last adult.
    const after = (ok) => { if (C.owner !== owner) return; if (ok) { C.home.sound = 'on'; C.home.rev++; } send(tap, ok); };
    api().sound('on').then(reply => after(reply.status === 200), () => after(false));
    render();
  }

  function send(tap, sound) {
    if (tap.queue) return;
    if (!sound) { cancelRec(tap); tap.strip = null; }
    tap.want = sound;
    tap.queue = queueFor(tap, sound);
    tap.queue.start();
  }
  function queueFor(tap, sound) {
    const body = {id: tap.id, occurredAt: tap.occurredAt, snapshot: tap.snapshot, sound};
    const onState = (state, detail = {}) => { if (queueEnded(state, detail)) drop(queue); queueState(tap, state, detail); };
    const queue = LOG().createQueue({body, tappedAt: tap.soundAt, create: b => api().create(b), clip: (id, wav, header) => api().clip(id, wav, header), onState});
    C.live.push(queue);
    return queue;
  }
  // A finished recorder or queue leaves C.live, so its samples can go.
  const drop = item => { const i = C.live.indexOf(item); if (i >= 0) C.live.splice(i, 1); };
  // A queue sends nothing more after these states (a created cry with no sound, or a manual save, takes no clip).
  const queueEnded = (state, d) => ['clip-saved', 'no-clip', 'stopped'].includes(state) || (state === 'not-saved' && !d.canRetry) || (state === 'created' && (!d.sound || d.manual));
  // Past cries, once loaded, shows a new cry and a new clip without a manual reload.
  const relist = () => { if (C.list.state !== 'idle') void loadList(); };

  /* ---------- the queue states, mapped to the strip states of the mockup ---------- */
  const NO_CLIP = {denied: 'micoff'};
  const QUEUE = {
    creating: tap => { if (tap.want && !['micoff', 'rec'].includes(tap.strip)) tap.strip = 'start'; },
    'create-retry': tap => { if (tap.want) tap.strip = 'start'; },
    created: (tap, d) => { tap.saved = true; created(tap, d); flushMarks(tap); relist(); },
    'not-saved': (tap, d) => { cancelRec(tap); tap.strip = 'unsaved'; tap.canRetry = !!d.canRetry; },
    'clip-retry': tap => { tap.strip = 'wait'; },
    'clip-saved': tap => { tap.strip = 'saved'; relist(); },
    'no-clip': (tap, d) => {
      if (!tap.want) return;
      tap.strip = NO_CLIP[d.reason] || 'lost';
      if (NO_CLIP_WORDS.includes(d.reason)) markTap(tap, {noClip: d.reason});
    },
    stopped: (tap, d) => { tap.strip = d.reason === 'clip-deleted' ? 'gone' : d.reason === 'cry-deleted' ? null : tap.strip; },
  };
  function queueState(tap, state, detail) {
    if (QUEUE[state]) QUEUE[state](tap, detail || {});
    if (C.tap === tap) render();
  }
  function created(tap, d) {
    if (d.manual) { tap.strip = tap.want ? 'lost' : null; return; }
    if (!d.sound) {
      // The server says no sound: the choice changed on another page, or the cry takes no clip. The page takes the new choice.
      // A tap that asked for sound shows that the choice of this page is old. The page drops it at once, so the strip does not
      // read "Recording is on" from an old choice, and a Home reply that is already on its way does not bring it back.
      if (tap.want && !C.home.saving) { C.home.sound = null; C.home.rev++; }
      cancelRec(tap); tap.strip = null; tap.want = false;
      void pollHome();
      return;
    }
    if (!d.openMic || !tap.rec) { cancelRec(tap); tap.queue.noClip('late-reply'); return; }
    const rec = tap.rec;
    rec.start().then(result => { tap.frozenLeft = stripLeft(tap); if (result && result.ok) tap.secs = Math.round(result.durationMs / 1000); tap.queue.clipReady(result); });
  }

  /* ---------- the rating, the row tap and the no-clip reason (plan 2026-11-20 M2, M5) ---------- */
  // These writes never wait for the network on screen and never show an error. A write before the cry is saved waits for its id.
  // One request at a time: a write while one is on its way joins the waiting fields (a new rating replaces the waiting one), and
  // they go when the earlier request ends. A lost request is not sent again. After a change of adult the waiting writes are dropped.
  // The reasons that the server takes for `noClip`; 'no-sound' and 'adult-changed' are never sent.
  const NO_CLIP_WORDS = ['no-support', 'no-worklet', 'late-reply', 'first-sample-deadline', 'denied', 'no-microphone', 'error', 'stopped', 'too-short', 'hidden', 'cancelled', 'interrupted',
    'recording', 'network', 'refused'];
  const RATE_MS = 15 * 60000, DAY_MS = 86400000;
  function markTap(tap, fields) {
    // The no-clip reason does not wait behind a rating or row tap request: it is often sent as the page hides, and then only a
    // keepalive request that starts at once still leaves. It writes its own column, so it needs no order with the other writes.
    if ('noClip' in fields && tap.saved && S.auth === 'ready' && meKey() === tap.adult) {
      const {noClip, ...rest} = fields;
      api().patch(tap.id, {noClip}, true).then(() => {}, () => {});
      fields = rest;
    }
    Object.assign(tap.marks.wait, fields);
    flushMarks(tap);
  }
  function flushMarks(tap) {
    const m = tap.marks;
    if (m.busy || !tap.saved || !Object.keys(m.wait).length) return;
    if (S.auth !== 'ready' || meKey() !== tap.adult) { m.wait = {}; return; }
    const change = m.wait;
    m.wait = {}; m.busy = true;
    const done = () => { m.busy = false; flushMarks(tap); };
    // The no-clip reason goes with keepalive: it is often sent as the page hides.
    api().patch(tap.id, change, 'noClip' in change).then(done, done);
  }
  const rateShut = tap => Date.now() - tap.tappedAt >= RATE_MS;
  function rate(arg) {
    const tap = C.tap, k = Number(arg);
    if (!tap || ![1, 2, 3].includes(k) || rateShut(tap) || tap.distress === k) return;
    tap.distress = k;
    markTap(tap, {distress: k});
    render();
  }
  // The first row tap of a cry is its row tap; a later one changes nothing.
  function noteRow(tap, type) {
    if (tap.rowTapped || !TYPES.includes(type)) return;
    tap.rowTapped = true;
    markTap(tap, {rowTap: {type, ms: Math.min(DAY_MS, Math.max(0, Math.round(performance.now() - tap.perfAt)))}});
  }

  /* ---------- leaving: the recording belongs to the open Crying screen ---------- */
  // The recording stops and keeps the clip so far; `cause` ('left' or 'row') becomes the `end` of the clip. A tap that still waits for
  // the Home reply or for the first-use answer is saved now with no sound; the question waits for the next tap.
  function endTap(cause = 'left') {
    const tap = C.tap;
    if (!tap) return;
    if (tap.rec) tap.rec.stop(cause);
    if (tap.waitHome || C.sheet?.kind === 'first') { tap.waitHome = false; C.sheet = null; send(tap, false); }
  }
  function leaveCry() {
    endTap();
    if (C.screen === 'cry') C.screen = null;
  }
  // The form opens over the Crying screen; the screen comes back when the form closes.
  function openRow(type) {
    if (C.tap) noteRow(C.tap, type);
    endTap('row');
    act(FORM[type]);
  }
  function openPast() {
    leaveCry();
    if (S.sheet?.kind === 'settings') S.sheet = null;
    C.screen = 'cries';
    void loadList();
    show();
  }
  function closeScreen() { stopPlaying(); leaveCry(); C.screen = null; render(); }

  // A sign-in, a switch or a sign-out (app.js calls this at the top of each render): every queue and recording of the last adult
  // stops, and nothing of the last adult stays.
  function checkOwner() {
    const owner = S.auth === 'ready' ? meKey() : '';
    if (owner === C.owner) return;
    C.owner = owner;
    stopPlaying();
    for (const item of [...C.live]) { if (item.cancel) item.cancel('adult-changed'); else item.stop('adult-changed'); }
    Object.assign(C, {home: freshHome(), list: freshList(), screen: null, tap: null, sheet: null, live: [], playing: null});
    if (owner) queueMicrotask(() => { void pollHome(); loadPassages(); });
  }

  /* ---------- the strip ---------- */
  function stripLeft(tap) {
    if (tap.frozenLeft !== undefined) return tap.frozenLeft;
    const gone = tap.recAt ? (performance.now() - tap.recAt) / 1000 : 0;
    return Math.max(0, Math.min(10, 10 - Math.floor(gone)));
  }
  const btn = (act, word) => `<button type="button" class="back" data-act="${act}">${word}</button>`;
  const ring = '<i class="rec-ring"></i>', dot = '<i class="rec-dot"></i>';
  // A cry that was sent with no sound has no strip state of its own, so the strip shows the sound choice: "Recording is off" with
  // "Turn on" (the switch of Settings), then "Recording is on" when the save is confirmed. The cry of this tap stays with no clip.
  // Until 2026-11-20 the screen showed no line here, and a family found no way to record.
  const quietState = tap => (tap.want !== false ? null : C.home.sound === 'on' && !C.home.saving ? 'next' : 'off');
  function stripParts(tap, state) {
    const left = stripLeft(tap);
    return {
      off: [ring, tr('recOff'), tap.queue?.created ? tr('micOffSub') : '', `<button type="button" class="back" data-act="cry-sound" data-arg="on"${C.home.saving ? ' disabled' : ''}>${tr('turnOn')}</button>`],
      next: [glyph('check'), tr('recOn'), tr('recOnSub'), ''],
      start: [dot, tr('startT'), '', ''],
      unsaved: [ring, tr('unsavedT'), tr('lostSub'), tap.canRetry ? btn('cry-retry-save', tr('tryAgain')) : ''],
      rec: [dot, tr('recording'), tr('hold'),`<span class="n" role="timer">${tr('left', left)}</span><span class="prog"><i style="width:${(10 - left) * 10}%"></i></span>`],
      saved: [glyph('check'), tr('clipSaved'), tap.secs ? tr('secs', tap.secs) : '', can('change') ? `<button type="button" class="textlink" data-act="cry-strip-delete">${tr('del')}</button>` : ''],
      gone: [ring, tr('goneT'), '', ''],
      micoff: [ring, tr('micOff'), tr('micOffSub'), btn('cry-retry-mic', tr('tryAgain'))],
      wait: [ring, tr('waitT'), tr('waitSub'), ''],
      lost: [ring, tr('noClip'), tr('lostSub'), ''],
    }[state];
  }
  function stripHTML(tap) {
    const state = tap.strip || quietState(tap);
    const parts = state && stripParts(tap, state);
    if (!parts) return '';
    const [mark, title, sub, end] = parts;
    return `<section class="card cry-rec" data-state="${state}" role="status"><span class="mark" aria-hidden="true">${mark}</span><span class="cry-text"><strong>${title}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</span>${end}</section>`;
  }
  // The countdown moves in place each 250 ms, so a redraw never takes the focus. The rating line closes 15 minutes after the tap.
  function tickStrip() {
    if (C.tap && screenOpen() && !C.sheet && rateShut(C.tap) && document.querySelector('.cry-rate:not(.shut)')) render();
    const tap = C.tap, el = document.querySelector('.cry-rec[data-state="rec"]');
    if (!tap || !el || tap.strip !== 'rec') return;
    const left = stripLeft(tap), n = el.querySelector('.n'), bar = el.querySelector('.prog i');
    if (n) n.textContent = tr('left', left);
    if (bar) bar.style.width = `${(10 - left) * 10}%`;
  }

  /* ---------- the comparison card ---------- */
  function rowTitle(r) {
    if (r.running) return tr(r.type === 'feed' ? 'feedingNow' : 'sleepOn');
    if (r.sinceMin === null) return t(r.type);
    return tr(r.type === 'feed' ? 'fedAgo' : r.type === 'sleep' ? 'awakeFor' : 'changedAgo', durText(r.sinceMin));
  }
  function rowNote(r, plain) {
    if (r.running) { const timer = r.type === 'feed' ? shownRun() : sleepTimer(); return timer?.t0 != null ? tr('startedAt', clock(timer.t0)) : '&nbsp;'; }
    if (plain) return '&nbsp;';
    if (r.usualMin === null || r.sinceMin === null) return tr('noUsual');
    if (r.about) return tr('aboutUsual');
    return tr(r.diffMin > 0 ? 'overBy' : 'underBy', durText(Math.abs(r.diffMin)));
  }
  const ROW_ART = {feed: r => (r.lastKind === 'bottle' ? 'bottle' : 'nurse'), sleep: () => 'moon', diaper: r => ({wet: 'wet', dirty: 'dirty'}[r.lastKind] || 'diaper')};
  function rowHTML(r, plain) {
    const compared = !plain && !r.running && r.ratio !== null;
    const usual = compared ? `<span class="u">${tr('usualIs', durText(r.usualMin))}</span>` : '';
    const bar = compared ? `<span class="gap-bar" aria-hidden="true"><i style="width:${Math.min(100, r.ratio * 60).toFixed(1)}%"></i><b></b></span>` : '';
    const over = compared && r.state === 'over' ? ' cry-over' : '';
    return `<li class="${CARE[r.type]}"><button type="button" class="nav-row cry-row${over}" data-act="cry-row" data-arg="${r.type}">${iconBlock(ROW_ART[r.type](r))}<span class="cry-text"><strong>${rowTitle(r)}</strong><span class="sub gap-note"><span class="v">${rowNote(r, plain)}</span>${usual}</span>${bar}</span>${chev()}</button></li>`;
  }
  function keyLine(tap, rows, part) {
    if (tap.loading) return tr('keyLoad');
    if (!tap.compared || rows.every(r => r.usualMin === null)) return tr('keyNew');
    return `<i class="key-tick" aria-hidden="true"></i>${tr(part === 'day' ? 'keyDay' : 'keyNight')}`;
  }
  // The rows are always in the Home order: Feed, Sleep, Diaper (plan 2026-11-20 M1). careRows gives them in that order.
  function compareHTML(tap) {
    const {dayPart, rows: list} = rowsAt(memoryEntries(tap.extra), nowExactM());
    const plain = !tap.compared, none = !plain && list.every(r => r.state === 'under' || r.state === 'about');
    tap.nonePast = none;
    return `<section class="card nav icons cry-compare" aria-labelledby="cmp-t"><h2 id="cmp-t">${tr('compare')}</h2>${none ? `<p class="cry-none">${tr('nonePast')}</p>` : ''}<ul>${list.map(r => rowHTML(r, plain)).join('')}</ul><p class="sub cry-key">${keyLine(tap, list, dayPart)}</p></section>`;
  }

  /* ---------- the two passages, opened in place ---------- */
  const PASSAGE = {comfort: 'care-comfort', help: 'care-urgent'};
  function passageHTML(tap, key) {
    const p = (C.passages?.[S.lang === 'es' ? 'es' : 'en'] || []).find(item => item.id === PASSAGE[key]);
    if (!p) return '';
    const open = tap.open[key] ?? (key === 'comfort' && tap.nonePast);
    const src = esc(String(p.title || '').split(':')[0]);
    return `<li><details data-cry-passage="${key}"${open ? ' open' : ''}><summary class="nav-row">${key === 'comfort' ? tr('comfort', esc(babyName())) : tr('help')}${chev()}</summary><div class="cry-passage"><p>${esc(p.body)}</p><a class="textlink" href="${esc(p.url)}" target="_blank" rel="noopener">${tr('source', src)}${glyph('ext')}</a></div></details></li>`;
  }
  // The rating line: below the comparison card, for each cry, with or without sound. One height in each state.
  // 15 minutes after the tap it stays in place, keeps the choice that counts, says "Closed" and takes no tap.
  function rateHTML(tap) {
    const shut = rateShut(tap);
    const chip = k => `<button type="button" class="chip" data-act="cry-rate" data-arg="${k}" aria-pressed="${tap.distress === k}"${shut ? ' disabled' : ''}>${W.rate[k][L()]}</button>`;
    return `<section class="card cry-rate${shut ? ' shut' : ''}" aria-labelledby="rate-t"><p class="rate-head"><span class="fl" id="rate-t">${tr('rateQ')}</span>${shut ? `<span class="sub">${tr('rateShut')}</span>` : ''}</p><div class="seg3" role="group" aria-labelledby="rate-t">${[1, 2, 3].map(chip).join('')}</div></section>`;
  }
  const bar = (title, act) =>`<header class="bar"><button type="button" class="back" data-act="${act}">${glyph('back')}${t('tabHome')}</button><h1>${title}</h1><span></span></header>`;
  function cryScreenHTML(tap) {
    const compare = compareHTML(tap);
    const past = can('view') ? `<li><button type="button" class="nav-row" data-act="cry-past">${tr('past')}${chev()}</button></li>` : '';
    return `<div class="formscreen" data-kind="cry" role="dialog" aria-modal="true" aria-label="${tr('cryTitle')}"><div class="wrap t-plain">${bar(tr('cryTitle'), 'cry-close')}${stripHTML(tap)}${compare}${rateHTML(tap)}<section class="card nav cry-more"><ul>${passageHTML(tap, 'comfort')}${passageHTML(tap, 'help')}${past}</ul></section></div></div>`;
  }

  /* ---------- Home: card C and the answer card ---------- */
  function homeTilesHTML(tilesHTML) {
    if (!can('add')) return tilesHTML;
    return `<div class="group cry-home">${tilesHTML}<div class="card nav icons"><ul><li class="t-plain"><button type="button" class="nav-row" data-act="cry-open">${cryBlock}<span class="cry-text"><strong>${tr('crying')}</strong><span class="sub">${tr('entrySub')}</span></span>${chev()}</button></li></ul></div></div>`;
  }
  function askHTML() {
    const ask = C.home.ask;
    if (!ask || C.home.hidden.has(ask.id) || !can('change')) return '';
    const c = clockOfISO(ask.occurredAt), q = tr('askWhat', c);
    const chips = ANSWERS.map(k => `<button type="button" class="chip" data-act="cry-ask-answer" data-arg="${k}" aria-pressed="false">${glyph('check')}${answerWord(k)}</button>`).join('');
    return `<section class="card cry-ask t-plain" aria-labelledby="ask-t"><h2 id="ask-t">${q}</h2><div class="chips" role="group" aria-label="${q}">${chips}</div><button type="button" class="textlink" data-act="cry-ask-skip">${tr('skip')}</button></section>`;
  }
  function answerHome(k) {
    const ask = C.home.ask;
    if (!ask || !ANSWERS.includes(k)) return;
    C.home.hidden.add(ask.id);
    const c = clockOfISO(ask.occurredAt);
    api().patch(ask.id, {stoppedBy: k}).then(reply => {
      if (reply.status !== 200) throw new Error('refused');
      undoToast(ask.id, k, () => (k === 'nothing' ? tr('savedNone', c) : tr('savedAns', answerWord(k), c)));
      if (C.list.state === 'ok') void loadList();
    }).catch(() => { C.home.hidden.delete(ask.id); changeFailed(); void pollHome(); }).finally(() => render());
    render();
  }
  function skipHome() {
    const ask = C.home.ask;
    if (!ask) return;
    C.home.hidden.add(ask.id);
    api().patch(ask.id, {skipped: true}).then(reply => { if (reply.status !== 200) throw new Error('refused'); })
      .catch(() => { C.home.hidden.delete(ask.id); changeFailed(); void pollHome(); }).finally(() => render());
    render();
  }

  /* ---------- the status line with Undo ---------- */
  function undoToast(id, was, text) {
    // A Stop feed or Stop sleep whose Undo is still pending keeps its line; this one shows as a plain message (as setToast does).
    if (S.toast?.pending) { showDone(text); return; }
    clearTimeout(toastTimer);
    const k = Math.random();
    S.toast = {text, undoId: null, undoUntil: null, pending: false, cryUndo: {id, was}, k, total: UNDO_MS, until: Date.now() + UNDO_MS};
    toastTimer = setTimeout(() => { if (S.toast?.k === k) { S.toast = null; render(); } }, UNDO_MS);
  }
  function toastHTML(tt) {
    const left = Math.max(0, Math.ceil((tt.until - Date.now()) / 1000));
    return `<div class="toast" role="status" key="${tt.k}" data-cry-toast><span>${esc(tt.text())}</span><button type="button" class="u" data-act="cry-undo">${t('undo')} <span class="cdn" aria-hidden="true" data-countdown="${tt.until}" data-kind="cry">${left} s</span></button><span class="cd" style="animation-duration:${tt.total}ms;animation-delay:-${Math.max(0, tt.total - (tt.until - Date.now()))}ms"></span></div>`;
  }
  // Undo removes the answer only while it is still the answer of the cry (the server compares it with `was`).
  function undoAnswer() {
    const undo = S.toast?.cryUndo;
    if (!undo) return;
    clearTimeout(toastTimer); S.toast = null;
    api().patch(undo.id, {stoppedBy: '', was: undo.was}).then(reply => {
      if (reply.status !== 200) throw new Error('refused');
      // changed: false means another answer was saved since this one (the server compared it with `was`): that answer stays.
      const now = reply.body?.changed === false ? reply.body.stoppedBy : null;
      C.home.hidden.delete(undo.id);
      if (now && ANSWERS.includes(now)) { const a = answerWord(now); showDone(tr('notUndone', a.charAt(0).toLowerCase() + a.slice(1))); return; }
      if (reply.body?.changed !== false) showDone(t('undone'));
    }).catch(changeFailed).finally(() => { void pollHome(); if (C.list.state === 'ok') void loadList(); render(); });
    render();
  }

  /* ---------- Past cries ---------- */
  function loadList() {
    const list = C.list, seq = ++list.seq;
    if (list.state !== 'ok') list.state = 'loading';
    if (C.screen === 'cries') render();
    return api().list().then(reply => {
      if (seq !== list.seq || C.list !== list) return;
      if (reply.status !== 200 || !Array.isArray(reply.body?.cries)) { list.state = 'error'; return; }
      Object.assign(list, {state: 'ok', cries: reply.body.cries, count: Number(reply.body.count) || 0, goal: Number(reply.body.goal) || 100});
    }, () => { if (seq === list.seq) list.state = 'error'; }).finally(() => { if (seq === list.seq) shown(); });
  }
  // Past cries draws again. Settings only gets its two count lines in place, so a redraw never moves the open Settings screen.
  function shown() {
    if (C.screen === 'cries' || C.sheet || !document.querySelector('#cry-settings')) return render();
    const ok = C.list.state === 'ok';
    for (const [key, text] of [['past', ok ? tr('pastSub', C.list.count) : ''], ['delall', ok ? tr('delAllSub', keptClips()) : '']]) {
      const el = document.querySelector(`#cry-settings [data-cry-sub="${key}"]`);
      if (el) { el.textContent = text; el.hidden = !text; }
    }
  }
  function dayHead(day) {
    const date = new Intl.DateTimeFormat(S.lang === 'es' ? 'es-MX' : 'en-US', {timeZone: LittleDaysZone.get(), weekday: 'short', month: 'short', day: 'numeric'}).format(new Date(`${dayISO(day)}T12:00:00Z`));
    if (day < -1) return date;
    return `${tr(day === 0 ? 'today' : 'yesterday')} <span class="sub">${date}</span>`;
  }
  function cryTools(c) {
    const kept = c.clipState === 'kept', secs = Math.round((c.clipMs || 0) / 1000), active = C.playing?.id === c.id;
    const play = kept ? `<button type="button" class="back" data-act="cry-play" data-arg="${c.id}" aria-pressed="${active}">${glyph(active ? 'pause' : 'play')}${active ? tr('stopPlay') : tr('play', secs)}</button>` : '';
    const noisy = kept && can('change') ? `<button type="button" class="chip" data-act="cry-noisy" data-arg="${c.id}" aria-pressed="${!!c.noisy}">${glyph('check')}${tr('noisy')}</button>` : '';
    const del = can('change') ? `<button type="button" class="textlink" data-act="cry-delete" data-arg="${c.id}">${tr('delCry')}</button>` : '';
    return `<div class="cry-tools">${play}${noisy}${del}</div>`;
  }
  function cryItemHTML(c) {
    const noAns = !c.stoppedBy, kept = c.clipState === 'kept';
    const sound = kept ? tr('clipS', Math.round((c.clipMs || 0) / 1000)) + (c.noisy ? `, ${tr('markedNoisy')}` : '') : tr('noClipRow');
    const answer = noAns ? tr('noAnswer') : c.stoppedBy === 'nothing' ? answerWord('nothing') : tr('stopped', answerWord(c.stoppedBy));
    const open = C.list.open[c.id] ?? (C.list.filter === 'no' && noAns);
    const chips = ANSWERS.map(k => `<button type="button" class="chip" data-act="cry-answer" data-arg="${c.id}:${k}" aria-pressed="${c.stoppedBy === k}"${can('change') ? '' : ' disabled'}>${glyph('check')}${answerWord(k)}</button>`).join('');
    const q = `cq-${c.id}`;
    return `<li class="t-plain"><details data-cry-id="${c.id}"${open ? ' open' : ''}><summary class="nav-row${noAns ? ' todo' : ''}">${cryBlock}<span class="cry-text"><strong>${clockOfISO(c.occurredAt)}</strong><span class="sub a">${answer}</span><span class="sub">${sound} · ${esc(shownName(c.adult))}</span></span>${chev()}</summary><div class="cry-body"><div class="form-field"><span class="fl" id="${q}">${tr('whatStopped')}</span><div class="chips" role="group" aria-labelledby="${q}">${chips}</div></div>${cryTools(c)}</div></details></li>`;
  }
  function listDaysHTML(shown) {
    const dayOfCry = c => dayOf(instantMinutes(c.occurredAt));
    const days = [...new Set(shown.map(dayOfCry))].sort((a, b) => b - a);
    return days.map(d => `<section class="day"><h2>${dayHead(d)}</h2><div class="card nav icons cry-list"><ul>${shown.filter(c => dayOfCry(c) === d).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).map(cryItemHTML).join('')}</ul></div></section>`).join('');
  }
  const cardEmpty = (key, text, action = '') => `<section class="card">${emptyState(key, text, action)}</section>`;
  function listBodyHTML(list) {
    if (list.state === 'error') return cardEmpty('error', tr('loadErr'), btn('cry-list-retry', tr('tryAgain')));
    if (list.state !== 'ok') return `<section class="card"><p class="sub" role="status">${t('loading')}</p></section>`;
    const todo = list.cries.filter(c => !c.stoppedBy), shown = list.filter === 'no' ? todo : list.cries;
    if (!list.cries.length) return cardEmpty('cries', tr('emptyCries', esc(babyName())));
    if (!shown.length) return cardEmpty('alldone', tr('allDone'));
    return listDaysHTML(shown);
  }
  function filterHTML(list) {
    if (list.state !== 'ok' || !list.cries.length) return '';
    const todo = list.cries.filter(c => !c.stoppedBy).length;
    const chip = (key, word) => `<button type="button" class="chip" data-act="cry-filter" data-arg="${key}" aria-pressed="${list.filter === key}">${glyph('check')}${word}</button>`;
    return `<div class="chips" role="group" aria-label="${tr('show')}">${chip('no', tr('fNo', todo))}${chip('all', tr('fAll', list.cries.length))}</div>`;
  }
  function countHTML(list) {
    // The last count a list reply gave stays while a new request loads or fails; with no count yet, no card (an unknown count is not 0).
    const n = list.count;
    if (n === null) return '';
    const width = Math.min(100, (n / (list.goal || 100)) * 100);
    return `<section class="card cry-count"><h2>${tr('count', n)}</h2><p class="sub">${tr('countSub')}</p><span class="prog" role="img" aria-label="${tr('count', n)}"><i style="width:${width}%"></i></span><p class="sub">${tr('countNote')}</p></section>`;
  }
  function criesScreenHTML() {
    const list = C.list;
    return `<div class="formscreen" data-kind="cries" role="dialog" aria-modal="true" aria-label="${tr('past')}"><div class="wrap t-plain">${bar(tr('past'), 'cry-close')}${countHTML(list)}${filterHTML(list)}${listBodyHTML(list)}</div></div>`;
  }

  // One write from Past cries. A refused or lost write is not sent again: the page says so and shows the saved state.
  function listWrite(call) {
    call().then(reply => { if (reply.status !== 200) throw new Error('refused'); })
      .catch(changeFailed).finally(() => { void loadList(); void pollHome(); });
  }
  function answerListed(arg) {
    const [id, k] = String(arg).split(':'), c = C.list.cries.find(x => x.id === id);
    if (!c || !ANSWERS.includes(k) || c.stoppedBy === k) return;
    c.stoppedBy = k;
    listWrite(() => api().patch(id, {stoppedBy: k}));
    render();
  }
  function toggleNoisy(id) {
    const c = C.list.cries.find(x => x.id === id);
    if (!c) return;
    c.noisy = !c.noisy;
    listWrite(() => api().patch(id, {noisy: c.noisy}));
    render();
  }
  function stopPlaying() {
    const current = C.playing;
    if (!current) return;
    C.playing = null;
    current.stop();
  }
  // Playback: unlock Web Audio synchronously inside the tap handler (with audioSession 'playback' so iOS ignores the
  // Ring/Silent switch and bypasses AVPlayer blob: WAV quirks), and fall back to HTMLAudioElement only if Web Audio is absent.
  function playClip(id) {
    if (C.playing?.id === id) { stopPlaying(); render(); return; }
    stopPlaying();
    C.list.open[id] = true;
    const player = LittleDaysCry.preparePlay();
    if (player.ready) {
      const playing = {id, stopped: false, stop() { playing.stopped = true; player.stop(); }};
      C.playing = playing;
      render();
      api().clipBytes(id).then(wav => (playing.stopped || C.playing !== playing ? null : player.play(wav)))
        .then(handle => {
          if (!handle) return;
          if (playing.stopped || C.playing !== playing) { handle.stop(); return; }
          handle.ended.then(() => { if (C.playing === playing) { C.playing = null; render(); } });
        })
        .catch(() => {
          if (playing.stopped) return;
          if (C.playing === playing) stopPlaying(); else player.stop();
          changeFailed(); render();
        });
      return;
    }
    if (typeof globalThis.Audio !== 'function' || typeof URL?.createObjectURL !== 'function') { player.stop(); return; }
    const urls = [];
    const revokeAll = () => { while (urls.length) { try { URL.revokeObjectURL(urls.pop()); } catch { /* revoked */ } } };
    const audio = new globalThis.Audio();
    audio.playsInline = true;
    const silentUrl = URL.createObjectURL(new Blob([LittleDaysCry.encodeWav(new Float32Array(4410), 44100)], {type: 'audio/wav'}));
    urls.push(silentUrl);
    audio.src = silentUrl;
    const unlock = audio.play();
    if (unlock && unlock.catch) unlock.catch(() => {});
    const playing = {
      id, stopped: false,
      stop() {
        playing.stopped = true;
        audio.onended = audio.onerror = null;
        try { audio.pause(); } catch { /* paused */ }
        audio.removeAttribute('src');
        try { audio.load(); } catch { /* unloaded */ }
        revokeAll();
        player.stop();
      },
    };
    C.playing = playing;
    render();
    api().clipBytes(id).then(wav => {
      if (playing.stopped || C.playing !== playing) { revokeAll(); return; }
      try { audio.pause(); } catch { /* paused */ }
      revokeAll();
      const clipUrl = URL.createObjectURL(new Blob([wav], {type: 'audio/wav'}));
      urls.push(clipUrl);
      audio.onended = () => { if (C.playing === playing) { stopPlaying(); render(); } };
      audio.onerror = () => { if (C.playing === playing) { stopPlaying(); changeFailed(); render(); } };
      audio.src = clipUrl;
      try { audio.load(); } catch { /* load */ }
      return audio.play();
    }).catch(() => {
      if (playing.stopped) return;
      if (C.playing === playing) stopPlaying(); else { revokeAll(); player.stop(); }
      changeFailed(); render();
    });
  }

  /* ---------- the sheets: first use, delete all clips, delete one cry ---------- */
  const keptClips = () => C.list.cries.filter(c => c.clipState === 'kept').length;
  const confirmHTML = (kind, title, body, goAct, goWord, keepAct, keepWord) => `<div class="overlay"><section class="confirm" data-cry-sheet="${kind}" key="cry:${kind}" role="dialog" aria-modal="true" aria-labelledby="cry-c-title"><h2 id="cry-c-title">${title}</h2><p class="sub">${body}</p><div class="actions"><button type="button" class="btn-primary" data-act="${goAct}">${goWord}</button><button type="button" class="back" data-act="${keepAct}">${keepWord}</button></div></section></div>`;
  function sheetHTML() {
    const s = C.sheet;
    if (!s) return '';
    if (s.kind === 'first') return confirmHTML('first', tr('firstQ'), tr('firstBody', t('settings')), 'cry-first-record', tr('firstGo'), 'cry-first-later', tr('notNow'));
    // The number comes only from the list reply asked for when the question opened; until it arrives the question says "all".
    if (s.kind === 'deleteall') {
      const n = s.counted && C.list.state === 'ok' ? keptClips() : null;
      return confirmHTML('deleteall', tr('delAllQ'), n === null ? tr('delAllBodyAll') : tr('delAllBody', n), 'cry-delall-go', n === null ? tr('delAllGoAll') : tr('delAllGo', n), 'cry-sheet-keep', tr('keepClips'));
    }
    const c = C.list.cries.find(x => x.id === s.id);
    return c ? confirmHTML('deletecry', tr('delCryQ'), tr('delCryBody', clockOfISO(c.occurredAt)), 'cry-delcry-go', tr('delCryGo'), 'cry-sheet-keep', tr('keepCry')) : '';
  }
  // A question sheet takes the focus and gives it back to the button that opened it (as the Stop question does).
  function openSheet(sheet, back) {
    C.sheet = {...sheet, back};
    render();
    requestAnimationFrame(() => document.querySelector('[data-cry-sheet] .back')?.focus({preventScroll: true}));
  }
  function closeSheet() {
    const back = C.sheet?.back;
    C.sheet = null;
    render();
    if (back) requestAnimationFrame(() => document.querySelector(back)?.focus({preventScroll: true}));
  }
  function deleteAll() {
    stopPlaying();
    closeSheet();
    listWrite(() => api().deleteClips());
  }
  function deleteCry() {
    const id = C.sheet?.id;
    C.sheet = null;
    if (C.playing?.id === id) stopPlaying();
    if (C.tap?.id === id) { C.tap.queue?.stop('cry-deleted'); C.tap.rec?.cancel('cry-deleted'); }
    C.list.cries = C.list.cries.filter(c => c.id !== id);
    listWrite(() => api().deleteCry(id));
    render();
  }
  // "Delete" on the strip: no question, no Undo. The cry takes no new clip.
  function deleteStripClip() {
    const tap = C.tap;
    if (!tap) return;
    api().deleteClip(tap.id).then(reply => {
      if (reply.status !== 200) throw new Error('refused');
      tap.queue?.stop('clip-deleted');
      tap.strip = 'gone';
      relist();
    }).catch(changeFailed).finally(() => render());
  }
  // "Try again" after a blocked microphone: the same cry asks for the microphone again. The server still decides if it takes a clip.
  function retryMic() {
    const tap = C.tap;
    if (!tap) return;
    tap.soundAt = Date.now();
    prepareRec(tap);
    tap.strip = 'start';
    tap.frozenLeft = tap.recAt = tap.secs = undefined;
    tap.queue = queueFor(tap, true);
    tap.queue.start();
    render();
  }

  /* ---------- Settings: the group "Crying" ---------- */
  function settingsHTML() {
    if (!can('view')) return '';
    if (C.list.state === 'idle') queueMicrotask(() => void loadList());
    const pick = v => `<button type="button" class="chip" data-act="cry-sound" data-arg="${v}" aria-pressed="${C.home.sound === v}"${can('add') && !C.home.saving ? '' : ' disabled'}>${glyph('check')}${tr(v)}</button>`;
    const ok = C.list.state === 'ok';
    const row = (act, key, title, sub) => `<li><button type="button" class="nav-row" data-act="${act}"><span><strong>${title}</strong><span class="sub" data-cry-sub="${key}"${sub ? '' : ' hidden'}>${sub}</span></span>${chev()}</button></li>`;
    const del = can('change') ? row('cry-delall', 'delall', tr('delAll'), ok ? tr('delAllSub', keptClips()) : '') : '';
    return `<section class="day" id="cry-settings"><h2>${tr('cryTitle')}</h2><div class="card"><div class="form-field"><span class="fl" id="cs-l">${tr('setSound')}</span><div class="chips seg-control" role="group" aria-labelledby="cs-l">${pick('on')}${pick('off')}</div></div></div><div class="card nav"><ul>${row('cry-past', 'past', tr('past'), ok ? tr('pastSub', C.list.count) : '')}${del}</ul></div></section>`;
  }
  // One save at a time: both buttons wait for the reply, so On and Off cannot reach the server out of order.
  function saveSound(v) {
    const home = C.home;
    if ((v !== 'on' && v !== 'off') || home.saving) return;
    const before = home.sound;
    Object.assign(home, {sound: v, saving: true});
    api().sound(v).then(reply => { if (reply.status !== 200) throw new Error('refused'); })
      .catch(() => { home.sound = before; changeFailed(); }).finally(() => { home.saving = false; home.rev++; void pollHome(); render(); });
    render();
  }
  // The Home reply came while Settings was open: the two buttons change in place, so the screen does not move.
  function syncSound() {
    for (const b of document.querySelectorAll('#cry-settings [data-act="cry-sound"]')) b.setAttribute('aria-pressed', String(C.home.sound === b.dataset.arg));
  }

  /* ---------- actions ---------- */
  const ACTS = {
    'cry-open': () => openCry(),
    'cry-close': () => closeScreen(),
    'cry-row': arg => openRow(arg),
    'cry-rate': arg => rate(arg),
    'cry-past': () => openPast(),
    'cry-first-record': () => firstAnswer(true),
    'cry-first-later': () => firstAnswer(false),
    'cry-retry-save': () => { C.tap?.queue?.tryAgain(); },
    'cry-retry-mic': () => retryMic(),
    'cry-strip-delete': () => deleteStripClip(),
    'cry-ask-answer': arg => answerHome(arg),
    'cry-ask-skip': () => skipHome(),
    'cry-undo': () => undoAnswer(),
    'cry-filter': arg => { C.list.filter = arg === 'all' ? 'all' : 'no'; C.list.open = {}; render(); },
    'cry-list-retry': () => void loadList(),
    'cry-answer': arg => answerListed(arg),
    'cry-noisy': arg => toggleNoisy(arg),
    'cry-play': arg => playClip(arg),
    'cry-delete': arg => openSheet({kind: 'deletecry', id: arg}, `[data-act="cry-delete"][data-arg="${arg}"]`),
    'cry-delall': () => {
      openSheet({kind: 'deleteall'}, '#cry-settings [data-act="cry-delall"]');
      const mine = C.sheet;
      void loadList().then(() => { if (C.sheet === mine) { mine.counted = true; render(); } });
    },
    'cry-delall-go': () => deleteAll(),
    'cry-delcry-go': () => deleteCry(),
    'cry-sheet-keep': () => closeSheet(),
    'cry-sound': arg => saveSound(arg),
  };
  // True when the action was one of the Crying button's.
  function handle(a, arg) {
    if (!Object.hasOwn(ACTS, a)) return false;
    ACTS[a](arg);
    return true;
  }
  function show() {
    render();
    requestAnimationFrame(() => { if (!C.sheet) document.querySelector('.formscreen[data-kind^="cr"] [data-act="cry-close"]')?.focus({preventScroll: true}); });
  }

  /* ---------- the layer on top of the app ---------- */
  // A form that a row opened sits over the Crying screen: the screen comes back when the form closes.
  const screenOpen = () => !!C.screen && !S.sheet;
  // A question sheet makes the screen under it inert, so Tab stays in the sheet.
  function layerHTML() {
    checkOwner();
    // The cry of a delete question was removed (another phone): the question goes, so nothing stays inert.
    if (C.sheet?.kind === 'deletecry' && !C.list.cries.some(c => c.id === C.sheet.id)) C.sheet = null;
    const screen = !screenOpen() ? '' : C.screen === 'cry' && C.tap ? cryScreenHTML(C.tap) : C.screen === 'cries' ? criesScreenHTML() : '';
    return (C.sheet ? screen.replace('<div class="formscreen"', '<div inert class="formscreen"') : screen) + sheetHTML();
  }

  document.addEventListener('toggle', ev => {
    const el = ev.target;
    if (!el?.isConnected || !el.matches) return;
    if (el.matches('details[data-cry-passage]') && C.tap) C.tap.open[el.dataset.cryPassage] = el.open;
    if (el.matches('details[data-cry-id]')) C.list.open[el.dataset.cryId] = el.open;
  }, true);
  // This listener is added before app.js adds its own, so with a question sheet open (also over Settings) Escape closes only the
  // sheet and Tab stays in it; app.js does not see the key.
  document.addEventListener('keydown', ev => {
    if (C.sheet && (ev.key === 'Escape' || ev.key === 'Tab')) {
      ev.stopImmediatePropagation();
      if (ev.key === 'Tab') { trapTab(ev, '[data-cry-sheet] button:not([disabled])'); return; }
      ev.preventDefault();
      handle(C.sheet.kind === 'first' ? 'cry-first-later' : 'cry-sheet-keep');
      return;
    }
    if (ev.key !== 'Escape' || S.sheet || S.confirmStop) return;
    if (C.screen) { ev.preventDefault(); closeScreen(); }
  });
  setInterval(tickStrip, 250);

  return {
    handle, layerHTML, homeTilesHTML, askHTML, settingsHTML, toastHTML, checkOwner,
    sheetOpen: () => !!C.sheet,
    open: () => screenOpen() || !!C.sheet,
    tick: () => { if (S.auth === 'ready') void pollHome(); },
    state: C,
  };
})();
