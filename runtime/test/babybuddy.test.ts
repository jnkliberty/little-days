import test from 'node:test';
import assert from 'node:assert/strict';
import { createBabyBuddyClient } from '../server/babybuddy.ts';

test('child slugs with accented or non-Latin letters reach Baby Buddy, but path tricks do not', async () => {
  const paths: string[] = [];
  const fetchImpl = async (url: string | URL) => { paths.push(new URL(String(url)).pathname); return new Response('{"id":1}', {status: 200, headers: {'content-type': 'application/json'}}); };
  const client = createBabyBuddyClient({baseUrl: 'http://babybuddy.test', fetchImpl: fetchImpl as typeof fetch});
  const session = {cookies: new Map(), csrfToken: 'csrf', userId: 1, username: 'Rowan'};
  for (const slug of ['ada', 'sofía', 'مرحبا-שלום']) await client.request(session, {resource: 'children', method: 'GET', id: slug});
  assert.deepEqual(paths, ['/api/children/ada/', `/api/children/${encodeURIComponent('sofía')}/`, `/api/children/${encodeURIComponent('مرحبا-שלום')}/`]);
  for (const bad of ['../profile', 'a/b', 'a.b', '']) await assert.rejects(client.request(session, {resource: 'children', method: 'GET', id: bad}), /Invalid Baby Buddy record id/);
});

test('the client marks a refused password and keeps the profile status of an ended login', async () => {
  let profileStatus = 403;
  const fetchImpl = async (url: string | URL) => {
    if (new URL(String(url)).pathname === '/login/') return new Response('<input name="csrfmiddlewaretoken" value="tok">', { status: 200 });
    return new Response('{"detail":"no"}', { status: profileStatus });
  };
  const client = createBabyBuddyClient({ baseUrl: 'http://babybuddy.test', fetchImpl: fetchImpl as typeof fetch });
  // Baby Buddy shows its login form again (200) and its profile refuses the new cookies: the password was refused.
  await assert.rejects(client.login('Rowan', 'pw-x'), (error: { rejected?: boolean }) => error.rejected === true);
  profileStatus = 503; // A profile server error during the login is not a refused password.
  await assert.rejects(client.login('Rowan', 'pw-x'), (error: { rejected?: boolean }) => error.rejected !== true);
  profileStatus = 403; // The profile check of an ended login keeps its status, so the gateway can tell it from an outage.
  await assert.rejects(client.identity({ cookies: new Map(), csrfToken: 'c', userId: 1, username: 'Rowan' }), (error: { status?: number }) => error.status === 403);
});

test('a photo form of 24 MB reaches Baby Buddy, and one over the form cap does not', async () => {
  let posted = 0;
  const fetchImpl = async (_url: string | URL, init?: RequestInit) => { posted += init?.body instanceof FormData ? 1 : 0; return new Response('{"id":1}', {status: 200, headers: {'content-type': 'application/json'}}); };
  const client = createBabyBuddyClient({baseUrl: 'http://babybuddy.test', fetchImpl: fetchImpl as typeof fetch});
  const session = {cookies: new Map(), csrfToken: 'csrf', userId: 1, username: 'Rowan'};
  const form = (bytes: number) => { const f = new FormData(); f.set('child', '7'); f.set('image', new Blob([new Uint8Array(bytes)]), 'photo.jpg'); return f; };
  // Limit change by owner decision (2026-11-11): the photo limit is 25 MB, so the proxy form cap rose from 12 MB.
  await client.request(session, {resource: 'notes', method: 'POST', body: form(24 * 1024 * 1024)});
  assert.equal(posted, 1);
  await assert.rejects(client.request(session, {resource: 'notes', method: 'POST', body: form(27 * 1024 * 1024)}), /too large/);
});
