import { createHash } from 'node:crypto';
import { HttpError } from './http.ts';
import { requirePermission } from './records.ts';
import { findConflicts, overlapDetails } from './sleep-overlap.ts';
import type { Session } from './app.ts';
import type { Store, Operation } from './store.ts';
import { canonical } from './store.ts';
import { eventTimestamp, relativeMinutes } from './mapping.ts';
import { getZone } from './zone.ts';

type TimerKind = 'feed' | 'sleep' | 'pump' | 'tummy' | 'bath';
type TimerRow = { id?: string | number; child?: unknown; user?: unknown; start?: unknown; name?: unknown };
type FeedSide = 'L' | 'R' | 'bottle';
type TimerMetadata = { kind: TimerKind; side?: FeedSide | 'B'; sessionId?: string; nap?: boolean; note?: string };
type TimerAmounts = { leftMl: number; rightMl: number } | { ml: number; milk: 'breast' | 'formula' };
type Input = { operationId: string; kind?: unknown; side?: unknown; nap?: unknown; note?: unknown; start?: unknown; pauseId?: unknown; confirmOther?: unknown };
type StopInput = { operationId: string; amounts?: unknown; confirmOther?: unknown; note?: unknown; at?: unknown; pause?: boolean; automatic?: boolean };
type EventBody = Record<string, unknown> & { start: string; end: string };
type Sessions = { request(sessionId: string, request: { resource: string; method: string; id?: string | number; query?: Record<string, string | number>; body?: unknown }): Promise<unknown> };
type Records = { createEvent(session: Session, input: { operationId: string; event: Record<string, unknown> }, owner?: string): Promise<{ status: 'saved'; id: string } | { status: 'pending'; pendingOperation: string }> };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set<TimerKind>(['feed', 'sleep', 'pump', 'tummy', 'bath']);
const TEN_SECONDS = 10_000;
const MAX_PERIOD = 24 * 60 * 60 * 1000;
const EARLIER_LIMIT = 12 * 60 * 60 * 1000;
const TIMER_NAME = 'Little Days activity';
const RESEND_AFTER = 30_000;
const START_EXPIRY = 10 * 60_000;
const TAKEOVER_AFTER = 60_000;
const START_EXPIRED = 'The timer did not start. Start it again.';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function identifier(value: unknown): string | null {
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

function childId(store: Store): number {
  const value = store.getSetting('app', 'child');
  const raw = typeof value === 'number' ? value : object(value)?.id;
  if (!Number.isSafeInteger(raw) || Number(raw) < 1) throw new HttpError(409, 'Choose a child before you use a timer.');
  return Number(raw);
}

function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_V4.test(value)) throw new HttpError(400, 'Use a valid operation ID.');
  return value.toLowerCase();
}

function userId(value: unknown): number | null {
  const raw = object(value)?.id ?? value;
  return Number.isSafeInteger(raw) && Number(raw) > 0 ? Number(raw) : null;
}

function rowList(value: unknown): TimerRow[] {
  if (Array.isArray(value)) return value.filter(item => object(item)) as TimerRow[];
  const results = object(value)?.results;
  if (Array.isArray(results)) return results.filter(item => object(item)) as TimerRow[];
  throw new HttpError(502, 'The timer list could not be read. Try again.');
}


function derivedUuid(source: string, suffix: string): string {
  const bytes = createHash('sha256').update(`${source}:${suffix}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function eventFor(kind: TimerKind, metadata: TimerMetadata, start: string, end: string, amounts?: TimerAmounts, noteOverride?: string): EventBody {
  const note = noteOverride ?? metadata.note ?? '';
  if (kind === 'feed') {
    if (!metadata.side) throw new HttpError(409, 'This feeding timer has no saved side.');
    if (metadata.side === 'bottle') {
      if (!amounts || !('ml' in amounts)) throw new HttpError(400, 'Choose a milk type and enter an amount.');
      return { type: 'bottle', ...amounts, sid: metadata.sessionId, start, end, note };
    }
    return { type: 'feed', side: metadata.side, sid: metadata.sessionId, start, end, note };
  }
  if (kind === 'sleep') {
    if (typeof metadata.nap !== 'boolean') throw new HttpError(409, 'This sleep timer has no saved nap choice.');
    return { type: 'sleep', nap: metadata.nap, start, end, note };
  }
  if (kind === 'pump') {
    if (!amounts || !('leftMl' in amounts) || amounts.leftMl + amounts.rightMl <= 0) throw new HttpError(400, 'Enter a positive pumping amount.');
    return { type: 'pump', leftMl: amounts.leftMl, rightMl: amounts.rightMl, totalMl: amounts.leftMl + amounts.rightMl, start, end, note };
  }
  return { type: 'other', what: kind, start, end, completed: true, note };
}

function statusOf(op: Operation, extra: Record<string, unknown> = {}) {
  const metadata = object(op.metadata);
  const deadline = metadata?.deadline;
  const event = object(op.requestBody);
  return {
    status: op.state,
    operationId: op.id,
    ...(op.state === 'pending' && typeof deadline === 'number' ? { undoUntil: new Date(deadline).toISOString() } : {}),
    ...(op.state === 'pending' && metadata?.correctionRequired === true && typeof event?.start === 'string' ? {correctionRequired: true, timerId: metadata.timerId, start: event.start, maxEnd: new Date(Date.parse(event.start) + MAX_PERIOD).toISOString()} : {}),
    ...extra,
  };
}

type StartStep = { created: unknown } | { result: Record<string, unknown> };

export function createTimers({ store, sessions, records, now = Date.now, log = line => console.error(line), onTakeOverSaved }: { store: Store; sessions: Sessions; records: Records; now?: () => number; log?: (line: string) => void; onTakeOverSaved?: (session: Session, operationId: string) => void | Promise<void> }) {
  const inFlight = new Map<string, Promise<unknown>>();
  const logged = new Set<string>();

  // One run at a time for each operation: a second caller waits for the first result.
  function once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = inFlight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const started = run().finally(() => { inFlight.delete(key); });
    inFlight.set(key, started);
    return started;
  }

  function logOnce(key: string, line: string) {
    if (logged.has(key)) return;
    logged.add(key);
    log(line);
  }

  function getUserId(session: Session): number {
    const saved = store.getSession(session.sessionId);
    if (!saved || saved.adult !== session.adult) throw new HttpError(401, 'Sign in again.');
    return saved.babyBuddyUserId;
  }

  function hasDeletePermission(session: Session): boolean {
    return store.getSetting(`user:${getUserId(session)}`, 'timerDeletePermission') === true;
  }

  async function listTimers(session: Session): Promise<TimerRow[]> {
    const value = await sessions.request(session.sessionId, {
      resource: 'timers', method: 'GET', query: { child: childId(store), limit: 100 },
    });
    return rowList(value).filter(row => Number(userId(row.child)) === childId(store));
  }

  // Baby Buddy refuses a sleep that crosses another saved sleep, so a sleep timer that crosses one can never stop.
  // The check fails open: when the sleep list cannot be read, Baby Buddy stays the judge.
  // A 400, not a 409: the browser keeps the form open and editable for a 400.
  // The error also lists the saved sleeps (`conflicts`), so the browser can name them in the adult's language.
  async function requireNoSleepOverlap(session: Session, start: string, end: string, fix: 'start' | 'end' = 'start') {
    const conflicts = await findConflicts(request => sessions.request(session.sessionId, request), 'sleep', childId(store), start, end);
    if (!conflicts?.length) return;
    const hit = conflicts[0];
    const clock = (value: unknown) => new Intl.DateTimeFormat('en-US', { timeZone: getZone(), hour: 'numeric', minute: '2-digit' }).format(new Date(String(value)));
    // Round the suggested start up to a whole minute: a typed 7:21 is before a sleep that ends at 7:21:23.
    const after = new Date(Math.ceil(Date.parse(String(hit.end)) / 60_000) * 60_000).toISOString();
    const hint = fix === 'start' ? `Change the start to ${clock(after)} or later` : 'Choose an end before that sleep starts';
    throw new HttpError(400, `This nap overlaps the sleep saved from ${clock(hit.start)} to ${clock(hit.end)}. ${hint}, or delete that sleep.`, overlapDetails(conflicts));
  }

  function stopInProgress(timerId: string): boolean {
    return store.pendingOperations().some(op => op.resource === 'timers' && object(op.metadata)?.timerId === timerId && object(op.metadata)?.action !== 'auto-stop');
  }

  // Runs before the stop reads the timer, so the stop acts on fresh state after this wait (another phone may change,
  // discard or stop the timer meanwhile). An automatic stop keeps its own failure path; a stop over 24 hours asks for a
  // corrected end first. A stop in progress wins: its own saved sleep must not be reported as a conflict.
  async function precheckSleepStop(session: Session, timerId: string, input: StopInput) {
    if (input.automatic || metaFor(timerId)?.value.kind !== 'sleep' || stopInProgress(timerId)) return;
    const start = iso((await listTimers(session)).find(row => String(row.id) === timerId)?.start);
    const end = iso(input.at) ?? new Date(now()).toISOString();
    if (!start || Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > MAX_PERIOD) return;
    try { await requireNoSleepOverlap(session, start, end); }
    catch (error) { if (!stopInProgress(timerId)) throw error; }
  }

  function metaFor(timerId: string): { adult: string; value: TimerMetadata } | null {
    const saved = store.getEventMetadata('timers', timerId);
    const value = object(saved?.metadata);
    if (!saved || !value || !KINDS.has(value.kind as TimerKind)) return null;
    return { adult: saved.adult, value: value as TimerMetadata };
  }

  function pendingStopIds(session: Session): Set<string> {
    return new Set(store.listOperations(session.adult, 'timers', ['pending', 'finishing']).filter(op => object(op.intent)?.action === 'stop')
      .map(op => String(object(op.metadata)?.timerId ?? '')));
  }

  // A stop that its adult left waiting is finished by the other adult's next poll, with the first adult's frozen entry.
  function takeOverStops(session: Session) {
    for (const op of store.pendingOperations()) {
      const metadata = object(op.metadata);
      if (op.resource !== 'timers' || metadata?.action !== 'stop' || op.adult === session.adult || metadata.correctionRequired === true) continue;
      if (metadata.nextSide !== undefined) { logOnce(`switch:${op.id}`, `A timer side switch (${op.id}) keeps its lock until its own adult finishes it.`); continue; }
      if (op.state === 'finishing') { logOnce(`finishing:${op.id}`, `A timer stop (${op.id}) keeps its lock: its save result is not known.`); continue; }
      if (typeof metadata.deadline !== 'number' || now() - metadata.deadline < TAKEOVER_AFTER || !hasDeletePermission(session)) continue;
      advanceStop(session, op).then(
        result => {
          if (result.status === 'saved') void Promise.resolve(onTakeOverSaved?.(session, op.id)).catch(() => {});
          else log(`A timer stop takeover (${op.id}) ended as ${String(result.status)}.`);
        },
        error => log(`A timer stop takeover (${op.id}) failed: ${error instanceof Error ? error.name : 'Error'}.`),
      );
    }
  }

  function operationResult(op: Operation) {
    const extra: Record<string, unknown> = {};
    if (op.state === 'failed') {
      extra.error = object(op.metadata)?.error ?? 'The timer was not saved. Keep the timer open and try again.';
      // A sleep that a saved sleep crossed during Undo keeps the names of those sleeps.
      const overlap = object(object(op.metadata)?.overlap);
      if (overlap) Object.assign(extra, overlap);
      if (object(op.metadata)?.action === 'auto-stop') extra.eventSaved = !!op.babyBuddyId;
    }
    return statusOf(op, extra);
  }

  function reconcileRejectedStops(timerId: string) {
    for (const op of store.pendingOperations()) {
      const metadata = object(op.metadata);
      if (op.resource !== 'timers' || metadata?.timerId !== timerId) continue;
      const stop = metadata.action === 'auto-stop' ? store.getOperation(String(metadata.stopOperationId)) : store.getOperation(op.id);
      const stopMeta = object(stop?.metadata);
      if (!stop || stopMeta?.action !== 'stop' || stop.babyBuddyId) continue;
      const record = store.getOperation(String(stopMeta.eventOperationId));
      // A rejected record is safe to release; an unknown reply must retain its claim.
      if (record?.state !== 'failed' || record.babyBuddyId || record.babyBuddyIds.length) continue;
      if (stop.state === 'pending' || stop.state === 'finishing') {
        store.updateUnresolvedOperationMetadata(stop.id, {...stopMeta, error: 'The timer entry was not saved. Check its start and end times, then try again.'});
        store.finishOperation(stop.id, 'failed');
      }
      if (metadata.action === 'auto-stop' && op.babyBuddyId) {
        store.updateUnresolvedOperationMetadata(op.id, {...metadata, error: 'The event saved. Sleep was not saved. Check the sleep times, then end sleep again.'});
        store.finishOperation(op.id, 'failed');
      }
    }
  }

  async function active(session: Session) {
    getUserId(session);
    takeOverStops(session);
    const live = await listTimers(session);
    for (const row of live) { const id = identifier(row.id); if (id) reconcileRejectedStops(id); }
    const hidden = pendingStopIds(session);
    const timers = [];
    for (const row of live) {
      const id = identifier(row.id);
      const start = iso(row.start);
      if (!id || !start || hidden.has(id)) continue;
      const metadata = metaFor(id);
      if (!metadata) continue;
      timers.push({ id, kind: metadata.value.kind, side: metadata.value.side, ...(metadata.value.kind === 'feed' ? {sid: metadata.value.sessionId ?? `timer:${id}`} : {}), t0: relativeMinutes(start, new Date(now())), startedAt: start, by: metadata.adult });
    }
    const feed = timers.find(timer => timer.kind === 'feed') ?? null;
    return {
      run: feed,
      sleepRun: timers.find(timer => timer.kind === 'sleep') ?? null,
      sleepPaused: timers.some(timer => timer.kind === 'sleep') || store.pendingOperations().some(op => object(op.metadata)?.pauseId && object(op.metadata)?.action === 'start') ? null : pausedSleep(),
      pumpRun: timers.find(timer => timer.kind === 'pump') ?? null,
      timers,
    };
  }

  function normalizedStart(input: Input): { operationId: string; metadata: TimerMetadata; intent: Record<string, unknown> } {
    const operationId = requireUuid(input.operationId);
    if (typeof input.kind !== 'string' || !KINDS.has(input.kind as TimerKind)) throw new HttpError(400, 'Choose a supported timer type.');
    const kind = input.kind as TimerKind;
    const metadata: TimerMetadata = { kind };
    if (input.side !== undefined) {
      const side = input.side === 'left' ? 'L' : input.side === 'right' ? 'R' : input.side;
      if (!['L', 'R', 'B', 'bottle'].includes(String(side)) || kind !== 'feed') throw new HttpError(400, 'Choose a valid feeding side.');
      metadata.side = side as TimerMetadata['side'];
    }
    if (kind === 'feed' && !metadata.side) throw new HttpError(400, 'Choose a feeding side.');
    if (kind === 'feed') metadata.sessionId = operationId;
    if (input.nap !== undefined) {
      if (typeof input.nap !== 'boolean' || kind !== 'sleep') throw new HttpError(400, 'Choose a valid nap value.');
      metadata.nap = input.nap;
    }
    if (kind === 'sleep' && typeof metadata.nap !== 'boolean') throw new HttpError(400, 'Choose a nap or overnight sleep.');
    if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 2000)) throw new HttpError(400, 'Check the timer note.');
    if (typeof input.note === 'string') metadata.note = input.note;
    return { operationId, metadata, intent: { action: 'start', metadata } };
  }

  function ensureOperation(id: string, adult: string, intent: unknown): Operation | null {
    const existing = store.getOperation(id);
    if (!existing) return null;
    if (existing.adult !== adult || existing.resource !== 'timers') throw new HttpError(409, 'This operation ID is already in use.');
    if (canonical(existing.intent) !== canonical(intent)) throw new HttpError(409, 'This operation ID has different input.');
    return existing;
  }

  function startOwner(session: Session, op: Operation): number | null {
    const saved = object(op.metadata)?.userId;
    if (typeof saved === 'number') return saved;
    return op.adult === session.adult ? getUserId(session) : null;
  }

  // Baby Buddy writes the start in its own offset, so starts are compared as instants.
  function startMatches(rows: TimerRow[], op: Operation, owner: number): TimerRow[] {
    const body = object(op.requestBody) ?? {};
    const at = Date.parse(String(body.start));
    return rows.filter(row => Number(userId(row.user)) === owner && Date.parse(String(row.start)) === at && String(row.name) === String(body.name));
  }

  async function createStep(session: Session, op: Operation): Promise<StartStep> {
    try {
      return { created: await sessions.request(session.sessionId, { resource: 'timers', method: 'POST', body: op.requestBody }) };
    } catch (error) {
      if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
        store.finishOperation(op.id, 'failed');
        return { result: operationResult(store.getOperation(op.id)!) };
      }
      return { result: operationResult(op) };
    }
  }

  function expireStep(op: Operation, owner: number, fresh: TimerRow[]): StartStep {
    const found = startMatches(fresh, op, owner);
    if (found.length === 1) return { created: found[0] };
    if (found.length > 1) return { result: operationResult(op) };
    store.updateUnresolvedOperationMetadata(op.id, { ...object(op.metadata), error: START_EXPIRED });
    store.finishOperation(op.id, 'failed');
    return { result: operationResult(store.getOperation(op.id)!) };
  }

  // A start that may have reached Baby Buddy: adopt its timer, send the request again once it is old, or give up when it is very old.
  async function recoverStep(session: Session, op: Operation, list?: TimerRow[]): Promise<StartStep> {
    const owner = startOwner(session, op);
    if (owner === null) return { result: operationResult(op) };
    const rows = list ?? await listTimers(session);
    const found = startMatches(rows, op, owner);
    if (found.length === 1) return { created: found[0] };
    if (found.length > 1) return { result: operationResult(op) };
    const age = now() - op.createdAt;
    if (age > START_EXPIRY) return expireStep(op, owner, list ? await listTimers(session) : rows);
    if (age > RESEND_AFTER && !list) return createStep(session, op);
    return { result: operationResult(op) };
  }

  async function startStep(session: Session, op: Operation, allowCreate: boolean, list?: TimerRow[]): Promise<StartStep> {
    if ((op.state === 'pending' || op.state === 'finishing') && op.babyBuddyId) return { created: { id: op.babyBuddyId } };
    if (op.state !== 'pending') return { result: operationResult(op) };
    if (allowCreate || object(op.metadata)?.attempted !== true) return createStep(session, op);
    return recoverStep(session, op, list);
  }

  function persistTimer(session: Session, op: Operation, metadata: TimerMetadata, allowCreate = false, list?: TimerRow[]): Promise<Record<string, unknown>> {
    return once(`start:${op.id}`, () => persistTimerOnce(session, op, metadata, allowCreate, list));
  }

  async function persistTimerOnce(session: Session, first: Operation, metadata: TimerMetadata, allowCreate: boolean, list?: TimerRow[]): Promise<Record<string, unknown>> {
    const op = store.getOperation(first.id) ?? first;
    const step = await startStep(session, op, allowCreate, list);
    if ('result' in step) return step.result;
    const id = identifier(object(step.created)?.id);
    if (!id) return operationResult(op);
    const opMeta = object(op.metadata);
    try {
      store.putEventMetadata({ resource: 'timers', babyBuddyId: id, adult: op.adult, metadata });
      store.finishOperation(op.id, 'finishing', id);
      store.completeTimerOperation(op.id, undefined, typeof opMeta?.pauseId === 'string' ? opMeta.pauseId : undefined);
    } catch {
      return operationResult(store.getOperation(op.id) ?? op);
    }
    return { status: 'saved', operationId: op.id, timerId: id };
  }

  // Old pending starts of one kind are adopted or expired before they can block a new start; true when one was adopted.
  async function settleOldStarts(session: Session, kind: TimerKind, list: TimerRow[]): Promise<boolean> {
    let adopted = false;
    for (const op of store.pendingOperations()) {
      const metadata = object(op.metadata), intentMetadata = object(object(op.intent)?.metadata);
      if (op.resource !== 'timers' || op.state !== 'pending' || metadata?.action !== 'start' || metadata.kind !== kind || !intentMetadata || now() - op.createdAt <= RESEND_AFTER) continue;
      const result = await persistTimer(session, op, intentMetadata as TimerMetadata, false, list);
      adopted ||= result.status === 'saved';
    }
    return adopted;
  }

  async function startInternal(session: Session, input: Input, { switching = false, startAt, sessionId }: { switching?: boolean; startAt?: string; sessionId?: string } = {}) {
    const normalized = normalizedStart(input);
    if (sessionId) normalized.metadata.sessionId = sessionId;
    const child = childId(store);
    const started = startAt ?? new Date(now()).toISOString();
    const body = { child, start: started, name: TIMER_NAME };
    const intent = { ...normalized.intent, switching, ...(input.pauseId ? {pauseId: input.pauseId} : {}) };
    const prior = ensureOperation(normalized.operationId, session.adult, intent);
    if (prior) {
      if (prior.state === 'saved') return { status: 'saved', operationId: prior.id, timerId: prior.babyBuddyId };
      return persistTimer(session, prior, normalized.metadata);
    }
    let live = await listTimers(session);
    if (await settleOldStarts(session, normalized.metadata.kind, live)) live = await listTimers(session);
    for (const row of live) {
      const id = identifier(row.id);
      const meta = id && metaFor(id);
      if (meta?.value.kind === normalized.metadata.kind) throw new HttpError(409, 'A timer of this type is already active.');
    }
    const samePending = store.pendingOperations().some(op => op.resource === 'timers' && object(op.metadata)?.kind === normalized.metadata.kind && object(op.metadata)?.nextTimerOperationId !== normalized.operationId);
    if (samePending) throw new HttpError(409, 'A timer of this type is already pending.');
    const { operation } = store.beginOperation({
      id: normalized.operationId, adult: session.adult, resource: 'timers', intent,
      requestBody: body, metadata: { action: 'start', attempted: true, userId: getUserId(session), ...normalized.metadata, ...(input.pauseId ? {pauseId: input.pauseId} : {}) },
    });
    return persistTimer(session, operation, normalized.metadata, true);
  }

  // A start the parent typed: not after now (one minute of clock slack), and not over 12 hours ago.
  function typedStart(value: unknown): string {
    const at = typeof value === 'string' ? Date.parse(value) : NaN;
    if (!Number.isFinite(at) || at > now() + 60_000 || at < now() - EARLIER_LIMIT) throw new HttpError(400, 'Choose a start time in the last 12 hours.');
    return new Date(Math.min(at, now())).toISOString();
  }

  async function start(session: Session, input: Input) {
    if (input.pauseId !== undefined) throw new HttpError(400, 'Use Resume nap to continue a paused nap.');
    const prior = store.getOperation(requireUuid(input.operationId));
    if (!prior && input.kind === 'sleep' && pausedSleep()) throw new HttpError(409, 'Resume or end the paused nap before starting another sleep timer.');
    if (object(prior?.metadata)?.action === 'auto-stop') return autoEvent(session, 'start', input);
    if (['feed', 'tummy', 'bath'].includes(String(input.kind))) {
      const cutoff = input.start === undefined ? new Date(now()).toISOString() : typedStart(input.start);
      const sleep = await eligibleSleep(session, cutoff);
      if (sleep) return autoEvent(session, 'start', input, {timerId: String(sleep.id), cutoff});
    }
    if (input.start === undefined) return startInternal(session, input);
    const startAt = typedStart(input.start);
    if (input.kind === 'sleep' && !prior) await requireNoSleepOverlap(session, startAt, new Date(now()).toISOString());
    return startInternal(session, input, { startAt });
  }

  function pausedSleep() {
    const pause = object(store.getSetting('app', 'sleepPaused'));
    return pause?.childId === childId(store) ? pause : null;
  }

  async function pause(session: Session, id: string | number, input: StopInput) {
    return stopInternal(session, id, {...input, pause: true, automatic: false});
  }

  async function resume(session: Session, input: Input) {
    const pauseId = requireUuid(input.pauseId);
    const prior = store.getOperation(requireUuid(input.operationId));
    if (prior) {
      if (prior.adult !== session.adult || object(prior.intent)?.pauseId !== pauseId) throw new HttpError(409, 'This operation ID has different input.');
      return operation(session, prior.id);
    }
    const paused = pausedSleep();
    if (!paused || paused.id !== pauseId) throw new HttpError(409, 'This nap is no longer paused. Refresh its status.');
    return startInternal(session, {operationId: input.operationId, kind: 'sleep', nap: paused.nap, note: paused.note, pauseId});
  }

  async function endPaused(session: Session, input: Input) {
    const id = requireUuid(input.operationId), pauseId = requireUuid(input.pauseId);
    const intent = {action: 'end-paused', pauseId, confirmOther: input.confirmOther === true};
    const prior = ensureOperation(id, session.adult, intent);
    if (prior) return operation(session, prior.id);
    const paused = pausedSleep();
    if (!paused || paused.id !== pauseId) throw new HttpError(409, 'This nap is no longer paused. Refresh its status.');
    if (paused.by !== session.adult && input.confirmOther !== true) throw new HttpError(409, 'Confirm that you want to end the other adult’s nap.');
    if (!hasDeletePermission(session)) throw new HttpError(403, 'Timer stopping is unavailable for this account.');
    store.beginOperation({id, adult: session.adult, resource: 'timers', intent, requestBody: {}, metadata: {action: 'end-paused', pauseId}});
    store.completeTimerOperation(id, undefined, pauseId);
    return operationResult(store.getOperation(id)!);
  }

  async function discard(session: Session, timerIdValue: unknown, input: StopInput) {
    const id = requireUuid(input.operationId), timerId = identifier(timerIdValue);
    if (!timerId) throw new HttpError(400, 'Choose a valid timer.');
    const intent = {action: 'discard', timerId, confirmOther: input.confirmOther === true};
    const prior = ensureOperation(id, session.adult, intent);
    if (prior) return advanceDiscard(session, prior);
    const timer = getTimer(await listTimers(session), timerId), metadata = metaFor(timerId);
    if (!metadata || userId(timer.user) == null) throw new HttpError(409, 'The timer owner could not be verified.');
    if ((userId(timer.user) !== getUserId(session) || metadata.adult !== session.adult) && input.confirmOther !== true) throw new HttpError(409, 'Confirm that you want to discard the other adult’s timer.');
    if (!hasDeletePermission(session)) throw new HttpError(403, 'Timer stopping is unavailable for this account.');
    reconcileRejectedStops(timerId);
    if (store.pendingOperations().some(op => op.resource === 'timers' && object(op.metadata)?.timerId === timerId && object(op.metadata)?.action !== 'auto-stop')) throw new HttpError(409, 'This timer is already being stopped. Refresh its status.');
    const {operation: op} = store.beginOperation({id, adult: session.adult, resource: 'timers', intent, requestBody: {}, metadata: {action: 'discard', timerId}});
    return advanceDiscard(session, op);
  }

  async function advanceDiscard(session: Session, op: Operation) {
    if (op.state !== 'pending' && op.state !== 'finishing') return operationResult(op);
    if (!(await deleteTimer(session, String(object(op.metadata)?.timerId)))) return statusOf(op, {warning: 'The timer could not be discarded. Try again.'});
    store.finishOperation(op.id, 'saved');
    return operationResult(store.getOperation(op.id)!);
  }

  async function eligibleSleep(session: Session, cutoff: string) {
    const at = Date.parse(cutoff);
    if (!Number.isFinite(at) || at > now()) return null;
    return (await listTimers(session)).find(row => {
      const id = identifier(row.id), start = iso(row.start);
      return id && start && metaFor(id)?.value.kind === 'sleep' && Date.parse(start) < at && !store.hasTimerStop(id);
    }) ?? null;
  }

  async function createEvent(session: Session, input: {operationId: string; event: Record<string, unknown>; confirmOther?: unknown}) {
    const prior = store.getOperation(requireUuid(input.operationId));
    if (prior && object(prior.metadata)?.action === 'auto-stop') return autoEvent(session, 'event', input);
    const wakesBaby = ['feed', 'bottle', 'diaper'].includes(String(input.event?.type)) || input.event?.type === 'other' && ['tummy', 'bath', 'solids'].includes(String(input.event.what));
    if (prior || !wakesBaby) return records.createEvent(session, input);
    const cutoff = eventTimestamp(input.event, new Date(now()));
    const sleep = await eligibleSleep(session, cutoff);
    if (!sleep) return records.createEvent(session, input);
    return autoEvent(session, 'event', input, {timerId: String(sleep.id), cutoff});
  }

  async function autoEvent(session: Session, action: 'start' | 'event', input: Record<string, any>, link?: {timerId: string; cutoff: string}) {
    const id = requireUuid(input.operationId);
    const {confirmOther, ...payload} = input;
    const intent = {action: 'auto-stop', eventAction: action, input: payload};
    let op = ensureOperation(id, session.adult, intent);
    if (!op) {
      if (!link) throw new HttpError(409, 'Refresh the timer status.');
      const eventInput = action === 'event' ? {...payload, event: {...input.event, [input.event.type === 'diaper' ? 'time' : 'start']: link.cutoff}} : {...payload, start: link.cutoff};
      op = store.beginOperation({id, adult: session.adult, resource: 'timers', intent, requestBody: eventInput, metadata: {
        action: 'auto-stop', eventAction: action, ...link, childId: childId(store), eventOperationId: derivedUuid(id, 'trigger-event'), stopOperationId: derivedUuid(id, 'sleep-stop'), confirmOther: confirmOther === true,
      }}).operation;
    } else if (confirmOther === true && (op.state === 'pending' || op.state === 'finishing')) {
      store.updateUnresolvedOperationMetadata(id, {...object(op.metadata), confirmOther: true});
      op = store.getOperation(id)!;
    }
    return advanceAuto(session, op);
  }

  async function confirmInterruption(session: Session, idValue: string) {
    const id = requireUuid(idValue), op = store.getOperation(id);
    if (!op || op.resource !== 'timers' || op.adult !== session.adult || object(op.metadata)?.action !== 'auto-stop') throw new HttpError(404, 'Operation not found.');
    if (op.state === 'pending' || op.state === 'finishing') store.updateUnresolvedOperationMetadata(id, {...object(op.metadata), confirmOther: true});
    return advanceAuto(session, store.getOperation(id)!);
  }

  async function advanceAuto(session: Session, op: Operation): Promise<Record<string, unknown>> {
    reconcileRejectedStops(String(object(op.metadata)?.timerId));
    op = store.getOperation(op.id)!;
    const metadata = object(op.metadata)!;
    if (op.state === 'saved') return statusOf(op, {eventSaved: true, sleepEnded: metadata.sleepDiscarded !== true && metadata.sleepCancelled !== true, ...(metadata.sleepDiscarded === true ? {sleepDiscarded: true} : {}), ...(metadata.sleepCancelled === true ? {sleepCancelled: true} : {}), ...(metadata.eventAction === 'start' ? {timerId: op.babyBuddyId} : {id: op.babyBuddyId})});
    if (op.state === 'failed') return operationResult(op);
    if (metadata.childId !== childId(store)) return statusOf(op, {warning: 'Choose the original child to finish this action.'});
    const input = object(op.requestBody)!;
    if (!op.babyBuddyId) {
      let result: Record<string, unknown>;
      try {
        result = metadata.eventAction === 'start'
          ? await startInternal(session, {...input, operationId: String(metadata.eventOperationId)} as Input, {startAt: String(metadata.cutoff)})
          : await records.createEvent(session, {operationId: String(metadata.eventOperationId), event: input.event as Record<string, unknown>});
      } catch (error) {
        if (error instanceof HttpError && error.status < 500) { store.finishOperation(op.id, 'failed'); throw error; }
        return statusOf(op, {warning: 'The event is still being checked. Try again.'});
      }
      if (result.status === 'failed') {
        store.finishOperation(op.id, 'failed');
        return operationResult(store.getOperation(op.id)!);
      }
      if (result.status !== 'saved') return statusOf(op, {warning: 'The event is still being checked. Try again.'});
      store.finishOperation(op.id, 'finishing', String(result.timerId ?? result.id));
      op = store.getOperation(op.id)!;
    }
    try {
      const stopId = String(metadata.stopOperationId);
      let child = store.getOperation(stopId);
      const otherStop = !child && store.timerStop(String(metadata.timerId));
      if (otherStop && otherStop.id !== stopId) {
        if (otherStop.state !== 'saved') return statusOf(op, {eventSaved: true, warning: 'Sleep is already ending. Retry this action to check its status.'});
        const discarded = object(otherStop.metadata)?.action === 'discard';
        if (discarded) store.updateUnresolvedOperationMetadata(op.id, {...metadata, sleepDiscarded: true});
        store.finishOperation(op.id, 'saved');
        return statusOf(store.getOperation(op.id)!, {eventSaved: true, sleepEnded: !discarded, ...(discarded ? {sleepDiscarded: true} : {}), ...(metadata.eventAction === 'start' ? {timerId: op.babyBuddyId} : {id: op.babyBuddyId})});
      }
      // A refused stop may be retried after permission returns; its frozen event is unchanged.
      if (child?.state === 'failed' && hasDeletePermission(session)) { store.finishOperation(stopId, 'finishing'); child = store.getOperation(stopId); }
      const result = child ? await operation(session, stopId) : await stopInternal(session, metadata.timerId, {operationId: stopId, at: metadata.cutoff, confirmOther: metadata.confirmOther, automatic: true});
      reconcileRejectedStops(String(metadata.timerId));
      if (store.getOperation(op.id)?.state === 'failed') return operationResult(store.getOperation(op.id)!);
      if (result.status === 'cancelled') {
        store.updateUnresolvedOperationMetadata(op.id, {...metadata, sleepCancelled: true});
        store.finishOperation(op.id, 'saved');
        return advanceAuto(session, store.getOperation(op.id)!);
      }
      if (result.status !== 'saved') return statusOf(op, {eventSaved: true, warning: result.correctionRequired ? 'The event saved. Correct the sleep end time to finish.' : 'The event saved. Sleep still needs to end. Retry this action.', sleepOperationId: stopId, ...(result.correctionRequired ? {correctionRequired: true, timerId: result.timerId, start: result.start, maxEnd: result.maxEnd} : {})});
      store.finishOperation(op.id, 'saved');
      return statusOf(store.getOperation(op.id)!, {eventSaved: true, sleepEnded: true, ...(metadata.eventAction === 'start' ? {timerId: op.babyBuddyId} : {id: op.babyBuddyId})});
    } catch (error) {
      return statusOf(op, {eventSaved: true, warning: error instanceof HttpError ? error.message : 'The event saved. Sleep still needs to end. Retry this action.', needsConfirmation: error instanceof HttpError && error.status === 409 && error.message.includes('other adult')});
    }
  }

  async function changeStart(session: Session, timerId: string, input: Input) {
    const operationId = requireUuid(input.operationId);
    const intent = { action: 'change-start', timerId, start: input.start };
    const prior = ensureOperation(operationId, session.adult, intent);
    if (prior) return applyStart(session, prior);
    const start = typedStart(input.start);
    // The sleep check waits first; the checks below then read fresh state.
    if (metaFor(timerId)?.value.kind === 'sleep') await requireNoSleepOverlap(session, start, new Date(now()).toISOString());
    getTimer(await listTimers(session), timerId);
    if (!metaFor(timerId)) throw new HttpError(404, 'Timer not found.');
    requireNoPendingTimer(timerId);
    const { operation } = store.beginOperation({ id: operationId, adult: session.adult, resource: 'timers', intent, requestBody: { timerId, start }, metadata: { action: 'change-start' } });
    return applyStart(session, operation);
  }

  function requireNoPendingTimer(timerId: string) {
    reconcileRejectedStops(timerId);
    const pending = store.pendingOperations().some(op => op.resource === 'timers' && String(object(op.metadata)?.timerId) === timerId);
    if (pending) throw new HttpError(400, 'This timer is stopping. Edit the saved entry instead.');
  }

  async function changeSide(session: Session, timerId: string, input: Input) {
    const operationId = requireUuid(input.operationId);
    const side = input.side === 'left' ? 'L' : input.side === 'right' ? 'R' : input.side;
    const intent = { action: 'change-side', timerId, side };
    const prior = ensureOperation(operationId, session.adult, intent);
    if (prior) return operationResult(prior);
    if (side !== 'L' && side !== 'R' && side !== 'B') throw new HttpError(400, 'Choose a valid feeding side.');
    requirePermission(store, session, 'timers', 'change');
    getTimer(await listTimers(session), timerId);
    const metadata = metaFor(timerId);
    if (!metadata) throw new HttpError(404, 'Timer not found.');
    if (metadata.value.kind !== 'feed') throw new HttpError(400, 'Choose a feeding timer.');
    if (metadata.value.side === 'bottle') throw new HttpError(400, 'Switch to a breast before changing its side.');
    const repeated = ensureOperation(operationId, session.adult, intent);
    if (repeated) return operationResult(repeated);
    requireNoPendingTimer(timerId);
    // A stop can finish during the GET; its saved operation still protects the deleted timer.
    if (store.hasTimerStop(timerId)) throw new HttpError(400, 'This timer is stopping. Edit the saved entry instead.');
    store.saveTimerSide({ id: operationId, adult: session.adult, resource: 'timers', intent, requestBody: { side }, metadata: { action: 'change-side', timerId } },
      { resource: 'timers', babyBuddyId: timerId, adult: metadata.adult, metadata: { ...metadata.value, side } });
    return operationResult(ensureOperation(operationId, session.adult, intent)!);
  }

  // Setting a start is safe to repeat, so a change whose reply was lost is finished by sending it again.
  async function applyStart(session: Session, op: Operation) {
    if (op.state === 'pending') {
      const { timerId, start } = object(op.requestBody) as { timerId: string; start: string };
      try {
        await sessions.request(session.sessionId, { resource: 'timers', method: 'PATCH', id: timerId, body: { start } });
      } catch (error) {
        // A refusal (no permission, timer gone) is final; only a lost connection stays pending for the next check.
        if (error instanceof HttpError && error.status < 500) store.finishOperation(op.id, 'failed');
        throw error;
      }
      store.finishOperation(op.id, 'saved', timerId, [timerId]);
    }
    return operationResult(store.getOperation(op.id)!);
  }

  function normalizedAmounts(kind: TimerKind, value: unknown, side?: TimerMetadata['side']): TimerAmounts | undefined {
    if (kind === 'feed' && side === 'bottle') {
      const amounts = object(value);
      if (typeof amounts?.ml !== 'number' || !Number.isFinite(amounts.ml) || amounts.ml <= 0 || !['breast', 'formula'].includes(String(amounts.milk))) throw new HttpError(400, 'Choose a milk type and enter an amount.');
      return {ml: amounts.ml, milk: amounts.milk as 'breast' | 'formula'};
    }
    if (kind !== 'pump') return undefined;
    const amounts = object(value);
    const leftMl = amounts?.leftMl;
    const rightMl = amounts?.rightMl;
    if (typeof leftMl !== 'number' || !Number.isFinite(leftMl) || leftMl < 0 || typeof rightMl !== 'number' || !Number.isFinite(rightMl) || rightMl < 0 || leftMl + rightMl <= 0) {
      throw new HttpError(400, 'Enter a positive pumping amount for at least one side.');
    }
    return { leftMl, rightMl };
  }

  function getTimer(timers: TimerRow[], id: string): TimerRow {
    const row = timers.find(item => String(item.id) === id);
    if (!row) throw new HttpError(404, 'Timer not found.');
    return row;
  }

  function normalizeStop(session: Session, timerId: string, input: StopInput, kind: TimerKind, metadata: TimerMetadata, start: string, side?: FeedSide) {
    const operationId = requireUuid(input.operationId);
    const amounts = normalizedAmounts(kind, input.amounts, metadata.side);
    if (kind !== 'pump' && metadata.side !== 'bottle' && input.amounts !== undefined) throw new HttpError(400, 'Amounts are only valid for a pump or bottle timer.');
    if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 2000)) throw new HttpError(400, 'Check the timer note.');
    const receipt = now();
    const end = input.at !== undefined ? (side ? switchEnd(input.at, start, receipt) : stopEnd(input.at, start, receipt)) : new Date(receipt).toISOString();
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (!Number.isFinite(startTime) || startTime >= endTime) throw new HttpError(400, 'This timer has an invalid start time.');
    const correctionRequired = endTime - startTime > MAX_PERIOD;
    const event = eventFor(kind, {...metadata, sessionId: metadata.sessionId ?? `timer:${timerId}`}, new Date(startTime).toISOString(), end, amounts, input.note as string | undefined);
    const nextSide = side;
    const intent = { action: nextSide ? 'switch' : 'stop', timerId, confirmOther: input.confirmOther === true, amounts: amounts ?? null, note: input.note ?? null, nextSide: nextSide ?? null, at: input.at ?? null, ...(input.pause ? {pause: true} : {}), ...(input.automatic ? {automatic: true} : {}) };
    const deadline = receipt + TEN_SECONDS;
    const metadataRecord = {
      action: 'stop', timerId, kind, deadline: correctionRequired ? null : input.automatic ? receipt : deadline, correctionRequired, ...(input.pause ? {pause: {id: operationId, childId: childId(store), by: session.adult, nap: metadata.nap, note: event.note, pausedAt: end}} : {}), eventOperationId: derivedUuid(operationId, 'event'),
      ...(nextSide ? { nextSide, nextTimerOperationId: derivedUuid(operationId, 'next-timer') } : {}),
    };
    return { operationId, event, intent, metadata: metadataRecord, deadline };
  }

  function stopEnd(value: unknown, start: string, receipt: number): string {
    const at = iso(value);
    if (!at || Date.parse(at) <= Date.parse(start) || Date.parse(at) > receipt) throw new HttpError(400, 'Choose an end after the start and before now.');
    return at;
  }

  function switchEnd(value: unknown, start: string, receipt: number): string {
    const at = iso(value);
    if (!at || Date.parse(at) <= Date.parse(start) || Date.parse(at) > receipt + 60_000) throw new HttpError(400, 'Choose a switch time after the start and not in the future.');
    return new Date(Math.min(Date.parse(at), receipt)).toISOString();
  }

  async function stopInternal(session: Session, timerIdValue: unknown, input: StopInput, nextSide?: FeedSide) {
    const timerId = identifier(timerIdValue);
    if (!timerId) throw new HttpError(400, 'Choose a valid timer.');
    const operationId = requireUuid(input.operationId);
    const existing = store.getOperation(operationId);
    if (existing) {
      if (existing.adult !== session.adult || existing.resource !== 'timers') throw new HttpError(409, 'This operation ID is already in use.');
      const intent = object(existing.intent);
      if (intent?.timerId !== timerId || intent?.action !== (nextSide ? 'switch' : 'stop') || intent?.nextSide !== (nextSide ?? null) || intent?.confirmOther !== (input.confirmOther === true) || canonical(intent?.amounts) !== canonical(input.amounts) || intent?.note !== (input.note ?? null) || (intent?.at ?? null) !== (input.at ?? null) || (intent?.pause === true) !== (input.pause === true) || (intent?.automatic === true) !== (input.automatic === true)) throw new HttpError(409, 'This operation ID has different input.');
      if (existing.state === 'pending' && now() >= Number(object(existing.metadata)?.deadline)) return advanceStop(session, existing);
      return operationResult(existing);
    }
    await precheckSleepStop(session, timerId, input);
    const current = await listTimers(session);
    const timer = getTimer(current, timerId);
    const timerMeta = metaFor(timerId);
    if (!timerMeta) throw new HttpError(409, 'This timer has no saved app metadata.');
    const ownerId = userId(timer.user);
    if (ownerId == null) throw new HttpError(409, 'The timer owner could not be verified.');
    const callerId = getUserId(session);
    const otherAdult = ownerId !== callerId || timerMeta.adult !== session.adult;
    if (otherAdult && input.confirmOther !== true) throw new HttpError(409, 'Confirm that you want to stop the other adult’s timer.');
    if (!hasDeletePermission(session)) throw new HttpError(403, 'Timer stopping is unavailable for this account.');
    const kind = timerMeta.value.kind;
    const start = iso(timer.start);
    if (!start) throw new HttpError(409, 'The timer start time is invalid.');
    if (input.pause && kind !== 'sleep') throw new HttpError(400, 'Choose a sleep timer.');
    if (nextSide && kind !== 'feed') throw new HttpError(400, 'Choose the other feeding side.');
    if (nextSide && nextSide === timerMeta.value.side) throw new HttpError(400, 'The side changed on another phone. Check the side and switch again.');
    const normalized = normalizeStop(session, timerId, input, kind, timerMeta.value, start, nextSide);
    reconcileRejectedStops(timerId);
    if (stopInProgress(timerId)) throw new HttpError(409, 'This timer is already being stopped. Refresh its status.');
    const { operation } = store.beginOperation({
      id: normalized.operationId, adult: session.adult, resource: 'timers', intent: normalized.intent,
      requestBody: normalized.event, metadata: normalized.metadata,
    });
    return input.automatic ? advanceStop(session, operation) : statusOf(operation);
  }

  async function stop(session: Session, id: string | number, input: StopInput) {
    return stopInternal(session, id, {...input, pause: false, automatic: false});
  }

  async function switchSide(session: Session, id: string | number, input: StopInput & { side?: unknown }) {
    const side = input.side === 'left' ? 'L' : input.side === 'right' ? 'R' : input.side;
    if (side !== 'L' && side !== 'R' && side !== 'bottle') throw new HttpError(400, 'Choose a valid feeding side.');
    return stopInternal(session, id, {...input, pause: false, automatic: false}, side);
  }

  async function completeSwitch(session: Session, op: Operation, eventEnd: string, nextSide: FeedSide, timerOpId: string) {
    const event = object(op.requestBody);
    const note = event?.note as string | undefined;
    const sessionId = String(event?.sid ?? `timer:${object(op.metadata)?.timerId}`);
    const parentIntent = { action: 'start', metadata: { kind: 'feed', side: nextSide, sessionId, note }, switching: true };
    const prior = ensureOperation(timerOpId, session.adult, parentIntent);
    if (prior) {
      const result = await persistTimer(session, prior, { kind: 'feed', side: nextSide, sessionId, note });
      return result.status === 'saved';
    }
    const startInput: Input = { operationId: timerOpId, kind: 'feed', side: nextSide, note };
    const result = await startInternal(session, startInput, { switching: true, startAt: eventEnd, sessionId });
    return result.status === 'saved';
  }

  async function deleteTimer(session: Session, timerId: string): Promise<boolean> {
    if (!hasDeletePermission(session)) return false;
    try {
      await sessions.request(session.sessionId, { resource: 'timers', method: 'DELETE', id: timerId });
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return true;
      return false;
    }
  }

  function advanceStop(session: Session, op: Operation): Promise<Record<string, unknown>> {
    return once(`stop:${op.id}`, () => advanceStopOnce(session, op));
  }

  async function advanceStopOnce(session: Session, first: Operation): Promise<Record<string, unknown>> {
    const op = store.getOperation(first.id) ?? first;
    if (op.state !== 'pending' && op.state !== 'finishing') return operationResult(op);
    const metadata = object(op.metadata);
    const event = object(op.requestBody) as EventBody | null;
    if (!metadata || !event || typeof metadata.timerId !== 'string' || typeof metadata.eventOperationId !== 'string') return operationResult(op);
    if (metadata.correctionRequired === true) return operationResult(op);
    if (typeof metadata.deadline === 'number' && now() < metadata.deadline) return operationResult(op);
    if (!hasDeletePermission(session)) {
      if (op.state === 'pending') store.finishOperation(op.id, 'failed');
      return operationResult(store.getOperation(op.id)!);
    }
    let result: Awaited<ReturnType<Records['createEvent']>>;
    try {
      result = await records.createEvent(session, { operationId: metadata.eventOperationId, event }, op.adult);
    } catch (error) {
      if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
        const current = store.getOperation(op.id);
        if (error.details?.code === 'sleep_overlap' && current) store.updateUnresolvedOperationMetadata(op.id, {...object(current.metadata), overlap: {error: error.message, ...error.details}});
        reconcileRejectedStops(metadata.timerId);
        if (store.getOperation(op.id)?.state === 'pending') store.finishOperation(op.id, 'failed');
        return operationResult(store.getOperation(op.id)!);
      }
      if (op.state === 'pending') store.finishOperation(op.id, 'finishing');
      return operationResult(store.getOperation(op.id)!);
    }
    if (result.status !== 'saved') {
      if (op.state === 'pending') store.finishOperation(op.id, 'finishing');
      return operationResult(store.getOperation(op.id)!);
    }
    let current = store.getOperation(op.id)!;
    if (current.state === 'pending' || current.babyBuddyId !== result.id) {
      store.finishOperation(op.id, 'finishing', result.id);
      current = store.getOperation(op.id)!;
    }
    if (!(await deleteTimer(session, metadata.timerId))) return operationResult(current);
    if (metadata.nextSide === 'L' || metadata.nextSide === 'R' || metadata.nextSide === 'bottle') {
      if (typeof metadata.nextTimerOperationId !== 'string' || !(await completeSwitch(session, current, event.end, metadata.nextSide, metadata.nextTimerOperationId))) return operationResult(current);
    }
    store.completeTimerOperation(op.id, metadata.pause);
    return operationResult(store.getOperation(op.id)!);
  }

  async function operation(session: Session, operationIdValue: string) {
    const id = requireUuid(operationIdValue);
    const op = store.getOperation(id);
    if (!op || op.resource !== 'timers' || op.adult !== session.adult) throw new HttpError(404, 'Operation not found.');
    const metadata = object(op.metadata);
    if (metadata?.action === 'end-paused' && op.state === 'pending') { store.completeTimerOperation(op.id, undefined, String(metadata.pauseId)); return operationResult(store.getOperation(op.id)!); }
    if (metadata?.action === 'auto-stop') return advanceAuto(session, op);
    if (metadata?.action === 'discard' && (op.state === 'pending' || op.state === 'finishing')) return advanceDiscard(session, op);
    if ((op.state === 'pending' || op.state === 'finishing') && metadata?.action === 'stop') return advanceStop(session, op);
    if ((op.state === 'pending' || op.state === 'finishing') && metadata?.action === 'start') return persistTimer(session, op, metadata as TimerMetadata);
    if (op.state === 'pending' && metadata?.action === 'change-start') return applyStart(session, op);
    return operationResult(op);
  }

  async function undo(session: Session, operationIdValue: string) {
    const id = requireUuid(operationIdValue);
    const op = store.getOperation(id);
    if (!op || op.resource !== 'timers' || op.adult !== session.adult) throw new HttpError(404, 'Operation not found.');
    const metadata = object(op.metadata);
    if (op.state !== 'pending' || metadata?.action !== 'stop') throw new HttpError(409, 'The Undo period has ended. Edit the saved entry instead.');
    if (!metadata.correctionRequired && (typeof metadata.deadline !== 'number' || now() >= metadata.deadline)) throw new HttpError(409, 'The Undo period has ended. Edit the saved entry instead.');
    store.finishOperation(op.id, 'cancelled');
    return operationResult(store.getOperation(op.id)!);
  }

  // The sleep check waits first; correctNow then reads the operation again, so a correction accepted meanwhile wins.
  async function correct(session: Session, operationIdValue: string, input: {end?: unknown}) {
    const id = requireUuid(operationIdValue), op = store.getOperation(id), metadata = object(op?.metadata), event = object(op?.requestBody), end = iso(input.end);
    if (!op || op.resource !== 'timers' || op.adult !== session.adult) throw new HttpError(404, 'Operation not found.');
    const span = end && typeof event?.start === 'string' ? Date.parse(end) - Date.parse(event.start) : NaN;
    if (metadata?.kind === 'sleep' && metadata.correctionRequired === true && span > 0 && span <= MAX_PERIOD && Date.parse(end!) <= now()) await requireNoSleepOverlap(session, String(event!.start), end!, 'end');
    return correctNow(session, id, input);
  }

  function correctNow(session: Session, id: string, input: {end?: unknown}) {
    const op = store.getOperation(id);
    if (!op || op.resource !== 'timers' || op.adult !== session.adult) throw new HttpError(404, 'Operation not found.');
    const metadata = object(op.metadata), event = object(op.requestBody);
    if (op.state !== 'pending' || metadata?.correctionRequired !== true || typeof event?.start !== 'string') throw new HttpError(409, 'This timer does not need a corrected end time.');
    const end = iso(input.end), start = Date.parse(event.start);
    if (!end || Date.parse(end) <= start || Date.parse(end) - start > MAX_PERIOD || Date.parse(end) > now()) throw new HttpError(400, 'Choose an end after the start, within 24 hours, and before now.');
    if (!hasDeletePermission(session)) throw new HttpError(403, 'Timer stopping is unavailable for this account.');
    store.correctPendingOperation(id, {...event, end}, {...metadata, correctionRequired: false, originalEnd: event.end, deadline: now() + TEN_SECONDS});
    return operationResult(store.getOperation(id)!);
  }

  return { active, start, pause, resume, endPaused, discard, createEvent, confirmInterruption, changeStart, changeSide, stop, switchSide, undo, operation, correct };
}
