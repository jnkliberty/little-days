import { HttpError } from './http.ts';
import type { SessionService } from './session.ts';
import type { Store, CareAction } from './store.ts';

type Session = { sessionId: string; csrfToken: string; adult: string };
type Sessions = Pick<SessionService, 'get'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function createCare({ store, sessions, source = 'little-days' }: { store: Store; sessions: Sessions; source?: string }) {
  function userId(session: Session): number {
    const live = sessions.get(session.sessionId), stored = store.getSession(session.sessionId);
    if (!live || !stored || live.adult !== session.adult) throw new HttpError(401, 'Sign in again.');
    return stored.babyBuddyUserId;
  }
  function operation(value: unknown): string {
    if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'Use a valid save ID.');
    return value;
  }
  function actions(id: number): CareAction[] { return store.listCareActions(id); }
  function current(id: number) {
    const rows = actions(id), confirmed = new Map<string, { id: string; start: string; end: string; confirmedAt: string; revision: string }>();
    let optIn = false;
    for (const row of rows) {
      if (row.action === 'opt_in') optIn = row.value === true;
      if (!row.confirmationId) continue;
      if (row.action === 'revoke') confirmed.delete(row.confirmationId);
      if (row.action === 'confirm' && record(row.value)) confirmed.set(row.confirmationId, { id: row.confirmationId, start: String(row.value.start), end: String(row.value.end), confirmedAt: row.createdAt, revision: row.revision });
    }
    return { rows, optIn, confirmations: [...confirmed.values()] };
  }
  function list(session: Session) {
    const state = current(userId(session));
    return { exportOptIn: state.optIn, confirmations: state.confirmations, dutyHistory: store.listDutyHistory() };
  }
  function confirm(session: Session, input: unknown) {
    const id = userId(session);
    if (!record(input) || Object.keys(input).sort().join(',') !== 'end,operationId,start' || !iso(input.start) || !iso(input.end) || Date.parse(input.end) <= Date.parse(input.start) || Date.parse(input.end) - Date.parse(input.start) > 86_400_000) throw new HttpError(400, 'Enter a valid care period of 24 hours or less.');
    const op = operation(input.operationId), confirmationId = op;
    let saved;
    try { saved = store.appendCareAction({ userId: id, operationId: op, action: 'confirm', confirmationId, value: { start: input.start, end: input.end }, createdAt: new Date().toISOString() }); }
    catch (error) { if (error instanceof Error && error.message.includes('reused with different input')) throw new HttpError(409, 'This save ID already has different data.'); throw error; }
    const value = saved.action.value as { start: string; end: string };
    return { id: confirmationId, ...value, confirmedAt: saved.action.createdAt, revision: saved.action.revision };
  }
  function revoke(session: Session, confirmationId: string, input: unknown) {
    if (!record(input) || Object.keys(input).join(',') !== 'operationId') throw new HttpError(400, 'Use a valid save ID.');
    const id = userId(session), op = operation(record(input) ? input.operationId : null), state = current(id);
    const replay = state.rows.find(row => row.operationId === op);
    if (replay) {
      if (replay.action !== 'revoke' || replay.confirmationId !== confirmationId) throw new HttpError(409, 'This save ID already has different data.');
      return { revoked: true };
    }
    if (!state.confirmations.some(item => item.id === confirmationId)) throw new HttpError(404, 'Confirmation not found.');
    try { store.appendCareAction({ userId: id, operationId: op, action: 'revoke', confirmationId, value: null, createdAt: new Date().toISOString() }); }
    catch (error) { if (error instanceof Error && error.message.includes('reused with different input')) throw new HttpError(409, 'This save ID already has different data.'); throw error; }
    return { revoked: true };
  }
  function setOptIn(session: Session, input: unknown) {
    const id = userId(session);
    if (!record(input) || Object.keys(input).sort().join(',') !== 'enabled,operationId' || typeof input.enabled !== 'boolean') throw new HttpError(400, 'Choose whether to share your care confirmations.');
    try { store.appendCareAction({ userId: id, operationId: operation(input.operationId), action: 'opt_in', confirmationId: null, value: input.enabled, createdAt: new Date().toISOString() }); }
    catch (error) { if (error instanceof Error && error.message.includes('reused with different input')) throw new HttpError(409, 'This save ID already has different data.'); throw error; }
    return { exportOptIn: current(id).optIn };
  }
  function exportCare(from: string, to: string, mapping: { subjectId?: string; userId?: number }) {
    const start = Date.parse(from), end = Date.parse(to);
    if (!iso(from) || !iso(to) || end <= start || end - start > 31 * 86_400_000) throw new HttpError(400, 'Use a valid UTC window of 31 days or less.');
    if (!mapping.subjectId || !Number.isSafeInteger(mapping.userId) || Number(mapping.userId) < 1) throw new HttpError(503, 'Care sharing is unavailable.');
    const state = current(Number(mapping.userId));
    if (!state.optIn) throw new HttpError(503, 'Care sharing is unavailable.');
    const intervals = state.confirmations.filter(item => Date.parse(item.start) < end && Date.parse(item.end) > start);
    if (intervals.length > 1000) throw new HttpError(503, 'Care sharing is unavailable.');
    return { schemaVersion: 1, source: source || 'little-days', subjectId: mapping.subjectId, interval: { from, to }, generatedAt: new Date().toISOString(), sourceRevision: state.rows.at(-1)?.revision || '0', coverage: 'confirmed_only', intervals };
  }
  return { list, confirm, revoke, setOptIn, export: exportCare };
}
