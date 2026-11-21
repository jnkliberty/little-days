import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { json } from '../server/http.ts';
import { createSessionService } from '../server/session.ts';
import { savePasscode } from '../server/passcode.ts';
import { openStore } from '../server/store.ts';
import { setZone } from '../server/zone.ts';

setZone('America/Chicago');
// An invented passcode for these tests.
const PASSCODE = ['test', 'passcode', '1'].join('-');
const passcodeMock = {passcodeSet: () => true, checkPasscode: async (value: unknown) => value === PASSCODE};

test('HTTP boundary requires session, same origin and CSRF, and sets a private cookie', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'little-days-http-'));
  await writeFile(join(dir, 'index.html'), '<title>Ada</title>');
  const session = {sessionId: 'a'.repeat(43), csrfToken: 'write-csrf', adult: 'Rowan'};
  let active = false;
  const renewed: string[] = [];
  const sessions = {
    issueLoginCsrf: () => 'login-csrf',
    ...passcodeMock,
    people: () => ['Rowan', 'Sage', 'Wren'], labels: () => ({Wren: 'Other'}),
    get: (id: string) => active && id === session.sessionId ? session : null,
    select: async (name: string, csrf: string) => {
      assert.equal(name, 'Rowan'); assert.equal(csrf, 'login-csrf');
      active = true; return session;
    },
    login: async (name: string, password: string, csrf: string) => {
      assert.equal(name, 'Rowan'); assert.equal(password, 'test-password'); assert.equal(csrf, 'login-csrf');
      active = true; return session;
    },
    requireCsrf: (id: string, csrf: string) => { if (!active || id !== session.sessionId || csrf !== session.csrfToken) throw new Error(); return session; },
    logout: async () => { active = false; }, request: async () => null,
    renew: (id: string) => { renewed.push(id); }, csrfFor: (current: typeof session) => current.csrfToken,
  };
  const origin = 'https://little-days.test';
  const server = createApp({sessions, origin, webDir: dir, domain: async (_req, res, _url, adult) => json(res, 200, {me: adult.adult})});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + '/api/state')).status, 401);
    const bootstrap = await (await fetch(base + '/api/session')).json();
    assert.deepEqual(bootstrap, {me: null, csrf: 'login-csrf', passcode: true, tz: 'America/Chicago', careLink: false, ai: false});
    const login = {method: 'POST', headers: {'content-type': 'application/json', origin, 'x-csrf-token': bootstrap.csrf}, body: JSON.stringify({username: 'Rowan', passcode: PASSCODE})};
    assert.equal((await fetch(base + '/api/session', {...login, headers: {...login.headers, origin: 'https://other.test'}})).status, 403);
    assert.equal((await fetch(base + '/api/session', {...login, body: JSON.stringify({username: 'Rowan', passcode: PASSCODE, password: 'forbidden'})})).status, 400);
    const response = await fetch(base + '/api/session', login);
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!;
    for (const flag of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=2592000']) assert.ok(cookie.includes(flag), flag);
    assert.deepEqual(await response.json(), {me: 'Rowan', csrf: 'write-csrf'});
    const headers = {cookie: cookie.split(';')[0], origin, 'x-csrf-token': 'wrong'};
    assert.equal((await fetch(base + '/api/events', {method: 'POST', headers})).status, 403);
    assert.equal((await fetch(base + '/api/events', {method: 'POST', headers: {...headers, 'x-csrf-token': 'write-csrf'}})).status, 200);
    // Each signed-in API request is use: it renews the sign-in once and sends the 30-day cookie again.
    renewed.length = 0;
    const used = await fetch(base + '/api/state', {headers});
    assert.equal(used.status, 200);
    assert.match(String(used.headers.get('set-cookie')), /^__Host-little-days=a{43}; .*Max-Age=2592000/);
    assert.deepEqual(renewed, [session.sessionId]);
    assert.equal((await fetch(base + '/')).headers.get('set-cookie'), null);
    assert.equal((await fetch(base + '/api/state')).headers.get('set-cookie'), null);
    assert.deepEqual(renewed, [session.sessionId], 'page files and replies without a sign-in do not renew');
    assert.equal((await fetch(base + '/package.json')).status, 404);
    const page = await fetch(base + '/');
    assert.ok(page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
    assert.ok(page.headers.get('content-security-policy')?.includes("media-src 'self' blob:"));
    await fetch(base + '/api/session', {method: 'DELETE', headers: {...headers, 'x-csrf-token': 'write-csrf'}});
    assert.equal((await fetch(base + '/api/state', {headers})).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, {recursive: true, force: true});
  }
});

test('a sign-in survives a gateway restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'little-days-restart-'));
  await writeFile(join(dir, 'index.html'), '<title>Ada</title>');
  const store = openStore(':memory:');
  await savePasscode(store, PASSCODE);
  const logins: string[] = [], calls: string[] = [];
  const babyBuddy = {
    login: async (username: string, password: string) => { logins.push(`${username}:${password}`); return {username, userId: username === 'Rowan' ? 1 : 2, cookies: new Map(), csrfToken: 'bb-csrf'}; },
    request: async (session: {username: string}, request: {method: string}) => { calls.push(`${session.username} ${request.method}`); return null; },
    identity: async (session: {username: string; userId: number}) => ({id: session.userId, username: session.username}),
    logout: async () => {},
  };
  const accounts = [{username: 'Rowan', password: 'pw-one'}, {username: 'Wren', password: 'pw-two'}];
  const origin = 'https://little-days.test';
  const servers = [];
  async function start() {
    const sessions = createSessionService({store, babyBuddy, accounts});
    // Like the real handlers, the stub reads from Baby Buddy on a GET and writes otherwise.
    const domain = async (req, res, _url, session) => json(res, 200, {ok: await sessions.request(session.sessionId, req.method === 'GET' ? {resource: 'changes', method: 'GET'} : {resource: 'changes', method: 'POST', body: {child: 1}})});
    const server = createApp({sessions, origin, webDir: dir, domain, integration: async () => {}});
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return `http://127.0.0.1:${address.port}`;
  }
  try {
    const first = await start();
    const initial = await (await fetch(first + '/api/session')).json();
    const signedIn = await fetch(first + '/api/session', {method: 'POST', headers: {origin, 'content-type': 'application/json', 'x-csrf-token': initial.csrf}, body: JSON.stringify({username: 'Rowan', passcode: PASSCODE})});
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.get('set-cookie')!.split(';')[0];
    const oldCsrf = (await signedIn.json()).csrf;
    const restarted = await start();
    const write = (csrf: string, from = cookie) => fetch(restarted + '/api/events', {method: 'POST', headers: {cookie: from, origin, 'x-csrf-token': csrf}});
    // A phone that stays open across the restart keeps loading and saving with its old token.
    assert.equal((await fetch(restarted + '/api/state', {headers: {cookie}})).status, 200);
    assert.equal((await write(oldCsrf)).status, 200);
    assert.equal((await write('wrong')).status, 403);
    assert.deepEqual(logins, ['Rowan:pw-one', 'Rowan:pw-one'], 'the gateway signed in to Baby Buddy again with the stored account');
    assert.deepEqual(calls, ['Rowan GET', 'Rowan POST']);
    // A phone that loads the app again gets a new token that saves; the old token then stops.
    const bootstrap = await (await fetch(restarted + '/api/session', {headers: {cookie}})).json();
    assert.equal(bootstrap.me, 'Rowan');
    assert.ok(typeof bootstrap.csrf === 'string' && bootstrap.csrf.length > 20 && bootstrap.csrf !== oldCsrf);
    assert.equal((await write(bootstrap.csrf)).status, 200);
    assert.equal((await write(oldCsrf)).status, 403);
    // Switching to another person still works and ends the old sign-in.
    const selected = await fetch(restarted + '/api/session', {method: 'POST', headers: {cookie, origin, 'content-type': 'application/json', 'x-csrf-token': bootstrap.csrf}, body: JSON.stringify({username: 'Wren'})});
    assert.equal(selected.status, 200);
    const selectedBody = await selected.json();
    assert.equal(selectedBody.me, 'Wren');
    const current = selected.headers.get('set-cookie')!.split(';')[0];
    assert.notEqual(current, cookie);
    assert.equal((await fetch(restarted + '/api/state', {headers: {cookie}})).status, 401);
    assert.equal((await fetch(restarted + '/api/state', {headers: {cookie: current}})).status, 200);
    assert.equal((await write(selectedBody.csrf, current)).status, 200);
  } finally {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    store.close();
    await rm(dir, {recursive: true, force: true});
  }
});

test('a Baby Buddy lockout reports the lock and wait time, not a wrong password', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'little-days-http-'));
  const sessions = {
    ...passcodeMock, issueLoginCsrf: () => 'csrf', people: () => ['Wren'], labels: () => ({}), get: () => null, requireCsrf: () => { throw new Error(); }, logout: async () => {}, request: async () => null,
    select: async () => { throw Object.assign(new Error('Baby Buddy login failed'), {locked: true}); },
    login: async () => { throw Object.assign(new Error('Baby Buddy login failed'), {locked: true}); },
  };
  const origin = 'https://little-days.test';
  const server = createApp({sessions, origin, webDir: dir, domain: async (_req, res) => json(res, 200, {}), integration: async (_req, res) => json(res, 200, {})});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/session`, {method: 'POST', headers: {'content-type': 'application/json', origin, 'x-csrf-token': 'csrf'}, body: JSON.stringify({username: 'Wren', passcode: PASSCODE})});
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /locked.*1 hour/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, {recursive: true, force: true}); }
});

function captureStderr() {
  const lines: string[] = [];
  const original = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => { lines.push(String(chunk)); return true; }) as typeof process.stderr.write;
  return {lines, restore: () => { process.stderr.write = original; }};
}

async function serve(webDir: string, domain: Parameters<typeof createApp>[0]['domain']) {
  const session = {sessionId: 'b'.repeat(43), csrfToken: 'csrf', adult: 'PRIVATE_ADULT'};
  const sessions = {get: (id: string) => id === session.sessionId ? session : null, renew: () => {}, requireCsrf: () => session, passcodeSet: () => true} as any;
  const server = createApp({sessions, origin: 'https://little-days.test', webDir, domain, integration: async () => {}});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return {base, close, headers: {cookie: '__Host-little-days=' + session.sessionId, origin: 'https://little-days.test', 'x-csrf-token': 'csrf', 'content-type': 'application/json'}};
}

test('a reply with status 500 or higher writes one log line without query text, body, or message', async () => {
  const app = await serve('.', async () => { throw new TypeError('PRIVATE_MESSAGE'); });
  const capture = captureStderr();
  try {
    const query = await fetch(app.base + '/api/state?from=2026-11-01', {headers: app.headers});
    assert.equal(query.status, 502);
    const post = await fetch(app.base + '/api/events', {method: 'POST', headers: app.headers, body: JSON.stringify({note: 'PRIVATE_BODY'})});
    assert.equal(post.status, 502);
    await fetch(app.base + '/api/state');
    capture.restore();
    assert.equal(capture.lines.length, 2, 'one line per 5xx reply, none for the 401');
    const [first, second] = capture.lines;
    assert.match(first, /^GET \/api\/state 502 TypeError\n$/);
    assert.match(second, /^POST \/api\/events 502 TypeError\n$/);
    assert.ok(!capture.lines.join('').match(/from=|PRIVATE|2026-11-01/));
  } finally { capture.restore(); await app.close(); }
});

test('a static file reply carries an ETag, and a matching If-None-Match gets 304 with no body', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'little-days-etag-'));
  await writeFile(join(dir, 'index.html'), '<title>Little Days</title>');
  await writeFile(join(dir, 'font-v1.woff2'), 'font');
  const app = await serve(dir, async () => {});
  try {
    const first = await fetch(app.base + '/');
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-cache');
    const etag = first.headers.get('etag');
    assert.match(String(etag), /^"[0-9a-f]+-[0-9a-f]+"$/);
    assert.equal(await first.text(), '<title>Little Days</title>');
    const same = await fetch(app.base + '/', {headers: {'if-none-match': etag!}});
    assert.equal(same.status, 304);
    assert.equal(await same.text(), '');
    assert.equal(same.headers.get('etag'), etag);
    assert.equal((await fetch(app.base + '/', {headers: {'if-none-match': 'W/' + etag + ', "other"'}})).status, 304);
    assert.equal((await fetch(app.base + '/', {headers: {'if-none-match': '"other"'}})).status, 200);
    await writeFile(join(dir, 'index.html'), '<title>Little Days changed</title>');
    const changed = await fetch(app.base + '/', {headers: {'if-none-match': etag!}});
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.equal(await changed.text(), '<title>Little Days changed</title>');
    assert.equal((await fetch(app.base + '/font-v1.woff2')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  } finally { await app.close(); await rm(dir, {recursive: true, force: true}); }
});
