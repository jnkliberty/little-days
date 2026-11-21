import { createHash } from 'node:crypto';
import { HttpError } from './http.ts';
import { eventTimestamp, instant, localMidnight, mapBabyBuddyRecord, mapEvent, localDate, relativeMinutes, type MappedEvent, type MappedWrite } from './mapping.ts';
import type { SessionService } from './session.ts';
import { findConflicts, overlapError } from './sleep-overlap.ts';
import type { Operation, Store } from './store.ts';

type Session = { sessionId: string; csrfToken: string; adult: string };
type Sessions = Pick<SessionService, 'request'> & Partial<Pick<SessionService, 'people'>>;
type Request = Parameters<Sessions['request']>[2];
type Range = { from: string; to: string };
type Payload = { operationId: string; event?: Record<string, unknown> };
type ChildConfig = { id: number; slug: string; dueDate: string | null };
const PERIOD_RESOURCES = new Set(['feedings', 'pumping', 'sleep', 'tummy-times']);
const POINT_RESOURCES = new Set(['changes', 'medication', 'notes', 'temperature']);
const ALL_RESOURCES = ['feedings', 'pumping', 'changes', 'sleep', 'medication', 'notes', 'temperature', 'weight', 'height', 'head-circumference', 'tummy-times'];
const MODELS: Record<string, string> = { children: 'child', timers: 'timer', feedings: 'feeding', pumping: 'pumping', changes: 'diaperchange', sleep: 'sleep', medication: 'medication', notes: 'note', temperature: 'temperature', weight: 'weight', height: 'height', 'head-circumference': 'headcircumference', 'tummy-times': 'tummytime' };
const PAGE_SIZE = 100;
const PAGE_CAP = 100;
// The growth and food histories start at this placeholder date; it carries no lower limit.
const NO_START = '0001-01-01';
// Baby Buddy 2.11.0 filters are inclusive (`gte`/`lte`). A saved row has the exact time of the write that made it, so a one-minute margin is enough.
const WINDOW_MS = 60_000;
const EDITABLE_RESOURCES = new Set(ALL_RESOURCES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function childConfig(store: Store): ChildConfig | null {
  const value = store.getSetting('app', 'child');
  if (!isRecord(value)) return null;
  if (!Number.isSafeInteger(value.id) || Number(value.id) < 1 || typeof value.slug !== 'string' || !/^[\p{L}\p{N}_-]{1,100}$/u.test(value.slug) || (value.dueDate != null && !isDate(value.dueDate))) {
    throw new HttpError(409, 'The saved child setup needs attention.');
  }
  return { id: Number(value.id), slug: value.slug, dueDate: typeof value.dueDate === 'string' ? value.dueDate : null };
}

function requireOperationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'Use a valid save ID.');
  return value;
}

function operationResult(operation: Operation): Record<string, unknown> {
  if (operation.state === 'saved') return { status: 'saved', id: operation.babyBuddyIds[0] || operation.babyBuddyId || `app:${operation.id}` };
  if (operation.state === 'cancelled') return { status: 'cancelled', pendingOperation: operation.id };
  if (operation.state === 'failed') {
    if (isRecord(operation.intent) && operation.intent.action === 'split-sleep') return { status: 'failed', operationId: operation.id, error: isRecord(operation.metadata) && operation.metadata.error || 'The split was not saved. Nothing changed. Try again.' };
    throw new HttpError(409, 'This save failed. Start a new save after you correct the entry.');
  }
  const metadata = isRecord(operation.metadata) ? operation.metadata : {};
  return { status: 'pending', pendingOperation: operation.id, ...(metadata.needsReview === true ? { needsReview: true } : {}) };
}

function writeMetadata(store: Store, operation: Operation, update: Record<string, unknown>): Record<string, unknown> {
  const current = store.getOperation(operation.id) || operation;
  const previous = isRecord(current.metadata) ? current.metadata : {};
  const next = { ...previous, ...update };
  store.updateUnresolvedOperationMetadata(operation.id, next);
  return next;
}

function appMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const { attempted: _attempted, retries: _retries, needsReview: _needsReview, ...metadata } = value;
  return metadata;
}

function operationBy(operation: Operation, fallback: string): string {
  const input = isRecord(operation.requestBody) ? operation.requestBody : {};
  return typeof input.by === 'string' ? input.by : fallback;
}

function begin(store: Store, input: Parameters<Store['beginOperation']>[0]): { created: boolean; operation: Operation } {
  try { return store.beginOperation(input); }
  catch (error) {
    if (error instanceof Error && error.message.includes('operation id reused')) throw new HttpError(409, 'This save ID already has different data.');
    throw error;
  }
}

function status(error: unknown): number | null {
  return isRecord(error) && Number.isInteger(error.status) ? Number(error.status) : null;
}

function knownFailure(code: number | null): boolean {
  return code !== null && code >= 400 && code < 500 && code !== 408;
}

function rowId(row: unknown): string {
  if (!isRecord(row) || !Number.isSafeInteger(row.id) || Number(row.id) < 1) throw new Error('Baby Buddy did not confirm the saved row.');
  return String(row.id);
}

function parseRecordId(value: string): { resource: string; id: string } {
  const match = /^([a-z-]+):(\d{1,20})$/.exec(value);
  if (!match || !EDITABLE_RESOURCES.has(match[1])) throw new HttpError(400, 'Enter a valid event ID.');
  return { resource: match[1], id: match[2] };
}

function childIdOf(row: Record<string, unknown>): number | null {
  const child = row.child;
  const value = isRecord(child) ? child.id : child;
  return Number.isSafeInteger(value) ? Number(value) : null;
}

function validRange(range: Range | undefined, now: Date): Range {
  const today = localDate(now);
  const defaultFrom = shiftDate(today, -1), defaultTo = shiftDate(today, 1);
  if (!range) return { from: defaultFrom, to: defaultTo };
  if (!isDate(range.from) || !isDate(range.to) || range.from >= range.to || daysBetween(range.from, range.to) > 31) throw new HttpError(400, 'Choose a date range of 31 days or less.');
  return range;
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

function permissionCode(resource: string, action: string): string {
  const model = MODELS[resource];
  if (!model) throw new HttpError(400, 'This resource is not available.');
  return `core.${action}_${model}`;
}

function hasPermission(store: Store, session: Session, resource: string, action: string): boolean {
  const saved = store.getSession(session.sessionId);
  const value = saved && store.getSetting(`user:${saved.babyBuddyUserId}`, 'permissions');
  return Array.isArray(value) && value.includes(permissionCode(resource, action));
}

function permissionSet(store: Store, session: Session): Set<string> {
  const saved = store.getSession(session.sessionId);
  const value = saved && store.getSetting(`user:${saved.babyBuddyUserId}`, 'permissions');
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
}

function resourcePermissions(store: Store, session: Session, resource: string): { view: boolean; add: boolean; change: boolean; delete: boolean } {
  const permissions = permissionSet(store, session);
  return Object.fromEntries(['view', 'add', 'change', 'delete'].map(action => [action, permissions.has(permissionCode(resource, action))])) as { view: boolean; add: boolean; change: boolean; delete: boolean };
}

export function requirePermission(store: Store, session: Session, resource: string, action: string): void {
  if (!hasPermission(store, session, resource, action)) throw new HttpError(403, `Your account cannot ${action} ${resource}.`);
}

function localResource(kind: string): string {
  return kind === 'bath' || kind === 'tummy' ? 'tummy-times' : kind === 'appointment' ? 'notes' : 'feedings';
}

function requireLocalDeletePermissions(store: Store, session: Session, local: ReturnType<Store['getAppEvent']>): void {
  if (local?.kind === 'appointment') requirePermission(store, session, 'children', 'view');
  requirePermission(store, session, localResource(local?.kind || ''), 'view');
  requirePermission(store, session, localResource(local?.kind || ''), 'delete');
}

function requireVisitChildPermission(store: Store, session: Session, metadata: unknown): void {
  if (isRecord(metadata) && metadata.appType === 'visit') requirePermission(store, session, 'children', 'view');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function bodyFieldMatches(key: string, expected: unknown, actual: unknown): boolean {
  if (key === 'child') return childIdOf({ child: actual }) === childIdOf({ child: expected });
  if (typeof expected === 'number' && typeof actual === 'number') return Math.abs(expected - actual) < 0.00001;
  if (typeof expected === 'string' && typeof actual === 'string' && /^(start|end|time)$/.test(key)) {
    return Date.parse(expected) === Date.parse(actual);
  }
  // Baby Buddy stores text without the spaces at its ends, and phone keyboards add one after a word.
  if (typeof expected === 'string' && typeof actual === 'string') return expected.trim() === actual.trim();
  return stable(expected) === stable(actual);
}

function matchesWrite(body: Record<string, unknown>, row: Record<string, unknown>): boolean {
  return Object.entries(body).every(([key, value]) => Object.hasOwn(row, key) && bodyFieldMatches(key, value, row[key]));
}

// The list filter that finds the rows a write could have made: its start or time within a minute, or its measurement date. An unreadable time lists every row.
export function windowQuery(resource: string, body: Record<string, unknown>): Record<string, string> {
  if (!PERIOD_RESOURCES.has(resource) && !POINT_RESOURCES.has(resource)) return typeof body.date === 'string' ? { date: body.date } : {};
  const period = PERIOD_RESOURCES.has(resource), value = body[period ? 'start' : 'time'];
  const at = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(at)) return {};
  const min = new Date(at - WINDOW_MS).toISOString(), max = new Date(at + WINDOW_MS).toISOString();
  return period ? { start_min: min, start_max: max } : { date_min: min, date_max: max };
}

async function allChildRows(sessions: Sessions, session: Session, resource: string, childId: number, window: Record<string, string> = {}): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < PAGE_CAP; page++) {
    const response = await sessions.request(session.sessionId, { resource, method: 'GET', query: { child: childId, ...window, limit: PAGE_SIZE, offset: page * PAGE_SIZE } });
    const batch = Array.isArray(response) ? response : isRecord(response) && Array.isArray(response.results) ? response.results : null;
    if (!batch) throw new HttpError(502, 'Baby Buddy returned an invalid record list.');
    rows.push(...batch.filter(isRecord));
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new HttpError(413, 'This child has too many records to verify safely.');
}

async function childrenNamed(sessions: Sessions, session: Session, firstName: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < PAGE_CAP; page++) {
    const response = await sessions.request(session.sessionId, { resource: 'children', method: 'GET', query: { first_name: firstName, limit: PAGE_SIZE, offset: page * PAGE_SIZE } });
    const batch = Array.isArray(response) ? response : isRecord(response) && Array.isArray(response.results) ? response.results : null;
    if (!batch) throw new HttpError(502, 'Baby Buddy returned an invalid child list.');
    rows.push(...batch.filter(isRecord));
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new HttpError(413, 'This child name has too many matches to verify safely.');
}

function pendingDuplicate(store: Store, resource: string, event: unknown): boolean {
  return store.pendingOperations().some(operation => {
    const intent = isRecord(operation.intent) ? operation.intent : {};
    const request = isRecord(operation.requestBody) ? operation.requestBody : {};
    return intent.action === 'create-event' && operation.resource === resource && stable(request.event) === stable(event);
  });
}

function childIdentity(operation: Operation): string | null {
  if (operation.resource !== 'children') return null;
  const request = isRecord(operation.requestBody) ? operation.requestBody : {};
  const child = isRecord(request.babyBuddy) ? request.babyBuddy : {};
  return typeof child.first_name === 'string' && typeof child.birth_date === 'string'
    ? `${child.first_name.trim().toLocaleLowerCase()}|${child.birth_date}` : null;
}

function saveChildLink(store: Store, operation: Operation, row: Record<string, unknown>, dueDate: string | null): Record<string, unknown> {
  if (!Number.isSafeInteger(row.id) || typeof row.slug !== 'string') return { status: 'pending', pendingOperation: operation.id, operationId: operation.id, needsReview: true };
  const configured = childConfig(store);
  if (configured && configured.id !== row.id) {
    const updated = writeMetadata(store, operation, { needsReview: true });
    return { ...operationResult({ ...operation, metadata: updated }), operationId: operation.id, needsReview: true };
  }
  try {
    if (!configured) store.putSetting('app', 'child', { id: row.id, slug: row.slug, dueDate });
    store.finishOperation(operation.id, 'saved', `children:${row.id}`);
  } catch { return { status: 'pending', pendingOperation: operation.id, operationId: operation.id, needsReview: true }; }
  return { ...operationResult(store.getOperation(operation.id)!), operationId: operation.id };
}

async function recoverChildOperation(store: Store, sessions: Sessions, session: Session, operation: Operation): Promise<Record<string, unknown>> {
  const request = isRecord(operation.requestBody) ? operation.requestBody : {};
  const input = isRecord(request.babyBuddy) ? request.babyBuddy : {};
  const dueDate = isDate(request.dueDate) ? request.dueDate : null;
  const metadata = isRecord(operation.metadata) ? operation.metadata : {};
  const baseline = metadata.baselineIds;
  requirePermission(store, session, 'children', 'view');
  requirePermission(store, session, 'children', 'add');
  if (!Array.isArray(baseline)) {
    if (metadata.attempted === false) {
      store.finishOperation(operation.id, 'failed');
      return { status: 'failed', operationId: operation.id, error: 'Child setup stopped before its baseline could be checked. Start a new setup.' };
    }
    return { ...operationResult(operation), operationId: operation.id, needsReview: true };
  }
  const configured = childConfig(store);
  if (configured) {
    const byId = Number(configured.id);
    const row = await sessions.request(session.sessionId, { resource: 'children', method: 'GET', id: configured.slug });
    if (isRecord(row) && Number(row.id) === byId && matchesWrite(input, row)) {
      store.finishOperation(operation.id, 'saved', `children:${byId}`);
      return { ...operationResult(store.getOperation(operation.id)!), operationId: operation.id };
    }
    return { ...operationResult(operation), operationId: operation.id, needsReview: true };
  }
  const candidates = (await childrenNamed(sessions, session, String(input.first_name || '')))
    .filter(row => Number.isSafeInteger(row.id) && !baseline.includes(String(row.id)) && matchesWrite(input, row));
  if (candidates.length === 1) return saveChildLink(store, operation, candidates[0], dueDate);
  if (metadata.attempted !== false || candidates.length > 1) {
    const updated = writeMetadata(store, operation, { needsReview: true });
    return { ...operationResult({ ...operation, metadata: updated }), operationId: operation.id, needsReview: true };
  }
  const latest = store.getOperation(operation.id), latestMetadata = latest && isRecord(latest.metadata) ? latest.metadata : {};
  if (!latest || latest.state !== 'pending' || latestMetadata.attempted !== false) return { status: 'pending', pendingOperation: operation.id, operationId: operation.id, needsReview: true };
  writeMetadata(store, operation, { attempted: true });
  let created: unknown;
  try { created = await sessions.request(session.sessionId, { resource: 'children', method: 'POST', body: input }); }
  catch { return { status: 'pending', pendingOperation: operation.id, operationId: operation.id, needsReview: true }; }
  if (!isRecord(created) || !Number.isSafeInteger(created.id) || typeof created.slug !== 'string' || !matchesWrite(input, created)) return { status: 'pending', pendingOperation: operation.id, operationId: operation.id, needsReview: true };
  return saveChildLink(store, operation, created, dueDate);
}

function recoverLocalEvent(store: Store, session: Session, operation: Operation, input: Record<string, unknown>, childId: number): Record<string, unknown> | null {
  const by = operationBy(operation, session.adult);
  const local = isRecord(input.local) ? input.local : null;
  const localRow = store.getAppEvent(operation.id);
  if (local) {
    const details = localRow && isRecord(localRow.details) ? localRow.details : null;
    if (details && Number(details.childId) === childId) {
      store.finishOperation(operation.id, 'saved', `app:${operation.id}`);
      return operationResult(store.getOperation(operation.id)!);
    }
    if (!localRow) {
      const entry = isRecord(local.details.entry) ? { ...local.details.entry, id: `app:${operation.id}`, by } : null;
      if (!entry || typeof local.kind !== 'string' || typeof local.occurredAt !== 'string') return operationResult(operation);
      store.putAppEvent({ id: operation.id, adult: by, kind: local.kind, occurredAt: local.occurredAt, details: { ...local.details, childId, entry } });
      store.finishOperation(operation.id, 'saved', `app:${operation.id}`);
      return operationResult(store.getOperation(operation.id)!);
    }
  }
  if (localRow && localRow.kind === 'feeding-overlap') {
    const details = isRecord(localRow.details) ? localRow.details : {};
    if (Number(details.childId) === childId && stable(details.event) === stable(input.event)) {
      store.finishOperation(operation.id, 'saved', `app:${operation.id}`);
      return operationResult(store.getOperation(operation.id)!);
    }
  }
  return null;
}

async function recoverEventOperation(store: Store, sessions: Sessions, session: Session, operation: Operation): Promise<Record<string, unknown>> {
  const input = isRecord(operation.requestBody) ? operation.requestBody : {};
  const config = childConfig(store);
  if (!config) return operationResult(operation);
  const local = recoverLocalEvent(store, session, operation, input, config.id);
  if (local) return local;
  const writes = Array.isArray(input.writes) ? input.writes.filter(isRecord) : [];
  const metadata = Array.isArray(operation.metadata) ? operation.metadata : [];
  if (!writes.length || metadata.length !== writes.length) return operationResult(operation);
  const ids = [...operation.babyBuddyIds];
  for (let index = 0; index < writes.length; index++) {
    const write = writes[index], resource = String(write.resource), prefix = `${resource}:`;
    if (ids.some(id => id.startsWith(prefix))) continue;
    const savedMeta = isRecord(metadata[index]) ? metadata[index] : {};
    const baseline = savedMeta.baselineIds;
    if (!Array.isArray(baseline) || !isRecord(write.body)) return operationResult(operation);
    let rows: Record<string, unknown>[];
    try { rows = await allChildRows(sessions, session, resource, config.id, windowQuery(resource, write.body)); }
    catch { return operationResult(store.getOperation(operation.id)!); }
    const candidates = rows.filter(row => Number.isSafeInteger(row.id) && childIdOf(row) === config.id && !baseline.includes(String(row.id)) && !store.getEventMetadata(resource, String(row.id)) && matchesWrite(write.body as Record<string, unknown>, row));
    if (candidates.length > 1) return operationResult(store.getOperation(operation.id)!);
    let row: Record<string, unknown>;
    if (candidates.length === 1) row = candidates[0];
    else {
      if (savedMeta.attempted !== false) return operationResult(store.getOperation(operation.id)!);
      const updated = metadata.map((item, position) => position === index ? { ...savedMeta, attempted: true } : item);
      store.updateUnresolvedOperationMetadata(operation.id, updated);
      try {
        const created = await sessions.request(session.sessionId, { resource, method: 'POST', body: write.body });
        if (!isRecord(created) || !Number.isSafeInteger(created.id) || childIdOf(created) !== config.id || !matchesWrite(write.body as Record<string, unknown>, created)) return operationResult(store.getOperation(operation.id)!);
        row = created;
      } catch { return operationResult(store.getOperation(operation.id)!); }
    }
    const linkedId = `${resource}:${row.id}`;
    const { baselineIds: _baselineIds, ...eventMeta } = savedMeta;
    store.putEventMetadata({ resource, babyBuddyId: String(row.id), adult: operationBy(operation, session.adult), metadata: { ...eventMeta, childId: config.id } });
    ids.push(linkedId);
    const complete = writes.every(candidate => ids.some(id => id.startsWith(`${String(candidate.resource)}:`)));
    store.finishOperation(operation.id, complete ? 'saved' : 'finishing', linkedId, ids);
  }
  return operationResult(store.getOperation(operation.id)!);
}

async function recoverUpdateOperation(store: Store, sessions: Sessions, session: Session, operation: Operation): Promise<Record<string, unknown>> {
  const intent = isRecord(operation.intent) ? operation.intent : {}, input = isRecord(operation.requestBody) ? operation.requestBody : {};
  const config = childConfig(store), target = typeof intent.target === 'string' ? intent.target : '';
  if (!config || !isRecord(input.write)) return operationResult(operation);
  const parsed = parseRecordId(target), write = input.write;
  requirePermission(store, session, parsed.resource, 'view');
  requirePermission(store, session, parsed.resource, 'change');
  let row: unknown;
  try { row = await sessions.request(session.sessionId, { resource: parsed.resource, method: 'GET', id: parsed.id }); }
  catch { return operationResult(operation); }
  if (!isRecord(row) || childIdOf(row) !== config.id || !isRecord(write.body)) return markNeedsReview(store, operation);
  if (!matchesWrite(write.body, row)) {
    const before = input.before;
    if (!isRecord(before) || stable(before) !== stable(row)) return markNeedsReview(store, operation);
    writeMetadata(store, operation, { attempted: true });
    try {
      row = await sessions.request(session.sessionId, { resource: parsed.resource, method: 'PATCH', id: parsed.id, body: write.body });
    } catch (error) {
      if (knownFailure(status(error))) { store.finishOperation(operation.id, 'failed'); throw await periodRefusal(sessions, session, error, parsed.resource, write.body, `${parsed.resource}:${parsed.id}`); }
      return operationResult(store.getOperation(operation.id)!);
    }
    if (!isRecord(row) || childIdOf(row) !== config.id || !matchesWrite(write.body, row)) return operationResult(store.getOperation(operation.id)!);
  }
  const saved = store.getEventMetadata(parsed.resource, parsed.id);
  store.putEventMetadata({ resource: parsed.resource, babyBuddyId: parsed.id, adult: operationBy(operation, saved?.adult || session.adult), metadata: { ...appMetadata(write.metadata), childId: config.id } });
  store.finishOperation(operation.id, 'saved', target);
  return operationResult(store.getOperation(operation.id)!);
}

async function recoverDeleteOperation(store: Store, sessions: Sessions, session: Session, operation: Operation): Promise<Record<string, unknown>> {
  const intent = isRecord(operation.intent) ? operation.intent : {}, target = typeof intent.target === 'string' ? intent.target : '';
  const parsed = parseRecordId(target), config = childConfig(store);
  requirePermission(store, session, parsed.resource, 'view');
  requirePermission(store, session, parsed.resource, 'delete');
  try {
    const row = await sessions.request(session.sessionId, { resource: parsed.resource, method: 'GET', id: parsed.id });
    if (!isRecord(row) || !config || childIdOf(row) !== config.id) return markNeedsReview(store, operation);
    const metadata = isRecord(operation.metadata) ? operation.metadata : {};
    const retries = Number.isSafeInteger(metadata.retries) ? Number(metadata.retries) : 0;
    if (metadata.attempted === true && retries >= 1) return markNeedsReview(store, operation);
    writeMetadata(store, operation, { attempted: true, retries: metadata.attempted === true ? retries + 1 : retries });
    try {
      await sessions.request(session.sessionId, { resource: parsed.resource, method: 'DELETE', id: parsed.id });
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        store.deleteEventMetadata(parsed.resource, parsed.id);
        store.finishOperation(operation.id, 'saved', target);
        return operationResult(store.getOperation(operation.id)!);
      }
      return operationResult(store.getOperation(operation.id)!);
    }
    store.deleteEventMetadata(parsed.resource, parsed.id);
    store.finishOperation(operation.id, 'saved', target);
    return operationResult(store.getOperation(operation.id)!);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      store.deleteEventMetadata(parsed.resource, parsed.id);
      store.finishOperation(operation.id, 'saved', target);
      return operationResult(store.getOperation(operation.id)!);
    }
    return operationResult(operation);
  }
}

function markNeedsReview(store: Store, operation: Operation): Record<string, unknown> {
  const metadata = isRecord(operation.metadata) ? operation.metadata : {};
  if (metadata.needsReview !== true) store.updateUnresolvedOperationMetadata(operation.id, { ...metadata, needsReview: true });
  return operationResult(store.getOperation(operation.id)!);
}

async function recoverAppOperation(store: Store, session: Session, operation: Operation): Promise<Record<string, unknown>> {
  const intent = isRecord(operation.intent) ? operation.intent : {}, input = isRecord(operation.requestBody) ? operation.requestBody : {};
  const target = typeof intent.target === 'string' ? intent.target : '', key = target.startsWith('app:') ? target.slice(4) : '';
  const config = childConfig(store), childId = Number(input.childId);
  if (!config || childId !== config.id) return markNeedsReview(store, operation);
  const current = store.getAppEvent(key), details = current && isRecord(current.details) ? current.details : {};
  if (intent.action === 'delete') {
    if (!current) { store.finishOperation(operation.id, 'saved', target); return operationResult(store.getOperation(operation.id)!); }
    if (Number(details.childId) !== config.id) return markNeedsReview(store, operation);
    const before = isRecord(input.before) ? input.before : null, actual = isRecord(details.entry) ? details.entry : null;
    if (!before || !actual || stable(before) !== stable(actual)) return markNeedsReview(store, operation);
    requirePermission(store, session, localResource(current.kind), 'view');
    requirePermission(store, session, localResource(current.kind), 'delete');
    store.deleteAppEvent(key);
    store.finishOperation(operation.id, 'saved', target);
    return operationResult(store.getOperation(operation.id)!);
  }
  const expected = isRecord(input.entry) ? input.entry : null, actual = isRecord(details.entry) ? details.entry : null;
  if (!current || Number(details.childId) !== config.id || !expected || typeof input.kind !== 'string' || typeof input.occurredAt !== 'string') return markNeedsReview(store, operation);
  requirePermission(store, session, localResource(current.kind), 'view');
  requirePermission(store, session, localResource(current.kind), 'change');
  if (current && expected && actual && stable(actual) === stable(expected)) {
    store.finishOperation(operation.id, 'saved', target);
    return operationResult(store.getOperation(operation.id)!);
  }
  const before = isRecord(input.before) ? input.before : null;
  if (!before || !actual || stable(before) !== stable(actual)) return markNeedsReview(store, operation);
  store.putAppEvent({ id: key, adult: operationBy(operation, current.adult), kind: input.kind, occurredAt: input.occurredAt, details: { ...details, childId: config.id, entry: expected, event: input.event } });
  store.finishOperation(operation.id, 'saved', target);
  return operationResult(store.getOperation(operation.id)!);
}

function insideRange(row: Record<string, unknown>, range: Range): boolean {
  const value = row.start ?? row.time ?? row.date;
  if (typeof value !== 'string') return false;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDate(new Date(value));
  return day >= range.from && day < range.to;
}

function queryFor(resource: string, childId: number, range: Range, offset: number, extra: Record<string, string>): Record<string, string | number> {
  const query: Record<string, string | number> = { child: childId, ...extra, limit: PAGE_SIZE, offset };
  if (PERIOD_RESOURCES.has(resource)) {
    if (range.from !== NO_START) query.start_min = localMidnight(range.from);
    query.start_max = localMidnight(range.to);
  }
  if (POINT_RESOURCES.has(resource)) {
    query.date_min = localMidnight(range.from);
    query.date_max = localMidnight(range.to);
  }
  return query;
}

async function listRows(sessions: Sessions, session: Session, resource: string, childId: number, range: Range, extra: Record<string, string> = {}): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < PAGE_CAP; page++) {
    const response = await sessions.request(session.sessionId, { resource, method: 'GET', query: queryFor(resource, childId, range, page * PAGE_SIZE, extra) });
    const batch = Array.isArray(response) ? response : isRecord(response) && Array.isArray(response.results) ? response.results : null;
    if (!batch) throw new HttpError(502, 'Baby Buddy returned an invalid record list.');
    rows.push(...batch.filter(isRecord));
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new HttpError(413, 'This date range has too many records to load at once.');
}

function savedEventFromOperation(operation: Operation): string {
  return operation.babyBuddyIds[0] || operation.babyBuddyId || `app:${operation.id}`;
}

function entryForLocalEvent(record: { id: string; adult: string; occurredAt: string; details: unknown }, now: Date): Record<string, unknown> {
  const details = isRecord(record.details) ? record.details : {};
  const entry = isRecord(details.entry) ? details.entry : {};
  return { ...entry, t: relativeMinutes(record.occurredAt, now), id: `app:${record.id}`, by: record.adult };
}

function childView(row: Record<string, unknown>, dueDate: string | null) {
  const name = [row.first_name, row.last_name].filter(x => typeof x === 'string' && x.trim()).join(' ');
  return {
    id: row.id, slug: row.slug, name,
    birthDate: row.birth_date, birthTime: row.birth_time || null, dueDate,
    // The version tag changes with each new picture, so a phone never shows the last photo from its cache.
    portrait: row.picture ? `/api/child/portrait?v=${createHash('sha256').update(String(row.picture)).digest('hex').slice(0, 12)}` : null,
  };
}

function unitContract(store: Store): Parameters<typeof mapEvent>[3] {
  const value = store.getSetting('app', 'unitContract');
  return isRecord(value) ? value as Parameters<typeof mapEvent>[3] : null;
}

function appPeople(store: Store, me: string): unknown[] {
  const people = store.getSetting('app', 'people');
  return Array.isArray(people) ? people : [me];
}

function mappedResource(mapped: MappedEvent): string {
  return mapped.writes.length ? [...new Set(mapped.writes.map(item => item.resource))].join('+') : `app:${mapped.local?.kind || 'event'}`;
}

function toLocalEntry(event: Record<string, unknown>, now: Date, adult: string, id: string): Record<string, unknown> {
  const type = event.type === 'other' ? 'other' : String(event.type);
  const what = event.what;
  const time = event.start ?? event.time ?? event.t;
  const t = typeof time === 'number' ? time : relativeMinutes(String(time), now);
  // The browser sends minutes as `duration`; the timeline reads `dur`, so an overlap-kept feed would lose its length.
  const dur = event.dur ?? (typeof event.duration === 'number' ? event.duration : undefined);
  return { ...event, type, ...(what ? { what } : {}), ...(dur !== undefined ? { dur } : {}), t, id: `app:${id}`, by: adult };
}

function isOverlap(error: unknown): boolean {
  return isRecord(error) && error.status === 400 && error.code === 'period_intersection';
}

function canKeepOverlapLocal(mapped: MappedEvent): boolean {
  return mapped.writes.length === 1 && mapped.writes[0].resource === 'feedings' && ['feed', 'bottle', 'other'].includes(String(mapped.writes[0].metadata.appType));
}

function periodError(error: unknown): unknown {
  return isOverlap(error) ? new HttpError(400, 'This time overlaps another entry. Change the start or end.') : error;
}

// A refused period save is an overlap when a saved entry of the same kind crosses it. The saved list decides, not Baby
// Buddy's refusal text, which follows the account language. A sleep overlap names the saved sleeps it crosses.
// Returns the error to show: a different object than `error` only when the refusal is an overlap.
async function periodRefusal(sessions: Sessions, session: Session, error: unknown, resource: string, body: unknown, exclude?: string): Promise<unknown> {
  if (status(error) !== 400 || !PERIOD_RESOURCES.has(resource) || !isRecord(body) || typeof body.start !== 'string' || typeof body.end !== 'string') return periodError(error);
  const conflicts = await findConflicts(input => sessions.request(session.sessionId, input as Request), resource, Number(body.child), body.start, body.end, exclude);
  if (!conflicts?.length) return periodError(error);
  return resource === 'sleep' ? overlapError(conflicts) : new HttpError(400, 'This time overlaps another entry. Change the start or end.');
}

function samePeriod(row: unknown, expected: Record<string, unknown>): boolean {
  return isRecord(row) && ['start', 'end'].every(key => Math.abs(Date.parse(String(row[key])) - Date.parse(String(expected[key]))) < 1000);
}

function checkExpected(store: Store, operation: Operation, expected: unknown, row: Record<string, unknown>): void {
  if (!isRecord(expected) || !['start', 'end'].every(key => typeof expected[key] === 'string' && Number.isFinite(Date.parse(expected[key] as string)))) {
    store.finishOperation(operation.id, 'failed');
    throw new HttpError(400, 'Enter the loaded start and end.');
  }
  if (!samePeriod(row, expected)) {
    store.finishOperation(operation.id, 'failed');
    throw new HttpError(409, 'This entry changed on another phone. Close it and open it again.');
  }
}

function splitPermissions(store: Store, session: Session): void {
  for (const action of ['view', 'change', 'add']) requirePermission(store, session, 'sleep', action);
}

function failSplit(store: Store, operation: Operation): Record<string, unknown> {
  writeMetadata(store, operation, { error: isRecord(operation.metadata) && operation.metadata.error || 'The split was not saved. Nothing changed. Try again.' });
  store.finishOperation(operation.id, 'failed');
  return operationResult(store.getOperation(operation.id)!);
}

function finishSplit(store: Store, operation: Operation, second: Record<string, unknown>): Record<string, unknown> {
  const input = operation.requestBody as Record<string, any>, secondId = `sleep:${rowId(second)}`;
  // Store the ID before metadata: the creation check excludes rows with metadata.
  store.finishOperation(operation.id, 'finishing', String(input.id), [String(input.id), secondId]);
  if (!store.getEventMetadata('sleep', String(second.id))) store.putEventMetadata({ resource: 'sleep', babyBuddyId: String(second.id), adult: input.adult, metadata: { ...input.write.metadata, childId: input.write.body.child } });
  store.finishOperation(operation.id, 'saved');
  return operationResult(store.getOperation(operation.id)!);
}

async function splitRows(store: Store, sessions: Sessions, session: Session, operation: Operation) {
  const input = operation.requestBody as Record<string, any>, childId = input.write.body.child;
  const storedId = operation.babyBuddyIds.find(id => id !== input.id);
  async function read(id: string) {
    try { return await sessions.request(session.sessionId, { resource: 'sleep', method: 'GET', id: parseRecordId(id).id }); }
    catch (error) { if (status(error) === 404) return null; throw error; }
  }
  const first = await read(input.id);
  const candidates = storedId ? [await read(storedId)].filter(isRecord) : (await allChildRows(sessions, session, 'sleep', childId, windowQuery('sleep', input.write.body))).filter(row => !input.baselineIds.includes(String(row.id)) && !store.getEventMetadata('sleep', String(row.id)) && childIdOf(row) === childId && matchesWrite(input.write.body, row));
  const second = candidates[0];
  return { first, second, storedId, ambiguous: candidates.length > 1 };
}

async function restoreSplit(store: Store, sessions: Sessions, session: Session, operation: Operation): Promise<Record<string, unknown>> {
  const input = operation.requestBody as Record<string, any>;
  try {
    const restored = await sessions.request(session.sessionId, { resource: 'sleep', method: 'PATCH', id: parseRecordId(input.id).id, body: { end: input.before.end } });
    if (!samePeriod(restored, input.before)) return operationResult(operation);
    return failSplit(store, operation);
  } catch (error) {
    if (!knownFailure(status(error))) return operationResult(store.getOperation(operation.id)!);
    const rows = await splitRows(store, sessions, session, operation);
    if (!rows.storedId && !rows.ambiguous && samePeriod(rows.first, { start: input.before.start, end: input.split.wokeAt }) && isRecord(rows.second) && childIdOf(rows.second) === input.write.body.child && samePeriod(rows.second, input.write.body)) return finishSplit(store, operation, rows.second);
    return markNeedsReview(store, operation);
  }
}

async function recoverSplit(store: Store, sessions: Sessions, session: Session, operation: Operation, now: Date): Promise<Record<string, unknown>> {
  splitPermissions(store, session);
  const input = operation.requestBody as Record<string, any>, metadata = isRecord(operation.metadata) ? operation.metadata : {};
  const config = childConfig(store);
  if (metadata.needsReview) return operationResult(operation);
  if (!config || config.id !== input.write.body.child) return markNeedsReview(store, operation);
  const { first, second, storedId, ambiguous } = await splitRows(store, sessions, session, operation);
  if (!isRecord(first) || childIdOf(first) !== config.id || ambiguous) return markNeedsReview(store, operation);
  const shortened = samePeriod(first, { start: input.before.start, end: input.split.wokeAt });
  if (shortened && isRecord(second) && childIdOf(second) === config.id && samePeriod(second, input.write.body)) return finishSplit(store, operation, second);
  if (storedId || second) return markNeedsReview(store, operation);
  if (shortened) return restoreSplit(store, sessions, session, operation);
  if (!samePeriod(first, input.before)) return markNeedsReview(store, operation);
  // A late shortening PATCH can still arrive while the original sleep looks whole.
  if (typeof metadata.patchSentAt === 'number' && now.getTime() - metadata.patchSentAt < 120_000) return operationResult(operation);
  return failSplit(store, operation);
}

export function createRecords({ store, sessions, now = () => new Date() }: { store: Store; sessions: Sessions; now?: () => Date }) {
  const activeChildSetups = new Set<string>();
  function loggedBy(event: Record<string, unknown>, fallback: string): string {
    if (!Object.hasOwn(event, 'by')) return fallback;
    if (typeof event.by !== 'string' || !sessions.people?.().includes(event.by)) throw new HttpError(400, 'Choose who logged this.');
    return event.by;
  }
  function request(session: Session, input: Request): Promise<unknown> {
    return sessions.request(session.sessionId, input);
  }
  async function operation(session: Session, id: string, owner = session.adult): Promise<Record<string, unknown>> {
    const saved = store.getOperation(id);
    const childOperation = saved?.resource === 'children';
    const unresolved = saved && ['pending', 'finishing'].includes(saved.state);
    if (!saved || (!childOperation && saved.adult !== owner)) throw new HttpError(404, 'Save not found.');
    if (childOperation) { requirePermission(store, session, 'children', 'view'); requirePermission(store, session, 'children', 'add'); }
    if (!unresolved) {
      if (childOperation && saved.state === 'failed') return { status: 'failed', operationId: id, error: 'Child setup failed. Start a new setup.' };
      return { ...operationResult(saved), ...(childOperation ? { operationId: id } : {}) };
    }
    if (childOperation && activeChildSetups.has(id)) return { status: 'pending', pendingOperation: id, operationId: id };
    const intent = isRecord(saved.intent) ? saved.intent : {};
    try {
      if (intent.action === 'create-child') return await recoverChildOperation(store, sessions, session, saved);
      if (intent.action === 'create-event') return await recoverEventOperation(store, sessions, session, saved);
      if (intent.action === 'split-sleep') return await recoverSplit(store, sessions, session, saved, now());
      if (saved.resource === 'update-app-event' || saved.resource === 'delete-app-event') return await recoverAppOperation(store, session, saved);
      if (saved.resource.startsWith('update:')) return await recoverUpdateOperation(store, sessions, session, saved);
      if (saved.resource.startsWith('delete:')) return await recoverDeleteOperation(store, sessions, session, saved);
      return operationResult(saved);
    } catch { return { ...operationResult(store.getOperation(id) || saved), ...(childOperation ? { operationId: id } : {}) }; }
  }
  async function growth(session: Session) {
    requirePermission(store, session, 'children', 'view');
    const config = childConfig(store), entries: Record<string, unknown>[] = [], unavailable: string[] = [];
    if (!config) return { entries, unavailable };
    const child = await request(session, { resource: 'children', method: 'GET', id: config.slug });
    if (!isRecord(child) || Number(child.id) !== config.id) throw new HttpError(409, 'The saved child link does not match Baby Buddy.');
    const current = now(), today = localDate(current), range = { from: NO_START, to: shiftDate(today, 1) }, seen = new Set<string>();
    for (const resource of ['weight', 'height', 'head-circumference']) {
      if (!hasPermission(store, session, resource, 'view')) { unavailable.push(resource); continue; }
      let rows;
      try { rows = await listRows(sessions, session, resource, config.id, range); }
      catch (error) { if (status(error) !== 403) throw error; unavailable.push(resource); continue; }
      for (const row of rows) {
        if (childIdOf(row) !== config.id) continue;
        if (!isDate(row.date)) throw new HttpError(502, 'A growth measurement has an invalid date.');
        const id = `${resource}:${row.id}`;
        if (row.date > today || seen.has(id)) continue;
        seen.add(id);
        const metadata = store.getEventMetadata(resource, String(row.id));
        const details = isRecord(metadata?.metadata) ? metadata.metadata : null;
        entries.push({ ...mapBabyBuddyRecord(resource, row, details, current, metadata?.adult || 'Unknown'), date: row.date });
      }
    }
    entries.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    return { entries, unavailable, childId: config.id };
  }
  async function foods(session: Session) {
    requirePermission(store, session, 'children', 'view');
    const config = childConfig(store), entries: Record<string, unknown>[] = [], unavailable: string[] = [];
    if (!config) return { entries, unavailable };
    const child = await request(session, { resource: 'children', method: 'GET', id: config.slug });
    if (!isRecord(child) || Number(child.id) !== config.id) throw new HttpError(409, 'The saved child link does not match Baby Buddy.');
    if (!hasPermission(store, session, 'feedings', 'view')) return { entries, unavailable: ['feedings'] };
    const current = now(), range = { from: NO_START, to: shiftDate(localDate(current), 1) };
    let rows;
    try { rows = await listRows(sessions, session, 'feedings', config.id, range, { type: 'solid food' }); }
    catch (error) { if (status(error) !== 403) throw error; return { entries, unavailable: ['feedings'] }; }
    const seen = new Set<string>();
    for (const row of rows) {
      if (childIdOf(row) !== config.id || row.type !== 'solid food' || seen.has(String(row.id))) continue;
      seen.add(String(row.id));
      const metadata = store.getEventMetadata('feedings', String(row.id));
      const details = isRecord(metadata?.metadata) ? metadata.metadata : null;
      entries.push(mapBabyBuddyRecord('feedings', row, details, current, metadata?.adult || 'Unknown'));
    }
    // Overlapping meals use the existing local feeding fallback and retain the same metadata.
    for (const local of store.listAppEvents('0001-01-01T00:00:00.000Z', current.toISOString())) {
      const details = isRecord(local.details) ? local.details : {};
      if (local.kind !== 'feeding-overlap' || Number(details.childId) !== config.id) continue;
      const entry = entryForLocalEvent(local, current);
      if (entry.type === 'other' && entry.what === 'solids') entries.push({...entry, startISO: local.occurredAt});
    }
    entries.sort((a, b) => Number(a.t) - Number(b.t));
    return { entries, unavailable };
  }
  async function state(session: Session, inputRange?: Range) {
    const current = now(), today = localDate(current), range = validRange(inputRange, current);
    const storedSession = store.getSession(session.sessionId);
    const preferences = storedSession ? store.getSetting(`user:${storedSession.babyBuddyUserId}`, 'preferences') : null;
    const people = appPeople(store, session.adult);
    const resources = Object.fromEntries([...ALL_RESOURCES, 'children', 'timers'].map(resource => [resource, resourcePermissions(store, session, resource)]));
    const permissions = { canStopOtherAdultsTimers: storedSession ? store.getSetting(`user:${storedSession.babyBuddyUserId}`, 'timerDeletePermission') === true : false, resources };
    const base = { me: session.adult, people, child: null, entries: [] as Record<string, unknown>[], upcomingAppointments: [] as Record<string, unknown>[], run: null, sleepRun: null, preferences: isRecord(preferences) ? preferences : {}, today, permissions };
    const config = childConfig(store);
    if (!config) {
      const pending = store.pendingOperations().find(operation => operation.resource === 'children' && childIdentity(operation));
      if (!pending || !permissions.resources.children.view || !permissions.resources.children.add) return { ...base, pendingChildSetup: null };
      const body = isRecord(pending.requestBody) ? pending.requestBody : {}, input = isRecord(body.babyBuddy) ? body.babyBuddy : {}, metadata = isRecord(pending.metadata) ? pending.metadata : {};
      return { ...base, pendingChildSetup: { operationId: pending.id, status: 'pending', firstName: input.first_name, birthDate: input.birth_date, dueDate: body.dueDate || '', ...(metadata.needsReview === true ? { needsReview: true } : {}), shared: true } };
    }
    requirePermission(store, session, 'children', 'view');
    const childResponse = await request(session, { resource: 'children', method: 'GET', id: config.slug });
    if (!isRecord(childResponse) || Number(childResponse.id) !== config.id) throw new HttpError(409, 'The saved child link does not match Baby Buddy.');
    const child = childView(childResponse, config.dueDate);
    const rowsByResource = await Promise.all(ALL_RESOURCES.map(async resource => {
      if (!permissions.resources[resource].view) return [resource, null] as const;
      try { return [resource, await listRows(sessions, session, resource, config.id, range)] as const; }
      catch (error) {
        if (status(error) === 403) { permissions.resources[resource].view = false; return [resource, null] as const; }
        throw error;
      }
    }));
    const entries: Record<string, unknown>[] = [];
    for (const [resource, rows] of rowsByResource) {
      if (!rows) continue;
      for (const row of rows) {
        if (childIdOf(row) !== config.id || !insideRange(row, range)) continue;
        const metadata = store.getEventMetadata(resource, String(row.id));
        const details = isRecord(metadata?.metadata) ? { ...metadata.metadata, adult: metadata.adult } : null;
        entries.push(mapBabyBuddyRecord(resource, row, details, current, metadata?.adult || 'Unknown'));
      }
    }
    const localFrom = localMidnight(range.from), localTo = localMidnight(range.to);
    for (const local of store.listAppEvents(localFrom, localTo)) {
      const details = isRecord(local.details) ? local.details : {};
      if (Number(details.childId) !== config.id || !['bath', 'tummy', 'appointment', 'feeding-overlap'].includes(local.kind) || !permissions.resources[localResource(local.kind)].view) continue;
      entries.push(entryForLocalEvent(local, current));
    }
    entries.sort((a, b) => Number(a.t) - Number(b.t));
    const upcomingAppointments = permissions.resources.notes.view
      ? (await store.listAppEvents(current.toISOString(), '9999-12-31T23:59:59.999Z')).filter(local => local.kind === 'appointment' && Number((isRecord(local.details) ? local.details.childId : null)) === config.id).slice(0, 10).map(local => entryForLocalEvent(local, current))
      : [];
    return { ...base, child, entries, upcomingAppointments };
  }

  async function createChild(session: Session, payload: Record<string, unknown>) {
    const operationId = requireOperationId(payload.operationId), firstName = payload.firstName;
    if (typeof firstName !== 'string' || !firstName.trim() || firstName.trim().length > 255) throw new HttpError(400, 'Enter the baby’s first name, up to 255 characters.');
    const today = localDate(now()), earliest = localDate(new Date(now().getTime() - 3 * 366 * 86_400_000));
    if (!isDate(payload.birthDate) || payload.birthDate > today || payload.birthDate < earliest) throw new HttpError(400, 'Enter a birth date from the last 3 years, not in the future.');
    if (payload.dueDate !== '' && payload.dueDate != null && !isDate(payload.dueDate)) throw new HttpError(400, 'Enter a valid due date.');
    const babyBuddyBody = { first_name: firstName.trim(), last_name: '', birth_date: payload.birthDate };
    const requestBody = { babyBuddy: babyBuddyBody, dueDate: payload.dueDate || null };
    const existing = store.getOperation(operationId);
    if (existing) {
      if (childIdentity(existing) !== `${babyBuddyBody.first_name.toLocaleLowerCase()}|${payload.birthDate}`) throw new HttpError(409, 'This save ID already has different data.');
      requirePermission(store, session, 'children', 'view');
      requirePermission(store, session, 'children', 'add');
      return operation(session, operationId);
    }
    if (childConfig(store)) throw new HttpError(409, 'A child is already set up.');
    requirePermission(store, session, 'children', 'view');
    requirePermission(store, session, 'children', 'add');
    const pendingChild = store.pendingOperations().find(operation => operation.resource === 'children');
    if (pendingChild) {
      requirePermission(store, session, 'children', 'view');
      requirePermission(store, session, 'children', 'add');
      if (childIdentity(pendingChild) !== `${babyBuddyBody.first_name.toLocaleLowerCase()}|${payload.birthDate}`) throw new HttpError(409, 'A different child setup is already being checked. Review it before starting another.');
      return operation(session, pendingChild.id);
    }
    const record = begin(store, { id: operationId, adult: session.adult, resource: 'children', intent: { action: 'create-child' }, requestBody, metadata: { baselineIds: null, attempted: false } });
    if (!record.created) return operation(session, operationId);
    activeChildSetups.add(operationId);
    try {
      let baseline: string[];
      try { baseline = (await childrenNamed(sessions, session, babyBuddyBody.first_name)).map(row => String(row.id)); }
      catch { store.finishOperation(operationId, 'failed'); return { status: 'failed', operationId, error: 'Could not check existing children. Start a new setup.' }; }
      if (childConfig(store)) { const metadata = writeMetadata(store, record.operation, { needsReview: true }); return { ...operationResult({ ...record.operation, metadata }), operationId }; }
      writeMetadata(store, record.operation, { baselineIds: baseline, attempted: false });
      writeMetadata(store, record.operation, { attempted: true });
      let row: unknown;
      try { row = await request(session, { resource: 'children', method: 'POST', body: babyBuddyBody }); }
      catch (error) { if (knownFailure(status(error))) { store.finishOperation(operationId, 'failed'); throw error; } return { status: 'pending', pendingOperation: operationId, operationId, needsReview: true }; }
      if (!isRecord(row) || !Number.isSafeInteger(row.id) || typeof row.slug !== 'string' || !matchesWrite(babyBuddyBody, row)) return { status: 'pending', pendingOperation: operationId, operationId, needsReview: true };
      return saveChildLink(store, record.operation, row, requestBody.dueDate);
    } finally { activeChildSetups.delete(operationId); }
  }

  // `owner` is set only by the timer service, which saves a stop for the adult who made it; it is never read from the request.
  async function createEvent(session: Session, payload: Payload, owner = session.adult) {
    const operationId = requireOperationId(payload.operationId), event = payload.event;
    if (!isRecord(event)) throw new HttpError(400, 'Enter an event.');
    const config = childConfig(store);
    if (!config) throw new HttpError(409, 'Set up the child before saving events.');
    if (event.what === 'appointment' || event.what === 'visit') requirePermission(store, session, 'children', 'view');
    const current = now(), mapped = mapEvent(event, config.id, current, unitContract(store));
    if (event.type === 'growth' && event.recumbent === true && mapped.writes.some(item => item.resource === 'weight')) {
      for (const item of mapped.writes.filter(item => item.resource === 'height' || item.resource === 'weight')) {
        item.metadata.growthPair = operationId;
        item.metadata.recumbent = item.resource === 'height';
      }
    }
    const by = loggedBy(event, owner), body = { event, writes: mapped.writes, local: mapped.local || null, by };
    const resource = mappedResource(mapped), existing = store.getOperation(operationId);
    if (existing) {
      const oldBody = isRecord(existing.requestBody) ? existing.requestBody : {};
      if (existing.adult !== owner || existing.resource !== resource || stable(oldBody.event) !== stable(event)) throw new HttpError(409, 'This save ID already has different data.');
      return operation(session, operationId, owner);
    }
    const permissionResources = mapped.writes.map(write => write.resource);
    if (mapped.local) permissionResources.push(localResource(mapped.local.kind));
    for (const item of [...new Set(permissionResources)]) requirePermission(store, session, item, 'add');
    if (mapped.local) requirePermission(store, session, localResource(mapped.local.kind), 'view');
    const metadata: Record<string, unknown>[] = [];
    for (const item of mapped.writes) {
      requirePermission(store, session, item.resource, 'view');
      const baseline = (await allChildRows(sessions, session, item.resource, config.id, windowQuery(item.resource, item.body))).map(row => String(row.id));
      metadata.push({ ...item.metadata, childId: config.id, baselineIds: baseline, attempted: false });
    }
    if (pendingDuplicate(store, resource, event)) throw new HttpError(409, 'A matching save is still being checked.');
    const record = begin(store, { id: operationId, adult: owner, resource, intent: { action: 'create-event', type: event.type, what: event.what || null }, requestBody: body, metadata });
    if (!record.created) return operation(session, operationId, owner);
    if (mapped.local) {
      const entry = { ...mapped.local.details.entry as Record<string, unknown>, id: `app:${operationId}`, by };
      try {
        store.putAppEvent({ id: operationId, adult: by, kind: mapped.local.kind, occurredAt: mapped.local.occurredAt, details: { ...mapped.local.details, childId: config.id, entry } });
        store.finishOperation(operationId, 'saved', `app:${operationId}`);
        return { status: 'saved', id: `app:${operationId}` };
      } catch { return { status: 'pending', pendingOperation: operationId }; }
    }
    return saveMapped(session, operationId, mapped, event, config.id, current);
  }

  async function updateLocalEvent(session: Session, id: string, operationId: string, event: Record<string, unknown>, childId: number) {
      const key = id.slice(4), currentLocal = store.getAppEvent(key), details = currentLocal && isRecord(currentLocal.details) ? currentLocal.details : {};
      if (!currentLocal || Number(details.childId) !== childId) throw new HttpError(404, 'Event not found.');
      if (currentLocal.kind === 'appointment') requirePermission(store, session, 'children', 'view');
      requirePermission(store, session, localResource(currentLocal.kind), 'view');
      requirePermission(store, session, localResource(currentLocal.kind), 'change');
      const by = loggedBy(event, currentLocal.adult);
      const current = now(), mapped = mapEvent(event, childId, current, unitContract(store));
      const overlapEdit = currentLocal.kind === 'feeding-overlap' && canKeepOverlapLocal(mapped);
      if ((!mapped.local && !overlapEdit) || (mapped.writes.length && !overlapEdit)) throw new HttpError(409, 'This event cannot be changed into that type.');
      const newEntry = mapped.local?.details.entry as Record<string, unknown> | undefined;
      const entry = { ...(newEntry || toLocalEntry(event, current, by, key)), id, by };
      if (currentLocal.kind === 'feeding-overlap' && isRecord(details.entry) && details.entry.sid) entry.sid = details.entry.sid;
      const occurredAt = mapped.local?.occurredAt || eventTimestamp(event, current);
      const requestBody = { id, event, entry, before: details.entry, childId, kind: currentLocal.kind === 'feeding-overlap' ? currentLocal.kind : mapped.local?.kind || currentLocal.kind, occurredAt, by };
      const record = begin(store, { id: operationId, adult: session.adult, resource: 'update-app-event', intent: { action: 'update', target: id }, requestBody, metadata: {} });
      if (!record.created) return operationResult(record.operation);
      try {
        store.putAppEvent({ id: key, adult: by, kind: requestBody.kind, occurredAt, details: { ...details, childId, entry, event } });
        store.finishOperation(operationId, 'saved', id);
        return { status: 'saved', id };
      } catch { return { status: 'pending', pendingOperation: operationId }; }
  }

  async function updateBabyBuddyEvent(session: Session, id: string, operationId: string, event: Record<string, unknown>, childId: number) {
    const parsed = parseRecordId(id);
    requirePermission(store, session, parsed.resource, 'view');
    requirePermission(store, session, parsed.resource, 'change');
    if (event.what === 'visit') requirePermission(store, session, 'children', 'view');
    const currentRow = await request(session, { resource: parsed.resource, method: 'GET', id: parsed.id });
    if (!isRecord(currentRow) || childIdOf(currentRow) !== childId) throw new HttpError(404, 'Event not found.');
    const mapped = mapEvent(event, childId, now(), unitContract(store));
    if (mapped.local || mapped.writes.length !== 1 || mapped.writes[0].resource !== parsed.resource) throw new HttpError(409, 'This event cannot be changed into that type.');
    if (event.removePhoto === true && parsed.resource !== 'notes') throw new HttpError(400, 'Only a note photo can be removed.');
    const write = event.removePhoto === true ? { ...mapped.writes[0], body: { ...mapped.writes[0].body, image: null } } : mapped.writes[0];
    const metadata = store.getEventMetadata(parsed.resource, parsed.id), by = loggedBy(event, metadata?.adult || session.adult), requestBody = { id, event, write, before: currentRow, by };
    // Editing one part must not split a feeding session in the counts.
    if (parsed.resource === 'feedings' && isRecord(metadata?.metadata) && metadata.metadata.sessionId) write.metadata.sessionId = metadata.metadata.sessionId;
    if (event.type === 'growth' && isRecord(metadata?.metadata) && metadata.metadata.growthPair) {
      write.metadata.growthPair = metadata.metadata.growthPair;
      write.metadata.recumbent = metadata.metadata.recumbent === true;
    }
    const record = begin(store, { id: operationId, adult: session.adult, resource: `update:${parsed.resource}`, intent: { action: 'update', target: id }, requestBody, metadata: { attempted: false } });
    if (!record.created) return operationResult(record.operation);
    if (['sleep', 'feed', 'bottle', 'pump'].includes(String(event.type)) && Object.hasOwn(event, 'expected')) checkExpected(store, record.operation, event.expected, currentRow);
    try {
      writeMetadata(store, record.operation, { attempted: true });
      const saved = await request(session, { resource: parsed.resource, method: 'PATCH', id: parsed.id, body: write.body });
      if (!isRecord(saved) || childIdOf(saved) !== childId || !matchesWrite(write.body, saved)) return { status: 'pending', pendingOperation: operationId };
      store.putEventMetadata({ resource: parsed.resource, babyBuddyId: parsed.id, adult: by, metadata: { ...write.metadata, childId } });
      store.finishOperation(operationId, 'saved', id);
      return { status: 'saved', id };
    } catch (error) {
      if (knownFailure(status(error))) { store.finishOperation(operationId, 'failed'); throw await periodRefusal(sessions, session, error, parsed.resource, write.body, id); }
      return { status: 'pending', pendingOperation: operationId };
    }
  }

  async function splitEvent(session: Session, id: string, payload: { operationId: string; split?: Record<string, unknown> }) {
    const operationId = requireOperationId(payload.operationId);
    let split = payload.split;
    if (!isRecord(split) || !id.startsWith('sleep:')) throw new HttpError(400, 'Only a saved sleep can be split.');
    const parsed = parseRecordId(id), config = childConfig(store);
    splitPermissions(store, session);
    split = { ...split, wokeAt: instant(split.wokeAt).toISOString(), sleptAt: instant(split.sleptAt).toISOString() };
    if (!config) throw new HttpError(409, 'Set up the child before editing events.');
    const prior = store.getOperation(operationId);
    if (prior) {
      const input = prior.requestBody as Record<string, unknown>;
      if (prior.adult !== session.adult || !isRecord(prior.intent) || prior.intent.action !== 'split-sleep' || input.id !== id || stable(input.split) !== stable(split)) throw new HttpError(409, 'This save ID already has different data.');
      return operation(session, operationId);
    }
    const before = await request(session, { resource: 'sleep', method: 'GET', id: parsed.id });
    if (!isRecord(before) || childIdOf(before) !== config.id) throw new HttpError(404, 'Event not found.');
    const wokeAt = Date.parse(String(split.wokeAt)), sleptAt = Date.parse(String(split.sleptAt));
    if (!(Date.parse(String(before.start)) < wokeAt && wokeAt < sleptAt && sleptAt < Date.parse(String(before.end)))) throw new HttpError(400, 'Choose wake and sleep times inside this sleep, in that order.');
    const write = mapEvent({ type: 'sleep', start: split.sleptAt, end: before.end, nap: before.nap, note: '' }, config.id, now(), unitContract(store)).writes[0];
    const baselineIds = (await allChildRows(sessions, session, 'sleep', config.id, windowQuery('sleep', write.body))).map(row => String(row.id));
    const adult = store.getEventMetadata('sleep', parsed.id)?.adult || session.adult;
    const record = begin(store, { id: operationId, adult: session.adult, resource: 'split:sleep', intent: { action: 'split-sleep', target: id }, requestBody: { id, split, before, write, baselineIds, adult }, metadata: {} });
    if (!record.created) return operationResult(record.operation);
    checkExpected(store, record.operation, split.expected, before);
    return sendSplit(session, record.operation);
  }

  async function sendSplit(session: Session, operation: Operation): Promise<Record<string, unknown>> {
    const input = operation.requestBody as Record<string, any>;
    let shortened = false;
    try {
      writeMetadata(store, operation, { patchSentAt: now().getTime() });
      const first = await request(session, { resource: 'sleep', method: 'PATCH', id: parseRecordId(input.id).id, body: { end: input.split.wokeAt } });
      if (!samePeriod(first, { start: input.before.start, end: input.split.wokeAt })) return operationResult(store.getOperation(operation.id)!);
      shortened = true;
      const second = await request(session, { resource: 'sleep', method: 'POST', body: input.write.body });
      if (!isRecord(second) || childIdOf(second) !== input.write.body.child || !matchesWrite(input.write.body, second)) return operationResult(store.getOperation(operation.id)!);
      return finishSplit(store, operation, second);
    } catch (error) {
      if (!knownFailure(status(error))) return operationResult(store.getOperation(operation.id)!);
      const refusal = shortened ? await periodRefusal(sessions, session, error, 'sleep', input.write.body) : periodError(error);
      writeMetadata(store, operation, { error: (refusal as Error).message });
      if (shortened) return recoverSplit(store, sessions, session, store.getOperation(operation.id)!, now());
      failSplit(store, store.getOperation(operation.id)!);
      throw refusal;
    }
  }

  async function updateEvent(session: Session, id: string, payload: Payload) {
    const operationId = requireOperationId(payload.operationId);
    let event = payload.event;
    if (!isRecord(event)) throw new HttpError(400, 'Enter an event.');
    if (id.startsWith('app:')) { const { expected: _expected, ...localEvent } = event; event = localEvent; }
    const config = childConfig(store);
    if (!config) throw new HttpError(409, 'Set up the child before editing events.');
    const prior = store.getOperation(operationId);
    if (prior) {
      const oldBody = isRecord(prior.requestBody) ? prior.requestBody : {};
      const resource = id.startsWith('app:') ? 'update-app-event' : `update:${parseRecordId(id).resource}`;
      const target = isRecord(prior.intent) ? prior.intent.target : null;
      if (prior.adult !== session.adult || prior.resource !== resource || target !== id || stable(oldBody.event) !== stable(event)) throw new HttpError(409, 'This save ID already has different data.');
      return operation(session, operationId);
    }
    return id.startsWith('app:') ? updateLocalEvent(session, id, operationId, event, config.id) : updateBabyBuddyEvent(session, id, operationId, event, config.id);
  }

  async function deleteEvent(session: Session, id: string, payload: { operationId: string }) {
    const operationId = requireOperationId(payload.operationId), config = childConfig(store);
    if (!config) throw new HttpError(409, 'Set up the child before deleting events.');
    const prior = store.getOperation(operationId);
    if (prior) {
      const expectedResource = id.startsWith('app:') ? 'delete-app-event' : `delete:${parseRecordId(id).resource}`;
      const target = isRecord(prior.intent) ? prior.intent.target : null;
      if (prior.adult !== session.adult || prior.resource !== expectedResource || target !== id) throw new HttpError(409, 'This save ID already has different data.');
      return operation(session, operationId);
    }
    if (id.startsWith('app:')) {
      const local = store.getAppEvent(id.slice(4));
      requireLocalDeletePermissions(store, session, local);
      const localDetails = local && isRecord(local.details) ? local.details : {};
      const record = begin(store, { id: operationId, adult: session.adult, resource: 'delete-app-event', intent: { action: 'delete', target: id }, requestBody: { id, childId: config.id, before: isRecord(localDetails.entry) ? localDetails.entry : null }, metadata: {} });
      if (!record.created) return operationResult(record.operation);
      const key = id.slice(4), currentLocal = store.getAppEvent(key), details = currentLocal && isRecord(currentLocal.details) ? currentLocal.details : {};
      if (!currentLocal || Number(details.childId) !== config.id) { store.finishOperation(operationId, 'failed'); throw new HttpError(404, 'Event not found.'); }
      try { store.deleteAppEvent(key); store.finishOperation(operationId, 'saved', id); return { status: 'saved', id }; }
      catch { return { status: 'pending', pendingOperation: operationId }; }
    }
    const parsed = parseRecordId(id);
    requirePermission(store, session, parsed.resource, 'view');
    requirePermission(store, session, parsed.resource, 'delete');
    const record = begin(store, { id: operationId, adult: session.adult, resource: `delete:${parsed.resource}`, intent: { action: 'delete', target: id }, requestBody: { id }, metadata: { attempted: false, retries: 0 } });
    if (!record.created) return operationResult(record.operation);
    let sentDelete = false;
    try {
      const row = await request(session, { resource: parsed.resource, method: 'GET', id: parsed.id });
      if (!isRecord(row) || childIdOf(row) !== config.id) { store.finishOperation(operationId, 'failed'); throw new HttpError(404, 'Event not found.'); }
      requireVisitChildPermission(store, session, store.getEventMetadata(parsed.resource, parsed.id)?.metadata);
      writeMetadata(store, record.operation, { attempted: true, retries: 0 });
      sentDelete = true;
      await request(session, { resource: parsed.resource, method: 'DELETE', id: parsed.id });
      store.deleteEventMetadata(parsed.resource, parsed.id);
      store.finishOperation(operationId, 'saved', id);
      return { status: 'saved', id };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        if (sentDelete) { store.deleteEventMetadata(parsed.resource, parsed.id); store.finishOperation(operationId, 'saved', id); return { status: 'saved', id }; }
        store.finishOperation(operationId, 'failed');
        throw error;
      }
      if (knownFailure(status(error))) { store.finishOperation(operationId, 'failed'); throw error; }
      return { status: 'pending', pendingOperation: operationId };
    }
  }

  async function saveMapped(session: Session, operationId: string, mapped: MappedEvent, event: Record<string, unknown>, childId: number, current: Date) {
    const by = operationBy(store.getOperation(operationId)!, session.adult);
    const ids: string[] = [];
    for (let index = 0; index < mapped.writes.length; index++) {
      const item = mapped.writes[index];
      let row: unknown;
      const savedOperation = store.getOperation(operationId);
      const metadata = Array.isArray(savedOperation?.metadata) ? savedOperation.metadata : [];
      const savedMeta = isRecord(metadata[index]) ? metadata[index] : {};
      store.updateUnresolvedOperationMetadata(operationId, metadata.map((value, position) => position === index ? { ...savedMeta, attempted: true } : value));
      try { row = await request(session, { resource: item.resource, method: 'POST', body: item.body }); }
      catch (error) {
        if (knownFailure(status(error)) && ids.length === 0) {
          const refusal = await periodRefusal(sessions, session, error, item.resource, item.body);
          if (refusal !== error && canKeepOverlapLocal(mapped)) return overlapFallback(session, operationId, event, childId, current);
          store.finishOperation(operationId, 'failed');
          throw refusal;
        }
        if (knownFailure(status(error)) && ids.length > 0) store.finishOperation(operationId, 'finishing', undefined, ids);
        return { status: 'pending', pendingOperation: operationId };
      }
      let id: string;
      try { id = rowId(row); }
      catch { return { status: 'pending', pendingOperation: operationId }; }
      const linkedId = `${item.resource}:${id}`;
      ids.push(linkedId);
      try {
        store.putEventMetadata({ resource: item.resource, babyBuddyId: id, adult: by, metadata: { ...item.metadata, childId } });
        store.finishOperation(operationId, index === mapped.writes.length - 1 ? 'saved' : 'finishing', linkedId, ids);
      } catch { return { status: 'pending', pendingOperation: operationId }; }
    }
    return { status: 'saved', id: ids[0] };
  }

  async function overlapFallback(session: Session, operationId: string, event: Record<string, unknown>, childId: number, current: Date) {
    const by = operationBy(store.getOperation(operationId)!, session.adult), entry = toLocalEntry(event, current, by, operationId);
    try {
      store.putAppEvent({ id: operationId, adult: by, kind: 'feeding-overlap', occurredAt: eventTimestamp(event, current), details: { childId, entry, event } });
      store.finishOperation(operationId, 'saved', `app:${operationId}`);
      return { status: 'saved', id: `app:${operationId}` };
    } catch { return { status: 'pending', pendingOperation: operationId }; }
  }

  return { state, growth, foods, createChild, createEvent, updateEvent, splitEvent, deleteEvent, operation };
}
