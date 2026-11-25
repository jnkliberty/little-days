import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBabyBuddyClient } from '../server/babybuddy.ts';
import { createSessionService, readTrustedAccounts } from '../server/session.ts';
import { openStore } from '../server/store.ts';

test('session logs in through Baby Buddy, hides upstream cookies, enforces CSRF and allowlist', async () => {
  const seen: string[] = [];
  const upstream = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (req.url === '/login/' && req.method === 'GET') {
      res.writeHead(200, { 'set-cookie': 'csrftoken=bb-csrf; Path=/' });
      res.end('<input type="hidden" name="csrfmiddlewaretoken" value="bb-csrf">');
      return;
    }
    if (req.url === '/login/' && req.method === 'POST') {
      assert.match(String(req.headers.cookie), /csrftoken=bb-csrf/);
      assert.equal(req.headers['x-csrftoken'], 'bb-csrf');
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        if (new URLSearchParams(body).get('password') !== 'private-password') {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('<form>login failed</form>');
          return;
        }
        res.writeHead(302, { 'set-cookie': 'sessionid=bb-session; Path=/; HttpOnly' });
        res.end();
      });
      return;
    }
    if (req.url === '/api/profile' && req.method === 'GET') {
      if (!String(req.headers.cookie).includes('sessionid=bb-session')) {
        res.writeHead(403);
        res.end('denied');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"user":{"id":17,"username":"Sage"},"api_key":"profile-secret"}');
      return;
    }
    if (String(req.url).startsWith('/api/changes/') && req.method === 'GET' && !String(req.url).includes('limit=oversize')) {
      assert.match(String(req.headers.cookie), /sessionid=bb-session/);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[{"id":42}]');
      return;
    }
    if (req.url === '/api/changes/42/' && req.method === 'PATCH') {
      assert.match(String(req.headers.cookie), /sessionid=bb-session/);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"id":42,"wet":true}');
      return;
    }
    if (req.url === '/api/children/ada/' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"id":1,"slug":"ada"}');
      return;
    }
    if (req.url === '/api/notes/' && req.method === 'POST') {
      assert.match(String(req.headers['content-type']), /^multipart\/form-data; boundary=/);
      assert.match(String(req.headers['x-csrftoken']), /bb-csrf/);
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        assert.match(Buffer.concat(chunks).toString(), /photo-bytes/);
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end('{"id":50,"image":"/media/private.jpg"}');
      });
      return;
    }
    if (req.url === '/api/timers/' && req.method === 'POST') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        assert.equal(JSON.parse(body).user, 17);
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end('{"id":51}');
      });
      return;
    }
    if (String(req.url).includes('limit=oversize')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('x'.repeat(2 * 1024 * 1024 + 1));
      return;
    }
    if (req.url === '/logout/' && req.method === 'POST') {
      assert.match(String(req.headers.cookie), /sessionid=bb-session/);
      res.writeHead(302);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const dir = mkdtempSync(join(tmpdir(), 'little-days-session-'));
  const dbPath = join(dir, 'sidecar.sqlite');
  const store = openStore(dbPath);
  const babyBuddy = createBabyBuddyClient({ baseUrl: `http://127.0.0.1:${address.port}` });
  const sessions = createSessionService({ store, babyBuddy, accounts: [{username: 'Sage', password: 'private-password'}] });
  try {
    assert.deepEqual(sessions.people(), ['Sage']);
    const loginCsrf = sessions.issueLoginCsrf();
    const session = await sessions.select('Sage', loginCsrf);
    assert.equal(session.adult, 'Sage');
    assert.equal('babyBuddyUserId' in session, false);
    assert.ok(session.sessionId);
    assert.ok(session.csrfToken);
    assert.doesNotMatch(JSON.stringify(session), /bb-session|bb-csrf|private-password|profile-secret/);
    await assert.rejects(sessions.select('Rowan', sessions.issueLoginCsrf()), /Unknown household member/);
    assert.deepEqual(await sessions.identity(session.sessionId), { id: 17, username: 'Sage' });
    assert.deepEqual(await sessions.identityForUser(17), { id: 17, username: 'Sage' });
    assert.deepEqual(await sessions.request(session.sessionId, { resource: 'changes', method: 'GET' }), [{ id: 42 }]);
    assert.deepEqual(await sessions.request(session.sessionId, { resource: 'changes', method: 'PATCH', id: 42, body: { wet: true } }), { id: 42, wet: true });
    assert.deepEqual(await sessions.request(session.sessionId, { resource: 'children', method: 'GET', id: 'ada' }), { id: 1, slug: 'ada' });
    assert.deepEqual(await sessions.request(session.sessionId, { resource: 'changes', method: 'GET', query: { date_min: '2026-10-25T00:00:00-06:00' } }), [{ id: 42 }]);
    const photo = new FormData();
    photo.set('child', '1');
    photo.set('note', 'Family photo');
    photo.set('image', new Blob(['photo-bytes'], { type: 'image/jpeg' }), 'family.jpg');
    assert.deepEqual(await sessions.request(session.sessionId, { resource: 'notes', method: 'POST', body: photo }), { id: 50, image: '/media/private.jpg' });
    assert.deepEqual(await sessions.request(session.sessionId, { resource: 'timers', method: 'POST', body: { name: 'feed', user: 999 } }), { id: 51 });
    // CSRF is enforced where phone writes enter (app.ts uses requireCsrf), not again inside request().
    assert.throws(() => sessions.requireCsrf(session.sessionId, 'wrong-csrf'), /CSRF/);
    await assert.rejects(sessions.request(session.sessionId, { resource: '../profile', method: 'GET' }), /not allowed/);
    await assert.rejects(sessions.request(session.sessionId, { resource: 'children', method: 'DELETE', id: 'ada' }), /not allowed/);
    await assert.rejects(sessions.request(session.sessionId, { resource: 'feedings', method: 'POST', body: { timer: 2 } }), /blocked field/);
    await assert.rejects(sessions.request(session.sessionId, { resource: 'changes', method: 'GET', query: { limit: 'oversize' } }), /too large/);
    const failedLoginCsrf = sessions.issueLoginCsrf();
    await assert.rejects(sessions.login('Sage', 'wrong-password', failedLoginCsrf), /login failed/);
    const secondSession = await sessions.select('Sage', session.csrfToken, session.sessionId);
    assert.equal(sessions.get(session.sessionId), null);
    await sessions.logout(secondSession.sessionId, secondSession.csrfToken);
    assert.ok(seen.includes('GET /login/'));
    assert.ok(seen.includes('POST /login/'));
    assert.ok(seen.includes('GET /api/profile'));
    assert.ok(seen.includes('GET /api/changes/'));
    assert.ok(seen.includes('PATCH /api/changes/42/'));
    assert.ok(seen.includes('GET /api/children/ada/'));
    assert.ok(seen.some(path => path.includes('date_min=2026-10-25T00%3A00%3A00-06%3A00')));
    assert.ok(seen.includes('POST /api/notes/'));
    assert.ok(seen.includes('POST /api/timers/'));
    assert.equal(seen.filter(path => path === 'GET /api/profile').length, 5);
    assert.equal(sessions.get(session.sessionId), null);
    assert.ok(seen.includes('POST /logout/'));
    assert.equal(await sessions.get(session.sessionId), null);
  } finally {
    store.close();
    await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
    const persisted = readFileSync(dbPath);
    for (const secret of ['private-password', 'bb-session', 'bb-csrf']) assert.equal(persisted.includes(Buffer.from(secret)), false);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('trusted credential file requires exactly the configured people and hides malformed contents', () => {
  const people = ['Rowan', 'Sage', 'Wren'];
  const file = JSON.stringify({accounts: people.map(username => ({username, password: 'synthetic-only'}))});
  assert.deepEqual(readTrustedAccounts(file, people).map(account => account.username), people);
  assert.throws(() => readTrustedAccounts('{"accounts":["synthetic-secret', people), error => {
    assert.equal((error as Error).message, 'Invalid household credentials file.');
    assert.doesNotMatch((error as Error).message, /synthetic-secret/);
    return true;
  });
  assert.throws(() => readTrustedAccounts('{"accounts":[]}', people), /Invalid household credentials file/);
  assert.throws(() => readTrustedAccounts(file, ['Rowan', 'Rowan', 'Rowan']), /Invalid household credentials file/);
  assert.throws(() => readTrustedAccounts(JSON.stringify({accounts: [...people.map(username => ({username, password: 'synthetic-only'})), {username: 'Unexpected', password: 'extra'}]}), people), /Invalid household credentials file/);
});

const DAY = 24 * 60 * 60 * 1000;
const household = [{ username: 'Rowan', password: 'pw-test' }];
function fakeBabyBuddy() {
  const log: string[] = [];
  const client = {
    login: async (username: string) => { log.push(`login ${username}`); return { username, userId: 7, cookies: new Map(), csrfToken: `bb-${log.length}` }; },
    request: async (session: { csrfToken: string }) => { log.push(`request ${session.csrfToken}`); return null; },
    identity: async (session: { username: string; userId: number }) => ({ id: session.userId, username: session.username }),
    logout: async (session: { csrfToken: string }) => { log.push(`logout ${session.csrfToken}`); },
  };
  return { log, client };
}

test('a sign-in lasts 30 days from its last use', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 1, 12) });
  const store = openStore(':memory:');
  const sessions = createSessionService({ store, babyBuddy: fakeBabyBuddy().client, accounts: household });
  try {
    const { sessionId } = await sessions.select('Rowan', sessions.issueLoginCsrf());
    t.mock.timers.tick(29 * DAY);
    assert.ok(sessions.get(sessionId), 'still signed in on day 29');
    sessions.renew(sessionId);
    t.mock.timers.tick(29 * DAY);
    assert.ok(sessions.get(sessionId), 'still signed in on day 58, 29 days after the last use');
    sessions.renew(sessionId);
    t.mock.timers.tick(30 * DAY - 1);
    assert.ok(sessions.get(sessionId), 'still signed in 1 ms before 30 days after the last use');
    t.mock.timers.tick(1);
    assert.equal(sessions.get(sessionId), null, 'signed out 30 days after the last use');
  } finally { store.close(); }
});

test('only a renewal moves the end of a sign-in', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 1, 12) });
  const store = openStore(':memory:');
  const sessions = createSessionService({ store, babyBuddy: fakeBabyBuddy().client, accounts: household });
  try {
    const { sessionId } = await sessions.select('Rowan', sessions.issueLoginCsrf());
    t.mock.timers.tick(10 * DAY);
    assert.ok(sessions.get(sessionId));
    t.mock.timers.tick(20 * DAY);
    assert.equal(sessions.get(sessionId), null, 'a check without use does not extend the sign-in');
  } finally { store.close(); }
});

test('an idle Baby Buddy login is renewed before Baby Buddy ends it', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 1, 12) });
  const store = openStore(':memory:'), bb = fakeBabyBuddy();
  const sessions = createSessionService({ store, babyBuddy: bb.client, accounts: household });
  try {
    const { sessionId } = await sessions.select('Rowan', sessions.issueLoginCsrf());
    const read = () => sessions.request(sessionId, { resource: 'changes', method: 'GET' });
    for (let i = 0; i < 2; i++) { t.mock.timers.tick(12 * DAY - 1000); sessions.renew(sessionId); await read(); }
    assert.deepEqual(bb.log, ['login Rowan', 'request bb-1', 'request bb-1'], 'a Baby Buddy login used within 12 days is kept');
    t.mock.timers.tick(12 * DAY); sessions.renew(sessionId);
    await read();
    // Baby Buddy 2.11.0 ends a login that is idle for 13 to 14 days, so the gateway signs in again first.
    assert.deepEqual(bb.log.slice(3), ['login Rowan', 'logout bb-1', 'request bb-4']);
  } finally { store.close(); }
});

test('a Baby Buddy login that Baby Buddy ended is replaced', async () => {
  const store = openStore(':memory:'), log: string[] = [];
  let ended = false, refuse = false, profileDown = false;
  const denied = () => Object.assign(new Error('Baby Buddy denied this action.'), { status: 403 });
  const babyBuddy = {
    login: async (username: string) => { log.push(`login ${username}`); return { username, userId: 7, cookies: new Map(), csrfToken: `bb-${log.length}` }; },
    request: async (session: { csrfToken: string }) => {
      log.push(`request ${session.csrfToken}`);
      if (refuse || (ended && session.csrfToken === 'bb-1')) throw denied();
      return null;
    },
    identity: async (session: { username: string; userId: number; csrfToken: string }) => {
      if (ended && session.csrfToken === 'bb-1') throw Object.assign(new Error('Baby Buddy identity check failed'), { status: 403 });
      if (profileDown) throw Object.assign(new Error('Baby Buddy identity check failed'), { status: 503 });
      return { id: session.userId, username: session.username };
    },
    logout: async () => {},
  };
  const sessions = createSessionService({ store, babyBuddy, accounts: household });
  try {
    const { sessionId } = await sessions.select('Rowan', sessions.issueLoginCsrf());
    ended = true; // For example, a password change in Baby Buddy ends its logins.
    await sessions.request(sessionId, { resource: 'changes', method: 'GET' });
    assert.deepEqual(log, ['login Rowan', 'request bb-1', 'login Rowan', 'request bb-3'], 'the gateway signed in again and sent the request once more');
    refuse = true; // A refusal for a login that still works stays a refusal and keeps the login.
    await assert.rejects(sessions.request(sessionId, { resource: 'changes', method: 'POST', body: { child: 1 } }), /denied/);
    assert.deepEqual(log.slice(4), ['request bb-3']);
    profileDown = true; // A profile check that fails with a server error says nothing about the login, so it is kept.
    await assert.rejects(sessions.request(sessionId, { resource: 'changes', method: 'GET' }), /denied/);
    assert.deepEqual(log.slice(5), ['request bb-3'], 'no new Baby Buddy login');
  } finally { store.close(); }
});

test('a care identity check counts as use of the Baby Buddy login', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 1, 12) });
  const store = openStore(':memory:');
  const sessions = createSessionService({ store, babyBuddy: fakeBabyBuddy().client, accounts: household });
  try {
    await sessions.select('Rowan', sessions.issueLoginCsrf());
    t.mock.timers.tick(11 * DAY);
    assert.equal((await sessions.identityForUser(7)).id, 7);
    t.mock.timers.tick(2 * DAY);
    assert.equal((await sessions.identityForUser(7)).id, 7, 'the check 2 days ago reached Baby Buddy, so the login is still in use');
  } finally { store.close(); }
});

test('a refused Baby Buddy password ends the sign-in instead of trying again on every poll', async () => {
  const store = openStore(':memory:'), log: string[] = [];
  let refused = false;
  const babyBuddy = {
    login: async (username: string) => {
      log.push(`login ${username}`);
      if (refused) throw Object.assign(new Error('Baby Buddy login failed'), { rejected: true });
      return { username, userId: 7, cookies: new Map(), csrfToken: `bb-${log.length}` };
    },
    request: async (session: { csrfToken: string }) => { log.push(`request ${session.csrfToken}`); return null; },
    identity: async (session: { username: string; userId: number }) => ({ id: session.userId, username: session.username }),
    logout: async () => {},
  };
  const first = createSessionService({ store, babyBuddy, accounts: household });
  const { sessionId } = await first.select('Rowan', first.issueLoginCsrf());
  refused = true; // For example, a password change in Baby Buddy that the gateway's stored account does not have yet.
  const restarted = createSessionService({ store, babyBuddy, accounts: household });
  try {
    const read = () => restarted.request(sessionId, { resource: 'changes', method: 'GET' });
    await assert.rejects(read(), /Session expired/);
    await assert.rejects(read(), /Session expired/);
    assert.equal(restarted.get(sessionId), null, 'the sign-in ended, so the phone shows the name picker');
    assert.deepEqual(log, ['login Rowan', 'login Rowan'], 'the refused password was tried once, not on every poll');
  } finally { store.close(); }
});

test('injected now clock governs login CSRF, session expiry, renewal, and identityForUser regardless of wall clock', async () => {
  let clock = Date.UTC(2020, 0, 1, 12);
  const store = openStore(':memory:');
  const bb = fakeBabyBuddy();
  const sessions = createSessionService({ store, babyBuddy: bb.client, accounts: household, now: () => clock });
  try {
    const expiredCsrf = sessions.issueLoginCsrf();
    clock += 10 * 60 * 1000;
    await assert.rejects(sessions.select('Rowan', expiredCsrf), /Invalid CSRF token/);

    const { sessionId } = await sessions.select('Rowan', sessions.issueLoginCsrf());
    assert.equal(store.getSession(sessionId)!.expiresAt, clock + 30 * DAY, 'login expiresAt uses injected clock');
    assert.ok(sessions.get(sessionId), 'session under a past injected clock stays live');

    // Before renew() or identityForUser(), advancing 12 days must trigger upstream re-login (proves login usedAt used injected clock).
    clock += 12 * DAY;
    await sessions.request(sessionId, { resource: 'changes', method: 'GET' });
    assert.deepEqual(bb.log, ['login Rowan', 'login Rowan', 'logout bb-1', 'request bb-2'], 'login usedAt and upstream idle timeout use injected clock');
    assert.equal((await sessions.identityForUser(7)).id, 7);

    sessions.renew(sessionId);
    assert.equal(store.getSession(sessionId)!.expiresAt, clock + 30 * DAY, 'renew expiresAt uses injected clock');
    clock += 30 * DAY;
    assert.equal(sessions.get(sessionId), null, 'session expires at 30 days on injected clock');
  } finally { store.close(); }
});
