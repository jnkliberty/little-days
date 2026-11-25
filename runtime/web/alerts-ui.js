/* Real alerts on the phone (plan 2026-11-21-alerts.md, Group 5; look approved 2026-11-22).
   Handles Settings "Alerts on this phone", browser push subscription, medicine next-dose field and Timeline readout,
   and Upcoming reminders list + accurate delivery notes. Sets window.LittleDaysAlertsUI. */
window.LittleDaysAlertsUI = (() => {
  const NB = '\u00a0';
  const W = {
    alertsHeading: ['Alerts on this phone', 'Alertas en este teléfono'],
    guideIntro: [
      'Add Little Days to the Home Screen first to receive locked-phone alerts.',
      'Agregue Little Days a la pantalla de inicio primero para recibir alertas con el teléfono bloqueado.',
    ],
    guideStep1: [
      'Tap Share in Safari, then tap Add to Home Screen.',
      'Toque Compartir en Safari y luego Agregar a inicio.',
    ],
    guideStep2: [
      'Open Little Days from the Home Screen, then tap Turn on alerts.',
      'Abra Little Days desde la pantalla de inicio y toque Activar alertas.',
    ],
    unavailable: [
      'Phone alerts are not configured on this server yet.',
      'Las alertas en el teléfono todavía no están configuradas en este servidor.',
    ],
    unsupported: [
      'This browser does not support push alerts.',
      'Este navegador no admite alertas push.',
    ],
    offIntro: [
      'Get general alerts on your lock screen with no baby name or medicine name.',
      'Reciba alertas generales en la pantalla bloqueada sin el nombre del bebé ni de la medicina.',
    ],
    turnOn: ['Turn on alerts', 'Activar alertas'],
    turnOff: ['Turn off alerts', 'Desactivar alertas'],
    onStatus: ['Alerts are on for this phone', 'Alertas activadas en este teléfono'],
    otherPhoneStatus: ['Alerts go to your newest signed-in phone', 'Las alertas van a su teléfono más reciente'],
    otherPhoneCopy: [
      'Turn alerts on here to move alerts to this phone.',
      'Active las alertas aquí para moverlas a este teléfono.',
    ],
    deniedTitle: [
      'Notifications are turned off in phone Settings. Allow notifications for Little Days, then try again.',
      'Las notificaciones están desactivadas en Ajustes del teléfono. Permita las notificaciones para Little Days e inténtelo de nuevo.',
    ],
    authError: [
      'Alerts could not reach the push service. Check server push settings.',
      'Las alertas no pudieron llegar al servicio push. Revise la configuración del servidor.',
    ],
    subscribeFailed: [
      'Could not turn on alerts on this phone. Try again.',
      'No se pudieron activar las alertas en este teléfono. Inténtelo de nuevo.',
    ],
    unsubscribeFailed: [
      'Could not turn off alerts on this phone. Try again.',
      'No se pudieron desactivar las alertas en este teléfono. Inténtelo de nuevo.',
    ],
    on: ['On', 'Sí'],
    off: ['Off', 'No'],
    swReminder: ['Saved reminders', 'Recordatorios guardados'],
    swReminderSub: ['At the saved time', 'A la hora guardada'],
    swMed: ['Medicine next dose', 'Próxima dosis de medicina'],
    swMedSub: ['After the hours you type', 'Después de las horas que escriba'],
    swNap: ['Next nap window', 'Próxima ventana de siesta'],
    swNapSub: [
      `10${NB}min before window opens (7${NB}AM to 7${NB}PM)`,
      `10${NB}min antes de abrir la ventana (7${NB}a.${NB}m. a 7${NB}p.${NB}m.)`,
    ],
    swFeed: ['Next feed window', 'Próxima ventana de toma'],
    swFeedSub: ['When the forecast window opens', 'Cuando se abre la ventana pronosticada'],
    medNextLabel: ['Next dose in (hours, optional)', 'Próxima dosis en (horas, opcional)'],
    medNextHint: [
      'Use the time on the label or from the pediatrician.',
      'Use el horario de la etiqueta o el del pediatra.',
    ],
    medNextErr: ['Enter 0.1 to 168 hours.', 'Escriba entre 0.1 y 168 horas.'],
    medNextRow: [time => `Next dose after ${time}`, time => `Próxima dosis después de las ${time}`],
    remindersTitle: ['Reminders', 'Recordatorios'],
    upcomingHeading: ['Upcoming reminders', 'Próximos recordatorios'],
    newHeading: ['New reminder', 'Nuevo recordatorio'],
    editHeading: ['Edit reminder', 'Editar recordatorio'],
    noUpcoming: ['No upcoming reminders.', 'No hay próximos recordatorios.'],
    statusOn: ['On', 'Activo'],
    statusOff: ['Off', 'Desactivado'],
    editShort: ['Edit', 'Editar'],
    turnOffShort: ['Turn off', 'Desactivar'],
    turnOnShort: ['Turn on', 'Activar'],
    addReminder: ['Save reminder', 'Guardar recordatorio'],
    forMe: ['For', 'Para'],
    noteThisPhone: ['This phone gets an alert.', 'Este teléfono recibirá una alerta.'],
    noteOtherPhone: [
      'Alerts go to your newest signed-in phone. Turn alerts on here to switch to this phone.',
      'Las alertas van a su teléfono más reciente. Active las alertas aquí para cambiar a este teléfono.',
    ],
    noteScheduleOnly: [
      'Saved to the schedule only. This app sends no alert.',
      'Solo se guarda en el calendario. Esta app no envía alertas.',
    ],
    noteOff: [
      'This reminder is off. No alert will be sent.',
      'Este recordatorio está desactivado. No se enviará alerta.',
    ],
  };

  const L = (lang, key, ...args) => {
    const val = W[key][lang === 'es' ? 1 : 0];
    return typeof val === 'function' ? val(...args) : val;
  };

  const DEFAULT_SWITCHES = { reminder: 'on', medicine: 'on', nap: 'off', feed: 'off' };
  const SWITCH_ROWS = [
    ['reminder', 'swReminder', 'swReminderSub', null],
    ['medicine', 'swMed', 'swMedSub', 'medication'],
    ['nap', 'swNap', 'swNapSub', 'sleep'],
    ['feed', 'swFeed', 'swFeedSub', 'feedings'],
  ];

  const state = {
    config: null,
    browserSubscribed: false,
    endpoint: null,
    busy: false,
    error: '',
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    lastIdentity: '',
  };

  function isIosNonStandalone() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return false;
    const standalone = Boolean(navigator.standalone) || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
    return !standalone;
  }

  function pushSupported() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
  }

  function base64urlToUint8Array(base64url) {
    const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
    const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function currentBrowserSubscription() {
    if (!pushSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg?.pushManager) return null;
      return await reg.pushManager.getSubscription();
    } catch { return null; }
  }

  function thisPhoneOn() {
    return Boolean(state.config?.available && state.config?.sessionSubscribed && state.browserSubscribed);
  }

  async function refresh(render) {
    const prevPerm = state.permission;
    const prevSig = JSON.stringify({ c: state.config, b: state.browserSubscribed, e: state.endpoint, p: prevPerm, err: state.error });
    const nextPerm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    try {
      const [cfg, sub] = await Promise.all([LittleDaysAPI.pushConfig(), currentBrowserSubscription()]);
      state.permission = nextPerm;
      state.config = cfg;
      state.browserSubscribed = Boolean(sub);
      state.endpoint = sub?.endpoint || null;
      state.error = '';
      const nextSig = JSON.stringify({ c: state.config, b: state.browserSubscribed, e: state.endpoint, p: state.permission, err: state.error });
      if (nextSig !== prevSig && typeof render === 'function') render();
    } catch {
      if (nextPerm !== prevPerm) {
        state.permission = nextPerm;
        if (typeof render === 'function') render();
      }
    }
  }

  async function turnOn(lang, render, reloadState) {
    if (state.busy) return;
    state.error = '';
    if (!pushSupported()) { state.error = L(lang, 'unsupported'); render(); return; }
    state.busy = true;
    render();
    try {
      const perm = await Notification.requestPermission();
      state.permission = perm;
      if (perm !== 'granted') { state.busy = false; render(); return; }
      const cfg = state.config?.vapidPublicKey ? state.config : await LittleDaysAPI.pushConfig();
      state.config = cfg;
      if (!cfg?.available || !cfg.vapidPublicKey) throw new Error(L(lang, 'unavailable'));
      const reg = (await navigator.serviceWorker.register('/sw.js', { scope: '/' })) || (await navigator.serviceWorker.ready);
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64urlToUint8Array(cfg.vapidPublicKey),
        });
      }
      const json = sub.toJSON();
      const updated = await LittleDaysAPI.pushSubscribe({ endpoint: json.endpoint, keys: json.keys });
      state.config = updated;
      state.browserSubscribed = true;
      state.endpoint = json.endpoint;
      state.error = '';
      if (typeof reloadState === 'function') await reloadState().catch(() => {});
    } catch (error) {
      state.error = error?.message || L(lang, 'subscribeFailed');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function turnOff(lang, render, reloadState) {
    if (state.busy) return;
    state.error = '';
    state.busy = true;
    render();
    try {
      const sub = await currentBrowserSubscription();
      const endpoint = sub?.endpoint || state.endpoint;
      if (endpoint) {
        state.config = await LittleDaysAPI.pushUnsubscribe(endpoint);
      }
      if (sub) await sub.unsubscribe().catch(() => {});
      state.browserSubscribed = false;
      state.endpoint = null;
      if (typeof reloadState === 'function') await reloadState().catch(() => {});
    } catch (error) {
      state.error = error?.message || L(lang, 'unsubscribeFailed');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function unsubscribeOnLogout() {
    try {
      const sub = await currentBrowserSubscription();
      if (sub) await sub.unsubscribe().catch(() => {});
    } catch { /* Best-effort cleanup after server logout succeeded. */ }
    state.config = null;
    state.browserSubscribed = false;
    state.endpoint = null;
    state.lastIdentity = '';
  }

  function alertPrefValue(prefs, key) {
    const val = prefs?.alerts?.[key];
    return val === 'on' || val === 'off' ? val : DEFAULT_SWITCHES[key];
  }

  function switchRowsHTML({ lang, prefs, resourceAllowed, glyph, esc }) {
    const rows = SWITCH_ROWS.filter(([, , , res]) => !res || resourceAllowed(res, 'view')).map(([key, label, sub]) => {
      const isOn = alertPrefValue(prefs, key) === 'on';
      const chip = (val, pressed, word) =>
        `<button type="button" class="chip" data-act="alerts-switch" data-arg="${key}:${val}" aria-pressed="${pressed}">${glyph('check')}${esc(word)}</button>`;
      return `<div class="al-type-row">
        <div class="al-type-head"><strong>${esc(L(lang, label))}</strong><span>${esc(L(lang, sub))}</span></div>
        <div class="chips seg-control" role="group" aria-label="${esc(L(lang, label))}">
          ${chip('on', isOn, L(lang, 'on'))}${chip('off', !isOn, L(lang, 'off'))}
        </div>
      </div>`;
    }).join('');
    return rows ? `<div class="al-types">${rows}</div>` : '';
  }

  function settingsBodyHTML(ctx) {
    const { lang, glyph, esc } = ctx;
    const errBox = state.error ? `<div class="al-warn" role="alert">${glyph('warn')}<span>${esc(state.error)}</span></div>` : '';
    const authWarn = state.config?.authError ? `<div class="al-warn" role="alert">${glyph('warn')}<span>${esc(L(lang, 'authError'))}</span></div>` : '';
    const dis = state.busy ? ' disabled aria-disabled="true"' : '';
    if (isIosNonStandalone()) {
      return `<p class="al-copy">${esc(L(lang, 'guideIntro'))}</p>
        <ol class="al-steps"><li>${esc(L(lang, 'guideStep1'))}</li><li>${esc(L(lang, 'guideStep2'))}</li></ol>`;
    }
    if (state.config && !state.config.available) {
      return `<p class="al-copy">${esc(L(lang, 'unavailable'))}</p>`;
    }
    if (state.permission === 'denied') {
      return `<div class="al-warn" role="alert">${glyph('warn')}<span>${esc(L(lang, 'deniedTitle'))}</span></div>
        ${errBox}<div class="al-actions"><button type="button" class="btn-primary" data-act="alerts-on"${dis}>${esc(L(lang, 'turnOn'))}</button></div>`;
    }
    const on = thisPhoneOn();
    const selected = on && state.config?.thisSessionSelected === true;
    const other = Boolean(state.config?.adultSubscribed) && !selected;
    if (!on && !other) {
      return `${authWarn}${errBox}<p class="al-copy">${esc(L(lang, 'offIntro'))}</p>
        <div class="al-actions"><button type="button" class="btn-primary" data-act="alerts-on"${dis}>${esc(L(lang, 'turnOn'))}</button></div>`;
    }
    const status = selected
      ? `<p class="al-status">${glyph('check')}<span>${esc(L(lang, 'onStatus'))}</span></p>
         <div class="al-actions"><button type="button" class="al-secondary" data-act="alerts-off"${dis}>${esc(L(lang, 'turnOff'))}</button></div>`
      : `<p class="al-status">${glyph('warn')}<span>${esc(L(lang, 'otherPhoneStatus'))}</span></p>
         <p class="al-copy">${esc(L(lang, 'otherPhoneCopy'))}</p>
         <div class="al-actions"><button type="button" class="btn-primary" data-act="alerts-on"${dis}>${esc(L(lang, 'turnOn'))}</button>
         ${on ? `<button type="button" class="al-secondary" data-act="alerts-off"${dis}>${esc(L(lang, 'turnOff'))}</button>` : ''}</div>`;
    return `${authWarn}${errBox}${status}${switchRowsHTML(ctx)}`;
  }

  function settingsHTML(ctx) {
    return `<section class="day" data-alerts-settings><h2>${ctx.esc(L(ctx.lang, 'alertsHeading'))}</h2><div class="card al-card">${settingsBodyHTML(ctx)}</div></section>`;
  }

  function validMedNext(val) {
    if (val == null || String(val).trim() === '') return true;
    const n = Number(String(val).trim().replace(',', '.'));
    return Number.isFinite(n) && n >= 0.1 && n <= 168;
  }

  function parseMedNext(val) {
    if (val == null || String(val).trim() === '') return null;
    const n = Number(String(val).trim().replace(',', '.'));
    return Number.isFinite(n) && n >= 0.1 && n <= 168 ? n : null;
  }

  function medNextFieldHTML({ id, value, lang, glyph, esc }) {
    const str = value == null ? '' : String(value);
    const bad = !validMedNext(str);
    return `<div class="form-field${bad ? ' bad' : ''}" data-med-next-wrap>
      <label class="fl" for="f-${id}">${esc(L(lang, 'medNextLabel'))}</label>
      <input class="field" id="f-${id}" data-fid="${id}" type="number" inputmode="decimal" min="0.1" max="168" step="any" value="${esc(str)}">
      <p class="al-field-hint">${esc(L(lang, 'medNextHint'))}</p>
      <p class="al-field-err" role="alert" data-med-next-err${bad ? '' : ' hidden'}>${glyph('warn')}<span>${esc(L(lang, 'medNextErr'))}</span></p>
    </div>`;
  }

  function formatZoneClock(ms, zone, lang) {
    const fmt = new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
      timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true,
    });
    return fmt.format(new Date(ms)).replace(/\b([ap])\.\s?m\./gi, `$1.${NB}m.`);
  }

  function zoneDayStr(ms, zone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function medNextReadout(entry, { lang, zone, esc, localISOAt }) {
    const hrs = parseMedNext(entry?.next);
    if (hrs == null) return '';
    const baseMs = entry.timeISO && Number.isFinite(Date.parse(entry.timeISO))
      ? Date.parse(entry.timeISO)
      : Date.parse(localISOAt(entry.t));
    if (!Number.isFinite(baseMs)) return '';
    const dueMs = baseMs + Math.round(hrs * 3600_000);
    const clock = formatZoneClock(dueMs, zone, lang);
    const sameDay = zoneDayStr(baseMs, zone) === zoneDayStr(dueMs, zone);
    const label = sameDay
      ? clock
      : `${new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', { timeZone: zone, month: 'short', day: 'numeric' }).format(new Date(dueMs))}, ${clock}`;
    return `<span class="al-med-next">${esc(L(lang, 'medNextRow', label))}</span>`;
  }

  function reminderNoteMode({ enabled, prefs }) {
    if (!enabled) return 'off';
    if (!state.config?.available || alertPrefValue(prefs, 'reminder') === 'off' || !state.config?.adultSubscribed) return 'schedule-only';
    if (thisPhoneOn() && state.config?.thisSessionSelected === true) return 'this-phone';
    return 'other-phone';
  }

  function reminderNoteHTML(mode, { lang, glyph, esc }) {
    const key = mode === 'this-phone' ? 'noteThisPhone' : mode === 'other-phone' ? 'noteOtherPhone' : mode === 'off' ? 'noteOff' : 'noteScheduleOnly';
    const icon = mode === 'this-phone' ? glyph('check') : glyph('warn');
    return `<p class="rem-note" data-rem-note="${mode}">${icon}<span>${esc(L(lang, key))}</span></p>`;
  }

  function upcomingRemindersHTML({ entries, lang, glyph, iconBlock, esc, dateLabel, clockAt, dayOf, t }) {
    const nowMs = Date.now();
    const list = entries
      .filter(e => e.type === 'reminder' && Date.parse(e.scheduledAt || '') >= nowMs)
      .sort((a, b) => Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || ''));
    const body = list.length
      ? `<ul class="rem-list">${list.map(r => {
          const offset = dayOf(r.t);
          const dayText = offset === 0 ? t('today') : offset === 1 ? (lang === 'es' ? 'Mañana' : 'Tomorrow') : dateLabel(offset);
          const timeText = clockAt(r.hour, r.minute, r.period);
          return `<li class="rem-item" data-rem-id="${esc(r.id)}">
            <div class="rem-top">
              ${iconBlock('clock')}
              <div>
                <div class="rem-title">${esc(t(r.what))}</div>
                <div class="rem-when">${esc(dayText)} · ${esc(timeText)}</div>
              </div>
              <span class="rem-state${r.enabled ? ' on' : ''}">${r.enabled ? glyph('check') : ''}${esc(L(lang, r.enabled ? 'statusOn' : 'statusOff'))}</span>
            </div>
            <div class="rem-controls">
              <button type="button" class="textlink" data-act="edit" data-arg="${esc(r.id)}">${esc(L(lang, 'editShort'))}${glyph('chev')}</button>
              <button type="button" class="textlink" data-act="alerts-rem-toggle" data-arg="${esc(r.id)}">${esc(L(lang, r.enabled ? 'turnOffShort' : 'turnOnShort'))}</button>
              <button type="button" class="textlink" data-act="alerts-rem-del" data-arg="${esc(r.id)}">${esc(t('deleteShort'))}</button>
            </div>
          </li>`;
        }).join('')}</ul>`
      : `<p class="rem-empty">${esc(L(lang, 'noUpcoming'))}</p>`;
    return `<section class="rem-sec"><h2>${esc(L(lang, 'upcomingHeading'))}</h2><div class="card">${body}</div></section>`;
  }

  function handle(action, arg, hooks) {
    if (action === 'alerts-on') { void turnOn(hooks.lang, hooks.render, hooks.reloadState); return true; }
    if (action === 'alerts-off') { void turnOff(hooks.lang, hooks.render, hooks.reloadState); return true; }
    if (action === 'alerts-switch') {
      const [key, val] = String(arg || '').split(':');
      if (['reminder', 'medicine', 'nap', 'feed'].includes(key) && (val === 'on' || val === 'off')) {
        const nextAlerts = { ...DEFAULT_SWITCHES, ...(hooks.prefs?.alerts || {}), [key]: val };
        void hooks.saveAlertPrefs(nextAlerts);
      }
      return true;
    }
    if (action === 'alerts-rem-toggle') { void hooks.toggleReminder(arg); return true; }
    if (action === 'alerts-rem-del') { void hooks.deleteReminder(arg); return true; }
    if (action === 'alerts-rem-what') { hooks.setSheetField('what', arg); return true; }
    if (action === 'alerts-rem-edit-what') { hooks.setSheetField('valueWhat', arg); return true; }
    return false;
  }

  return {
    state,
    L,
    refresh,
    thisPhoneOn,
    unsubscribeOnLogout,
    settingsHTML,
    validMedNext,
    parseMedNext,
    medNextFieldHTML,
    medNextReadout,
    reminderNoteMode,
    reminderNoteHTML,
    upcomingRemindersHTML,
    handle,
  };
})();
