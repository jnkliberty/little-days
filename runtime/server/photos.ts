import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { body, etagMatches, HttpError } from './http.ts';
import { mapEvent } from './mapping.ts';
import { windowQuery } from './records.ts';
import type { Session } from './app.ts';
import type { Operation, Store } from './store.ts';
import type { SessionService } from './session.ts';

// 25 MB (owner, 2026-11-11). The browser shrinks phone photos first; this is the safety net for a file it cannot decode.
const LIMIT = 25 * 1024 * 1024;
const PAGE_SIZE = 100;
const PAGE_CAP = 100;
type PhotoInput = Awaited<ReturnType<typeof photoForm>>;
type PhotoConfig = {id: number; slug: string};
type Image = {bytes: Buffer; mime: string; digest: string};

function object(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function rowList(value: unknown): Record<string, any>[] | null {
  const rows = Array.isArray(value) ? value : object(value)?.results;
  return Array.isArray(rows) ? rows.filter(item => object(item)) as Record<string, any>[] : null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function childId(row: Record<string, any>): number {
  const value = object(row.child)?.id ?? row.child;
  return Number.isSafeInteger(value) ? Number(value) : 0;
}

function matchesNote(fields: Record<string, unknown>, row: Record<string, any>, childIdValue: number): boolean {
  const expectedTime = typeof fields.time === 'string' ? Date.parse(fields.time) : NaN;
  const actualTime = typeof row.time === 'string' ? Date.parse(row.time) : NaN;
  return childId(row) === childIdValue && row.note === fields.note && Number.isFinite(expectedTime) && expectedTime === actualTime;
}

function imageType(bytes: Buffer): string {
  if (bytes.length > 12 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new HttpError(415, 'Choose a JPEG, PNG, or WebP photo.');
}

// One line for a refused upload: the status and the message, nothing else (no file name, no person, no content).
export function logRefusal(error: unknown): void {
  const status = error instanceof HttpError ? error.status : 502;
  console.error(`photo upload refused: ${status} ${error instanceof Error ? error.message : 'unknown error'}`);
}

export async function photoForm(req: IncomingMessage) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('multipart/form-data;')) throw new HttpError(415, 'Choose a photo to upload.');
  let form: FormData;
  try { form = await new Response(await body(req, LIMIT + 65536), {headers: {'content-type': type}}).formData(); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'The photo upload is not valid.'); }
  const file = form.get('file'), operationId = form.get('operationId');
  if (!(file instanceof File) || !file.size || file.size > LIMIT) throw new HttpError(400, 'Choose a photo under 25 MB.');
  if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) throw new HttpError(400, 'Use a valid save ID.');
  const bytes = Buffer.from(await file.arrayBuffer()), mime = imageType(bytes);
  let event: Record<string, any> = {};
  if (form.has('event')) {
    try { event = object(JSON.parse(String(form.get('event'))))!; if (!event) throw new Error(); }
    catch { throw new HttpError(400, 'The photo note is not valid.'); }
  }
  return {operationId, event, bytes, mime, digest: createHash('sha256').update(bytes).digest('hex')};
}

export function createPhotos({store, sessions, baseUrl, fetchImpl = fetch}: {store: Store; sessions: SessionService; baseUrl: string; fetchImpl?: typeof fetch}) {
  function child(): PhotoConfig {
    const value = object(store.getSetting('app', 'child'));
    if (!value || !Number.isSafeInteger(value.id) || typeof value.slug !== 'string') throw new HttpError(409, 'Set up the child first.');
    return {id: value.id, slug: value.slug};
  }

  function requirePermission(session: Session, permission: string): void {
    const saved = store.getSession(session.sessionId);
    if (!saved || saved.adult !== session.adult) throw new HttpError(403, 'Sign in again to save this photo.');
    const permissions = saved && store.getSetting(`user:${saved.babyBuddyUserId}`, 'permissions');
    if (!Array.isArray(permissions) || !permissions.includes(permission)) throw new HttpError(403, 'Your account cannot save this photo.');
  }

  function inputForOperation(operationId: string, session: Session, resource: string): Operation | null {
    const existing = store.getOperation(operationId);
    if (!existing) return null;
    if (existing.adult !== session.adult || existing.resource !== resource) throw new HttpError(409, 'This save ID already has different data.');
    return existing;
  }

  function matchReplay(existing: Operation | null, session: Session, resource: string, childIdValue: number, target: string | null, fields: Record<string, unknown>, digest: string): Record<string, unknown> | null {
    if (!existing) return null;
    const request = object(existing.requestBody), intent = object(existing.intent);
    if (!request || !intent || Number(request.child) !== childIdValue || request.digest !== digest || stable(request.fields) !== stable(fields) || (intent.target ?? null) !== target) throw new HttpError(409, 'This save ID already has different data.');
    return {status: existing.state, operationId: existing.id, ...(existing.babyBuddyId ? {id: existing.babyBuddyId} : {})};
  }

  async function allNotes(session: Session, childIdValue: number, fields: Record<string, unknown>): Promise<Record<string, any>[]> {
    const all: Record<string, any>[] = [];
    for (let page = 0; page < PAGE_CAP; page++) {
      const response = await sessions.request(session.sessionId, {resource: 'notes', method: 'GET', query: {child: childIdValue, ...windowQuery('notes', fields), limit: PAGE_SIZE, offset: page * PAGE_SIZE}});
      const batch = rowList(response);
      if (!batch) throw new HttpError(502, 'Baby Buddy returned an invalid note list.');
      all.push(...batch);
      if (batch.length < PAGE_SIZE) return all;
    }
    throw new HttpError(413, 'This child has too many notes to verify safely.');
  }

  async function readImage(path: unknown): Promise<Image> {
    if (typeof path !== 'string') throw new HttpError(404, 'Photo not found.');
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith('/media/') || url.username || url.password) throw new HttpError(502, 'The photo address is not valid.');
    const response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(15000)});
    if (!response.ok || !response.body) throw new HttpError(502, 'The photo could not load.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > LIMIT) throw new HttpError(413, 'This photo is too large.');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks), mime = imageType(bytes);
    return {bytes, mime, digest: createHash('sha256').update(bytes).digest('hex')};
  }

  async function childRow(session: Session, config: PhotoConfig): Promise<Record<string, any>> {
    const row = object(await sessions.request(session.sessionId, {resource: 'children', method: 'GET', id: config.slug}));
    if (!row || Number(row.id) !== config.id) throw new HttpError(404, 'Child not found.');
    return row;
  }

  async function editTarget(session: Session, event: Record<string, any>, config: PhotoConfig): Promise<{id: string; row: Record<string, any>; owner: string}> {
    if (typeof event.id !== 'string' || !/^notes:\d+$/.test(event.id)) throw new HttpError(400, 'Choose an existing photo note.');
    const id = event.id.slice(6);
    const row = object(await sessions.request(session.sessionId, {resource: 'notes', method: 'GET', id}));
    if (!row || childId(row) !== config.id) throw new HttpError(404, 'Note not found.');
    const metadata = store.getEventMetadata('notes', id);
    if (!metadata || metadata.adult !== session.adult) throw new HttpError(403, 'Only the adult who added this photo can change it.');
    return {id, row, owner: metadata.adult};
  }

  function pendingDuplicate(session: Session, resource: string, request: Record<string, unknown>, target: string | null): Record<string, unknown> | null {
    for (const operation of store.pendingOperations()) {
      if (!['pending', 'finishing'].includes(operation.state) || operation.resource !== resource) continue;
      const old = object(operation.requestBody), intent = object(operation.intent);
      if (!old || !intent || Number(old.child) !== request.child || old.digest !== request.digest || stable(old.fields) !== stable(request.fields) || (intent.target ?? null) !== target) continue;
      if (operation.adult !== session.adult) throw new HttpError(409, 'A matching photo save is still being checked. Retry after it finishes.');
      return {status: 'pending', operationId: operation.id};
    }
    return null;
  }

  async function finishNote(operation: Operation, session: Session, row: Record<string, any>, owner: string): Promise<Record<string, unknown>> {
    if (!Number.isSafeInteger(row.id) || childId(row) !== Number(object(operation.requestBody)?.child)) return {status: 'pending', operationId: operation.id};
    const request = object(operation.requestBody)!, metadata = object(operation.metadata) || {};
    const current = store.getEventMetadata('notes', String(row.id));
    const target = typeof object(operation.intent)?.target === 'string';
    if (current && (target ? current.adult !== owner : object(current.metadata)?.photoOperationId !== operation.id)) return {status: 'pending', operationId: operation.id};
    store.putEventMetadata({resource: 'notes', babyBuddyId: String(row.id), adult: owner, metadata: {...(object(current?.metadata) || {}), ...metadata, childId: request.child, photoOperationId: operation.id}});
    store.finishOperation(operation.id, 'saved', `notes:${row.id}`);
    return {status: 'saved', operationId: operation.id, id: `notes:${row.id}`};
  }

  async function reconcileNote(operation: Operation, session: Session, config: PhotoConfig): Promise<Record<string, unknown>> {
    const request = object(operation.requestBody)!, intent = object(operation.intent)!, fields = object(request.fields) || {};
    const target = typeof intent.target === 'string' ? intent.target : null;
    if (target) {
      const row = object(await sessions.request(session.sessionId, {resource: 'notes', method: 'GET', id: target}));
      if (!row || childId(row) !== config.id) return {status: 'pending', operationId: operation.id};
      const owner = store.getEventMetadata('notes', target)?.adult;
      if (!owner || owner !== session.adult) throw new HttpError(403, 'Only the adult who added this photo can change it.');
      let image: Image;
      try { image = await readImage(row.image); } catch { return {status: 'pending', operationId: operation.id}; }
      if (!matchesNote(fields, row, config.id) || image.digest !== request.digest) return {status: 'pending', operationId: operation.id};
      return finishNote(operation, session, row, owner);
    }
    const baseline = Array.isArray(request.baselineIds) ? new Set(request.baselineIds.map(String)) : null;
    if (!baseline) return {status: 'pending', operationId: operation.id};
    const rows = await allNotes(session, config.id, fields), candidates: Record<string, any>[] = [];
    for (const row of rows) {
      if (!Number.isSafeInteger(row.id) || baseline.has(String(row.id)) || childId(row) !== config.id) continue;
      const current = store.getEventMetadata('notes', String(row.id));
      if (current && object(current.metadata)?.photoOperationId !== operation.id) continue;
      if (!matchesNote(fields, row, config.id)) continue;
      try { if ((await readImage(row.image)).digest === request.digest) candidates.push(row); }
      catch { /* An unverified image is not a match. */ }
    }
    if (candidates.length !== 1) return {status: 'pending', operationId: operation.id};
    return finishNote(operation, session, candidates[0], session.adult);
  }

  async function reconcilePortrait(operation: Operation, session: Session, config: PhotoConfig): Promise<Record<string, unknown>> {
    const row = await childRow(session, config), request = object(operation.requestBody)!;
    if (typeof row.picture !== 'string') return {status: 'pending', operationId: operation.id, needsReview: true};
    let image: Image;
    try { image = await readImage(row.picture); } catch { return {status: 'pending', operationId: operation.id, needsReview: true}; }
    if (image.digest !== request.digest) return {status: 'pending', operationId: operation.id, needsReview: true};
    store.finishOperation(operation.id, 'saved', `children:${config.id}`);
    return {status: 'saved', operationId: operation.id, id: `children:${config.id}`};
  }

  async function operation(session: Session, id: string): Promise<Record<string, unknown>> {
    const saved = store.getOperation(id);
    if (!saved || saved.adult !== session.adult || !['photo', 'portrait'].includes(saved.resource)) throw new HttpError(404, 'Save not found.');
    if (saved.state !== 'pending' && saved.state !== 'finishing') return {status: saved.state, operationId: saved.id, ...(saved.babyBuddyId ? {id: saved.babyBuddyId} : {})};
    const config = child(), request = object(saved.requestBody);
    if (!request || Number(request.child) !== config.id) throw new HttpError(409, 'The saved child changed; this photo cannot be checked.');
    const attempted = object(saved.metadata)?.attempted !== false;
    if (!attempted) return {status: 'pending', operationId: saved.id, needsRetry: true, requiresPhoto: true, event: request.event, portrait: saved.resource === 'portrait'};
    if (saved.resource === 'portrait') {
      requirePermission(session, 'core.view_child');
      requirePermission(session, 'core.change_child');
      return reconcilePortrait(saved, session, config);
    }
    const intent = object(saved.intent), target = typeof intent?.target === 'string' ? intent.target : null;
    requirePermission(session, 'core.view_note');
    requirePermission(session, target ? 'core.change_note' : 'core.add_note');
    const reconciled = await reconcileNote(saved, session, config);
    return reconciled.status === 'pending' ? {...reconciled, needsReview: true} : reconciled;
  }

  function targetId(event: Record<string, any>, portrait: boolean): string | null {
    if (portrait || event.id == null) return null;
    if (typeof event.id !== 'string' || !/^notes:\d+$/.test(event.id)) throw new HttpError(400, 'Choose an existing photo note.');
    return event.id.slice(6);
  }

  function prepareUpload(session: Session, input: PhotoInput, portrait: boolean) {
    const config = child(), target = targetId(input.event, portrait), resource = portrait ? 'portrait' : 'photo';
    if (!portrait && input.event.what === 'visit') requirePermission(session, 'core.view_child');
    requirePermission(session, portrait ? 'core.view_child' : 'core.view_note');
    requirePermission(session, portrait ? 'core.change_child' : target ? 'core.change_note' : 'core.add_note');
    const mapped = portrait ? null : mapEvent({...input.event, photo: true}, config.id, new Date(), null);
    if (mapped && (mapped.writes.length !== 1 || mapped.writes[0].resource !== 'notes')) throw new HttpError(400, 'Add the photo to a note or moment.');
    return {config, target, resource, fields: mapped?.writes[0].body || {}, metadata: mapped?.writes[0].metadata || {}};
  }

  async function captureBaseline(session: Session, config: PhotoConfig, target: string | null, portrait: boolean, fields: Record<string, unknown>): Promise<{owner: string; baselineIds: string[]; baseline?: Record<string, unknown>}> {
    if (target) {
      const {row, owner} = await editTarget(session, {id: `notes:${target}`}, config);
      const image = await readImage(row.image);
      return {owner, baselineIds: [], baseline: {note: row.note, time: row.time, digest: image.digest}};
    }
    if (portrait) {
      const before = await childRow(session, config);
      const digest = typeof before.picture === 'string' ? (await readImage(before.picture)).digest : null;
      return {owner: session.adult, baselineIds: [], baseline: {digest}};
    }
    const rows = await allNotes(session, config.id, fields);
    return {owner: session.adult, baselineIds: rows.filter(row => Number.isSafeInteger(row.id) && childId(row) === config.id).map(row => String(row.id))};
  }

  function beginUpload(session: Session, input: PhotoInput, prepared: ReturnType<typeof prepareUpload>, baseline: {owner: string; baselineIds: string[]}) {
    const {config, target, resource, fields, metadata} = prepared;
    const requestBody = {child: config.id, fields, event: input.event, digest: input.digest, ...(target ? {baseline: baseline.baseline} : resource === 'portrait' ? {baseline: baseline.baseline} : {baselineIds: baseline.baselineIds})};
    const duplicate = pendingDuplicate(session, resource, requestBody, target);
    if (duplicate) return {duplicate, operation: null, requestBody};
    try {
      const result = store.beginOperation({id: input.operationId, adult: session.adult, resource, intent: {action: 'upload', target}, requestBody, metadata: {...metadata, attempted: false}});
      return {duplicate: null, operation: result.operation, created: result.created, requestBody};
    } catch { throw new HttpError(409, 'This save ID already has different data.'); }
  }

  async function sendUpload(session: Session, input: PhotoInput, prepared: ReturnType<typeof prepareUpload>): Promise<Record<string, any> | null> {
    const {config, target, resource, fields} = prepared;
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
    form.set(resource === 'portrait' ? 'picture' : 'image', new Blob([input.bytes], {type: input.mime}), `photo.${input.mime.split('/')[1]}`);
    const op = store.getOperation(input.operationId);
    if (!op) throw new HttpError(409, 'The photo save is missing.');
    store.updateUnresolvedOperationMetadata(input.operationId, {...(object(op.metadata) || {}), attempted: true});
    try {
      return object(await sessions.request(session.sessionId, {resource: resource === 'portrait' ? 'children' : 'notes', method: resource === 'portrait' || target ? 'PATCH' : 'POST', ...(resource === 'portrait' ? {id: config.slug} : target ? {id: target} : {}), body: form}));
    } catch (error) {
      if (error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 408) { store.finishOperation(input.operationId, 'failed'); throw error; }
      return null;
    }
  }

  function saveConfirmed(input: PhotoInput, prepared: ReturnType<typeof prepareUpload>, baseline: {owner: string; baselineIds: string[]}, result: Record<string, any> | null): Record<string, unknown> {
    const {config, target, resource, metadata} = prepared;
    if (!result || !Number.isSafeInteger(result.id)) return {status: 'pending', operationId: input.operationId};
    if ((resource === 'portrait' && Number(result.id) !== config.id) || (target && Number(result.id) !== Number(target))) return {status: 'pending', operationId: input.operationId};
    if (resource === 'portrait') store.finishOperation(input.operationId, 'saved', `children:${config.id}`);
    else {
      const existingMeta = target ? store.getEventMetadata('notes', target) : null;
      store.putEventMetadata({resource: 'notes', babyBuddyId: String(result.id), adult: existingMeta?.adult || baseline.owner, metadata: {...(object(existingMeta?.metadata) || {}), ...metadata, childId: config.id, photoOperationId: input.operationId}});
      store.finishOperation(input.operationId, 'saved', `notes:${result.id}`);
    }
    return {status: 'saved', operationId: input.operationId, id: `${resource === 'portrait' ? 'children' : 'notes'}:${result.id}`};
  }

  async function baselineStillMatches(session: Session, prepared: ReturnType<typeof prepareUpload>, operation: Operation): Promise<boolean> {
    const expected = object(object(operation.requestBody)?.baseline);
    const target = prepared.target;
    if (!expected) return !target && prepared.resource === 'photo';
    if (target) {
      const row = object(await sessions.request(session.sessionId, {resource: 'notes', method: 'GET', id: target}));
      if (!row || childId(row) !== prepared.config.id || !matchesNote({note: expected.note, time: expected.time}, row, prepared.config.id)) return false;
      return (await readImage(row.image)).digest === expected.digest;
    }
    if (prepared.resource !== 'portrait') return false;
    const row = await childRow(session, prepared.config);
    if (expected.digest === null) return row.picture == null;
    if (typeof row.picture !== 'string') return false;
    return (await readImage(row.picture)).digest === expected.digest;
  }

  async function upload(session: Session, input: PhotoInput, portrait = false): Promise<Record<string, unknown>> {
    const prepared = prepareUpload(session, input, portrait);
    const existing = inputForOperation(input.operationId, session, prepared.resource);
    const replay = matchReplay(existing, session, prepared.resource, prepared.config.id, prepared.target, prepared.fields, input.digest);
    if (replay) {
      if (!existing || existing.state !== 'pending') return replay;
      if (object(existing.metadata)?.attempted !== false) {
        if (prepared.resource === 'photo' && !prepared.target) return replay;
        const checked = await operation(session, input.operationId);
        if (checked.status === 'saved') return checked;
        const baseline = await captureBaseline(session, prepared.config, prepared.target, portrait, prepared.fields);
        if (!await baselineStillMatches(session, prepared, existing)) return {status: 'pending', operationId: input.operationId, needsReview: true, conflict: true, error: 'The photo changed elsewhere. Review it before saving again.'};
        const result = await sendUpload(session, input, prepared);
        return saveConfirmed(input, prepared, baseline, result);
      }
      const baseline = await captureBaseline(session, prepared.config, prepared.target, portrait, prepared.fields);
      if (!await baselineStillMatches(session, prepared, existing)) return {status: 'pending', operationId: input.operationId, needsReview: true, conflict: true, error: 'The photo changed elsewhere. Review it before saving again.'};
      const result = await sendUpload(session, input, prepared);
      if (result && prepared.resource === 'photo' && !prepared.target && childId(result) !== prepared.config.id) return {status: 'pending', operationId: input.operationId};
      return saveConfirmed(input, prepared, baseline, result);
    }
    const baseline = await captureBaseline(session, prepared.config, prepared.target, portrait, prepared.fields);
    const begun = beginUpload(session, input, prepared, baseline);
    if (begun.duplicate) return begun.duplicate;
    if (!begun.created) {
      if (begun.operation?.state === 'pending' && object(begun.operation.metadata)?.attempted === false) {
        if (!await baselineStillMatches(session, prepared, begun.operation)) return {status: 'pending', operationId: input.operationId, needsReview: true, conflict: true, error: 'The photo changed elsewhere. Review it before saving again.'};
        const result = await sendUpload(session, input, prepared);
        return saveConfirmed(input, prepared, baseline, result);
      }
      return {status: begun.operation?.state || 'pending', operationId: input.operationId, needsReview: true};
    }
    const result = await sendUpload(session, input, prepared);
    if (result && prepared.resource === 'photo' && !prepared.target && childId(result) !== prepared.config.id) return {status: 'pending', operationId: input.operationId};
    return saveConfirmed(input, prepared, baseline, result);
  }

  async function send(session: Session, res: ServerResponse, id?: string): Promise<void> {
    const config = child();
    if (id && !/^notes:\d+$/.test(id)) throw new HttpError(404, 'Photo not found.');
    requirePermission(session, id ? 'core.view_note' : 'core.view_child');
    const row = object(await sessions.request(session.sessionId, {resource: id ? 'notes' : 'children', method: 'GET', id: id ? id.slice(6) : config.slug}));
    if (!row || (id ? childId(row) : Number(row.id)) !== config.id) throw new HttpError(404, 'Photo not found.');
    const image = await readImage(id ? row.image : row.picture);
    const etag = `"${image.digest}"`;
    const unchanged = etagMatches(res.req?.headers['if-none-match'], etag);
    res.writeHead(unchanged ? 304 : 200, {'content-type': image.mime, 'cache-control': 'private, no-cache', etag, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox"});
    res.end(unchanged ? undefined : image.bytes);
  }

  return {upload, send, operation};
}
