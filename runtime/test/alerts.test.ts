import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import test from 'node:test';
import { createAlerts } from '../server/alerts.ts';
import { createHousehold } from '../server/household.ts';
import { HttpError } from '../server/http.ts';
import { createRecords } from '../server/records.ts';
import { createRouter } from '../server/router.ts';
import { createSessionService } from '../server/session.ts';
import { hashSecret, openStore } from '../server/store.ts';
import { createTimers } from '../server/timers.ts';
import { createCare } from '../server/care.ts';
import { createPhotos } from '../server/photos.ts';
import { Readable } from 'node:stream';

const op = (tail: string) => `00000000-0000-4000-8000-0000000000${tail}`;

function phoneKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };
}

async function reqJson(router: ReturnType<typeof createRouter>, session: { sessionId: string; csrfToken: string; adult: string }, method: string, path: string, body?: unknown) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = Object.assign(Readable.from(payload ? [Buffer.from(payload)] : []), {
    method,
    url: path,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });
  let status = 200;
  let text = '';
  const res = {
    writeHead(code: number) { status = code; return this; },
    end(chunk?: string | Buffer) { if (chunk) text += String(chunk); },
  };
  await router.handle(req as never, res as never, new URL(`https://example.test${path}`), session);
  return { status, body: text ? JSON.parse(text) : {} };
}

function makeFixture(opts: {
  nowMs?: number;
  passcodeOff?: boolean;
  pushContact?: string;
  accounts?: { username: string; password: string }[];
  fetchImpl?: typeof fetch;
} = {}) {
  const store = openStore(':memory:');
  let clock = opts.nowMs ?? Date.parse('2026-11-23T16:00:00.000Z'); // 10:00 AM America/Mexico_City
  const now = () => clock;
  const setNow = (ms: number) => { clock = ms; };

  const accounts = opts.accounts ?? [
    { username: 'Sage', password: 'pw1' },
    { username: 'Rowan', password: 'pw2' },
  ];
  store.putSetting('app', 'people', accounts.map(a => a.username));
  store.putSetting('app', 'child', { id: 7, slug: 'luna', dueDate: null });
  store.putSetting('app', 'unitContract', { verified: true, volume: 'ml', temperature: 'C', weight: 'kg', length: 'cm' });

  const allPerms = [
    'core.view_child', 'core.view_feeding', 'core.add_feeding', 'core.change_feeding', 'core.delete_feeding',
    'core.view_sleep', 'core.add_sleep', 'core.change_sleep', 'core.delete_sleep',
    'core.view_medication', 'core.add_medication', 'core.change_medication', 'core.delete_medication',
    'core.view_timer', 'core.add_timer', 'core.change_timer', 'core.delete_timer',
    'core.view_note', 'core.view_diaperchange',
  ];
  store.putSetting('user:17', 'permissions', [...allPerms]);
  store.putSetting('user:18', 'permissions', [...allPerms]);
  store.putSetting('user:17', 'timerDeletePermission', true);
  store.putSetting('user:18', 'timerDeletePermission', true);

  let nextId = 100;
  const bb: Record<string, Record<string, unknown>[]> = {
    feedings: [], sleep: [], medication: [], timers: [], changes: [], pumping: [], notes: [],
    temperature: [], weight: [], height: [], 'head-circumference': [], 'tummy-times': [],
  };
  const bbRequests: { userId: number; resource: string; method: string; id?: string | number }[] = [];
  let bbInterceptor: ((userId: number, req: { resource: string; method: string; id?: string | number; query?: Record<string, string | number>; body?: unknown }) => Promise<unknown> | unknown) | null = null;

  const babyBuddy = {
    async login(username: string) {
      return { cookies: new Map(), csrfToken: 't', userId: username === 'Sage' ? 17 : 18, username };
    },
    async identity(s: { userId: number; username: string }) { return { id: s.userId, username: s.username }; },
    async logout() {},
    async request(s: { userId: number; username: string }, req: { resource: string; method: string; id?: string | number; query?: Record<string, string | number>; body?: unknown }) {
      bbRequests.push({ userId: s.userId, resource: req.resource, method: req.method, id: req.id });
      if (bbInterceptor) {
        const overridden = await bbInterceptor(s.userId, req);
        if (overridden !== undefined) return overridden;
      }
      if (req.resource === 'children' && req.method === 'GET') return { id: 7, slug: 'luna', first_name: 'Luna', last_name: '', birth_date: '2026-11-06' };
      const list = bb[req.resource];
      if (!list) return [];
      if (req.method === 'GET') {
        if (req.id != null) {
          const hit = list.find(r => String(r.id) === String(req.id));
          if (!hit) throw new HttpError(404, 'Not found');
          return hit;
        }
        return { results: [...list] };
      }
      if (req.method === 'POST') {
        const row = { ...(req.body as Record<string, unknown>), id: nextId++, user: s.userId };
        list.push(row);
        return row;
      }
      if (req.method === 'PATCH') {
        const hit = list.find(r => String(r.id) === String(req.id));
        if (!hit) throw new HttpError(404, 'Not found');
        Object.assign(hit, req.body);
        return hit;
      }
      if (req.method === 'DELETE') {
        const idx = list.findIndex(r => String(r.id) === String(req.id));
        if (idx < 0) throw new HttpError(404, 'Not found');
        list.splice(idx, 1);
        return {};
      }
      return {};
    },
  };

  const sentPushes: { url: string; ttl: string; bodyLen: number }[] = [];
  let pushResponder: (url: string, init?: RequestInit) => Promise<Response> | Response = async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    sentPushes.push({ url, ttl: headers.TTL || '', bodyLen: Buffer.isBuffer(init?.body) ? init.body.length : 0 });
    return new Response('', { status: 201 });
  };
  const fetchImpl: typeof fetch = opts.fetchImpl ?? (async (url, init) => pushResponder(String(url), init));

  const sessions = createSessionService({ store, babyBuddy, accounts, now });
  const records = createRecords({ store, sessions, now: () => new Date(now()) });
  const alerts = createAlerts({
    store,
    sessions,
    pushContact: opts.pushContact ?? 'https://github.com/jnkliberty/little-days',
    passcodeOff: opts.passcodeOff ?? true,
    fetchImpl,
    now,
    tickMs: 60_000,
  });
  const timers = createTimers({
    store, sessions, records, now,
    onTakeOverSaved: (session, opId) => alerts.onWrite(session, opId),
  });
  const photos = createPhotos({ store, sessions, baseUrl: 'http://babybuddy.test' });
  const household = createHousehold({
    store, sessions, records,
    alertDelivery: (userId, enabled) => alerts.deliveryFor(userId, enabled),
  });
  const care = createCare({ store, sessions });
  const router = createRouter({ store, records, timers, photos, household, care, alerts });

  const makeSession = async (username: 'Sage' | 'Rowan') => sessions.select(username, sessions.issueLoginCsrf());

  return {
    store, sessions, records, timers, household, router, alerts, bb, bbRequests, sentPushes,
    now, setNow, makeSession,
    setBbInterceptor: (fn: typeof bbInterceptor) => { bbInterceptor = fn; },
    setPushResponder: (fn: typeof pushResponder) => { pushResponder = fn; },
  };
}

// Failure case: first push enrollment fails on NOT NULL created_at, cross-session subscribe hijacks another phone, or unsubscribe deletes another session's row.
test('push subscription sets created_at, blocks cross-session hijack (409), scopes unsubscribe, and sweeps expired sessions', async () => {
  const f = makeFixture();
  try {
    const s1 = await f.makeSession('Sage');
    const s2 = await f.makeSession('Rowan');
    const k1 = phoneKeys();
    const ep = 'https://web.push.apple.com/phone-1';

    const first = await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: ep, keys: k1 });
    assert.equal(first.status, 200);
    const active1 = f.store.listActivePushSubscriptions(f.now());
    assert.equal(active1.length, 1);
    const createdAt = active1[0].createdAt;
    assert.ok(createdAt > 0);

    // Renewal preserves created_at and updates updated_at
    f.setNow(f.now() + 5000);
    const renew = await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: ep, keys: phoneKeys() });
    assert.equal(renew.status, 200);
    const active2 = f.store.listActivePushSubscriptions(f.now());
    assert.equal(active2[0].createdAt, createdAt);
    assert.equal(active2[0].updatedAt, createdAt + 5000);

    // Cross-session live binding conflict returns 409
    await assert.rejects(
      () => reqJson(f.router, s2, 'POST', '/api/push/subscribe', { endpoint: ep, keys: phoneKeys() }),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );

    // Unsubscribe from another session does NOT delete s1's subscription
    await reqJson(f.router, s2, 'POST', '/api/push/unsubscribe', { endpoint: ep });
    assert.equal(f.store.listActivePushSubscriptions(f.now()).length, 1);

    // Expiring s1's session sweeps push_subscriptions on tick
    f.store.renewSession(s1.sessionId, f.now() - 1000);
    await f.alerts.tick();
    assert.equal(f.store.listActivePushSubscriptions(f.now()).length, 0);
  } finally { f.store.close(); }
});

// Failure case: ordinary medicine POST misses scheduling, polling an old create reverts a correction, or logging an early next dose leaves the old alert armed.
test('medicine scheduling handles ordinary POST, correction immunity on stale poll, early next dose auto-cancel, and DST instant', async () => {
  const f = makeFixture({ nowMs: Date.parse('2026-11-01T07:30:00.000Z') }); // second 1:30 AM Chicago DST fallback
  try {
    const s1 = await f.makeSession('Sage');
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-1', keys: phoneKeys() });

    // Ordinary POST schedules immediately without polling /api/operations/:id
    const dose1Time = '2026-11-01T07:30:00.000Z';
    const created = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('10'),
      event: { type: 'med', name: 'Vitamin D', dose: '400', unit: 'drops', next: 4, time: dose1Time },
    });
    assert.equal(created.body.status, 'saved');
    const medId = String(created.body.id);
    // Baby Buddy body must NOT contain next_dose_interval
    assert.equal('next_dose_interval' in f.bb.medication[0], false);
    const due1 = f.store.getAlertDue(medId);
    assert.ok(due1);
    assert.equal(due1.dueAt, Date.parse(dose1Time) + 4 * 3600_000);

    // Correct dose time to 1 hour later
    const dose1Corrected = '2026-11-01T08:30:00.000Z';
    const updated = await reqJson(f.router, s1, 'PATCH', `/api/events/${encodeURIComponent(medId)}`, {
      operationId: op('11'),
      event: { type: 'med', name: 'Vitamin D', dose: '400', unit: 'drops', next: 4, time: dose1Corrected },
    });
    assert.equal(updated.body.status, 'saved');
    assert.equal(f.store.getAlertDue(medId)?.dueAt, Date.parse(dose1Corrected) + 4 * 3600_000);

    // Polling the old create operation MUST NOT revert the corrected due time
    await reqJson(f.router, s1, 'GET', `/api/operations/${op('10')}`);
    assert.equal(f.store.getAlertDue(medId)?.dueAt, Date.parse(dose1Corrected) + 4 * 3600_000);

    // Add a second DIFFERENT medicine (must stay armed when Vitamin D is logged again)
    const other = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('12'),
      event: { type: 'med', name: 'Iron', dose: '1', unit: 'ml', next: 6, time: dose1Time },
    });
    const otherId = String(other.body.id);
    assert.ok(f.store.getAlertDue(otherId));

    // Log next Vitamin D dose early -> cancels earlier Vitamin D alert, keeps Iron armed
    const early = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('13'),
      event: { type: 'med', name: 'vitamin d', dose: '400', unit: 'drops', next: 4, time: '2026-11-01T10:00:00.000Z' },
    });
    assert.equal(f.store.getAlertDue(medId), null, 'earlier pending alert for same medicine must cancel');
    assert.ok(f.store.getAlertDue(String(early.body.id)), 'new dose alert must be armed');
    assert.ok(f.store.getAlertDue(otherId), 'different medicine alert must stay armed');

    // Clearing next hours on edit deletes due row
    await reqJson(f.router, s1, 'PATCH', `/api/events/${encodeURIComponent(otherId)}`, {
      operationId: op('14'),
      event: { type: 'med', name: 'Iron', dose: '1', unit: 'ml', next: null, time: dose1Time },
    });
    assert.equal(f.store.getAlertDue(otherId), null);
  } finally { f.store.close(); }
});

// Failure case: provider 503 or restart loses alerts, 400/413 deletes healthy phones, 401/403 hides error, or 401 wipes permissions.
test('delivery retries on 503, preserves bindings on 400/413, surfaces 401/403, and keeps permissions read-only on auth error', async () => {
  const f = makeFixture();
  try {
    const s1 = await f.makeSession('Sage');
    const s2 = await f.makeSession('Rowan');
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-a', keys: phoneKeys() });
    f.setNow(f.now() + 1000);
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-b', keys: phoneKeys() });
    await reqJson(f.router, s2, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/rowan-a', keys: phoneKeys() });

    const doseTime = new Date(f.now() - 2 * 3600_000).toISOString();
    const med = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('20'),
      event: { type: 'med', name: 'Drops', dose: '1', unit: 'ml', next: 2, time: doseTime },
    });
    const medId = String(med.body.id);

    // 1. Temporary 401 from Baby Buddy blocks dispatch for Sage without deleting user:17 permissions
    f.setBbInterceptor((uid, req) => {
      if (uid === 17 && req.resource === 'medication' && req.method === 'GET') throw new HttpError(401, 'auth');
      return undefined;
    });
    await f.alerts.tick();
    assert.equal(f.sentPushes.length, 1, 'Rowan gets push while Sage is blocked');
    assert.equal(f.sentPushes[0].url, 'https://web.push.apple.com/rowan-a');
    assert.ok((f.store.getSetting('user:17', 'permissions') as string[]).includes('core.view_medication'), 'permissions must stay intact');

    // 2. Restore Baby Buddy, return 503 from provider -> retries after 5-min block backoff, does not re-send to Rowan
    f.setBbInterceptor(null);
    let mode: '503' | '413' | '401' | '201' = '503';
    f.setPushResponder(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (mode === '503') return new Response('', { status: 503 });
      if (mode === '413') return new Response('', { status: 413 });
      if (mode === '401') return new Response('', { status: 401 });
      f.sentPushes.push({ url, ttl: headers.TTL || '', bodyLen: 1 });
      return new Response('', { status: 201 });
    });
    // Within 5-min backoff window, Baby Buddy is NOT re-queried for Sage
    f.bbRequests.length = 0;
    f.setNow(f.now() + 120_000);
    await f.alerts.tick();
    assert.equal(f.bbRequests.filter(r => r.userId === 17).length, 0, 'Baby Buddy must not be re-queried during 5-min block backoff');
    assert.equal(f.sentPushes.length, 1);
    f.setNow(f.now() + 200_000);
    await f.alerts.tick();
    assert.equal(f.sentPushes.length, 1);

    // 3. 413 keeps BOTH of Sage's subscriptions enrolled
    mode = '413';
    f.setNow(f.now() + 180_000);
    await f.alerts.tick();
    assert.equal(f.store.listActivePushSubscriptions(f.now()).filter(b => b.babyBuddyUserId === 17).length, 2);

    // 4. 401 sets authError in /api/push/config
    mode = '401';
    f.setNow(f.now() + 360_000);
    await f.alerts.tick();
    const cfgErr = await reqJson(f.router, s1, 'GET', '/api/push/config');
    assert.equal(cfgErr.body.authError, true);

    // 5. 201 succeeds on Sage's pinned binding, clears authError, and never re-sends
    mode = '201';
    f.setNow(f.now() + 360_000);
    await f.alerts.tick();
    assert.equal(f.sentPushes.length, 2);
    assert.equal(f.sentPushes[1].url, 'https://web.push.apple.com/sage-b');
    const cfgOk = await reqJson(f.router, s1, 'GET', '/api/push/config');
    assert.equal(cfgOk.body.authError, false);

    // Further tick sends nothing
    f.setNow(f.now() + 60_000);
    await f.alerts.tick();
    assert.equal(f.sentPushes.length, 2);
    assert.ok(f.store.getAlertDue(medId));
  } finally { f.store.close(); }
});

// Failure case: pre-upgrade reminder retry returns 409, upgraded DB misses tomorrow's reminder, or passcode-on-unset sends alerts.
test('startup seeds upgraded reminders, pre-upgrade retry avoids 409, delete removes due row, and passcode gate blocks sends', async () => {
  const f = makeFixture({ passcodeOff: false });
  try {
    const s1 = await f.makeSession('Sage');
    const tomorrowISO = new Date(f.now() + 10 * 60_000).toISOString();

    // Seed pre-upgrade reminder in settings and pre-upgrade operation with legacy delivery:'unavailable'
    f.store.putSetting('user:17', 'reminders', [
      { id: `reminder:${op('30')}`, recipient: 'Sage', what: 'feed', scheduledAt: tomorrowISO, enabled: true, delivery: 'unavailable' },
    ]);
    f.store.beginOperation({
      id: op('30'), adult: 'Sage', resource: 'reminder',
      intent: { action: 'create-reminder', target: `reminder:${op('30')}` },
      requestBody: { recipient: 'Sage', what: 'feed', scheduledAt: tomorrowISO, enabled: true, delivery: 'unavailable' },
      metadata: {},
    });
    f.store.finishOperation(op('30'), 'saved', `reminder:${op('30')}`);

    // Startup reconciliation seeds the pre-existing reminder without any edit
    f.alerts.start();
    await f.alerts.stop();
    assert.ok(f.store.getAlertDue(`reminder:${op('30')}`));

    // Subscribe phone -> retry pre-upgrade operation succeeds without 409 and returns delivery:'push'
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-1', keys: phoneKeys() });
    const retried = await reqJson(f.router, s1, 'POST', '/api/reminders', {
      operationId: op('30'), recipient: 'Sage', what: 'feed', scheduledAt: tomorrowISO, enabled: true,
    });
    assert.equal(retried.body.status, 'saved');
    assert.equal(retried.body.delivery, 'push');

    // Passcode is ON and NOT set -> tick must skip sending even when due
    f.setNow(Date.parse(tomorrowISO) + 1000);
    await f.alerts.tick();
    assert.equal(f.sentPushes.length, 0);

    // DELETE /api/reminders/:id removes reminder and due row
    const del = await reqJson(f.router, s1, 'DELETE', `/api/reminders/${encodeURIComponent(`reminder:${op('30')}`)}`, { operationId: op('31') });
    assert.equal(del.body.status, 'saved');
    assert.equal(f.store.getAlertDue(`reminder:${op('30')}`), null);

    // Old client saving preferences without alerts preserves saved alerts switches
    await reqJson(f.router, s1, 'PATCH', '/api/preferences', {
      operationId: op('32'), lang: 'en', units: 'metric', palette: 'Sorbet', night: false,
      alerts: { reminder: 'on', medicine: 'off', nap: 'on', feed: 'off' },
    });
    await reqJson(f.router, s1, 'PATCH', '/api/preferences', {
      operationId: op('33'), lang: 'es', units: 'metric', palette: 'Sorbet', night: true,
    });
    const savedPrefs = f.store.getSetting('user:17', 'preferences') as Record<string, unknown>;
    assert.deepEqual(savedPrefs.alerts, { reminder: 'on', medicine: 'off', nap: 'on', feed: 'off' });
  } finally { f.store.close(); }
});

// Failure case: 6:50 AM wake or 6:50 AM few-night-gaps feed loses morning forecast alert, or background recovery finishes another adult's timer.
test('boundary rules schedule morning nap and feed alerts at 6:50 AM and read-only recovery skips timer takeover', async () => {
  // 2026-11-23 06:50 AM America/Mexico_City = 12:50:00Z
  const now650 = Date.parse('2026-11-23T12:50:00.000Z');
  const f = makeFixture({ nowMs: now650 });
  try {
    const s1 = await f.makeSession('Sage');
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-1', keys: phoneKeys() });
    await reqJson(f.router, s1, 'PATCH', '/api/preferences', {
      operationId: op('40'), lang: 'en', units: 'metric', palette: 'Sorbet', night: false,
      alerts: { reminder: 'on', medicine: 'on', nap: 'on', feed: 'on' },
    });

    // Seed 9 daytime wake->nap gaps (~120 min each) and 9 daytime feed gaps (~120 min each) in last 5 days,
    // and only 2 night feed gaps (< 8 -> 'few' at 6:50 AM!).
    const dayMs = 86_400_000;
    const baseDay = Date.parse('2026-11-23T06:00:00.000Z'); // midnight CST
    let id = 1;
    for (let d = -5; d <= -1; d++) {
      for (const h of [8, 10, 12]) {
        const start = new Date(baseDay + d * dayMs + h * 3600_000).toISOString();
        const end = new Date(baseDay + d * dayMs + h * 3600_000 + 20 * 60_000).toISOString();
        f.bb.feedings.push({ id: id++, child: 7, type: 'breast milk', method: 'left breast', start, end, notes: '' });
      }
      for (const h of [9, 12, 15]) {
        const start = new Date(baseDay + d * dayMs + h * 3600_000).toISOString();
        const end = new Date(baseDay + d * dayMs + (h + 1) * 3600_000).toISOString();
        f.bb.sleep.push({ id: id++, child: 7, nap: true, start, end, notes: '' });
      }
    }
    // Wake at 6:50 AM today (ended at 6:50 AM) and last feed at 6:50 AM
    const sleepRes = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('41'),
      event: { type: 'sleep', nap: false, start: '2026-11-23T09:00:00.000Z', end: '2026-11-23T12:50:00.000Z' },
    });
    assert.equal(sleepRes.body.status, 'saved');
    const feedRes = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('42'),
      event: { type: 'feed', side: 'L', start: '2026-11-23T12:30:00.000Z', end: '2026-11-23T12:50:00.000Z' },
    });
    assert.equal(feedRes.body.status, 'saved');
    await f.alerts.flush();

    const allDue = f.store.listAlertsDue();
    const napDue = allDue.find(r => r.type === 'nap');
    const feedDue = allDue.find(r => r.type === 'feed');
    assert.ok(napDue, '6:50 AM wake must schedule morning nap alert for 7 AM+ window');
    assert.ok(feedDue, '6:50 AM feed with few night gaps and >=8 day gaps must schedule morning feed alert');
    assert.ok(napDue.dueAt >= Date.parse('2026-11-23T13:00:00.000Z'), 'nap due time must be at or after 7:00 AM');
    assert.ok(feedDue.dueAt >= Date.parse('2026-11-23T13:00:00.000Z'), 'feed due time must be at or after 7:00 AM');

    // Startup marks enabled forecasts dirty and background recovery runs read-only without mutating pending stops
    f.alerts.start();
    await f.alerts.stop();
    const dirty = f.store.getSetting('app', 'forecastSyncDirty') as { feed?: boolean; nap?: boolean };
    assert.equal(dirty.feed, true);
    assert.equal(dirty.nap, true);
    await f.alerts.tick();
    const clean = f.store.getSetting('app', 'forecastSyncDirty') as { feed?: boolean; nap?: boolean };
    assert.equal(clean.feed, false);
    assert.equal(clean.nap, false);
  } finally { f.store.close(); }
});

// Failure case: late provider reply suppresses recreated schedule, moving a dose mid-await sends stale alert, or 404/unresolved op leaks medicine alert.
test('schedule_id blocks late-reply suppression, mid-await move aborts send, and 404 or unresolved op stops medicine dispatch', async () => {
  const f = makeFixture();
  try {
    const s1 = await f.makeSession('Sage');
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-1', keys: phoneKeys() });
    const dueISO = new Date(f.now() - 1000).toISOString();
    const created = await reqJson(f.router, s1, 'POST', '/api/reminders', {
      operationId: op('50'), recipient: 'Sage', what: 'feed', scheduledAt: dueISO, enabled: true,
    });
    const remId = String(created.body.id);
    const oldSched = f.store.getAlertDue(remId)!.scheduleId;

    // Pause provider response while deleting and recreating the reminder with a fresh schedule_id
    let releasePush!: () => void;
    const pushStarted = new Promise<void>(resolve => {
      f.setPushResponder(async (url, init) => {
        resolve();
        await new Promise<void>(r => { releasePush = r; });
        const headers = (init?.headers ?? {}) as Record<string, string>;
        f.sentPushes.push({ url, ttl: headers.TTL || '', bodyLen: 1 });
        return new Response('', { status: 201 });
      });
    });
    const tickPromise = f.alerts.tick();
    await pushStarted;
    // Move reminder to a new due time (creates a new schedule_id) before the provider answers
    await reqJson(f.router, s1, 'PATCH', `/api/reminders/${encodeURIComponent(remId)}`, {
      operationId: op('51'), recipient: 'Sage', what: 'feed', scheduledAt: new Date(f.now() - 500).toISOString(), enabled: true,
    });
    const newSched = f.store.getAlertDue(remId)!.scheduleId;
    assert.notEqual(newSched, oldSched);
    releasePush();
    await tickPromise;
    // Late 201 for oldSched MUST NOT mark newSched as sent
    assert.equal(f.store.getAlertDelivery(remId, newSched, 17), null);
    // Clean up the reminder so subsequent medicine ticks test medicine only
    await reqJson(f.router, s1, 'DELETE', `/api/reminders/${encodeURIComponent(remId)}`, { operationId: op('59') });

    // Medicine: unresolved update:medication suspends dispatch, mid-await move aborts send, 404 deletes due row
    const doseISO = new Date(f.now() - 2 * 3600_000).toISOString();
    const med = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('52'),
      event: { type: 'med', name: 'Tylenol', dose: '2', unit: 'ml', next: 2, time: doseISO },
    });
    const medId = String(med.body.id);
    f.store.beginOperation({
      id: op('53'), adult: 'Sage', resource: 'update:medication',
      intent: { action: 'update', target: medId }, requestBody: { id: medId }, metadata: {},
    });
    f.sentPushes.length = 0;
    f.setPushResponder(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      f.sentPushes.push({ url, ttl: headers.TTL || '', bodyLen: 1 });
      return new Response('', { status: 201 });
    });
    await f.alerts.tick();
    assert.equal(f.sentPushes.length, 0, 'unresolved update:medication must suspend dispatch');
    f.store.finishOperation(op('53'), 'cancelled');

    // Move dose while remote GET /api/medication/<id>/ is pending -> local recheck aborts stale send
    let releaseBb!: () => void;
    const bbStarted = new Promise<void>(resolve => {
      f.setBbInterceptor(async (_uid, req) => {
        if (req.resource === 'medication' && req.method === 'GET' && req.id != null) {
          resolve();
          await new Promise<void>(r => { releaseBb = r; });
        }
        return undefined;
      });
    });
    const moveTick = f.alerts.tick();
    await bbStarted;
    f.setBbInterceptor(null);
    await reqJson(f.router, s1, 'PATCH', `/api/events/${encodeURIComponent(medId)}`, {
      operationId: op('54'),
      event: { type: 'med', name: 'Tylenol', dose: '2', unit: 'ml', next: 4, time: doseISO },
    });
    releaseBb();
    await moveTick;
    assert.equal(f.sentPushes.length, 0, 'moving dose mid-await must abort stale send');

    // Delete directly in Baby Buddy (404 on remote check) cancels alert
    f.setNow(Date.parse(doseISO) + 4 * 3600_000 + 1000);
    f.bb.medication.length = 0;
    await f.alerts.tick();
    assert.equal(f.store.getAlertDue(medId), null, '404 in Baby Buddy must delete medicine due row');
  } finally { f.store.close(); }
});

// Failure case: two phones fail to prefer newest or fall back on 410, pinned retries jump phones, TTL ignores session/7PM cap, or zero subscribers poll Baby Buddy.
test('two-phone selection, 410 fallback, pinned retry, tight TTL, zero-subscriber skip, note-only edit, and shutdown await', async () => {
  // 2026-11-23 18:55 CST (5 min before 7 PM) = 2026-11-24T00:55:00Z
  const now1855 = Date.parse('2026-11-24T00:55:00.000Z');
  const f = makeFixture({ nowMs: now1855 });
  try {
    const sOld = await f.makeSession('Sage');
    const sNew = await f.makeSession('Sage');
    await reqJson(f.router, sOld, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-old', keys: phoneKeys() });
    f.setNow(f.now() + 1000);
    await reqJson(f.router, sNew, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-new', keys: phoneKeys() });

    // Newest phone has thisSessionSelected=true, older has false
    assert.equal((await reqJson(f.router, sNew, 'GET', '/api/push/config')).body.thisSessionSelected, true);
    assert.equal((await reqJson(f.router, sOld, 'GET', '/api/push/config')).body.thisSessionSelected, false);

    // Zero forecast subscribers (nap/feed default off) -> alerts.onWrite makes 0 Baby Buddy forecast calls
    await reqJson(f.router, sNew, 'POST', '/api/events', {
      operationId: op('60'),
      event: { type: 'feed', side: 'L', start: new Date(f.now() - 20 * 60_000).toISOString(), end: new Date(f.now() - 5 * 60_000).toISOString() },
    });
    f.bbRequests.length = 0;
    await f.alerts.onWrite(sNew, op('60'));
    assert.equal(f.bbRequests.length, 0, 'alerts.onWrite must make 0 Baby Buddy calls when nobody subscribes to feed forecast');

    // Tight TTL capped by session expiry (120s left) and 410 falls back to older phone in same tick
    f.store.renewSession(sOld.sessionId, f.now() + 120_000);
    const rem = await reqJson(f.router, sNew, 'POST', '/api/reminders', {
      operationId: op('61'), recipient: 'Sage', what: 'feed', scheduledAt: new Date(f.now() - 1000).toISOString(), enabled: true,
    });
    assert.equal(rem.body.status, 'saved');
    const calls: { url: string; ttl: number }[] = [];
    f.setPushResponder(async (url, init) => {
      const ttl = Number(((init?.headers ?? {}) as Record<string, string>).TTL);
      calls.push({ url, ttl });
      if (url.endsWith('sage-new')) return new Response('', { status: 410 });
      return new Response('', { status: 201 });
    });
    await f.alerts.tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://web.push.apple.com/sage-new');
    assert.equal(calls[1].url, 'https://web.push.apple.com/sage-old');
    assert.ok(calls[1].ttl <= 120 && calls[1].ttl >= 118, `TTL must cap at session expiry (${calls[1].ttl})`);
    assert.equal(f.store.listActivePushSubscriptions(f.now(), 17).length, 1, '410 must remove dead binding only');

    // Note-only medicine edit (omitting next) preserves nextDoseHours and exact doseTimeISO
    const dstDose = '2026-11-01T07:30:00.000Z';
    const med = await reqJson(f.router, sOld, 'POST', '/api/events', {
      operationId: op('62'),
      event: { type: 'med', name: 'Probiotic', dose: '5', unit: 'drops', next: 24, time: dstDose },
    });
    const medId = String(med.body.id);
    await reqJson(f.router, sOld, 'PATCH', `/api/events/${encodeURIComponent(medId)}`, {
      operationId: op('63'),
      event: { type: 'med', name: 'Probiotic', dose: '5', unit: 'drops', time: dstDose, note: 'with milk' },
    });
    const meta = f.store.getEventMetadata('medication', medId.split(':')[1])?.metadata as Record<string, unknown>;
    assert.equal(meta.nextDoseHours, 24);
    assert.equal(meta.doseTimeISO, dstDose);

    // Clean shutdown awaits in-flight tick
    let tickDone = false;
    let releaseSlow!: () => void;
    const rem2 = await reqJson(f.router, sOld, 'POST', '/api/reminders', {
      operationId: op('64'), recipient: 'Sage', what: 'sleep', scheduledAt: new Date(f.now() - 1000).toISOString(), enabled: true,
    });
    assert.equal(rem2.body.status, 'saved');
    const slowStarted = new Promise<void>(resolve => {
      f.setPushResponder(async () => {
        resolve();
        await new Promise<void>(r => { releaseSlow = r; });
        tickDone = true;
        return new Response('', { status: 201 });
      });
    });
    const t = f.alerts.tick();
    await slowStarted;
    const stopPromise = f.alerts.stop();
    releaseSlow();
    await stopPromise;
    await t;
    assert.equal(tickDone, true);
  } finally { f.store.close(); }
});

// Failure case (H1 + L6): restart, earlier-dose edit, late poll, or backdated create resurrects a cancelled medicine alert or cancels a newer dose; <0.1h accepted.
test('medicine latest-dose invariant holds across restart, edit, late poll, and backdated create, and enforces >= 0.1 h', async () => {
  const f = makeFixture({ nowMs: Date.parse('2026-11-23T18:00:00.000Z') }); // noon CST
  try {
    const s1 = await f.makeSession('Sage');
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-1', keys: phoneKeys() });

    // 0.05 hours must be rejected with 400 (matches "0.1 to 168 hours")
    await assert.rejects(
      () => reqJson(f.router, s1, 'POST', '/api/events', {
        operationId: op('70'),
        event: { type: 'med', name: 'Tylenol', dose: '2', unit: 'ml', next: 0.05, time: '2026-11-23T14:00:00.000Z' },
      }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );

    // 1. 8 AM dose (due at 2 PM)
    const d8 = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('71'),
      event: { type: 'med', name: 'Tylenol', dose: '2', unit: 'ml', next: 6, time: '2026-11-23T14:00:00.000Z' },
    });
    const id8 = String(d8.body.id);
    assert.ok(f.store.getAlertDue(id8));

    // 2. 1 PM early next dose (due at 7 PM) cancels 8 AM alert
    const d13 = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('72'),
      event: { type: 'med', name: 'Tylenol', dose: '2', unit: 'ml', next: 6, time: '2026-11-23T19:00:00.000Z' },
    });
    const id13 = String(d13.body.id);
    assert.equal(f.store.getAlertDue(id8), null);
    assert.ok(f.store.getAlertDue(id13));

    // 3. Gateway restart MUST NOT resurrect the 8 AM alert
    f.alerts.start();
    await f.alerts.stop();
    assert.equal(f.store.getAlertDue(id8), null, 'restart must not resurrect earlier cancelled medicine alert');
    assert.ok(f.store.getAlertDue(id13));

    // 4. Note-only edit on the 8 AM dose MUST NOT resurrect its alert
    await reqJson(f.router, s1, 'PATCH', `/api/events/${encodeURIComponent(id8)}`, {
      operationId: op('73'),
      event: { type: 'med', name: 'Tylenol', dose: '2', unit: 'ml', time: '2026-11-23T14:00:00.000Z', note: 'morning' },
    });
    assert.equal(f.store.getAlertDue(id8), null, 'editing earlier dose must not resurrect its alert');
    assert.ok(f.store.getAlertDue(id13));

    // 5. Late poll of the 8 AM create op MUST NOT cancel the 1 PM alert or resurrect 8 AM
    await reqJson(f.router, s1, 'GET', `/api/operations/${op('71')}`);
    assert.equal(f.store.getAlertDue(id8), null, 'late poll of 8 AM create must not resurrect 8 AM');
    assert.ok(f.store.getAlertDue(id13), 'late poll of 8 AM create must not cancel 1 PM');

    // 6. Backdated 6 AM dose logged later MUST NOT cancel the 1 PM alert or arm 6 AM
    const d6 = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('74'),
      event: { type: 'med', name: 'Tylenol', dose: '2', unit: 'ml', next: 6, time: '2026-11-23T12:00:00.000Z' },
    });
    assert.equal(f.store.getAlertDue(String(d6.body.id)), null, 'backdated dose must not arm alert');
    assert.ok(f.store.getAlertDue(id13), 'backdated dose must not cancel newer 1 PM alert');
  } finally { f.store.close(); }
});

// Failure case (M1): update/delete/split feed/sleep or takeOverStops miss forecast refresh, removed account gets alerts, or recovered medicine op misses alert.
test('resource classification covers update/delete/split/takeOverStops, recovered medicine op, and removed-account skip', async () => {
  const f = makeFixture({ nowMs: Date.parse('2026-11-23T16:00:00.000Z') });
  try {
    const s1 = await f.makeSession('Sage');
    const s2 = await f.makeSession('Rowan');
    await reqJson(f.router, s1, 'POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/sage-1', keys: phoneKeys() });
    await reqJson(f.router, s1, 'PATCH', '/api/preferences', {
      operationId: op('80'), lang: 'en', units: 'metric', palette: 'Sorbet', night: false,
      alerts: { reminder: 'on', medicine: 'on', nap: 'on', feed: 'on' },
    });
    await f.alerts.flush();

    // Every feed/sleep update, delete, split, and timer resource triggers forecast Baby Buddy reads
    for (const [idx, resource] of ['update:feedings', 'delete:feedings', 'update:sleep', 'delete:sleep', 'split:sleep', 'timers'].entries()) {
      const id = op(String(81 + idx));
      f.store.beginOperation({ id, adult: 'Sage', resource, intent: { action: resource }, requestBody: {}, metadata: {} });
      f.store.finishOperation(id, 'saved', `${resource}:1`);
      f.bbRequests.length = 0;
      f.alerts.onWrite(s1, id);
      await f.alerts.flush();
      assert.ok(f.bbRequests.some(r => r.method === 'GET' && r.resource === 'timers'), `${resource} must trigger forecast refresh`);
    }

    // takeOverStops triggers onTakeOverSaved -> forecast refresh
    const timerStart = await reqJson(f.router, s1, 'POST', '/api/timers', { operationId: op('88'), kind: 'feed', side: 'L' });
    const tid = String(timerStart.body.timerId);
    f.setNow(f.now() + 60_000);
    const stopRes = await reqJson(f.router, s1, 'POST', `/api/timers/${tid}/stop`, { operationId: op('89') });
    assert.equal(stopRes.body.status, 'pending');
    // Advance past undo deadline (10s) + takeover delay (60s)
    f.setNow(f.now() + 90_000);
    f.bbRequests.length = 0;
    await f.timers.active(s2);
    await new Promise(r => setTimeout(r, 40));
    await f.alerts.flush();
    assert.ok(f.bbRequests.some(r => r.resource === 'feedings' && r.method === 'GET'), 'takeOverStops must trigger forecast refresh');

    // Recovered pending medicine via GET /api/operations/:id schedules alert (Baby Buddy saved before response dropped)
    let dropAfterSave = true;
    f.setBbInterceptor((_uid, req) => {
      if (dropAfterSave && req.resource === 'medication' && req.method === 'POST') {
        dropAfterSave = false;
        f.bb.medication.push({ ...(req.body as Record<string, unknown>), id: 777, user: 17 });
        throw new Error('response lost after save');
      }
      return undefined;
    });
    const pendingMed = await reqJson(f.router, s1, 'POST', '/api/events', {
      operationId: op('90'),
      event: { type: 'med', name: 'Amoxicillin', dose: '5', unit: 'ml', next: 8, time: new Date(f.now()).toISOString() },
    });
    assert.equal(pendingMed.body.status, 'pending');
    f.setBbInterceptor(null);
    const recovered = await reqJson(f.router, s1, 'GET', `/api/operations/${op('90')}`);
    assert.equal(recovered.body.status, 'saved');
    assert.ok(f.store.getAlertDue(String(recovered.body.id)), 'recovered pending medicine must schedule alert');

    // Removed household account receives 0 alerts even if its session row remains in SQLite
    const rem = await reqJson(f.router, s2, 'POST', '/api/reminders', {
      operationId: op('91'), recipient: 'Rowan', what: 'feed', scheduledAt: new Date(f.now() - 1000).toISOString(), enabled: true,
    });
    assert.equal(rem.body.status, 'saved');
    f.store.upsertPushSubscription({
      endpoint: 'https://web.push.apple.com/rowan-removed',
      ...phoneKeys(),
      sessionIdHash: hashSecret(s2.sessionId),
      nowMs: f.now(),
    });
    // Create a second alerts instance where Rowan is no longer in configured accounts
    const onlySageSessions = createSessionService({
      store: f.store,
      babyBuddy: {
        async login() { throw new Error('unused'); },
        async identity() { throw new Error('unused'); },
        async logout() {},
        async request() { return []; },
      },
      accounts: [{ username: 'Sage', password: 'pw1' }],
      now: f.now,
    });
    const sentRemoved: string[] = [];
    const alertsNoRowan = createAlerts({
      store: f.store,
      sessions: onlySageSessions,
      pushContact: 'https://github.com/jnkliberty/little-days',
      passcodeOff: true,
      now: f.now,
      fetchImpl: async url => { sentRemoved.push(String(url)); return new Response('', { status: 201 }); },
    });
    await alertsNoRowan.tick();
    assert.equal(sentRemoved.length, 0, 'removed household account must receive 0 alerts');
    // Control check: the exact same reminder DOES send when Rowan is still a configured account
    f.sentPushes.length = 0;
    await f.alerts.tick();
    assert.equal(f.sentPushes.filter(p => p.url === 'https://web.push.apple.com/rowan-removed').length, 1, 'configured account receives the same reminder');
  } finally { f.store.close(); }
});


