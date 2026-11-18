import assert from 'node:assert/strict';
import test from 'node:test';
import { createCare } from '../server/care.ts';
import { openStore } from '../server/store.ts';
import { HttpError } from '../server/http.ts';

const session = { sessionId: 'S'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'Adult' };
const other = { sessionId: 'O'.repeat(43), csrfToken: 'D'.repeat(43), adult: 'Other' };
const operationId = (n: string) => `00000000-0000-4000-8000-0000000000${n}`;

function fixture() {
  const store = openStore(':memory:');
  store.createSession({ sessionId: session.sessionId, csrfToken: session.csrfToken, adult: session.adult, babyBuddyUserId: 17, expiresAt: Date.now() + 60_000 });
  store.createSession({ sessionId: other.sessionId, csrfToken: other.csrfToken, adult: other.adult, babyBuddyUserId: 18, expiresAt: Date.now() + 60_000 });
  const sessions = { get: (id: string) => id === session.sessionId ? session : id === other.sessionId ? other : null };
  const care = createCare({ store, sessions });
  return { store, care };
}

test('care confirmations are self-only, idempotent, revocable, and export only with opt-in', () => {
  const { store, care } = fixture();
  try {
    assert.throws(() => care.export('2026-10-25T00:00:00.000Z', '2026-10-26T00:00:00.000Z', { subjectId: 'subject-1', userId: 17 }), (error: unknown) => error instanceof HttpError && error.status === 503);
    const input = { operationId: operationId('01'), start: '2026-10-25T01:00:00.000Z', end: '2026-10-25T02:00:00.000Z' };
    const first = care.confirm(session, input);
    assert.deepEqual(care.confirm(session, input), first);
    assert.equal(care.list(other).confirmations.length, 0);
    care.setOptIn(session, { operationId: operationId('02'), enabled: true });
    const result = care.export('2026-10-25T02:00:00.000Z', '2026-10-25T03:00:00.000Z', { subjectId: 'subject-1', userId: 17 });
    assert.equal(result.intervals.length, 0, 'touching interval edges do not overlap');
    assert.equal(care.export('2026-10-25T01:30:00.000Z', '2026-10-25T02:30:00.000Z', { subjectId: 'subject-1', userId: 17 }).intervals.length, 1);
    assert.throws(() => care.export('2026-10-25T00:00:00.000Z', '2026-10-26T00:00:00.000Z', { subjectId: 'subject-1', userId: 18 }), (error: unknown) => error instanceof HttpError && error.status === 503);
    care.revoke(session, first.id, { operationId: operationId('03') });
    assert.deepEqual(care.revoke(session, first.id, { operationId: operationId('03') }), { revoked: true });
    assert.deepEqual(care.confirm(session, input), first, 'replaying an earlier confirmation does not restore a later-revoked period');
    assert.equal(care.export('2026-10-25T00:00:00.000Z', '2026-10-26T00:00:00.000Z', { subjectId: 'subject-1', userId: 17 }).intervals.length, 0);
    assert.throws(() => care.revoke(other, first.id, { operationId: operationId('04') }), (error: unknown) => error instanceof HttpError && error.status === 404);
    care.setOptIn(session, { operationId: operationId('05'), enabled: false });
    assert.throws(() => care.export('2026-10-25T00:00:00.000Z', '2026-10-26T00:00:00.000Z', { subjectId: 'subject-1', userId: 17 }), (error: unknown) => error instanceof HttpError && error.status === 503);
    care.setOptIn(other, { operationId: operationId('06'), enabled: true });
    assert.throws(() => care.export('2026-10-25T00:00:00.000Z', '2026-10-26T00:00:00.000Z', { subjectId: 'subject-1', userId: 17 }), (error: unknown) => error instanceof HttpError && error.status === 503);
    assert.equal(store.listCareActions(17).length, 4);
  } finally { store.close(); }
});

test('care input rejects overlong intervals and source windows over 31 days', () => {
  const { store, care } = fixture();
  try {
    assert.throws(() => care.confirm(session, { operationId: operationId('06'), start: '2026-10-25T00:00:00.000Z', end: '2026-10-26T00:00:01.000Z' }), (error: unknown) => error instanceof HttpError && error.status === 400);
    care.setOptIn(session, { operationId: operationId('07'), enabled: true });
    assert.throws(() => care.export('2026-10-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z', { subjectId: 'subject-1', userId: 17 }), (error: unknown) => error instanceof HttpError && error.status === 400);
  } finally { store.close(); }
});
