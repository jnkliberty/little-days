import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError, errorBody } from '../server/http.ts';
import { createRecords } from '../server/records.ts';
import { createTimers } from '../server/timers.ts';
import { openStore } from '../server/store.ts';

// Times are UTC; the tests run in America/Mexico_City (UTC-6), so 15:39:05Z is 9:39:05 AM.
const fixedNow = Date.parse('2026-11-16T20:00:00.000Z');
const session = { sessionId: 'S'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'Sage' };
const testId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const models = ['child', 'feeding', 'pumping', 'diaperchange', 'sleep', 'medication', 'note', 'temperature', 'weight', 'height', 'headcircumference', 'tummytime'];
const grants = models.flatMap(model => ['view', 'add', 'change', 'delete'].map(action => `core.${action}_${model}`));
const short = { id: 42, child: 7, start: '2026-11-16T15:39:05.000Z', end: '2026-11-16T15:45:00.000Z', nap: true, notes: '' };
const manual = { type: 'sleep', nap: true, start: '2026-11-16T15:40:00.000Z', end: '2026-11-16T19:00:00.000Z', time: '2026-11-16T15:40:00.000Z', duration: 200, note: '' };
const message = 'This time overlaps the sleep saved from 9:39 to 9:45 AM. Change the start or end, or delete that sleep in the timeline.';
const sleepTimer = { id: 9, child: 7, user: 17, start: '2026-11-16T15:00:00.000Z' };

// `spanish`: Baby Buddy refuses in the account language, so the English text check cannot set `period_intersection`.
function fixture({ spanish = false, rows = [{ resource: 'sleep', ...short }] as any[] } = {}) {
  const store = openStore(':memory:');
  store.createSession({ sessionId: session.sessionId, csrfToken: session.csrfToken, adult: session.adult, babyBuddyUserId: 17, expiresAt: fixedNow + 3_600_000 });
  store.putSetting('user:17', 'permissions', grants);
  store.putSetting('user:17', 'timerDeletePermission', true);
  store.putSetting('app', 'child', { id: 7, slug: 'fake' });
  const saved = new Map<string, any>(rows.map(({ resource, ...row }) => [`${resource}:${row.id}`, row]));
  const timers = new Map<number, any>();
  const calls: any[] = [];
  let nextId = 100;
  const clock = { value: fixedNow };
  function refuseIfCrossing(resource: string, row: any, self?: string) {
    const crosses = [...saved].some(([key, other]) => key.startsWith(`${resource}:`) && key !== self && Date.parse(row.start) < Date.parse(other.end) && Date.parse(row.end) > Date.parse(other.start));
    if (!crosses) return;
    const error = new HttpError(400, 'Baby Buddy rejected this entry.') as HttpError & { code?: string };
    if (!spanish) error.code = 'period_intersection';
    throw error;
  }
  const sessions = { people: () => ['Rowan', 'Sage'], request: async (_sid: string, input: any) => {
    calls.push(structuredClone(input));
    if (input.resource === 'timers') {
      if (input.method === 'GET') return [...timers.values()].map(row => structuredClone(row));
      if (input.method === 'DELETE') { timers.delete(Number(input.id)); return null; }
      throw new Error(`Unexpected timer ${input.method}`);
    }
    const key = `${input.resource}:${input.id}`;
    if (input.method === 'GET' && input.id) { if (!saved.has(key)) throw new HttpError(404, 'Fake row missing.'); return structuredClone(saved.get(key)); }
    if (input.method === 'GET') return [...saved].filter(([k]) => k.startsWith(`${input.resource}:`)).map(([, row]) => structuredClone(row));
    if (input.method === 'PATCH') {
      const row = { ...saved.get(key), ...input.body };
      refuseIfCrossing(input.resource, row, key);
      saved.set(key, row);
      return structuredClone(row);
    }
    if (input.method !== 'POST') throw new Error(`Unexpected ${input.method}`);
    const row = { id: nextId++, ...input.body };
    refuseIfCrossing(input.resource, row);
    saved.set(`${input.resource}:${row.id}`, row);
    return structuredClone(row);
  } };
  const records = createRecords({ store, sessions: sessions as any, now: () => new Date(clock.value) });
  const timerService = createTimers({ store, sessions: sessions as any, records, now: () => clock.value, log: () => {} });
  const writes = () => calls.filter(call => call.method !== 'GET');
  function runSleepTimer(row = sleepTimer) {
    timers.set(row.id, { ...row });
    store.putEventMetadata({ resource: 'timers', babyBuddyId: String(row.id), adult: 'Sage', metadata: { kind: 'sleep', nap: true } });
  }
  return { store, saved, timers, calls, writes, clock, records, timerService, runSleepTimer };
}

async function refused(run: () => Promise<unknown>): Promise<any> {
  try { await run(); } catch (error) { return error; }
  assert.fail('The save was not refused.');
}

const conflict = { id: 'sleep:42', start: short.start, end: short.end };
const overlapBody = { error: message, code: 'sleep_overlap', conflicts: [conflict] };

test('a manual sleep over a saved sleep names that sleep, in an English or a Spanish Baby Buddy', async () => {
  for (const spanish of [false, true]) {
    const f = fixture({ spanish });
    const error = await refused(() => f.records.createEvent(session, { operationId: testId(1), event: manual }));
    assert.equal(error.status, 400);
    assert.deepEqual(errorBody(error), overlapBody, `spanish=${spanish}`);
    assert.equal(f.store.getOperation(testId(1))?.state, 'failed');
  }
});

test('an edited sleep over a saved sleep names that sleep and never lists itself', async () => {
  const own = { resource: 'sleep', id: 50, child: 7, start: '2026-11-16T16:00:00.000Z', end: '2026-11-16T19:00:00.000Z', nap: true, notes: '' };
  for (const spanish of [false, true]) {
    const f = fixture({ spanish, rows: [{ resource: 'sleep', ...short }, own] });
    const error = await refused(() => f.records.updateEvent(session, 'sleep:50', { operationId: testId(2), event: { ...manual } }));
    assert.deepEqual(errorBody(error), overlapBody, `spanish=${spanish}`);
  }
});

test('a sleep timer stop and pause over a saved sleep name that sleep before anything is saved', async () => {
  for (const action of ['stop', 'pause'] as const) {
    const f = fixture();
    f.runSleepTimer({ ...sleepTimer, start: '2026-11-16T15:40:00.000Z' });
    const error = await refused(() => f.timerService[action](session, 9, { operationId: testId(3) }));
    assert.equal(error.status, 400, action);
    assert.deepEqual({ code: errorBody(error).code, conflicts: errorBody(error).conflicts }, { code: 'sleep_overlap', conflicts: [conflict] }, action);
    assert.equal(f.writes().length, 0, action);
  }
});

test('a sleep saved by another phone during Undo keeps its name in the failed stop result', async () => {
  const f = fixture({ rows: [] });
  f.runSleepTimer({ ...sleepTimer, start: '2026-11-16T15:40:00.000Z' });
  const first = await f.timerService.stop(session, 9, { operationId: testId(4) });
  assert.equal(first.status, 'pending');
  const late = { id: 43, child: 7, start: '2026-11-16T16:00:00.000Z', end: '2026-11-16T16:30:00.000Z', nap: true, notes: '' };
  f.saved.set('sleep:43', late);
  f.clock.value += 11_000;
  const result = await f.timerService.operation(session, testId(4));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'sleep_overlap');
  assert.deepEqual(result.conflicts, [{ id: 'sleep:43', start: late.start, end: late.end }]);
  assert.match(String(result.error), /saved from 10:00 to 10:30 AM/);
  assert.ok(f.timers.has(9), 'the timer keeps running');
});

test('a feed over a saved feed keeps the local-save fallback when Baby Buddy refuses in Spanish', async () => {
  const savedFeed = { resource: 'feedings', id: 61, child: 7, start: '2026-11-16T15:30:00.000Z', end: '2026-11-16T15:50:00.000Z', type: 'breast milk', method: 'left breast' };
  const feed = { type: 'feed', side: 'L', start: '2026-11-16T15:40:00.000Z', end: '2026-11-16T15:55:00.000Z', time: '2026-11-16T15:40:00.000Z', duration: 15, note: '' };
  for (const spanish of [false, true]) {
    const f = fixture({ spanish, rows: [savedFeed] });
    const result = await f.records.createEvent(session, { operationId: testId(5), event: feed });
    assert.deepEqual(result, { status: 'saved', id: `app:${testId(5)}` }, `spanish=${spanish}`);
  }
});

test('a manual sleep refused while a sleep timer runs across it leaves the timer alone', async () => {
  const f = fixture();
  f.runSleepTimer();  // started 9:00 AM, before the saved 9:39 sleep and the typed 9:40 to 1:00 PM sleep, and still running
  const error = await refused(() => f.timerService.createEvent(session, { operationId: testId(6), event: manual }));
  assert.equal(errorBody(error).code, 'sleep_overlap');
  assert.equal(f.calls.filter(call => call.resource === 'timers' && call.method !== 'GET').length, 0);
  assert.deepEqual(f.timers.get(9), sleepTimer);
  assert.equal(f.store.hasTimerStop('9'), false);
});

test('no save path deletes a saved sleep, even when a page sends a replace list', async () => {
  const f = fixture();
  await refused(() => f.records.createEvent(session, { operationId: testId(7), event: manual, replace: ['sleep:42'] } as any));
  f.runSleepTimer({ ...sleepTimer, start: '2026-11-16T15:40:00.000Z' });
  await refused(() => f.timerService.stop(session, 9, { operationId: testId(8), replace: ['sleep:42'] } as any));
  assert.equal(f.writes().filter(call => call.method === 'DELETE').length, 0);
  assert.deepEqual(f.saved.get('sleep:42'), short);
  assert.equal('replaceable' in errorBody(await refused(() => f.records.createEvent(session, { operationId: testId(9), event: manual }))), false);
});
