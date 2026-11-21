import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export class HttpError extends Error {
  status: number;
  // Extra reply fields for the browser, such as the saved sleeps that a new sleep overlaps.
  details?: Record<string, unknown>;
  constructor(status: number, message: string, details?: Record<string, unknown>) { super(message); this.status = status; if (details) this.details = details; }
}

// The JSON body of an error reply. Only an HttpError shows its message and details; any other error stays generic.
export function errorBody(error: unknown): Record<string, unknown> {
  if (!(error instanceof HttpError)) return { error: 'The service could not complete this request. Try again.' };
  return { error: error.message, ...(error.details ?? {}) };
}

export function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', ...headers,
  });
  res.end(JSON.stringify(value));
}

// One stderr line for a 5xx reply: method, path without query, status, error name. Never the body, query, message, or tokens.
// Each UUID in the path becomes :id, so no log line holds a cry id or an operation id.
export function logServerError(req: IncomingMessage, status: number, error: unknown) {
  const path = (req.url || '').split(/[?#]/)[0].replace(/[^\x21-\x7e]/g, '?').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').slice(0, 200);
  const name = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`${req.method} ${path} ${status} ${name}\n`);
}

export function etagMatches(header: string | undefined, etag: string): boolean {
  return (header || '').split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
}

export function cookie(req: IncomingMessage, name: string): string {
  const values = (req.headers.cookie || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
  if (values.length !== 1) return '';
  return values[0].slice(name.length + 1);
}

export async function body(req: IncomingMessage, maxBytes = 64 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw new HttpError(413, 'This upload is too large.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Use a JSON request.');
  try {
    const value = JSON.parse((await body(req)).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The request is not valid JSON.');
  }
}

// The address a request comes from. Behind a trusted reverse proxy, the last X-Forwarded-For entry is the one the proxy added.
export function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',').pop()?.trim() : '';
  return forwarded || req.socket.remoteAddress || 'unknown';
}

// Wrong passcodes are counted for each address and for the whole install. No typed name is counted.
// A try counts from the moment it starts, so many tries at once cannot pass the limit; a correct passcode gives its count back.
export function passcodeLimits({now, perAddress = 10, install = 100, windowMs = 15 * 60_000}: {now: () => number; perAddress?: number; install?: number; windowMs?: number}) {
  type Window = {count: number; until: number};
  const addresses = new Map<string, Window>();
  let whole: Window = {count: 0, until: 0};
  const open = (map: Map<string, Window> | null, key: string, at: number): Window => {
    if (!map) { if (whole.until <= at) whole = {count: 0, until: at + windowMs}; return whole; }
    let window = map.get(key);
    if (!window || window.until <= at) { window = {count: 0, until: at + windowMs}; map.set(key, window); }
    return window;
  };
  return (address: string) => {
    const at = now();
    for (const [key, window] of addresses) if (window.until <= at) addresses.delete(key);
    const mine = addresses.get(address), all = whole.until > at ? whole : null;
    if ((mine?.count ?? 0) >= perAddress || (all?.count ?? 0) >= install) throw new HttpError(429, 'Too many wrong passcodes. Try again in 15 minutes.');
    const a = open(addresses, address, at), w = open(null, '', at);
    a.count++; w.count++;
    return {
      // The passcode was right: give the count back.
      correct() { a.count--; w.count--; if (a.count <= 0 && addresses.get(address) === a) addresses.delete(address); },
    };
  };
}

export async function staticFile(req: IncomingMessage, res: ServerResponse, webDir: string, path: string) {
  const base = await realpath(webDir);
  let file: string;
  let info;
  try {
    file = await realpath(resolve(base, '.' + (path === '/' ? '/index.html' : path)));
    if (!file.startsWith(base + sep)) throw new Error();
    info = await stat(file);
    if (!info.isFile()) throw new Error();
  } catch { throw new HttpError(404, 'Page not found.'); }
  const types: Record<string, string> = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'}; // font files carry their version in the name, so immutable caching is safe
  const type = types[extname(file)];
  if (!type) throw new HttpError(404, 'Page not found.');
  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  res.writeHead(etagMatches(req.headers['if-none-match'], etag) ? 304 : 200, {
    'content-type': type.startsWith('font/') ? type : type + '; charset=utf-8', 'cache-control': type.startsWith('font/') ? 'public, max-age=31536000, immutable' : 'no-cache', etag,
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow',
  });
  res.end(res.statusCode === 304 ? undefined : await readFile(file));
}
