import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import vm from 'node:vm';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.ts';
import {createTimers} from '../server/timers.ts';
import {createRecords} from '../server/records.ts';
import {HttpError} from '../server/http.ts';
import {createRouter} from '../server/router.ts';
import {Readable} from 'node:stream';
import {mapBabyBuddyRecord} from '../server/mapping.ts';

const base = Date.parse('2026-10-25T18:00:00Z');
const iso = (seconds: number) => new Date(base + seconds * 1000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const a = {sessionId: 'a', csrfToken: 'a', adult: 'Sage'};
const b = {sessionId: 'b', csrfToken: 'b', adult: 'Rowan'};

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-timers-'));
  let store = openStore(join(dir, 'test.sqlite'));
  for (const [session, user] of [[a, 17], [b, 18]] as const) {
    store.createSession({...session, babyBuddyUserId: user, expiresAt: base + 86400000});
    store.putSetting(`user:${user}`, 'timerDeletePermission', true);
    store.putSetting(`user:${user}`, 'permissions', ['core.view_child', 'core.view_timer', 'core.add_timer', 'core.change_timer', 'core.delete_timer', 'core.view_sleep', 'core.add_sleep', 'core.view_feeding', 'core.add_feeding', 'core.view_diaperchange', 'core.add_diaperchange', 'core.view_tummytime', 'core.add_tummytime', 'core.view_note', 'core.add_note', 'core.view_pumping', 'core.add_pumping']);
  }
  store.putSetting('app', 'child', {id: 7, slug: 'fake'});
  let clock = base;
  const rows = new Map<string, any>();
  const writes: any[] = [];
  const faults = {delete: false, loseTimer: false, sleep: false, refuseTimer: false, rejectSleep: false, feedings: false, gate: null as Promise<void> | null};
  const logs: string[] = [];
  let next = 1;
  const sessions = {request: async (sid: string, input: any) => {
    if (input.method === 'GET') {
      if (input.resource === 'feedings' && faults.gate) await faults.gate;
      if (input.resource === 'children') return {id: 7, slug: 'fake', first_name: 'Fake', birth_date: '2026-10-01'};
      if (input.id) { const row = rows.get(`${input.resource}:${input.id}`); if (!row) throw new HttpError(404, 'Missing'); return structuredClone(row); }
      return [...rows].filter(([key]) => key.startsWith(input.resource + ':')).map(([,row]) => structuredClone(row));
    }
    if (input.method === 'DELETE') {
      if (faults.delete) throw new HttpError(403, 'Delete denied');
      writes.push(structuredClone(input));
      rows.delete(`${input.resource}:${input.id}`); return null;
    }
    if (input.method === 'PATCH') {
      const row = rows.get(`${input.resource}:${input.id}`);
      if (!row) throw new HttpError(404, 'Missing');
      writes.push(structuredClone(input));
      Object.assign(row, input.body); return structuredClone(row);
    }
    if (input.resource === 'sleep' && faults.rejectSleep) throw new HttpError(400, 'This time overlaps another entry. Change the start or end.');
    if (input.resource === 'timers' && faults.refuseTimer) throw new HttpError(403, 'Timer denied');
    if (input.resource === 'sleep' && faults.sleep) throw new Error('Sleep unavailable');
    if (input.resource === 'feedings' && faults.feedings) throw new Error('Baby Buddy is down');
    writes.push(structuredClone(input));
    const row = {...input.body, id: next++, user: sid === 'a' ? 17 : 18};
    rows.set(`${input.resource}:${row.id}`, row);
    if (input.resource === 'timers' && faults.loseTimer) throw new Error('Lost timer reply');
    return structuredClone(row);
  }};
  function services() {
    const records = createRecords({store, sessions, now: () => new Date(clock)});
    return createTimers({store, sessions, records, now: () => clock, log: line => logs.push(line)});
  }
  let timers = services();
  return {
    get store() {return store;}, get timers() {return timers;}, rows, writes, faults, sessions, logs, records: () => createRecords({store, sessions, now: () => new Date(clock)}),
    tick(seconds: number) {clock = base + seconds * 1000;},
    restart() {store.close(); store = openStore(join(dir, 'test.sqlite')); timers = services();},
    close() {store.close(); rmSync(dir, {recursive: true, force: true});},
    sleeps() {return [...rows].filter(([key]) => key.startsWith('sleep:')).map(([,row]) => row);},
    async api(session: typeof a, path: string, payload: Record<string, unknown>) {
      const router = createRouter({store, timers} as any);
      const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(payload))]), {method: 'POST', headers: {'content-type': 'application/json'}});
      let body: any;
      await router.handle(req as any, {writeHead() {}, end(text: string) {body = JSON.parse(text);}} as any, new URL('http://localhost' + path), session);
      return body;
    },
  };
}

test('a past manual sleep saves without changing the current sleep timer', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(980), kind: 'sleep', nap: true});
    const timer = structuredClone((await f.timers.active(a)).sleepRun);
    f.tick(600);
    const result = await f.timers.createEvent(a, {operationId: id(981), event: {type: 'sleep', nap: false, start: iso(-7200), end: iso(-3600)}});
    assert.equal(result.status, 'saved');
    assert.deepEqual(f.sleeps().map(row => [row.start, row.end, row.nap]), [[iso(-7200), iso(-3600), false]]);
    assert.deepEqual((await f.timers.active(a)).sleepRun, timer);
    assert.equal(f.writes.some(write => write.method === 'DELETE'), false);
  } finally { f.close(); }
});

test('mixed feeds retain one session through bottle, both breasts, restart, and edits', async () => {
  const f = fixture();
  try {
    f.store.putSetting('app', 'unitContract', {verified: true, volume: 'ml'});
    await f.timers.start(a, {operationId: id(900), kind: 'feed', side: 'bottle'});
    const sid = (await f.timers.active(a)).run?.sid;
    assert.ok(sid);
    const sides = ['bottle', 'L', 'R', 'bottle'];
    for (let i = 0; i < sides.length; i++) {
      const run = (await f.timers.active(a)).run!;
      assert.equal(run.side, sides[i]);
      assert.equal(run.sid, sid);
      f.tick((i + 1) * 600);
      const input = {operationId: id(901 + i), ...(sides[i] === 'bottle' ? {amounts: {ml: i ? 30 : 60, milk: 'breast'}} : {})};
      const result = i < sides.length - 1
        ? await f.timers.switchSide(a, run.id, {...input, side: sides[i + 1]})
        : await f.timers.stop(a, run.id, input);
      f.tick((i + 1) * 600 + 11); f.restart();
      assert.equal((await f.timers.operation(a, String(result.operationId))).status, 'saved');
      assert.equal((await f.timers.operation(a, String(result.operationId))).status, 'saved');
    }
    const rows = [...f.rows].filter(([key]) => key.startsWith('feedings:')).map(([, row]) => row);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map(row => [row.method, row.start, row.end]), sides.map((side, i) => [side === 'bottle' ? 'bottle' : side === 'L' ? 'left breast' : 'right breast', iso(i * 600), iso((i + 1) * 600)]));
    const entries = rows.map(row => mapBabyBuddyRecord('feedings', row, f.store.getEventMetadata('feedings', String(row.id))?.metadata as any, new Date(base), a.adult));
    assert.ok(entries.every(entry => entry.sid === sid));
    assert.equal(entries.filter(entry => entry.type === 'bottle').reduce((sum, entry) => sum + Number(entry.ml), 0), 90);
    assert.equal(entries.filter(entry => entry.type === 'feed').reduce((sum, entry) => sum + Number(entry.dur), 0), 20);
    assert.equal((await f.timers.active(a)).run, null);
    f.store.putSetting('user:17', 'permissions', [...f.store.getSetting('user:17', 'permissions') as string[], 'core.change_feeding']);
    const records = createRecords({store: f.store, sessions: f.sessions, now: () => new Date(base + 2500000)});
    for (const [i, row] of rows.entries()) {
      const entry = entries[i];
      await records.updateEvent(a, String(entry.id), {operationId: id(910 + i), event: {type: entry.type, side: entry.side, milk: entry.milk, ml: entry.ml, start: row.start, end: row.end, note: 'Updated note'}});
      assert.equal((f.store.getEventMetadata('feedings', String(row.id))?.metadata as any).sessionId, sid);
    }
  } finally {f.close();}
});

test('bottle switching requires an amount and milk type before it changes the timer', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(920), kind: 'feed', side: 'bottle'});
    f.tick(600);
    for (const amounts of [undefined, {ml: 0, milk: 'breast'}, {ml: NaN, milk: 'formula'}, {ml: 60, milk: 'unknown'}]) {
      await assert.rejects(f.timers.switchSide(a, '1', {operationId: id(921), side: 'L', amounts}), (error: any) => error.status === 400);
    }
    assert.equal((await f.timers.active(a)).run?.side, 'bottle');
    assert.equal(f.writes.filter(write => write.resource === 'feedings').length, 0);
  } finally {f.close();}
});

test('pause, feed, resume, end keep two sleep segments and exclude the awake gap', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(1), kind: 'sleep', nap: true, note: 'nap'});
    f.tick(60);
    await f.timers.pause(a, '1', {operationId: id(2)});
    assert.equal((await f.timers.active(a)).sleepPaused, null);
    f.tick(70); f.restart();
    assert.equal((await f.timers.operation(a, id(2))).status, 'saved');
    assert.equal((await f.timers.active(b)).sleepPaused?.id, id(2));
    await f.timers.start(a, {operationId: id(3), kind: 'feed', side: 'L'});
    f.tick(120);
    await f.timers.resume(a, {operationId: id(4), pauseId: id(2)});
    assert.equal((await f.timers.active(b)).sleepPaused, null);
    f.tick(180);
    await f.timers.stop(a, '4', {operationId: id(5)});
    f.tick(190);
    await f.timers.operation(a, id(5));
    assert.deepEqual(f.sleeps().map(row => [row.start, row.end]), [[iso(0), iso(60)], [iso(120), iso(180)]]);
  } finally {f.close();}
});

test('a delayed diaper save ends sleep at its frozen timestamp and recovery never repeats the event', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(10), kind: 'sleep', nap: true});
    f.tick(300); f.faults.delete = true;
    const payload = {operationId: id(11), event: {type: 'diaper', kind: 'W', time: iso(123.456)}};
    const partial = await f.timers.createEvent(a, payload);
    assert.equal(partial.status, 'finishing'); assert.equal(partial.eventSaved, true); assert.ok(partial.warning);
    assert.equal(f.sleeps()[0].end, iso(123.456));
    f.restart(); f.tick(600); f.faults.delete = false;
    assert.equal((await f.timers.operation(a, id(11))).sleepEnded, true);
    await f.timers.createEvent(a, payload);
    assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
    assert.equal(f.writes.filter(w => w.resource === 'sleep').length, 1);
    assert.equal((await f.timers.active(a)).sleepRun, null);
  } finally {f.close();}
});

test('a refused sleep save releases its stop and preserves the saved diaper on every retry', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(300), kind: 'sleep', nap: true}); f.tick(60);
    f.faults.rejectSleep = true;
    const input = {operationId: id(301), event: {type: 'diaper', kind: 'W', time: iso(60)}};
    const result = await f.timers.createEvent(a, input);
    assert.equal(result.status, 'failed');
    assert.equal(result.eventSaved, true);
    assert.match(String(result.error), /sleep.*not saved/i);
    f.restart(); f.faults.rejectSleep = false;
    assert.equal((await f.timers.createEvent(a, input)).status, 'failed');
    assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
    assert.equal(f.sleeps().length, 0);
    assert.ok((await f.timers.active(a)).sleepRun);
    assert.ok((await f.timers.active(b)).sleepRun);
    assert.equal(f.store.pendingOperations().length, 0);
  } finally {f.close();}
});

test('another parent recovers a persisted stop whose sleep save definitively failed', async t => {
  for (const action of ['refresh', 'stop', 'discard', 'change-start'] as const) await t.test(action, async () => {
    const f = fixture();
    try {
      await f.timers.start(a, {operationId: id(310), kind: 'sleep', nap: true}); f.tick(60);
      f.faults.rejectSleep = true;
      await f.timers.createEvent(a, {operationId: id(311), event: {type: 'diaper', kind: 'W', time: iso(60)}});
      const parent = f.store.getOperation(id(311))!;
      const stopId = String((parent.metadata as any).stopOperationId);
      // The released app revived a refused stop, then left it finishing without a sleep record.
      f.store.finishOperation(stopId, 'finishing');
      f.store.finishOperation(parent.id, 'finishing');
      f.restart(); f.faults.rejectSleep = false;
      if (action === 'refresh') {
        assert.ok((await f.timers.active(b)).sleepRun);
      } else if (action === 'change-start') {
        assert.equal((await f.timers.changeStart(b, '1', {operationId: id(312), start: iso(30)})).status, 'saved');
        assert.equal((await f.timers.active(b)).sleepRun?.startedAt, iso(30));
      } else if (action === 'discard') {
        assert.equal((await f.timers.discard(b, '1', {operationId: id(312), confirmOther: true})).status, 'saved');
      } else {
        await f.timers.stop(b, '1', {operationId: id(312), at: iso(45), confirmOther: true});
        f.tick(71);
        assert.equal((await f.timers.operation(b, id(312))).status, 'saved');
        assert.equal(f.sleeps()[0].end, iso(45));
      }
      assert.equal(f.store.getOperation(stopId)?.state, 'failed');
      assert.equal(f.store.getOperation(parent.id)?.state, 'failed');
      assert.equal((await f.timers.operation(a, parent.id)).eventSaved, true);
      assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
      assert.equal(f.sleeps().length, action === 'stop' ? 1 : 0);
    } finally {f.close();}
  });
});

test('another parent cannot release an uncertain sleep save or a saved sleep awaiting timer deletion', async t => {
  for (const fault of ['sleep', 'delete'] as const) await t.test(fault, async () => {
    const f = fixture();
    try {
      await f.timers.start(a, {operationId: id(320), kind: 'sleep', nap: true}); f.tick(60);
      f.faults[fault] = true;
      await f.timers.createEvent(a, {operationId: id(321), event: {type: 'diaper', kind: 'W', time: iso(60)}});
      const stopId = String((f.store.getOperation(id(321))!.metadata as any).stopOperationId);
      f.restart();
      await f.timers.active(b);
      await assert.rejects(f.timers.stop(b, '1', {operationId: id(322), confirmOther: true}), (e: any) => e.status === 409);
      await assert.rejects(f.timers.discard(b, '1', {operationId: id(323), confirmOther: true}), (e: any) => e.status === 409);
      assert.equal(f.store.getOperation(stopId)?.state, 'finishing');
      assert.equal(f.sleeps().length, fault === 'delete' ? 1 : 0);
      assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
    } finally {f.close();}
  });
});

test('other-parent confirmation and denied permissions retain the valid event until retry', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(20), kind: 'sleep', nap: true}); f.tick(60);
    const partial = await f.timers.start(b, {operationId: id(21), kind: 'feed', side: 'L'});
    assert.equal(partial.eventSaved, true); assert.equal(partial.needsConfirmation, true);
    await assert.rejects(f.timers.confirmInterruption(a, id(21)), (e: any) => e.status === 404);
    f.store.putSetting('user:18', 'timerDeletePermission', false);
    assert.match(String((await f.timers.confirmInterruption(b, id(21))).warning), /unavailable/);
    assert.equal(f.sleeps().length, 0);
    f.restart(); f.store.putSetting('user:18', 'timerDeletePermission', true);
    const recovered = await f.timers.operation(b, id(21)); assert.equal(recovered.status, 'saved', JSON.stringify(recovered));
    assert.equal(f.rows.size, 2);
    assert.equal(f.writes.filter(w => w.resource === 'timers' && w.method === 'POST').length, 2);
  } finally {f.close();}
});

test('older, equal-start, future and unrelated events do not end sleep', async () => {
  for (const event of [
    {type: 'diaper', kind: 'W', time: iso(-1)}, {type: 'diaper', kind: 'W', time: iso(0)},
    {type: 'diaper', kind: 'W', time: iso(61)}, {type: 'note', text: 'Photo or note', time: iso(30)},
    {type: 'pump', leftMl: 20, rightMl: 0, start: iso(30), end: iso(45)},
    {type: 'other', what: 'bath', completed: true, time: iso(-30)},
  ]) {
    const f = fixture();
    try {
      f.store.putSetting('app', 'unitContract', {verified: true, volume: 'ml', weight: 'kg', length: 'cm', temperature: 'C'});
      await f.timers.start(a, {operationId: id(30), kind: 'sleep', nap: true}); f.tick(60);
      try {await f.timers.createEvent(a, {operationId: id(31), event});} catch (e) {if (event.time !== iso(61)) throw e;}
      assert.ok((await f.timers.active(a)).sleepRun); assert.equal(f.sleeps().length, 0);
    } finally {f.close();}
  }
});

test('resume reconciles a lost timer reply after restart and clears the durable pause marker', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(40), kind: 'sleep', nap: true}); f.tick(60);
    await f.timers.pause(a, '1', {operationId: id(41)}); f.tick(70); await f.timers.operation(a, id(41));
    f.faults.loseTimer = true; f.tick(120);
    assert.equal((await f.timers.resume(a, {operationId: id(42), pauseId: id(41)})).status, 'pending');
    f.restart(); f.faults.loseTimer = false;
    assert.equal((await f.timers.operation(a, id(42))).status, 'saved');
    assert.equal(f.store.getSetting('app', 'sleepPaused'), null);
    assert.equal(f.writes.filter(w => w.resource === 'timers' && w.method === 'POST').length, 2);
  } finally {f.close();}
});

test('discard requires confirmation, creates no sleep record, and leaves feeding active', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(50), kind: 'feed', side: 'L'});
    await f.timers.start(a, {operationId: id(51), kind: 'sleep', nap: true}); f.tick(60);
    await assert.rejects(f.timers.discard(b, '2', {operationId: id(52)}), (e: any) => e.status === 409);
    assert.equal((await f.timers.discard(b, '2', {operationId: id(53), confirmOther: true})).status, 'saved');
    f.restart(); assert.equal((await f.timers.discard(b, '2', {operationId: id(53), confirmOther: true})).status, 'saved');
    assert.equal(f.sleeps().length, 0); assert.ok((await f.timers.active(a)).run);
  } finally {f.close();}
});

test('new bottle and manual breast feeds end sleep at their start and never restart it', async () => {
  for (const event of [
    {type: 'bottle', milk: 'breast', ml: 60, start: iso(30), end: iso(45)},
    {type: 'feed', side: 'L', start: iso(30), end: iso(45)},
  ]) {
    const f = fixture();
    try {
      f.store.putSetting('app', 'unitContract', {verified: true, volume: 'ml', weight: 'kg', length: 'cm', temperature: 'C'});
      await f.timers.start(a, {operationId: id(60), kind: 'sleep', nap: true}); f.tick(60);
      const result = await f.timers.createEvent(a, {operationId: id(61), event});
      assert.equal(result.status, 'saved', JSON.stringify(result));
      assert.equal(result.sleepEnded, true);
      assert.deepEqual(f.sleeps().map(row => [row.start, row.end]), [[iso(0), iso(30)]]);
      assert.equal((await f.timers.active(a)).sleepPaused, null);
      assert.equal((await f.timers.active(a)).sleepRun, null);
      await f.timers.createEvent(a, {operationId: id(61), event});
      assert.equal(f.writes.filter(w => w.resource === 'feedings').length, 1);
    } finally {f.close();}
  }
});

test('a refused event never ends sleep or creates a saved sleep segment', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(70), kind: 'sleep', nap: true}); f.tick(60);
    await assert.rejects(f.timers.createEvent(a, {operationId: id(71), event: {type: 'diaper', kind: 'invalid', time: iso(30)}}), (e: any) => e.status === 400);
    assert.ok((await f.timers.active(a)).sleepRun);
    assert.equal(f.sleeps().length, 0);
    assert.equal(f.writes.filter(w => w.method === 'DELETE').length, 0);
  } finally {f.close();}
});

test('end paused preserves its saved segment and rejects stale markers', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(80), kind: 'sleep', nap: true}); f.tick(60);
    await f.timers.pause(a, '1', {operationId: id(81)}); f.tick(70); await f.timers.operation(a, id(81));
    await assert.rejects(f.timers.endPaused(b, {operationId: id(82), pauseId: id(81)}), (e: any) => e.status === 409);
    assert.equal((await f.timers.endPaused(b, {operationId: id(83), pauseId: id(81), confirmOther: true})).status, 'saved');
    f.restart();
    assert.equal((await f.timers.active(a)).sleepPaused, null);
    assert.equal(f.sleeps().length, 1);
    await assert.rejects(f.timers.resume(a, {operationId: id(84), pauseId: id(81)}), (e: any) => e.status === 409);
    assert.equal((await f.timers.endPaused(b, {operationId: id(83), pauseId: id(81), confirmOther: true})).status, 'saved');
  } finally {f.close();}
});

test('two adults interrupting sleep produce one sleep record and both confirm their saved events', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(90), kind: 'sleep', nap: true}); f.tick(60);
    await Promise.all([
      f.timers.start(a, {operationId: id(91), kind: 'feed', side: 'L'}),
      f.timers.createEvent(b, {operationId: id(92), event: {type: 'diaper', kind: 'W', time: iso(60)}, confirmOther: true}),
    ]);
    for (const actor of [[a, 91], [b, 92]] as const) {
      const op = f.store.getOperation(id(actor[1]))!;
      if (op.resource === 'timers') assert.equal((await f.timers.operation(actor[0], op.id)).status, 'saved');
    }
    assert.equal(f.sleeps().length, 1);
    assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
    assert.equal((await f.timers.active(a)).sleepRun, null);
  } finally {f.close();}
});

test('restart after remote success recovers atomic pause and resume marker changes', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(100), kind: 'sleep', nap: true}); f.tick(60);
    await f.timers.pause(a, '1', {operationId: id(101)}); f.tick(70);
    f.store.completeTimerOperation = () => {throw new Error('Interrupted before marker commit');};
    await assert.rejects(f.timers.operation(a, id(101)), /Interrupted/);
    assert.equal(f.rows.has('timers:1'), false);
    assert.equal(f.store.getSetting('app', 'sleepPaused'), null);
    f.restart();
    assert.equal((await f.timers.operation(a, id(101))).status, 'saved');
    assert.equal(f.store.getSetting('app', 'sleepPaused')?.id, id(101));
    f.store.completeTimerOperation = () => {throw new Error('Interrupted before marker commit');};
    f.tick(120);
    assert.equal((await f.timers.resume(a, {operationId: id(102), pauseId: id(101)})).status, 'finishing');
    f.restart();
    assert.equal((await f.timers.operation(a, id(102))).status, 'saved');
    assert.equal(f.store.getSetting('app', 'sleepPaused'), null);
    assert.equal(f.sleeps().length, 1);
    assert.equal(f.writes.filter(w => w.resource === 'timers' && w.method === 'POST').length, 2);
  } finally {f.close();}
});

test('HTTP event and confirmation routes use the durable sleep coordinator', async () => {
  const f = fixture();
  try {
    await f.api(a, '/api/timers', {operationId: id(110), kind: 'sleep', nap: true}); f.tick(60);
    const partial = await f.api(b, '/api/events', {operationId: id(111), event: {type: 'diaper', kind: 'W', time: iso(30)}});
    assert.equal(partial.eventSaved, true);
    assert.equal(partial.needsConfirmation, true);
    f.restart();
    const confirmed = await f.api(b, '/api/operations/' + id(111) + '/confirm-sleep', {});
    assert.equal(confirmed.status, 'saved');
    assert.equal(confirmed.sleepEnded, true);
    assert.equal(f.sleeps()[0].end, iso(30));
    assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
  } finally {f.close();}
});

test('a stale phone cannot start ordinary sleep over a durable paused nap', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(120), kind: 'sleep', nap: true}); f.tick(60);
    await f.timers.pause(a, '1', {operationId: id(121)}); f.tick(70); await f.timers.operation(a, id(121));
    f.restart();
    await assert.rejects(f.timers.start(b, {operationId: id(122), kind: 'sleep', nap: true}), (e: any) => e.status === 409);
    assert.equal(f.writes.filter(w => w.resource === 'timers' && w.method === 'POST').length, 1);
    assert.equal((await f.timers.active(b)).sleepPaused?.id, id(121));
    assert.equal((await f.timers.resume(b, {operationId: id(123), pauseId: id(121)})).status, 'saved');
  } finally {f.close();}
});

test('a pending interruption resolves a later app discard without saving discarded sleep', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(130), kind: 'sleep', nap: true}); f.tick(60);
    assert.equal((await f.timers.start(b, {operationId: id(131), kind: 'feed', side: 'L'})).needsConfirmation, true);
    assert.equal((await f.timers.discard(a, '1', {operationId: id(132)})).status, 'saved');
    f.restart();
    const result = await f.timers.operation(b, id(131));
    assert.equal(result.status, 'saved');
    assert.equal(result.eventSaved, true);
    assert.equal(result.sleepEnded, false);
    assert.equal(result.sleepDiscarded, true);
    assert.equal(f.sleeps().length, 0);
    assert.equal((await f.timers.operation(b, id(131))).sleepDiscarded, true);
  } finally {f.close();}
});

test('a pending interruption accepts a later app End without saving another sleep cutoff', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(140), kind: 'sleep', nap: true}); f.tick(60);
    await f.timers.start(b, {operationId: id(141), kind: 'feed', side: 'L'});
    f.tick(120); await f.timers.stop(a, '1', {operationId: id(142)});
    f.tick(130); await f.timers.operation(a, id(142));
    f.restart();
    const result = await f.timers.operation(b, id(141));
    assert.equal(result.status, 'saved');
    assert.equal(result.sleepEnded, true);
    assert.deepEqual(f.sleeps().map(row => [row.start, row.end]), [[iso(0), iso(120)]]);
    assert.equal(f.writes.filter(w => w.resource === 'sleep').length, 1);
  } finally {f.close();}
});

function browserQuickEvent(event: Record<string, unknown>, sheet: Record<string, unknown> = {}, duration = 0) {
  const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const section = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  const context = vm.createContext({Date, Intl, LittleDaysZone: {get: () => 'America/Mexico_City'}, event, sheet, duration, nowM: () => 720, nowExactM: () => 720.5,
    dayISO: () => '2026-10-25', rangeStart: () => 719});
  vm.runInContext([
    section('function addTime(', '\nfunction '),
    section('function exactISOAt(', '\nfunction '),
    section('function localISOAt(', '\nfunction operationFor('),
    'globalThis.result = eventForAPI({...event, t: addTime(sheet, duration)});',
  ].join('\n'), context);
  return context.result;
}

test('a quick diaper in the nap start minute keeps seconds through the browser request and ends sleep', async () => {
  const f = fixture();
  try {
    f.tick(10); await f.timers.start(a, {operationId: id(150), kind: 'sleep', nap: true}); f.tick(30);
    const event = browserQuickEvent({type: 'diaper', kind: 'W'});
    assert.equal(event.time, '2026-10-25T18:00:30.000Z');
    const result = await f.api(a, '/api/events', {operationId: id(151), event});
    assert.equal(result.sleepEnded, true);
    assert.deepEqual(f.sleeps().map(row => [row.start, row.end]), [[iso(10), iso(30)]]);
    const backdated = browserQuickEvent({type: 'diaper', kind: 'W'}, {timeEdited: true});
    assert.equal(backdated.time, '2026-10-25T17:59:00.000Z');
    const bottle = browserQuickEvent({type: 'bottle', dur: 0.25}, {}, 0.25);
    assert.equal(bottle.start, '2026-10-25T18:00:15.000Z');
    assert.equal(bottle.end, '2026-10-25T18:00:30.000Z');
  } finally {f.close();}
});

test('a dirty diaper from a phone 160ms ahead saves and ends sleep at the corrected time once', async () => {
  const f = fixture();
  try {
    f.tick(10); await f.timers.start(a, {operationId: id(155), kind: 'sleep', nap: true}); f.tick(30);
    const input = {operationId: id(156), event: {type: 'diaper', kind: 'D', time: iso(30.160)}};
    const result = await f.api(a, '/api/events', input);
    assert.equal(result.sleepEnded, true);
    assert.deepEqual(f.sleeps().map(row => [row.start, row.end]), [[iso(10), iso(30)]]);
    const changes = () => f.writes.filter(row => row.resource === 'changes' && row.method === 'POST');
    assert.equal(changes()[0].body.time, iso(30));
    f.restart();
    await f.api(a, '/api/events', input);
    assert.equal(changes().length, 1);
    assert.equal(f.sleeps().length, 1);
  } finally {f.close();}
});

test('saved tummy, bath and solids events end sleep at their actual start, including local records', async () => {
  for (const event of [
    {type: 'other', what: 'tummy', start: iso(30), end: iso(45)},
    {type: 'other', what: 'bath', completed: true, time: iso(30)},
    {type: 'other', what: 'tummy', completed: true, time: iso(30)},
    {type: 'other', what: 'solids', food: 'Avocado', time: iso(30)},
  ]) {
    const f = fixture();
    try {
      await f.timers.start(a, {operationId: id(160), kind: 'sleep', nap: true}); f.tick(60);
      const input = {operationId: id(161), event};
      assert.equal((await f.timers.createEvent(a, input)).sleepEnded, true, JSON.stringify(event));
      assert.equal(f.sleeps()[0].end, iso(30));
      await f.timers.createEvent(a, input);
      assert.equal(f.sleeps().length, 1);
      assert.equal(f.store.getOperation(id(161))?.state, 'saved');
    } finally {f.close();}
  }
});

test('tummy and bath timer starts end sleep only after a successful start; pumping does not', async () => {
  for (const kind of ['tummy', 'bath', 'pump']) {
    const f = fixture();
    try {
      await f.timers.start(a, {operationId: id(170), kind: 'sleep', nap: true}); f.tick(60);
      const input = {operationId: id(171), kind};
      const result = await f.timers.start(a, input);
      assert.equal(result.status, 'saved');
      assert.equal(Boolean((await f.timers.active(a)).sleepRun), kind === 'pump');
      assert.equal(f.sleeps().length, kind === 'pump' ? 0 : 1);
      await f.timers.start(a, input);
      assert.equal(f.writes.filter(w => w.resource === 'timers' && w.method === 'POST').length, 2);
    } finally {f.close();}
  }
});

test('an uncertain wake timer start preserves sleep, then recovers once after restart', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(180), kind: 'sleep', nap: true}); f.tick(60);
    f.faults.loseTimer = true;
    const input = {operationId: id(181), kind: 'tummy'};
    assert.equal((await f.timers.start(a, input)).status, 'pending');
    assert.ok((await f.timers.active(a)).sleepRun);
    assert.equal(f.sleeps().length, 0);
    f.restart(); f.tick(120); f.faults.loseTimer = false;
    assert.equal((await f.timers.operation(a, id(181))).sleepEnded, true);
    assert.equal(f.sleeps()[0].end, iso(60));
    await f.timers.start(a, input);
    assert.equal(f.writes.filter(w => w.resource === 'timers' && w.method === 'POST').length, 2);
    assert.equal(f.sleeps().length, 1);
  } finally {f.close();}
});

test('a rejected wake timer start stays failed on retry and never ends sleep', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(190), kind: 'sleep', nap: true}); f.tick(60);
    f.faults.refuseTimer = true;
    const input = {operationId: id(191), kind: 'bath'};
    assert.equal((await f.timers.start(a, input)).status, 'failed');
    f.restart(); f.faults.refuseTimer = false;
    assert.equal((await f.timers.start(a, input)).status, 'failed');
    assert.equal((await f.timers.operation(a, id(191))).status, 'failed');
    assert.ok((await f.timers.active(a)).sleepRun);
    assert.equal(f.sleeps().length, 0);
    assert.equal(f.writes.filter(w => w.resource === 'timers' && w.method === 'POST').length, 1);
  } finally {f.close();}
});

test('an overdue sleep interruption exposes its child correction and recovers without repeating the diaper', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(200), kind: 'sleep', nap: true}); f.tick(90000);
    const input = {operationId: id(201), event: {type: 'diaper', kind: 'W', time: iso(90000)}};
    const result = await f.timers.createEvent(a, input);
    assert.equal(result.eventSaved, true);
    assert.equal(result.correctionRequired, true);
    assert.equal(result.start, iso(0));
    assert.equal(result.maxEnd, iso(86400));
    assert.equal(result.timerId, '1');
    assert.notEqual(result.sleepOperationId, id(201));
    assert.equal(f.sleeps().length, 0);
    f.restart();
    const recovered = await f.timers.operation(a, id(201));
    assert.equal(recovered.correctionRequired, true);
    assert.equal(recovered.sleepOperationId, result.sleepOperationId);
    await f.timers.correct(a, String(result.sleepOperationId), {end: iso(3600)});
    f.tick(90011);
    assert.equal((await f.timers.operation(a, id(201))).sleepEnded, true);
    await f.timers.createEvent(a, input);
    assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
    assert.deepEqual(f.sleeps().map(row => [row.start, row.end]), [[iso(0), iso(3600)]]);
  } finally {f.close();}
});

test('Undo of an interrupted sleep correction keeps the diaper saved and the nap active across restart', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(210), kind: 'sleep', nap: true}); f.tick(90000);
    const input = {operationId: id(211), event: {type: 'diaper', kind: 'W', time: iso(90000)}};
    const partial = await f.timers.createEvent(a, input);
    const stopId = String(partial.sleepOperationId);
    await f.timers.correct(a, stopId, {end: iso(3600)});
    assert.equal((await f.timers.undo(a, stopId)).status, 'cancelled');
    f.restart();
    const completed = await f.timers.operation(a, id(211));
    assert.equal(completed.status, 'saved');
    assert.equal(completed.eventSaved, true);
    assert.equal(completed.sleepEnded, false);
    assert.equal(completed.sleepCancelled, true);
    f.restart(); f.tick(90100);
    for (const result of [await f.timers.operation(a, id(211)), await f.timers.createEvent(a, input)]) {
      assert.equal(result.status, 'saved');
      assert.equal(result.sleepEnded, false);
      assert.equal(result.sleepCancelled, true);
    }
    assert.ok((await f.timers.active(a)).sleepRun);
    assert.equal(f.sleeps().length, 0);
    assert.equal(f.writes.filter(w => w.resource === 'changes').length, 1);
    assert.equal(f.writes.filter(w => w.method === 'DELETE').length, 0);
  } finally {f.close();}
});

// Stop takeover: the other adult's poll finishes a stop that its adult left waiting.
type Fixture = ReturnType<typeof fixture>;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 300 && !check(); i++) await pause(2);
  assert.ok(check(), 'the condition was not reached');
}
const stateOf = (f: Fixture, operationId: string) => f.store.getOperation(operationId)?.state;
const rowsOf = (f: Fixture, resource: string) => [...f.rows].filter(([key]) => key.startsWith(`${resource}:`)).map(([, row]) => row);
const feedWrites = (f: Fixture) => f.writes.filter(write => write.resource === 'feedings' && write.method === 'POST').length;

// Adult a starts a timer at 0, asks to stop it at 600 s, and leaves the stop waiting.
async function leaveStopWaiting(f: Fixture, start: Record<string, unknown>, stop: Record<string, unknown> = {}, paused = false) {
  f.store.putSetting('app', 'unitContract', {verified: true, volume: 'ml'});
  await f.timers.start(a, {operationId: id(1000), ...start});
  f.tick(600);
  const stopped = await (paused ? f.timers.pause : f.timers.stop)(a, '1', {operationId: id(1001), ...stop});
  assert.equal(stopped.status, 'pending');
  return id(1001);
}

test('T1-takeover: the second adult finishes the first adult\'s waiting stop with the first adult\'s frozen entry', async t => {
  const cases = [
    {name: 'breast feed with a note', start: {kind: 'feed', side: 'L'}, stop: {note: 'first adult note'}, resource: 'feedings', check: (row: any) => { assert.equal(row.method, 'left breast'); assert.equal(row.notes, 'first adult note'); }},
    {name: 'bottle feed with amounts', start: {kind: 'feed', side: 'bottle'}, stop: {amounts: {ml: 90, milk: 'formula'}, note: 'bottle note'}, resource: 'feedings', check: (row: any) => { assert.equal(row.method, 'bottle'); assert.equal(row.amount, 90); assert.equal(row.notes, 'bottle note'); }},
    {name: 'pump with amounts', start: {kind: 'pump'}, stop: {amounts: {leftMl: 30, rightMl: 25}, note: 'pump note'}, resource: 'pumping', check: (row: any) => { assert.equal(row.amount, 55); assert.equal(row.notes, 'pump note'); }},
    {name: 'paused sleep', start: {kind: 'sleep', nap: true, note: 'nap note'}, stop: {}, resource: 'sleep', check: (row: any) => { assert.equal(row.nap, true); assert.equal(row.notes, 'nap note'); }},
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const f = fixture();
    try {
      const waiting = await leaveStopWaiting(f, item.start, item.stop, item.name === 'paused sleep');
      f.tick(700);
      await f.timers.active(b);
      await until(() => stateOf(f, waiting) === 'saved');
      const [row] = rowsOf(f, item.resource);
      assert.equal(rowsOf(f, item.resource).length, 1);
      assert.equal(row.end, iso(600));
      item.check(row);
      assert.equal(f.rows.has('timers:1'), false);
      const eventOperation = f.store.getOperation(String((f.store.getOperation(waiting)!.metadata as any).eventOperationId))!;
      assert.equal(eventOperation.adult, a.adult);
      assert.equal(f.store.getEventMetadata(item.resource, String(row.id))?.adult, a.adult);
      if (item.name === 'paused sleep') assert.equal((f.store.getSetting('app', 'sleepPaused') as any)?.by, a.adult);
      assert.equal((await f.timers.operation(a, waiting)).status, 'saved');
      assert.equal(rowsOf(f, item.resource).length, 1);
    } finally {f.close();}
  });
});

test('T1-takeover: a stop waiting under 60 seconds past its deadline, one needing a correction, or one the poller may not stop stays with its adult', async t => {
  const cases = [
    {name: 'inside 60 seconds', tick: 669, setup: async (_f: Fixture) => {}},
    {name: 'no stop permission for the poller', tick: 700, setup: async (f: Fixture) => { f.store.putSetting('user:18', 'timerDeletePermission', false); }},
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const f = fixture();
    try {
      const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
      await item.setup(f);
      f.tick(item.tick);
      await f.timers.active(b);
      await pause(30);
      assert.equal(stateOf(f, stopId), 'pending');
      assert.equal(feedWrites(f), 0);
      assert.equal(f.rows.has('timers:1'), true);
    } finally {f.close();}
  });
  await t.test('exactly 60 seconds past the deadline', async () => {
    const f = fixture();
    try {
      const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
      f.tick(670);
      await f.timers.active(b);
      await until(() => stateOf(f, stopId) === 'saved');
    } finally {f.close();}
  });
  await t.test('a stop that needs a corrected end time', async () => {
    const f = fixture();
    try {
      await f.timers.start(a, {operationId: id(1010), kind: 'feed', side: 'L'});
      f.tick(25 * 3600);
      const stopped = await f.timers.stop(a, '1', {operationId: id(1011)});
      assert.equal(stopped.correctionRequired, true);
      f.tick(26 * 3600);
      await f.timers.active(b);
      await pause(30);
      assert.equal(stateOf(f, id(1011)), 'pending');
      assert.equal(feedWrites(f), 0);
    } finally {f.close();}
  });
});

test('T1-takeover: a stop in finishing keeps its lock and logs one line', async () => {
  const f = fixture();
  try {
    const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
    f.faults.delete = true; f.tick(615);
    assert.equal((await f.timers.operation(a, stopId)).status, 'finishing');
    f.faults.delete = false; f.tick(800);
    await f.timers.active(b); await f.timers.active(b);
    await pause(30);
    assert.equal(stateOf(f, stopId), 'finishing');
    assert.equal(feedWrites(f), 1);
    assert.equal(f.rows.has('timers:1'), true);
    assert.equal(f.logs.filter(line => /keeps its lock/.test(line)).length, 1);
  } finally {f.close();}
});

test('T1-takeover: a waiting side switch is not taken over and logs one line', async () => {
  const f = fixture();
  try {
    await f.timers.start(a, {operationId: id(1020), kind: 'feed', side: 'L'});
    f.tick(600);
    await f.timers.switchSide(a, '1', {operationId: id(1021), side: 'R'});
    f.tick(700);
    await f.timers.active(b); await f.timers.active(b);
    await pause(30);
    assert.equal(stateOf(f, id(1021)), 'pending');
    assert.equal(feedWrites(f), 0);
    assert.equal(f.logs.filter(line => /side switch/.test(line)).length, 1);
  } finally {f.close();}
});

test('T1-takeover: a takeover that runs while the first adult\'s own run waits saves one entry and one event operation', async () => {
  const f = fixture();
  try {
    const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
    f.tick(615);
    let release = () => {};
    f.faults.gate = new Promise<void>(resolve => { release = resolve; });
    const first = f.timers.operation(a, stopId);
    await pause(10);
    f.tick(700);
    await f.timers.active(b);
    await pause(10);
    f.faults.gate = null; release();
    assert.equal((await first).status, 'saved');
    await pause(30);
    assert.equal(feedWrites(f), 1);
    assert.equal(rowsOf(f, 'feedings').length, 1);
    assert.equal(f.store.listOperations(a.adult, 'feedings').length, 1);
    assert.equal(f.store.listOperations(b.adult, 'feedings').length, 0);
  } finally {f.close();}
});

test('T1-takeover: a takeover finds the event operation the first adult already created', async () => {
  const f = fixture();
  try {
    const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
    const stop = f.store.getOperation(stopId)!;
    // The service stopped after the event save and before it marked the stop.
    const created = await f.records().createEvent(a, {operationId: String((stop.metadata as any).eventOperationId), event: stop.requestBody as Record<string, unknown>});
    assert.equal(created.status, 'saved');
    f.tick(700);
    await f.timers.active(b);
    await until(() => stateOf(f, stopId) === 'saved');
    assert.equal(rowsOf(f, 'feedings').length, 1);
    assert.equal(feedWrites(f), 1);
    assert.equal(f.rows.has('timers:1'), false);
    assert.equal(f.store.listOperations(b.adult, 'feedings').length, 0);
  } finally {f.close();}
});

test('T1-takeover: after a takeover whose timer delete failed, the first adult\'s retry reaches saved', async () => {
  const f = fixture();
  try {
    const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
    f.faults.delete = true; f.tick(700);
    await f.timers.active(b);
    await until(() => stateOf(f, stopId) === 'finishing');
    f.faults.delete = false;
    assert.equal((await f.timers.operation(a, stopId)).status, 'saved');
    assert.equal(rowsOf(f, 'feedings').length, 1);
    assert.equal(f.rows.has('timers:1'), false);
    assert.equal(f.store.getEventMetadata('feedings', String(rowsOf(f, 'feedings')[0].id))?.adult, a.adult);
  } finally {f.close();}
});

test('T1-takeover: a takeover whose Baby Buddy request fails logs one line, leaves the stop unsaved, and rejects nothing', async () => {
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', listener);
  const f = fixture();
  try {
    const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
    f.faults.feedings = true; f.tick(700);
    await f.timers.active(b);
    await until(() => f.logs.length === 1);
    assert.match(f.logs[0], /takeover .* ended as finishing/);
    assert.equal(stateOf(f, stopId), 'finishing');
    assert.equal(f.rows.has('timers:1'), true);
    await pause(30);
    assert.deepEqual(unhandled, []);
  } finally {process.off('unhandledRejection', listener); f.close();}
});

test('T1-takeover: a takeover that throws is logged by error name and rejects nothing', async () => {
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', listener);
  const f = fixture();
  try {
    const stopId = await leaveStopWaiting(f, {kind: 'feed', side: 'L'});
    f.store.completeTimerOperation = () => {throw new Error('Interrupted before marker commit');};
    f.tick(700);
    await f.timers.active(b);
    await until(() => f.logs.length === 1);
    assert.match(f.logs[0], /takeover .* failed: Error\./);
    assert.doesNotMatch(f.logs[0], /Interrupted/);
    assert.equal(stateOf(f, stopId), 'finishing');
    await pause(30);
    assert.deepEqual(unhandled, []);
  } finally {process.off('unhandledRejection', listener); f.close();}
});

test('T1-owner: an owner field in an event request body does not change the stored owner', async () => {
  const f = fixture();
  try {
    f.tick(60);
    const reply = await f.api(b, '/api/events', {operationId: id(1030), owner: a.adult, adult: a.adult, event: {type: 'diaper', kind: 'W', time: iso(30), owner: a.adult}});
    assert.equal(reply.status, 'saved');
    assert.equal(f.store.getOperation(id(1030))?.adult, b.adult);
    const row = rowsOf(f, 'changes')[0];
    assert.equal(f.store.getEventMetadata('changes', String(row.id))?.adult, b.adult);
  } finally {f.close();}
});
