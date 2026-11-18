import { HttpError } from './http.ts';
import type { createRecords } from './records.ts';
import type { SessionService } from './session.ts';
import type { Store } from './store.ts';
import { getZone } from './zone.ts';

type Session = { sessionId: string; csrfToken: string; adult: string };
type RecordService = ReturnType<typeof createRecords>;
type Sessions = Pick<SessionService, 'get'>;
type Range = { from: string; to: string };
type Person = string | { name?: string; username?: string; id?: string | number; onDuty?: boolean; on_duty?: boolean };
const PALETTES = new Set(['Jelly bean', 'Sorbet', 'Spring garden', "Robin's egg"]);
const EVENT_NAMES = new Set(['feed', 'sleep', 'medicine']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function operationId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'Use a valid save ID.');
  return value;
}

function adultId(store: Store, sessions: Sessions, session: Session): number {
  const live = sessions.get(session.sessionId);
  const current = store.getSession(session.sessionId);
  if (!current || !live || live.adult !== session.adult) throw new HttpError(401, 'Sign in again.');
  return current.babyBuddyUserId;
}

function personName(person: Person): string {
  if (typeof person === 'string') return person.trim();
  return String(person.name || person.username || person.id || '').trim();
}

function canonicalPeople(state: Record<string, unknown>): Person[] {
  return Array.isArray(state.people) ? state.people.filter((person): person is Person => typeof person === 'string' || isRecord(person)) : [];
}

function reminderEntry(item: Record<string, unknown>, today: string): Record<string, unknown> | null {
  const instant = new Date(String(item.scheduledAt));
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: getZone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = `${fields.year}-${fields.month}-${fields.day}`, hour = Number(fields.hour), minute = Number(fields.minute);
  const t = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 60_000 + hour * 60 + minute;
  return { ...item, type: 'reminder', day, hour: hour % 12 || 12, minute, period: hour < 12 ? 'AM' : 'PM', t, by: item.recipient };
}

function sameOperation(store: Store, input: Parameters<Store['beginOperation']>[0]): { created: boolean; operation: ReturnType<Store['beginOperation']>['operation'] } {
  try { return store.beginOperation(input); }
  catch (error) {
    if (error instanceof Error && error.message.includes('operation id reused')) throw new HttpError(409, 'This save ID already has different data.');
    throw error;
  }
}

function operationResult(operation: ReturnType<Store['beginOperation']>['operation']): Record<string, unknown> {
  if (operation.state === 'saved') return { status: 'saved', id: operation.babyBuddyId || `app:${operation.id}` };
  if (operation.state === 'failed') throw new HttpError(409, 'This save failed. Start a new save.');
  return { status: 'pending', pendingOperation: operation.id };
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function entryDate(today: string, offset: number): { date: string; time: string } {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.floor(offset / 1440));
  const day = date.toISOString().slice(0, 10), minute = ((offset % 1440) + 1440) % 1440;
  const hour24 = Math.floor(minute / 60), hour12 = hour24 % 12 || 12;
  return { date: day, time: `${hour12}:${String(minute % 60).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}` };
}

function csvFor(state: Record<string, unknown>): string {
  const header = ['date', 'time', 'type', 'detail', 'adult', 'note', 'id', 'details'];
  const lines = [header.map(csvCell).join(',')];
  const today = String(state.today);
  const entries = Array.isArray(state.entries) ? state.entries.filter(isRecord) : [];
  for (const entry of entries) {
    const point = entryDate(today, Number(entry.t));
    const detail = entry.what || entry.name || entry.title || entry.kind || '';
    const details = Object.fromEntries(Object.entries(entry).filter(([key]) => !['id', 'by', 't'].includes(key)));
    lines.push([point.date, point.time, entry.type, detail, entry.by, entry.note, entry.id, details].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function createHousehold({ store, sessions, records }: { store: Store; sessions: Sessions; records: RecordService }) {
  function scope(session: Session): string { return `user:${adultId(store, sessions, session)}`; }

  function getPreferences(session: Session): Record<string, unknown> {
    const value = store.getSetting(scope(session), 'preferences');
    // No stored language: the browser keeps the language it picked from the device setting.
    return isRecord(value) ? value : { units: 'metric', palette: 'Sorbet', night: false };
  }

  function preferencePayload(payload: unknown): Record<string, unknown> {
    if (!isRecord(payload) || !['en', 'es'].includes(String(payload.lang)) || !['metric', 'us'].includes(String(payload.units)) || !PALETTES.has(String(payload.palette)) || typeof payload.night !== 'boolean') {
      throw new HttpError(400, 'Choose a supported language, unit system, palette, and night setting.');
    }
    const chart = payload.growthChart;
    if (chart != null && (!isRecord(chart) || !Number.isSafeInteger(chart.childId) || Number(chart.childId) <= 0
      || (chart.sex !== 'girls' && chart.sex !== 'boys'))) throw new HttpError(400, 'Choose a supported growth chart.');
    const growthChart = isRecord(chart) ? { childId: chart.childId, sex: chart.sex } : null;
    return { lang: payload.lang, units: payload.units, palette: payload.palette, night: payload.night,
      ...(growthChart ? { growthChart } : {}) };
  }

  async function state(session: Session, range?: Range) {
    const base = await records.state(session, range) as Record<string, unknown>;
    const duty = store.getSetting('app', 'duty'), reminders = store.getSetting(scope(session), 'reminders');
    const people = canonicalPeople(base).map(person => {
      if (typeof person === 'string') return { name: person, onDuty: person === duty };
      const name = personName(person);
      return { ...person, name, onDuty: name === duty };
    });
    const reminderRows = Array.isArray(reminders) ? reminders.filter(isRecord) : [];
    const mappedReminders = reminderRows.map(item => reminderEntry(item, String(base.today))).filter(isRecord);
    const entries = Array.isArray(base.entries) ? [...base.entries, ...mappedReminders] : mappedReminders;
    return { ...base, entries, people, preferences: getPreferences(session), duty: typeof duty === 'string' ? duty : session.adult, dutyNote: store.getSetting('app', 'dutyNote') || '', dutyNoteBy: store.getSetting('app', 'dutyNoteBy') || '', dutyNoteAt: store.getSetting('app', 'dutyNoteAt') || null, dutyHistory: store.listDutyHistory(), reminders: reminderRows };
  }

  function savePreference(session: Session, payload: unknown) {
    const value = preferencePayload(payload), id = operationId(isRecord(payload) ? payload.operationId : null), actor = session.adult;
    const begun = sameOperation(store, { id, adult: actor, resource: 'preferences', intent: { action: 'set-preferences' }, requestBody: value, metadata: {} });
    if (!begun.created) return operationResult(begun.operation);
    try { store.putSetting(scope(session), 'preferences', value); store.finishOperation(id, 'saved', `preferences:${adultId(store, sessions, session)}`); return { status: 'saved', id: `preferences:${adultId(store, sessions, session)}` }; }
    catch { return { status: 'pending', pendingOperation: id }; }
  }

  function saveDuty(session: Session, payload: unknown) {
    if (!isRecord(payload)) throw new HttpError(400, 'Choose an adult on duty.');
    const id = operationId(payload.operationId), who = typeof payload.who === 'string' ? payload.who.trim() : '', note = payload.note == null ? '' : payload.note;
    if (!who || who.length > 100 || typeof note !== 'string' || note.length > 1000) throw new HttpError(400, 'Enter a valid adult and optional note.');
    const known = store.getSetting('app', 'people');
    const adults = Array.isArray(known) ? known.map(person => personName(person as Person)) : [session.adult];
    if (!adults.includes(who)) throw new HttpError(400, 'Choose a named adult in this household.');
    const input = { id, adult: session.adult, resource: 'duty', intent: { action: 'set-duty' }, requestBody: { who, note }, metadata: {} };
    const begun = sameOperation(store, input);
    if (!begun.created) return operationResult(begun.operation);
    store.appendDutyHistory({ operationId: id, who, note, adult: session.adult, occurredAt: new Date().toISOString() });
    store.finishOperation(id, 'saved', `duty:${id}`);
    return { status: 'saved', id: `duty:${id}` };
  }

  function reminderPayload(session: Session, payload: unknown): Record<string, unknown> {
    if (!isRecord(payload)) throw new HttpError(400, 'Enter reminder details.');
    const base = payload;
    const who = typeof base.recipient === 'string' ? base.recipient.trim() : '';
    if (!who || who.length > 100 || !EVENT_NAMES.has(String(base.what)) || typeof base.scheduledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(base.scheduledAt) || !Number.isFinite(Date.parse(base.scheduledAt)) || typeof base.enabled !== 'boolean') {
      throw new HttpError(400, 'Enter a valid reminder and named recipient.');
    }
    if (base.enabled && who !== session.adult) throw new HttpError(403, 'Only the signed-in adult can enable reminders for their own account.');
    return { recipient: who, what: base.what, scheduledAt: new Date(base.scheduledAt).toISOString(), enabled: base.enabled, delivery: 'unavailable' };
  }

  function saveReminder(session: Session, payload: unknown, reminderId?: string) {
    const id = operationId(isRecord(payload) ? payload.operationId : null), value = reminderPayload(session, payload);
    const known = store.getSetting('app', 'people');
    const adults = Array.isArray(known) ? known.map(person => personName(person as Person)) : [session.adult];
    if (!adults.includes(String(value.recipient))) throw new HttpError(400, 'Choose a named adult in this household.');
    const key = reminderId || `reminder:${id}`;
    if (reminderId && !/^reminder:[0-9a-f-]{36}$/i.test(reminderId)) throw new HttpError(400, 'Enter a valid reminder ID.');
    const input = { id, adult: session.adult, resource: 'reminder', intent: { action: reminderId ? 'update-reminder' : 'create-reminder', target: key }, requestBody: value, metadata: {} };
    const begun = sameOperation(store, input);
    if (!begun.created) return operationResult(begun.operation);
    const current = store.getSetting(scope(session), 'reminders'), reminders = Array.isArray(current) ? current.filter(isRecord) : [];
    const next = reminderId ? reminders.map(item => item.id === reminderId ? { ...value, id: reminderId } : item) : [...reminders, { ...value, id: key }];
    if (reminderId && !reminders.some(item => item.id === reminderId)) { store.finishOperation(id, 'failed'); throw new HttpError(404, 'Reminder not found.'); }
    store.putSetting(scope(session), 'reminders', next);
    store.finishOperation(id, 'saved', key);
    return { status: 'saved', id: key, delivery: 'unavailable' };
  }

  async function exportCsv(session: Session, range: Range): Promise<string> {
    const current = await records.state(session, range) as Record<string, unknown>;
    return csvFor(current);
  }

  return { state, savePreference, saveDuty, saveReminder, exportCsv };
}
