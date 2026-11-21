import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { HttpError, clientAddress, errorBody, cookie, json, jsonBody, logServerError, passcodeLimits, staticFile } from './http.ts';
import type { createSessionService } from './session.ts';
import { getZone } from './zone.ts';

type Sessions = ReturnType<typeof createSessionService>;
export type Session = NonNullable<ReturnType<Sessions['get']>>;
export type DomainHandler = (req: IncomingMessage, res: ServerResponse, url: URL, session: Session) => Promise<void>;
type Options = {sessions: Sessions; origin: string; webDir: string; domain: DomainHandler; integration: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>; careLink?: boolean; ai?: boolean; now?: () => number; trustProxy?: boolean; passcodeOff?: boolean};
const COOKIE = '__Host-little-days';
// A sign-in lasts 30 days from its last use, so the cookie is sent again with each signed-in API reply.
const MAX_AGE = 30 * 24 * 60 * 60;
const sessionCookie = (value: string, age: number) => `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;

function token(req: IncomingMessage): string { return String(req.headers['x-csrf-token'] || ''); }
function requireOrigin(req: IncomingMessage, origin: string) {
  if (req.headers.origin !== origin) throw new HttpError(403, 'This request is not from the app.');
}

type Limits = ReturnType<typeof passcodeLimits>;

// The household passcode is checked on the server each time. The count is for wrong passcodes only, by address and for the whole install.
// An install whose owner turned the passcode off (LITTLE_DAYS_PASSCODE=off) asks for none: its network is the guard.
const passcodeOn = (opts: Options) => opts.passcodeOff !== true;
async function requirePasscode(req: IncomingMessage, opts: Options, limits: Limits, passcode: unknown) {
  if (!passcodeOn(opts)) return;
  if (!opts.sessions.passcodeSet()) throw new HttpError(503, 'This app has no passcode yet. Ask the person who set it up.');
  const attempt = limits(clientAddress(req, opts.trustProxy === true));
  if (!await opts.sessions.checkPasscode(passcode)) throw new HttpError(401, 'That passcode is not right.');
  attempt.correct();
}

async function passcodeRoute(req: IncomingMessage, res: ServerResponse, opts: Options, limits: Limits) {
  if (req.method !== 'POST') throw new HttpError(405, 'This action is not available.');
  const data = await jsonBody(req);
  if (Object.keys(data).some(key => key !== 'passcode')) throw new HttpError(400, 'Enter the household passcode.');
  await requirePasscode(req, opts, limits, data.passcode);
  return json(res, 200, {people: opts.sessions.people(), labels: opts.sessions.labels()});
}

async function sessionRoute(req: IncomingMessage, res: ServerResponse, opts: Options, limits: Limits) {
  const id = cookie(req, COOKIE);
  if (req.method === 'GET') {
    // Without a passcode no sign-in counts, including one that was made before the passcode existed.
    const set = opts.sessions.passcodeSet(), session = set || !passcodeOn(opts) ? opts.sessions.get(id) : null;
    // With the passcode off, the names come with the session reply, so the phone opens straight to the name picker.
    const names = passcodeOn(opts) ? {} : {people: opts.sessions.people(), labels: opts.sessions.labels(), passcodeOff: true};
    if (!session) return json(res, 200, {me: null, csrf: opts.sessions.issueLoginCsrf(), passcode: passcodeOn(opts) && set, ...names, tz: getZone(), careLink: opts.careLink === true, ai: opts.ai === true});
    opts.sessions.renew(session.sessionId);
    return json(res, 200, {me: session.adult, csrf: opts.sessions.csrfFor(session), people: opts.sessions.people(), labels: opts.sessions.labels(), ...(passcodeOn(opts) ? {} : {passcodeOff: true}), tz: getZone(), careLink: opts.careLink === true, ai: opts.ai === true}, {'set-cookie': sessionCookie(session.sessionId, MAX_AGE)});
  }
  if (req.method === 'POST') {
    const data = await jsonBody(req);
    if (typeof data.username !== 'string' || data.username.length > 150 || Object.keys(data).some(key => key !== 'username' && key !== 'passcode')) throw new HttpError(400, 'Choose a household member.');
    // A device that is signed in switches adults with its session. Any other device needs the passcode again.
    const signedIn = opts.sessions.get(id) !== null;
    if (!signedIn) await requirePasscode(req, opts, limits, data.passcode);
    let session: Session;
    try { session = await opts.sessions.select(data.username, token(req), signedIn ? id : ''); }
    catch (error) {
      if ((error as {locked?: boolean})?.locked) throw new HttpError(429, 'This account is locked after too many wrong passwords. Try again in 1 hour, or ask an owner of this household to unlock it.');
      throw new HttpError(401, 'Selection failed. Choose a household member.');
    }
    return json(res, 200, {me: session.adult, csrf: session.csrfToken}, {'set-cookie': sessionCookie(session.sessionId, MAX_AGE)});
  }
  if (req.method === 'DELETE') {
    try { await opts.sessions.logout(id, token(req)); }
    catch { throw new HttpError(401, 'Sign in again.'); }
    return json(res, 200, {me: null, csrf: opts.sessions.issueLoginCsrf()}, {'set-cookie': sessionCookie('', 0)});
  }
  throw new HttpError(405, 'This action is not available.');
}

export function createApp(opts: Options) {
  const origin = new URL(opts.origin).origin;
  const limits = passcodeLimits({now: opts.now ?? Date.now});
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', origin);
      if (url.origin !== origin) throw new HttpError(400, 'Invalid request address.');
      if (url.pathname === '/api/integration/v1/care') return await opts.integration(req, res, url);
      if (!['GET', 'HEAD'].includes(req.method || '')) requireOrigin(req, origin);
      if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, {status: 'ok'});
      // The page asks GET /api/session whether a passcode exists. Every other API route waits for one.
      if (url.pathname.startsWith('/api/') && passcodeOn(opts) && !opts.sessions.passcodeSet() && !(url.pathname === '/api/session' && req.method === 'GET')) throw new HttpError(503, 'This app has no passcode yet. Ask the person who set it up.');
      if (url.pathname === '/api/session') return await sessionRoute(req, res, opts, limits);
      if (url.pathname === '/api/session/passcode') return await passcodeRoute(req, res, opts, limits);
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') throw new HttpError(405, 'This action is not available.');
        return await staticFile(req, res, opts.webDir, url.pathname);
      }
      const session = opts.sessions.get(cookie(req, COOKIE));
      if (!session) throw new HttpError(401, 'Sign in to continue.');
      if (req.method !== 'GET') {
        try { opts.sessions.requireCsrf(session.sessionId, token(req)); }
        catch { throw new HttpError(403, 'Reload the app before trying again.'); }
      }
      opts.sessions.renew(session.sessionId);
      res.setHeader('set-cookie', sessionCookie(session.sessionId, MAX_AGE));
      await opts.domain(req, res, url, session);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const status = error instanceof HttpError ? error.status : 502;
      if (status >= 500) logServerError(req, status, error);
      json(res, status, errorBody(error));
    }
  });
}
