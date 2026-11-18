import { HttpError } from './http.ts';

const RESOURCES = {
  children: { path: 'children', methods: ['GET', 'POST', 'PATCH'] },
  feedings: { path: 'feedings', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  pumping: { path: 'pumping', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  changes: { path: 'changes', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  sleep: { path: 'sleep', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  medication: { path: 'medication', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  notes: { path: 'notes', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  timers: { path: 'timers', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  weight: { path: 'weight', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  height: { path: 'height', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  'head-circumference': { path: 'head-circumference', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  temperature: { path: 'temperature', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  'tummy-times': { path: 'tummy-times', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
} as const;

type Resource = keyof typeof RESOURCES;
type CookieJar = Map<string, string>;
export type BabyBuddySession = { cookies: CookieJar; csrfToken: string; userId: number; username: string };
export type BabyBuddyRequest = { resource: string; method: string; id?: string | number; query?: Record<string, string | number>; body?: unknown };
export type BabyBuddyIdentity = { id: number; username: string };

const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
// A photo form carries one file of up to 25 MB (photos.ts LIMIT) plus its small text fields.
const MAX_FORM_BYTES = 26 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const COMMON_QUERY_KEYS = ['child', 'limit', 'offset', 'ordering'];
const QUERY_KEYS: Record<Resource, Set<string>> = {
  children: new Set(['id', 'slug', 'first_name', 'last_name', 'birth_date', 'birth_time', 'limit', 'offset', 'ordering']),
  feedings: new Set([...COMMON_QUERY_KEYS, 'start', 'start_min', 'start_max', 'end', 'end_min', 'end_max', 'type', 'method']),
  pumping: new Set([...COMMON_QUERY_KEYS, 'start', 'start_min', 'start_max', 'end', 'end_min', 'end_max']),
  changes: new Set([...COMMON_QUERY_KEYS, 'date', 'date_min', 'date_max', 'wet', 'solid', 'color', 'amount']),
  sleep: new Set([...COMMON_QUERY_KEYS, 'start', 'start_min', 'start_max', 'end', 'end_min', 'end_max']),
  medication: new Set([...COMMON_QUERY_KEYS, 'date', 'date_min', 'date_max', 'name', 'dosage_unit']),
  notes: new Set([...COMMON_QUERY_KEYS, 'date', 'date_min', 'date_max']),
  timers: new Set([...COMMON_QUERY_KEYS, 'start', 'start_min', 'start_max', 'end', 'end_min', 'end_max', 'name', 'user']),
  weight: new Set([...COMMON_QUERY_KEYS, 'date']),
  height: new Set([...COMMON_QUERY_KEYS, 'date']),
  'head-circumference': new Set([...COMMON_QUERY_KEYS, 'date']),
  temperature: new Set([...COMMON_QUERY_KEYS, 'date', 'date_min', 'date_max']),
  'tummy-times': new Set([...COMMON_QUERY_KEYS, 'start', 'start_min', 'start_max', 'end', 'end_min', 'end_max']),
};

function allowed(resource: string, method: string): resource is Resource {
  return Object.hasOwn(RESOURCES, resource) && (RESOURCES[resource as Resource].methods as readonly string[]).includes(method);
}

function applyCookies(jar: CookieJar, response: Response): void {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';', 1)[0];
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Baby Buddy response too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))));
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { throw new Error('Invalid Baby Buddy response'); }
}

function safeStatus(status: number, body: string): HttpError & { code?: string } {
  const message = status === 403 ? 'Baby Buddy denied this action.' : status === 400 ? 'Baby Buddy rejected this entry.' : 'Baby Buddy request failed.';
  const error = new HttpError(status, message) as HttpError & { code?: string };
  if (status === 400 && body.includes('Another entry intersects the specified time period.')) error.code = 'period_intersection';
  return error;
}

function buildPath(request: BabyBuddyRequest): string {
  const method = request.method.toUpperCase();
  if (!allowed(request.resource, method)) throw new Error('Baby Buddy resource or method is not allowed');
  // Child slugs keep accented and non-Latin letters (for example "sofía"); no slash or dot can pass, and the id is URL-encoded below.
  if (request.id != null && !/^[\p{L}\p{N}_-]{1,100}$/u.test(String(request.id))) throw new Error('Invalid Baby Buddy record id');
  const query = new URLSearchParams();
  const queryKeys = QUERY_KEYS[request.resource as Resource];
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (!queryKeys.has(key) || String(value).length > 120) throw new Error('Baby Buddy query is not allowed');
    query.set(key, String(value));
  }
  const resource = RESOURCES[request.resource as Resource];
  const suffix = request.id == null ? '' : `${encodeURIComponent(String(request.id))}/`;
  return `/api/${resource.path}/${suffix}${query.size ? `?${query}` : ''}`;
}

function buildBody(request: BabyBuddyRequest, root: string, session: BabyBuddySession, headers: Record<string, string>): BodyInit | undefined {
  const method = request.method.toUpperCase();
  if (request.body === undefined || method === 'GET' || method === 'DELETE') return undefined;
  const outgoing = request.body;
  let body: BodyInit;
  if (outgoing instanceof FormData) {
    const form = new FormData();
    let size = 0;
    for (const [key, value] of outgoing.entries()) {
      if (key === 'timer' || key === 'tags') throw new Error('Baby Buddy request contains a blocked field');
      if (request.resource === 'timers' && key === 'user') continue;
      size += typeof value === 'string' ? Buffer.byteLength(value) : value.size;
      if (size > MAX_FORM_BYTES) throw new Error('Baby Buddy request too large');
      form.append(key, value);
    }
    if (request.resource === 'timers' && method === 'POST') form.set('user', String(session.userId));
    body = form;
  } else {
    if (!outgoing || typeof outgoing !== 'object' || Array.isArray(outgoing)) throw new Error('Invalid Baby Buddy request body');
    const clean = { ...(outgoing as Record<string, unknown>) };
    if (request.resource === 'timers') {
      delete clean.user;
      if (method === 'POST') clean.user = session.userId;
    }
    if ('timer' in clean || 'tags' in clean) throw new Error('Baby Buddy request contains a blocked field');
    const json = JSON.stringify(clean);
    if (Buffer.byteLength(json) > MAX_REQUEST_BYTES) throw new Error('Baby Buddy request too large');
    headers['content-type'] = 'application/json';
    body = json;
  }
  headers['x-csrftoken'] = session.csrfToken;
  headers.referer = `${root}/`;
  return body;
}

export function createBabyBuddyClient({ baseUrl, fetchImpl = fetch }: { baseUrl: string; fetchImpl?: typeof fetch }) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid Baby Buddy base URL');
  const root = base.href.replace(/\/$/, '');

  async function upstream(path: string, init: RequestInit, jar: CookieJar): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookies = cookieHeader(jar);
    if (cookies) headers.set('cookie', cookies);
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new Error('Baby Buddy is unavailable');
    }
    applyCookies(jar, response);
    return response;
  }

  return {
    async login(username: string, password: string): Promise<BabyBuddySession> {
      if (!username.trim() || username.length > 150 || !password || password.length > 256) throw new Error('Invalid login');
      const cookies: CookieJar = new Map();
      const page = await upstream('/login/', { method: 'GET', redirect: 'manual' }, cookies);
      if (!page.ok) throw new Error('Baby Buddy login failed');
      const html = await readBounded(page, 64 * 1024);
      const hiddenToken = html.match(/name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i)?.[1]
        ?? html.match(/value=["']([^"']+)["'][^>]*name=["']csrfmiddlewaretoken["']/i)?.[1];
      const csrfToken = cookies.get('csrftoken') ?? hiddenToken;
      if (!csrfToken) throw new Error('Baby Buddy login failed');
      const form = new URLSearchParams({ username, password, csrfmiddlewaretoken: hiddenToken ?? csrfToken });
      const login = await upstream('/login/', {
        method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrftoken': csrfToken, referer: `${root}/login/` },
        body: form.toString(),
      }, cookies);
      // Baby Buddy (django-axes) answers 429 once an account is locked after repeated wrong passwords.
      if (login.status === 429) throw Object.assign(new Error('Baby Buddy account locked'), { locked: true });
      if (![200, 302, 303].includes(login.status)) throw new Error('Baby Buddy login failed');
      await readBounded(login, 64 * 1024);

      // Baby Buddy's profile also contains an API key; retain only its identity fields.
      const profile = await upstream('/api/profile', { method: 'GET' }, cookies);
      // A login form that comes back (200) and a profile that refuses the new cookies mean Baby Buddy refused the password.
      if (!profile.ok) throw Object.assign(new Error('Baby Buddy login failed'), { rejected: login.status === 200 && (profile.status === 401 || profile.status === 403) });
      const data = parseJson(await readBounded(profile, 64 * 1024)) as { user?: { id?: unknown; username?: unknown } } | null;
      const userId = data?.user?.id;
      const canonicalUsername = data?.user?.username;
      if (!Number.isSafeInteger(userId) || Number(userId) < 1 || typeof canonicalUsername !== 'string' || canonicalUsername !== username) {
        throw new Error('Baby Buddy login failed');
      }
      return { cookies, csrfToken: cookies.get('csrftoken') ?? csrfToken, userId: Number(userId), username: canonicalUsername };
    },
    async request(session: BabyBuddySession, request: BabyBuddyRequest): Promise<unknown> {
      const method = request.method.toUpperCase();
      const headers: Record<string, string> = { accept: 'application/json' };
      const path = buildPath(request);
      const body = buildBody(request, root, session, headers);
      if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
        headers['x-csrftoken'] = session.csrfToken;
        headers.referer = `${root}/`;
      }
      const response = await upstream(path, { method, headers, body }, session.cookies);
      const text = await readBounded(response, MAX_RESPONSE_BYTES);
      if (!response.ok) throw safeStatus(response.status, text);
      return parseJson(text);
    },
    async identity(session: BabyBuddySession): Promise<BabyBuddyIdentity> {
      const response = await upstream('/api/profile', { method: 'GET', redirect: 'manual', headers: { accept: 'application/json' } }, session.cookies);
      if (!response.ok || response.status >= 300) throw Object.assign(new Error('Baby Buddy identity check failed'), { status: response.status });
      const profile = parseJson(await readBounded(response, 64 * 1024)) as { user?: { id?: unknown; username?: unknown } } | null;
      const id = profile?.user?.id, username = profile?.user?.username;
      if (!Number.isSafeInteger(id) || Number(id) < 1 || typeof username !== 'string' || !username || username.length > 150) throw new Error('Baby Buddy identity check failed');
      return { id: Number(id), username };
    },
    async logout(session: BabyBuddySession): Promise<void> {
      const form = new URLSearchParams({ csrfmiddlewaretoken: session.csrfToken });
      try {
        const response = await upstream('/logout/', { method: 'POST', redirect: 'manual', headers: {
          'content-type': 'application/x-www-form-urlencoded', 'x-csrftoken': session.csrfToken, referer: `${root}/`,
        }, body: form.toString() }, session.cookies);
        await readBounded(response, 64 * 1024);
      } catch {
        // Local logout still removes the app session when Baby Buddy cannot be reached.
      }
    },
  };
}
