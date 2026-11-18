import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { HttpError } from '../server/http.ts';
import { createRouter } from '../server/router.ts';
import { createTimers } from '../server/timers.ts';
import { openStore } from '../server/store.ts';
import { getZone } from '../server/zone.ts';

const fixed = Date.parse('2026-10-25T18:00:00.000Z');
const adultA = { sessionId: 'session-a', csrfToken: 'csrf-a', adult: 'Sage' };
const adultB = { sessionId: 'session-b', csrfToken: 'csrf-b', adult: 'Rowan' };

test('late Undo cannot claim success after a timer was saved', async () => {
  const f = fixture();
  try {
    const start = await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000091', kind: 'feed', side: 'L'});
    f.setNow(fixed + 30000);
    const stop = await f.timers.stop(adultA, String(start.timerId), {operationId: '00000000-0000-4000-8000-000000000092'});
    f.setNow(fixed + 40001);
    const saved = await f.timers.operation(adultA, stop.operationId);
    assert.equal(saved.status, 'saved');
    assert.equal('undoUntil' in saved, false);
    await assert.rejects(f.timers.undo(adultA, stop.operationId), (error: any) => error.status === 409);
    assert.equal(f.rows.length, 0);
  } finally { f.store.close(); }
});

test('a timer over 24 hours waits for a corrected period without losing the original timer', async () => {
  const f = fixture();
  try {
    const start = await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000093', kind: 'feed', side: 'L'});
    f.setNow(fixed + 25 * 3600000);
    const stop = await f.timers.stop(adultA, String(start.timerId), {operationId: '00000000-0000-4000-8000-000000000094'});
    assert.equal(stop.correctionRequired, true);
    assert.equal('undoUntil' in stop, false);
    await f.timers.operation(adultA, stop.operationId);
    assert.equal(f.rows.length, 1);
    assert.equal(f.eventCalls.length, 0);
    await assert.rejects(f.timers.correct(adultA, stop.operationId, {end: new Date(fixed + 25 * 3600000).toISOString()}), (error: any) => error.status === 400);
    const corrected = await f.timers.correct(adultA, stop.operationId, {end: new Date(fixed + 3600000).toISOString()});
    assert.ok(corrected.undoUntil);
    f.setNow(fixed + 25 * 3600000 + 10001);
    assert.equal((await f.timers.operation(adultA, stop.operationId)).status, 'saved');
    assert.equal(f.eventCalls[0].event.end, new Date(fixed + 3600000).toISOString());
    assert.equal(f.rows.length, 0);
  } finally { f.store.close(); }
});

test('two adults cannot start or stop the same timer type concurrently', async () => {
  const f = fixture();
  try {
    const starts = await Promise.allSettled([
      f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000081', kind: 'feed', side: 'L'}),
      f.timers.start(adultB, {operationId: '00000000-0000-4000-8000-000000000082', kind: 'feed', side: 'L'}),
    ]);
    assert.equal(starts.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(f.rows.length, 1);
    f.setNow(fixed + 30000);
    const stops = await Promise.allSettled([
      f.timers.stop(adultA, String(f.rows[0].id), {operationId: '00000000-0000-4000-8000-000000000083', confirmOther: true}),
      f.timers.stop(adultB, String(f.rows[0].id), {operationId: '00000000-0000-4000-8000-000000000084', confirmOther: true}),
    ]);
    assert.equal(stops.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(f.store.pendingOperations().length, 1);
  } finally { f.store.close(); }
});

// Baby Buddy returns a timer start in the server's own offset, not in the text it received.
function babyBuddyText(start: unknown): unknown {
  return typeof start === 'string' && /Z$/.test(start) ? new Date(Date.parse(start) - 6 * 3600_000).toISOString().replace(/\.\d{3}Z$/, '-06:00') : start;
}

function fixture({ sleepListFails = false, deletePermission = true, recordResult = { status: 'saved', id: 'feedings:41' }, loseStartResponse = false, denyDelete = false, badList = false, losePatchResponse = false, denyPatch = false, dropStartRequests = 0, slowRequests = false, slowEvent = false } = {}) {
  const store = openStore(':memory:');
  store.createSession({ sessionId: adultA.sessionId, csrfToken: adultA.csrfToken, adult: adultA.adult, babyBuddyUserId: 17, expiresAt: fixed + 60_000 });
  store.createSession({ sessionId: adultB.sessionId, csrfToken: adultB.csrfToken, adult: adultB.adult, babyBuddyUserId: 18, expiresAt: fixed + 60_000 });
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  if (deletePermission) store.putSetting('user:17', 'timerDeletePermission', true);
  store.putSetting('user:18', 'timerDeletePermission', true);
  store.putSetting('user:17', 'permissions', ['core.change_timer']);
  store.putSetting('user:18', 'permissions', ['core.change_timer']);
  let now = fixed;
  let nextId = 1;
  let lostPatches = losePatchResponse ? 1 : 0;
  let droppedStarts = dropStartRequests;
  const rows: Record<string, unknown>[] = [];
  const sleeps: Record<string, unknown>[] = [];
  let sleepHold: Promise<void> | null = null;
  const requests: { adult: string; resource: string; method: string; id?: string | number; query?: Record<string, string | number>; body?: unknown }[] = [];
  const sessions = {
    async request(sessionId: string, request: { resource: string; method: string; id?: string | number; query?: Record<string, string | number>; body?: unknown }) {
      const actor = sessionId === adultA.sessionId ? adultA : adultB;
      requests.push({ adult: actor.adult, ...request });
      if (request.resource === 'sleep' && request.method === 'GET') {
        if (sleepListFails) throw new HttpError(503, 'sleep list down');
        const hold = sleepHold; sleepHold = null;
        if (hold) await hold;
        return { results: sleeps };
      }
      if (request.resource !== 'timers') throw new Error('unexpected resource');
      if (request.method === 'GET') {
        if (badList) return {};
        if (request.id) {
          const row = rows.find(timer => String(timer.id) === String(request.id));
          if (!row) throw new HttpError(404, 'missing');
          return row;
        }
        return rows.filter(timer => !request.query?.child || Number((timer.child as { id?: number })?.id ?? timer.child) === Number(request.query.child));
      }
      if (request.method === 'POST') {
        if (droppedStarts > 0 && droppedStarts--) throw new Error('network lost before create');
        if (slowRequests) await new Promise(resolve => setTimeout(resolve, 5));
        const body = request.body as Record<string, unknown>;
        const row = { ...body, start: babyBuddyText(body.start), id: nextId++, user: actor === adultA ? 17 : 18 };
        rows.push(row);
        if (loseStartResponse) throw new Error('network lost after create');
        return row;
      }
      if (request.method === 'PATCH') {
        const row = rows.find(timer => String(timer.id) === String(request.id));
        if (!row) throw new HttpError(404, 'missing');
        if (denyPatch) throw new HttpError(403, 'You do not have permission to perform this action.');
        Object.assign(row, request.body);
        if (lostPatches > 0 && lostPatches--) throw new Error('network lost after change');
        return row;
      }
      if (request.method === 'DELETE') {
        if (denyDelete) throw new HttpError(403, 'permission revoked');
        const index = rows.findIndex(timer => String(timer.id) === String(request.id));
        if (index < 0) throw new HttpError(404, 'missing');
        rows.splice(index, 1);
        return null;
      }
      throw new Error(`unexpected method ${request.method}`);
    },
  };
  const eventCalls: { session: unknown; owner?: string; operationId: string; event: Record<string, unknown> }[] = [];
  const records = {
    async createEvent(session: unknown, input: { operationId: string; event: Record<string, unknown> }, owner?: string) {
      eventCalls.push({ session, owner, ...input });
      if (slowEvent) await new Promise(resolve => setTimeout(resolve, 5));
      if (recordResult instanceof Error) throw recordResult;
      return recordResult;
    },
  };
  const logs: string[] = [];
  const timers = createTimers({ store, sessions, records, now: () => now, log: line => logs.push(line) });
  const router = createRouter({ store, timers } as any);
  async function side(session: typeof adultA, timerId: string, input: Record<string, unknown>) {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(input))]), { method: 'POST', headers: { 'content-type': 'application/json' } });
    let result: Record<string, any> = {};
    const res = { writeHead() {}, end(body: string) { result = JSON.parse(body); } };
    await router.handle(req as any, res as any, new URL(`http://127.0.0.1/api/timers/${timerId}/side`), session);
    return result;
  }
  // The next sleep lookup waits until the returned release() runs; later lookups do not wait.
  function holdSleepLookup() { let release!: () => void; sleepHold = new Promise(done => { release = done; }); return release; }
  return { store, rows, sleeps, holdSleepLookup, requests, eventCalls, logs, timers, sessions, side, setNow(value: number) { now = value; } };
}

test('F1: a stale switch reports that another phone changed the side', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000701', kind: 'feed', side: 'L' });
    await f.side(adultB, '1', { operationId: '00000000-0000-4000-8000-000000000702', side: 'R' });
    f.setNow(fixed + 60_000);
    await assert.rejects(f.timers.switchSide(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000703', side: 'R' }), (e: any) => e.status === 400 && e.message === 'The side changed on another phone. Check the side and switch again.');
  } finally { f.store.close(); }
});

test('S5a: another parent corrects the side without taking ownership or saved credit', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000501', kind: 'feed', side: 'L' });
    const changed = await f.side(adultB, '1', { operationId: '00000000-0000-4000-8000-000000000502', side: 'R' });
    assert.equal(changed.status, 'saved');
    assert.equal((await f.timers.active(adultA)).run?.by, adultA.adult);
    await assert.rejects(f.timers.stop(adultB, '1', { operationId: '00000000-0000-4000-8000-000000000503' }), (e: any) => e.status === 409);
    f.setNow(fixed + 60_000);
    const stop = await f.timers.stop(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000504' });
    f.setNow(fixed + 70_000);
    assert.equal((await f.timers.operation(adultA, stop.operationId)).status, 'saved');
    assert.equal(f.eventCalls[0].event.side, 'R');
    assert.equal((f.eventCalls[0].session as typeof adultA).adult, adultA.adult);
  } finally { f.store.close(); }
});

test('S5b: side corrections enforce timer state, permissions and repeat identity', async t => {
  for (const action of ['stop', 'switch'] as const) await t.test(`rejects a pending ${action}`, async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000511', kind: 'feed', side: 'L' });
      f.setNow(fixed + 60_000);
      const input = { operationId: '00000000-0000-4000-8000-000000000512', side: 'R' };
      if (action === 'stop') await f.timers.stop(adultA, '1', input);
      else await f.timers.switchSide(adultA, '1', input);
      await assert.rejects(f.side(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000513', side: 'R' }), (e: any) => e.status === 400 && e.message === 'This timer is stopping. Edit the saved entry instead.');
      assert.equal((f.store.getEventMetadata('timers', '1')?.metadata as any).side, 'L');
    } finally { f.store.close(); }
  });
  await t.test('rejects sleep and invalid sides', async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000521', kind: 'sleep', nap: true });
      await assert.rejects(f.side(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000522', side: 'R' }), (e: any) => e.status === 400);
      await assert.rejects(f.side(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000523', side: 'X' }), (e: any) => e.status === 400);
    } finally { f.store.close(); }
  });
  await t.test('requires the stored timer change permission', async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000531', kind: 'feed', side: 'L' });
      f.store.putSetting('user:17', 'permissions', []);
      await assert.rejects(f.side(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000532', side: 'R' }), (e: any) => e.status === 403);
      assert.equal((f.store.getEventMetadata('timers', '1')?.metadata as any).side, 'L');
    } finally { f.store.close(); }
  });
  await t.test('a saved repeat does not write again, during a stop or after deletion', async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000541', kind: 'feed', side: 'L' });
      const input = { operationId: '00000000-0000-4000-8000-000000000542', side: 'R' };
      const saved = await f.side(adultA, '1', input);
      assert.equal(saved.status, 'saved');
      assert.equal(f.store.getOperation(input.operationId)?.state, 'saved');
      assert.equal(f.store.pendingOperations().length, 0);
      await f.side(adultA, '1', { ...input, operationId: '00000000-0000-4000-8000-000000000543', side: 'B' });
      const reads = f.requests.length;
      assert.deepEqual(await f.side(adultA, '1', input), saved);
      assert.equal(f.requests.length, reads);
      assert.equal((f.store.getEventMetadata('timers', '1')?.metadata as any).side, 'B');
      await assert.rejects(f.side(adultA, '1', { ...input, side: 'L' }), (e: any) => e.status === 409);
      f.setNow(fixed + 60_000);
      const stop = await f.timers.stop(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000544' });
      assert.deepEqual(await f.side(adultA, '1', input), saved);
      f.setNow(fixed + 70_000);
      await f.timers.operation(adultA, stop.operationId);
      assert.equal(f.rows.length, 0);
      assert.deepEqual(await f.side(adultA, '1', input), saved);
      await assert.rejects(f.side(adultA, '1', { ...input, side: 'L' }), (e: any) => e.status === 409);
      assert.equal(f.store.pendingOperations().length, 0);
    } finally { f.store.close(); }
  });
  await t.test('simultaneous repeats write once and preserve the result', async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000551', kind: 'feed', side: 'L' });
      const input = { operationId: '00000000-0000-4000-8000-000000000552', side: 'R' };
      const results = await Promise.all([f.side(adultA, '1', input), f.side(adultA, '1', input)]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[0].status, 'saved');
      assert.equal(f.store.listOperations(adultA.adult, 'timers').length, 2);
      assert.equal(f.store.pendingOperations().length, 0);
    } finally { f.store.close(); }
  });
});

test('S5c: Change start refuses a pending switch without sending a PATCH', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000561', kind: 'feed', side: 'L' });
    f.setNow(fixed + 60_000);
    await f.timers.switchSide(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000562', side: 'R' });
    await assert.rejects(f.timers.changeStart(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000563', start: new Date(fixed - 60_000).toISOString() }), (e: any) => e.status === 400);
    assert.equal(f.requests.some(r => r.method === 'PATCH'), false);
  } finally { f.store.close(); }
});

test('S5d: a stop saved during the side change GET prevents a stale metadata write', async () => {
  const f = fixture();
  const read = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  try {
    await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000571', kind: 'feed', side: 'L' });
    const original = f.sessions.request;
    let delay = true;
    f.sessions.request = async (...args) => {
      const result = await original(...args);
      if (delay && args[1].method === 'GET') {
        delay = false;
        const snapshot = structuredClone(result);
        read.resolve();
        await release.promise;
        return snapshot;
      }
      return result;
    };
    const changing = f.side(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000572', side: 'R' });
    await Promise.race([read.promise, changing]);
    f.setNow(fixed + 60_000);
    const stop = await f.timers.stop(adultB, '1', { operationId: '00000000-0000-4000-8000-000000000573', confirmOther: true });
    f.setNow(fixed + 70_000);
    assert.equal((await f.timers.operation(adultB, stop.operationId)).status, 'saved');
    assert.equal(f.rows.length, 0);
    const before = f.store.getEventMetadata('timers', '1');
    release.resolve();
    await assert.rejects(changing, (e: any) => e.status === 400);
    assert.deepEqual(f.store.getEventMetadata('timers', '1'), before);
    assert.equal(f.store.getOperation('00000000-0000-4000-8000-000000000572'), null);
    assert.equal(f.eventCalls[0].event.side, 'L');
  } finally { release.resolve(); f.store.close(); }
});


test('S2a: an earlier switch ends the first side and starts the next at the typed instant', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000601', kind: 'feed', side: 'L' });
    f.setNow(fixed + 9 * 60_000);
    const switched = await f.timers.switchSide(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000602', side: 'R', at: '2026-10-25T18:05:00.000Z' });
    assert.equal(switched.undoUntil, '2026-10-25T18:09:10.000Z');
    f.setNow(fixed + 9 * 60_000 + 10_000);
    assert.equal((await f.timers.operation(adultA, switched.operationId)).status, 'saved');
    assert.equal(f.eventCalls[0].event.end, '2026-10-25T18:05:00.000Z');
    assert.equal(new Date(String(f.rows[0].start)).toISOString(), '2026-10-25T18:05:00.000Z');
    assert.equal((await f.timers.active(adultA)).run?.side, 'R');
  } finally { f.store.close(); }
});

test('S2b: switch times validate, bind the repeat ID and clamp clock slack before saving', async t => {
  for (const at of ['2026-10-25T17:59:00.000Z', '2026-10-25T18:00:00.000Z', '2026-10-25T18:10:01.000Z', 'invalid']) await t.test(`rejects ${at}`, async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000611', kind: 'feed', side: 'L' });
      f.setNow(fixed + 9 * 60_000);
      await assert.rejects(f.timers.switchSide(adultA, '1', { operationId: '00000000-0000-4000-8000-000000000612', side: 'R', at }), (e: any) => e.status === 400 && e.message === 'Choose a switch time after the start and not in the future.');
      assert.equal(f.store.pendingOperations().length, 0);
    } finally { f.store.close(); }
  });
  await t.test('another at with the same ID gets 409', async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000621', kind: 'feed', side: 'L' });
      f.setNow(fixed + 9 * 60_000);
      const input = { operationId: '00000000-0000-4000-8000-000000000622', side: 'R', at: '2026-10-25T18:05:00.000Z' };
      const pending = await f.timers.switchSide(adultA, '1', input);
      assert.deepEqual(await f.timers.switchSide(adultA, '1', input), pending);
      await assert.rejects(f.timers.switchSide(adultA, '1', { ...input, at: '2026-10-25T18:06:00.000Z' }), (e: any) => e.status === 409);
    } finally { f.store.close(); }
  });
  await t.test('50 seconds of clock slack save at receipt after the ten-second window', async () => {
    const f = fixture();
    try {
      await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000631', kind: 'feed', side: 'L' });
      f.setNow(fixed + 9 * 60_000);
      const input = { operationId: '00000000-0000-4000-8000-000000000632', side: 'R', at: '2026-10-25T18:09:50.000Z' };
      const pending = await f.timers.switchSide(adultA, '1', input);
      assert.equal((f.store.getOperation(input.operationId)?.intent as any).at, input.at);
      f.setNow(fixed + 9 * 60_000 + 10_000);
      assert.equal((await f.timers.operation(adultA, pending.operationId)).status, 'saved');
      assert.equal(f.eventCalls[0].event.end, '2026-10-25T18:09:00.000Z');
      assert.equal(new Date(String(f.rows[0].start)).toISOString(), '2026-10-25T18:09:00.000Z');
      assert.equal(f.store.getOperation(input.operationId)?.state, 'saved');
      await assert.rejects(f.timers.switchSide(adultA, '1', { ...input, at: '2026-10-25T18:09:00.000Z' }), (e: any) => e.status === 409);
    } finally { f.store.close(); }
  });
});

test('an invalid upstream timer list cannot start another timer', async () => {
  const f = fixture({badList: true});
  try {
    await assert.rejects(f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000095', kind: 'feed', side: 'L'}), (error: any) => error.status === 502);
    assert.equal(f.requests.filter(request => request.method === 'POST').length, 0);
  } finally { f.store.close(); }
});

test('active timer start preserves seconds across a clock-minute boundary', async () => {
  const f = fixture();
  try {
    f.setNow(fixed + 30000);
    await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000096', kind: 'feed', side: 'L'});
    f.setNow(fixed + 60000);
    const first = (await f.timers.active(adultA)).run!;
    f.setNow(fixed + 105000);
    const second = (await f.timers.active(adultA)).run!;
    assert.equal(first.t0, 720.5);
    assert.equal(second.t0, first.t0);
    assert.equal(first.startedAt, new Date(fixed + 30000).toISOString());
  } finally { f.store.close(); }
});

test('stop waits ten seconds, records the server receipt time, then saves before deleting timer', async () => {
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000001', kind: 'feed', side: 'L', note: 'check' });
    assert.equal(started.status, 'saved');
    const timerId = String(started.timerId);
    f.setNow(fixed + 30_000);
    const stopped = await f.timers.stop(adultA, timerId, { operationId: '00000000-0000-4000-8000-000000000002' });
    assert.equal(stopped.status, 'pending');
    assert.equal(stopped.undoUntil, new Date(fixed + 40_000).toISOString());
    assert.equal(f.rows.length, 1);
    assert.equal(f.eventCalls.length, 0);
    assert.equal((await f.timers.active(adultA)).run, null);

    f.setNow(fixed + 39_999);
    assert.equal((await f.timers.operation(adultA, stopped.operationId)).status, 'pending');
    assert.equal(f.eventCalls.length, 0);
    f.setNow(fixed + 40_000);
    const result = await f.timers.operation(adultA, stopped.operationId);
    assert.equal(result.status, 'saved');
    assert.deepEqual(f.eventCalls[0].event, {
      type: 'feed', side: 'L', sid: '00000000-0000-4000-8000-000000000001', start: new Date(fixed).toISOString(), end: new Date(fixed + 30_000).toISOString(), note: 'check',
    });
    assert.equal('timer' in f.eventCalls[0].event, false);
    assert.equal(f.rows.length, 0);
    assert.equal(f.requests.filter(call => call.method === 'DELETE').length, 1);
  } finally { f.store.close(); }
});

test('undo before the deadline cancels the stop and leaves the Baby Buddy timer active', async () => {
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000011', kind: 'sleep', nap: true });
    f.setNow(fixed + 30_000);
    const stopped = await f.timers.stop(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000012' });
    const result = await f.timers.undo(adultA, stopped.operationId);
    assert.equal(result.status, 'cancelled');
    assert.equal(f.rows.length, 1);
    assert.equal(f.eventCalls.length, 0);
    f.setNow(fixed + 40_000);
    assert.equal((await f.timers.operation(adultA, stopped.operationId)).status, 'cancelled');
    assert.equal(f.rows.length, 1);
  } finally { f.store.close(); }
});

test('unverified delete permission blocks stop before any event write', async () => {
  const f = fixture({ deletePermission: false });
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000021', kind: 'sleep', nap: false });
    f.setNow(fixed + 30_000);
    await assert.rejects(f.timers.stop(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000022' }), (error: unknown) => error instanceof HttpError && error.status === 403);
    assert.equal(f.eventCalls.length, 0);
    assert.equal(f.rows.length, 1);
    assert.equal(f.requests.some(call => call.method === 'DELETE'), false);
  } finally { f.store.close(); }
});

test('permission revoked before the undo deadline blocks the event write', async () => {
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000023', kind: 'sleep', nap: false });
    f.setNow(fixed + 30_000);
    const stopped = await f.timers.stop(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000024' });
    f.store.putSetting('user:17', 'timerDeletePermission', false);
    f.setNow(fixed + 40_000);
    assert.equal((await f.timers.operation(adultA, stopped.operationId)).status, 'failed');
    assert.equal(f.eventCalls.length, 0);
    assert.equal(f.rows.length, 1);
  } finally { f.store.close(); }
});

test('another adult must confirm and must have the server-side delete grant', async () => {
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000031', kind: 'sleep', nap: false });
    f.setNow(fixed + 30_000);
    await assert.rejects(f.timers.stop(adultB, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000032' }), (error: unknown) => error instanceof HttpError && error.status === 409);
    const accepted = await f.timers.stop(adultB, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000033', confirmOther: true });
    assert.equal(accepted.status, 'pending');
    assert.equal(f.eventCalls.length, 0);
  } finally { f.store.close(); }
});

test('switch side saves and removes the old timer before starting the next side', async () => {
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000034', kind: 'feed', side: 'L', note: 'switch note' });
    f.setNow(fixed + 30_000);
    const switched = await f.timers.switchSide(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000035', side: 'R' });
    f.setNow(fixed + 40_000);
    const result = await f.timers.operation(adultA, switched.operationId);
    assert.equal(result.status, 'saved');
    assert.equal(f.eventCalls.length, 1);
    assert.equal(f.eventCalls[0].event.side, 'L');
    assert.equal(f.rows.length, 1);
    assert.equal(new Date(String(f.rows[0].start)).toISOString(), new Date(fixed + 30_000).toISOString());
    assert.equal(f.store.getEventMetadata('timers', String(f.rows[0].id))?.metadata && (f.store.getEventMetadata('timers', String(f.rows[0].id))?.metadata as Record<string, unknown>).side, 'R');
    assert.deepEqual(f.requests.filter(call => call.method === 'DELETE').map(call => String(call.id)), [String(started.timerId)]);
  } finally { f.store.close(); }
});

test('ambiguous timer creation reconciles one matching timer and never posts twice', async () => {
  const f = fixture({ loseStartResponse: true });
  try {
    const first = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000036', kind: 'sleep', nap: true });
    assert.equal(first.status, 'pending');
    const result = await f.timers.operation(adultA, first.operationId);
    assert.equal(result.status, 'saved');
    assert.equal(f.rows.length, 1);
    assert.equal(f.requests.filter(call => call.method === 'POST').length, 1);
  } finally { f.store.close(); }
});

test('pump stop validates measured sides and stores one total pump event', async () => {
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000041', kind: 'pump', note: 'pump' });
    f.setNow(fixed + 30_000);
    await assert.rejects(f.timers.stop(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000042', amounts: { leftMl: 0, rightMl: 0 } }), /positive/);
    assert.equal(f.rows.length, 1);
    const stopped = await f.timers.stop(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000043', amounts: { leftMl: 35, rightMl: 25 } });
    f.setNow(fixed + 40_000);
    assert.equal((await f.timers.operation(adultA, stopped.operationId)).status, 'saved');
    assert.deepEqual(f.eventCalls[0].event, {
      type: 'pump', leftMl: 35, rightMl: 25, totalMl: 60,
      start: new Date(fixed).toISOString(), end: new Date(fixed + 30_000).toISOString(), note: 'pump',
    });
  } finally { f.store.close(); }
});

test('a known record rejection leaves the original timer active and marks the stop failed', async () => {
  const f = fixture({ recordResult: new HttpError(403, 'denied') });
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000051', kind: 'sleep', nap: false });
    f.setNow(fixed + 30_000);
    const stopped = await f.timers.stop(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000052' });
    f.setNow(fixed + 40_000);
    const result = await f.timers.operation(adultA, stopped.operationId);
    assert.equal(result.status, 'failed');
    assert.equal(f.rows.length, 1);
    assert.equal(f.requests.some(call => call.method === 'DELETE'), false);
  } finally { f.store.close(); }
});

test('upstream delete denial leaves a saved event in finishing and keeps the timer active', async () => {
  const f = fixture({ denyDelete: true });
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000053', kind: 'sleep', nap: false });
    f.setNow(fixed + 30_000);
    const stopped = await f.timers.stop(adultA, String(started.timerId), { operationId: '00000000-0000-4000-8000-000000000054' });
    f.setNow(fixed + 40_000);
    assert.equal((await f.timers.operation(adultA, stopped.operationId)).status, 'finishing');
    assert.equal(f.eventCalls.length, 1);
    assert.equal(f.rows.length, 1);
  } finally { f.store.close(); }
});

test('operation lookup is actor-bound and stop replay cannot change its input', async () => {
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, { operationId: '00000000-0000-4000-8000-000000000061', kind: 'feed', side: 'R' });
    f.setNow(fixed + 30_000);
    const original = { operationId: '00000000-0000-4000-8000-000000000062' };
    const pending = await f.timers.stop(adultA, String(started.timerId), original);
    assert.equal((await f.timers.stop(adultA, String(started.timerId), original)).operationId, pending.operationId);
    await assert.rejects(f.timers.operation(adultB, pending.operationId), (error: unknown) => error instanceof HttpError && error.status === 404);
    await assert.rejects(f.timers.stop(adultA, String(started.timerId), { ...original, note: 'changed' }), (error: unknown) => error instanceof HttpError && error.status === 409);
    assert.equal(f.eventCalls.length, 0);
  } finally { f.store.close(); }
});

const minutesAgo = (minutes: number) => new Date(fixed - minutes * 60_000).toISOString();
const refused = (error: any) => error.status === 400;

test('a timer can start at a typed earlier time, and a start after now or over 12 hours ago is refused', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000201', kind: 'sleep', nap: true, start: minutesAgo(25)});
    assert.equal((f.requests.find(request => request.method === 'POST')!.body as {start: string}).start, minutesAgo(25));
    assert.equal((await f.timers.active(adultA)).sleepRun!.t0, 695);
    for (const [id, start] of [['202', minutesAgo(-2)], ['203', minutesAgo(13 * 60)], ['204', 'soon']]) {
      await assert.rejects(f.timers.start(adultA, {operationId: `00000000-0000-4000-8000-000000000${id}`, kind: 'feed', side: 'L', start}), refused);
    }
    assert.equal(f.requests.filter(request => request.method === 'POST').length, 1);
  } finally { f.store.close(); }
});

test('Change start moves a running timer for either adult, and a start after now or over 12 hours ago is refused', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000205', kind: 'feed', side: 'L'});
    assert.equal((await f.timers.changeStart(adultB, '1', {operationId: '00000000-0000-4000-8000-000000000206', start: minutesAgo(30)})).status, 'saved');
    assert.equal((await f.timers.active(adultA)).run!.t0, 690);
    for (const [id, start] of [['207', minutesAgo(-2)], ['208', minutesAgo(13 * 60)], ['209', undefined]]) {
      await assert.rejects(f.timers.changeStart(adultA, '1', {operationId: `00000000-0000-4000-8000-000000000${id}`, start}), refused);
    }
    await assert.rejects(f.timers.changeStart(adultA, '999', {operationId: '00000000-0000-4000-8000-000000000210', start: minutesAgo(30)}), (error: any) => error.status === 404);
    assert.equal(f.requests.filter(request => request.method === 'PATCH').length, 1);
  } finally { f.store.close(); }
});

test('a lost reply to Change start is confirmed by the operation check, and a refused change is not left pending', async () => {
  const lost = fixture({losePatchResponse: true});
  try {
    await lost.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000211', kind: 'sleep', nap: false});
    const id = '00000000-0000-4000-8000-000000000212';
    await assert.rejects(lost.timers.changeStart(adultA, '1', {operationId: id, start: minutesAgo(20)}));
    assert.equal(lost.store.getOperation(id)?.state, 'pending');
    assert.equal((await lost.timers.operation(adultA, id)).status, 'saved');
    assert.equal((await lost.timers.active(adultA)).sleepRun!.t0, 700);
  } finally { lost.store.close(); }
  const denied = fixture({denyPatch: true});
  try {
    await denied.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000213', kind: 'sleep', nap: false});
    await assert.rejects(denied.timers.changeStart(adultA, '1', {operationId: '00000000-0000-4000-8000-000000000214', start: minutesAgo(20)}), (error: any) => error.status === 403);
    assert.equal(denied.store.getOperation('00000000-0000-4000-8000-000000000214')?.state, 'failed');
  } finally { denied.store.close(); }
});

test('Change start is refused while a stop of that timer waits for Undo', async () => {
  const f = fixture();
  try {
    const start = await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000215', kind: 'feed', side: 'R'});
    f.setNow(fixed + 5 * 60_000);
    await f.timers.stop(adultA, String(start.timerId), {operationId: '00000000-0000-4000-8000-000000000216'});
    await assert.rejects(f.timers.changeStart(adultB, String(start.timerId), {operationId: '00000000-0000-4000-8000-000000000217', start: minutesAgo(10)}), refused);
    assert.equal(f.requests.filter(request => request.method === 'PATCH').length, 0);
  } finally { f.store.close(); }
});

test('a repeated Change start with the same operation ID gets the saved result again', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000218', kind: 'sleep', nap: true});
    const change = {operationId: '00000000-0000-4000-8000-000000000219', start: minutesAgo(15)};
    assert.equal((await f.timers.changeStart(adultA, '1', change)).status, 'saved');
    assert.equal((await f.timers.changeStart(adultA, '1', change)).status, 'saved');
    assert.equal(f.requests.filter(request => request.method === 'PATCH').length, 1);
  } finally { f.store.close(); }
});

test('a Change start left unconfirmed by a lost reply does not block a stop by the other adult', async () => {
  const f = fixture({losePatchResponse: true});
  try {
    await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000220', kind: 'sleep', nap: false});
    await assert.rejects(f.timers.changeStart(adultA, '1', {operationId: '00000000-0000-4000-8000-000000000221', start: minutesAgo(20)}));
    f.setNow(fixed + 5 * 60_000);
    assert.equal((await f.timers.stop(adultB, '1', {operationId: '00000000-0000-4000-8000-000000000222', confirmOther: true})).status, 'pending');
  } finally { f.store.close(); }
});

test('sleep cutoff saves the recorded instant instead of receipt time', async () => {
  const f = fixture();
  try {
    await f.timers.start(adultA, {operationId: '00000000-0000-4000-8000-000000000801', kind: 'sleep', nap: true});
    f.setNow(fixed + 300000);
    const stopped = await f.timers.stop(adultA, '1', {operationId: '00000000-0000-4000-8000-000000000802', at: '2026-10-25T18:02:03.456Z'});
    f.setNow(fixed + 310000);
    await f.timers.operation(adultA, stopped.operationId);
    assert.equal(f.eventCalls[0].event.end, '2026-10-25T18:02:03.456Z');
  } finally { f.store.close(); }
});

// The store stamps operations with the real clock, so an old start is made by moving the fake clock ahead of it.
const later = (ms: number) => Date.now() + ms;
const opId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const posts = (f: ReturnType<typeof fixture>) => f.requests.filter(call => call.method === 'POST').length;

test('T1a: a lost start reply is matched when Baby Buddy writes the start in its own date form', async () => {
  const f = fixture({ loseStartResponse: true });
  try {
    const first = await f.timers.start(adultA, { operationId: opId(801), kind: 'sleep', nap: true });
    assert.equal(first.status, 'pending');
    assert.match(String(f.rows[0].start), /^2026-10-25T12:00:00-06:00$/);
    const result = await f.timers.operation(adultA, String(first.operationId));
    assert.equal(result.status, 'saved');
    assert.equal(result.timerId, '1');
    assert.equal(posts(f), 1);
  } finally { f.store.close(); }
});

test('T1b: a start that never reached Baby Buddy is sent again once it is 30 seconds old, and only then', async () => {
  const f = fixture({ dropStartRequests: 1 });
  try {
    const first = await f.timers.start(adultA, { operationId: opId(802), kind: 'feed', side: 'L' });
    assert.equal(first.status, 'pending');
    assert.equal((await f.timers.operation(adultA, String(first.operationId))).status, 'pending');
    assert.equal(posts(f), 1);
    f.setNow(later(29_000));
    assert.equal((await f.timers.operation(adultA, String(first.operationId))).status, 'pending');
    assert.equal(posts(f), 1);
    f.setNow(later(31_000));
    const result = await f.timers.operation(adultA, String(first.operationId));
    assert.equal(result.status, 'saved');
    assert.equal(posts(f), 2);
    assert.equal(f.rows.length, 1);
    assert.equal(f.store.getEventMetadata('timers', String(result.timerId))?.adult, adultA.adult);
  } finally { f.store.close(); }
});

test('T1c: a start pending for over 10 minutes with no timer in Baby Buddy fails with the retry text and is not sent again', async () => {
  const f = fixture({ dropStartRequests: 5 });
  try {
    const first = await f.timers.start(adultA, { operationId: opId(803), kind: 'feed', side: 'L' });
    f.setNow(later(11 * 60_000));
    const result = await f.timers.operation(adultA, String(first.operationId));
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'The timer did not start. Start it again.');
    assert.equal(posts(f), 1);
    assert.equal(f.store.pendingOperations().length, 0);
  } finally { f.store.close(); }
});

test('T1d: an old pending start no longer blocks another adult from starting that timer', async () => {
  const f = fixture({ dropStartRequests: 1 });
  try {
    const first = await f.timers.start(adultA, { operationId: opId(804), kind: 'feed', side: 'L' });
    f.setNow(later(11 * 60_000));
    const second = await f.timers.start(adultB, { operationId: opId(805), kind: 'feed', side: 'R' });
    assert.equal(second.status, 'saved');
    assert.equal(f.store.getOperation(String(first.operationId))?.state, 'failed');
    assert.equal(f.rows.length, 1);
  } finally { f.store.close(); }
});

test('T1e: an old pending start whose timer exists in Baby Buddy is adopted, and the new start gets 409', async () => {
  const f = fixture({ loseStartResponse: true });
  try {
    const first = await f.timers.start(adultA, { operationId: opId(806), kind: 'feed', side: 'L' });
    assert.equal(first.status, 'pending');
    f.setNow(later(60_000));
    await assert.rejects(f.timers.start(adultB, { operationId: opId(807), kind: 'feed', side: 'R' }), (error: any) => error.status === 409 && error.message === 'A timer of this type is already active.');
    assert.equal(f.store.getOperation(String(first.operationId))?.state, 'saved');
    assert.equal(f.store.getEventMetadata('timers', '1')?.adult, adultA.adult);
    assert.equal(f.rows.length, 1);
    assert.equal(posts(f), 1);
  } finally { f.store.close(); }
});

test('T1f: two simultaneous recovery requests for one start send one create request', async () => {
  const f = fixture({ dropStartRequests: 1, slowRequests: true });
  try {
    const first = await f.timers.start(adultA, { operationId: opId(808), kind: 'sleep', nap: true });
    f.setNow(later(31_000));
    const results = await Promise.all([f.timers.operation(adultA, String(first.operationId)), f.timers.operation(adultA, String(first.operationId))]);
    assert.deepEqual(results.map(result => result.status), ['saved', 'saved']);
    assert.equal(posts(f), 2);
    assert.equal(f.rows.length, 1);
  } finally { f.store.close(); }
});

test('T1g: two simultaneous checks of one stop save one event', async () => {
  const f = fixture({ slowEvent: true });
  try {
    const started = await f.timers.start(adultA, { operationId: opId(811), kind: 'feed', side: 'L' });
    f.setNow(fixed + 30_000);
    const stopped = await f.timers.stop(adultA, String(started.timerId), { operationId: opId(812) });
    f.setNow(fixed + 40_000);
    const results = await Promise.all([f.timers.operation(adultA, String(stopped.operationId)), f.timers.operation(adultA, String(stopped.operationId))]);
    assert.deepEqual(results.map(result => result.status), ['saved', 'saved']);
    assert.equal(f.eventCalls.length, 1);
    assert.equal(f.requests.filter(call => call.method === 'DELETE').length, 1);
  } finally { f.store.close(); }
});

test('T1h: the poll reads only unresolved operations of the adult', async () => {
  const f = fixture();
  try {
    for (let n = 0; n < 3; n++) {
      const started = await f.timers.start(adultA, { operationId: opId(821 + n * 2), kind: 'sleep', nap: true });
      f.setNow(fixed + 30_000 * (n + 1));
      const stopped = await f.timers.stop(adultA, String(started.timerId), { operationId: opId(822 + n * 2) });
      f.setNow(fixed + 30_000 * (n + 1) + 10_000);
      assert.equal((await f.timers.operation(adultA, String(stopped.operationId))).status, 'saved');
    }
    const started = await f.timers.start(adultA, { operationId: opId(830), kind: 'sleep', nap: true });
    f.setNow(fixed + 200_000);
    await f.timers.stop(adultA, String(started.timerId), { operationId: opId(831) });
    let rowsRead = 0;
    const list = f.store.listOperations;
    f.store.listOperations = (...args: Parameters<typeof list>) => { const rows = list(...args); rowsRead += rows.length; return rows; };
    const reply = await f.timers.active(adultA);
    assert.equal(rowsRead, 1);
    assert.equal(reply.sleepRun, null);
    assert.equal('pendingOperations' in reply, false);
  } finally { f.store.close(); }
});

// 2026-11-17 live case: a 3-second sleep was saved at 7:21 PM, then a nap timer was started at 7:00 PM. Every Stop and Pause failed.
const clockAt = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: getZone(), hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
const savedSleep = { id: 95, start: minutesAgo(20), end: new Date(fixed - 20 * 60_000 + 3000).toISOString() };
// The suggested start is the first whole minute after the saved sleep ends, so typing it succeeds.
const crosses = (e: any) => e.status === 400 && e.message === `This nap overlaps the sleep saved from ${clockAt(fixed - 20 * 60_000)} to ${clockAt(fixed - 20 * 60_000 + 3000)}. Change the start to ${clockAt(fixed - 19 * 60_000)} or later, or delete that sleep.`;

test('a sleep timer that crosses a saved sleep is refused at start, Change start, Stop and Pause, with the fix in the message', async () => {
  const f = fixture();
  try {
    f.sleeps.push(savedSleep);
    await assert.rejects(f.timers.start(adultA, {operationId: opId(901), kind: 'sleep', nap: true, start: minutesAgo(40)}), crosses);
    assert.equal(f.rows.length, 0);
    // The suggested minute is accepted; moving the start back across the sleep is refused.
    const started = await f.timers.start(adultA, {operationId: opId(902), kind: 'sleep', nap: true, start: minutesAgo(19)});
    await assert.rejects(f.timers.changeStart(adultA, String(started.timerId), {operationId: opId(903), start: minutesAgo(40)}), crosses);
    // A timer that already crosses it (as on the family computer) gets the reason at Stop and Pause, and stays running.
    f.rows[0].start = minutesAgo(40);
    await assert.rejects(f.timers.stop(adultA, String(started.timerId), {operationId: opId(904)}), crosses);
    await assert.rejects(f.timers.pause(adultA, String(started.timerId), {operationId: opId(905)}), crosses);
    assert.equal(f.store.pendingOperations().length, 0);
    assert.equal(f.rows.length, 1);
    // Touching is not crossing (Baby Buddy uses strict bounds): an end at the saved sleep's start is accepted.
    const touching = await f.timers.stop(adultA, String(started.timerId), {operationId: opId(906), at: savedSleep.start});
    assert.equal(touching.status, 'pending');
  } finally { f.store.close(); }
});

test('the sleep check fails open, yields to a stop in progress, and covers the 24-hour correction', async () => {
  const down = fixture({ sleepListFails: true });
  try {
    down.sleeps.push(savedSleep);
    const started = await down.timers.start(adultA, {operationId: opId(911), kind: 'sleep', nap: true, start: minutesAgo(40)});
    assert.equal((await down.timers.stop(adultA, String(started.timerId), {operationId: opId(912)})).status, 'pending');
  } finally { down.store.close(); }
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, {operationId: opId(913), kind: 'sleep', nap: true, start: minutesAgo(40)});
    await f.timers.stop(adultA, String(started.timerId), {operationId: opId(914)});
    // The first stop saved its sleep; the other adult's Stop must hear "already being stopped", not "delete that sleep".
    f.sleeps.push({ id: 96, start: minutesAgo(40), end: new Date(fixed).toISOString() });
    await assert.rejects(f.timers.stop(adultB, String(started.timerId), {operationId: opId(915), confirmOther: true}), (e: any) => e.status === 409 && /already being stopped/.test(e.message));
  } finally { f.store.close(); }
  const late = fixture();
  try {
    const started = await late.timers.start(adultA, {operationId: opId(916), kind: 'sleep', nap: false});
    late.setNow(fixed + 25 * 3600_000);
    const stop = await late.timers.stop(adultA, String(started.timerId), {operationId: opId(917)});
    assert.equal(stop.correctionRequired, true);
    late.sleeps.push({ id: 97, start: new Date(fixed + 3600_000).toISOString(), end: new Date(fixed + 2 * 3600_000).toISOString() });
    await assert.rejects(late.timers.correct(adultA, stop.operationId, {end: new Date(fixed + 3 * 3600_000).toISOString()}), (e: any) => e.status === 400 && /Choose an end before that sleep starts, or delete that sleep\.$/.test(e.message));
    assert.ok((await late.timers.correct(adultA, stop.operationId, {end: new Date(fixed + 3600_000).toISOString()})).undoUntil);
  } finally { late.store.close(); }
});

const tick = () => new Promise(resolve => setImmediate(resolve));

test('a Stop that waits for the sleep lookup acts on what other phones did meanwhile', async () => {
  // Another phone changes the start during the wait: the stop saves the new start.
  const f = fixture();
  try {
    const started = await f.timers.start(adultA, {operationId: opId(921), kind: 'sleep', nap: true, start: minutesAgo(40)});
    const release = f.holdSleepLookup();
    const stopping = f.timers.stop(adultA, String(started.timerId), {operationId: opId(922)});
    await tick();
    assert.equal((await f.timers.changeStart(adultB, String(started.timerId), {operationId: opId(923), start: minutesAgo(30)})).status, 'saved');
    f.setNow(fixed + 11_000); // a slow lookup must not use up the Undo period
    release();
    const stop = await stopping;
    assert.equal(stop.status, 'pending');
    assert.equal(Date.parse(String(stop.undoUntil)), fixed + 21_000);
    assert.equal((f.store.getOperation(opId(922))!.requestBody as {start: string}).start, minutesAgo(30));
  } finally { f.store.close(); }
  // The other phone stops first and its sleep is saved during the wait: this phone hears "already being stopped".
  const g = fixture();
  try {
    const started = await g.timers.start(adultA, {operationId: opId(924), kind: 'sleep', nap: true, start: minutesAgo(40)});
    const release = g.holdSleepLookup();
    const late = g.timers.stop(adultB, String(started.timerId), {operationId: opId(925), confirmOther: true});
    await tick();
    await g.timers.stop(adultA, String(started.timerId), {operationId: opId(926)});
    g.sleeps.push({ id: 98, start: minutesAgo(40), end: new Date(fixed).toISOString() });
    release();
    await assert.rejects(late, (e: any) => e.status === 409 && /already being stopped/.test(e.message));
  } finally { g.store.close(); }
});
