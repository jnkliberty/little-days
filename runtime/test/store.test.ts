import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../server/store.ts';

test('store keeps session hashes and replays matching operations without a duplicate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-store-'));
  const path = join(dir, 'sidecar.sqlite');
  const store = openStore(path);
  try {
    assert.equal(statSync(path).mode & 0o777, 0o600);
    store.createSession({ sessionId: 'app-session-secret', adult: 'Sage', babyBuddyUserId: 17, csrfToken: 'csrf-secret', expiresAt: Date.now() + 60_000 });
    assert.equal(store.getSession('app-session-secret')?.adult, 'Sage');
    assert.equal(store.getSession('other-session'), null);

    const operation = { id: '00000000-0000-4000-8000-000000000001', adult: 'Sage', resource: 'changes', intent: { action: 'create' }, requestBody: { child: 1, wet: true }, metadata: { texture: 'soft' } };
    assert.equal(store.beginOperation(operation).created, true);
    const replay = store.beginOperation(operation);
    assert.equal(replay.created, false);
    assert.equal(replay.operation.requestBody.child, 1);
    assert.equal(store.beginOperation({ ...operation, requestBody: { wet: true, child: 1 } }).created, false);
    assert.throws(() => store.beginOperation({ ...operation, adult: 'Rowan' }), /operation id reused/);
    store.finishOperation(operation.id, 'cancelled');
    assert.equal(store.getOperation(operation.id)?.state, 'cancelled');
    assert.equal(store.listOperations('Sage', 'changes').length, 1);
    assert.equal(store.listOperations('Rowan', 'changes').length, 0);
    assert.throws(() => store.finishOperation(operation.id, 'pending'), /state transition/);

    store.putEventMetadata({ resource: 'changes', babyBuddyId: '42', adult: 'Sage', metadata: { texture: 'soft' } });
    assert.deepEqual(store.getEventMetadata('changes', '42')?.metadata, { texture: 'soft' });
    store.putSetting('user:17', 'units', { volume: 'ml', temperature: 'C' });
    assert.deepEqual(store.getSetting('user:17', 'units'), { volume: 'ml', temperature: 'C' });
    assert.throws(() => store.putSetting('user:17', 'bad/key', true), /setting key/);
    store.putAppEvent({ id: 'bath-1', adult: 'Rowan', kind: 'bath', occurredAt: '2026-10-25T09:00:00-06:00', details: { durationMinutes: 5 } });
    assert.equal(store.listAppEvents('2026-10-25', '2026-10-26').length, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
