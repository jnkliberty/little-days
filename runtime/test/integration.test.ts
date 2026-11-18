import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../server/app.ts';
import { createCare } from '../server/care.ts';
import { createCareIntegration } from '../server/integration.ts';
import { openStore } from '../server/store.ts';

const session = { sessionId: 'S'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'Adult' };
const operationId = '00000000-0000-4000-8000-000000000001';

async function withServer(run: (origin: string) => Promise<void>, identityId = 17, source?: string) {
  const store = openStore(':memory:');
  store.createSession({ sessionId: session.sessionId, csrfToken: session.csrfToken, adult: session.adult, babyBuddyUserId: 17, expiresAt: Date.now() + 60_000 });
  const sessions = { passcodeSet: () => true, get: (id: string) => id === session.sessionId ? session : null, identityForUser: async (id: number) => ({ id: identityId, username: id === 17 ? 'Adult' : 'Other' }) };
  const care = createCare({ store, sessions, source });
  care.setOptIn(session, { operationId, enabled: true });
  const integration = createCareIntegration({ care, sessions, token: 'invented-service-token', subjectId: 'subject-1', userId: 17 });
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${address.port}`;
  const app = createApp({ sessions: sessions as never, origin, webDir: '.', domain: async () => {}, integration });
  await new Promise<void>(resolve => app.listen(address.port, '127.0.0.1', resolve));
  try { await run(origin); }
  finally { app.closeAllConnections(); await new Promise<void>((resolve, reject) => app.close(error => error ? reject(error) : resolve())); store.close(); }
}

test('care service route authenticates without browser identity and rejects token reuse on legacy routes', async () => {
  await withServer(async origin => {
    const accepted = await fetch(`${origin}/api/integration/v1/care?from=2026-10-25T00:00:00.000Z&to=2026-10-26T00:00:00.000Z`, { headers: { authorization: 'Bearer invented-service-token' } });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get('cache-control'), 'no-store');
    const payload = await accepted.json() as Record<string, unknown>;
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.source, 'little-days');
    assert.equal(payload.subjectId, 'subject-1');
    assert.equal(payload.sourceRevision, '1');
    assert.deepEqual(payload.interval, { from: '2026-10-25T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' });
    assert.equal(payload.coverage, 'confirmed_only');
    assert.deepEqual(payload.intervals, []);
    assert.doesNotMatch(JSON.stringify(payload), /invented-service-token|profile-secret/);
    const refused = await fetch(`${origin}/api/integration/v1/care?from=2026-10-25T00:00:00.000Z&to=2026-10-26T00:00:00.000Z`);
    assert.equal(refused.status, 401);
    const legacy = await fetch(`${origin}/api/state`, { headers: { authorization: 'Bearer invented-service-token' } });
    assert.equal(legacy.status, 401);
    const family = await fetch(`${origin}/api/care`, { headers: { authorization: 'Bearer invented-service-token' } });
    assert.equal(family.status, 401);
    const wrongMethod = await fetch(`${origin}/api/integration/v1/care?from=2026-10-25T00:00:00.000Z&to=2026-10-26T00:00:00.000Z`, { method: 'POST', headers: { authorization: 'Bearer invented-service-token', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(wrongMethod.status, 405);
    const duplicate = await fetch(`${origin}/api/integration/v1/care?from=2026-10-25T00:00:00.000Z&from=2026-10-24T00:00:00.000Z&to=2026-10-26T00:00:00.000Z`, { headers: { authorization: 'Bearer invented-service-token' } });
    assert.equal(duplicate.status, 400);
  });
});

test('a mismatched upstream Baby Buddy identity cannot authorize export', async () => {
  await withServer(async origin => {
    const response = await fetch(`${origin}/api/integration/v1/care?from=2026-10-25T00:00:00.000Z&to=2026-10-26T00:00:00.000Z`, { headers: { authorization: 'Bearer invented-service-token' } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Care sharing is unavailable.' });
  }, 18);
});

test('care payload names its source from the setting so an existing consumer keeps its value', async () => {
  await withServer(async origin => {
    const response = await fetch(`${origin}/api/integration/v1/care?from=2026-10-25T00:00:00.000Z&to=2026-10-26T00:00:00.000Z`, { headers: { authorization: 'Bearer invented-service-token' } });
    assert.equal(((await response.json()) as Record<string, unknown>).source, 'invented-source');
  }, 17, 'invented-source');
});
