import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.ts';
import { createAI } from '../server/ai.ts';
import { createCries, wavInfo } from '../server/cries.ts';
import { createHousehold } from '../server/household.ts';
import { createRecords } from '../server/records.ts';
import { createRouter } from '../server/router.ts';
import { openStore } from '../server/store.ts';
import { setZone } from '../server/zone.ts';

setZone('America/Chicago');
const ORIGIN = 'https://little-days.test';
const START = Date.parse('2026-11-20T15:00:00Z');
const MIN = 60_000;
const MODELS = ['child', 'feeding', 'pumping', 'diaperchange', 'sleep', 'medication', 'note', 'temperature', 'weight', 'height', 'headcircumference', 'tummytime', 'timer'];
const ALL = MODELS.flatMap(model => ['view', 'add', 'change', 'delete'].map(action => `core.${action}_${model}`));
// Invented adults. Ash has no right on notes, Vi can only view them and Ad can view and add but not change.
const ADULTS: Record<string, { sessionId: string; adult: string; user: number; permissions: string[] }> = {
  rowan: { sessionId: 'R'.repeat(43), adult: 'Rowan', user: 17, permissions: ALL },
  wren: { sessionId: 'W'.repeat(43), adult: 'Wren', user: 18, permissions: ALL },
  ash: { sessionId: 'A'.repeat(43), adult: 'Ash', user: 19, permissions: [] },
  vi: { sessionId: 'V'.repeat(43), adult: 'Vi', user: 20, permissions: ['core.view_note'] },
  ad: { sessionId: 'D'.repeat(43), adult: 'Ad', user: 21, permissions: ['core.view_note', 'core.add_note'] },
};
const MARK = 'zzcrymark';
const FAKE_PROVIDER_KEY = ['synthetic', 'provider', 'key'].join('-');

const part = (extra: object) => ({ sinceMin: 95, usualMin: 120, gaps: 7, running: false, ...extra });
function snapshot(over: object = {}) {
  return { ageDays: 63, dayPart: 'day', complete: true, rank: ['diaper', 'feed', 'sleep'], log: { feed: part({ lastKind: MARK, lastAmountMl: 90 }), sleep: { awakeMin: 100, usualMin: 74, gaps: 6, running: false }, diaper: { sinceMin: 200, usualMin: 140, gaps: 9, lastKind: 'wet' } }, ...over };
}

// A synthetic sound: a quiet sine wave in the one WAV form the app's own writer makes.
function wav({ seconds = 4, rate = 8000, channels = 1, bits = 16 }: { seconds?: number; rate?: number; channels?: number; bits?: number } = {}): Buffer {
  const width = bits / 8, length = Math.round(seconds * rate) * channels * width;
  const out = Buffer.alloc(44 + length);
  out.write('RIFF', 0, 'latin1'); out.writeUInt32LE(36 + length, 4); out.write('WAVEfmt ', 8, 'latin1');
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(channels, 22); out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * channels * width, 28); out.writeUInt16LE(channels * width, 32); out.writeUInt16LE(bits, 34);
  out.write('data', 36, 'latin1'); out.writeUInt32LE(length, 40);
  if (bits === 16) for (let i = 0; i < length / 2; i++) out.writeInt16LE(Math.round(Math.sin(i / 20) * 6000), 44 + i * 2);
  return out;
}
// A synthetic sound with chosen 16-bit samples, for the two quality numbers.
function wavOf(sample: (i: number) => number, seconds = 4, rate = 8000): Buffer {
  const out = wav({ seconds, rate });
  for (let i = 0; i < seconds * rate; i++) out.writeInt16LE(sample(i), 44 + i * 2);
  return out;
}
const CAPTURE = { startMs: 420, mode: 'homescreen', ua: 'Synthetic iPhone browser', contextRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 48000, supported: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: true, sampleRate: true } };

type Call = { adult?: string; json?: unknown; raw?: Buffer; headers?: Record<string, string>; csrf?: string };
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-cries-'));
  const path = join(dir, 'cries.sqlite');
  const store = openStore(path);
  const raw = new DatabaseSync(path);
  const clock = { t: START };
  for (const person of Object.values(ADULTS)) {
    store.createSession({ sessionId: person.sessionId, csrfToken: 'csrf', adult: person.adult, babyBuddyUserId: person.user, expiresAt: Date.now() + 3_600_000 });
    store.putSetting(`user:${person.user}`, 'permissions', person.permissions);
  }
  store.putSetting('app', 'child', { id: 7, slug: 'test-child', dueDate: null });
  const records = createRecords({ store, now: () => new Date(clock.t), sessions: { request: async (_id: string, input: { resource: string }) => input.resource === 'children' ? { id: 7, first_name: 'Pip', last_name: '', birth_date: '2026-09-10', slug: 'test-child' } : [] } as any });
  const live = (id: string) => Object.values(ADULTS).find(person => person.sessionId === id);
  const sessions = { passcodeSet: () => true, get: (id: string) => { const p = live(id); return p ? { sessionId: p.sessionId, csrfToken: 'csrf', adult: p.adult } : null; }, renew: () => {}, requireCsrf: (_id: string, token: string) => { if (token !== 'csrf') throw new Error('csrf'); } } as any;
  const household = createHousehold({ store, sessions, records });
  const cries = createCries({ store, now: () => clock.t });
  const router = createRouter({ store, records, household, cries, timers: { active: async () => ({}) } } as any);
  const server = createApp({ sessions, origin: ORIGIN, webDir: '.', domain: router.handle, integration: async () => {} });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  async function call(method: string, path: string, options: Call = {}) {
    const person = options.adult === undefined ? ADULTS.rowan : options.adult ? ADULTS[options.adult] : null;
    const headers: Record<string, string> = { origin: ORIGIN, 'x-csrf-token': options.csrf ?? 'csrf', ...options.headers };
    if (person) headers.cookie = `__Host-little-days=${person.sessionId}`;
    let body: Buffer | string | undefined = options.raw?.length ? options.raw : undefined;
    if (options.json !== undefined) { body = JSON.stringify(options.json); headers['content-type'] = 'application/json'; }
    const response = await fetch(base + path, { method, headers, body });
    const buffer = Buffer.from(await response.arrayBuffer());
    let json: any = null;
    try { json = JSON.parse(buffer.toString('utf8')); } catch { /* a clip or an empty body */ }
    return { status: response.status, json, buffer, headers: response.headers };
  }
  const sound = (adult: string, value: 'on' | 'off') => call('PUT', '/api/cries/sound', { adult, json: { sound: value } });
  // Make one cry for an adult. Returns its id and the reply.
  async function cry(adult = 'rowan', over: { id?: string; sound?: boolean; at?: number; snapshot?: object } = {}) {
    const id = over.id ?? randomUUID();
    const reply = await call('POST', '/api/cries', { adult, json: { id, occurredAt: new Date(over.at ?? clock.t).toISOString(), snapshot: over.snapshot ?? snapshot(), sound: over.sound ?? true } });
    return { id, reply };
  }
  const upload = (id: string, adult = 'rowan', data = wav()) => call('PUT', `/api/cries/${id}/clip`, { adult, raw: data, headers: { 'x-cry-capture': JSON.stringify(CAPTURE), 'content-type': 'audio/wav' } });
  const row = (id: string) => raw.prepare('SELECT * FROM cries WHERE id = ?').get(id) as Record<string, any> | undefined;
  async function close() {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    raw.close(); store.close(); rmSync(dir, { recursive: true, force: true });
  }
  return { store, raw, clock, call, sound, cry, upload, row, records, household, close };
}
const age = (minutes: number) => minutes * MIN;

test('Sign-in and rights: each route needs a session, and the nine cry routes need the right on notes', async () => {
  // Failure case: a clip plays, or a cry changes, for a device that is not signed in or an adult with no right on notes.
  // Gap: no present test knows these routes.
  const f = await fixture();
  try {
    const id = randomUUID();
    const nine: [string, string, string, unknown?][] = [
      ['POST', '/api/cries', 'add', { id, occurredAt: new Date(START).toISOString(), snapshot: snapshot() }], ['PUT', `/api/cries/${id}/clip`, 'add'],
      ['PATCH', `/api/cries/${id}`, 'change', { skipped: true }], ['GET', '/api/cries', 'view'], ['GET', `/api/cries/${id}/clip`, 'view'],
      ['DELETE', `/api/cries/${id}/clip`, 'change'], ['DELETE', `/api/cries/${id}`, 'change'], ['DELETE', '/api/cries/clips', 'change'], ['PUT', '/api/cries/sound', 'add', { sound: 'on' }],
    ];
    for (const [method, path, needs, json] of nine) {
      const opts = (adult: string): Call => ({ adult, ...(json !== undefined ? { json } : {}) });
      assert.equal((await f.call(method, path, opts(''))).status, 401, `${method} ${path} with no session`);
      assert.equal((await f.call(method, path, opts('ash'))).status, 403, `${method} ${path} with no right on notes`);
      const viewer = (await f.call(method, path, opts('vi'))).status, adder = (await f.call(method, path, opts('ad'))).status;
      assert.equal(viewer === 403, needs !== 'view', `${method} ${path} for a viewer`);
      assert.equal(adder === 403, needs === 'change', `${method} ${path} for an adult who can add but not change`);
    }
    assert.equal((await f.call('GET', '/api/care-passages', { adult: '' })).status, 401);
    for (const adult of ['rowan', 'ash', 'vi']) assert.equal((await f.call('GET', '/api/care-passages', { adult })).status, 200, adult);
    assert.equal((await f.call('PUT', '/api/cries/sound', { json: { sound: 'on' }, csrf: 'wrong' })).status, 403, 'a write needs the CSRF header');
  } finally { await f.close(); }
});

test('The care passages route sends the comfort and urgent passages in both languages', async () => {
  // Failure case: the Crying screen has no safety passage when the Past cries request fails.
  const f = await fixture();
  try {
    const { status, json } = await f.call('GET', '/api/care-passages', { adult: 'vi' });
    assert.equal(status, 200);
    for (const lang of ['en', 'es']) assert.deepEqual(json[lang].map((item: any) => item.id), ['care-comfort', 'care-urgent']);
    assert.match(json.en[1].body, /Seek immediate medical help/);
    assert.match(json.es[0].body, /Nunca sacuda/);
  } finally { await f.close(); }
});

test('Upload: only the app WAV form is saved, in the row of its cry', async () => {
  // Failure case: a file of any kind lands on the family computer.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const bytes = wav();
    for (const [label, file, status] of [
      ['not WAV', Buffer.from('this is not a sound file '.repeat(10)), 400], ['2 channels', wav({ channels: 2 }), 400], ['24 bit', wav({ bits: 24 }), 400],
      ['under 3 s', wav({ seconds: 2.9 }), 400], ['over 12 s', wav({ seconds: 12.1 }), 400], ['rate under 8 kHz', wav({ rate: 7999 }), 400],
      ['over 2 MB', Buffer.alloc(2 * 1024 * 1024 + 1), 413],
      ['header names more bytes than the body holds', (() => { const b = Buffer.from(bytes); b.writeUInt32LE(b.length - 44 + 2, 40); return b; })(), 400],
      ['body holds more bytes than the header names', Buffer.concat([bytes, Buffer.alloc(2)]), 400],
      ['half a sample', Buffer.concat([bytes, Buffer.alloc(1)]), 400],
    ] as [string, Buffer, number][]) {
      const { id } = await f.cry();
      assert.equal((await f.upload(id, 'rowan', file)).status, status, label);
      assert.equal(f.row(id)!.clip_state, 'none', label);
      assert.equal(f.row(id)!.clip, null, label);
    }
    const { id } = await f.cry();
    const put = (headers: Record<string, string>) => f.call('PUT', `/api/cries/${id}/clip`, { raw: bytes, headers });
    assert.equal((await put({})).status, 400, 'a clip with no capture header');
    assert.equal((await put({ 'x-cry-capture': JSON.stringify({ ...CAPTURE, extra: 1 }) })).status, 400, 'an unknown capture key');
    assert.equal((await put({ 'x-cry-capture': JSON.stringify({ ...CAPTURE, startMs: 15_001 }) })).status, 400, 'a first sample after 15 s');
    assert.equal((await put({ 'x-cry-capture': JSON.stringify({ ...CAPTURE, mode: 'tab' }) })).status, 400, 'a mode that is not known');
    assert.equal((await put({ 'x-cry-capture': JSON.stringify({ ...CAPTURE, ua: 'u'.repeat(161) }) })).status, 400, 'a user agent over 160 characters');
    assert.equal((await put({ 'x-cry-capture': JSON.stringify({ ...CAPTURE, supported: { ...CAPTURE.supported, extra: true } }) })).status, 400, 'a sixth supported key');
    assert.equal((await put({ 'x-cry-capture': JSON.stringify({ ...CAPTURE, supported: { echoCancellation: true } }) })).status, 400, 'fewer than five supported keys');
    assert.equal((await put({ 'x-cry-capture': JSON.stringify({ ...CAPTURE, echoCancellation: 'no' }) })).status, 400, 'a flag that is not a boolean');
    assert.equal((await put({ 'x-cry-capture': 'x'.repeat(1025) })).status, 400, 'a capture header over 1 KB');
    const saved = await f.upload(id, 'rowan', bytes);
    assert.deepEqual(saved.json, { id, clipState: 'kept' });
    const stored = f.row(id)!;
    assert.equal(stored.clip_state, 'kept');
    assert.ok(Buffer.from(stored.clip).equals(bytes));
    const meta = JSON.parse(stored.clip_json);
    assert.deepEqual([meta.bytes, meta.durationMs, meta.startMs, meta.sampleRate], [bytes.length, 4000, 420, 8000]);
    assert.equal(meta.capture.echoCancellation, false);
    assert.equal(meta.capture.mode, 'homescreen');
    assert.equal(meta.capture.supported.sampleRate, true);
    // A value the phone does not report is null.
    const quiet = await f.cry();
    const nulls = { startMs: 0, mode: 'browser', ua: '', contextRate: null, echoCancellation: null, noiseSuppression: null, autoGainControl: null, channelCount: null, sampleRate: null, supported: CAPTURE.supported };
    assert.equal((await f.call('PUT', `/api/cries/${quiet.id}/clip`, { raw: bytes, headers: { 'x-cry-capture': JSON.stringify(nulls) } })).status, 200, 'null values');
    for (const edge of [wav({ seconds: 3 }), wav({ seconds: 12 }), wav({ seconds: 3, rate: 48000 })]) assert.ok(wavInfo(edge).durationMs >= 3000);
  } finally { await f.close(); }
});

test('Clip conditions: sound is saved only when every condition holds', async () => {
  // Failure case: sound is saved after a parent said no.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const own = await f.cry();
    assert.equal(own.reply.json.sound, true);
    await f.sound('wren', 'on');
    assert.equal((await f.upload(own.id, 'wren')).status, 403, 'another adult');
    assert.equal((await f.upload(own.id)).status, 200, 'the adult of the cry');
    const quiet = await f.cry('rowan', { sound: false });
    assert.equal(quiet.reply.json.sound, false);
    assert.equal(f.row(quiet.id)!.sound_on, 0);
    assert.equal((await f.upload(quiet.id)).status, 403, 'a cry with sound_on 0');
    // A create from an adult whose choice is off, or not set, gets sound off and saves sound_on 0.
    const unset = await f.cry('ad');
    await f.sound('ad', 'off');
    const off = await f.cry('ad');
    for (const made of [unset, off]) { assert.equal(made.reply.json.sound, false); assert.equal(f.row(made.id)!.sound_on, 0); }
    // The adult switches the sound off after the create, then the same create is sent again.
    const late = await f.cry('rowan');
    await f.sound('rowan', 'off');
    assert.equal((await f.cry('rowan', { id: late.id })).reply.json.sound, false, 'a repeated create after the switch');
    assert.equal((await f.upload(late.id)).status, 403, 'a clip after the switch');
    assert.equal(f.row(late.id)!.clip_state, 'none');
    // A cry over 15 minutes old, and one that is exactly 15 minutes old.
    await f.sound('rowan', 'on');
    const old = await f.cry('rowan');
    f.clock.t += age(15) + 1;
    assert.equal((await f.upload(old.id)).status, 403, 'a cry over 15 minutes old');
    const edge = await f.cry('rowan');
    f.clock.t += age(15);
    assert.equal((await f.upload(edge.id)).status, 200, 'a cry that is exactly 15 minutes old');
  } finally { await f.close(); }
});

test('Clip state: a deleted clip never comes back, and the delete of all clips closes each cry', async () => {
  // Failure case: a deleted clip comes back.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const kept = await f.cry(); await f.upload(kept.id);
    const again = await f.upload(kept.id, 'rowan', wav({ seconds: 5 }));
    assert.equal(again.status, 409); assert.match(again.json.error, /has a clip/);
    assert.ok(Buffer.from(f.row(kept.id)!.clip).equals(wav()), 'the second upload changed nothing');
    // A clip that is deleted takes no new clip. A cry with no clip yet takes none after its delete either.
    assert.equal((await f.call('DELETE', `/api/cries/${kept.id}/clip`)).json.clipState, 'deleted');
    assert.equal((await f.upload(kept.id)).status, 403);
    const racing = await f.cry();
    assert.equal((await f.call('DELETE', `/api/cries/${racing.id}/clip`)).json.clipState, 'deleted');
    assert.equal((await f.upload(racing.id)).status, 403, 'an upload that was on its way when the clip was deleted');
    // Delete all sound clips: a recording that was in progress belongs to a cry that the delete closed.
    const withClip = await f.cry(); await f.upload(withClip.id);
    const answered = await f.call('PATCH', `/api/cries/${withClip.id}`, { json: { stoppedBy: 'feed' } });
    assert.equal(answered.status, 200);
    assert.equal(answered.json.clipState, 'kept');
    assert.ok(!('clipMs' in answered.json), 'the PATCH reply does not claim clipMs null for a cry that has a clip');
    const inProgress = await f.cry();
    assert.equal((await f.call('DELETE', '/api/cries/clips')).status, 200);
    assert.equal(f.row(withClip.id)!.clip_state, 'deleted');
    assert.equal(f.row(inProgress.id)!.clip_state, 'closed');
    for (const id of [withClip.id, inProgress.id]) { assert.equal(f.row(id)!.clip, null); assert.equal(f.row(id)!.clip_json, null); }
    assert.equal((await f.upload(inProgress.id)).status, 403, 'an upload from a recording that was in progress');
    assert.equal(f.row(withClip.id)!.stopped_by, 'feed', 'the answer stays');
    assert.equal((await f.call('DELETE', '/api/cries/clips')).status, 200, 'a second delete of all clips is harmless');
    assert.equal(f.row(inProgress.id)!.clip_state, 'closed');
    // A cry saved after the delete takes its clip.
    const after = await f.cry();
    assert.equal((await f.upload(after.id)).status, 200);
    assert.equal(f.row(after.id)!.clip_state, 'kept');
  } finally { await f.close(); }
});

test('Clip store: the table takes 400 clips, then refuses with a message that names Settings', async () => {
  // Failure case: the database grows with no limit.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const insert = f.raw.prepare("INSERT INTO cries (id, adult, occurred_at, clip_state, clip) VALUES (?, 'Wren', '2026-11-01T00:00:00.000Z', 'kept', x'00')");
    for (let i = 0; i < 399; i++) insert.run(randomUUID());
    const last = await f.cry();
    assert.equal((await f.upload(last.id)).status, 200, 'the 400th clip');
    const over = await f.cry();
    const refused = await f.upload(over.id);
    assert.equal(refused.status, 403);
    assert.match(refused.json.error, /Settings/);
  } finally { await f.close(); }
});

test('Create: one id is one cry, and a deleted cry cannot come back', async () => {
  // Failure case: a deleted cry comes back, or a cry lands on a wrong day.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const { id, reply } = await f.cry();
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.json, { id, clipState: 'none', sound: true });
    const stored = f.row(id)!;
    assert.deepEqual(JSON.parse(stored.snapshot_json), { ageDays: 63, childId: 7, complete: true, dayPart: 'day', log: snapshot().log, rank: ['diaper', 'feed', 'sleep'] }, 'the server sets the child');
    assert.equal(stored.occurred_at, new Date(START).toISOString());
    assert.equal(stored.adult, 'Rowan');
    const second = await f.cry('rowan', { id, snapshot: snapshot({ ageDays: 1, complete: false, rank: [] }) });
    assert.deepEqual(second.reply.json, { id, clipState: 'none', sound: true }, 'the reply holds no snapshot');
    assert.equal((f.raw.prepare('SELECT COUNT(*) AS n FROM cries').get() as any).n, 1);
    assert.equal(f.row(id)!.snapshot_json, stored.snapshot_json, 'the repeated create changed nothing');
    f.clock.t += age(40);
    assert.equal((await f.cry('rowan', { id, at: START })).reply.status, 200, 'a repeat of a saved create is not refused for its old tap time');
    assert.equal((await f.cry('wren', { id, at: START })).reply.json.sound, false, 'another adult gets no sound for this cry');
    assert.equal((await f.call('DELETE', `/api/cries/${id}`)).status, 200);
    assert.equal((await f.cry('rowan', { id, at: f.clock.t })).reply.status, 410);
    assert.equal((f.raw.prepare('SELECT COUNT(*) AS n FROM cries WHERE deleted_at IS NULL').get() as any).n, 0);
    // The time window of the tap: 15 minutes before the server time, 2 minutes after it.
    assert.equal((await f.cry('rowan', { at: f.clock.t - age(15) })).reply.status, 200);
    assert.equal((await f.cry('rowan', { at: f.clock.t - age(15) - 1 })).reply.status, 400);
    assert.equal((await f.cry('rowan', { at: f.clock.t + age(2) })).reply.status, 200);
    assert.equal((await f.cry('rowan', { at: f.clock.t + age(2) + 1 })).reply.status, 400);
    // Bad bodies.
    const post = (json: any) => f.call('POST', '/api/cries', { json });
    const good = { id: randomUUID(), occurredAt: new Date(f.clock.t).toISOString(), snapshot: snapshot() };
    for (const [label, json] of [
      ['an id that is not a UUID', { ...good, id: 'abc' }], ['a child id from the phone', { ...good, childId: 9 }], ['no snapshot', { ...good, snapshot: undefined }],
      ['a part of the day that is not known', { ...good, snapshot: snapshot({ dayPart: 'dusk' }) }], ['a row order with days missing', { ...good, snapshot: snapshot({ complete: false }) }],
      ['a row order that repeats a row', { ...good, snapshot: snapshot({ rank: ['feed', 'feed', 'sleep'] }) }],
      ['a row order with names that every object inherits', { ...good, snapshot: snapshot({ rank: ['constructor', 'toString', 'valueOf'] }) }], ['a field that is not known', { ...good, snapshot: snapshot({ extra: 1 }) }],
      ['a minute count out of range', { ...good, snapshot: snapshot({ log: { ...snapshot().log, feed: part({ sinceMin: -1 }) } }) }], ['a time with no zone', { ...good, occurredAt: '2026-11-20T15:00:00' }],
    ] as [string, any][]) assert.equal((await post(json)).status, 400, label);
    assert.equal((await post({ ...good, snapshot: snapshot({ complete: false, rank: [], ageDays: null, log: { feed: {}, sleep: {}, diaper: {} } }) })).status, 200, 'days missing, no age and no last events');
    assert.equal((await f.call('POST', '/api/cries', { raw: Buffer.alloc(70_000), headers: { 'content-type': 'application/json' } })).status, 413, 'body size');
    f.store.putSetting('app', 'child', null);
    assert.equal((await post({ ...good, id: randomUUID() })).status, 409, 'no child set up');
  } finally { await f.close(); }
});

test('Sound choice: its own setting, which an old page cannot undo', async () => {
  // Failure case: the recording switches back on.
  const f = await fixture();
  try {
    assert.deepEqual((await f.call('GET', '/api/cries?home=1')).json, { ask: null, sound: null }, 'not set');
    assert.deepEqual((await f.sound('rowan', 'on')).json, { sound: 'on' });
    assert.equal((await f.call('GET', '/api/cries?home=1')).json.sound, 'on');
    await f.sound('rowan', 'off');
    // The old page saves its whole preference object. The sound choice is not in it.
    const saved = await f.call('PATCH', '/api/preferences', { json: { operationId: randomUUID(), lang: 'en', units: 'metric', palette: 'Sorbet', night: false, sound: 'on' } });
    assert.equal(saved.status, 200);
    const again = await f.call('PATCH', '/api/preferences', { json: { operationId: randomUUID(), lang: 'es', units: 'us', palette: 'Sorbet', night: true } });
    assert.equal(again.status, 200);
    assert.equal((await f.call('GET', '/api/cries?home=1')).json.sound, 'off');
    assert.equal((await f.cry()).reply.json.sound, false);
    assert.equal(JSON.stringify(f.store.getSetting('user:17', 'preferences')).includes('sound'), false);
    assert.equal(f.store.getSetting('user:17', 'crySound'), 'off');
    assert.equal(f.store.getSetting('user:18', 'crySound'), null, 'the choice of one adult is not the choice of another');
    for (const json of [{ sound: 'maybe' }, { sound: 'on', extra: 1 }, {}, { sound: true }]) assert.equal((await f.call('PUT', '/api/cries/sound', { json })).status, 400, JSON.stringify(json));
  } finally { await f.close(); }
});

test('Leaks: a saved cry is in no state reply, no export and no Ask AI context, and no list or create reply holds a snapshot', async () => {
  // Failure case: cry data leaves in an export or goes to the AI provider.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const { id, reply } = await f.cry(); await f.upload(id);
    await f.call('PATCH', `/api/cries/${id}`, { json: { stoppedBy: 'burp' } });
    const leaks = (text: string, label: string) => { for (const needle of [id, MARK, 'cries', 'snapshot']) assert.ok(!text.includes(needle), `${label} holds ${needle}`); };
    const state = await f.call('GET', '/api/state');
    assert.equal(state.status, 200);
    leaks(JSON.stringify(state.json), '/api/state');
    const exported = await f.call('GET', '/api/export?from=2026-11-01&to=2026-12-01');
    assert.equal(exported.status, 200);
    leaks(exported.buffer.toString('utf8'), 'the CSV export');
    const sent: string[] = [];
    const fetchSpy = async (_url: string, init: { body: string }) => { sent.push(init.body); return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answer: 'ok', record_ids: [], source_ids: [] }) }] })); };
    const ai = createAI({ store: f.store, records: f.records, now: () => new Date(f.clock.t), env: { LITTLE_DAYS_AI_ENABLED: 'true', LITTLE_DAYS_AI_MODEL: 'synthetic-model', LITTLE_DAYS_ANTHROPIC_API_KEY: FAKE_PROVIDER_KEY }, fetch: fetchSpy } as any);
    await ai.chat({ sessionId: ADULTS.rowan.sessionId, csrfToken: 'csrf', adult: 'Rowan' } as any, { question: 'How did the last cry end?', lang: 'en' });
    assert.equal(sent.length, 1, 'the provider was asked once');
    leaks(sent[0], 'the Ask AI request');
    assert.deepEqual(Object.keys(reply.json).sort(), ['clipState', 'id', 'sound'], 'the create reply holds no snapshot');
    const list = await f.call('GET', '/api/cries');
    assert.equal(list.status, 200);
    assert.throws(() => leaks(JSON.stringify(list.json), 'control'), /holds/, 'control: the check finds the id where it belongs');
    for (const needle of [MARK, 'snapshot', 'log']) assert.ok(!JSON.stringify(list.json).includes(needle), `the list holds ${needle}`);
    assert.deepEqual(Object.keys(list.json.cries[0]).sort(), ['adult', 'clipMs', 'clipState', 'id', 'noisy', 'occurredAt', 'stoppedBy']);
    assert.equal(list.json.cries[0].clipMs, 4000);
  } finally { await f.close(); }
});

test('Local event routes: the id of a cry finds no local event', async () => {
  // Failure case: a cry is changed into a bath record.
  const f = await fixture();
  try {
    const { id } = await f.cry();
    const before = JSON.stringify(f.row(id));
    const change = await f.call('PATCH', `/api/events/app:${id}`, { json: { operationId: randomUUID(), event: { type: 'other', what: 'bath', t: 10 } } });
    assert.equal(change.status, 404, JSON.stringify(change.json));
    const removal = await f.call('DELETE', `/api/events/app:${id}`, { json: { operationId: randomUUID() } });
    assert.equal(removal.status, 404, JSON.stringify(removal.json));
    assert.equal((await f.call('DELETE', `/api/events/${id}`, { json: { operationId: randomUUID() } })).status, 400, 'the bare id is not an event id');
    assert.equal(JSON.stringify(f.row(id)), before, 'the cry did not change');
    assert.equal((f.raw.prepare('SELECT COUNT(*) AS n FROM app_events').get() as any).n, 0);
  } finally { await f.close(); }
});

test('Answers: seven known answers (including gas), an Undo that names the answer it removes, and clips that go while answers stay', async () => {
  // Failure case: one Undo removes the answer that the other parent saved after it, or gas is refused or uncounted.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const { id } = await f.cry();
    const patch = (adult: string, json: unknown) => f.call('PATCH', `/api/cries/${id}`, { adult, json });
    for (const answer of ['feed', 'diaper', 'sleep', 'burp', 'gas', 'held', 'nothing']) assert.equal((await patch('rowan', { stoppedBy: answer })).status, 200, answer);
    for (const json of [{ stoppedBy: 'teething' }, { stoppedBy: 7 }, { stoppedBy: '' }, { stoppedBy: '', was: 'teething' }, { stoppedBy: 'feed', was: 'feed' }, { was: 'feed' }, {}, { noisy: 'yes' }, { other: 1 }])
      assert.equal((await patch('rowan', json)).status, 400, JSON.stringify(json));
    f.clock.t += 5000;
    await patch('rowan', { stoppedBy: 'feed' });
    assert.equal(f.row(id)!.labeled_by, 'Rowan');
    assert.equal(f.row(id)!.labeled_at, new Date(f.clock.t).toISOString());
    // The other adult answers after Rowan. Rowan's Undo names "feed" and changes nothing.
    await patch('wren', { stoppedBy: 'held' });
    const stale = await patch('rowan', { stoppedBy: '', was: 'feed' });
    assert.equal(stale.status, 200); assert.equal(stale.json.changed, false); assert.equal(stale.json.stoppedBy, 'held');
    assert.equal(f.row(id)!.stopped_by, 'held');
    const undone = await patch('wren', { stoppedBy: '', was: 'held' });
    assert.equal(undone.json.changed, true); assert.equal(undone.json.stoppedBy, null);
    assert.deepEqual([f.row(id)!.stopped_by, f.row(id)!.labeled_at, f.row(id)!.labeled_by], [null, null, null]);
    assert.equal((await patch('rowan', { noisy: true, skipped: true })).json.noisy, true);
    assert.deepEqual([f.row(id)!.noisy, f.row(id)!.skipped], [1, 1]);
    assert.equal((await f.call('PATCH', `/api/cries/${randomUUID()}`, { json: { skipped: true } })).status, 404);
    // Delete all sound clips empties each clip and keeps each answer. Gas counts toward the goal while its clip is kept and clean.
    await f.upload(id); await patch('rowan', { stoppedBy: 'gas', noisy: false });
    assert.equal((await f.call('GET', '/api/cries')).json.count, 1);
    await patch('rowan', { stoppedBy: 'sleep' });
    await f.call('DELETE', '/api/cries/clips');
    assert.deepEqual([f.row(id)!.clip, f.row(id)!.stopped_by], [null, 'sleep']);
  } finally { await f.close(); }
});

test('Home question: the newest open cry from 10 minutes to 12 hours old, for both adults', async () => {
  // Failure case: the card asks about a cry that was answered or skipped, or asks again on the other phone.
  const f = await fixture();
  try {
    const home = async (adult = 'rowan') => (await f.call('GET', '/api/cries?home=1', { adult })).json;
    const older = await f.cry();
    f.clock.t += age(5);
    const newer = await f.cry();
    assert.deepEqual(Object.keys(await home()).sort(), ['ask', 'sound'], 'no list');
    f.clock.t += age(4);
    assert.equal((await home()).ask, null, 'the older cry is 9 minutes old and the newer one is 4');
    f.clock.t += age(1);
    assert.equal((await home()).ask.id, older.id, 'the older cry is 10 minutes old');
    f.clock.t += age(5);
    assert.equal((await home()).ask.id, newer.id, 'both are old enough, and the newer one is asked');
    assert.equal((await home()).ask.occurredAt, new Date(START + age(5)).toISOString());
    await f.call('PATCH', `/api/cries/${newer.id}`, { json: { stoppedBy: 'feed' } });
    assert.equal((await home()).ask.id, older.id, 'an answer still allows the older open question');
    await f.call('PATCH', `/api/cries/${newer.id}`, { json: { stoppedBy: '', was: 'feed' } });
    // Rowan skips the card. The other adult does not see it either, and the cry stays in the list.
    await f.call('PATCH', `/api/cries/${newer.id}`, { json: { skipped: true } });
    assert.equal((await home('wren')).ask, null, 'Skip also stops older questions from returning on the next poll');
    assert.equal(f.row(older.id)!.skipped, 0, 'the older cry stays unanswered in Past cries');
    await f.call('PATCH', `/api/cries/${older.id}`, { json: { stoppedBy: 'held' } });
    assert.equal((await home('wren')).ask, null);
    assert.equal((await f.call('GET', '/api/cries')).json.cries.length, 2);
    // The window ends at 12 hours.
    const third = await f.cry('rowan');
    f.clock.t += age(10);
    assert.equal((await home()).ask.id, third.id, 'a later cry still asks once it is 10 minutes old');
    f.clock.t += age(12 * 60 - 10);
    assert.equal((await home()).ask.id, third.id, 'exactly 12 hours old');
    f.clock.t += 1;
    assert.equal((await home()).ask, null, 'over 12 hours old');
  } finally { await f.close(); }
});

test('Count: a noisy clip, "Nothing worked" and a cry with no clip do not count', async () => {
  // Failure case: the card says "42 of 100" and the sound test has fewer cries than that.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const make = async (withClip: boolean, answer: string | null, noisy = false) => {
      const { id } = await f.cry();
      if (withClip) await f.upload(id);
      if (answer) await f.call('PATCH', `/api/cries/${id}`, { json: { stoppedBy: answer } });
      if (noisy) await f.call('PATCH', `/api/cries/${id}`, { json: { noisy: true } });
      return id;
    };
    const counted = async () => (await f.call('GET', '/api/cries')).json;
    const ok = await make(true, 'feed');
    await make(true, 'nothing'); await make(true, 'diaper', true); await make(false, 'feed'); const open = await make(true, null);
    assert.deepEqual([(await counted()).count, (await counted()).goal], [1, 100]);
    await f.call('PATCH', `/api/cries/${open}`, { json: { stoppedBy: 'held' } });
    assert.equal((await counted()).count, 2);
    await f.call('DELETE', `/api/cries/${ok}/clip`);
    assert.equal((await counted()).count, 1, 'a deleted clip does not count');
    await f.call('DELETE', `/api/cries/${open}`);
    assert.equal((await counted()).count, 0, 'a deleted cry does not count');
  } finally { await f.close(); }
});

test('Delete: a deleted cry keeps only its id, its time and the delete time, and every route says 410', async () => {
  // Failure case: the sound or the answers of a deleted cry stay in the database.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const { id } = await f.cry(); await f.upload(id);
    await f.call('PATCH', `/api/cries/${id}`, { json: { stoppedBy: 'feed', noisy: true, skipped: true, distress: 2, rowTap: { type: 'sleep', ms: 3000 } } });
    const { id: noClipId } = await f.cry();
    await f.call('PATCH', `/api/cries/${noClipId}`, { json: { noClip: 'denied' } });
    assert.equal(f.row(noClipId)!.no_clip, 'denied', 'control: the word was saved');
    await f.call('DELETE', `/api/cries/${noClipId}`);
    assert.equal(f.row(noClipId)!.no_clip, null, 'the delete empties the no-clip word');
    assert.deepEqual([f.row(id)!.distress, f.row(id)!.row_tap], [2, 'sleep'], 'control: the marks were saved');
    assert.equal((await f.call('DELETE', `/api/cries/${id}`, { adult: 'wren' })).status, 200, 'each adult with the change right can delete');
    const stored = f.row(id)!;
    assert.equal(stored.deleted_at, new Date(START).toISOString());
    for (const column of ['adult', 'snapshot_json', 'stopped_by', 'labeled_at', 'labeled_by', 'clip', 'clip_json', 'distress', 'distress_at', 'row_tap', 'row_tap_ms', 'no_clip']) assert.equal(stored[column], null, column);
    assert.deepEqual([stored.sound_on, stored.skipped, stored.noisy], [0, 0, 0]);
    assert.equal((await f.call('GET', '/api/cries')).json.cries.length, 0);
    for (const [method, path] of [['GET', `/api/cries/${id}/clip`], ['DELETE', `/api/cries/${id}/clip`], ['DELETE', `/api/cries/${id}`]]) assert.equal((await f.call(method, path)).status, 410, `${method} ${path}`);
    assert.equal((await f.call('PATCH', `/api/cries/${id}`, { json: { skipped: true } })).status, 410);
    assert.equal((await f.upload(id)).status, 410);
  } finally { await f.close(); }
});

test('Clip download: the bytes with no-store and nosniff headers, and no clip means 404', async () => {
  // Failure case: a browser or a proxy keeps a clip, or sniffs a clip as a page.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const { id } = await f.cry();
    assert.equal((await f.call('GET', `/api/cries/${id}/clip`)).status, 404, 'no clip yet');
    await f.upload(id);
    const got = await f.call('GET', `/api/cries/${id}/clip`, { adult: 'vi' });
    assert.equal(got.status, 200);
    assert.ok(got.buffer.equals(wav()));
    assert.equal(got.headers.get('cache-control'), 'no-store');
    assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(got.headers.get('content-type'), 'audio/wav');
    assert.equal((await f.call('GET', `/api/cries/${randomUUID()}/clip`)).status, 404);
    assert.equal((await f.call('GET', '/api/cries/not-an-id/clip')).status, 404);
  } finally { await f.close(); }
});

test('Logs: a 5xx line for a cry route holds :id and no UUID, also when the error comes before the cry routes run', async () => {
  // Failure case: a log line holds the id of a cry.
  const id = randomUUID();
  const lines: string[] = [], original = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => { lines.push(String(chunk)); return true; }) as typeof process.stderr.write;
  const sessions = { passcodeSet: () => true, get: () => { throw new Error('session storage failed'); }, renew: () => {} } as any;
  const server = createApp({ sessions, origin: ORIGIN, webDir: '.', domain: async () => {}, integration: async () => {} });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    for (const path of [`/api/cries/${id}/clip`, `/api/cries/${id.toUpperCase()}`]) assert.equal((await fetch(base + path, { headers: { cookie: '__Host-little-days=x' } })).status, 502);
  } finally {
    process.stderr.write = original;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  assert.deepEqual(lines, ['GET /api/cries/:id/clip 502 Error\n', 'GET /api/cries/:id 502 Error\n']);
});

// ---- The method fixes (plans/2026-11-20-crying-method-fixes.md) ----

test('Method marks: the rating closes after 15 minutes, the first row tap wins, and the no-clip word needs a cry with no clip', async () => {
  // Failure case: a rating given late (it can follow the outcome) is saved, a second row tap rewrites the first,
  // or a cry with a clip still says why it has none. Gap: no present test knows these fields.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const { id } = await f.cry();
    const patch = (json: unknown, adult = 'rowan') => f.call('PATCH', `/api/cries/${id}`, { adult, json });
    const first = await patch({ distress: 2 });
    assert.equal(first.status, 200); assert.equal(first.json.changed, true);
    assert.deepEqual([f.row(id)!.distress, f.row(id)!.distress_at], [2, new Date(START).toISOString()]);
    f.clock.t += 2000;
    await patch({ distress: 3 });
    assert.deepEqual([f.row(id)!.distress, f.row(id)!.distress_at], [3, new Date(START + 2000).toISOString()], 'the last rating counts');
    assert.equal((await patch({ rowTap: { type: 'diaper', ms: 5120 } })).json.changed, true);
    const again = await patch({ rowTap: { type: 'feed', ms: 9000 } });
    assert.deepEqual([again.status, again.json.changed], [200, false], 'a second row tap is no refusal');
    assert.deepEqual([f.row(id)!.row_tap, f.row(id)!.row_tap_ms], ['diaper', 5120], 'the first row tap wins');
    // The no-clip word: saved while there is no clip, emptied when a clip is saved, refused after.
    await patch({ noClip: 'denied' });
    assert.equal(f.row(id)!.no_clip, 'denied');
    await patch({ noClip: 'too-short' });
    assert.equal(f.row(id)!.no_clip, 'too-short', 'the last word counts');
    assert.equal((await f.upload(id)).status, 200);
    assert.equal(f.row(id)!.no_clip, null, 'a saved clip empties the word');
    assert.equal((await patch({ noClip: 'hidden' })).status, 409);
    assert.equal(f.row(id)!.no_clip, null);
    // The other adult may not write any of the three, also with the change right.
    for (const json of [{ distress: 1 }, { rowTap: { type: 'feed', ms: 1 } }, { noClip: 'network' }]) assert.equal((await patch(json, 'wren')).status, 403, JSON.stringify(json));
    assert.deepEqual([f.row(id)!.distress, f.row(id)!.row_tap], [3, 'diaper']);
    // 15 minutes after the tap the rating is refused and stays as it was. The row tap has no time limit.
    f.clock.t = START + age(15) + 1;
    assert.equal((await patch({ distress: 1 })).status, 403);
    assert.equal(f.row(id)!.distress, 3);
    // Unknown words and numbers out of range.
    for (const json of [{ distress: 0 }, { distress: 4 }, { distress: 2.5 }, { distress: '2' }, { distress: null }, { rowTap: { type: 'burp', ms: 1 } }, { rowTap: { type: 'feed', ms: -1 } },
      { rowTap: { type: 'feed', ms: 86_400_001 } }, { rowTap: { type: 'feed', ms: 1.5 } }, { rowTap: { type: 'feed' } }, { rowTap: { type: 'feed', ms: 1, extra: 1 } }, { rowTap: 'feed' },
      { noClip: 'no-sound' }, { noClip: 'adult-changed' }, { noClip: 'DENIED' }, { noClip: 3 }])
      assert.equal((await patch(json)).status, 400, JSON.stringify(json));
    // The 15 frozen words of the plan.
    const fresh = await f.cry();
    const words = ['no-support', 'no-worklet', 'late-reply', 'first-sample-deadline', 'denied', 'no-microphone', 'error', 'stopped', 'too-short', 'hidden', 'cancelled', 'interrupted', 'recording', 'network', 'refused'];
    assert.equal(words.length, 15);
    for (const noClip of words) assert.equal((await f.call('PATCH', `/api/cries/${fresh.id}`, { json: { noClip } })).status, 200, noClip);
    // One request may carry several fields.
    const both = await f.call('PATCH', `/api/cries/${fresh.id}`, { json: { distress: 1, rowTap: { type: 'sleep', ms: 0 }, skipped: true } });
    assert.equal(both.status, 200);
    assert.deepEqual([f.row(fresh.id)!.distress, f.row(fresh.id)!.row_tap, f.row(fresh.id)!.row_tap_ms, f.row(fresh.id)!.skipped], [1, 'sleep', 0, 1]);
    // No reply holds a new field.
    const NEW = ['distress', 'distressAt', 'rowTap', 'rowTapMs', 'noClip', 'no_clip', 'row_tap'];
    for (const key of NEW) assert.ok(!(key in both.json), `the PATCH reply holds ${key}`);
    const list = await f.call('GET', '/api/cries');
    for (const item of list.json.cries) assert.deepEqual(Object.keys(item).sort(), ['adult', 'clipMs', 'clipState', 'id', 'noisy', 'occurredAt', 'stoppedBy']);
    for (const key of NEW) assert.ok(!JSON.stringify(list.json).includes(key), `the list holds ${key}`);
  } finally { await f.close(); }
});

test('Method marks: an adult with the add right and no change right can rate and tap a row, and cannot answer', async () => {
  // Failure case: the lower route right on PATCH lets an add-only adult change an answer, a noisy mark or Skip.
  // Gap: the rights test sends only Skip, so it would miss an old field that patch() forgets to check.
  const f = await fixture();
  try {
    const { id } = await f.cry('ad');
    const patch = (json: unknown) => f.call('PATCH', `/api/cries/${id}`, { adult: 'ad', json });
    assert.equal((await patch({ distress: 2 })).status, 200);
    assert.equal((await patch({ rowTap: { type: 'feed', ms: 800 } })).status, 200);
    assert.equal((await patch({ noClip: 'recording' })).status, 200);
    assert.deepEqual([f.row(id)!.distress, f.row(id)!.row_tap, f.row(id)!.no_clip], [2, 'feed', 'recording']);
    for (const json of [{ stoppedBy: 'feed' }, { stoppedBy: '', was: 'feed' }, { noisy: true }, { skipped: true }, { distress: 1, stoppedBy: 'feed' }, { distress: 1, skipped: true }])
      assert.equal((await patch(json)).status, 403, JSON.stringify(json));
    assert.deepEqual([f.row(id)!.stopped_by, f.row(id)!.noisy, f.row(id)!.skipped, f.row(id)!.distress], [null, 0, 0, 2], 'a refused request changes nothing');
    assert.equal((await f.call('PATCH', `/api/cries/${randomUUID()}`, { adult: 'ad', json: { stoppedBy: 'feed' } })).status, 403, 'the change right comes before the lookup');
    assert.equal((await f.call('PATCH', `/api/cries/${randomUUID()}`, { adult: 'ad', json: { distress: 1 } })).status, 404);
    assert.equal((await f.call('PATCH', `/api/cries/${id}`, { adult: 'vi', json: { distress: 1 } })).status, 403, 'a viewer cannot rate');
  } finally { await f.close(); }
});

test('Method fields at the tap and the clip: order and end are known words, may be absent, and the clip gets its peak and clipped share', async () => {
  // Failure case: an open page from before the deploy (no `order`, no `end`) gets a 400 for each cry,
  // or a word that is not known lands in the snapshot. Gap: no present test sends these keys.
  const f = await fixture();
  try {
    await f.sound('rowan', 'on');
    const { id, reply } = await f.cry('rowan', { snapshot: snapshot({ order: 'home' }) });
    assert.equal(reply.status, 200);
    assert.equal(JSON.parse(f.row(id)!.snapshot_json).order, 'home');
    assert.equal((await f.cry('rowan', { snapshot: snapshot({ order: 'rank' }) })).reply.status, 400);
    assert.equal((await f.cry('rowan', { snapshot: snapshot({ order: null }) })).reply.status, 400);
    const old = await f.cry();
    assert.equal(old.reply.status, 200);
    assert.ok(!('order' in JSON.parse(f.row(old.id)!.snapshot_json)), 'a snapshot with no order stays without it');
    const put = (cryId: string, extra: object) => f.call('PUT', `/api/cries/${cryId}/clip`, { raw: wav(), headers: { 'x-cry-capture': JSON.stringify({ ...CAPTURE, ...extra }) } });
    assert.equal((await put(id, { end: 'stop' })).status, 400);
    assert.equal((await put(id, { end: 1 })).status, 400);
    assert.equal((await put(id, { end: 'row' })).status, 200);
    const meta = JSON.parse(f.row(id)!.clip_json);
    assert.equal(meta.end, 'row');
    assert.ok(Math.abs(meta.peak - 6000 / 32768) < 1e-4, 'the peak of the quiet sine');
    assert.equal(meta.clipped, 0);
    assert.equal((await f.upload(old.id)).status, 200, 'a header with no end is accepted');
    assert.equal(JSON.parse(f.row(old.id)!.clip_json).end, null);
    for (const end of ['full', 'left', 'ended']) { const each = await f.cry(); assert.equal((await put(each.id, { end })).status, 200, end); }
  } finally { await f.close(); }
});

test('Clip quality numbers: silence, a full-scale square wave and a half-scale sine', () => {
  // Failure case: a wrong peak or clipped share hides clips that the hold line must repair, or flags clean ones.
  // Gap: wavInfo had no level numbers.
  const silence = wavInfo(wavOf(() => 0));
  assert.deepEqual([silence.peak, silence.clipped], [0, 0]);
  const square = wavInfo(wavOf(i => (Math.floor(i / 40) % 2 ? -32768 : 32767)));
  assert.deepEqual([square.peak, square.clipped], [1, 1]);
  const sine = wavInfo(wavOf(i => Math.round(16384 * Math.sin(i * 2 * Math.PI / 80))));
  assert.equal(sine.peak, 0.5);
  assert.equal(sine.clipped, 0);
  const some = wavInfo(wavOf(i => (i % 100 === 0 ? 32767 : 1000)));
  assert.equal(some.clipped, 0.01, 'one sample in 100 at the limit');
});

test('Migration: a database from the build before the method fixes gets the five columns one time and keeps its cries', () => {
  // Failure case: the new gateway fails to boot on the live database, or the change drops a cry.
  // Gap: every other test starts from an empty database.
  const dir = mkdtempSync(join(tmpdir(), 'little-days-cries-old-'));
  try {
    const path = join(dir, 'old.sqlite');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE cries (id TEXT PRIMARY KEY, adult TEXT, occurred_at TEXT NOT NULL, sound_on INTEGER NOT NULL DEFAULT 0, snapshot_json TEXT, stopped_by TEXT,
      labeled_at TEXT, labeled_by TEXT, skipped INTEGER NOT NULL DEFAULT 0, clip_state TEXT NOT NULL DEFAULT 'none' CHECK (clip_state IN ('none','kept','deleted','closed')),
      clip BLOB, clip_json TEXT, noisy INTEGER NOT NULL DEFAULT 0, deleted_at TEXT)`);
    const id = randomUUID();
    old.prepare("INSERT INTO cries (id, adult, occurred_at, stopped_by) VALUES (?, 'Rowan', '2026-11-19T15:00:00.000Z', 'feed')").run(id);
    old.close();
    const columns = () => { const db = new DatabaseSync(path); try { return (db.prepare('PRAGMA table_info(cries)').all() as { name: string }[]).map(c => c.name); } finally { db.close(); } };
    const store = openStore(path);
    assert.equal(store.cries.get(id)!.stoppedBy, 'feed', 'the cry is kept');
    assert.deepEqual(store.cries.marks(id), { distress: null, distressAt: null, rowTap: null, rowTapMs: null, noClip: null });
    store.close();
    const after = columns();
    for (const name of ['distress', 'distress_at', 'row_tap', 'row_tap_ms', 'no_clip']) assert.equal(after.filter(c => c === name).length, 1, name);
    openStore(path).close();
    assert.deepEqual(columns(), after, 'a second boot adds nothing');
    // The rollback case: a statement of the build before, with its named columns, still runs on the changed table.
    const back = new DatabaseSync(path);
    back.prepare('INSERT INTO cries (id, adult, occurred_at, sound_on, snapshot_json) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), 'Wren', '2026-11-20T15:00:00.000Z', 0, '{}');
    assert.equal((back.prepare('SELECT COUNT(*) AS n FROM cries').get() as { n: number }).n, 2);
    back.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
