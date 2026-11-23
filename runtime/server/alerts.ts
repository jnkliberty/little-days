import { randomUUID } from 'node:crypto';
import { HttpError } from './http.ts';
import { localDate, mapBabyBuddyRecord, relativeMinutes, validNextDoseHours } from './mapping.ts';
import { ensureVapidKeys, sendWebPush, validPushContact, validSubscriptionInput } from './push.ts';
import type { VapidKeys } from './push.ts';
import type { Session } from './app.ts';
import type { SessionService } from './session.ts';
import type { AlertDelivery, AlertDue, AlertType, PushSubscriptionRecord, Store } from './store.ts';
import { hashSecret } from './store.ts';
import { getZone } from './zone.ts';
import '../web/cry.js';
import '../web/forecast.js';

type ForecastResult = { state: 'window' | 'passed' | 'few'; from?: number; to?: number; last?: number; gaps: number; period: string };
type ForecastApi = {
  forecast(input: { entries: unknown[]; now: number; run: unknown; sleepRun: unknown; complete: boolean; feeds: boolean; sleep: boolean }): { feed: ForecastResult | null; nap: ForecastResult | null };
};
type DirtyMap = { feed: boolean; nap: boolean };
type WindowSpec = { eventId: string; dueAt: number; expiresAt: number };

const DEFAULT_ALERTS: Record<AlertType, 'on' | 'off'> = { reminder: 'on', medicine: 'on', nap: 'off', feed: 'off' };
const REQUIRED_PERM: Record<AlertType, string | null> = {
  reminder: null,
  medicine: 'core.view_medication',
  nap: 'core.view_sleep',
  feed: 'core.view_feeding',
};
const ALERT_BODY: Record<AlertType, { en: string; es: string }> = {
  reminder: { en: 'Reminder', es: 'Recordatorio' },
  medicine: { en: 'Medicine dose is due', es: 'Toca la siguiente dosis' },
  nap: { en: 'Nap window is near', es: 'Se acerca la ventana de siesta' },
  feed: { en: 'Feed window is open', es: 'Se abrió la ventana de toma' },
};
const REMINDER_EXPIRY_MS = 30 * 60_000;
const MEDICINE_EXPIRY_MS = 60 * 60_000;
const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 19 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function zoneParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getZone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { year: +map.year, month: +map.month, day: +map.day, hour: +map.hour, minute: +map.minute, second: +map.second };
}

function localTimeToUtcMs(dayStr: string, minuteOfDay: number): number {
  const [year, month, day] = dayStr.split('-').map(Number);
  const whole = Math.floor(minuteOfDay);
  const secs = Math.round((minuteOfDay - whole) * 60);
  const naive = Date.UTC(year, month - 1, day, Math.floor(whole / 60), whole % 60, secs);
  let guess = naive;
  for (let i = 0; i < 2; i++) {
    const p = zoneParts(new Date(guess));
    guess += naive - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return guess;
}

function relativeMinuteToUtcMs(todayStr: string, relMin: number): number {
  const dayOffset = Math.floor(relMin / 1440);
  const minOfDay = ((relMin % 1440) + 1440) % 1440;
  const targetDay = new Date(Date.parse(`${todayStr}T00:00:00Z`) + dayOffset * 86_400_000).toISOString().slice(0, 10);
  return localTimeToUtcMs(targetDay, minOfDay);
}

function localMinuteOfDay(ms: number): number {
  const p = zoneParts(new Date(ms));
  return p.hour * 60 + p.minute + p.second / 60;
}

function localDayEndMs(ms: number): number {
  return localTimeToUtcMs(localDate(new Date(ms)), DAY_END_MIN);
}

function childIdOf(store: Store): number | null {
  const value = store.getSetting('app', 'child');
  const raw = typeof value === 'number' ? value : isRecord(value) ? value.id : null;
  return Number.isSafeInteger(raw) && Number(raw) > 0 ? Number(raw) : null;
}

function rowChildId(row: Record<string, unknown>): number {
  return Number(isRecord(row.child) ? row.child.id : row.child);
}

function rowList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.results)) return value.results.filter(isRecord);
  return [];
}

function stripResourcePrefix(resource: string): string {
  return resource.replace(/^(?:update|delete|split):/, '');
}

function errorStatus(error: unknown): number {
  return Number((error as { status?: number })?.status) || 0;
}

function validWindow(res: ForecastResult | null): res is ForecastResult & { from: number; to: number; last: number } {
  return Boolean(res && res.state === 'window' && res.from != null && res.to != null && res.last != null);
}

function buildWindowSpec(kind: 'feed' | 'nap', todayStr: string, lastMin: number, dueMin: number, expMin: number): WindowSpec | null {
  if (dueMin >= expMin) return null;
  const lastMs = Math.round(relativeMinuteToUtcMs(todayStr, lastMin) / 1000) * 1000;
  return {
    eventId: `forecast:${kind}:${lastMs}`,
    dueAt: relativeMinuteToUtcMs(todayStr, dueMin),
    expiresAt: relativeMinuteToUtcMs(todayStr, expMin),
  };
}

function evaluateNapWindow(api: ForecastApi, entries: unknown[], todayStr: string, nowMin: number): WindowSpec | null {
  const inDay = nowMin >= DAY_START_MIN && nowMin < DAY_END_MIN;
  const evalMin = inDay ? nowMin : (nowMin < DAY_START_MIN ? DAY_START_MIN : 1440 + DAY_START_MIN);
  const dayStart = inDay ? DAY_START_MIN : evalMin;
  const res = api.forecast({ entries, now: evalMin, run: null, sleepRun: null, complete: true, feeds: false, sleep: true }).nap;
  if (!validWindow(res)) return null;
  return buildWindowSpec('nap', todayStr, res.last, Math.max(dayStart, res.from - 10), Math.min(res.to, dayStart + 720));
}

function evaluateFeedWindow(api: ForecastApi, entries: unknown[], todayStr: string, nowMin: number): WindowSpec | null {
  const nextBoundaryMin = nowMin < DAY_START_MIN ? DAY_START_MIN : nowMin < DAY_END_MIN ? DAY_END_MIN : 1440 + DAY_START_MIN;
  const resNow = api.forecast({ entries, now: nowMin, run: null, sleepRun: null, complete: true, feeds: true, sleep: false }).feed;
  if (validWindow(resNow) && resNow.from < nextBoundaryMin) {
    return buildWindowSpec('feed', todayStr, resNow.last, resNow.from, resNow.to);
  }
  const resNext = api.forecast({ entries, now: nextBoundaryMin, run: null, sleepRun: null, complete: true, feeds: true, sleep: false }).feed;
  if (!validWindow(resNext)) return null;
  return buildWindowSpec('feed', todayStr, resNext.last, Math.max(nextBoundaryMin, resNext.from), resNext.to);
}

function evaluateForecastWindow(kind: 'feed' | 'nap', entries: unknown[], nowMs: number, activeTimer: boolean): WindowSpec | null {
  if (activeTimer) return null;
  const api = (globalThis as unknown as { LittleDaysForecast?: ForecastApi }).LittleDaysForecast;
  if (!api) return null;
  const nowDate = new Date(nowMs);
  const todayStr = localDate(nowDate);
  const nowMin = relativeMinutes(nowDate, nowDate);
  return kind === 'nap' ? evaluateNapWindow(api, entries, todayStr, nowMin) : evaluateFeedWindow(api, entries, todayStr, nowMin);
}

function collectEnabledReminders(raw: unknown, userId: number, nowMs: number): Omit<AlertDue, 'scheduleId'>[] {
  if (!Array.isArray(raw)) return [];
  const out: Omit<AlertDue, 'scheduleId'>[] = [];
  for (const item of raw) {
    if (!isRecord(item) || item.enabled !== true || typeof item.id !== 'string' || typeof item.scheduledAt !== 'string') continue;
    const dueAt = Date.parse(item.scheduledAt);
    const expiresAt = dueAt + REMINDER_EXPIRY_MS;
    if (!Number.isFinite(dueAt) || expiresAt <= nowMs) continue;
    out.push({ eventId: item.id, type: 'reminder', dueAt, expiresAt, recipient: userId, nameKey: null });
  }
  return out;
}

function latestDoseRows(rows: { babyBuddyId: string; metadata: unknown }[]): Map<string, { babyBuddyId: string; metadata: unknown; doseMs: number }> {
  const latestByKey = new Map<string, { babyBuddyId: string; metadata: unknown; doseMs: number }>();
  for (const row of rows) {
    if (!isRecord(row.metadata)) continue;
    const doseMs = typeof row.metadata.doseTimeISO === 'string' ? Date.parse(row.metadata.doseTimeISO) : NaN;
    if (!Number.isFinite(doseMs)) continue;
    const rawKey = typeof row.metadata.nameKey === 'string' && row.metadata.nameKey ? row.metadata.nameKey : `id:${row.babyBuddyId}`;
    const prev = latestByKey.get(rawKey);
    const newer = !prev || doseMs > prev.doseMs || (doseMs === prev.doseMs && Number(row.babyBuddyId) > Number(prev.babyBuddyId));
    if (newer) latestByKey.set(rawKey, { babyBuddyId: row.babyBuddyId, metadata: row.metadata, doseMs });
  }
  return latestByKey;
}

function medicineScheduleFromMeta(bbId: string, meta: unknown, nowMs: number): Omit<AlertDue, 'scheduleId'> | null {
  if (!isRecord(meta)) return null;
  const hours = validNextDoseHours(meta.nextDoseHours);
  const doseMs = typeof meta.doseTimeISO === 'string' ? Date.parse(meta.doseTimeISO) : NaN;
  if (hours == null || !Number.isFinite(doseMs)) return null;
  const dueAt = doseMs + Math.round(hours * 3600_000);
  const expiresAt = dueAt + MEDICINE_EXPIRY_MS;
  if (expiresAt <= nowMs) return null;
  const nameKey = typeof meta.nameKey === 'string' && meta.nameKey ? meta.nameKey : null;
  return { eventId: `medication:${bbId}`, type: 'medicine', dueAt, expiresAt, recipient: null, nameKey };
}

function isFeedAppOp(base: string, op: { requestBody: unknown }): boolean {
  if (base === 'app:feeding-overlap') return true;
  const reqBody = isRecord(op.requestBody) ? op.requestBody : null;
  const kind = reqBody?.kind ?? (isRecord(reqBody?.before) ? reqBody.before.type : null);
  return kind === 'feeding-overlap' || kind === 'feed' || kind === 'bottle';
}

export function createAlerts({
  store,
  sessions,
  pushContact,
  passcodeOff = false,
  fetchImpl = fetch,
  now = Date.now,
  tickMs = 60_000,
  log = line => console.error(line),
}: {
  store: Store;
  sessions: SessionService;
  pushContact?: string;
  passcodeOff?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  tickMs?: number;
  log?: (line: string) => void;
}) {
  const contact = validPushContact(pushContact);
  let vapidKeys: VapidKeys | null = contact ? ensureVapidKeys(store) : null;
  let lastAuthError: { status: number; at: number } | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlightTick: Promise<void> | null = null;
  const syncSeq: Record<'feed' | 'nap', number> = { feed: 0, nap: 0 };
  const forecastBackoff: Record<'feed' | 'nap', { attempts: number; nextAt: number }> = {
    feed: { attempts: 0, nextAt: 0 },
    nap: { attempts: 0, nextAt: 0 },
  };
  const forecastChain: Record<'feed' | 'nap', Promise<void>> = {
    feed: Promise.resolve(),
    nap: Promise.resolve(),
  };

  function getKeys(): VapidKeys | null {
    if (!contact) return null;
    if (!vapidKeys) vapidKeys = ensureVapidKeys(store);
    return vapidKeys;
  }

  function getDirty(): DirtyMap {
    const raw = store.getSetting('app', 'forecastSyncDirty');
    return isRecord(raw) ? { feed: raw.feed === true, nap: raw.nap === true } : { feed: false, nap: false };
  }

  function setDirty(kind: 'feed' | 'nap', value: boolean): void {
    const current = getDirty();
    if (current[kind] !== value) store.putSetting('app', 'forecastSyncDirty', { ...current, [kind]: value });
  }

  function activeSubs(nowMs: number, userId?: number): PushSubscriptionRecord[] {
    const allowed = new Set(sessions.people());
    return store.listActivePushSubscriptions(nowMs, userId).filter(row => allowed.has(row.adult));
  }

  function alertEnabled(userId: number, type: AlertType): boolean {
    const prefs = store.getSetting(`user:${userId}`, 'preferences');
    const raw = isRecord(prefs) && isRecord(prefs.alerts) ? prefs.alerts[type] : undefined;
    return raw === 'on' ? true : raw === 'off' ? false : DEFAULT_ALERTS[type] === 'on';
  }

  function hasPermission(userId: number, type: AlertType): boolean {
    const needed = REQUIRED_PERM[type];
    if (!needed) return true;
    const perms = store.getSetting(`user:${userId}`, 'permissions');
    return Array.isArray(perms) && perms.includes(needed);
  }

  function userLang(userId: number): 'en' | 'es' {
    const prefs = store.getSetting(`user:${userId}`, 'preferences');
    return isRecord(prefs) && prefs.lang === 'es' ? 'es' : 'en';
  }

  function hasForecastSubscriber(kind: 'feed' | 'nap', nowMs: number): boolean {
    const seen = new Set<number>();
    for (const sub of activeSubs(nowMs)) {
      if (seen.has(sub.babyBuddyUserId)) continue;
      seen.add(sub.babyBuddyUserId);
      if (alertEnabled(sub.babyBuddyUserId, kind) && hasPermission(sub.babyBuddyUserId, kind)) return true;
    }
    return false;
  }

  function sessionUserId(session: Session): number {
    const live = sessions.get(session.sessionId);
    const record = store.getSession(session.sessionId);
    if (!live || !record || live.adult !== session.adult) throw new HttpError(401, 'Sign in again.');
    return record.babyBuddyUserId;
  }

  function upsertPreservingSchedule(next: Omit<AlertDue, 'scheduleId'>): void {
    const existing = store.getAlertDue(next.eventId);
    const same = existing && existing.type === next.type && existing.dueAt === next.dueAt && existing.recipient === next.recipient;
    store.upsertAlertDue({ ...next, scheduleId: same ? existing.scheduleId : randomUUID() });
  }

  function reconcileUserReminders(userId: number, nowMs: number): void {
    const items = collectEnabledReminders(store.getSetting(`user:${userId}`, 'reminders'), userId, nowMs);
    const keep = new Set(items.map(i => i.eventId));
    for (const item of items) upsertPreservingSchedule(item);
    for (const row of store.listAlertsDue('reminder')) {
      if (row.recipient === userId && !keep.has(row.eventId)) store.deleteAlertDue(row.eventId);
    }
  }

  function reconcileAllReminders(nowMs: number): void {
    const keep = new Set<string>();
    for (const entry of store.listSettingsByKey('reminders')) {
      const m = /^user:(\d+)$/.exec(entry.scope);
      if (!m) continue;
      for (const item of collectEnabledReminders(entry.value, Number(m[1]), nowMs)) {
        keep.add(item.eventId);
        upsertPreservingSchedule(item);
      }
    }
    for (const row of store.listAlertsDue('reminder')) {
      if (!keep.has(row.eventId)) store.deleteAlertDue(row.eventId);
    }
  }

  function reconcileAllMedicines(nowMs: number): void {
    const keep = new Set<string>();
    const latest = latestDoseRows(store.listEventMetadata('medication'));
    for (const row of latest.values()) {
      const due = medicineScheduleFromMeta(row.babyBuddyId, row.metadata, nowMs);
      if (!due) continue;
      keep.add(due.eventId);
      upsertPreservingSchedule(due);
    }
    for (const row of store.listAlertsDue('medicine')) {
      if (!keep.has(row.eventId)) store.deleteAlertDue(row.eventId);
    }
  }

  function syncMedicine(nowMs: number): void {
    reconcileAllMedicines(nowMs);
  }

  function mapRemoteEntries(resource: string, rows: Record<string, unknown>[], child: number, nowDate: Date): unknown[] {
    return rows.filter(row => rowChildId(row) === child).map(row => {
      const meta = store.getEventMetadata(resource, String(row.id));
      const merged = isRecord(meta?.metadata) ? { ...meta.metadata, adult: meta.adult } : null;
      return mapBabyBuddyRecord(resource, row, merged, nowDate, meta?.adult ?? '');
    });
  }

  function localOverlapFeeds(child: number, fromISO: string, toISO: string, nowDate: Date): unknown[] {
    const out: unknown[] = [];
    for (const appEv of store.listAppEvents(fromISO, toISO)) {
      if (appEv.kind !== 'feeding-overlap' || !isRecord(appEv.details) || Number(appEv.details.childId) !== child) continue;
      if (isRecord(appEv.details.entry)) {
        out.push({ ...appEv.details.entry, id: `app:${appEv.id}`, t: relativeMinutes(appEv.occurredAt, nowDate), by: appEv.adult });
      }
    }
    return out;
  }

  function hasActiveTimer(kind: 'feed' | 'nap', timerRows: Record<string, unknown>[], child: number): boolean {
    const timerKind = kind === 'feed' ? 'feed' : 'sleep';
    const live = timerRows.some(row => {
      if (row.id == null || rowChildId(row) !== child) return false;
      const tMeta = store.getEventMetadata('timers', String(row.id));
      return isRecord(tMeta?.metadata) && tMeta.metadata.kind === timerKind;
    });
    if (live || kind !== 'nap') return live;
    const paused = store.getSetting('app', 'sleepPaused');
    return isRecord(paused) && Number(paused.childId) === child;
  }

  async function readForecastInputsForUser(userId: number, kind: 'feed' | 'nap', nowMs: number): Promise<{ entries: unknown[]; activeTimer: boolean } | null> {
    const child = childIdOf(store);
    if (!child) return null;
    const resource = kind === 'feed' ? 'feedings' : 'sleep';
    const fromISO = new Date(nowMs - 8 * 86_400_000).toISOString();
    const toISO = new Date(nowMs + 86_400_000).toISOString();
    // Run sequentially so a cold restart logs in once and reuses that upstream session for the second read.
    const rawRows = await sessions.requestForActiveUser(userId, { resource, method: 'GET', query: { child, limit: 500, start_min: fromISO } }, nowMs);
    const rawTimers = await sessions.requestForActiveUser(userId, { resource: 'timers', method: 'GET', query: { child, limit: 100 } }, nowMs);
    const nowDate = new Date(nowMs);
    const entries = mapRemoteEntries(resource, rowList(rawRows), child, nowDate);
    if (kind === 'feed') entries.push(...localOverlapFeeds(child, fromISO, toISO, nowDate));
    return { entries, activeTimer: hasActiveTimer(kind, rowList(rawTimers), child) };
  }

  function pickForecastReader(kind: 'feed' | 'nap', preferredUserId: number | undefined, nowMs: number): number | null {
    const allowed = new Set(sessions.people());
    if (preferredUserId != null && hasPermission(preferredUserId, kind)) {
      if (store.listLiveSessionsForUser(preferredUserId, nowMs).some(row => allowed.has(row.adult))) return preferredUserId;
    }
    const found = activeSubs(nowMs).find(sub => alertEnabled(sub.babyBuddyUserId, kind) && hasPermission(sub.babyBuddyUserId, kind));
    return found ? found.babyBuddyUserId : null;
  }

  function applyForecastResult(kind: 'feed' | 'nap', window: WindowSpec | null, nowMs: number): void {
    if (!window || window.expiresAt <= nowMs) { store.deleteAlertsDueByType(kind); return; }
    const existing = store.listAlertsDue(kind);
    const same = existing.find(row => row.eventId === window.eventId);
    for (const row of existing) { if (row.eventId !== window.eventId) store.deleteAlertDue(row.eventId); }
    store.upsertAlertDue({
      eventId: window.eventId, scheduleId: same ? same.scheduleId : randomUUID(),
      type: kind, dueAt: window.dueAt, expiresAt: window.expiresAt, recipient: null, nameKey: null,
    });
  }

  function refreshForecast(kind: 'feed' | 'nap', preferredUserId?: number): Promise<void> {
    const nowMs = now();
    if (!hasForecastSubscriber(kind, nowMs)) {
      store.deleteAlertsDueByType(kind);
      setDirty(kind, false);
      forecastBackoff[kind] = { attempts: 0, nextAt: 0 };
      return Promise.resolve();
    }
    setDirty(kind, true);
    const mySeq = ++syncSeq[kind];
    const run = async () => {
      const runNow = now();
      const readerId = hasForecastSubscriber(kind, runNow) ? pickForecastReader(kind, preferredUserId, runNow) : null;
      if (readerId == null) {
        if (mySeq === syncSeq[kind]) { store.deleteAlertsDueByType(kind); setDirty(kind, false); }
        return;
      }
      try {
        const inputs = await readForecastInputsForUser(readerId, kind, runNow);
        forecastBackoff[kind] = { attempts: 0, nextAt: 0 };
        if (mySeq !== syncSeq[kind]) return;
        applyForecastResult(kind, inputs ? evaluateForecastWindow(kind, inputs.entries, now(), inputs.activeTimer) : null, now());
        setDirty(kind, false);
      } catch {
        const attempts = forecastBackoff[kind].attempts + 1;
        forecastBackoff[kind] = { attempts, nextAt: now() + Math.min(240_000, 60_000 * attempts) };
      }
    };
    forecastChain[kind] = forecastChain[kind].then(run, run).catch(() => {});
    return forecastChain[kind];
  }

  function hasUnresolvedMedicationOp(eventId: string): boolean {
    return store.pendingOperations().some(op =>
      (op.resource === 'update:medication' || op.resource === 'delete:medication') &&
      isRecord(op.intent) && op.intent.target === eventId,
    );
  }

  async function remoteVerifyMedicine(alert: AlertDue, userId: number, nowMs: number): Promise<'ok' | 'cancelled' | 'retry'> {
    const bbId = alert.eventId.slice('medication:'.length);
    const row = await sessions.requestForActiveUser(userId, { resource: 'medication', method: 'GET', id: bbId }, nowMs);
    if (!isRecord(row)) return 'retry';
    const child = childIdOf(store);
    if (child != null && rowChildId(row) !== child) { store.deleteAlertDue(alert.eventId); return 'cancelled'; }
    const saved = store.getEventMetadata('medication', bbId);
    const meta = isRecord(saved?.metadata) ? saved.metadata : null;
    const liveMs = typeof row.time === 'string' ? Date.parse(row.time) : NaN;
    const metaMs = typeof meta?.doseTimeISO === 'string' ? Date.parse(meta.doseTimeISO) : NaN;
    if (Number.isFinite(liveMs) && Number.isFinite(metaMs) && liveMs !== metaMs && meta) {
      store.putEventMetadata({ resource: 'medication', babyBuddyId: bbId, adult: saved?.adult ?? '', metadata: { ...meta, doseTimeISO: new Date(liveMs).toISOString() } });
      syncMedicine(now());
      const updated = store.getAlertDue(alert.eventId);
      if (!updated || updated.dueAt > now() || updated.expiresAt <= now()) return 'cancelled';
    }
    return 'ok';
  }

  async function remoteVerify(alert: AlertDue, userId: number, nowMs: number): Promise<'ok' | 'block' | 'retry' | 'cancelled'> {
    if (alert.type === 'reminder') return 'ok';
    try {
      if (alert.type === 'medicine') return await remoteVerifyMedicine(alert, userId, nowMs);
      const resource = alert.type === 'nap' ? 'sleep' : 'feedings';
      await sessions.requestForActiveUser(userId, { resource, method: 'GET', query: { limit: 1 } }, nowMs);
      return 'ok';
    } catch (error) {
      const code = errorStatus(error);
      if (alert.type === 'medicine' && code === 404) { store.deleteAlertDue(alert.eventId); return 'cancelled'; }
      return code === 401 || code === 403 ? 'block' : 'retry';
    }
  }

  function sourceMatchesLocal(fresh: AlertDue, userId: number, nowMs: number): boolean {
    if (fresh.type === 'nap') {
      const min = localMinuteOfDay(nowMs);
      return min >= DAY_START_MIN && min < DAY_END_MIN && !getDirty().nap;
    }
    if (fresh.type === 'feed') return !getDirty().feed;
    if (fresh.type === 'reminder') {
      if (fresh.recipient !== userId) return false;
      const list = store.getSetting(`user:${userId}`, 'reminders');
      const item = Array.isArray(list) ? list.find(r => isRecord(r) && r.id === fresh.eventId) : null;
      return isRecord(item) && item.enabled === true && Date.parse(String(item.scheduledAt)) === fresh.dueAt;
    }
    const bbId = fresh.eventId.slice('medication:'.length);
    const latest = latestDoseRows(store.listEventMetadata('medication'));
    const winner = fresh.nameKey ? latest.get(fresh.nameKey) : latest.get(`id:${bbId}`);
    if (!winner || winner.babyBuddyId !== bbId) return false;
    const due = medicineScheduleFromMeta(bbId, winner.metadata, nowMs);
    return Boolean(due && due.dueAt === fresh.dueAt);
  }

  function authoritativeLocalValid(alert: AlertDue, userId: number, nowMs: number): AlertDue | null {
    if (!passcodeOff && !sessions.passcodeSet()) return null;
    const fresh = store.getAlertDue(alert.eventId);
    if (!fresh || fresh.scheduleId !== alert.scheduleId || fresh.dueAt > nowMs || fresh.expiresAt <= nowMs) return null;
    if (!sourceMatchesLocal(fresh, userId, nowMs)) return null;
    return alertEnabled(userId, fresh.type) && hasPermission(userId, fresh.type) ? fresh : null;
  }

  function selectBinding(userId: number, existing: AlertDelivery | null, nowMs: number): PushSubscriptionRecord | null {
    const subs = activeSubs(nowMs, userId);
    if (!subs.length) return null;
    if (existing?.endpoint && existing.sessionIdHash && existing.bindingUpdatedAt != null) {
      const pinned = subs.find(
        s => s.endpoint === existing.endpoint && s.sessionIdHash === existing.sessionIdHash && s.updatedAt === existing.bindingUpdatedAt,
      );
      if (pinned) return pinned;
    }
    return subs[0];
  }

  function computeTtlSeconds(alert: AlertDue, binding: PushSubscriptionRecord, nowMs: number): number {
    const deadlines = [alert.expiresAt, binding.sessionExpiresAt, ...(alert.type === 'nap' ? [localDayEndMs(nowMs)] : [])];
    return Math.min(3600, Math.floor((Math.min(...deadlines) - nowMs) / 1000));
  }

  function recordRetry(alert: AlertDue, userId: number, prev: AlertDelivery | null): void {
    const attempts = (prev?.attempts ?? 0) + 1;
    store.upsertAlertDelivery({
      eventId: alert.eventId, scheduleId: alert.scheduleId, babyBuddyUserId: userId,
      state: 'retry', attempts, nextRetryAt: now() + Math.min(300_000, 60_000 * attempts),
      endpoint: prev?.endpoint ?? null, sessionIdHash: prev?.sessionIdHash ?? null,
      bindingUpdatedAt: prev?.bindingUpdatedAt ?? null, updatedAt: now(),
    });
  }

  function handlePushOutcome(outcome: string, status: number, pinned: AlertDelivery, binding: PushSubscriptionRecord): 'done' | 'fallback' {
    const doneNow = now();
    if (outcome === 'accepted') {
      lastAuthError = null;
      store.upsertAlertDelivery({ ...pinned, state: 'sent', nextRetryAt: 0, updatedAt: doneNow });
      return 'done';
    }
    if (outcome === 'gone') {
      store.deleteExactPushSubscription(binding.endpoint, binding.sessionIdHash, binding.updatedAt);
      store.upsertAlertDelivery({ ...pinned, endpoint: null, sessionIdHash: null, bindingUpdatedAt: null, updatedAt: doneNow });
      return 'fallback';
    }
    if (outcome === 'bad_request' || outcome === 'auth_error') {
      if (outcome === 'bad_request') log(`push rejected ${status}`);
      else lastAuthError = { status, at: doneNow };
      store.upsertAlertDelivery({ ...pinned, attempts: pinned.attempts + 1, nextRetryAt: doneNow + 300_000, updatedAt: doneNow });
      return 'done';
    }
    const nextAttempts = pinned.attempts + 1;
    store.upsertAlertDelivery({ ...pinned, attempts: nextAttempts, nextRetryAt: doneNow + Math.min(300_000, 60_000 * nextAttempts), updatedAt: doneNow });
    return 'done';
  }

  async function attemptPushHop(alert: AlertDue, userId: number, keys: VapidKeys): Promise<'done' | 'fallback'> {
    const nowMs = now();
    const fresh = authoritativeLocalValid(alert, userId, nowMs);
    if (!fresh) return 'done';
    const delivery = store.getAlertDelivery(fresh.eventId, fresh.scheduleId, userId);
    if (delivery?.state === 'sent') return 'done';
    const binding = selectBinding(userId, delivery, nowMs);
    if (!binding) return 'done';
    const ttlSeconds = computeTtlSeconds(fresh, binding, nowMs);
    if (ttlSeconds < 1) return 'done';

    const pinned: AlertDelivery = {
      eventId: fresh.eventId, scheduleId: fresh.scheduleId, babyBuddyUserId: userId,
      state: 'retry', attempts: delivery?.attempts ?? 0, nextRetryAt: delivery?.nextRetryAt ?? 0,
      endpoint: binding.endpoint, sessionIdHash: binding.sessionIdHash, bindingUpdatedAt: binding.updatedAt, updatedAt: nowMs,
    };
    if (!store.upsertAlertDelivery(pinned)) return 'done';
    const payload = JSON.stringify({ type: fresh.type, tag: fresh.eventId, title: 'Little Days', body: ALERT_BODY[fresh.type][userLang(userId)] });
    const res = await sendWebPush({
      endpoint: binding.endpoint, p256dh: binding.p256dh, auth: binding.auth, payload, ttlSeconds,
      urgency: fresh.type === 'reminder' || fresh.type === 'medicine' ? 'high' : 'normal',
      contact: contact!, keys, nowMs: now(), fetchImpl,
    });
    return handlePushOutcome(res.outcome, res.status, pinned, binding);
  }

  async function dispatchForAdult(alert: AlertDue, userId: number): Promise<void> {
    const keys = getKeys();
    if (!contact || !keys) return;
    const delivery = store.getAlertDelivery(alert.eventId, alert.scheduleId, userId);
    if (delivery?.state === 'sent' || (delivery && delivery.nextRetryAt > now())) return;
    if (!alertEnabled(userId, alert.type) || !hasPermission(userId, alert.type)) return;
    if (alert.type === 'medicine' && hasUnresolvedMedicationOp(alert.eventId)) return;

    const remote = await remoteVerify(alert, userId, now());
    if (remote === 'cancelled') return;
    if (remote === 'block') {
      // Back off for 5 min without modifying user:<id>/permissions so wrong credentials cannot hammer Baby Buddy.
      store.upsertAlertDelivery({
        eventId: alert.eventId, scheduleId: alert.scheduleId, babyBuddyUserId: userId,
        state: 'retry', attempts: (delivery?.attempts ?? 0) + 1, nextRetryAt: now() + 300_000,
        endpoint: delivery?.endpoint ?? null, sessionIdHash: delivery?.sessionIdHash ?? null,
        bindingUpdatedAt: delivery?.bindingUpdatedAt ?? null, updatedAt: now(),
      });
      return;
    }
    if (remote === 'retry') { recordRetry(alert, userId, delivery); return; }

    for (let hop = 0; hop < 8; hop++) {
      if ((await attemptPushHop(alert, userId, keys)) === 'done') return;
    }
  }

  function dueAlertsNow(): AlertDue[] {
    const dirty = getDirty();
    const tickNow = now();
    return store.listAlertsDue().filter(row => {
      if (row.dueAt > tickNow || row.expiresAt <= tickNow) return false;
      if (row.type === 'feed' && dirty.feed) return false;
      if (row.type === 'nap' && dirty.nap) return false;
      return true;
    });
  }

  async function runTick(): Promise<void> {
    if (!passcodeOff && !sessions.passcodeSet()) return;
    const nowMs = now();
    store.deleteExpiredSessions(nowMs);
    store.pruneExpiredAlertsDue(nowMs);
    if (!contact) return;

    const dirty = getDirty();
    for (const kind of ['feed', 'nap'] as const) {
      if (dirty[kind] && forecastBackoff[kind].nextAt <= now()) await refreshForecast(kind);
    }

    const due = dueAlertsNow();
    if (!due.length) return;
    const subscribedUsers = [...new Set(activeSubs(now()).map(sub => sub.babyBuddyUserId))];
    for (const alert of due) {
      const targets = alert.type === 'reminder' ? (alert.recipient != null ? [alert.recipient] : []) : subscribedUsers;
      for (const userId of targets) await dispatchForAdult(alert, userId);
    }
  }

  function tick(): Promise<void> {
    if (inFlightTick) return inFlightTick;
    inFlightTick = runTick().catch(() => {}).finally(() => { inFlightTick = null; });
    return inFlightTick;
  }

  function start(): void {
    const nowMs = now();
    store.deleteExpiredSessions(nowMs);
    reconcileAllReminders(nowMs);
    reconcileAllMedicines(nowMs);
    for (const kind of ['feed', 'nap'] as const) {
      if (hasForecastSubscriber(kind, nowMs)) setDirty(kind, true);
    }
    if (!timer) {
      timer = setInterval(() => { void tick(); }, tickMs);
      timer.unref?.();
    }
  }

  async function stop(): Promise<void> {
    if (timer) { clearInterval(timer); timer = null; }
    if (inFlightTick) await inFlightTick;
    await Promise.allSettled([forecastChain.feed, forecastChain.nap]);
  }

  function config(session: Session) {
    const userId = sessionUserId(session);
    const sessionHash = hashSecret(session.sessionId);
    const subs = activeSubs(now(), userId);
    const keys = getKeys();
    return {
      available: contact !== null,
      vapidPublicKey: keys ? keys.publicKey : null,
      sessionSubscribed: subs.some(s => s.sessionIdHash === sessionHash),
      thisSessionSelected: subs.length > 0 && subs[0].sessionIdHash === sessionHash,
      adultSubscribed: subs.length > 0,
      authError: lastAuthError !== null,
    };
  }

  async function onEnroll(session: Session): Promise<void> {
    try {
      const userId = sessionUserId(session);
      reconcileUserReminders(userId, now());
      for (const kind of ['feed', 'nap'] as const) {
        if (alertEnabled(userId, kind) && hasPermission(userId, kind)) await refreshForecast(kind, userId);
      }
    } catch { /* Enrollment must succeed even if a background forecast read fails. */ }
  }

  async function subscribe(session: Session, body: unknown) {
    if (!contact) throw new HttpError(503, 'Alerts are not available on this server.');
    sessionUserId(session);
    const sub = validSubscriptionInput(body);
    const res = store.upsertPushSubscription({ ...sub, sessionIdHash: hashSecret(session.sessionId), nowMs: now() });
    if (res.conflict) throw new HttpError(409, 'This phone is already subscribed under another sign-in.');
    await onEnroll(session);
    return config(session);
  }

  function unsubscribe(session: Session, body: unknown) {
    sessionUserId(session);
    const endpoint = isRecord(body) && typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint) throw new HttpError(400, 'Enter a push endpoint.');
    store.deletePushSubscriptionForSession(endpoint, hashSecret(session.sessionId));
    return config(session);
  }

  function deliveryFor(userId: number, enabled: boolean): 'push' | 'unavailable' {
    if (!enabled || !contact || !alertEnabled(userId, 'reminder')) return 'unavailable';
    return activeSubs(now(), userId).length > 0 ? 'push' : 'unavailable';
  }

  function syncPreferencesWrite(userId: number, nowMs: number): void {
    reconcileUserReminders(userId, nowMs);
    for (const kind of ['feed', 'nap'] as const) {
      if (alertEnabled(userId, kind) && hasPermission(userId, kind) && (getDirty()[kind] || !store.listAlertsDue(kind).length)) {
        void refreshForecast(kind, userId);
      } else if (!hasForecastSubscriber(kind, nowMs)) {
        store.deleteAlertsDueByType(kind);
        setDirty(kind, false);
      }
    }
  }

  function onWrite(session: Session, operationId: string): void {
    try {
      const op = store.getOperation(operationId);
      if (!op) return;
      const base = stripResourcePrefix(op.resource);
      const nowMs = now();
      if (base === 'reminder') { reconcileUserReminders(sessionUserId(session), nowMs); return; }
      if (base === 'medication') { syncMedicine(nowMs); return; }
      if (base === 'preferences') { syncPreferencesWrite(sessionUserId(session), nowMs); return; }
      if (base === 'feedings') { void refreshForecast('feed', sessionUserId(session)); return; }
      if (base === 'sleep') { void refreshForecast('nap', sessionUserId(session)); return; }
      if (base === 'timers') {
        const userId = sessionUserId(session);
        void refreshForecast('feed', userId);
        void refreshForecast('nap', userId);
        return;
      }
      if ((base === 'app:feeding-overlap' || base === 'update-app-event' || base === 'delete-app-event') && isFeedAppOp(base, op)) {
        void refreshForecast('feed', sessionUserId(session));
      }
    } catch { /* Alert sync never fails an adult's saved write. */ }
  }

  async function flush(): Promise<void> {
    await Promise.allSettled([forecastChain.feed, forecastChain.nap]);
  }

  return { config, subscribe, unsubscribe, deliveryFor, onEnroll, onWrite, flush, start, stop, tick };
}

export type AlertService = ReturnType<typeof createAlerts>;
