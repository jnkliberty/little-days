import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPrivateKey, createPublicKey, hkdfSync, verify } from 'node:crypto';
import test from 'node:test';
import {
  buildVapidHeader,
  encryptPushPayload,
  ensureVapidKeys,
  sendWebPush,
  validPushContact,
  validPushEndpoint,
  validSubscriptionInput,
} from '../server/push.ts';
import { openStore } from '../server/store.ts';

function makeSubscriberKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = Buffer.alloc(16, 0x42);
  return {
    ecdh,
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: auth.toString('base64url'),
    authBuf: auth,
  };
}

function decryptAes128Gcm(body: Buffer, uaEcdh: ReturnType<typeof createECDH>, authBuf: Buffer): string {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  assert.equal(rs, 4096);
  const idlen = body[20];
  assert.equal(idlen, 65);
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertextWithTag = body.subarray(21 + idlen);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const shared = uaEcdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaEcdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authBuf, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  assert.equal(padded[padded.length - 1], 0x02, 'final RFC 8188 delimiter byte must be 0x02');
  return padded.subarray(0, padded.length - 1).toString('utf8');
}

// Failure case: RFC 8291 Appendix A interoperability breaks if HKDF info strings, salt, or record header bytes diverge.
test('encryptPushPayload matches RFC 8291 Appendix A test vector and round-trips cleanly', () => {
  const uaPublic = Buffer.from('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'base64url');
  const auth = Buffer.from('BTBZMqHH6r4Tts7J_aSIgg', 'base64url');
  const asPrivate = Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url');
  const salt = Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url');
  const expected = Buffer.from(
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    'base64url',
  );
  const actual = encryptPushPayload('When I grow up, I want to be a watermelon', uaPublic.toString('base64url'), auth.toString('base64url'), {
    salt,
    privateKey: asPrivate,
  });
  assert.deepEqual(actual, expected);

  // Round-trip decryption with fresh keys and real D5 JSON payload
  const sub = makeSubscriberKeys();
  const payload = JSON.stringify({ type: 'medicine', tag: 'medication:42', title: 'Little Days', body: 'Medicine dose is due' });
  const encrypted = encryptPushPayload(payload, sub.p256dh, sub.auth);
  assert.equal(decryptAes128Gcm(encrypted, sub.ecdh, sub.authBuf), payload);
});

// Failure case: Apple APNs rejects VAPID tokens with DER signatures or wrong aud/sub/exp claims.
test('ensureVapidKeys persists across reloads and buildVapidHeader signs raw IEEE-P1363 ES256 JWT', () => {
  const store = openStore(':memory:');
  try {
    const keys = ensureVapidKeys(store);
    assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);
    assert.equal(Buffer.from(keys.publicKey, 'base64url')[0], 0x04);
    assert.deepEqual(ensureVapidKeys(store), keys);

    const header = buildVapidHeader({
      audience: 'https://web.push.apple.com',
      subject: 'https://github.com/jnkliberty/little-days',
      keys,
      nowSec: 1_795_000_000,
    });
    const m = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(header);
    assert.ok(m, 'VAPID header matches RFC 8292 format');
    assert.equal(m[2], keys.publicKey);
    const [h64, p64, s64] = m[1].split('.');
    const sig = Buffer.from(s64, 'base64url');
    assert.equal(sig.length, 64, 'ES256 signature must be raw 64-byte IEEE-P1363 r||s');
    const hdr = JSON.parse(Buffer.from(h64, 'base64url').toString('utf8'));
    const claim = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
    assert.deepEqual(hdr, { typ: 'JWT', alg: 'ES256' });
    assert.equal(claim.aud, 'https://web.push.apple.com');
    assert.equal(claim.sub, 'https://github.com/jnkliberty/little-days');
    assert.equal(claim.exp, 1_795_000_000 + 12 * 3600);

    const pub = createPublicKey(createPrivateKey({ key: keys.privateJwk, format: 'jwk' }));
    assert.equal(verify('sha256', Buffer.from(`${h64}.${p64}`), { key: pub, dsaEncoding: 'ieee-p1363' }, sig), true);
  } finally { store.close(); }
});

// Failure case: SSRF or malformed keys let a signed-in phone force the gateway to call internal hosts or crash encryption.
test('validPushContact, validPushEndpoint, and validSubscriptionInput enforce allowlist and key validation', () => {
  const mailContact = ['mailto:ops', 'example.com'].join('@');
  assert.equal(validPushContact(mailContact), mailContact);
  assert.equal(validPushContact('https://github.com/jnkliberty/little-days'), 'https://github.com/jnkliberty/little-days');
  for (const bad of ['', 'http://example.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://192.168.1.5/x', 'https://host.local/x', 'mailto:not-an-email']) {
    assert.equal(validPushContact(bad), null, `contact ${bad} must be rejected`);
  }

  for (const good of [
    'https://web.push.apple.com/QB1234',
    'https://us-east.push.apple.com/token',
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/xyz',
  ]) {
    assert.equal(validPushEndpoint(good), good);
  }
  const userInfoEndpoint = ['https://user:pass', 'web.push.apple.com/x'].join('@');
  for (const bad of [
    'http://web.push.apple.com/x',
    userInfoEndpoint,
    'https://web.push.apple.com:8443/x',
    'https://127.0.0.1/x',
    'https://evil.example.com/x',
    'https://web.push.apple.com.evil.com/x',
    'https://push.apple.com/x',
  ]) {
    assert.equal(validPushEndpoint(bad), null, `endpoint ${bad} must be rejected`);
  }

  const sub = makeSubscriberKeys();
  const ok = validSubscriptionInput({ endpoint: 'https://web.push.apple.com/sub1', keys: { p256dh: sub.p256dh, auth: sub.auth } });
  assert.equal(ok.endpoint, 'https://web.push.apple.com/sub1');
  assert.throws(() => validSubscriptionInput({ endpoint: 'https://evil.com/sub', keys: { p256dh: sub.p256dh, auth: sub.auth } }));
  assert.throws(() => validSubscriptionInput({ endpoint: 'https://web.push.apple.com/sub1', keys: { p256dh: Buffer.alloc(65, 0x04).toString('base64url'), auth: sub.auth } }));
  assert.throws(() => validSubscriptionInput({ endpoint: 'https://web.push.apple.com/sub1', keys: { p256dh: sub.p256dh, auth: Buffer.alloc(12).toString('base64url') } }));
});

// Failure case: redirect following enables SSRF, and status codes must map cleanly so 400/413 never delete healthy phones.
test('sendWebPush sets required headers, refuses redirects, and classifies provider responses', async () => {
  const store = openStore(':memory:');
  try {
    const keys = ensureVapidKeys(store);
    const sub = makeSubscriberKeys();
    const seen: { url: string; init: RequestInit }[] = [];
    const call = async (status: number, throwErr?: Error) => sendWebPush({
      endpoint: 'https://web.push.apple.com/device-1',
      p256dh: sub.p256dh,
      auth: sub.auth,
      payload: JSON.stringify({ type: 'reminder', tag: 'reminder:1', title: 'Little Days', body: 'Reminder' }),
      ttlSeconds: 180,
      urgency: 'high',
      contact: 'https://github.com/jnkliberty/little-days',
      keys,
      nowMs: 1_795_000_000_000,
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        if (throwErr) throw throwErr;
        return new Response('', { status });
      },
    });

    const ok = await call(201);
    assert.equal(ok.outcome, 'accepted');
    assert.equal(seen[0].init.redirect, 'manual');
    const headers = seen[0].init.headers as Record<string, string>;
    assert.equal(headers['Content-Encoding'], 'aes128gcm');
    assert.equal(headers['Content-Type'], 'application/octet-stream');
    assert.equal(headers.TTL, '180');
    assert.match(headers.Authorization, /^vapid t=/);

    assert.equal((await call(404)).outcome, 'gone');
    assert.equal((await call(410)).outcome, 'gone');
    assert.equal((await call(400)).outcome, 'bad_request');
    assert.equal((await call(413)).outcome, 'bad_request');
    assert.equal((await call(401)).outcome, 'auth_error');
    assert.equal((await call(403)).outcome, 'auth_error');
    assert.equal((await call(302)).outcome, 'retry');
    assert.equal((await call(429)).outcome, 'retry');
    assert.equal((await call(503)).outcome, 'retry');
    assert.equal((await call(0, new Error('network down'))).outcome, 'retry');
  } finally { store.close(); }
});
