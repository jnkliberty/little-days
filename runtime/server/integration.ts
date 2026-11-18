import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, json } from './http.ts';
import type { createCare } from './care.ts';
import type { SessionService } from './session.ts';

type Care = ReturnType<typeof createCare>;
type Sessions = Pick<SessionService, 'identityForUser'>;

function authorized(header: string | undefined, token: string | undefined): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7)), expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const SUBJECT = /^[A-Za-z0-9._:-]{1,128}$/;

// The link settings are present when the service token, the subject, and the Baby Buddy account are all set and valid.
// The session sends this one flag, so the browser shows the care-hours screens only when it is true.
export function careLinkConfigured({ token, subjectId, userId }: { token?: string; subjectId?: string; userId?: number }): boolean {
  return Boolean(token) && typeof subjectId === 'string' && SUBJECT.test(subjectId) && Number.isSafeInteger(userId) && Number(userId) >= 1;
}

export function createCareIntegration({ care, sessions, token, subjectId, userId }: { care: Care; sessions: Sessions; token?: string; subjectId?: string; userId?: number }) {
  const attempts = new Map<string, { count: number; until: number }>();
  function limit(key: string): void {
    const now = Date.now();
    for (const [address, entry] of attempts) if (entry.until <= now) attempts.delete(address);
    const current = attempts.get(key) || { count: 0, until: now + 60_000 };
    if (current.count >= 60 || attempts.size >= 1000) throw new HttpError(429, 'Too many service requests. Try again shortly.');
    current.count++; attempts.set(key, current);
  }
  return async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (req.method !== 'GET') throw new HttpError(405, 'This action is not available.');
    if (!authorized(req.headers.authorization, token)) throw new HttpError(401, 'Service authorization failed.');
    if (req.headers['content-length'] && req.headers['content-length'] !== '0' || req.headers['transfer-encoding']) throw new HttpError(400, 'This request cannot include a body.');
    if ([...url.searchParams.keys()].some(key => !['from', 'to'].includes(key)) || url.searchParams.getAll('from').length !== 1 || url.searchParams.getAll('to').length !== 1) throw new HttpError(400, 'Use one UTC start and end time.');
    limit(`care:${req.socket.remoteAddress || 'unknown'}`);
    if (!careLinkConfigured({ token, subjectId, userId })) throw new HttpError(503, 'Care sharing is unavailable.');
    try {
      const identity = await sessions.identityForUser(userId);
      if (identity.id !== userId) throw new Error('Account identity mismatch');
      return json(res, 200, care.export(url.searchParams.get('from')!, url.searchParams.get('to')!, { subjectId, userId }));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, 'Care sharing is unavailable.');
    }
  };
}
