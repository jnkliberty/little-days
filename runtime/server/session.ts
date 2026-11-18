import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { BabyBuddyIdentity, BabyBuddyRequest, BabyBuddySession } from './babybuddy.ts';
import type { Store } from './store.ts';
import { hashSecret } from './store.ts';
import { passcodeIsSet, verifyPasscode } from './passcode.ts';
type BabyBuddyClient = {
  login(username: string, password: string): Promise<BabyBuddySession>;
  request(session: BabyBuddySession, request: BabyBuddyRequest): Promise<unknown>;
  identity(session: BabyBuddySession): Promise<BabyBuddyIdentity>;
  logout(session: BabyBuddySession): Promise<void>;
};

// A sign-in's Baby Buddy login. Memory only: after a restart the gateway signs in to Baby Buddy again.
type Upstream = { session: BabyBuddySession; usedAt: number };
type PublicSession = { sessionId: string; csrfToken: string; adult: string };
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 30 * DAY_MS;
// Baby Buddy 2.11.0 ends a login 14 days after its last daily refresh (Django SESSION_COOKIE_AGE and its
// RollingSessionMiddleware), so a login idle for 13 days can be gone. The gateway signs in again before that.
const UPSTREAM_IDLE_MS = 12 * DAY_MS;
const LOGIN_CSRF_TTL_MS = 10 * 60 * 1000;

function validCredential(account: unknown): account is {username: string; password: string} {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return false;
  const {username, password} = account as {username?: unknown; password?: unknown};
  return typeof username === 'string' && username.length > 0 && username.length <= 150 && typeof password === 'string' && password.length > 0 && password.length <= 256
    && Object.keys(account).every(key => key === 'username' || key === 'password');
}

// The file holds one credential for each adult in the household, and no one else.
export function trustedAccounts(value: unknown, people: unknown): {username: string; password: string}[] {
  const accounts = value && typeof value === 'object' && !Array.isArray(value) ? (value as {accounts?: unknown}).accounts : null;
  if (!Array.isArray(accounts) || accounts.length < 1 || !Array.isArray(people) || people.length !== accounts.length || people.some(person => typeof person !== 'string') || new Set(people).size !== people.length) throw new Error('Invalid household credentials file.');
  if (!accounts.every(validCredential) || new Set(accounts.map(account => account.username)).size !== accounts.length) throw new Error('Invalid household credentials file.');
  if (people.some(person => !accounts.some(account => account.username === person))) throw new Error('Invalid household credentials file.');
  return accounts;
}

export function readTrustedAccounts(contents: string, people: unknown): {username: string; password: string}[] {
  try { return trustedAccounts(JSON.parse(contents), people); }
  catch { throw new Error('Invalid household credentials file.'); }
}

function equalDigest(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionService({ store, babyBuddy, accounts = [], ttlMs = DEFAULT_TTL_MS }: { store: Store; babyBuddy: BabyBuddyClient; accounts?: {username: string; password: string}[]; ttlMs?: number }) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000) throw new Error('Invalid session lifetime');
  // Memory only, keyed by the session ID hash, so a restart loses both. The store keeps only hashes.
  const upstreams = new Map<string, Upstream>();
  const csrfTokens = new Map<string, string>();
  const loginCsrf = new Map<string, number>();
  const configuredPeople = accounts.map(account => account.username);

  function forget(key: string): Upstream | undefined {
    const current = upstreams.get(key);
    upstreams.delete(key);
    csrfTokens.delete(key);
    return current;
  }

  function pruneLoginCsrf(now = Date.now()): void {
    for (const [token, expiresAt] of loginCsrf) if (expiresAt <= now) loginCsrf.delete(token);
  }

  function issueLoginCsrf(): string {
    pruneLoginCsrf();
    const token = randomBytes(32).toString('base64url');
    loginCsrf.set(hashSecret(token), Date.now() + LOGIN_CSRF_TTL_MS);
    return token;
  }

  async function login(username: string, password: string, token: string): Promise<PublicSession> {
    pruneLoginCsrf();
    const tokenHash = hashSecret(token);
    const expiry = loginCsrf.get(tokenHash);
    if (!expiry || expiry <= Date.now()) throw new Error('Invalid CSRF token');
    loginCsrf.delete(tokenHash);
    let upstream: BabyBuddySession;
    try { upstream = await babyBuddy.login(username, password); }
    catch (error) { throw Object.assign(new Error('Baby Buddy login failed'), { locked: (error as {locked?: boolean})?.locked === true }); }
    const sessionId = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const adult = upstream.username;
    const expiresAt = Date.now() + ttlMs;
    try {
      store.createSession({ sessionId, csrfToken, adult, babyBuddyUserId: upstream.userId, expiresAt });
      const key = hashSecret(sessionId);
      upstreams.set(key, { session: upstream, usedAt: Date.now() });
      csrfTokens.set(key, csrfToken);
    } catch {
      await babyBuddy.logout(upstream);
      throw new Error('Unable to create app session');
    }
    return { sessionId, csrfToken, adult };
  }

  async function select(username: string, token: string, currentSessionId = ''): Promise<PublicSession> {
    const account = accounts.find(item => item.username === username);
    if (!account) throw new Error('Unknown household member');
    const old = currentSessionId ? requireCsrf(currentSessionId, token) : null;
    const session = await login(account.username, account.password, old ? issueLoginCsrf() : token);
    if (old) {
      const current = forget(hashSecret(currentSessionId));
      store.deleteSession(currentSessionId);
      if (current) await babyBuddy.logout(current.session).catch(() => {});
    }
    return session;
  }

  function get(sessionId: string): PublicSession | null {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(sessionId)) return null;
    const record = store.getSession(sessionId);
    const key = hashSecret(sessionId);
    if (!record || record.expiresAt <= Date.now()) {
      forget(key);
      store.deleteSession(sessionId);
      return null;
    }
    // After a restart the plain CSRF token is unknown ('') until csrfFor() makes a new one.
    return { sessionId, csrfToken: csrfTokens.get(key) ?? '', adult: record.adult };
  }

  // Each API request with a valid sign-in is use (app.ts), so the sign-in ends 30 days after its last use.
  function renew(sessionId: string): void {
    store.renewSession(sessionId, Date.now() + ttlMs);
  }

  // For GET /api/session. After a restart, the phone that loads the app again gets a new token; its hash replaces the old one.
  function csrfFor(session: PublicSession): string {
    if (session.csrfToken) return session.csrfToken;
    const token = randomBytes(32).toString('base64url');
    store.setSessionCsrf(session.sessionId, token);
    csrfTokens.set(hashSecret(session.sessionId), token);
    return token;
  }

  function requireCsrf(sessionId: string, token: string): PublicSession {
    const session = get(sessionId);
    const record = session && store.getSession(sessionId);
    // Only the stored hash is compared, so a phone keeps its token across gateway restarts.
    if (!session || !record || !token || !equalDigest(hashSecret(token), record.csrfHash)) {
      throw new Error('Invalid CSRF token');
    }
    return session;
  }

  // The cached Baby Buddy login, or a new one with the stored household account after a restart or 12 idle days.
  async function upstreamFor(sessionId: string): Promise<BabyBuddySession> {
    const record = get(sessionId) && store.getSession(sessionId);
    if (!record) throw new Error('Session expired');
    const key = hashSecret(sessionId), current = upstreams.get(key), now = Date.now();
    if (current && now - current.usedAt < UPSTREAM_IDLE_MS) {
      current.usedAt = now;
      return current.session;
    }
    const account = accounts.find(item => item.username === record.adult);
    if (!account) throw new Error('Session expired');
    const upstream = await babyBuddy.login(account.username, account.password).catch((error: { rejected?: boolean; locked?: boolean }) => {
      // Baby Buddy refused the stored password or locked the account. End this sign-in, so the phone shows the name
      // picker and no automatic login tries the refused password again on every poll (django-axes counts each one).
      if (error?.rejected || error?.locked) { forget(key); store.deleteSession(sessionId); throw new Error('Session expired'); }
      throw error;
    });
    // Another Baby Buddy user under the same name, or a sign-out during the login, gets no login.
    const same = upstream.userId === record.babyBuddyUserId && upstream.username === record.adult;
    if (!same || !store.getSession(sessionId)) {
      await babyBuddy.logout(upstream).catch(() => {});
      throw new Error(same ? 'Session expired' : 'Baby Buddy identity changed');
    }
    upstreams.set(key, { session: upstream, usedAt: now });
    if (current) void babyBuddy.logout(current.session).catch(() => {});
    return upstream;
  }

  // Baby Buddy's profile answers 401, 403 or a redirect to its login page for a login that it has ended.
  // A timeout or a server error says nothing about the login.
  async function loginEnded(upstream: BabyBuddySession): Promise<boolean> {
    try { await babyBuddy.identity(upstream); return false; }
    catch (error) { const status = Number((error as { status?: number })?.status) || 0; return status === 401 || status === 403 || (status >= 300 && status < 400); }
  }

  async function request(sessionId: string, request: BabyBuddyRequest): Promise<unknown> {
    // CSRF is checked where phone writes enter (app.ts). Callers pass the server's own copy, which a restart loses,
    // and GET polls that finish a save also write, so the copy is not checked a second time here.
    const upstream = await upstreamFor(sessionId);
    try { return await babyBuddy.request(upstream, request); }
    catch (error) {
      // Baby Buddy answers 403 for a login that it ended itself (a password change, a cleared session table). When its
      // profile check says the same, sign in again and send the request once more: Baby Buddy applied nothing it refused.
      // A refusal for a login that still works, or a profile check that fails for another reason, stays a refusal.
      if ((error as { status?: number })?.status !== 403 || !(await loginEnded(upstream))) throw error;
      const key = hashSecret(sessionId);
      if (upstreams.get(key)?.session === upstream) upstreams.delete(key);
      return babyBuddy.request(await upstreamFor(sessionId), request);
    }
  }

  async function identity(sessionId: string): Promise<BabyBuddyIdentity> {
    const upstream = await upstreamFor(sessionId), record = store.getSession(sessionId);
    const identity = await babyBuddy.identity(upstream);
    if (!record || identity.id !== record.babyBuddyUserId || identity.username !== record.adult) throw new Error('Baby Buddy identity changed');
    return identity;
  }

  async function identityForUser(userId: number): Promise<BabyBuddyIdentity> {
    for (const key of store.liveSessionHashesForUser(userId)) {
      const current = upstreams.get(key);
      // Only a cached login that Baby Buddy still keeps; after a restart the parent's next request makes a new one.
      if (!current || Date.now() - current.usedAt >= UPSTREAM_IDLE_MS) continue;
      const identity = await babyBuddy.identity(current.session);
      // The check reached Baby Buddy, which refreshes its login on use, so it counts as use.
      if (identity.id === userId) { current.usedAt = Date.now(); return identity; }
    }
    throw new Error('Baby Buddy identity check failed');
  }

  async function logout(sessionId: string, csrfToken: string): Promise<void> {
    requireCsrf(sessionId, csrfToken);
    const current = forget(hashSecret(sessionId));
    store.deleteSession(sessionId);
    if (current) await babyBuddy.logout(current.session);
  }

  // Display names for the adults that have a label (the household file); the saved data keeps the account names.
  function labels(): Record<string, string | { en: string; es?: string }> {
    const saved = store.getSetting('app', 'labels');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? Object.fromEntries(Object.entries(saved).filter(([name]) => configuredPeople.includes(name))) as Record<string, string | { en: string; es?: string }> : {};
  }

  return { issueLoginCsrf, login, select, passcodeSet: () => passcodeIsSet(store), checkPasscode: (passcode: unknown) => verifyPasscode(store, passcode), people: () => [...configuredPeople], labels, get, renew, csrfFor, request, identity, identityForUser, requireCsrf, logout };
}

export type SessionService = ReturnType<typeof createSessionService>;
