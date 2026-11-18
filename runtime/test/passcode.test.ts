import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.ts';
import { json } from '../server/http.ts';
import { scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { savePasscode, verifyPasscode } from '../server/passcode.ts';
import { createSessionService } from '../server/session.ts';
import { openStore } from '../server/store.ts';

// Household passcode (D2). Invented adults and an invented passcode only.
const PASSCODE = ['correct', 'horse', 'battery'].join(' ');
const WRONG = ['wrong', 'horse', 'battery'].join(' ');
const ORIGIN = 'https://household.test';
// The real cost takes about half a second for each check; most tests save with a small cost. One test uses the real one.
const FAST = { N: 1024 };
const people = ['river', 'wren'];
const accounts = people.map(username => ({ username, password: ['synthetic', 'only'].join('-') }));
const babyBuddy: any = {
  login: async (username: string) => ({ cookies: {}, csrfToken: 'x', userId: people.indexOf(username) + 2, username }),
  logout: async () => {}, identity: async (session: any) => ({ id: session.userId, username: session.username }), request: async () => ({}),
};

type Harness = { base: string; store: ReturnType<typeof openStore>; clock: { value: number }; close: () => Promise<void> };
async function harness(dbPath = ':memory:', set = true, existing?: ReturnType<typeof openStore>, passcodeOff = false): Promise<Harness> {
  const store = existing || openStore(dbPath);
  store.putSetting('app', 'people', people);
  store.putSetting('app', 'labels', { wren: 'Grandma' });
  if (set) await savePasscode(store, PASSCODE, FAST);
  const clock = { value: Date.parse('2026-11-12T12:00:00Z') };
  const sessions = createSessionService({ store, babyBuddy, accounts });
  const server = createApp({ sessions, origin: ORIGIN, webDir: '.', domain: async (_req, res, _url, adult) => json(res, 200, { me: adult.adult }), integration: async () => {}, trustProxy: true, passcodeOff, now: () => clock.value });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address: any = server.address();
  return { base: `http://127.0.0.1:${address.port}`, store, clock, close: () => new Promise<void>(resolve => { server.close(() => resolve()); if (!existing) store.close(); }) };
}
const post = (h: Harness, path: string, body: unknown, address = '203.0.113.1', cookie = '', csrf = '') => fetch(h.base + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': address, ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
  body: JSON.stringify(body),
});
const unlock = (h: Harness, passcode: unknown, address?: string) => post(h, '/api/session/passcode', { passcode }, address);
const signIn = async (h: Harness, username: string, passcode: unknown, address?: string) => {
  const csrf = (await (await get(h, '/api/session')).json()).csrf;
  return post(h, '/api/session', { username, ...(passcode === undefined ? {} : { passcode }) }, address, '', csrf);
};
const cookieOf = (response: Response) => (response.headers.get('set-cookie') || '').split(';')[0];
const get = (h: Harness, path: string, cookie = '') => fetch(h.base + path, { headers: cookie ? { cookie } : {} });

test('D2.1 a device with no session is asked for the passcode and is sent no adult name', async () => {
  const h = await harness();
  try {
    const body = await (await get(h, '/api/session')).json();
    assert.equal('passcodeOff' in body, false);
    assert.equal(body.me, null);
    assert.equal(body.passcode, true);
    assert.ok(body.csrf);
    assert.deepEqual(Object.keys(body).filter(key => ['people', 'labels'].includes(key)), []);
    assert.doesNotMatch(JSON.stringify(body), /river|wren|Grandma/);
  } finally { await h.close(); }
});

test('D2.2 a correct passcode returns the adult names and labels; a wrong one returns neither', async () => {
  const h = await harness();
  try {
    const good = await unlock(h, PASSCODE);
    assert.equal(good.status, 200);
    const body = await good.json();
    assert.deepEqual(body.people, people);
    assert.deepEqual(body.labels, { wren: 'Grandma' });
    assert.equal(good.headers.get('set-cookie'), null, 'the passcode alone starts no session');
    for (const wrong of [WRONG, '', undefined, 12345678, null]) {
      const bad = await unlock(h, wrong);
      assert.equal(bad.status, 401, String(wrong));
      assert.doesNotMatch(await bad.text(), /river|wren|Grandma/);
    }
  } finally { await h.close(); }
});

test('D2.3 the name and the passcode travel together, and the server checks the passcode again', async () => {
  const h = await harness();
  try {
    const ok = await signIn(h, 'river', PASSCODE);
    assert.equal(ok.status, 200);
    const okText = await ok.text();
    assert.equal(JSON.parse(okText).me, 'river');
    const cookie = cookieOf(ok);
    assert.match(cookie, /^__Host-little-days=/);
    assert.equal((await get(h, '/api/state', cookie)).status, 200);
    // A name picked after an earlier passcode check, with a wrong or missing passcode, gets no session.
    for (const passcode of [WRONG, undefined, '', 42]) {
      const bad = await signIn(h, 'wren', passcode);
      assert.equal(bad.status, 401, String(passcode));
      assert.equal(bad.headers.get('set-cookie'), null);
    }
    // No response or header carries the passcode back.
    assert.ok(!okText.includes(PASSCODE) && ![...ok.headers.values()].some(value => value.includes(PASSCODE)));
    for (const response of [await unlock(h, PASSCODE), await get(h, '/api/session', cookie)]) {
      assert.ok(!(await response.text()).includes(PASSCODE) && ![...response.headers.values()].some(value => value.includes(PASSCODE)));
    }
  } finally { await h.close(); }
});

test('D2.4 with no correct passcode there is no name list and no session', async () => {
  const h = await harness();
  try {
    assert.equal((await signIn(h, 'river', WRONG)).status, 401);
    assert.equal((await signIn(h, 'river', undefined)).status, 401);
    assert.equal((await signIn(h, 'nobody', PASSCODE)).status, 401, 'an unknown name with the right passcode starts no session');
    assert.equal((h.store as any).liveSessionHashesForUser(2).length + (h.store as any).liveSessionHashesForUser(3).length, 0);
    assert.equal((await get(h, '/api/state')).status, 401);
  } finally { await h.close(); }
});

test('D2.4b an install with no passcode set refuses sign-in and shows no name', async () => {
  const h = await harness(':memory:', false);
  try {
    assert.equal((await (await get(h, '/api/session')).json()).passcode, false);
    for (const reply of [await unlock(h, PASSCODE), await signIn(h, 'river', PASSCODE)]) {
      assert.equal(reply.status, 503);
      assert.doesNotMatch(await reply.text(), /river|wren|Grandma/);
    }
  } finally { await h.close(); }
});

test('D2.5 setting the passcode again deletes every session, including one made before a passcode existed, and after a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'passcode-'));
  const path = join(dir, 'gateway.sqlite');
  const first = await harness(path, false);
  let cookie: string;
  try {
    // A sign-in from before the passcode existed: made straight in the store, as the old code did.
    first.store.createSession({ sessionId: 'a'.repeat(43), csrfToken: 'b'.repeat(43), adult: 'river', babyBuddyUserId: 2, expiresAt: Date.now() + 60_000 });
    assert.equal((await get(first, '/api/state', '__Host-little-days=' + 'a'.repeat(43))).status, 503, 'no passcode yet: nothing is served');
    await savePasscode(first.store, PASSCODE, FAST);
    assert.equal((await get(first, '/api/state', '__Host-little-days=' + 'a'.repeat(43))).status, 401, 'old cookie after the passcode is set');
    cookie = cookieOf(await signIn(first, 'wren', PASSCODE));
    assert.equal((await get(first, '/api/state', cookie)).status, 200);
    await savePasscode(first.store, ['another', 'passcode'].join(' '), FAST);
    assert.equal((await get(first, '/api/state', cookie)).status, 401, 'cookie after a reset');
    assert.equal((await signIn(first, 'wren', PASSCODE)).status, 401, 'the old passcode stops working');
  } finally { await first.close(); }
  const second = await harness(path, false);
  try {
    assert.equal((await get(second, '/api/state', '__Host-little-days=' + 'a'.repeat(43))).status, 401, 'old cookie after a restart');
    assert.equal((await get(second, '/api/state', cookie)).status, 401, 'reset-era cookie after a restart');
  } finally { await second.close(); }
});

test('the passcode is stored only as a salted scrypt hash, with its cost, and it needs 10 characters', async () => {
  const store = openStore(':memory:');
  try {
    await assert.rejects(savePasscode(store, '123456789'), /at least 10 characters/);
    assert.equal(store.getSetting('app', 'passcode'), null);
    await savePasscode(store, PASSCODE);
    const saved: any = store.getSetting('app', 'passcode');
    assert.equal(saved.algorithm, 'scrypt');
    assert.deepEqual([saved.N, saved.r, saved.p], [131072, 8, 1], 'the real cost is 2^17 and is stored with the hash');
    assert.match(saved.salt, /^[0-9a-f]{32}$/);
    assert.match(saved.hash, /^[0-9a-f]{128}$/);
    assert.ok(!JSON.stringify(saved).includes(PASSCODE));
    assert.equal(await verifyPasscode(store, PASSCODE), true);
    assert.equal(await verifyPasscode(store, WRONG), false);
    const before = saved.salt;
    await savePasscode(store, PASSCODE, FAST);
    assert.notEqual((store.getSetting('app', 'passcode') as any).salt, before, 'each save uses a new salt');
    assert.equal((store.getSetting('app', 'passcode') as any).N, 1024);
    assert.equal(await verifyPasscode(store, PASSCODE), true, 'a hash made with another cost still verifies');
  } finally { store.close(); }
});

test('a hash saved before the cost was stored still verifies', async () => {
  const store = openStore(':memory:');
  try {
    const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const hash = scryptSync(PASSCODE.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
    store.putSetting('app', 'passcode', { algorithm: 'scrypt', salt: salt.toString('hex'), hash: hash.toString('hex') });
    assert.equal(await verifyPasscode(store, PASSCODE), true);
    assert.equal(await verifyPasscode(store, WRONG), false);
  } finally { store.close(); }
});

test('the length is counted after Unicode normalization', async () => {
  const store = openStore(':memory:');
  try {
    // Six accented letters typed as a letter plus a combining mark: 12 characters typed, 6 after normalization.
    const decomposed = 'e\u0301'.repeat(6);
    assert.equal(decomposed.length, 12);
    await assert.rejects(savePasscode(store, decomposed, FAST), /at least 10 characters/);
    assert.equal(store.getSetting('app', 'passcode'), null);
    // The same text typed in either form is the same passcode.
    const composed = '\u00e9'.repeat(10), typedApart = 'e\u0301'.repeat(10);
    await savePasscode(store, composed, FAST);
    assert.equal(await verifyPasscode(store, typedApart), true);
  } finally { store.close(); }
});

test('a passcode that is long as typed but short once normalized saves and verifies as typed', async () => {
  const store = openStore(':memory:');
  try {
    const typed = 'e\u0301'.repeat(129); // 258 characters typed, 129 after normalization
    assert.equal(typed.length, 258);
    await savePasscode(store, typed, FAST);
    assert.equal(await verifyPasscode(store, typed), true, 'the passcode that was saved signs in');
    assert.equal(await verifyPasscode(store, '\u00e9'.repeat(129)), true, 'and so does the same text typed in the other form');
    assert.equal(await verifyPasscode(store, '\u00e9'.repeat(257)), false, 'a passcode over the limit after normalization is refused');
    await assert.rejects(savePasscode(store, '\u00e9'.repeat(257), FAST), /at most 256 characters/);
  } finally { store.close(); }
});

test('while no passcode is set, every API route except health answers 503 and an old cookie reads nothing', async () => {
  const h = await harness(':memory:', false);
  try {
    // A session from before the passcode existed, made straight in the store.
    h.store.createSession({ sessionId: 'e'.repeat(43), csrfToken: 'f'.repeat(43), adult: 'river', babyBuddyUserId: 2, expiresAt: Date.now() + 60_000 });
    const cookie = '__Host-little-days=' + 'e'.repeat(43);
    assert.equal((await get(h, '/api/health')).status, 200);
    for (const path of ['/api/state', '/api/growth', '/api/care']) assert.equal((await get(h, path, cookie)).status, 503, path);
    assert.equal((await post(h, '/api/events', {}, '203.0.113.1', cookie, 'f'.repeat(43))).status, 503);
    assert.equal((await post(h, '/api/session', { username: 'wren' }, '203.0.113.1', cookie, 'f'.repeat(43))).status, 503, 'no switch with an old cookie');
    const shown = await (await get(h, '/api/session', cookie)).json();
    assert.deepEqual([shown.me, shown.passcode], [null, false], 'the old cookie is not shown as a sign-in');
  } finally { await h.close(); }
});

test('the compose files trust the proxy address for the passcode count', () => {
  // The public file always exists. The family file exists only in the private repository.
  const files = ['../../compose.yaml', '../../deploy/compose.yaml'].map(path => new URL(path, import.meta.url)).filter((url, index) => index === 0 || existsSync(url));
  assert.ok(files.length >= 1);
  for (const url of files) {
    const compose = readFileSync(url, 'utf8');
    assert.match(compose, /^\s+LITTLE_DAYS_TRUST_PROXY: "true"\s*$/m);
    assert.match(compose, /X-Forwarded-For/);
  }
});

test('D2.6 an address that types 10 wrong passcodes waits, even with the right one; the count ignores names', async () => {
  const h = await harness();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await signIn(h, `name-${i}`, WRONG, '198.51.100.7')).status, 401, `wrong ${i + 1}`);
    assert.equal((await signIn(h, 'river', PASSCODE, '198.51.100.7')).status, 429);
    assert.equal((await unlock(h, PASSCODE, '198.51.100.7')).status, 429);
    assert.equal((await signIn(h, 'river', PASSCODE, '198.51.100.8')).status, 200, 'another address is not counted');
  } finally { await h.close(); }
});

test('after 1,000 requests with 1,000 unknown names and a wrong passcode, a second address signs in', async () => {
  const h = await harness();
  try {
    const statuses = new Map<number, number>();
    for (let i = 0; i < 1000; i++) { const status = (await signIn(h, `unknown-${i}`, WRONG, '198.51.100.9')).status; statuses.set(status, (statuses.get(status) || 0) + 1); }
    assert.deepEqual([...statuses].sort(), [[401, 10], [429, 990]]);
    const ok = await signIn(h, 'wren', PASSCODE, '198.51.100.10');
    assert.equal(ok.status, 200);
    assert.equal((await (await unlock(h, PASSCODE, '198.51.100.10')).json()).people.length, 2);
  } finally { await h.close(); }
});

test('after the 15-minute wait the first address signs in with the correct passcode', async () => {
  const h = await harness();
  try {
    for (let i = 0; i < 10; i++) await signIn(h, 'river', WRONG, '198.51.100.20');
    h.clock.value += 15 * 60_000 - 1000;
    assert.equal((await signIn(h, 'river', PASSCODE, '198.51.100.20')).status, 429, 'still waiting');
    h.clock.value += 2000;
    assert.equal((await signIn(h, 'river', PASSCODE, '198.51.100.20')).status, 200);
  } finally { await h.close(); }
});

test('a second count for the whole install has a higher limit and stops guessing from many addresses', async () => {
  const h = await harness();
  try {
    let blocked = -1;
    for (let i = 0; i < 400 && blocked < 0; i++) if ((await signIn(h, 'river', WRONG, `192.0.2.${i % 250}.${Math.floor(i / 250)}`)).status === 429) blocked = i;
    assert.ok(blocked > 10, 'higher than one address');
    assert.ok(blocked <= 200, `the install count stops it (stopped at ${blocked})`);
    assert.equal((await signIn(h, 'river', PASSCODE, '192.0.2.250.9')).status, 429, 'a fresh address waits too');
    h.clock.value += 15 * 60_000 + 1000;
    assert.equal((await signIn(h, 'river', PASSCODE, '192.0.2.250.9')).status, 200);
  } finally { await h.close(); }
});

test('a signed-in adult still switches to another adult with no passcode', async () => {
  const h = await harness();
  try {
    const first = await signIn(h, 'river', PASSCODE);
    const { csrf } = await (await get(h, '/api/session', cookieOf(first))).json();
    const switched = await post(h, '/api/session', { username: 'wren' }, '203.0.113.1', cookieOf(first), csrf);
    assert.equal(switched.status, 200);
    assert.equal((await switched.json()).me, 'wren');
  } finally { await h.close(); }
});

test('the deploy command sets a passcode from standard input and ends every sign-in; a short one changes nothing', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'passcode-cli-'));
  const env = { ...process.env, LITTLE_DAYS_DB: join(dir, 'gateway.sqlite') };
  const run = (input: string) => spawnSync(process.execPath, [new URL('../server/passcode.ts', import.meta.url).pathname], { env, input, encoding: 'utf8' });
  const store = openStore(env.LITTLE_DAYS_DB);
  store.createSession({ sessionId: 'c'.repeat(43), csrfToken: 'd'.repeat(43), adult: 'river', babyBuddyUserId: 2, expiresAt: Date.now() + 60_000 });
  try {
    const short = run('123456789');
    assert.equal(short.status, 1);
    assert.match(short.stderr, /at least 10 characters/);
    assert.ok(store.getSession('c'.repeat(43)), 'a refused passcode ends no sign-in');
    const done = run(PASSCODE + '\n');
    assert.equal(done.status, 0, done.stderr);
    assert.ok(!(done.stdout + done.stderr).includes(PASSCODE));
    assert.equal(store.getSession('c'.repeat(43)), null);
    assert.equal(await verifyPasscode(store, PASSCODE), true);
    assert.equal(await verifyPasscode(store, WRONG), false);
  } finally { store.close(); }
});

// A family install on a private tailnet can turn the passcode off (LITTLE_DAYS_PASSCODE=off).
test('with the passcode off, a phone gets the names at once, signs in with a name only, and reads its data', async () => {
  const h = await harness(':memory:', false, undefined, true);
  try {
    const body = await (await get(h, '/api/session')).json();
    assert.deepEqual([body.me, body.passcode, body.passcodeOff, body.people, body.labels], [null, false, true, people, { wren: 'Grandma' }]);
    assert.equal((await get(h, '/api/state')).status, 401, 'no data before an adult is chosen');
    const reply = await signIn(h, 'river', undefined);
    assert.equal(reply.status, 200);
    const cookie = cookieOf(reply);
    assert.equal((await (await get(h, '/api/state', cookie)).json()).me, 'river');
    assert.deepEqual(Object.values((({me, passcodeOff}) => ({me, passcodeOff}))(await (await get(h, '/api/session', cookie)).json())), ['river', true], 'the sign-in is kept on reload, and the phone still knows the passcode is off');
    assert.equal((await signIn(h, 'nobody', undefined)).status, 401, 'an unknown name still starts no session');
  } finally { await h.close(); }
});

test('with the passcode off, a saved passcode is ignored', async () => {
  const h = await harness(':memory:', true, undefined, true);
  try {
    assert.equal((await (await get(h, '/api/session')).json()).passcode, false);
    assert.equal((await signIn(h, 'wren', WRONG)).status, 200);
  } finally { await h.close(); }
});
