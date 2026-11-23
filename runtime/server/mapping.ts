import { HttpError } from './http.ts';
import { getZone } from './zone.ts';
import '../web/foods.js';

const foods = (globalThis as any).LITTLE_DAYS_FOODS as { catalog: { id: string }[]; resolve: (name: unknown) => string | null };

export type UnitContract = { verified?: boolean; volume?: string; temperature?: string; weight?: string; length?: string } | null;
export type MappedWrite = { resource: string; body: Record<string, unknown>; metadata: Record<string, unknown> };
export type MappedEvent = { writes: MappedWrite[]; local?: { kind: string; occurredAt: string; details: Record<string, unknown> } };
const ALLOWED_COLORS = new Set(['yellow', 'green', 'brown', 'black', 'red']);
const MED_UNITS = new Set(['mg', 'ml', 'tablets', 'drops']);

function dateParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: getZone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: +value.year, month: +value.month, day: +value.day, hour: +value.hour, minute: +value.minute, second: +value.second };
}

export function localDate(date: Date): string {
  const p = dateParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function localTime(day: string, minute: number): Date {
  if (!validDate(day) || !Number.isFinite(minute) || minute < 0 || minute >= 1440) throw new HttpError(400, 'Enter a valid date and time.');
  const [year, month, date] = day.split('-').map(Number);
  const naive = Date.UTC(year, month - 1, date, Math.floor(minute / 60), Math.floor(minute % 60), Math.floor((minute % 1) * 60));
  let guess = naive;
  for (let i = 0; i < 2; i++) {
    const p = dateParts(new Date(guess));
    guess += naive - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return new Date(guess);
}

export function localMidnight(date: string): string {
  return localTime(date, 0).toISOString();
}

export function instant(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new HttpError(400, 'Enter a date and time with a time zone.');
  const date = new Date(value);
  if (!validDate(value.slice(0, 10)) || !Number.isFinite(date.getTime())) throw new HttpError(400, 'Enter a valid date and time.');
  return date;
}

function eventInstant(event: Record<string, unknown>, now: Date): Date {
  if (event.start !== undefined) return instant(event.start);
  if (event.time !== undefined) return instant(event.time);
  if (event.t !== undefined) {
    const minute = Number(event.t);
    if (!Number.isFinite(minute) || minute < 0 || minute >= 1440) throw new HttpError(400, 'Older entries need an absolute date and time.');
    return localTime(localDate(now), minute);
  }
  if (validDate(event.date)) return localTime(event.date, 720);
  throw new HttpError(400, 'Enter the event date and time.');
}

export function eventTimestamp(event: Record<string, unknown>, now: Date): string {
  const recorded = eventInstant(event, now);
  if (event.type === 'diaper') {
    if (recorded.getTime() - now.getTime() >= 1000) throw new HttpError(400, 'The diaper time must not be in the future.');
    // Phone clocks can run milliseconds ahead; Baby Buddy rejects any future time.
    if (recorded > now) return now.toISOString();
  }
  return recorded.toISOString();
}

function period(event: Record<string, unknown>, now: Date): { start: Date; end: Date } {
  const start = event.start !== undefined ? instant(event.start) : eventInstant(event, now);
  const end = event.end !== undefined ? instant(event.end) : Number.isFinite(Number(event.dur)) && Number(event.dur) >= 0 ? new Date(start.getTime() + Number(event.dur) * 60_000) : null;
  if (!end) throw new HttpError(400, 'Enter the activity duration or end time.');
  if (end < start || end.getTime() - start.getTime() > 24 * 60 * 60_000) throw new HttpError(400, 'Enter a valid period of 24 hours or less.');
  if (end > now) throw new HttpError(400, 'The activity must end before now. Check its start time and duration.');
  return { start, end };
}

export function relativeMinutes(time: string | Date, now: Date): number {
  const date = time instanceof Date ? time : validDate(time) ? localTime(time, 720) : instant(time);
  const p = dateParts(date), today = dateParts(now);
  const day = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000);
  return day * 1440 + p.hour * 60 + p.minute + p.second / 60;
}

function notes(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 5000) throw new HttpError(400, 'Keep notes under 5,000 characters.');
  return value;
}

function boundedText(value: unknown, limit: number, label: string): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > limit) throw new HttpError(400, `Enter ${label} using at most ${limit} characters.`);
  return value.trim();
}

function number(value: unknown, label: string, optional = false): number | undefined {
  if (optional && (value == null || value === '')) return undefined;
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) throw new HttpError(400, `Enter a valid ${label}.`);
  const out = Number(value);
  if (!Number.isFinite(out) || out < 0) throw new HttpError(400, `Enter a valid ${label}.`);
  return out;
}

function requireUnit(units: UnitContract, key: keyof NonNullable<UnitContract>, expected: string): void {
  if (!units?.verified || units[key] !== expected) throw new HttpError(409, 'The Baby Buddy unit mapping is not verified. No measurement was saved.');
}

function write(resource: string, body: Record<string, unknown>, metadata: Record<string, unknown>): MappedWrite {
  return { resource, body, metadata };
}

function periodBody(childId: number, event: Record<string, unknown>, now: Date): { child: number; start: string; end: string; notes: string } {
  const p = period(event, now);
  return { child: childId, start: p.start.toISOString(), end: p.end.toISOString(), notes: notes(event.note) };
}

type EventContext = { event: Record<string, unknown>; childId: number; now: Date; units: UnitContract };
type EventMapper = (context: EventContext) => MappedEvent;

function mapFeed({ event, childId, now }: EventContext): MappedEvent {
    const side = event.side;
    const method = side === 'L' ? 'left breast' : side === 'R' ? 'right breast' : side === 'B' ? 'both breasts' : null;
    if (!method) throw new HttpError(400, 'Choose a feeding side.');
    const body = { ...periodBody(childId, event, now), type: 'breast milk', method };
    return { writes: [write('feedings', body, { appType: 'feed', side, sessionId: event.sid == null ? null : String(event.sid) })] };
}

function mapBottle({ event, childId, now, units }: EventContext): MappedEvent {
    requireUnit(units, 'volume', 'ml');
    const ml = number(event.ml, 'amount');
    if (!ml || !['breast', 'formula'].includes(String(event.milk))) throw new HttpError(400, 'Choose a milk type and enter an amount.');
    const time = eventInstant(event, now);
    const p = event.dur !== undefined || event.end !== undefined ? period(event, now) : { start: time, end: time };
    return { writes: [write('feedings', { child: childId, start: p.start.toISOString(), end: p.end.toISOString(), type: event.milk === 'breast' ? 'breast milk' : 'formula', method: 'bottle', amount: ml, notes: notes(event.note) }, { appType: 'bottle', sessionId: event.sid == null ? null : String(event.sid), unit: 'ml', inputUnit: event.vu === 'oz' ? 'oz' : 'ml' })] };
}

function mapPump({ event, childId, now, units }: EventContext): MappedEvent {
    requireUnit(units, 'volume', 'ml');
    const left = number(event.leftMl ?? event.pL, 'left amount', true) ?? (event.side === 'L' ? number(event.ml, 'amount') : 0);
    const right = number(event.rightMl ?? event.pR, 'right amount', true) ?? (event.side === 'R' ? number(event.ml, 'amount') : 0);
    const total = left + right;
    const givenTotal = number(event.totalMl, 'total amount', true);
    if (givenTotal !== undefined && givenTotal !== total) throw new HttpError(400, 'The pumping total must match the left and right amounts.');
    if (total <= 0) throw new HttpError(400, 'Enter a pumping amount.');
    const p = period(event, now);
    return { writes: [write('pumping', { child: childId, start: p.start.toISOString(), end: p.end.toISOString(), amount: total, notes: notes(event.note) }, { appType: 'pump', unit: 'ml', inputUnit: event.vu === 'oz' ? 'oz' : 'ml', leftMl: left, rightMl: right, sessionId: event.sid == null ? null : String(event.sid) })] };
}

function mapSleep({ event, childId, now }: EventContext): MappedEvent {
    if (typeof event.nap !== 'boolean') throw new HttpError(400, 'Choose nap or night sleep.');
    return { writes: [write('sleep', { ...periodBody(childId, event, now), nap: event.nap }, { appType: 'sleep' })] };
}

function mapDiaper({ event, childId, now }: EventContext): MappedEvent {
    const kind = event.kind;
    if (!['W', 'D', 'B'].includes(String(kind))) throw new HttpError(400, 'Choose wet, dirty, or both.');
    const time = eventTimestamp(event, now);
    const color = String(event.col || '').toLowerCase();
    const body: Record<string, unknown> = { child: childId, time, wet: kind !== 'D', solid: kind !== 'W', notes: notes(event.note) };
    if (ALLOWED_COLORS.has(color)) body.color = color;
    return { writes: [write('changes', body, { appType: 'diaper', texture: event.tex || null, color: color === 'pale' ? 'pale' : null })] };
}

export function validNextDoseHours(value: unknown): number | null {
  if (value == null || value === '') return null;
  const out = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(out) && out >= 0.1 && out <= 168 ? out : null;
}

function mapMedication({ event, childId, now }: EventContext): MappedEvent {
    const dose = number(event.dose, 'dose');
    if (!dose || typeof event.name !== 'string' || !event.name.trim() || !MED_UNITS.has(String(event.unit))) throw new HttpError(400, 'Enter a medicine, dose, and supported unit.');
    const nextProvided = event.next != null && event.next !== '';
    const nextHours = nextProvided ? validNextDoseHours(event.next) : null;
    if (nextProvided && nextHours == null) throw new HttpError(400, 'Enter a next dose time between 0.1 and 168 hours.');
    const name = event.name.trim().slice(0, 255);
    const doseTimeISO = eventInstant(event, now).toISOString();
    const body: Record<string, unknown> = { child: childId, name, dosage: dose, dosage_unit: event.unit, time: doseTimeISO, notes: notes(event.note) };
    const metadata: Record<string, unknown> = { appType: 'med', nameKey: name.toLocaleLowerCase(), doseTimeISO, ...(nextHours != null ? { nextDoseHours: nextHours } : {}) };
    return { writes: [write('medication', body, metadata)] };
}

function mapTemperature({ event, childId, now, units }: EventContext): MappedEvent {
    requireUnit(units, 'temperature', 'C');
    const c = number(event.c, 'temperature');
    if (c === undefined) throw new HttpError(400, 'Enter a temperature.');
    const time = eventInstant(event, now).toISOString();
    return { writes: [write('temperature', { child: childId, temperature: c, time, notes: notes(event.note) }, { appType: 'temp', value: c, unit: 'C' })] };
}

function mapGrowth({ event, childId, now, units }: EventContext): MappedEvent {
    const date = validDate(event.date) ? event.date : localDate(eventInstant(event, now));
    const note = notes(event.note), writes: MappedWrite[] = [];
    const kg = number(event.kg, 'weight', true), cm = number(event.cm, 'height', true), head = number(event.head, 'head measurement', true);
    if (kg !== undefined) { requireUnit(units, 'weight', 'kg'); writes.push(write('weight', { child: childId, weight: kg, date, notes: note }, { appType: 'growth', value: kg, unit: 'kg' })); }
    if (cm !== undefined) { requireUnit(units, 'length', 'cm'); writes.push(write('height', { child: childId, height: cm, date, notes: note }, { appType: 'growth', value: cm, unit: 'cm' })); }
    if (head !== undefined) { requireUnit(units, 'length', 'cm'); writes.push(write('head-circumference', { child: childId, head_circumference: head, date, notes: note }, { appType: 'growth', value: head, unit: 'cm' })); }
    if (!writes.length) throw new HttpError(400, 'Enter at least one growth measurement.');
    return { writes };
}

function mapNote({ event, childId, now }: EventContext): MappedEvent {
    if (event.what === 'visit') {
      const visit = { provider: boundedText(event.provider, 255, 'provider'), reason: boundedText(event.reason, 2000, 'visit reason'), observations: boundedText(event.observations, 2000, 'observations'), instructions: boundedText(event.instructions, 2000, 'provider instructions') };
      const followUpDate = event.followUpDate || null;
      if (followUpDate != null && !validDate(followUpDate)) throw new HttpError(400, 'Enter a valid follow-up date.');
      const measurements = Object.fromEntries((['weightKg', 'lengthCm', 'headCm'] as const).map(key => [key, number(event[key], key, true) ?? null]));
      if (!Object.values(visit).some(Boolean) && !Object.values(measurements).some(value => value !== null)) throw new HttpError(400, 'Enter visit details or measurements.');
      const time = eventInstant(event, now);
      if (time > now) throw new HttpError(400, 'A visit record cannot be dated in the future.');
      const text = notes([visit.provider && `Provider: ${visit.provider}`, visit.reason && `Reason: ${visit.reason}`, visit.observations && `Observations: ${visit.observations}`, visit.instructions && `Provider instructions: ${visit.instructions}`, ...Object.entries(measurements).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${value}`), followUpDate && `Follow-up date: ${followUpDate}`].filter(Boolean).join('\n'));
      return { writes: [write('notes', { child: childId, note: text, time: time.toISOString() }, { appType: 'visit', ...visit, ...measurements, followUpDate })] };
    }
    const isMilestone = event.type === 'other';
    const title = String(event.title || (event.what === 'handoff' ? 'handoff' : '')).trim();
    if (isMilestone && !title) throw new HttpError(400, 'Enter a milestone name.');
    const time = eventInstant(event, now).toISOString();
    const text = String(event.text ?? event.note ?? '').trim();
    if (!text && !isMilestone && !event.photo) throw new HttpError(400, 'Enter a note or add a photo.');
    return { writes: [write('notes', { child: childId, note: text || title, time }, { appType: isMilestone ? 'milestone' : 'note', title: title || null, photoName: event.photoName || null })] };
}

function mapSolids({ event, childId, now }: EventContext): MappedEvent {
    const point = eventInstant(event, now);
    const p = event.end !== undefined || event.dur !== undefined ? period(event, now) : {start: point, end: point};
    const food = String(event.food || '').trim();
    if (!food) throw new HttpError(400, 'Enter a food name.');
    const foodId = event.foodId ?? null, preference = event.preference ?? null;
    if (foodId !== null && (typeof foodId !== 'string' || !foods.catalog.some(food => food.id === foodId))) throw new HttpError(400, 'Choose a catalog food or enter a custom food.');
    if (preference !== null && (typeof preference !== 'string' || !['liked', 'disliked'].includes(preference))) throw new HttpError(400, 'Choose liked or did not like, or leave preference blank.');
    const amount = number(event.amount, 'amount', true);
    const body: Record<string, unknown> = { child: childId, type: 'solid food', method: event.method === 'self fed' ? 'self fed' : 'parent fed', start: p.start.toISOString(), end: p.end.toISOString(), notes: notes(event.note) };
    if (amount !== undefined && typeof event.amountUnit === 'string' && event.amountUnit.trim()) body.amount = amount;
    return { writes: [write('feedings', body, { appType: 'other', what: 'solids', food, foodId, preference, amount: amount ?? null, amountUnit: event.amountUnit || null })] };
}

function mapBathOrTummy({ event, childId, now }: EventContext): MappedEvent {
    const time = eventInstant(event, now), duration = number(event.dur, 'duration', true), what = String(event.what);
    const hasPeriod = event.start !== undefined && event.end !== undefined && instant(event.end).getTime() > time.getTime();
    if (what === 'tummy' && ((duration !== undefined && duration > 0) || hasPeriod)) {
      const p = period(event, now), totalMinutes = (p.end.getTime() - p.start.getTime()) / 60_000;
      if (totalMinutes > 1440) throw new HttpError(400, 'Enter a duration of 24 hours or less.');
      return { writes: [write('tummy-times', { child: childId, start: p.start.toISOString(), end: p.end.toISOString(), milestone: '', notes: notes(event.note) }, { appType: 'other', what, completed: Boolean(event.completed) })] };
    }
    const p = event.end !== undefined ? period(event, now) : null;
    const occurred = p?.start || time, total = p ? (p.end.getTime() - p.start.getTime()) / 60_000 : duration ?? null;
    if ((total != null && total > 1440) || (!(total != null && total > 0) && event.completed !== true)) throw new HttpError(400, 'Mark the activity complete or enter a duration of 24 hours or less.');
    if (occurred.getTime() > now.getTime() || (total != null && occurred.getTime() + total * 60000 > now.getTime())) throw new HttpError(400, 'Choose an activity time before now.');
    const t = relativeMinutes(occurred, now);
    return { writes: [], local: { kind: what, occurredAt: occurred.toISOString(), details: { childId, entry: { type: 'other', what, t, dur: total, completed: Boolean(event.completed), note: notes(event.note) } } } };
}

function mapAppointment({ event, childId, now }: EventContext): MappedEvent {
    const time = eventInstant(event, now);
    const title = boundedText(event.title ?? event.reason, 255, 'appointment reason'), provider = boundedText(event.provider, 255, 'provider'), location = boundedText(event.location, 500, 'location'), note = notes(event.note);
    if (!title) throw new HttpError(400, 'Enter an appointment reason.');
    return { writes: [], local: { kind: 'appointment', occurredAt: time.toISOString(), details: { childId, entry: { type: 'other', what: 'appointment', title, provider, location, note, t: relativeMinutes(time, now) } } } };
}

const EVENT_MAPPERS: Record<string, EventMapper> = {
  feed: mapFeed, bottle: mapBottle, pump: mapPump, sleep: mapSleep, diaper: mapDiaper, med: mapMedication,
  temp: mapTemperature, growth: mapGrowth,
  note: mapNote,
  other: context => {
    if (context.event.what === 'appointment') return mapAppointment(context);
    if (context.event.what === 'mile') return mapNote(context);
    if (context.event.what === 'solids') return mapSolids(context);
    if (context.event.what === 'bath' || context.event.what === 'tummy') return mapBathOrTummy(context);
    throw new HttpError(400, 'This event type is not supported.');
  },
};

export function mapEvent(event: Record<string, unknown>, childId: number, now: Date, units: UnitContract): MappedEvent {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new HttpError(400, 'Enter a valid event.');
  const mapper = EVENT_MAPPERS[String(event.type)];
  if (!mapper) throw new HttpError(400, 'This event type is not supported.');
  return mapper({ event, childId, now, units });
}

type RecordContext = { base: Record<string, unknown>; row: Record<string, unknown>; meta: Record<string, unknown>; id: string; now: Date };
type RecordMapper = (context: RecordContext) => Record<string, unknown>;

function durationMinutes(row: Record<string, unknown>): number {
  const start = Date.parse(String(row.start)), end = Date.parse(String(row.end));
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 60_000) : 0;
}

function mapFeeding({ base, row, meta, id }: RecordContext): Record<string, unknown> {
  const method = String(row.method || ''), kind = String(row.type || ''), dur = durationMinutes(row);
  if (kind === 'solid food') return { ...base, type: 'other', what: 'solids', dur, food: meta.food ?? '', foodId: meta.foodId ?? foods.resolve(meta.food), preference: meta.preference ?? null, startISO: row.start, endISO: row.end, amount: meta.amount ?? null, amountUnit: meta.amountUnit ?? null };
  if (method === 'bottle') return { ...base, type: 'bottle', sid: meta.sessionId ?? id, ml: row.amount ?? null, milk: kind === 'formula' ? 'formula' : 'breast', dur, unit: meta.unit ?? 'unknown', startISO: row.start, endISO: row.end };
  const side = method === 'left breast' ? 'L' : method === 'right breast' ? 'R' : 'B';
  return { ...base, type: 'feed', side, dur, sid: meta.sessionId ?? id, startISO: row.start, endISO: row.end };
}

function mapPumpRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  return { ...base, type: 'pump', side: 'B', ml: row.amount ?? null, dur: durationMinutes(row), sideAmounts: { L: meta.leftMl ?? null, R: meta.rightMl ?? null }, unit: meta.unit ?? 'unknown', startISO: row.start, endISO: row.end };
}

// Minutes of real time since a UTC instant, in the install zone, as the wall clock shows them: the zone's UTC offset.
function zoneOffsetMinutes(date: Date): number {
  const p = dateParts(date);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
}

// A period's end on the wall-clock minute axis of `t`, plus the one clock change inside it. `t` is wall-clock minutes from today's
// local midnight, so a day always has 1440 of them; a period that spans a clock change needs `shift` to keep its real minutes.
function wallSpan(start: Date, end: Date, now: Date, duration: number): { tEnd: number; shift?: { at: number; minutes: number } } {
  const tEnd = relativeMinutes(end, now), minutes = duration - (tEnd - relativeMinutes(start, now));
  if (Math.abs(minutes) < 1 || zoneOffsetMinutes(start) === zoneOffsetMinutes(end)) return { tEnd };
  let low = start.getTime(), high = end.getTime();
  const before = zoneOffsetMinutes(start);
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    if (zoneOffsetMinutes(new Date(mid)) === before) low = mid; else high = mid;
  }
  return { tEnd, shift: { at: Math.round(relativeMinutes(new Date(low), now)) + 1, minutes } };
}

function mapSleepRecord({ base, row, now }: RecordContext): Record<string, unknown> {
  const dur = durationMinutes(row), start = new Date(String(row.start)), end = new Date(String(row.end));
  const span = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? wallSpan(start, end, now, dur) : {};
  return { ...base, type: 'sleep', nap: row.nap === true, dur, startISO: row.start, endISO: row.end, ...span };
}

function mapDiaperRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  const kind = row.wet && row.solid ? 'B' : row.wet ? 'W' : 'D';
  return { ...base, type: 'diaper', kind, col: meta.color === 'pale' ? 'pale' : row.color ?? null, tex: meta.texture ?? null };
}

function mapMedicationRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  return {
    ...base,
    type: 'med',
    name: row.name,
    dose: row.dosage,
    unit: row.dosage_unit,
    timeISO: typeof row.time === 'string' ? row.time : null,
    next: validNextDoseHours(meta.nextDoseHours),
  };
}

function mapTemperatureRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  return { ...base, type: 'temp', c: meta.unit === 'C' ? row.temperature : null, value: row.temperature, unit: meta.unit ?? 'unknown' };
}

function mapWeightRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  return { ...base, type: 'growth', kg: meta.unit === 'kg' ? row.weight : null, value: row.weight, unit: meta.unit ?? 'unknown',
    ...(typeof meta.growthPair === 'string' ? { growthPair: meta.growthPair } : {}) };
}

function mapHeightRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  return { ...base, type: 'growth', cm: meta.unit === 'cm' ? row.height : null, value: row.height, unit: meta.unit ?? 'unknown',
    ...(typeof meta.growthPair === 'string' && meta.recumbent === true ? { growthPair: meta.growthPair, recumbent: true } : {}) };
}

function mapHeadRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  return { ...base, type: 'growth', head: meta.unit === 'cm' ? row.head_circumference : null, value: row.head_circumference, unit: meta.unit ?? 'unknown' };
}

function mapTummyRecord({ base, row, meta }: RecordContext): Record<string, unknown> {
  return { ...base, type: 'other', what: 'tummy', completed: Boolean(meta.completed), dur: durationMinutes(row) };
}

function mapNoteRecord({ base, row, meta, id }: RecordContext): Record<string, unknown> {
  if (meta.appType === 'visit') return { ...base, type: 'note', what: 'visit', ...Object.fromEntries(['provider', 'reason', 'observations', 'instructions', 'weightKg', 'lengthCm', 'headCm', 'followUpDate'].map(key => [key, meta[key] ?? (['provider', 'reason', 'observations', 'instructions'].includes(key) ? '' : null)])), text: row.note, photoName: meta.photoName || '', photo: row.image ? `/api/photos/${encodeURIComponent(id)}` : null };
  const milestone = meta.appType === 'milestone';
  return { ...base, type: milestone ? 'other' : 'note', what: milestone ? 'mile' : undefined, title: meta.title || '', text: row.note, photoName: meta.photoName || '', photo: row.image ? `/api/photos/${encodeURIComponent(id)}` : null };
}

const RECORD_MAPPERS: Record<string, RecordMapper> = {
  feedings: mapFeeding, pumping: mapPumpRecord, sleep: mapSleepRecord, changes: mapDiaperRecord,
  medication: mapMedicationRecord, temperature: mapTemperatureRecord, weight: mapWeightRecord,
  height: mapHeightRecord, 'head-circumference': mapHeadRecord, 'tummy-times': mapTummyRecord, notes: mapNoteRecord,
};

export function mapBabyBuddyRecord(resource: string, row: Record<string, unknown>, metadata: Record<string, unknown> | null, now: Date, author: string): Record<string, unknown> {
  const meta = metadata || {}, id = `${resource}:${row.id}`;
  const at = String(row.start ?? row.time ?? row.date ?? ''), t = relativeMinutes(at, now);
  const by = typeof meta.adult === 'string' ? meta.adult : author;
  const base = { id, t, by, note: String(row.notes ?? '') };
  const mapper = RECORD_MAPPERS[resource];
  return mapper ? mapper({ base, row, meta, id, now }) : { ...base, type: 'other', what: resource };
}
