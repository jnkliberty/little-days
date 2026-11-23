import { createCipheriv, createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import { HttpError } from './http.ts';
import type { Store } from './store.ts';

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };
export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };
export type PushOutcome = 'accepted' | 'gone' | 'bad_request' | 'auth_error' | 'retry';

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PUSH_TIMEOUT_MS = 10_000;

function isPrivateOrLocalHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!lower || lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  if (lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return !lower.includes('.');
}

export function validPushContact(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return null;
  if (trimmed.startsWith('mailto:')) {
    const address = trimmed.slice(7);
    const match = /^[^\s@]+@([^\s@.]+\.[^\s@]+)$/.exec(address);
    if (!match || isPrivateOrLocalHost(match[1])) return null;
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.username || url.password || isPrivateOrLocalHost(url.hostname)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function validPushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try { url = new URL(trimmed); }
  catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return null;
  const host = url.hostname.toLowerCase();
  const allowed =
    host === 'web.push.apple.com' ||
    (host.endsWith('.push.apple.com') && host.length > '.push.apple.com'.length) ||
    host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    (host.endsWith('.push.services.mozilla.com') && host.length > '.push.services.mozilla.com'.length);
  return allowed ? trimmed : null;
}

function decodeBase64Url(value: unknown, expectedBytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !BASE64URL.test(value)) throw new HttpError(400, `Invalid ${label}.`);
  const buf = Buffer.from(value, 'base64url');
  if (buf.length !== expectedBytes) throw new HttpError(400, `Invalid ${label}.`);
  return buf;
}

export function validSubscriptionInput(body: unknown): SubscriptionInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Enter a valid push subscription.');
  const input = body as Record<string, unknown>;
  const endpoint = validPushEndpoint(input.endpoint);
  if (!endpoint) throw new HttpError(400, 'Use a supported push service endpoint.');
  const keys = input.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new HttpError(400, 'Enter push encryption keys.');
  const { p256dh, auth } = keys as Record<string, unknown>;
  const pubBuf = decodeBase64Url(p256dh, 65, 'push public key');
  if (pubBuf[0] !== 0x04) throw new HttpError(400, 'Invalid push public key.');
  const authBuf = decodeBase64Url(auth, 16, 'push auth secret');
  try {
    createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: pubBuf.subarray(1, 33).toString('base64url'), y: pubBuf.subarray(33, 65).toString('base64url') },
      format: 'jwk',
    });
    const probe = createECDH('prime256v1');
    probe.generateKeys();
    probe.computeSecret(pubBuf);
  } catch {
    throw new HttpError(400, 'Invalid push public key.');
  }
  return { endpoint, p256dh: pubBuf.toString('base64url'), auth: authBuf.toString('base64url') };
}

export function ensureVapidKeys(store: Store): VapidKeys {
  const existing = store.getSetting('app', 'vapidKeys');
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    const record = existing as { publicKey?: unknown; privateJwk?: unknown };
    if (typeof record.publicKey === 'string' && record.privateJwk && typeof record.privateJwk === 'object') {
      return { publicKey: record.publicKey, privateJwk: record.privateJwk as JsonWebKey };
    }
  }
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  const x = Buffer.from(String(privateJwk.x), 'base64url');
  const y = Buffer.from(String(privateJwk.y), 'base64url');
  const publicKey = Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url');
  const keys: VapidKeys = { publicKey, privateJwk };
  store.putSetting('app', 'vapidKeys', keys);
  return keys;
}

function encodeJwtPart(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function buildVapidHeader(input: { audience: string; subject: string; keys: VapidKeys; nowSec?: number }): string {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ typ: 'JWT', alg: 'ES256' });
  const payload = encodeJwtPart({ aud: input.audience, exp: nowSec + 12 * 3600, sub: input.subject });
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey({ key: input.keys.privateJwk, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${signingInput}.${signature.toString('base64url')}, k=${input.keys.publicKey}`;
}

export function encryptPushPayload(
  plaintext: string | Buffer,
  uaPublicB64: string,
  authB64: string,
  overrides?: { salt?: Buffer; privateKey?: Buffer },
): Buffer {
  const uaPublic = Buffer.from(uaPublicB64, 'base64url');
  const authSecret = Buffer.from(authB64, 'base64url');
  const ecdh = createECDH('prime256v1');
  if (overrides?.privateKey) ecdh.setPrivateKey(overrides.privateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = overrides?.salt ?? randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));
  const plainBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const record = Buffer.concat([plainBuf, Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ciphertext]);
}

function classifyStatus(status: number): PushOutcome {
  if (status >= 200 && status < 300) return 'accepted';
  if (status === 404 || status === 410) return 'gone';
  if (status === 400 || status === 413) return 'bad_request';
  if (status === 401 || status === 403) return 'auth_error';
  return 'retry';
}

export async function sendWebPush(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: string;
  ttlSeconds: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  contact: string;
  keys: VapidKeys;
  nowMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ outcome: PushOutcome; status: number }> {
  const endpoint = validPushEndpoint(input.endpoint);
  if (!endpoint) return { outcome: 'bad_request', status: 400 };
  const audience = new URL(endpoint).origin;
  const ttl = Math.max(1, Math.min(3600, Math.floor(input.ttlSeconds)));
  const authorization = buildVapidHeader({
    audience,
    subject: input.contact,
    keys: input.keys,
    nowSec: Math.floor((input.nowMs ?? Date.now()) / 1000),
  });
  const body = encryptPushPayload(input.payload, input.p256dh, input.auth);
  const fetchFn = input.fetchImpl ?? fetch;
  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(input.timeoutMs ?? PUSH_TIMEOUT_MS),
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: input.urgency ?? 'normal',
      },
      body: new Uint8Array(body),
    });
    return { outcome: classifyStatus(response.status), status: response.status };
  } catch {
    return { outcome: 'retry', status: 0 };
  }
}
