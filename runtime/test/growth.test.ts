import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecords } from '../server/records.ts';
import { openStore } from '../server/store.ts';
import { HttpError } from '../server/http.ts';
import { createRouter } from '../server/router.ts';
import { createApp } from '../server/app.ts';

const session = { sessionId: 'S'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'Test Adult' };
const permissions = ['core.view_child', 'core.view_weight', 'core.view_height', 'core.view_headcircumference'];
function fixture(request: (input: any) => unknown) {
  const store = openStore(':memory:');
  store.createSession({ ...session, babyBuddyUserId: 17, expiresAt: Date.now() + 60000 });
  store.putSetting('app', 'child', { id: 7, slug: 'test-child' });
  store.putSetting('user:17', 'permissions', permissions);
  const records = createRecords({ store, now: () => new Date('2026-10-29T18:00:00Z'), sessions: {
    request: async (_sid, input) => input.resource === 'children' ? { id: 7 } : request(input),
  } });
  return { store, records };
}

test('growth history includes older measurements, filters other children and future dates, and keeps unknown units unknown', async () => {
  const { store, records } = fixture(input => input.resource === 'weight' ? [
    { id: 1, child: 7, date: '2026-06-01', weight: 3.2 },
    { id: 2, child: 8, date: '2026-07-01', weight: 99 },
    { id: 3, child: 7, date: '2026-11-01', weight: 4 },
  ] : input.resource === 'height' ? [{ id: 4, child: 7, date: '2026-07-01', height: 52 }] : []);
  try {
    store.putEventMetadata({ resource: 'weight', babyBuddyId: '1', adult: 'Test Adult', metadata: { unit: 'kg' } });
    const result = await records.growth(session);
    assert.deepEqual(result.entries.map(entry => entry.id), ['weight:1', 'height:4']);
    assert.equal(result.entries[0].kg, 3.2);
    assert.equal(result.entries[0].date, '2026-06-01');
    assert.equal(result.entries[1].cm, null);
    assert.deepEqual(result.unavailable, []);
  } finally { store.close(); }
});

test('growth permissions exclude denied resources and child access is required', async () => {
  const called: string[] = [];
  const { store, records } = fixture(input => { called.push(input.resource); if (input.resource === 'height') throw new HttpError(403, 'Denied'); return []; });
  try {
    store.putSetting('user:17', 'permissions', permissions.filter(p => p !== 'core.view_weight'));
    const result = await records.growth(session);
    assert.deepEqual(called.sort(), ['head-circumference', 'height']);
    assert.deepEqual(result.unavailable.sort(), ['height', 'weight']);
    store.putSetting('user:17', 'permissions', []);
    await assert.rejects(records.growth(session), (error: any) => error.status === 403);
  } finally { store.close(); }
});

test('growth history paginates, removes repeated record IDs, and propagates failed reads', async () => {
  const offsets: number[] = [];
  const { store, records } = fixture(input => {
    if (input.resource !== 'weight') return [];
    offsets.push(input.query.offset);
    return input.query.offset === 0 ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1, child: 7, date: '2026-06-01', weight: 3 })) : [{ id: 1, child: 7, date: '2026-06-01', weight: 3 }];
  });
  try {
    const result = await records.growth(session);
    assert.equal(result.entries.length, 100);
    assert.deepEqual(offsets, [0, 100]);
  } finally { store.close(); }
  const failed = fixture(() => { throw new HttpError(502, 'Upstream failed'); });
  try { await assert.rejects(failed.records.growth(session), (error: any) => error.status === 502); }
  finally { failed.store.close(); }
});

test('growth route requires a household session and returns private history through the real router', async () => {
  const { store, records } = fixture(() => []);
  const router = createRouter({ store, records } as any);
  const sessions = { passcodeSet: () => true, get: (id: string) => id === session.sessionId ? session : null, renew: () => {} };
  const app = createApp({ sessions: sessions as any, origin: 'https://little-days.test', webDir: '.', domain: router.handle, integration: async () => {} });
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  const address = app.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/growth`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers: { cookie: `__Host-little-days=${session.sessionId}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { entries: [], unavailable: [], childId: 7 });
  } finally {
    app.closeAllConnections();
    await new Promise<void>(resolve => app.close(() => resolve()));
    store.close();
  }
});
