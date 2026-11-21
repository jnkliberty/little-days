import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Readable } from 'node:stream';
import { HttpError } from '../server/http.ts';
import { mapBabyBuddyRecord, mapEvent } from '../server/mapping.ts';
import { createRecords } from '../server/records.ts';
import { createTimers } from '../server/timers.ts';
import { openStore } from '../server/store.ts';
import { createRouter } from '../server/router.ts';

const overlapMessage = 'This time overlaps another entry. Change the start or end.';
const changedMessage = 'This entry changed on another phone. Close it and open it again.';
const splitMessage = 'The split was not saved. Nothing changed. Try again.';
const splitBefore = { start: '2026-10-25T14:00:10.000Z', end: '2026-10-25T16:00:50.000Z' };
const splitTimes = { wokeAt: '2026-10-25T15:00:00.000Z', sleptAt: '2026-10-25T15:10:00.000Z', expected: splitBefore };
const testId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function splitFixture() {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'fake' });
  const rows = new Map<string, any>([['sleep:42', { id: 42, child: 7, ...splitBefore, nap: true, notes: 'Fake note' }]]);
  store.putEventMetadata({ resource: 'sleep', babyBuddyId: '42', adult: 'Fake parent', metadata: { appType: 'sleep', childId: 7 } });
  const writes: any[] = [];
  const lists: any[] = [];
  const clock = { value: fixedNow.getTime() };
  const fault = { post: '', patch: '', restore: '', late: null as any, beforeRestore: null as null | (() => void) };
  function apply(input: any) {
    const key = `${input.resource}:${input.id || 43}`;
    const row = { ...(rows.get(key) || { id: 43 }), ...input.body };
    for (const [otherKey, other] of rows) {
      if (otherKey === key || !otherKey.startsWith(`${input.resource}:`) || other.child !== row.child) continue;
      if (Date.parse(row.start) < Date.parse(other.end) && Date.parse(row.end) > Date.parse(other.start)) {
        throw Object.assign(new HttpError(400, 'Baby Buddy rejected this entry.'), { code: 'period_intersection' });
      }
    }
    rows.set(key, row);
    return structuredClone(row);
  }
  const sessions = { people: () => ['Rowan', 'Sage', 'Wren'], request: async (_sid: string, input: any) => {
    if (input.method === 'GET') {
      if (input.resource === 'children') return { id: 7, slug: 'fake', first_name: 'Fake', birth_date: '2026-10-01' };
      if (!input.id) lists.push(input.query);
      if (!input.id) return [...rows].filter(([key]) => key.startsWith(`${input.resource}:`)).map(([, row]) => structuredClone(row));
      const row = rows.get(`${input.resource}:${input.id}`);
      if (!row) throw new HttpError(404, 'Fake row missing.');
      return structuredClone(row);
    }
    writes.push(structuredClone(input));
    const restore = input.method === 'PATCH' && input.body.end === splitBefore.end;
    if (restore) fault.beforeRestore?.();
    const mode = input.method === 'POST' ? fault.post : restore ? fault.restore : fault.patch;
    if (mode === 'refuse') throw new HttpError(400, 'Fake POST refused.');
    if (mode === 'before') throw new Error('Fake lost reply before write.');
    if (mode === 'late') { fault.late = () => apply(input); throw new Error('Fake late PATCH.'); }
    const row = apply(input);
    if (mode === 'after') throw new Error('Fake lost reply after write.');
    return row;
  }};
  const fresh = () => createRecords({ store, sessions, now: () => new Date(clock.value) });
  let records = fresh();
  async function call(method: string, path: string, payload: any) {
    const timers = createTimers({store, sessions, records, now: () => clock.value});
    const router = createRouter({ store, records, timers, household: { state: async () => { throw new Error('No refresh in fake.'); } } } as any);
    let code = 0, body: any;
    const req = Readable.from([Buffer.from(JSON.stringify(payload))]);
    Object.assign(req, { method, headers: { 'content-type': 'application/json' } });
    const res = { writeHead: (value: number) => { code = value; }, end: (value: string) => { body = JSON.parse(value); } };
    try { await router.handle(req as any, res as any, new URL(`http://127.0.0.1${path}`), session); }
    catch (error: any) { code = error.status || 500; body = { error: error.message }; }
    return { code, body };
  }
  return { store, rows, writes, lists, fault, clock, apply, call,
    state: () => records.state(session),
    split: (id: string, split = splitTimes, target = 'sleep:42') => call('POST', `/api/events/${encodeURIComponent(target)}/split`, { operationId: id, split }),
    recover: (id: string) => { records = fresh(); return records.operation(session, id); },
  };
}

const pastDiaper = { type: 'diaper', kind: 'W', time: '2026-10-25T14:00:00.000Z' };
test('a manual sleep overlapping a saved sleep explains the refusal and preserves the saved record', async () => {
  const f = splitFixture(), operationId = testId(980);
  const before = structuredClone(f.rows.get('sleep:42'));
  try {
    const reply = await f.call('POST', '/api/events', { operationId, event: { type: 'sleep', nap: true, ...splitBefore } });
    assert.equal(reply.code, 400);
    // The refusal names the saved sleep it crosses (sleep-overlap.test.ts holds the details).
    assert.equal(reply.body.error, 'This time overlaps the sleep saved from 8:00 to 10:00 AM. Change the start or end, or delete that sleep in the timeline.');
    assert.equal(f.store.getOperation(operationId)?.state, 'failed');
    assert.deepEqual([...f.rows.values()], [before]);
  } finally { f.store.close(); }
});

test('state hides denied local feeding and activity records and unknown local kinds', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', {id: 7, slug: 'ada'});
  store.putSetting('user:17', 'permissions', ['core.view_child', 'core.view_note']);
  for (const [index, kind] of ['feeding-overlap', 'bath', 'tummy', 'unknown', 'appointment'].entries()) {
    store.putAppEvent({id: testId(700 + index), adult: 'Rowan', kind, occurredAt: '2026-10-25T14:00:00Z', details: {childId: 7, entry: {type: kind === 'feeding-overlap' ? 'feed' : 'other', what: kind}}});
  }
  const records = createRecords({store, now: () => fixedNow, sessions: {request: async (_id, request) => request.resource === 'children' ? {id: 7, slug: 'ada'} : []}});
  try {
    assert.deepEqual((await records.state(session)).entries.map(entry => entry.id), ['app:' + testId(704)]);
  } finally {store.close();}
});
const pastBath = { type: 'other', what: 'bath', completed: true, time: '2026-10-25T14:00:00.000Z' };

test('B1 a chosen adult reaches Baby Buddy and overlapping feed state', async t => {
  for (const overlap of [false, true]) await t.test(overlap ? 'overlapping feed' : 'Baby Buddy', async () => {
    const f = splitFixture(), id = testId(401);
    const event = overlap ? { type: 'feed', side: 'L', start: splitBefore.start, end: splitBefore.end } : pastDiaper;
    if (overlap) f.rows.set('feedings:42', { id: 42, child: 7, ...splitBefore });
    try {
      const result = await f.call('POST', '/api/events', { operationId: id, event: { ...event, by: 'Rowan' } });
      assert.equal(result.body.status, 'saved');
      assert.equal((await f.state()).entries.find(e => e.id === result.body.id)?.by, 'Rowan');
      assert.equal(f.store.getOperation(id)?.adult, session.adult);
    } finally { f.store.close(); }
  });
});

test('B2 lost replies recover the chosen adult for Baby Buddy and app-only entries', async t => {
  for (const local of [false, true]) await t.test(local ? 'app-only' : 'Baby Buddy', async () => {
    const f = splitFixture(), id = testId(402), put = f.store.putAppEvent;
    if (local) f.store.putAppEvent = () => { throw new Error('Fake interrupted local save.'); };
    else f.fault.post = 'after';
    try {
      const result = await f.call('POST', '/api/events', { operationId: id, event: { ...(local ? pastBath : pastDiaper), by: 'Rowan' } });
      assert.equal(result.body.status, 'pending');
      f.store.putAppEvent = put;
      const recovered = await f.recover(id);
      assert.equal(recovered.status, 'saved');
      assert.equal((await f.state()).entries.find(e => e.id === recovered.id)?.by, 'Rowan');
      assert.equal(f.writes.length, local ? 0 : 1);
    } finally { f.store.putAppEvent = put; f.store.close(); }
  });
});

test('B3 unknown logged-by is refused before any write; no choice keeps the signed-in adult', async () => {
  const f = splitFixture();
  try {
    const refused = await f.call('POST', '/api/events', { operationId: testId(403), event: { ...pastDiaper, by: 'Fake outsider' } });
    assert.equal(refused.code, 400);
    assert.equal(refused.body.error, 'Choose who logged this.');
    assert.equal(f.writes.length, 0);
    assert.equal(f.store.getOperation(testId(403)), null);
    const added = await f.call('POST', '/api/events', { operationId: testId(404), event: pastDiaper });
    assert.equal((await f.state()).entries.find(e => e.id === added.body.id)?.by, session.adult);
  } finally { f.store.close(); }
});

test('B4 edits change or keep the saved adult, including recovery and save-ID conflicts', async t => {
  for (const mode of ['Baby Buddy', 'lost Baby Buddy reply', 'app-only', 'lost app-only reply']) await t.test(mode, async () => {
    const f = splitFixture(), local = mode.includes('app-only'), lost = mode.startsWith('lost'), put = f.store.putAppEvent;
    const event = local ? pastBath : pastDiaper;
    try {
      const added = await f.call('POST', '/api/events', { operationId: testId(405), event });
      const path = `/api/events/${added.body.id}`, edit = { operationId: testId(406), event: { ...event, by: 'Rowan' } };
      if (lost && local) f.store.putAppEvent = () => { throw new Error('Fake interrupted edit.'); };
      if (lost && !local) f.fault.patch = 'after';
      const changed = await f.call('PATCH', path, edit);
      assert.equal(changed.body.status, lost ? 'pending' : 'saved');
      f.store.putAppEvent = put;
      if (lost) assert.equal((await f.recover(edit.operationId)).status, 'saved');
      assert.equal((await f.state()).entries.find(e => e.id === added.body.id)?.by, 'Rowan');
      assert.equal((await f.call('PATCH', path, { ...edit, event: { ...event, by: 'Wren' } })).code, 409);
      f.fault.patch = '';
      assert.equal((await f.call('PATCH', path, { operationId: testId(407), event })).body.status, 'saved');
      assert.equal((await f.state()).entries.find(e => e.id === added.body.id)?.by, 'Rowan');
      assert.equal((await f.call('PATCH', path, { operationId: testId(408), event: { ...event, by: 'Fake outsider' } })).code, 400);
      assert.equal(f.store.getOperation(testId(406))?.adult, session.adult);
    } finally { f.store.putAppEvent = put; f.store.close(); }
  });
});

test('F1 state keeps exact feed and sleep milliseconds', async () => {
  const f = splitFixture();
  const period = { start: '2026-10-25T14:00:10.123Z', end: '2026-10-25T16:00:50.456Z' };
  f.rows.set('feedings:43', { id: 43, child: 7, ...period, type: 'breast milk', method: 'right breast', notes: '' });
  Object.assign(f.rows.get('sleep:42'), period);
  try {
    const state = await f.state() as any;
    for (const id of ['feedings:43', 'sleep:42']) {
      const entry = state.entries.find((e: any) => e.id === id);
      assert.equal(entry.startISO, period.start); assert.equal(entry.endISO, period.end);
    }
  } finally { f.store.close(); }
});

test('F2 old-page edits omit expected; malformed expected is refused', async () => {
  const f = splitFixture(), event = { type: 'sleep', nap: true, ...splitBefore };
  try {
    assert.equal((await f.call('PATCH', '/api/events/sleep:42', { operationId: testId(301), event })).body.status, 'saved');
    assert.equal((await f.call('PATCH', '/api/events/sleep:42', { operationId: testId(302), event: { ...event, expected: null } })).code, 400);
    assert.equal(f.writes.length, 1);
  } finally { f.store.close(); }
});

test('F6 split requires zones and normalizes offset clocks', async () => {
  const f = splitFixture();
  try {
    assert.equal((await f.split(testId(303), { ...splitTimes, wokeAt: '2026-10-25T15:00:00' })).code, 400);
    assert.equal(f.writes.length, 0);
    assert.equal((await f.split(testId(304), { ...splitTimes, wokeAt: '2026-10-25T09:00:00-06:00', sleptAt: '2026-10-25T09:10:00-06:00' })).body.status, 'saved');
    assert.equal(f.writes[0].body.end, splitTimes.wokeAt);
    assert.equal(f.writes[1].body.start, splitTimes.sleptAt);
  } finally { f.store.close(); }
});

test('F8 app-only feed edit keeps expected out of stored data and state', async () => {
  const f = splitFixture(), event = { type: 'feed', side: 'L', ...splitBefore, expected: splitBefore };
  f.store.putAppEvent({ id: 'fake', adult: session.adult, kind: 'feeding-overlap', occurredAt: splitBefore.start, details: { childId: 7, entry: { type: 'feed', t: 480, dur: 120 }, event: {} } });
  try {
    assert.equal((await f.call('PATCH', '/api/events/app:fake', { operationId: testId(305), event })).body.status, 'saved');
    const details = f.store.getAppEvent('fake')!.details as any;
    assert.equal(Object.hasOwn(details.entry, 'expected'), false);
    assert.equal(Object.hasOwn(details.event, 'expected'), false);
    const state = await f.state() as any;
    assert.equal(Object.hasOwn(state.entries.find((e: any) => e.id === 'app:fake'), 'expected'), false);
  } finally { f.store.close(); }
});

test('T1 an overlapping edit returns its useful 400 message and fails the operation', async () => {
  const f = splitFixture(), id = testId(201);
  f.rows.set('sleep:41', { id: 41, child: 7, start: '2026-10-25T13:00:00Z', end: splitBefore.start });
  try {
    const reply = await f.call('PATCH', '/api/events/sleep:42', { operationId: id, event: { type: 'sleep', nap: true, start: '2026-10-25T14:00:00Z', end: splitBefore.end, expected: splitBefore } });
    assert.equal(reply.code, 400);
    assert.equal(reply.body.error, 'This time overlaps the sleep saved from 7:00 to 8:00 AM. Change the start or end, or delete that sleep in the timeline.');
    assert.equal(f.store.getOperation(id)?.state, 'failed');
    assert.deepEqual(f.rows.get('sleep:42'), { id: 42, child: 7, ...splitBefore, nap: true, notes: 'Fake note' });
  } finally { f.store.close(); }
});

test('T2 stale sleep and feed edits fail before PATCH; saved IDs replay once', async t => {
  for (const [type, resource] of [['sleep', 'sleep'], ['feed', 'feedings']]) await t.test(type, async () => {
    const f = splitFixture(), id = testId(202), target = `${resource}:42`;
    f.rows.set(target, { id: 42, child: 7, ...splitBefore, nap: true, type: 'breast milk', method: 'left breast', notes: '' });
    const event = { type, nap: true, side: 'L', ...splitBefore, expected: { ...splitBefore, start: '2026-10-25T14:00:09.000Z' } };
    try {
      const stale = await f.call('PATCH', `/api/events/${target}`, { operationId: id, event });
      assert.equal(stale.code, 409); assert.equal(stale.body.error, changedMessage); assert.equal(f.writes.length, 0);
      assert.equal(f.store.getOperation(id)?.state, 'failed');
      const freshEvent = { ...event, end: '2026-10-25T16:01:00Z', expected: splitBefore };
      const fresh = { operationId: testId(203), event: freshEvent };
      assert.equal((await f.call('PATCH', `/api/events/${target}`, fresh)).body.status, 'saved');
      assert.equal((await f.call('PATCH', `/api/events/${target}`, fresh)).body.status, 'saved');
      assert.equal(f.writes.length, 1);
    } finally { f.store.close(); }
  });
});

test('A3 bottle and pump edits check expected ranges', async t => {
  for (const type of ['bottle', 'pump']) for (const mode of ['stale', 'matching', 'legacy']) await t.test(`${type} ${mode}`, async () => {
    const f = splitFixture(), resource = type === 'bottle' ? 'feedings' : 'pumping', target = `${resource}:43`;
    f.store.putSetting('app', 'unitContract', units);
    const before = { id: 43, child: 7, ...splitBefore, type: 'breast milk', method: 'bottle', amount: 40, notes: '' };
    f.rows.set(target, structuredClone(before));
    const expected = mode === 'legacy' ? {} : { expected: { ...splitBefore, end: mode === 'stale' ? '2026-10-25T15:59:00.000Z' : splitBefore.end } };
    const event = { type, milk: 'breast', ml: 40, leftMl: 20, rightMl: 20, start: splitBefore.start, end: '2026-10-25T16:01:00.000Z', ...expected };
    try {
      const result = await f.call('PATCH', `/api/events/${target}`, { operationId: testId(601), event });
      if (mode === 'stale') {
        assert.equal(result.code, 409);
        assert.equal(result.body.error, changedMessage);
        assert.equal(f.writes.length, 0);
        assert.deepEqual(f.rows.get(target), before);
        const entry = (await f.state()).entries.find(e => e.id === target);
        assert.equal(entry?.endISO, before.end);
      } else {
        assert.equal(result.body.status, 'saved');
        assert.equal(f.rows.get(target).end, event.end);
        assert.equal(f.writes.length, 1);
      }
    } finally { f.store.close(); }
  });
});

test('T3 split shortens before creation, preserves nap and author, and saves both IDs', async () => {
  const f = splitFixture(), id = testId(204);
  try {
    const reply = await f.split(id);
    assert.equal(reply.code, 200); assert.equal(reply.body.status, 'saved');
    assert.deepEqual(f.writes.map(w => [w.method, w.body.start, w.body.end]), [['PATCH', undefined, splitTimes.wokeAt], ['POST', splitTimes.sleptAt, splitBefore.end]]);
    assert.equal(f.rows.size, 2); assert.equal(f.rows.get('sleep:42').notes, 'Fake note');
    assert.equal(f.rows.get('sleep:43').nap, true); assert.equal(f.rows.get('sleep:43').notes, '');
    assert.equal(f.store.getEventMetadata('sleep', '43')?.adult, 'Fake parent');
    assert.deepEqual(f.store.getOperation(id)?.babyBuddyIds, ['sleep:42', 'sleep:43']);
    assert.equal((await f.split(id)).body.status, 'saved'); assert.equal(f.writes.length, 2);
  } finally { f.store.close(); }
});

test('T4 a refused POST restores the first sleep and status returns the refusal', async () => {
  const f = splitFixture(), id = testId(205); f.fault.post = 'refuse';
  try {
    assert.equal((await f.split(id)).body.status, 'failed');
    assert.equal(f.rows.size, 1); assert.equal(f.rows.get('sleep:42').end, splitBefore.end);
    assert.deepEqual(f.writes.map(w => w.method), ['PATCH', 'POST', 'PATCH']);
    assert.deepEqual(await f.recover(id), { status: 'failed', operationId: id, error: 'Fake POST refused.' });
  } finally { f.store.close(); }
});

test('T5 a lost applied POST is found without a restore or another POST', async () => {
  const f = splitFixture(), id = testId(206); f.fault.post = 'after';
  try {
    assert.equal((await f.split(id)).body.status, 'pending');
    assert.equal((await f.recover(id)).status, 'saved');
    assert.equal(f.rows.size, 2); assert.deepEqual(f.writes.map(w => w.method), ['PATCH', 'POST']);
  } finally { f.store.close(); }
});

test('T6 a lost unapplied POST restores and fails without a second POST', async () => {
  const f = splitFixture(), id = testId(207); f.fault.post = 'before';
  try {
    assert.equal((await f.split(id)).body.status, 'pending');
    assert.deepEqual(await f.recover(id), { status: 'failed', operationId: id, error: splitMessage });
    assert.equal(f.rows.size, 1); assert.equal(f.rows.get('sleep:42').end, splitBefore.end);
    assert.deepEqual(f.writes.map(w => w.method), ['PATCH', 'POST', 'PATCH']);
  } finally { f.store.close(); }
});

test('a split reads a window around the new sleep start, before the write and in recovery', async () => {
  const f = splitFixture(), id = testId(208); f.fault.post = 'after';
  try {
    assert.equal((await f.split(id)).body.status, 'pending');
    assert.equal((await f.recover(id)).status, 'saved');
    assert.equal(f.lists.length, 2);
    for (const query of f.lists) assert.deepEqual([query.start_min, query.start_max], ['2026-10-25T15:09:00.000Z', '2026-10-25T15:11:00.000Z']);
  } finally { f.store.close(); }
});

function stopSplitAt(f: ReturnType<typeof splitFixture>, point: string) {
  const update = f.store.updateUnresolvedOperationMetadata.bind(f.store);
  f.store.updateUnresolvedOperationMetadata = (id, value: any) => {
    if (value.patchSentAt && point === 'before marker') throw new Error('Fake stop.');
    update(id, value);
    if (value.patchSentAt && point === 'after marker') throw new Error('Fake stop.');
  };
  const finish = f.store.finishOperation.bind(f.store);
  f.store.finishOperation = (...args) => { finish(...args); if (point === 'after ID' && args[1] === 'finishing') throw new Error('Fake stop.'); };
  const metadata = f.store.putEventMetadata.bind(f.store);
  f.store.putEventMetadata = value => { metadata(value); if (point === 'after metadata' && value.babyBuddyId === '43') throw new Error('Fake stop.'); };
  if (point === 'after PATCH') f.fault.patch = 'after';
  if (point === 'after POST') f.fault.post = 'after';
  if (point === 'after restore') { f.fault.post = 'refuse'; f.fault.restore = 'after'; }
  return () => { f.store.updateUnresolvedOperationMetadata = update; f.store.finishOperation = finish; f.store.putEventMetadata = metadata; f.fault.patch = ''; f.fault.restore = ''; };
}

test('T7 a new records instance recovers every persisted stop point', async t => {
  for (const point of ['before marker', 'after marker', 'after PATCH', 'after POST', 'after ID', 'after metadata', 'after restore']) await t.test(point, async () => {
    const f = splitFixture(), id = testId(208), resume = stopSplitAt(f, point);
    try {
      assert.equal((await f.split(id)).body.status, 'pending'); resume();
      const saved = ['after POST', 'after ID', 'after metadata'].includes(point);
      if (point === 'after marker') {
        assert.equal((await f.recover(id)).status, 'pending'); assert.equal(f.writes.length, 0);
        f.clock.value += 120_000;
      }
      if (point === 'after restore') f.clock.value += 120_000;
      assert.equal((await f.recover(id)).status, saved ? 'saved' : 'failed');
      assert.equal(f.rows.size, saved ? 2 : 1);
      assert.equal(f.rows.get('sleep:42').end, saved ? splitTimes.wokeAt : splitBefore.end);
      assert.equal(f.writes.filter(w => w.method === 'POST').length, ['before marker', 'after marker', 'after PATCH'].includes(point) ? 0 : 1);
    } finally { f.store.close(); }
  });
});

test('T8 concurrent parent changes fail the expected check or require review without writes', async t => {
  await t.test('before split', async () => {
    const f = splitFixture(); f.rows.get('sleep:42').start = '2026-10-25T14:01:00Z';
    try { const reply = await f.split(testId(209)); assert.equal(reply.code, 409); assert.equal(reply.body.error, changedMessage); assert.equal(f.writes.length, 0); }
    finally { f.store.close(); }
  });
  for (const change of ['first start', 'second deleted', 'second changed', 'first restored']) await t.test(change, async () => {
    const f = splitFixture(), id = testId(210), resume = stopSplitAt(f, change === 'first start' ? 'after PATCH' : 'after ID');
    try {
      assert.equal((await f.split(id)).body.status, 'pending'); resume();
      if (change === 'first start') f.rows.get('sleep:42').start = '2026-10-25T14:01:00Z';
      if (change === 'second changed') f.rows.get('sleep:43').end = '2026-10-25T16:01:00Z';
      if (['second deleted', 'first restored'].includes(change)) f.rows.delete('sleep:43');
      if (change === 'first restored') f.rows.get('sleep:42').end = splitBefore.end;
      const count = f.writes.length, reply = await f.recover(id);
      assert.equal(reply.needsReview, true); assert.equal(f.writes.length, count);
    } finally { f.store.close(); }
  });
});

test('T9 a late second sleep refuses the restore and recovery finishes saved', async () => {
  const f = splitFixture(), id = testId(211); f.fault.post = 'before';
  try {
    assert.equal((await f.split(id)).body.status, 'pending');
    f.fault.beforeRestore = () => { f.fault.beforeRestore = null; f.apply({ resource: 'sleep', method: 'POST', body: { child: 7, start: splitTimes.sleptAt, end: splitBefore.end, nap: true, notes: '' } }); };
    assert.equal((await f.recover(id)).status, 'saved'); assert.equal(f.rows.size, 2);
    assert.equal(f.rows.get('sleep:42').end, splitTimes.wokeAt);
  } finally { f.store.close(); }
});

test('T10 invalid splits and missing permissions send no writes', async t => {
  const cases = [
    ['at start', { ...splitTimes, wokeAt: splitBefore.start }, 'sleep:42'],
    ['before start', { ...splitTimes, wokeAt: '2026-10-25T13:00:00Z' }, 'sleep:42'],
    ['equal wake', { ...splitTimes, sleptAt: splitTimes.wokeAt }, 'sleep:42'],
    ['before wake', { ...splitTimes, sleptAt: '2026-10-25T14:30:00Z' }, 'sleep:42'],
    ['at end', { ...splitTimes, sleptAt: splitBefore.end }, 'sleep:42'],
    ['after end', { ...splitTimes, sleptAt: '2026-10-25T17:00:00Z' }, 'sleep:42'],
    ['bad clock', { ...splitTimes, wokeAt: 'fake' }, 'sleep:42'],
    ['feed', splitTimes, 'feedings:42'], ['app entry', splitTimes, 'app:fake'],
  ] as const;
  for (const [name, split, target] of cases) await t.test(name, async () => {
    const f = splitFixture();
    try { const reply = await f.split(testId(212), split, target); assert.ok([400, 409].includes(reply.code), `refused input: ${reply.code}`); assert.equal(f.writes.length, 0); }
    finally { f.store.close(); }
  });
  for (const action of ['view', 'change', 'add']) await t.test(`no ${action}`, async () => {
    const f = splitFixture(); f.store.putSetting('user:17', 'permissions', grants.filter(p => p !== `core.${action}_sleep`));
    try { assert.equal((await f.split(testId(213))).code, 403); assert.equal(f.writes.length, 0); }
    finally { f.store.close(); }
  });
});

test('T11 a late shortening PATCH stays pending for two minutes, then restores or fails', async t => {
  for (const applies of [true, false]) await t.test(applies ? 'late application' : 'never applied', async () => {
    const f = splitFixture(), id = testId(214); f.fault.patch = 'late';
    try {
      assert.equal((await f.split(id)).body.status, 'pending');
      f.clock.value += 30_000; assert.equal((await f.recover(id)).status, 'pending'); assert.equal(f.writes.length, 1);
      if (applies) { f.fault.late(); f.fault.patch = ''; }
      else f.clock.value += 90_000;
      assert.equal((await f.recover(id)).status, 'failed');
      assert.equal(f.rows.get('sleep:42').end, splitBefore.end);
      assert.equal(f.writes.length, applies ? 2 : 1);
    } finally { f.store.close(); }
  });
});

const fixedNow = new Date('2026-10-25T18:00:00.000Z');
const session = { sessionId: 'S'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'Sage' };
const units = { verified: true, volume: 'ml', temperature: 'C', weight: 'kg', length: 'cm' };
test('blank measurements and invalid calendar dates cannot become saved values', () => {
  for (const c of [null, '', ' ', true]) assert.throws(() => mapEvent({type: 'temp', c, time: '2026-10-25T17:00:00Z'}, 7, fixedNow, units), (error: any) => error.status === 400);
  assert.throws(() => mapEvent({type: 'note', text: 'Check', time: '2026-02-31T17:00:00Z'}, 7, fixedNow, units), (error: any) => error.status === 400);
});
test('Baby Buddy note and timer timestamps accept ISO microseconds without weakening zone checks', () => {
  const time = '2026-10-25T12:30:00.123456-06:00';
  for (const resource of ['notes', 'timers']) {
    const entry = mapBabyBuddyRecord(resource, { id: 1, time, note: 'fixture' }, null, fixedNow, 'Wren');
    assert.equal(Number.isFinite(entry.t), true);
  }
  assert.throws(() => mapBabyBuddyRecord('notes', { id: 1, time: '2026-10-25T12:30:00.123456', note: 'fixture' }, null, fixedNow, 'Wren'), (error: any) => error.status === 400);
});
test('manual periods cannot extend into the future', () => {
  for (const event of [{type: 'sleep', nap: true}, {type: 'other', what: 'tummy'}, {type: 'feed', side: 'L'}]) {
    assert.throws(() => mapEvent({...event, start: '2026-10-25T17:55:00Z', end: '2026-10-25T18:05:00Z'}, 7, fixedNow, units), (error: any) => error.status === 400);
  }
});
test('appointments accept history and visits retain structured fields in note metadata', () => {
  const appointment = mapEvent({ type: 'other', what: 'appointment', title: 'Vaccination visit', provider: 'Dr. Rivera', time: '2026-11-01T16:00:00Z' }, 7, fixedNow, units);
  assert.equal(appointment.local?.kind, 'appointment');
  assert.equal((appointment.local?.details.entry as Record<string, unknown>).provider, 'Dr. Rivera');
  const historicalAppointment = mapEvent({ type: 'other', what: 'appointment', title: 'Checkup', time: '2026-10-25T17:00:00Z' }, 7, fixedNow, units);
  assert.equal(historicalAppointment.local?.kind, 'appointment');
  const visit = mapEvent({ type: 'note', what: 'visit', provider: 'Dr. Rivera', reason: 'Routine check', observations: 'Measured today', instructions: 'Return in six weeks', weightKg: 4.2, followUpDate: '2026-12-01', time: '2026-10-25T17:00:00Z' }, 7, fixedNow, units);
  assert.equal(visit.writes[0].resource, 'notes');
  assert.equal(visit.writes[0].metadata.appType, 'visit');
  assert.equal(visit.writes[0].metadata.weightKg, 4.2);
  assert.match(String(visit.writes[0].body.note), /Provider instructions: Return in six weeks/);
  assert.throws(() => mapEvent({ type: 'note', what: 'visit', reason: 'Checkup', time: '2026-10-25T19:00:00Z' }, 7, fixedNow, units), (error: any) => error.status === 400);
});
test('appointments are shared, visible ahead of time, and editable only with note permissions', async () => {
  const store = openStore(':memory:');
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const sessions = { request: async (_sid: string, request: { resource: string; method: string; id?: string | number }) => request.resource === 'children' ? { id: 7, slug: 'ada', first_name: 'Ada', birth_date: '2026-01-01' } : [] };
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const appointment = { type: 'other', what: 'appointment', title: 'Checkup', provider: 'Dr. Rivera', time: '2026-11-01T16:00:00Z' };
  const id = '00000000-0000-4000-8000-000000000094';
  try {
    const saved = await records.createEvent(session, { operationId: id, event: appointment });
    assert.equal(saved.status, 'saved');
    const state = await records.state(session) as Record<string, any>;
    assert.equal(state.upcomingAppointments[0].title, 'Checkup');
    assert.equal(state.upcomingAppointments[0].provider, 'Dr. Rivera');
    store.putSetting('user:17', 'permissions', grants.filter(permission => permission !== 'core.change_note'));
    await assert.rejects(records.updateEvent(session, `app:${id}`, { operationId: '00000000-0000-4000-8000-000000000095', event: { ...appointment, title: 'Changed' } }), (error: any) => error.status === 403);
    store.putSetting('user:17', 'permissions', grants.filter(permission => permission !== 'core.delete_note'));
    await assert.rejects(records.deleteEvent(session, `app:${id}`, { operationId: '00000000-0000-4000-8000-000000000097' }), (error: any) => error.status === 403);
    store.putSetting('user:17', 'permissions', grants.filter(permission => permission !== 'core.view_child'));
    await assert.rejects(records.createEvent(session, { operationId: '00000000-0000-4000-8000-000000000098', event: { ...appointment, time: '2026-11-02T16:00:00Z' } }), (error: any) => error.status === 403);
  } finally { store.close(); }
});
test('a past appointment remains editable after its scheduled time and leaves upcoming', async () => {
  const store = openStore(':memory:');
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  let clock = fixedNow;
  const sessions = { request: async (_sid: string, request: { resource: string }) => request.resource === 'children' ? { id: 7, slug: 'ada', first_name: 'Ada', birth_date: '2026-01-01' } : [] };
  const records = createRecords({ store, sessions, now: () => clock });
  const appointment = { type: 'other', what: 'appointment', title: 'Checkup', provider: 'Dr. Rivera', time: '2026-10-26T17:00:00.000Z' };
  const id = '00000000-0000-4000-8000-000000000099';
  try {
    const created = await records.createEvent(session, { operationId: id, event: appointment });
    assert.equal(created.status, 'saved');
    clock = new Date('2026-10-27T18:00:00.000Z');
    const beforeEdit = await records.state(session) as Record<string, any>;
    assert.equal(beforeEdit.upcomingAppointments.length, 0);
    const historical = beforeEdit.entries.find((entry: Record<string, unknown>) => entry.id === `app:${id}`);
    assert.ok(historical);
    const updated = await records.updateEvent(session, `app:${id}`, { operationId: '00000000-0000-4000-8000-000000000100', event: { ...appointment, title: 'Checkup notes corrected', provider: 'Dr. Updated' } });
    assert.equal(updated.status, 'saved');
    const afterEdit = await records.state(session) as Record<string, any>;
    const saved = afterEdit.entries.find((entry: Record<string, unknown>) => entry.id === `app:${id}`);
    assert.equal(saved.title, 'Checkup notes corrected');
    assert.equal(saved.provider, 'Dr. Updated');
    assert.equal(saved.t, historical.t);
    assert.equal(afterEdit.upcomingAppointments.length, 0);
  } finally { store.close(); }
});
test('structured visit fields persist in note metadata and return to the shared timeline', async () => {
  const store = openStore(':memory:');
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  let note: Record<string, unknown> | null = null;
  const sessions = { request: async (_sid: string, request: { resource: string; method: string; id?: string | number; body?: Record<string, unknown> }) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada', first_name: 'Ada', birth_date: '2026-01-01' };
    if (request.resource === 'notes' && request.method === 'POST') { note = { id: 83, child: 7, ...request.body }; return note; }
    if (request.resource === 'notes' && request.method === 'GET' && request.id) return note;
    if (request.resource === 'notes' && request.method === 'GET') return note ? [note] : [];
    if (request.method === 'GET') return [];
    throw new Error(`unexpected ${request.method} ${request.resource}`);
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  try {
    const result = await records.createEvent(session, { operationId: '00000000-0000-4000-8000-000000000096', event: { type: 'note', what: 'visit', provider: 'Dr. Rivera', reason: 'Routine check', observations: 'Measured today', instructions: 'Return in six weeks', weightKg: 4.2, followUpDate: '2026-12-01', time: '2026-10-25T17:00:00Z' } });
    assert.equal(result.status, 'saved');
    const state = await records.state(session) as Record<string, any>;
    const visit = state.entries.find((entry: Record<string, unknown>) => entry.what === 'visit');
    assert.equal(visit.provider, 'Dr. Rivera');
    assert.equal(visit.weightKg, 4.2);
    assert.equal(visit.followUpDate, '2026-12-01');
  } finally { store.close(); }
});
test('sidecar activities reject future times like Baby Buddy care records', () => {
  assert.throws(() => mapEvent({type: 'other', what: 'bath', time: '2026-10-25T19:00:00Z', completed: true}, 7, fixedNow, units), (error: any) => error.status === 400);
  assert.throws(() => mapEvent({type: 'other', what: 'bath', time: '2026-10-25T17:50:00Z', dur: 20}, 7, fixedNow, units), (error: any) => error.status === 400);
  assert.throws(() => mapEvent({type: 'other', what: 'bath', time: '2026-10-25T17:00:00Z'}, 7, fixedNow, units), (error: any) => error.status === 400);
});
const grants = ['child', 'feeding', 'pumping', 'diaperchange', 'sleep', 'medication', 'note', 'temperature', 'weight', 'height', 'headcircumference', 'tummytime'].flatMap(model => ['view', 'add', 'change', 'delete'].map(action => `core.${action}_${model}`));
function grantAll(store: ReturnType<typeof openStore>) {
  store.createSession({ sessionId: session.sessionId, csrfToken: session.csrfToken, adult: session.adult, babyBuddyUserId: 17, expiresAt: Date.now() + 60_000 });
  store.putSetting('user:17', 'permissions', grants);
}

test('diapers tolerate subsecond phone clock drift without accepting future entries', () => {
  for (const kind of ['W', 'D', 'B']) {
    for (const drift of [-60_000, 0, 160, 999]) {
      const time = new Date(fixedNow.getTime() + drift).toISOString();
      const mapped = mapEvent({ type: 'diaper', kind, time }, 7, fixedNow, null);
      assert.equal(mapped.writes[0].body.time, drift > 0 ? fixedNow.toISOString() : time);
      assert.equal(mapped.writes[0].body.wet, kind !== 'D');
      assert.equal(mapped.writes[0].body.solid, kind !== 'W');
    }
    for (const drift of [1000, 60_000]) {
      assert.throws(() => mapEvent({ type: 'diaper', kind, time: new Date(fixedNow.getTime() + drift).toISOString() }, 7, fixedNow, null), (error: any) => error.status === 400);
    }
  }
});

test('mapping uses Baby Buddy enum values and keeps Pale as sidecar metadata', () => {
  const mapped = mapEvent({ type: 'diaper', kind: 'D', col: 'pale', tex: 'soft', t: 600, note: 'check' }, 7, fixedNow, null);
  assert.equal(mapped.writes[0].resource, 'changes');
  assert.deepEqual(mapped.writes[0].body, { child: 7, time: '2026-10-25T16:00:00.000Z', wet: false, solid: true, notes: 'check' });
  assert.deepEqual(mapped.writes[0].metadata, { texture: 'soft', color: 'pale', appType: 'diaper' });
});

test('a pump of no length maps to one pumping row with start equal to end', () => {
  const at = '2026-10-25T17:59:00.000Z';
  const mapped = mapEvent({ type: 'pump', leftMl: 2, rightMl: 0, time: at, start: at, end: at, duration: 0 }, 7, fixedNow, units);
  assert.equal(mapped.writes.length, 1);
  assert.equal(mapped.writes[0].resource, 'pumping');
  assert.deepEqual([mapped.writes[0].body.start, mapped.writes[0].body.end, mapped.writes[0].body.amount], [at, at, 2]);
});

test('T1 bottle periods use the range rules', async t => {
  const bottle = { type: 'bottle', milk: 'breast', ml: 40, t: 231 };
  for (const range of [{ dur: 44 }, { end: '2026-10-25T10:35:00.000Z' }]) {
    await t.test(`saves 44 minutes from ${Object.keys(range)[0]}`, () => {
      const mapped = mapEvent({ ...bottle, ...range }, 7, fixedNow, units);
      assert.equal(mapped.writes[0].resource, 'feedings');
      assert.deepEqual([mapped.writes[0].body.start, mapped.writes[0].body.end],
        ['2026-10-25T09:51:00.000Z', '2026-10-25T10:35:00.000Z']);
    });
  }
  await t.test('rejects an end after now with 400', () => {
    assert.throws(() => mapEvent({ ...bottle, t: 719, dur: 2 }, 7, fixedNow, units),
      (error: any) => error.status === 400 && /end before now/.test(error.message));
  });
  await t.test('rejects more than 24 hours with 400', () => {
    assert.throws(() => mapEvent({ ...bottle, dur: 1441 }, 7, fixedNow, units),
      (error: any) => error.status === 400 && /24 hours or less/.test(error.message));
  });
  for (const range of [{}, { dur: 0 }]) await t.test(`keeps start equal to end ${'dur' in range ? 'at zero minutes' : 'for an old page'}`, () => {
    const body = mapEvent({ ...bottle, ...range }, 7, fixedNow, units).writes[0].body;
    assert.equal(body.start, '2026-10-25T09:51:00.000Z');
    assert.equal(body.end, body.start);
  });
});

test('T4 bottle and pump edit ranges retain exact saved times', async t => {
  const start = '2026-10-25T14:00:10.123Z', end = '2026-10-25T14:10:50.456Z';
  for (const resource of ['feedings', 'pumping']) await t.test(resource, () => {
    const entry = mapBabyBuddyRecord(resource, { id: 43, child: 7, start, end, method: 'bottle', type: 'breast milk', amount: 40 }, null, fixedNow, 'Sage');
    assert.deepEqual([entry.startISO, entry.endISO], [start, end]);
  });
});

test('T6 a bottle range overlapping a breast feed stays in the app', async () => {
  const f = splitFixture();
  f.store.putSetting('app', 'unitContract', units);
  f.rows.set('feedings:42', { id: 42, child: 7, start: '2026-10-25T14:20:00.000Z', end: '2026-10-25T14:30:00.000Z', type: 'breast milk', method: 'left breast' });
  const event = { type: 'bottle', milk: 'breast', ml: 40, start: '2026-10-25T14:00:00.000Z', dur: 44, by: 'Sage' };
  try {
    const result = await f.call('POST', '/api/events', { operationId: testId(501), event });
    assert.equal(result.body.status, 'saved');
    assert.equal(result.body.id, `app:${testId(501)}`);
    const entry = (await f.state()).entries.find(e => e.id === result.body.id);
    assert.deepEqual([entry?.type, entry?.t, entry?.dur, entry?.by], ['bottle', 480, 44, 'Sage']);
    assert.equal(f.rows.has('feedings:43'), false);
  } finally { f.store.close(); }
});

test('T6 keeps a refused bottle edit and its old range', async () => {
  const f = splitFixture();
  f.store.putSetting('app', 'unitContract', units);
  const before = { id: 43, child: 7, start: '2026-10-25T14:00:00.000Z', end: '2026-10-25T14:10:00.000Z', type: 'breast milk', method: 'bottle', amount: 40, notes: '' };
  f.rows.set('feedings:43', before);
  f.rows.set('feedings:42', { id: 42, child: 7, start: '2026-10-25T14:20:00.000Z', end: '2026-10-25T14:30:00.000Z', type: 'breast milk', method: 'left breast' });
  try {
    const result = await f.call('PATCH', '/api/events/feedings:43', { operationId: testId(502), event: { type: 'bottle', milk: 'breast', ml: 40, start: before.start, end: '2026-10-25T14:44:00.000Z' } });
    assert.equal(result.code, 400);
    assert.equal(result.body.error, overlapMessage);
    assert.deepEqual(f.rows.get('feedings:43'), before);
    const state = await f.state();
    assert.deepEqual(state.entries.filter(e => e.type === 'bottle').map(e => [e.id, e.t, e.dur]), [['feedings:43', 480, 10]]);
    assert.equal(state.entries.some(e => String(e.id).startsWith('app:')), false);
  } finally { f.store.close(); }
});

test('every approved event type maps to its source resource or sidecar', () => {
  const period = { start: '2026-10-25T15:00:00Z', end: '2026-10-25T15:10:00Z' };
  const cases: [Record<string, unknown>, string][] = [
    [{ type: 'feed', side: 'L', ...period }, 'feedings'],
    [{ type: 'bottle', milk: 'formula', ml: 90, time: period.start }, 'feedings'],
    [{ type: 'pump', leftMl: 30, rightMl: 20, totalMl: 50, ...period }, 'pumping'],
    [{ type: 'sleep', nap: true, ...period }, 'sleep'],
    [{ type: 'diaper', kind: 'B', time: period.start }, 'changes'],
    [{ type: 'med', name: 'Medicine', dose: 2, unit: 'ml', time: period.start }, 'medication'],
    [{ type: 'temp', c: 37, time: period.start }, 'temperature'],
    [{ type: 'growth', kg: 4, cm: 50, head: 35, date: '2026-10-25' }, 'weight,height,head-circumference'],
    [{ type: 'note', text: 'Note', time: period.start }, 'notes'],
    [{ type: 'other', what: 'mile', title: 'First smile', time: period.start }, 'notes'],
    [{ type: 'other', what: 'solids', food: 'Avocado', ...period }, 'feedings'],
    [{ type: 'other', what: 'solids', food: 'Avocado', time: period.start }, 'feedings'],
    [{ type: 'other', what: 'tummy', completed: true, ...period }, 'tummy-times'],
    [{ type: 'other', what: 'bath', completed: true, time: period.start }, 'sidecar'],
  ];
  for (const [event, expected] of cases) {
    const mapped = mapEvent(event, 7, fixedNow, units);
    const actual = mapped.local ? 'sidecar' : mapped.writes.map(item => item.resource).join(',');
    assert.equal(actual, expected, String(event.type) + ':' + String(event.what || ''));
  }
});

test('records write an operation before Baby Buddy, replay it once, and reject operation collisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-'));
  const store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const calls: {resource: string; method: string; id?: string | number; body?: unknown}[] = [];
  const sessions = { request: async (_sessionId: string, request: {resource: string; method: string; id?: string | number; query?: Record<string, string | number>; body?: unknown}) => {
    calls.push(request);
    if (request.resource === 'changes' && request.method === 'POST') return { id: 42, child: 7, time: '2026-10-25T16:00:00Z', wet: false, solid: true, notes: 'check' };
    if (request.resource === 'children' && request.id) return { id: 7, slug: 'ada', first_name: 'Ada', last_name: '', birth_date: '2026-10-25', due_date: null };
    if (request.method === 'GET') return [];
    throw new Error(`unexpected ${request.method} ${request.resource}`);
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const payload = { operationId: '00000000-0000-4000-8000-000000000042', event: { type: 'diaper', kind: 'D', col: 'pale', tex: 'soft', time: '2026-10-25T16:00:00Z', note: 'check' } };
  try {
    const first = await records.createEvent(session, payload);
    assert.equal(first.status, 'saved');
    assert.equal(calls.filter(call => call.resource === 'changes' && call.method === 'POST').length, 1);
    assert.equal(store.getEventMetadata('changes', '42')?.adult, 'Sage');
    const replay = await records.createEvent(session, payload);
    assert.equal(replay.status, 'saved');
    assert.equal(calls.filter(call => call.resource === 'changes' && call.method === 'POST').length, 1);
    await assert.rejects(records.createEvent(session, { ...payload, event: { ...payload.event, note: 'changed' } }), (error: unknown) => error instanceof HttpError && error.status === 409);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an owner value set by the caller replaces the session adult in the stored owner, the owner check, and logged by', async () => {
  const store = openStore(':memory:');
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  let posts = 0;
  const sessions = { request: async (_sessionId: string, request: {resource: string; method: string; id?: string | number}) => {
    if (request.resource === 'changes' && request.method === 'POST') { posts++; return { id: 42, child: 7, time: '2026-10-25T16:00:00Z', wet: true, solid: false, notes: '' }; }
    if (request.resource === 'children' && request.id) return { id: 7, slug: 'ada', first_name: 'Ada', last_name: '', birth_date: '2026-10-25', due_date: null };
    if (request.method === 'GET') return [];
    throw new Error(`unexpected ${request.method} ${request.resource}`);
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const payload = { operationId: testId(1301), event: { type: 'diaper', kind: 'W', time: '2026-10-25T16:00:00Z' } };
  try {
    const first = await records.createEvent(session, payload, 'Rowan');
    assert.equal(first.status, 'saved');
    assert.equal(store.getOperation(payload.operationId)?.adult, 'Rowan');
    assert.equal((store.getOperation(payload.operationId)?.requestBody as any).by, 'Rowan');
    assert.equal(store.getEventMetadata('changes', '42')?.adult, 'Rowan');
    assert.equal((await records.createEvent(session, payload, 'Rowan')).status, 'saved');
    assert.equal(posts, 1);
    await assert.rejects(records.createEvent(session, payload), (error: unknown) => error instanceof HttpError && error.status === 409);
    await assert.rejects(records.createEvent(session, payload, 'Wren'), (error: unknown) => error instanceof HttpError && error.status === 409);
  } finally { store.close(); }
});

test('an owner field inside the request payload is never read', async () => {
  const store = openStore(':memory:');
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const sessions = { request: async (_sessionId: string, request: {resource: string; method: string; id?: string | number}) => {
    if (request.resource === 'changes' && request.method === 'POST') return { id: 42, child: 7, time: '2026-10-25T16:00:00Z', wet: true, solid: false, notes: '' };
    if (request.resource === 'children' && request.id) return { id: 7, slug: 'ada', first_name: 'Ada', last_name: '', birth_date: '2026-10-25', due_date: null };
    if (request.method === 'GET') return [];
    throw new Error(`unexpected ${request.method} ${request.resource}`);
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const payload = { operationId: testId(1302), owner: 'Rowan', adult: 'Rowan', event: { type: 'diaper', kind: 'W', time: '2026-10-25T16:00:00Z', owner: 'Rowan' } };
  try {
    assert.equal((await records.createEvent(session, payload as any)).status, 'saved');
    assert.equal(store.getOperation(payload.operationId)?.adult, 'Sage');
    assert.equal(store.getEventMetadata('changes', '42')?.adult, 'Sage');
  } finally { store.close(); }
});

test('network uncertainty stays pending and replay does not retry the write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-'));
  const store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  let writes = 0;
  const sessions = { request: async (_sessionId: string, request: {resource: string; method: string}) => {
    if (request.resource === 'children' && request.id) return { id: 7, slug: 'ada', first_name: 'Ada', last_name: '', birth_date: '2026-10-25', due_date: null };
    if (request.method === 'GET') return [];
    writes++;
    throw new Error('network lost after request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const payload = { operationId: '00000000-0000-4000-8000-000000000043', event: { type: 'diaper', kind: 'W', time: '2026-10-25T16:00:00Z' } };
  try {
    assert.equal((await records.createEvent(session, payload)).status, 'pending');
    assert.equal((await records.createEvent(session, payload)).status, 'pending');
    assert.equal(writes, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('operation recovery links one exact post-baseline row after a lost response', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const rows: Record<string, unknown>[] = [];
  let posts = 0;
  const sessions = { request: async (_sid: string, request: {resource: string; method: string; body?: Record<string, unknown>}) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada' };
    if (request.resource === 'changes' && request.method === 'GET') return rows;
    if (request.resource === 'changes' && request.method === 'POST') {
      posts++;
      rows.push({ id: 43, ...request.body });
      throw new Error('response lost after Baby Buddy saved');
    }
    throw new Error('unexpected upstream request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const payload = { operationId: '00000000-0000-4000-8000-000000000053', event: { type: 'diaper', kind: 'W', time: '2026-10-25T16:00:00Z' } };
  try {
    assert.equal((await records.createEvent(session, payload)).status, 'pending');
    assert.deepEqual(await records.operation(session, payload.operationId), { status: 'saved', id: 'changes:43' });
    assert.equal(posts, 1);
    assert.equal(store.getEventMetadata('changes', '43')?.adult, session.adult);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('growth recovery reconciles a lost measurement and sends only untouched writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  store.putSetting('app', 'unitContract', units);
  const rows: Record<string, Record<string, unknown>[]> = { weight: [], height: [], 'head-circumference': [] };
  const attempts: string[] = [];
  const sessions = { request: async (_sid: string, request: {resource: string; method: string; id?: string; body?: Record<string, unknown>}) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada' };
    if (request.id) {
      const row = rows[request.resource].find(row => String(row.id) === request.id)!;
      if (request.method === 'PATCH') Object.assign(row, request.body);
      return { ...row };
    }
    if (request.method === 'GET') return rows[request.resource] || [];
    attempts.push(request.resource);
    const row = { id: 20 + attempts.length, ...request.body };
    rows[request.resource].push(row);
    if (request.resource === 'height') throw new Error('height response lost after save');
    return row;
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const payload = { operationId: '00000000-0000-4000-8000-000000000054', event: { type: 'growth', date: '2026-10-25', kg: 4, cm: 50, head: 35, recumbent: true } };
  try {
    assert.equal((await records.createEvent(session, payload)).status, 'pending');
    assert.deepEqual(await records.operation(session, payload.operationId), { status: 'saved', id: 'weight:21' });
    assert.deepEqual(attempts, ['weight', 'height', 'head-circumference']);
    assert.equal(store.getOperation(payload.operationId)?.babyBuddyIds.length, 3);
    const { entries, childId } = await records.growth(session);
    assert.equal(childId, 7);
    const weight = entries.find(entry => entry.id === 'weight:21');
    const length = entries.find(entry => entry.id === 'height:22');
    assert.equal(weight?.growthPair, payload.operationId);
    assert.equal(length?.growthPair, payload.operationId);
    assert.equal(length?.recumbent, true);
    const date = '2026-10-24';
    assert.equal((await records.updateEvent(session, 'height:22', { operationId: testId(971), event: { type: 'growth', date, cm: 50 } })).status, 'saved');
    const separated = (await records.growth(session)).entries;
    assert.equal(separated.find(entry => entry.id === 'weight:21')?.date, '2026-10-25');
    assert.equal(separated.find(entry => entry.id === 'height:22')?.date, date);
    assert.equal(separated.find(entry => entry.id === 'height:22')?.growthPair, payload.operationId);
    assert.equal((await records.updateEvent(session, 'weight:21', { operationId: testId(972), event: { type: 'growth', date, kg: 4 } })).status, 'saved');
    const reunited = (await records.growth(session)).entries.filter(entry => entry.growthPair === payload.operationId);
    assert.deepEqual(reunited.map(entry => [entry.id, entry.date, entry.recumbent]), [['height:22', date, true], ['weight:21', date, undefined]]);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('ambiguous edit and delete replays verify upstream state without repeating writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  let row: Record<string, unknown> | null = { id: 42, child: 7, time: '2026-10-25T16:00:00Z', wet: true, solid: false, notes: '' };
  let patches = 0, deletes = 0;
  const sessions = { request: async (_sid: string, request: {resource: string; method: string; id?: string | number; body?: Record<string, unknown>}) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada' };
    if (request.method === 'GET') { if (!row) throw new HttpError(404, 'missing'); return row; }
    if (request.method === 'PATCH') { patches++; row = { id: 42, ...request.body }; throw new Error('patch response lost'); }
    if (request.method === 'DELETE') { deletes++; row = null; throw new Error('delete response lost'); }
    throw new Error('unexpected upstream request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  try {
    const editId = '00000000-0000-4000-8000-000000000055';
    assert.equal((await records.updateEvent(session, 'changes:42', { operationId: editId, event: { type: 'diaper', kind: 'D', time: '2026-10-25T16:00:00Z' } })).status, 'pending');
    assert.deepEqual(await records.operation(session, editId), { status: 'saved', id: 'changes:42' });
    assert.equal(patches, 1);
    const deleteId = '00000000-0000-4000-8000-000000000056';
    assert.equal((await records.deleteEvent(session, 'changes:42', { operationId: deleteId })).status, 'pending');
    assert.deepEqual(await records.operation(session, deleteId), { status: 'saved', id: 'changes:42' });
    assert.equal(deletes, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('editing a note with photo removal clears the Baby Buddy image', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  let row: Record<string, unknown> = { id: 42, child: 7, time: '2026-10-25T16:00:00Z', note: 'First day', image: '/media/photo.jpg' };
  let patchBody: Record<string, unknown> | undefined;
  const sessions = { request: async (_sid: string, request: { resource: string; method: string; id?: string | number; body?: Record<string, unknown> }) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada' };
    if (request.method === 'GET') return row;
    if (request.method === 'PATCH') { patchBody = request.body; row = { ...row, ...request.body }; return row; }
    throw new Error('unexpected upstream request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  try {
    const result = await records.updateEvent(session, 'notes:42', { operationId: '00000000-0000-4000-8000-000000000102', event: { type: 'note', text: 'First day', time: '2026-10-25T16:00:00Z', removePhoto: true } });
    assert.equal(result.status, 'saved');
    assert.equal(patchBody?.image, null);
    assert.equal(row.image, null);
  } finally { store.close(); }
});

test('an edit whose note ends with a space saves, and an edit stuck that way recovers as saved', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  let row: Record<string, unknown> = { id: 42, child: 7, time: '2026-10-25T16:00:00Z', wet: false, solid: true, color: '', notes: '' };
  const sessions = { request: async (_sid: string, request: { resource: string; method: string; id?: string | number; body?: Record<string, unknown> }) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada' };
    if (request.method === 'GET') return row;
    // Like Baby Buddy: text is stored without the spaces at its ends (a phone keyboard adds one after a word).
    if (request.method === 'PATCH') { row = { ...row, ...Object.fromEntries(Object.entries(request.body!).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) }; return row; }
    throw new Error('unexpected upstream request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  try {
    const event = { type: 'diaper', kind: 'D', col: 'green', note: 'Green and soft ', time: '2026-10-25T16:00:00Z' };
    assert.deepEqual(await records.updateEvent(session, 'changes:42', { operationId: '00000000-0000-4000-8000-000000000110', event }), { status: 'saved', id: 'changes:42' });
    const stuckId = '00000000-0000-4000-8000-000000000111', write = mapEvent(event, 7, fixedNow, null).writes[0];
    store.beginOperation({ id: stuckId, adult: session.adult, resource: 'update:changes', intent: { action: 'update', target: 'changes:42' }, requestBody: { id: 'changes:42', event, write, before: { ...row, notes: '' } }, metadata: { attempted: true, needsReview: true } });
    assert.deepEqual(await records.operation(session, stuckId), { status: 'saved', id: 'changes:42' });
  } finally { store.close(); }
});

test('recovery resumes untouched edits and deletes but holds conflicting edits for review', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const event = { type: 'diaper', kind: 'D', time: '2026-10-25T16:00:00Z' };
  const write = mapEvent(event, 7, fixedNow, null).writes[0];
  const before = { id: 42, child: 7, time: '2026-10-25T16:00:00Z', wet: true, solid: false, notes: '' };
  let row: Record<string, unknown> | null = before, patches = 0, deletes = 0;
  const sessions = { request: async (_sid: string, request: {resource: string; method: string; id?: string | number; body?: Record<string, unknown>}) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada' };
    if (request.method === 'GET') { if (!row) throw new HttpError(404, 'missing'); return row; }
    if (request.method === 'PATCH') { patches++; row = { id: 42, ...request.body }; return row; }
    if (request.method === 'DELETE') { deletes++; row = null; return null; }
    throw new Error('unexpected request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const editId = '00000000-0000-4000-8000-000000000057';
  const deleteId = '00000000-0000-4000-8000-000000000058';
  store.beginOperation({ id: editId, adult: session.adult, resource: 'update:changes', intent: { action: 'update', target: 'changes:42' }, requestBody: { id: 'changes:42', event, write, before }, metadata: { attempted: false } });
  store.beginOperation({ id: deleteId, adult: session.adult, resource: 'delete:changes', intent: { action: 'delete', target: 'changes:42' }, requestBody: { id: 'changes:42' }, metadata: { attempted: false, retries: 0 } });
  try {
    assert.deepEqual(await records.operation(session, editId), { status: 'saved', id: 'changes:42' });
    row = before;
    assert.deepEqual(await records.operation(session, deleteId), { status: 'saved', id: 'changes:42' });
    assert.equal(patches, 1);
    assert.equal(deletes, 1);
    const conflictId = '00000000-0000-4000-8000-000000000059';
    row = { ...before, notes: 'edited by another adult' };
    store.beginOperation({ id: conflictId, adult: session.adult, resource: 'update:changes', intent: { action: 'update', target: 'changes:42' }, requestBody: { id: 'changes:42', event, write, before }, metadata: { attempted: true } });
    assert.deepEqual(await records.operation(session, conflictId), { status: 'pending', pendingOperation: conflictId, needsReview: true });
    assert.equal(patches, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('measurement writes wait for the verified Baby Buddy unit contract', () => {
  assert.throws(() => mapEvent({ type: 'temp', c: 37, t: 600 }, 7, fixedNow, null), (error: unknown) => error instanceof HttpError && error.status === 409);
  const mapped = mapEvent({ type: 'temp', c: 37, t: 600 }, 7, fixedNow, units);
  assert.deepEqual(mapped.writes[0].body, { child: 7, temperature: 37, time: '2026-10-25T16:00:00.000Z', notes: '' });
});

test('edits and deletes verify the linked child before writing upstream', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-'));
  const store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const calls: {method: string; id?: string | number}[] = [];
  const sessions = { request: async (_sessionId: string, request: {resource: string; method: string; id?: string | number; body?: unknown}) => {
    calls.push(request);
    if (request.resource === 'changes' && request.method === 'GET') return { id: 42, child: 7, wet: false, solid: true, time: '2026-10-25T16:00:00Z' };
    if (request.resource === 'changes' && request.method === 'PATCH') return { id: 42, child: 7, wet: true, solid: false, time: '2026-10-25T16:00:00Z', notes: '' };
    if (request.resource === 'changes' && request.method === 'DELETE') return null;
    throw new Error(`unexpected ${request.method}`);
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  try {
    const changed = await records.updateEvent(session, 'changes:42', { operationId: '00000000-0000-4000-8000-000000000044', event: { type: 'diaper', kind: 'W', time: '2026-10-25T16:00:00Z' } });
    assert.equal(changed.status, 'saved');
    const removed = await records.deleteEvent(session, 'changes:42', { operationId: '00000000-0000-4000-8000-000000000045' });
    assert.equal(removed.status, 'saved');
    const replay = await records.deleteEvent(session, 'changes:42', { operationId: '00000000-0000-4000-8000-000000000045' });
    assert.equal(replay.status, 'saved');
    assert.deepEqual(calls.map(call => call.method), ['GET', 'PATCH', 'GET', 'DELETE']);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('sidecar edits and deletes reject another child', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-'));
  const store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  store.putAppEvent({ id: '00000000-0000-4000-8000-000000000046', adult: 'Other', kind: 'bath', occurredAt: '2026-10-25T16:00:00Z', details: { childId: 9 } });
  const records = createRecords({ store, sessions: { request: async () => { throw new Error('must not reach upstream'); } }, now: () => fixedNow });
  try {
    await assert.rejects(records.deleteEvent(session, 'app:00000000-0000-4000-8000-000000000046', { operationId: '00000000-0000-4000-8000-000000000047' }), (error: unknown) => error instanceof HttpError && error.status === 404);
    await assert.rejects(records.updateEvent(session, 'app:00000000-0000-4000-8000-000000000046', { operationId: '00000000-0000-4000-8000-000000000048', event: { type: 'other', what: 'bath', time: '2026-10-25T16:00:00Z' } }), (error: unknown) => error instanceof HttpError && error.status === 404);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('local sidecar operations recover idempotently after a process stop', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const updateKey = '00000000-0000-4000-8000-000000000060', deleteKey = '00000000-0000-4000-8000-000000000061';
  const originalEntry = { id: `app:${updateKey}`, type: 'other', what: 'bath', t: 200 };
  const updatedEntry = { id: `app:${updateKey}`, type: 'other', what: 'bath', t: 300, by: session.adult, note: 'done' };
  store.putAppEvent({ id: updateKey, adult: session.adult, kind: 'bath', occurredAt: '2026-10-25T16:00:00Z', details: { childId: 7, entry: originalEntry, event: {} } });
  store.putAppEvent({ id: deleteKey, adult: session.adult, kind: 'bath', occurredAt: '2026-10-25T16:00:00Z', details: { childId: 7, entry: {}, event: {} } });
  store.beginOperation({ id: '00000000-0000-4000-8000-000000000062', adult: session.adult, resource: 'update-app-event', intent: { action: 'update', target: `app:${updateKey}` }, requestBody: { id: `app:${updateKey}`, childId: 7, before: originalEntry, event: { type: 'other', what: 'bath' }, entry: updatedEntry, kind: 'bath', occurredAt: '2026-10-25T17:00:00Z' }, metadata: {} });
  store.beginOperation({ id: '00000000-0000-4000-8000-000000000063', adult: session.adult, resource: 'delete-app-event', intent: { action: 'delete', target: `app:${deleteKey}` }, requestBody: { id: `app:${deleteKey}`, childId: 7, before: {} }, metadata: {} });
  const records = createRecords({ store, sessions: { request: async () => { throw new Error('local recovery must not reach Baby Buddy'); } }, now: () => fixedNow });
  try {
    assert.equal((await records.operation(session, '00000000-0000-4000-8000-000000000062')).status, 'saved');
    assert.deepEqual((store.getAppEvent(updateKey)?.details as {entry: unknown}).entry, updatedEntry);
    assert.equal((await records.operation(session, '00000000-0000-4000-8000-000000000063')).status, 'saved');
    assert.equal(store.getAppEvent(deleteKey), null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('child setup recovery saves due date locally without sending an unsupported field', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  let creates = 0, submitted: Record<string, unknown> | undefined;
  const children: Record<string, unknown>[] = [];
  const sessions = { request: async (_sid: string, request: {resource: string; method: string; body?: Record<string, unknown>}) => {
    if (request.resource === 'children' && request.method === 'POST') { creates++; submitted = request.body; children.push({ id: 7, slug: 'ada', ...request.body }); throw new Error('child response lost after save'); }
    if (request.resource === 'children' && request.method === 'GET') return children;
    throw new Error('unexpected request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const payload = { operationId: '00000000-0000-4000-8000-000000000049', firstName: 'Ada', birthDate: '2026-10-25', dueDate: '2026-11-15' };
  try {
    await assert.rejects(records.createChild(session, {...payload, birthDate: '2026-11-07'}), {status: 400});
    await assert.rejects(records.createChild(session, {...payload, birthDate: '1900-01-01'}), {status: 400});
    await assert.rejects(records.createChild(session, {...payload, firstName: 'A'.repeat(256)}), {status: 400});
    assert.equal(creates, 0);
    assert.equal((await records.createChild(session, payload)).status, 'pending');
    assert.equal((await records.operation(session, payload.operationId)).status, 'saved');
    assert.equal((await records.createChild(session, payload)).status, 'saved');
    assert.equal(creates, 1);
    assert.deepEqual(submitted, { first_name: 'Ada', last_name: '', birth_date: '2026-10-25' });
    assert.deepEqual(store.getSetting('app', 'child'), { id: 7, slug: 'ada', dueDate: '2026-11-15' });
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('child setup shares one pending operation across parents and rejects conflicting intent', async () => {
  const store = openStore(':memory:'); grantAll(store);
  const other = { sessionId: 'G'.repeat(43), csrfToken: 'D'.repeat(43), adult: 'Wren' };
  const viewOnly = { sessionId: 'V'.repeat(43), csrfToken: 'W'.repeat(43), adult: 'Nanny' };
  store.createSession({ sessionId: other.sessionId, csrfToken: other.csrfToken, adult: other.adult, babyBuddyUserId: 18, expiresAt: Date.now() + 60_000 });
  store.putSetting('user:18', 'permissions', ['core.view_child', 'core.add_child']);
  store.createSession({ sessionId: viewOnly.sessionId, csrfToken: viewOnly.csrfToken, adult: viewOnly.adult, babyBuddyUserId: 19, expiresAt: Date.now() + 60_000 });
  store.putSetting('user:19', 'permissions', ['core.view_child']);
  let baselineCalls = 0, creates = 0, releaseBaseline!: (rows: Record<string, unknown>[]) => void, finishCreate!: (row: Record<string, unknown>) => void;
  const baseline = new Promise<Record<string, unknown>[]>(resolve => { releaseBaseline = resolve; });
  const createResponse = new Promise<Record<string, unknown>>(resolve => { finishCreate = resolve; });
  const sessions = { request: async (_sid: string, request: { resource: string; method: string; query?: Record<string, string> }) => {
    if (request.resource === 'children' && request.method === 'GET') { baselineCalls++; return baseline; }
    if (request.resource === 'children' && request.method === 'POST') { creates++; return createResponse; }
    throw new Error('unexpected request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const first = { operationId: '00000000-0000-4000-8000-000000000098', firstName: 'Ada', birthDate: '2026-10-25', dueDate: '2026-11-15' };
  const saving = records.createChild(session, first);
  try {
    while (!baselineCalls) await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.pendingOperations().length, 1, 'reserve the shared setup before the baseline request');
    assert.equal(baselineCalls, 1);
    assert.deepEqual((await records.state(other) as Record<string, any>).pendingChildSetup, { operationId: first.operationId, status: 'pending', firstName: 'Ada', birthDate: '2026-10-25', dueDate: '2026-11-15', shared: true });
    assert.equal((await records.state(viewOnly) as Record<string, any>).pendingChildSetup, null);
    await assert.rejects(records.operation(viewOnly, first.operationId), { status: 403 });
    const joined = await records.createChild(other, { ...first, dueDate: '2026-11-22', operationId: '00000000-0000-4000-8000-000000000099' });
    assert.equal(joined.operationId, first.operationId);
    assert.equal(baselineCalls, 1);
    await assert.rejects(records.createChild(other, { ...first, birthDate: '2026-10-24', operationId: first.operationId }), { status: 409 });
    for (const conflict of [{ firstName: 'Ada', birthDate: '2026-10-24' }, { firstName: 'Different', birthDate: '2026-10-25' }]) {
      await assert.rejects(records.createChild(other, { ...first, ...conflict, operationId: '00000000-0000-4000-8000-000000000100' }), (error: any) => error.status === 409 && /different|review|setup/i.test(error.message));
    }
    assert.equal(baselineCalls, 1);
    releaseBaseline([]);
    while (!creates) await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(await records.operation(other, first.operationId), { status: 'pending', pendingOperation: first.operationId, operationId: first.operationId });
    assert.equal((await records.state(other) as Record<string, any>).pendingChildSetup.needsReview, undefined);
    const concurrent = await records.createChild(other, { ...first, dueDate: '2026-11-22', operationId: '00000000-0000-4000-8000-000000000102' });
    assert.equal(concurrent.status, 'pending');
    assert.equal(creates, 1);
    finishCreate({ id: 7, slug: 'ada', first_name: 'Ada', last_name: '', birth_date: '2026-10-25' });
    assert.equal((await saving).status, 'saved');
    assert.equal(creates, 1);
    assert.equal((await records.createChild(other, { ...first, dueDate: '2026-11-22' })).status, 'saved');
    assert.deepEqual(store.getSetting('app', 'child'), { id: 7, slug: 'ada', dueDate: '2026-11-15' });
    assert.deepEqual(await records.operation(other, first.operationId), { status: 'saved', id: 'children:7', operationId: first.operationId });
    const unrelated = '00000000-0000-4000-8000-000000000101';
    store.beginOperation({ id: unrelated, adult: session.adult, resource: 'notes', intent: { action: 'create-event' }, requestBody: {}, metadata: {} });
    await assert.rejects(records.operation(other, unrelated), { status: 404 });
  } finally { releaseBaseline([]); finishCreate({ id: 7, slug: 'ada', first_name: 'Ada', last_name: '', birth_date: '2026-10-25' }); await saving.catch(() => {}); store.close(); }
});

test('failed child baseline releases reservation and restart cleanup never posts without a baseline', async () => {
  const store = openStore(':memory:'); grantAll(store);
  let gets = 0, creates = 0;
  const sessions = { request: async (_sid: string, request: {resource: string; method: string}) => {
    if (request.resource === 'children' && request.method === 'GET') { gets++; if (gets === 1) throw new Error('baseline unavailable'); return []; }
    if (request.resource === 'children' && request.method === 'POST') { creates++; return { id: 8, slug: 'ada', first_name: 'Ada', last_name: '', birth_date: '2026-10-25' }; }
    throw new Error('unexpected request');
  }};
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const first = { operationId: '00000000-0000-4000-8000-000000000103', firstName: 'Ada', birthDate: '2026-10-25', dueDate: '' };
  try {
    assert.equal((await records.createChild(session, first)).status, 'failed');
    assert.equal(store.getOperation(first.operationId)?.state, 'failed');
    assert.equal((await records.createChild(session, { ...first, operationId: '00000000-0000-4000-8000-000000000104' })).status, 'saved');
    assert.equal(creates, 1);
    store.putSetting('app', 'child', null);
    const restartId = '00000000-0000-4000-8000-000000000105';
    store.beginOperation({ id: restartId, adult: session.adult, resource: 'children', intent: { action: 'create-child' }, requestBody: { babyBuddy: { first_name: 'Restart', last_name: '', birth_date: '2026-10-25' }, dueDate: null }, metadata: { baselineIds: null, attempted: false } });
    const restarted = createRecords({ store, sessions, now: () => fixedNow });
    assert.equal((await restarted.operation(session, restartId)).status, 'failed');
    assert.equal(store.getOperation(restartId)?.state, 'failed');
    assert.equal(creates, 1, 'never post when the baseline was not saved');
  } finally { store.close(); }
});

test('state filters start-of-day at midnight in Mexico City', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada', dueDate: '2026-11-15' });
  const queries: Record<string, string | number>[] = [];
  const sessions = { request: async (_sid: string, request: {resource: string; method: string; query?: Record<string, string | number>}) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada', first_name: 'Ada' };
    if (request.method === 'GET') queries.push(request.query || {});
    return [];
  }};
  try {
    const state = await createRecords({ store, sessions, now: () => fixedNow }).state(session);
    assert.equal(queries.find(query => 'date_min' in query)?.date_min, '2026-10-24T06:00:00.000Z');
    assert.equal(state.child.dueDate, '2026-11-15');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('state publishes the adult timer grants from the saved permission contract', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('user:17', 'permissions', [...grants, 'core.add_timer', 'core.delete_timer']);
  store.putSetting('user:17', 'timerDeletePermission', true);
  try {
    const state = await createRecords({ store, sessions: { request: async () => [] }, now: () => fixedNow }).state(session);
    assert.deepEqual(state.permissions.resources.timers, { view: false, add: true, change: false, delete: true });
    assert.equal(state.permissions.canStopOtherAdultsTimers, true);
    const caregiver = { ...session, sessionId: 'G'.repeat(43), csrfToken: 'D'.repeat(43), adult: 'Wren' };
    store.createSession({ sessionId: caregiver.sessionId, csrfToken: caregiver.csrfToken, adult: caregiver.adult, babyBuddyUserId: 18, expiresAt: Date.now() + 60_000 });
    store.putSetting('user:18', 'permissions', ['core.view_child', 'core.add_timer']);
    store.putSetting('user:18', 'timerDeletePermission', false);
    const caregiverState = await createRecords({ store, sessions: { request: async () => [] }, now: () => fixedNow }).state(caregiver);
    assert.deepEqual(caregiverState.permissions.resources.timers, { view: false, add: true, change: false, delete: false });
    assert.equal(caregiverState.permissions.canStopOtherAdultsTimers, false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('local entries derive their displayed time from the saved timestamp', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  store.putAppEvent({ id: '00000000-0000-4000-8000-000000000050', adult: 'Sage', kind: 'bath', occurredAt: '2026-10-24T14:00:00.000Z', details: { childId: 7, entry: { type: 'other', what: 'bath', t: 60 } } });
  const sessions = { request: async (_sid: string, request: {resource: string}) => request.resource === 'children' ? { id: 7, slug: 'ada' } : [] };
  try {
    const state = await createRecords({ store, sessions, now: () => fixedNow }).state(session);
    assert.equal(state.entries[0].t, -960);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('overlapping feeds keep their true time and remain editable as local entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-records-')), store = openStore(join(dir, 'sidecar.sqlite'));
  grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const sessions = { request: async (_sid: string, request: {method: string}) => { if (request.method === 'GET') return []; const error = new Error('overlap') as Error & {status: number; code: string}; error.status = 400; error.code = 'period_intersection'; throw error; } };
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const event = { type: 'feed', side: 'L', start: '2026-10-24T14:00:00Z', end: '2026-10-24T14:12:00Z' };
  const id = '00000000-0000-4000-8000-000000000051';
  try {
    assert.equal((await records.createEvent(session, { operationId: id, event: {...event, sid: 'mixed-session'} })).status, 'saved');
    assert.equal(store.getAppEvent(id)?.occurredAt, '2026-10-24T14:00:00.000Z');
    assert.equal((await records.createEvent(session, { operationId: '00000000-0000-4000-8000-000000000053', event: { ...event, duration: 12 } })).status, 'saved');
    assert.equal((store.getAppEvent('00000000-0000-4000-8000-000000000053')?.details as {entry: {dur: number}}).entry.dur, 12);
    assert.equal((await records.updateEvent(session, `app:${id}`, { operationId: '00000000-0000-4000-8000-000000000052', event: { ...event, side: 'R' } })).status, 'saved');
    assert.equal((store.getAppEvent(id)?.details as {entry: {side: string}}).entry.side, 'R');
    assert.equal((store.getAppEvent(id)?.details as {entry: {sid: string}}).entry.sid, 'mixed-session');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('food history covers all pages and children safely, with explicit unavailable and failed reads', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const calls: any[] = [];
  let failure = 0;
  const old = {id: 101, child: 7, type: 'solid food', start: '2026-01-01T18:00:00Z', end: '2026-01-01T18:00:00Z'};
  store.putEventMetadata({resource: 'feedings', babyBuddyId: '101', adult: 'Rowan', metadata: {food: 'Aguacate', preference: 'liked', foodId: 'avocado'}});
  store.putAppEvent({id: testId(954), adult: 'Rowan', kind: 'feeding-overlap', occurredAt: '2026-01-02T18:00:00Z', details: {childId: 7, entry: {type: 'other', what: 'solids', food: 'Soup', foodId: null, preference: 'disliked'}}});
  const records = createRecords({store, now: () => fixedNow, sessions: {request: async (_sid, request) => {
    if (request.resource === 'children') return {id: 7, slug: 'ada'};
    calls.push(request);
    if (failure) throw new HttpError(failure, 'Fake history failure.');
    return {results: request.query?.offset === 0
      ? Array.from({length: 100}, (_, i) => ({...old, id: i + 1, type: 'breast milk'}))
      : [old, {...old, id: 102, child: 99}, old]};
  }}});
  try {
    const history = await records.foods(session);
    assert.deepEqual(history.entries.map(entry => [entry.id, entry.foodId, entry.preference]), [['feedings:101', 'avocado', 'liked'], ['app:' + testId(954), null, 'disliked']]);
    assert.deepEqual(calls.map(call => call.query.offset), [0, 100]);
    assert.ok(calls.every(call => call.query.child === 7 && call.query.type === 'solid food' && !('start_min' in call.query)));
    failure = 502;
    await assert.rejects(records.foods(session), (error: any) => error.status === 502);
    failure = 403;
    assert.deepEqual(await records.foods(session), {entries: [], unavailable: ['feedings']});
    calls.length = 0;
    store.putSetting('user:17', 'permissions', ['core.view_child']);
    assert.deepEqual(await records.foods(session), {entries: [], unavailable: ['feedings']});
    assert.equal(calls.length, 0);
    store.putSetting('user:17', 'permissions', []);
    await assert.rejects(records.foods(session), (error: any) => error.status === 403);
  } finally { store.close(); }
});

test('a newer local meal replaces an older Baby Buddy food preference', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', {id:7,slug:'ada'});
  store.putEventMetadata({resource:'feedings',babyBuddyId:'101',adult:'Rowan',metadata:{food:'Apple',foodId:'apple',preference:'liked'}});
  store.putAppEvent({id:testId(955),adult:'Rowan',kind:'feeding-overlap',occurredAt:'2026-01-02T18:00:00Z',details:{childId:7,entry:{type:'other',what:'solids',food:'Apple',foodId:'apple',preference:'disliked'}}});
  const records=createRecords({store,now:()=>fixedNow,sessions:{request:async (_sid,request)=>request.resource==='children'?{id:7,slug:'ada'}:[{id:101,child:7,type:'solid food',start:'2026-01-01T18:00:00Z',end:'2026-01-01T18:00:00Z'}]}});
  try {
    const entries=(await records.foods(session)).entries;
    const summary=(globalThis as any).LITTLE_DAYS_FOODS.summary(entries);
    assert.equal(summary.find((food: any)=>food.id==='apple').preference,'disliked');
    assert.equal(entries[1].startISO,'2026-01-02T18:00:00Z');
  } finally {store.close();}
});

test('food metadata survives creation and preference edits, and deletion clears the history', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', {id: 7, slug: 'ada'});
  let row: any = null;
  const sessions = {request: async (_sid: string, request: any) => {
    if (request.resource === 'children') return {id: 7, slug: 'ada'};
    if (request.method === 'GET') {
      if (!request.id) return row ? [structuredClone(row)] : [];
      if (!row) throw new HttpError(404, 'Fake missing row.');
      return structuredClone(row);
    }
    if (request.method === 'DELETE') { row = null; return null; }
    row = {id: 88, ...row, ...request.body}; return structuredClone(row);
  }};
  const records = createRecords({store, sessions, now: () => fixedNow});
  const event = {type: 'other', what: 'solids', food: 'Aguacate', foodId: 'avocado', preference: 'liked', time: '2026-01-01T18:00:00Z'};
  try {
    assert.equal((await records.createEvent(session, {operationId: testId(951), event})).status, 'saved');
    assert.equal((await records.foods(session)).entries[0].preference, 'liked');
    assert.equal((await records.updateEvent(session, 'feedings:88', {operationId: testId(952), event: {...event, preference: 'disliked'}})).status, 'saved');
    const reloaded = createRecords({store, sessions, now: () => fixedNow});
    assert.deepEqual((await reloaded.foods(session)).entries.map(entry => [entry.foodId, entry.preference]), [['avocado', 'disliked']]);
    assert.equal((await records.deleteEvent(session, 'feedings:88', {operationId: testId(953)})).status, 'saved');
    assert.deepEqual((await reloaded.foods(session)).entries, []);
    assert.equal(store.getEventMetadata('feedings', '88'), null);
  } finally {store.close();}
});

// A fake Baby Buddy list that applies the date limits it is sent, so a request without a window returns every row.
function windowedList(rows: Record<string, Record<string, any>[]>, calls: any[]) {
  const within = (value: string, min?: string, max?: string) => (min === undefined || Date.parse(value) >= Date.parse(min)) && (max === undefined || Date.parse(value) <= Date.parse(max));
  return async (_sid: string, request: any) => {
    if (request.resource === 'children') return { id: 7, slug: 'ada', first_name: 'Ada' };
    if (request.method !== 'GET') throw new Error('unexpected write');
    calls.push(request);
    const q = request.query || {};
    const matching = (rows[request.resource] || []).filter(row => row.child === q.child && (row.start !== undefined ? within(row.start, q.start_min, q.start_max) : row.time !== undefined ? within(row.time, q.date_min, q.date_max) : q.date === undefined || row.date === q.date));
    return matching.slice(q.offset, q.offset + q.limit);
  };
}

test('state sends a lower date limit for every list except the three growth types', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const calls: any[] = [];
  try {
    await createRecords({ store, sessions: { request: windowedList({}, calls) }, now: () => fixedNow }).state(session);
    const lists = calls.filter(call => !['weight', 'height', 'head-circumference'].includes(call.resource));
    assert.equal(lists.length, 8);
    for (const call of lists) assert.equal(call.query.start_min ?? call.query.date_min, '2026-10-24T06:00:00.000Z', call.resource);
    assert.deepEqual(calls.filter(call => ['weight', 'height', 'head-circumference'].includes(call.resource)).map(call => Object.keys(call.query).sort()), Array(3).fill(['child', 'limit', 'offset']));
  } finally { store.close(); }
});

test('a create with 250 older rows lists once per write, inside a window around the new time', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const old = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, child: 7, time: new Date(Date.parse('2026-10-01T00:00:00Z') + i * 3_600_000).toISOString() }));
  const calls: any[] = [];
  const sessions = { request: async (sid: string, request: any) => {
    if (request.method === 'POST') throw new Error('Fake lost reply.');
    return windowedList({ changes: old }, calls)(sid, request);
  } };
  try {
    const reply = await createRecords({ store, sessions, now: () => fixedNow }).createEvent(session, { operationId: testId(961), event: { type: 'diaper', kind: 'W', time: '2026-10-25T16:00:00Z' } });
    assert.equal(reply.status, 'pending');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].query.date_min, '2026-10-25T15:59:00.000Z');
    assert.equal(calls[0].query.date_max, '2026-10-25T16:01:00.000Z');
    assert.deepEqual((store.getOperation(testId(961))?.metadata as any[])[0].baselineIds, []);
  } finally { store.close(); }
});

test('a growth create lists by its date, and a period create by its start', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  store.putSetting('app', 'unitContract', units);
  const calls: any[] = [];
  const sessions = { request: async (sid: string, request: any) => {
    if (request.method === 'POST') throw new Error('Fake lost reply.');
    return windowedList({}, calls)(sid, request);
  } };
  const records = createRecords({ store, sessions, now: () => fixedNow });
  try {
    await records.createEvent(session, { operationId: testId(962), event: { type: 'growth', date: '2026-10-25', kg: 4, cm: 50 } });
    assert.deepEqual(calls.map(call => [call.resource, call.query.date]), [['weight', '2026-10-25'], ['height', '2026-10-25']]);
    calls.length = 0;
    await records.createEvent(session, { operationId: testId(963), event: { type: 'sleep', nap: true, start: '2026-10-25T14:00:00Z', end: '2026-10-25T15:00:00Z' } });
    assert.deepEqual(calls.map(call => [call.resource, call.query.start_min, call.query.start_max]), [['sleep', '2026-10-25T13:59:00.000Z', '2026-10-25T14:01:00.000Z']]);
  } finally { store.close(); }
});

test('recovery lists a window and finds the new row, whether the baseline is a window or an old full list', async () => {
  const store = openStore(':memory:'); grantAll(store);
  store.putSetting('app', 'child', { id: 7, slug: 'ada' });
  const time = '2026-10-25T16:00:00.000Z', twin = { id: 5, child: 7, time, wet: true, solid: false, notes: '' };
  const rows = { changes: [twin, { id: 6, child: 7, time: '2026-10-20T16:00:00.000Z', wet: true, solid: false, notes: '' }] as any[] };
  const calls: any[] = [];
  let posts = 0;
  const sessions = { request: async (sid: string, request: any) => {
    if (request.method === 'POST') { posts++; rows.changes.push({ id: 43, ...request.body }); throw new Error('Fake lost reply after save.'); }
    return windowedList(rows, calls)(sid, request);
  } };
  const records = createRecords({ store, sessions, now: () => fixedNow });
  const event = { type: 'diaper', kind: 'W', time };
  try {
    assert.equal((await records.createEvent(session, { operationId: testId(964), event })).status, 'pending');
    calls.length = 0;
    assert.deepEqual(await records.operation(session, testId(964)), { status: 'saved', id: 'changes:43' });
    assert.deepEqual(calls.map(call => [call.query.date_min, call.query.date_max]), [['2026-10-25T15:59:00.000Z', '2026-10-25T16:01:00.000Z']]);
    // An operation saved before this change holds every row ID; recovery must read it the same way.
    rows.changes.pop();
    const body = { event, writes: [{ resource: 'changes', body: { child: 7, time, wet: true, solid: false, notes: '' }, metadata: { appType: 'diaper' } }], local: null, by: session.adult };
    store.beginOperation({ id: testId(965), adult: session.adult, resource: 'changes', intent: { action: 'create-event' }, requestBody: body, metadata: [{ appType: 'diaper', childId: 7, baselineIds: ['5', '6'], attempted: true }] });
    rows.changes.push({ id: 44, child: 7, time, wet: true, solid: false, notes: '' });
    calls.length = 0;
    assert.deepEqual(await records.operation(session, testId(965)), { status: 'saved', id: 'changes:44' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].query.date_min, '2026-10-25T15:59:00.000Z');
    assert.equal(posts, 1);
  } finally { store.close(); }
});
