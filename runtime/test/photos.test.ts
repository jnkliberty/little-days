import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test, { mock } from 'node:test';
import { HttpError } from '../server/http.ts';
import { createPhotos, photoForm } from '../server/photos.ts';
import { createRouter } from '../server/router.ts';
import { openStore } from '../server/store.ts';

const operationId = '00000000-0000-4000-8000-000000000101';
const retryOperationId = '00000000-0000-4000-8000-000000000103';
const otherOperationId = '00000000-0000-4000-8000-000000000104';
const session = {sessionId: 'S'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'Sage'};
const child = {id: 7, slug: 'ada'};
const jpeg = Buffer.from([255, 216, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const webp = Buffer.from('RIFF0000WEBP');
const photoPermissions = ['core.view_note', 'core.add_note', 'core.change_note', 'core.view_child', 'core.change_child'];

function createTestStore() {
  const store = openStore(':memory:');
  store.putSetting('app', 'child', child);
  authorize(store, session);
  return store;
}

function authorize(store: ReturnType<typeof openStore>, who: typeof session) {
  const userId = who.adult === session.adult ? 11 : 12;
  store.createSession({sessionId: who.sessionId, csrfToken: who.csrfToken, adult: who.adult, babyBuddyUserId: userId, expiresAt: Date.now() + 60_000});
  store.putSetting(`user:${userId}`, 'permissions', photoPermissions);
}

function imageResponse(bytes: Buffer) {
  return new Response(bytes, {headers: {'content-type': 'image/jpeg'}});
}

async function withPhotoServer(run: (url: string) => Promise<void>) {
  const server = createServer(async (req, res) => {
    try {
      const parsed = await photoForm(req);
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({mime: parsed.mime, digest: parsed.digest, size: parsed.bytes.length, event: parsed.event}));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      res.writeHead(status, {'content-type': 'application/json'});
      res.end(JSON.stringify({error: error instanceof Error ? error.message : 'error'}));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

async function multipart(url: string, bytes: Buffer, id = operationId, event?: unknown) {
  const form = new FormData();
  form.set('operationId', id);
  form.set('file', new Blob([bytes]), 'photo.jpg');
  if (event !== undefined) form.set('event', JSON.stringify(event));
  return fetch(url, {method: 'POST', body: form});
}

test('multipart parser accepts JPEG, PNG, and WebP from real IncomingMessage bodies', async () => {
  await withPhotoServer(async url => {
    for (const [bytes, mime] of [[jpeg, 'image/jpeg'], [png, 'image/png'], [webp, 'image/webp']] as const) {
      const response = await multipart(url, bytes);
      assert.equal(response.status, 200);
      assert.equal((await response.json() as {mime: string}).mime, mime);
    }
  });
});

test('multipart parser rejects SVG, oversized files, and invalid operation IDs', async () => {
  await withPhotoServer(async url => {
    const svg = await multipart(url, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    assert.equal(svg.status, 415);
    // Limit change by owner decision (2026-11-11): 5 MB became 25 MB.
    const tooLarge = await multipart(url, Buffer.alloc(25 * 1024 * 1024 + 1, 1));
    assert.equal(tooLarge.status, 400);
    const badId = await multipart(url, jpeg, 'not-a-uuid');
    assert.equal(badId.status, 400);
  });
});

test('multipart parser accepts a JPEG between 6 and 25 MB (a phone photo the browser could not shrink)', async () => {
  await withPhotoServer(async url => {
    for (const mb of [6, 12, 20, 25]) {
      const big = Buffer.concat([jpeg, Buffer.alloc(mb * 1024 * 1024 - jpeg.length, 7)]);
      const response = await multipart(url, big);
      assert.equal(response.status, 200, `${mb} MB`);
      assert.equal((await response.json() as {size: number}).size, big.length);
    }
  });
});

test('a refused photo or portrait upload logs its status and message only', async () => {
  const lines: string[] = [];
  const logged = mock.method(console, 'error', (...args: unknown[]) => { lines.push(args.join(' ')); });
  const refusing = {upload: async () => { throw new HttpError(403, 'Your account cannot save this photo.'); }};
  const router = createRouter({photos: refusing} as unknown as Parameters<typeof createRouter>[0]);
  const server = createServer(async (req, res) => {
    try { await router.handle(req, res, new URL(req.url!, 'http://x'), session as never); }
    catch (error) { res.writeHead(error instanceof HttpError ? error.status : 502); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const form = (name: string, bytes: Buffer) => { const f = new FormData(); f.set('operationId', operationId); f.set('file', new Blob([bytes]), name); f.set('event', JSON.stringify({type: 'note', text: 'Sam private text'})); return f; };
    assert.equal((await fetch(`${url}/api/photos`, {method: 'POST', body: form('luna-secret-name.jpg', jpeg)})).status, 403);
    assert.equal((await fetch(`${url}/api/child/portrait`, {method: 'PUT', body: form('luna-secret-name.png', Buffer.from('<svg/>'))})).status, 415);
    assert.equal((await fetch(`${url}/api/photos`, {method: 'POST', body: form('luna-secret-name.jpg', Buffer.alloc(25 * 1024 * 1024 + 1, 1))})).status, 400);
    assert.deepEqual(lines, [
      'photo upload refused: 403 Your account cannot save this photo.',
      'photo upload refused: 415 Choose a JPEG, PNG, or WebP photo.',
      'photo upload refused: 400 Choose a photo under 25 MB.',
    ]);
    assert.equal(lines.join('\n').includes('secret'), false);
    assert.equal(lines.join('\n').includes('Sam'), false);
  } finally { logged.mock.restore(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

function photoInput(bytes = jpeg, event: Record<string, unknown> = {type: 'note', text: 'First day', time: '2026-10-25T15:00:00Z'}) {
  return {operationId, event, bytes, mime: 'image/jpeg', digest: createHash('sha256').update(bytes).digest('hex')} as Awaited<ReturnType<typeof photoForm>>;
}

test('note upload is child-scoped, idempotent, actor-bound, and stores only the image digest', async () => {
  const store = createTestStore();
  const calls: {sessionId: string; request: {resource: string; method: string; body?: unknown}}[] = [];
  const sessions = {request: async (sessionId: string, request: {resource: string; method: string; body?: unknown}) => {
    calls.push({sessionId, request});
    if (request.resource === 'notes' && request.method === 'GET') return [];
    if (request.resource === 'notes' && request.method === 'POST') assert.equal((store.getOperation(operationId)?.metadata as any)?.attempted, true);
    return {id: 42, child: child.id};
  }};
  const photos = createPhotos({store, sessions, baseUrl: 'http://babybuddy:8000'});
  try {
    const input = photoInput();
    const result = await photos.upload(session, input);
    assert.deepEqual(result, {status: 'saved', operationId, id: 'notes:42'});
    assert.equal(calls.filter(call => call.request.method === 'POST').length, 1);
    assert.equal(calls[1].sessionId, session.sessionId);
    assert.equal(calls[1].request.resource, 'notes');
    assert.equal(calls[1].request.method, 'POST');
    assert.equal((calls[1].request.body as FormData).get('child'), '7');
    const file = (calls[1].request.body as FormData).get('image');
    assert.ok(file instanceof File);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), jpeg);

    const op = store.getOperation(operationId);
    assert.equal(op?.adult, session.adult);
    assert.equal(op?.resource, 'photo');
    const ledgerBody = op?.requestBody as {child: number; fields: Record<string, unknown>; digest: string};
    assert.deepEqual(Object.keys(ledgerBody).sort(), ['baselineIds', 'child', 'digest', 'event', 'fields']);
    assert.equal(ledgerBody.digest, createHash('sha256').update(jpeg).digest('hex'));
    assert.equal(JSON.stringify(op).includes(jpeg.toString('base64')), false);
    assert.equal(store.getEventMetadata('notes', '42')?.adult, session.adult);

    assert.deepEqual(await photos.upload(session, input), {...result, id: 'notes:42'});
    assert.equal(calls.filter(call => call.request.method === 'POST').length, 1);
    const other = {sessionId: 'O'.repeat(43), csrfToken: 'D'.repeat(43), adult: 'Other'};
    authorize(store, other);
    await assert.rejects(photos.upload(other, input), (error: unknown) => error instanceof HttpError && error.status === 409);
    assert.equal(calls.filter(call => call.request.method === 'POST').length, 1);
  } finally { store.close(); }
});

test('visit photo uploads require the signed-in adult to retain child view access', async () => {
  const store = createTestStore();
  const calls: unknown[] = [];
  const sessions = {request: async (_sid: string, request: unknown) => { calls.push(request); return []; }};
  store.putSetting('user:11', 'permissions', photoPermissions.filter(permission => permission !== 'core.view_child'));
  const photos = createPhotos({store, sessions, baseUrl: 'http://babybuddy:8000'});
  try {
    await assert.rejects(photos.upload(session, photoInput(jpeg, {type: 'note', what: 'visit', provider: 'Dr. Rivera', time: '2026-10-25T17:00:00Z'})), (error: unknown) => error instanceof HttpError && error.status === 403);
    assert.equal(calls.length, 0);
  } finally { store.close(); }
});

test('photo upload accepts a milestone, rejects non-note events, and does not write before validation', async () => {
  const store = createTestStore();
  const calls: {resource: string; method: string; body?: unknown}[] = [];
  const sessions = {request: async (_sessionId: string, request: {resource: string; method: string; body?: unknown}) => {
    calls.push(request);
    if (request.resource === 'notes' && request.method === 'GET') return [];
    return {id: 43, child: child.id};
  }};
  const photos = createPhotos({store, sessions, baseUrl: 'http://babybuddy:8000'});
  try {
    await assert.rejects(photos.upload(session, photoInput(jpeg, {type: 'diaper', kind: 'W', time: '2026-10-25T15:00:00Z'})), (error: unknown) => error instanceof HttpError && error.status === 400);
    assert.equal(calls.length, 0);
    const milestone = await photos.upload(session, {...photoInput(jpeg, {type: 'other', what: 'mile', title: 'First smile', time: '2026-10-25T15:00:00Z'}), operationId: '00000000-0000-4000-8000-000000000102'});
    assert.equal(milestone.status, 'saved');
    assert.equal(calls[1].resource, 'notes');
    assert.equal((calls[1].body as FormData).get('child'), '7');
  } finally { store.close(); }
});

test('photo fetch rejects a foreign host before calling fetch', async () => {
  const store = createTestStore();
  let fetchCalls = 0;
  const sessions = {request: async () => ({id: 42, child: child.id, image: 'http://127.0.0.1/private'})};
  const photos = createPhotos({store, sessions, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => { fetchCalls++; throw new Error('must not fetch'); }});
  const response = {writeHead() {}, end() {}} as unknown as import('node:http').ServerResponse;
  try {
    await assert.rejects(photos.send(session, response, 'notes:42'), (error: unknown) => error instanceof HttpError && error.status === 502);
    assert.equal(fetchCalls, 0);
  } finally { store.close(); }
});

test('photo reads reject records linked to another child before fetch', async () => {
  const store = createTestStore();
  let fetchCalls = 0;
  const sessions = {request: async () => ({id: 42, child: 9, image: '/media/photo.jpg'})};
  const photos = createPhotos({store, sessions, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => { fetchCalls++; throw new Error('must not fetch'); }});
  const response = {writeHead() {}, end() {}} as unknown as import('node:http').ServerResponse;
  try {
    await assert.rejects(photos.send(session, response, 'notes:42'), (error: unknown) => error instanceof HttpError && error.status === 404);
    assert.equal(fetchCalls, 0);
  } finally { store.close(); }
});

test('replacing a photo updates the existing note and keeps its original author', async () => {
  const store = createTestStore();
  store.putEventMetadata({resource: 'notes', babyBuddyId: '42', adult: 'Rowan', metadata: {childId: 7}});
  const editor = {sessionId: 'J'.repeat(43), csrfToken: 'E'.repeat(43), adult: 'Rowan'};
  authorize(store, editor);
  const calls: any[] = [];
  const sessions = {request: async (_id: string, request: any) => {
    calls.push(request);
    if (request.method === 'GET') return {id: 42, child: 7, note: 'First', time: '2026-10-25T15:00:00Z', image: '/media/old.jpg'};
    return {id: 42, child: 7};
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => imageResponse(png)});
  try {
    const result = await photos.upload(editor, photoInput(jpeg, {id: 'notes:42', type: 'note', text: 'Updated', time: '2026-10-25T15:00:00Z'}));
    assert.equal(result.status, 'saved');
    assert.deepEqual(calls.map(x => [x.method, x.id]), [['GET', '42'], ['PATCH', '42']]);
    assert.equal(store.getEventMetadata('notes', '42')?.adult, 'Rowan');
  } finally { store.close(); }
});

test('uncertain note POST reconciles one new exact image and does not POST again', async () => {
  const store = createTestStore();
  let persisted = false;
  let postCount = 0;
  const calls: {resource: string; method: string}[] = [];
  const sessions = {request: async (_id: string, request: {resource: string; method: string}) => {
    calls.push(request);
    if (request.resource === 'notes' && request.method === 'GET') return persisted ? [{id: 42, child: 7, note: 'First day', time: '2026-10-25T15:00:00Z', image: '/media/photo.jpg'}] : [];
    if (request.resource === 'notes' && request.method === 'POST') { postCount++; persisted = true; throw new Error('response lost after write'); }
    throw new Error(`unexpected ${request.method} ${request.resource}`);
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => imageResponse(jpeg)});
  const input = photoInput();
  try {
    assert.deepEqual(await photos.upload(session, input), {status: 'pending', operationId});
    const retry = await photos.upload(session, {...input, operationId: retryOperationId});
    assert.deepEqual(retry, {status: 'pending', operationId});
    const other = {sessionId: 'O'.repeat(43), csrfToken: 'D'.repeat(43), adult: 'Other'};
    authorize(store, other);
    await assert.rejects(photos.upload(other, {...input, operationId: otherOperationId}), (error: unknown) => error instanceof HttpError && error.status === 409 && !String(error).includes(operationId));
    assert.equal(postCount, 1);
    const recovered = await photos.operation(session, operationId);
    assert.deepEqual(recovered, {status: 'saved', operationId, id: 'notes:42'});
    assert.equal(postCount, 1);
    assert.equal(store.getOperation(operationId)?.babyBuddyId, 'notes:42');
    assert.equal(store.getEventMetadata('notes', '42')?.adult, session.adult);
    assert.deepEqual(calls.filter(call => call.method === 'POST').map(call => call.resource), ['notes']);
  } finally { store.close(); }
});

test('note reconciliation excludes baseline IDs and notes claimed by another app operation', async () => {
  const store = createTestStore();
  const baselineRow = {id: 42, child: 7, note: 'First day', time: '2026-10-25T15:00:00Z', image: '/media/photo.jpg'};
  const calls: string[] = [];
  let fetchCalls = 0;
  const sessions = {request: async (_id: string, request: {resource: string; method: string; id?: string}) => {
    calls.push(request.method);
    if (request.resource === 'notes' && request.method === 'GET') return [baselineRow];
    if (request.method === 'POST') throw new Error('response lost after write');
    throw new Error('unexpected request');
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => { fetchCalls++; return imageResponse(jpeg); }});
  try {
    store.beginOperation({id: operationId, adult: session.adult, resource: 'photo', intent: {action: 'upload', target: null}, requestBody: {child: 7, fields: {child: 7, note: 'First day', time: '2026-10-25T15:00:00.000Z'}, digest: createHash('sha256').update(jpeg).digest('hex'), baselineIds: ['42']}, metadata: {appType: 'note'}});
    const result = await photos.operation(session, operationId);
    assert.deepEqual(result, {status: 'pending', operationId, needsReview: true});
    assert.equal(store.getOperation(operationId)?.state, 'pending');

    const claimedId = '00000000-0000-4000-8000-000000000105';
    store.putEventMetadata({resource: 'notes', babyBuddyId: '42', adult: 'Other', metadata: {photoOperationId: 'another-operation'}});
    store.beginOperation({id: claimedId, adult: session.adult, resource: 'photo', intent: {action: 'upload', target: null}, requestBody: {child: 7, fields: {child: 7, note: 'First day', time: '2026-10-25T15:00:00.000Z'}, digest: createHash('sha256').update(jpeg).digest('hex'), baselineIds: []}, metadata: {appType: 'note'}});
    assert.deepEqual(await photos.operation(session, claimedId), {status: 'pending', operationId: claimedId, needsReview: true});
    assert.equal(fetchCalls, 0);
  } finally { store.close(); }
});

test('portrait operation reconciles by current child picture hash after an uncertain PATCH', async () => {
  const store = createTestStore();
  let patched = false;
  let patchCount = 0;
  const sessions = {request: async (_id: string, request: {resource: string; method: string; id?: string}) => {
    if (request.resource === 'children' && request.method === 'GET') return {id: 7, slug: 'ada', picture: patched ? '/media/new.jpg' : null};
    if (request.resource === 'children' && request.method === 'PATCH') { patchCount++; patched = true; throw new Error('response lost after write'); }
    throw new Error(`unexpected ${request.method}`);
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => imageResponse(jpeg)});
  try {
    assert.deepEqual(await photos.upload(session, photoInput(), true), {status: 'pending', operationId});
    assert.deepEqual(await photos.operation(session, operationId), {status: 'saved', operationId, id: 'children:7'});
    assert.equal(patchCount, 1);
  } finally { store.close(); }
});

test('photo edit reconciliation checks target note body and image hash while preserving author', async () => {
  const store = createTestStore();
  store.putEventMetadata({resource: 'notes', babyBuddyId: '42', adult: 'Rowan', metadata: {childId: 7, title: 'First'}});
  const editor = {sessionId: 'J'.repeat(43), csrfToken: 'E'.repeat(43), adult: 'Rowan'};
  authorize(store, editor);
  let patched = false;
  const calls: string[] = [];
  const sessions = {request: async (_id: string, request: {resource: string; method: string; id?: string}) => {
    calls.push(request.method);
    if (request.resource === 'notes' && request.method === 'GET') return {id: 42, child: 7, note: patched ? 'Updated' : 'First', time: '2026-10-25T15:00:00Z', image: patched ? '/media/new.jpg' : '/media/old.jpg'};
    if (request.resource === 'notes' && request.method === 'PATCH') { patched = true; throw new Error('response lost after write'); }
    throw new Error(`unexpected ${request.method}`);
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async url => imageResponse(String(url).endsWith('/old.jpg') ? png : jpeg)});
  try {
    const input = photoInput(jpeg, {id: 'notes:42', type: 'note', text: 'Updated', time: '2026-10-25T15:00:00Z'});
    assert.deepEqual(await photos.upload(editor, input), {status: 'pending', operationId});
    assert.deepEqual(await photos.operation(editor, operationId), {status: 'saved', operationId, id: 'notes:42'});
    assert.equal(store.getEventMetadata('notes', '42')?.adult, 'Rowan');
    assert.deepEqual(calls, ['GET', 'PATCH', 'GET']);
  } finally { store.close(); }
});

test('photo recovery after ledger write but before request asks for the same photo, then sends once', async () => {
  const store = createTestStore();
  const originalBegin = store.beginOperation.bind(store);
  let interrupt = true, postCount = 0;
  store.beginOperation = (input: Parameters<typeof store.beginOperation>[0]) => {
    const result = originalBegin(input);
    if (interrupt) { interrupt = false; throw new Error('simulated process exit before request'); }
    return result;
  };
  const sessions = {request: async (_id: string, request: {resource: string; method: string}) => {
    if (request.resource === 'notes' && request.method === 'GET') return [];
    if (request.resource === 'notes' && request.method === 'POST') { postCount++; return {id: 51, child: 7}; }
    throw new Error('unexpected request');
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000'});
  try {
    await assert.rejects(photos.upload(session, photoInput()), HttpError);
    assert.deepEqual(await photos.operation(session, operationId), {status: 'pending', operationId, needsRetry: true, requiresPhoto: true, event: photoInput().event, portrait: false});
    assert.equal(postCount, 0);
    assert.deepEqual(await photos.upload(session, photoInput()), {status: 'saved', operationId, id: 'notes:51'});
    assert.equal(postCount, 1);
    assert.equal((store.getOperation(operationId)?.metadata as any)?.attempted, true);
  } finally { store.close(); }
});

test('ambiguous photo POST returns bounded review state and never sends a duplicate', async () => {
  const store = createTestStore();
  let postCount = 0;
  const sessions = {request: async (_id: string, request: {resource: string; method: string}) => {
    if (request.resource === 'notes' && request.method === 'GET') return [];
    if (request.resource === 'notes' && request.method === 'POST') { postCount++; throw new Error('response lost'); }
    throw new Error('unexpected request');
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000'});
  try {
    assert.deepEqual(await photos.upload(session, photoInput()), {status: 'pending', operationId});
    assert.deepEqual(await photos.operation(session, operationId), {status: 'pending', operationId, needsReview: true});
    assert.deepEqual(await photos.upload(session, photoInput()), {status: 'pending', operationId});
    assert.equal(postCount, 1);
  } finally { store.close(); }
});

test('pending photo edit holds when the original image changed elsewhere', async () => {
  const store = createTestStore();
  store.putEventMetadata({resource: 'notes', babyBuddyId: '42', adult: session.adult, metadata: {childId: 7}});
  let state: 'original' | 'changed' = 'original';
  const sessions = {request: async (_id: string, request: any) => {
    if (request.method === 'GET') return {id: 42, child: 7, note: state === 'original' ? 'First' : 'Changed', time: '2026-10-25T15:00:00Z', image: state === 'original' ? '/media/old.jpg' : '/media/other.jpg'};
    if (request.method === 'PATCH') { state = 'changed'; throw new Error('response lost'); }
    throw new Error('unexpected request');
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async url => imageResponse(String(url).endsWith('old.jpg') ? png : webp)});
  try {
    const input = photoInput(jpeg, {id: 'notes:42', type: 'note', text: 'Updated', time: '2026-10-25T15:00:00Z'});
    assert.equal((await photos.upload(session, input)).status, 'pending');
    const outcome = await photos.upload(session, input);
    assert.deepEqual(outcome, {status: 'pending', operationId, needsReview: true, conflict: true, error: 'The photo changed elsewhere. Review it before saving again.'});
  } finally { store.close(); }
});

test('a photo note lists a window around its time, before the upload and while reconciling', async () => {
  const store = createTestStore();
  const queries: Record<string, unknown>[] = [];
  let persisted = false;
  const sessions = {request: async (_id: string, request: {resource: string; method: string; query?: Record<string, unknown>}) => {
    if (request.resource === 'notes' && request.method === 'GET') {
      queries.push(request.query || {});
      return persisted ? [{id: 42, child: 7, note: 'First day', time: '2026-10-25T15:00:00Z', image: '/media/photo.jpg'}] : [];
    }
    if (request.resource === 'notes' && request.method === 'POST') { persisted = true; throw new Error('response lost after write'); }
    throw new Error(`unexpected ${request.method} ${request.resource}`);
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => imageResponse(jpeg)});
  try {
    assert.deepEqual(await photos.upload(session, photoInput()), {status: 'pending', operationId});
    assert.deepEqual(await photos.operation(session, operationId), {status: 'saved', operationId, id: 'notes:42'});
    assert.equal(queries.length, 2);
    for (const query of queries) assert.deepEqual([query.date_min, query.date_max], ['2026-10-25T14:59:00.000Z', '2026-10-25T15:01:00.000Z']);
  } finally { store.close(); }
});

test('a photo reply carries an ETag and a repeat request with If-None-Match gets 304 and no body', async () => {
  const store = createTestStore();
  const sessions = {request: async () => ({id: 42, child: child.id, image: '/media/photo.jpg'})};
  const photos = createPhotos({store, sessions, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => imageResponse(jpeg)});
  const router = createRouter({photos} as unknown as Parameters<typeof createRouter>[0]);
  const server = createServer(async (req, res) => {
    try { await router.handle(req, res, new URL(req.url!, 'http://x'), session as never); }
    catch (error) { res.writeHead(error instanceof HttpError ? error.status : 502); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/api/photos/notes%3A42`;
  const digest = createHash('sha256').update(jpeg).digest('hex');
  try {
    const first = await fetch(url);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('etag'), `"${digest}"`);
    assert.equal(first.headers.get('cache-control'), 'private, no-cache');
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), jpeg);
    const second = await fetch(url, {headers: {'if-none-match': first.headers.get('etag')!}});
    assert.equal(second.status, 304);
    assert.equal(second.headers.get('etag'), `"${digest}"`);
    assert.equal((await second.arrayBuffer()).byteLength, 0);
    const stale = await fetch(url, {headers: {'if-none-match': '"other"'}});
    assert.equal(stale.status, 200);
    assert.equal((await stale.arrayBuffer()).byteLength, jpeg.length);
  } finally { store.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

// Group G4-4: GET /api/photos list route, note permission, visit-attachment exclusion, pagination cap, no route shadowing.
test('G4-4: GET /api/photos requires core.view_note, excludes visit attachments and non-photo notes, paginates with nextOffset, and does not shadow /api/photos/:id', async () => {
  const store = createTestStore();
  store.putEventMetadata({resource: 'notes', babyBuddyId: '101', adult: session.adult, metadata: {appType: 'note', title: 'First morning', photoName: 'm1.jpg'}});
  store.putEventMetadata({resource: 'notes', babyBuddyId: '102', adult: session.adult, metadata: {appType: 'visit', provider: 'Dr. Lee', photoName: 'summary.jpg'}});
  store.putEventMetadata({resource: 'notes', babyBuddyId: '103', adult: session.adult, metadata: {appType: 'milestone', title: 'First smile'}});
  const queries: Record<string, unknown>[] = [];
  const allNotes = [
    {id: 103, child: child.id, note: 'First smile', time: '2026-11-18T14:00:00Z', image: '/media/p3.jpg'},
    {id: 102, child: child.id, note: 'Visit summary', time: '2026-11-15T10:00:00Z', image: '/media/visit.jpg'},
    {id: 104, child: child.id, note: 'Plain text note', time: '2026-11-12T08:00:00Z', image: null},
    {id: 105, child: 999, note: 'Other child photo', time: '2026-11-11T08:00:00Z', image: '/media/other.jpg'},
    {id: 101, child: child.id, note: 'First morning', time: '2026-11-07T09:00:00Z', image: '/media/p1.jpg'},
  ];
  const sessions = {request: async (_id: string, req: {resource: string; method: string; id?: string; query?: Record<string, unknown>}) => {
    if (req.resource === 'notes' && req.id === '101') return allNotes[4];
    if (req.resource === 'notes' && req.method === 'GET') {
      queries.push(req.query || {});
      return {count: allNotes.length, results: allNotes};
    }
    throw new Error(`unexpected ${req.method} ${req.resource}`);
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => imageResponse(jpeg)});
  const router = createRouter({photos} as unknown as Parameters<typeof createRouter>[0]);
  const server = createServer(async (req, res) => {
    try { await router.handle(req, res, new URL(req.url!, 'http://x'), session as never); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : 502;
      res.writeHead(status, {'content-type': 'application/json'});
      res.end(JSON.stringify({error: error instanceof Error ? error.message : 'error'}));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const listed = await fetch(`${base}/api/photos`);
    assert.equal(listed.status, 200);
    const body = await listed.json() as {photos: Array<{id: string; time: string; url: string; title: string; photoName: string}>; nextOffset: number | null};
    assert.equal(body.nextOffset, null);
    assert.deepEqual(body.photos.map(p => p.id), ['notes:103', 'notes:101']);
    assert.equal(body.photos[0].url, '/api/photos/notes%3A103');
    assert.equal(body.photos[0].title, 'First smile');
    assert.equal(body.photos[1].title, 'First morning');
    assert.equal(body.photos[1].photoName, 'm1.jpg');

    // Individual photo route is not shadowed by GET /api/photos
    const imgRes = await fetch(`${base}/api/photos/notes%3A101`);
    assert.equal(imgRes.status, 200);
    assert.deepEqual(Buffer.from(await imgRes.arrayBuffer()), jpeg);

    // Invalid offset returns 400
    assert.equal((await fetch(`${base}/api/photos?offset=-5`)).status, 400);
    assert.equal((await fetch(`${base}/api/photos?offset=abc`)).status, 400);

    // Without core.view_note permission, returns 403
    store.putSetting('user:11', 'permissions', ['core.view_child']);
    assert.equal((await fetch(`${base}/api/photos`)).status, 403);
  } finally { store.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('G4-5: GET /api/photos scans a fixed page budget per call and returns nextOffset for remaining pages', async () => {
  const store = createTestStore();
  let calls = 0;
  // 650 notes total: 6 full pages of 100 + 1 final page of 50; only note 520 (on page 6) has an image.
  const totalNotes = 650;
  const sessions = {request: async (_id: string, req: {resource: string; method: string; query?: Record<string, unknown>}) => {
    calls++;
    const offset = Number(req.query?.offset || 0), limit = Number(req.query?.limit || 100);
    const results = [];
    for (let i = offset; i < Math.min(totalNotes, offset + limit); i++) {
      results.push({
        id: 1000 + i,
        child: child.id,
        note: `Note ${i}`,
        time: new Date(Date.UTC(2026, 9, 1) + i * 3600_000).toISOString(),
        image: i === 520 ? '/media/old-photo.jpg' : null,
      });
    }
    return {count: totalNotes, results};
  }};
  const photos = createPhotos({store, sessions: sessions as any, baseUrl: 'http://babybuddy:8000', fetchImpl: async () => imageResponse(jpeg)});
  try {
    const first = await (photos as any).list(session, null);
    assert.equal(calls, 5, 'first call stops at fixed 5-page budget');
    assert.deepEqual(first.photos, []);
    assert.equal(first.nextOffset, 500);

    const second = await (photos as any).list(session, String(first.nextOffset));
    assert.equal(calls, 7, 'second call finishes remaining 2 pages');
    assert.equal(second.nextOffset, null);
    assert.deepEqual(second.photos.map((p: any) => p.id), ['notes:1520']);
  } finally { store.close(); }
});
