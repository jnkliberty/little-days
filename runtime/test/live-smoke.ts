import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBabyBuddyClient } from '../server/babybuddy.ts';
import { createApp } from '../server/app.ts';
import { createHousehold } from '../server/household.ts';
import { createPhotos } from '../server/photos.ts';
import { createRecords } from '../server/records.ts';
import { createRouter } from '../server/router.ts';
import { readHouseholdFile, type Adult } from '../server/household-file.ts';
import { createSessionService } from '../server/session.ts';
import { savePasscode } from '../server/passcode.ts';
import { openStore } from '../server/store.ts';
import { createTimers } from '../server/timers.ts';

type Account = { username: string; password: string };
type Identity = { username: string; id: number; timerDeletePermission: boolean; permissions: string[] };
type Auth = { cookie: string; csrf: string; username: string };
type FixtureRow = { resource: string; id: string };
type Context = { url: string; origin: string; auth: Auth; results: string[]; rows: FixtureRow[]; store: ReturnType<typeof openStore>; now: { value: number } };
let checkLabel = 'setup';
const COOKIE = '__Host-little-days';
// The smoke runs its own gateway with a one-time passcode, so it needs no real one.
const SMOKE_PASSCODE = randomBytes(12).toString('hex');
const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4ducEAAU2Aouikb+KAAAAAElFTkSuQmCC', 'base64');

export function args(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') return { help: '1' };
    if (argv[i] === '--receipt-only') { result['receipt-only'] = '1'; continue; }
    if (!argv[i].startsWith('--') || !argv[i + 1]) throw new Error('invalid arguments');
    result[argv[i].slice(2)] = argv[++i];
  }
  return result;
}

function configFile<T>(path: string, secret = false): T {
  const info = statSync(path);
  if (!info.isFile() || (secret && (info.mode & 0o077) !== 0)) throw new Error('unsafe config file');
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function accountsFrom(value: unknown): Account[] {
  if (!isObject(value) || !Array.isArray(value.accounts)) throw new Error('invalid credentials');
  return value.accounts.map(item => {
    if (!isObject(item) || typeof item.username !== 'string' || typeof item.password !== 'string') throw new Error('invalid credentials');
    return { username: item.username, password: item.password };
  });
}

function identitiesFrom(value: unknown): Identity[] {
  if (!isObject(value) || !Array.isArray(value.accounts)) throw new Error('invalid identities');
  return value.accounts.map(item => {
    if (!isObject(item) || typeof item.username !== 'string' || !Number.isSafeInteger(item.id) || typeof item.timerDeletePermission !== 'boolean' || !Array.isArray(item.permissions) || item.permissions.some(permission => typeof permission !== 'string')) throw new Error('invalid identities');
    return { username: item.username, id: Number(item.id), timerDeletePermission: item.timerDeletePermission, permissions: item.permissions as string[] };
  });
}

const RECEIPT_STEPS = ['child setup', 'measurement roundtrip', 'CSV export'];
const FULL_STEPS = ['child setup', 'measurement roundtrip', 'caregiver permissions', 'event roundtrip', 'sleep edits and split', 'appointment and visit roundtrip', 'photo upload', 'cross-adult timer', 'earlier switch and side correction', 'CSV export'];
// Receipt-only mode runs the two checks that configure.ts needs (unit readback, CSV) and nothing else.
export const checkPlan = (receiptOnly: boolean): string[] => receiptOnly ? RECEIPT_STEPS : FULL_STEPS;

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertAccounts(accounts: Account[], identities: Identity[], household: Adult[]): void {
  if (accounts.length < 1 || new Set(accounts.map(account => account.username)).size !== accounts.length) throw new Error('at least one adult account is required');
  if (accounts.length !== household.length || accounts.some(account => !household.some(adult => adult.username === account.username))) throw new Error('credentials do not match the household file');
  const ids = new Map(identities.map(identity => [identity.username, identity]));
  if (accounts.some(account => !ids.has(account.username))) throw new Error('identity file does not match credentials');
}

function responseCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie') || '';
  const pair = cookie.split(';', 1)[0];
  if (!pair.startsWith(`${COOKIE}=`)) throw new Error('login cookie missing');
  return pair;
}

async function login(url: string, origin: string, account: Account): Promise<Auth> {
  const preflight = await fetch(`${url}/api/session`);
  const csrfBody = await preflight.json() as { csrf?: string };
  if (!preflight.ok || typeof csrfBody.csrf !== 'string') throw new Error('session preflight failed');
  const response = await fetch(`${url}/api/session`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-csrf-token': csrfBody.csrf }, body: JSON.stringify({username: account.username, passcode: SMOKE_PASSCODE}) });
  const body = await response.json() as { me?: string; csrf?: string };
  if (!response.ok || body.me !== account.username || typeof body.csrf !== 'string') throw new Error('adult login failed');
  return { cookie: responseCookie(response), csrf: body.csrf, username: account.username };
}

async function api(context: Context, path: string, method = 'GET', body?: unknown, auth = context.auth): Promise<any> {
  checkLabel = `${method} ${path}`;
  const headers: Record<string, string> = { cookie: auth.cookie };
  if (method !== 'GET') Object.assign(headers, { origin: context.origin, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' });
  const response = await fetch(`${context.url}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data: any = {};
  try { data = await response.json(); } catch { /* Export and photo paths are read separately. */ }
  if (!response.ok) throw new Error(`request failed: ${method} ${path} (${response.status})`);
  return data;
}

async function apiStatus(context: Context, path: string, body: unknown, auth: Auth, method = 'POST'): Promise<number> {
  checkLabel = `${method} ${path}`;
  const response = await fetch(`${context.url}${path}`, { method, headers: { cookie: auth.cookie, origin: context.origin, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return response.status;
}

function check(context: Context, ok: unknown, label: string): asserts ok {
  checkLabel = label;
  assert.ok(ok, label);
  context.results.push(label);
}

function ranges(now: number): { start: string; end: string; point: string } {
  const start = new Date(now - 4 * 60 * 60_000);
  const point = start.toISOString();
  return { start: point, end: new Date(start.getTime() + 2 * 60_000).toISOString(), point };
}

function events(clock: number): Array<{ label: string; value: Record<string, unknown> }> {
  const result = [
    ['breast feed', { type: 'feed', side: 'L' }],
    ['bottle', { type: 'bottle', milk: 'formula', ml: 63 }],
    ['pump', { type: 'pump', leftMl: 31, rightMl: 17, totalMl: 48 }],
    ['sleep', { type: 'sleep', nap: true }],
    ['diaper', { type: 'diaper', kind: 'B' }],
    ['medicine', { type: 'med', name: 'Runtime fixture', dose: 1, unit: 'ml' }],
    ['temperature', { type: 'temp', c: 36.8 }],
    ['growth', { type: 'growth', kg: 4.321 }],
    ['note', { type: 'note', text: 'Runtime fixture note' }],
    ['milestone', { type: 'other', what: 'mile', title: 'Runtime fixture milestone' }],
    ['solids', { type: 'other', what: 'solids', food: 'Runtime fixture food' }],
    ['tummy time', { type: 'other', what: 'tummy', completed: true }],
    ['bath sidecar', { type: 'other', what: 'bath', completed: true }],
  ] as Array<[string, Record<string, unknown>]>;
  return result.map(([label, value], index) => {
    const range = ranges(clock - (result.length - index) * 12 * 60_000);
    const period = ['feed', 'pump', 'sleep', 'solids', 'tummy'].includes(String(value.type)) || value.what === 'solids' || value.what === 'tummy';
    return { label, value: { ...value, ...(period ? { start: range.start, end: range.end } : { time: range.point }), note: `Little Days test ${label}` } };
  });
}

function resourceId(id: string): FixtureRow {
  const split = id.lastIndexOf(':');
  if (split < 1) throw new Error('write returned an invalid record ID');
  return { resource: id.slice(0, split), id: id.slice(split + 1) };
}

function findEntry(state: any, id: string): any {
  return Array.isArray(state.entries) ? state.entries.find((entry: any) => String(entry.id) === id) : null;
}

async function roundTripEvents(context: Context, clock: number): Promise<void> {
  for (const item of events(clock)) await roundTripEvent(context, item);
}

async function roundTripEvent(context: Context, item: { label: string; value: Record<string, unknown> }): Promise<void> {
  const created = await api(context, '/api/events', 'POST', { operationId: randomUUID(), event: item.value });
  check(context, created.status === 'saved' && typeof created.id === 'string', `${item.label}: create`);
  const id = String(created.id);
  if (!id.startsWith('app:')) context.rows.push(resourceId(id));
  let state = await api(context, '/api/state');
  const loaded = findEntry(state, id);
  check(context, Boolean(loaded) && loaded.by === context.auth.username, `${item.label}: reload and author`);
  if (item.label === 'pump') check(context, loaded.type === 'pump' && loaded.ml === 48 && loaded.sideAmounts?.L === 31 && loaded.sideAmounts?.R === 17, 'pump has one total row and side metadata');
  const edited = await api(context, `/api/events/${encodeURIComponent(id)}`, 'PATCH', { operationId: randomUUID(), event: edit(item.value) });
  check(context, edited.status === 'saved', `${item.label}: edit`);
  state = await api(context, '/api/state');
  check(context, Boolean(findEntry(state, id)), `${item.label}: reload edited`);
  const removed = await api(context, `/api/events/${encodeURIComponent(id)}`, 'DELETE', { operationId: randomUUID() });
  check(context, removed.status === 'saved', `${item.label}: delete`);
  state = await api(context, '/api/state');
  check(context, !findEntry(state, id), `${item.label}: verify delete`);
  if (!id.startsWith('app:')) removeRow(context.rows, id);
}

function removeRow(rows: FixtureRow[], id: string): void {
  const index = rows.findIndex(row => `${row.resource}:${row.id}` === id);
  if (index >= 0) rows.splice(index, 1);
}

function edit(value: Record<string, unknown>): Record<string, unknown> {
  const updated = { ...value, note: 'Edited Little Days test value' };
  if (['sleep', 'feed'].includes(String(value.type))) updated.expected = { start: value.start, end: value.end };
  if (value.type === 'note') updated.text = 'Edited Little Days test note';
  if (value.type === 'temp') updated.c = 36.9;
  if (value.type === 'growth') updated.kg = 4.322;
  return updated;
}

async function refusedSleepEdit(context: Context, id: string, event: Record<string, unknown>): Promise<void> {
  const operationId = randomUUID();
  const response = await fetch(`${context.url}/api/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { cookie: context.auth.cookie, origin: context.origin, 'x-csrf-token': context.auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ operationId, event }) });
  const body = await response.json() as { error?: string };
  check(context, response.status === 400 && body.error === 'This time overlaps another entry. Change the start or end.', 'overlapping sleep edit has the overlap message');
  check(context, context.store.getOperation(operationId)?.state === 'failed', 'overlapping sleep edit fails its operation');
}

async function sleepEditSplitTest(context: Context, sessions: ReturnType<typeof createSessionService>): Promise<void> {
  const at = (minutes: number) => new Date(context.now.value - minutes * 60_000).toISOString();
  const before = { start: at(600), end: at(480) };
  const first = await api(context, '/api/events', 'POST', { operationId: randomUUID(), event: { type: 'sleep', nap: true, note: 'Fake split note', ...before } });
  check(context, first.status === 'saved', 'split fixture sleep saved');
  context.rows.push(resourceId(first.id));
  const neighbor = await api(context, '/api/events', 'POST', { operationId: randomUUID(), event: { type: 'sleep', nap: true, start: before.end, end: at(450) } });
  check(context, neighbor.status === 'saved', 'adjacent sleep saved');
  context.rows.push(resourceId(neighbor.id));
  const edited = { start: at(599), end: at(481) };
  const event = { type: 'sleep', nap: true, note: 'Fake split note', ...edited, expected: before };
  check(context, (await api(context, `/api/events/${encodeURIComponent(first.id)}`, 'PATCH', { operationId: randomUUID(), event })).status === 'saved', 'sleep start and end edited');
  const read = async (id: string) => sessions.request(context.auth.cookie.slice(`${COOKIE}=`.length), { resource: 'sleep', method: 'GET', id: resourceId(id).id }) as Promise<Record<string, unknown>>;
  const row = await read(first.id);
  check(context, Date.parse(String(row.start)) === Date.parse(edited.start) && Date.parse(String(row.end)) === Date.parse(edited.end), 'edited sleep times read back to the second');
  await refusedSleepEdit(context, first.id, { ...event, end: at(479), expected: edited });
  const split = { wokeAt: at(560), sleptAt: at(550), expected: edited };
  const operationId = randomUUID();
  check(context, (await api(context, `/api/events/${encodeURIComponent(first.id)}/split`, 'POST', { operationId, split })).status === 'saved', 'sleep split saved');
  const ids = context.store.getOperation(operationId)?.babyBuddyIds || [];
  check(context, ids.length === 2 && ids[0] === first.id, 'split stores both sleep IDs');
  context.rows.push(resourceId(ids[1]));
  const shortened = await read(first.id), second = await read(ids[1]), state = await api(context, '/api/state');
  check(context, Date.parse(String(shortened.start)) === Date.parse(edited.start) && Date.parse(String(shortened.end)) === Date.parse(split.wokeAt) && Date.parse(String(second.start)) === Date.parse(split.sleptAt) && Date.parse(String(second.end)) === Date.parse(edited.end), 'split reads back two correct sleep periods');
  check(context, findEntry(state, first.id)?.note === 'Fake split note' && findEntry(state, ids[1])?.note === '' && second.nap === true && findEntry(state, ids[1])?.by === findEntry(state, first.id)?.by, 'split keeps the nap and author, with the note on the first sleep');
  for (const id of [ids[1], neighbor.id, first.id]) {
    check(context, (await api(context, `/api/events/${encodeURIComponent(id)}`, 'DELETE', { operationId: randomUUID() })).status === 'saved', 'split fixture sleep deleted');
    check(context, !findEntry(await api(context, '/api/state'), id), 'split fixture deletion read back');
    removeRow(context.rows, id);
  }
}

function png(): Blob {
  return new Blob([IMAGE], { type: 'image/png' });
}

async function photoTest(context: Context): Promise<void> {
  const data = new FormData();
  const operationId = randomUUID();
  const range = ranges(Date.now());
  data.set('operationId', operationId);
  data.set('event', JSON.stringify({ type: 'note', text: 'Little Days runtime photo fixture', time: range.point }));
  data.set('file', png(), 'little-days-runtime.png');
  const response = await fetch(`${context.url}/api/photos`, { method: 'POST', headers: { cookie: context.auth.cookie, origin: context.origin, 'x-csrf-token': context.auth.csrf }, body: data });
  const body = await response.json() as { status?: string };
  check(context, response.ok && body.status === 'saved', 'photo upload');
  const id = context.store.getOperation(operationId)?.babyBuddyId;
  if (!id) throw new Error('photo upload did not link its fixture record');
  context.rows.push(resourceId(id));
  check(context, Boolean(findEntry(await api(context, '/api/state'), id)), 'photo reload');
  const imageResponse = await fetch(`${context.url}/api/photos/${encodeURIComponent(id)}`, { headers: { cookie: context.auth.cookie } });
  check(context, imageResponse.ok && (imageResponse.headers.get('content-type') || '').startsWith('image/'), 'photo read');
  const deleted = await api(context, `/api/events/${encodeURIComponent(id)}`, 'DELETE', { operationId: randomUUID() });
  check(context, deleted.status === 'saved', 'photo delete');
  context.rows.pop();
  const portrait = new FormData();
  portrait.set('operationId', randomUUID());
  portrait.set('file', png(), 'little-days-portrait.png');
  const portraitResponse = await fetch(`${context.url}/api/child/portrait`, { method: 'PUT', headers: { cookie: context.auth.cookie, origin: context.origin, 'x-csrf-token': context.auth.csrf }, body: portrait });
  const portraitBody = await portraitResponse.json() as { status?: string };
  check(context, portraitResponse.ok && portraitBody.status === 'saved', 'portrait upload');
  const portraitRead = await fetch(`${context.url}/api/child/portrait`, { headers: { cookie: context.auth.cookie } });
  check(context, portraitRead.ok && (portraitRead.headers.get('content-type') || '').startsWith('image/'), 'portrait read');
}

async function appointmentVisitRoundTrip(context: Context, childId: number): Promise<void> {
  context.now.value = Date.now();
  const createdAt = context.now.value + 60_000;
  const appointment = { type: 'other', what: 'appointment', title: 'Little Days smoke checkup', provider: 'Dr Runtime', location: 'Fixture clinic', note: 'Appointment fixture', time: new Date(createdAt).toISOString() };
  const created = await api(context, '/api/events', 'POST', { operationId: randomUUID(), event: appointment });
  check(context, created.status === 'saved' && typeof created.id === 'string' && created.id.startsWith('app:'), 'appointment fixture create');
  const appointmentId = String(created.id);
  try {
    let state = await api(context, '/api/state');
    let upcoming = state.upcomingAppointments?.find((entry: any) => entry.id === appointmentId);
    check(context, upcoming?.title === appointment.title && upcoming.provider === appointment.provider, 'appointment appears in upcoming readback');
    const advancedTime = { ...appointment, title: 'Little Days smoke checkup corrected', provider: 'Dr Updated' };
    context.now.value = createdAt + 1_000;
    const edited = await api(context, `/api/events/${encodeURIComponent(appointmentId)}`, 'PATCH', { operationId: randomUUID(), event: advancedTime });
    check(context, edited.status === 'saved', 'historical appointment details remain editable');
    state = await api(context, '/api/state');
    const history = findEntry(state, appointmentId);
    check(context, history?.title === advancedTime.title && history?.provider === advancedTime.provider && state.upcomingAppointments.length === 0, 'past appointment edit retains its time and leaves upcoming');
  } finally {
    const removed = await api(context, `/api/events/${encodeURIComponent(appointmentId)}`, 'DELETE', { operationId: randomUUID() });
    check(context, removed.status === 'saved', 'appointment fixture cleanup');
    context.now.value = Date.now();
  }

  const operationId = randomUUID();
  const visit = { type: 'note', what: 'visit', provider: 'Dr Runtime', reason: 'Routine smoke check', observations: 'Fixture measurements', instructions: 'Fixture follow-up', weightKg: 4.321, lengthCm: 51.2, headCm: 34.1, followUpDate: '2026-12-01', time: new Date(context.now.value - 60_000).toISOString() };
  const form = new FormData();
  form.set('operationId', operationId);
  form.set('event', JSON.stringify(visit));
  form.set('file', new Blob([IMAGE], { type: 'image/png' }), 'little-days-visit-fixture.png');
  checkLabel = 'POST /api/photos (visit fixture)';
  const response = await fetch(`${context.url}/api/photos`, { method: 'POST', headers: { cookie: context.auth.cookie, origin: context.origin, 'x-csrf-token': context.auth.csrf }, body: form });
  const body = await response.json() as { status?: string };
  check(context, response.ok && body.status === 'saved', 'structured visit photo create');
  const visitId = context.store.getOperation(operationId)?.babyBuddyId;
  if (!visitId) throw new Error('visit photo fixture did not link its note');
  context.rows.push(resourceId(visitId));
  try {
    const state = await api(context, '/api/state');
    const saved = findEntry(state, visitId);
    check(context, Number(state.child?.id) === childId, 'visit fixture belongs to the synthetic child');
    check(context, saved?.what === 'visit' && saved.provider === visit.provider && saved.reason === visit.reason && saved.weightKg === visit.weightKg && saved.lengthCm === visit.lengthCm && saved.headCm === visit.headCm && saved.followUpDate === visit.followUpDate, 'structured visit metadata readback');
    check(context, typeof saved?.photo === 'string', 'visit photo metadata readback');
    const imageResponse = await fetch(`${context.url}/api/photos/${encodeURIComponent(visitId)}`, { headers: { cookie: context.auth.cookie } });
    check(context, imageResponse.ok && (imageResponse.headers.get('content-type') || '').startsWith('image/'), 'visit photo readback');
  } finally {
    const removed = await api(context, `/api/events/${encodeURIComponent(visitId)}`, 'DELETE', { operationId: randomUUID() });
    check(context, removed.status === 'saved', 'visit fixture cleanup');
    removeRow(context.rows, visitId);
  }
}

async function exportTest(context: Context): Promise<void> {
  const range = ranges(Date.now());
  const created = await api(context, '/api/events', 'POST', { operationId: randomUUID(), event: { type: 'note', title: '=1+1', text: 'Little Days smoke export marker', time: range.point } });
  check(context, created.status === 'saved' && typeof created.id === 'string', 'CSV fixture write');
  if (!String(created.id).startsWith('app:')) context.rows.push(resourceId(String(created.id)));
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const response = await fetch(`${context.url}/api/export?from=${day(-7)}&to=${day(2)}`, { headers: { cookie: context.auth.cookie } });
  const csv = await response.text();
  check(context, response.ok && (response.headers.get('content-type') || '').includes('text/csv'), 'CSV export');
  check(context, csv.includes("'=1+1") && csv.includes('Little Days smoke export marker'), 'CSV values escaped and present');
}

async function verifyUnits(sessions: ReturnType<typeof createSessionService>, auth: Auth, store: ReturnType<typeof openStore>, childId: number, rows: FixtureRow[]): Promise<void> {
  const sessionId = auth.cookie.slice(`${COOKIE}=`.length);
  const checks = [
    { resource: 'feedings', field: 'amount', value: 63.5, body: { child: childId, start: new Date().toISOString(), end: new Date().toISOString(), type: 'formula', method: 'bottle', amount: 63.5, notes: 'Little Days unit verification' } },
    { resource: 'pumping', field: 'amount', value: 47.25, body: { child: childId, start: new Date(Date.now() - 120_000).toISOString(), end: new Date(Date.now() - 60_000).toISOString(), amount: 47.25, notes: 'Little Days unit verification' } },
    { resource: 'temperature', field: 'temperature', value: 36.75, body: { child: childId, time: new Date().toISOString(), temperature: 36.75, notes: 'Little Days unit verification' } },
    { resource: 'weight', field: 'weight', value: 4.321, body: { child: childId, date: new Date().toISOString().slice(0, 10), weight: 4.321, notes: 'Little Days unit verification' } },
    { resource: 'height', field: 'height', value: 51.23, body: { child: childId, date: new Date().toISOString().slice(0, 10), height: 51.23, notes: 'Little Days unit verification' } },
    { resource: 'head-circumference', field: 'head_circumference', value: 34.56, body: { child: childId, date: new Date().toISOString().slice(0, 10), head_circumference: 34.56, notes: 'Little Days unit verification' } },
  ];
  for (const item of checks) {
    const created = await sessions.request(sessionId, { resource: item.resource, method: 'POST', body: item.body });
    if (!isObject(created) || !Number.isSafeInteger(created.id)) throw new Error('unit verification write failed');
    const row = { resource: item.resource, id: String(created.id) };
    rows.push(row);
    const saved = await sessions.request(sessionId, { resource: item.resource, method: 'GET', id: row.id });
    if (!isObject(saved) || Math.abs(Number(saved[item.field]) - item.value) > 0.00001) throw new Error('unit verification readback failed');
    await sessions.request(sessionId, { resource: item.resource, method: 'DELETE', id: row.id });
    rows.pop();
  }
  store.putSetting('app', 'unitContract', { verified: true, volume: 'ml', temperature: 'C', weight: 'kg', length: 'cm' });
}

async function timerTest(context: Context, store: ReturnType<typeof openStore>, sessions: ReturnType<typeof createSessionService>, clock: { value: number }, owner: Auth, stopper: Auth): Promise<void> {
  clock.value = Date.now() - 120_000;
  const started = await api(context, '/api/timers', 'POST', { operationId: randomUUID(), kind: 'feed', side: 'L' }, owner);
  check(context, started.status === 'saved' && Boolean(started.timerId), 'timer start');
  const stopId = randomUUID();
  const stopperId = store.getSession(stopper.cookie.slice(`${COOKIE}=`.length))?.babyBuddyUserId;
  if (stopperId === undefined || store.getSetting(`user:${stopperId}`, 'timerDeletePermission') !== true) {
    const status = await apiStatus(context, `/api/timers/${started.timerId}/stop`, { operationId: stopId, confirmOther: true }, stopper);
    const active = await api(context, '/api/state', 'GET', undefined, stopper);
    check(context, status === 403 && active.run?.id === started.timerId, 'cross-adult stop denied and timer remains active without grant');
    return;
  }
  clock.value += 30_000;
  const pending = await api(context, `/api/timers/${started.timerId}/stop`, 'POST', { operationId: stopId, confirmOther: true }, stopper);
  check(context, pending.status === 'pending', 'cross-adult stop waits');
  clock.value += 10_001;
  const saved = await api(context, `/api/operations/${stopId}`, 'GET', undefined, stopper);
  check(context, saved.status === 'saved', 'cross-adult stop uses trusted delete grant');
  const operation = store.getOperation(stopId);
  const id = operation?.babyBuddyId;
  if (!id) throw new Error('timer stop did not link its event');
  const row = resourceId(id);
  await api(context, `/api/events/${encodeURIComponent(id)}`, 'DELETE', { operationId: randomUUID() }, stopper);
  removeRow(context.rows, `${row.resource}:${row.id}`);
}

async function timerFeedReadback(context: Context, sessions: ReturnType<typeof createSessionService>, operationId: string, auth: Auth): Promise<{ id: string; feed: any }> {
  const id = context.store.getOperation(operationId)?.babyBuddyId;
  if (!id) throw new Error('timer operation did not link its feed');
  const row = resourceId(id);
  context.rows.push(row);
  const saved = await sessions.request(auth.cookie.slice(`${COOKIE}=`.length), { resource: row.resource, method: 'GET', id: row.id });
  return { id, feed: saved };
}

async function timerFixesTest(context: Context, sessions: ReturnType<typeof createSessionService>, auth: Auth): Promise<void> {
  const receipt = Date.now() - 60_000, at = new Date(receipt - 5 * 60_000).toISOString();
  context.now.value = receipt - 9 * 60_000;
  const started = await api(context, '/api/timers', 'POST', { operationId: randomUUID(), kind: 'feed', side: 'L' }, auth);
  check(context, started.status === 'saved', 'late-switch feed starts');
  context.now.value = receipt;
  const switchId = randomUUID();
  const switching = await api(context, `/api/timers/${started.timerId}/switch`, 'POST', { operationId: switchId, side: 'R', at }, auth);
  check(context, switching.status === 'pending', 'late switch keeps the Undo window');
  context.now.value += 10_001;
  check(context, (await api(context, `/api/operations/${switchId}`, 'GET', undefined, auth)).status === 'saved', 'late switch saves');
  const state = await api(context, '/api/state', 'GET', undefined, auth);
  check(context, state.run?.startedAt === at && state.run?.side === 'R', 'second side starts at the typed switch time');
  const first = await timerFeedReadback(context, sessions, switchId, auth);
  check(context, new Date(first.feed.end).toISOString() === at, 'Baby Buddy first side ends at the typed switch time');
  const changed = await api(context, `/api/timers/${state.run.id}/side`, 'POST', { operationId: randomUUID(), side: 'L' }, auth);
  check(context, changed.status === 'saved', 'second side is corrected while running');
  context.now.value += 20_000;
  const stopId = randomUUID();
  const stopping = await api(context, `/api/timers/${state.run.id}/stop`, 'POST', { operationId: stopId }, auth);
  check(context, stopping.status === 'pending', 'corrected second side stops');
  context.now.value += 10_001;
  check(context, (await api(context, `/api/operations/${stopId}`, 'GET', undefined, auth)).status === 'saved', 'corrected second side saves');
  const second = await timerFeedReadback(context, sessions, stopId, auth);
  check(context, new Date(second.feed.start).toISOString() === at && second.feed.method === 'left breast', 'Baby Buddy second side keeps the switch time and corrected side');
  for (const { id } of [first, second]) {
    await api(context, `/api/events/${encodeURIComponent(id)}`, 'DELETE', { operationId: randomUUID() }, auth);
    removeRow(context.rows, id);
  }
}

async function caregiverTest(context: Context, caregiver: Auth, sessions: ReturnType<typeof createSessionService>): Promise<void> {
  const childConfig = context.store.getSetting('app', 'child');
  if (!isObject(childConfig) || !Number.isSafeInteger(childConfig.id)) throw new Error('fixture child link is missing for caregiver checks');
  const childId = Number(childConfig.id);
  const identityId = context.store.getSession(caregiver.cookie.slice(`${COOKIE}=`.length))?.babyBuddyUserId;
  if (identityId === undefined) throw new Error('caregiver session is not linked to a trusted identity');
  const permissions = context.store.getSetting(`user:${identityId}`, 'permissions');
  if (!Array.isArray(permissions) || !permissions.includes('core.view_note')) throw new Error('caregiver has no trusted read permission for the smoke record');
  const noteTime = new Date(Date.now() - 90_000).toISOString();
  const note = await api(context, '/api/events', 'POST', { operationId: randomUUID(), event: { type: 'note', text: 'Caregiver read fixture', time: noteTime } });
  check(context, note.status === 'saved' && typeof note.id === 'string' && note.id.startsWith('notes:'), 'caregiver read fixture create');
  const noteId = String(note.id);
  context.rows.push(resourceId(noteId));
  const caregiverContext = { ...context, auth: caregiver };
  const state = await api(caregiverContext, '/api/state');
  check(context, Boolean(findEntry(state, noteId)), 'caregiver can read a permitted note');

  check(context, permissions.includes('core.view_weight') && state.permissions?.resources?.weight?.view === true, 'caregiver can view weight records');
  const hidden = ['pumping', 'height', 'head-circumference'];
  for (const resource of hidden) {
    const model = resource === 'head-circumference' ? 'headcircumference' : resource;
    check(context, !permissions.includes(`core.view_${model}`) && state.permissions?.resources?.[resource]?.view === false, `caregiver cannot view ${resource}`);
  }
  const period = ranges(Date.now() - 30 * 60_000);
  const pumpEvent = { type: 'pump', leftMl: 12, rightMl: 0, totalMl: 12, start: period.start, end: period.end, note: 'Forbidden pump fixture' };
  const pump = await api(context, '/api/events', 'POST', { operationId: randomUUID(), event: pumpEvent });
  check(context, pump.status === 'saved' && typeof pump.id === 'string' && pump.id.startsWith('pumping:'), 'pump delete fixture create');
  const pumpId = String(pump.id);
  context.rows.push(resourceId(pumpId));
  const hiddenState = await api(caregiverContext, '/api/state');
  check(context, !findEntry(hiddenState, pumpId), 'caregiver state excludes pumping records');

  const sessionId = context.auth.cookie.slice(`${COOKIE}=`.length);
  const before = await sessions.request(sessionId, { resource: 'pumping', method: 'GET', query: { child: childId, limit: 100 } });
  const beforeIds = listedIds(before);
  const addPumpId = randomUUID();
  const deniedAdd = await apiStatus(caregiverContext, '/api/events', { operationId: addPumpId, event: pumpEvent }, caregiver);
  check(context, deniedAdd === 403 && !context.store.getOperation(addPumpId), 'caregiver pump create denied before save');
  const after = await sessions.request(sessionId, { resource: 'pumping', method: 'GET', query: { child: childId, limit: 100 } });
  check(context, stableIds(beforeIds) === stableIds(listedIds(after)), 'denied pump create writes no Baby Buddy row');

  const deleteId = randomUUID();
  const deniedDelete = await apiStatus(caregiverContext, `/api/events/${encodeURIComponent(pumpId)}`, { operationId: deleteId }, caregiver, 'DELETE');
  check(context, deniedDelete === 403 && !context.store.getOperation(deleteId), 'caregiver pump delete denied before save');
  const existing = await sessions.request(sessionId, { resource: 'pumping', method: 'GET', id: pumpId.slice('pumping:'.length) });
  check(context, isObject(existing) && Number(existing.id) === Number(pumpId.slice('pumping:'.length)), 'denied pump delete leaves Baby Buddy row');

  for (const id of [pumpId, noteId]) {
    const removed = await api(context, `/api/events/${encodeURIComponent(id)}`, 'DELETE', { operationId: randomUUID() });
    check(context, removed.status === 'saved', `caregiver smoke fixture cleanup ${id.split(':')[0]}`);
    removeRow(context.rows, id);
  }
}

function listedIds(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.results) ? value.results : [];
  return rows.filter(isObject).map(row => String(row.id)).sort();
}

function stableIds(values: string[]): string {
  return values.join(',');
}

function writeCleanup(path: string, fixture: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600, flag: 'w' });
  chmodSync(path, 0o600);
}

function help(): void {
  process.stdout.write('Usage: BABYBUDDY_URL=http://babybuddy:8000 node test/live-smoke.ts --credentials-file FILE --identity-file FILE --household-file FILE --cleanup-summary FILE [--receipt-only]\n');
}

async function run(): Promise<void> {
  const options = args(process.argv.slice(2));
  if (options.help) return help();
  const baseUrl = process.env.BABYBUDDY_URL, credentialsPath = options['credentials-file'], identityPath = options['identity-file'], householdPath = options['household-file'], cleanupPath = options['cleanup-summary'];
  if (!baseUrl || !credentialsPath || !identityPath || !householdPath || !cleanupPath) throw new Error('missing required live-smoke inputs');
  const credentials = accountsFrom(configFile(credentialsPath, true)), identities = identitiesFrom(configFile(identityPath));
  const adults = readHouseholdFile(householdPath);
  assertAccounts(credentials, identities, adults);
  const required = ['core.add_child', 'core.view_child', 'core.add_feeding', 'core.view_feeding', 'core.add_pumping', 'core.view_pumping', 'core.add_sleep', 'core.view_sleep', 'core.add_diaperchange', 'core.view_diaperchange', 'core.add_medication', 'core.view_medication', 'core.add_temperature', 'core.view_temperature', 'core.add_weight', 'core.view_weight', 'core.add_height', 'core.view_height', 'core.add_headcircumference', 'core.view_headcircumference', 'core.add_note', 'core.view_note', 'core.add_tummytime', 'core.view_tummytime'];
  const starter = credentials.find(account => required.every(permission => identities.find(item => item.username === account.username)?.permissions.includes(permission)));
  if (!starter) throw new Error('no adult account has the permissions required for the smoke writes');
  // A household with no caregiver skips the caregiver checks; a household with one adult skips the other-adult timer checks.
  const caregiverAccount = credentials.find(account => adults.find(adult => adult.username === account.username)?.role === 'caregiver');
  const stopper = credentials.find(account => account.username !== starter.username);
  const identityByName = new Map(identities.map(identity => [identity.username, identity]));
  const dir = mkdtempSync(join(tmpdir(), 'little-days-live-smoke-'));
  const store = openStore(join(dir, 'gateway.sqlite'));
  await savePasscode(store, SMOKE_PASSCODE);
  const babyBuddy = createBabyBuddyClient({ baseUrl });
  const sessions = createSessionService({ store, babyBuddy, accounts: credentials });
  const now = { value: Date.now() };
  const records = createRecords({ store, sessions, now: () => new Date(now.value) });
  const timers = createTimers({ store, sessions, records, now: () => now.value });
  const photos = createPhotos({ store, sessions, baseUrl });
  const household = createHousehold({ store, sessions, records });
  const router = createRouter({ store, records, timers, photos, household });
  const origin = 'https://little-days-smoke.invalid';
  const app = createApp({ sessions, origin, webDir: resolve(fileURLToPath(new URL('../web/', import.meta.url))), domain: router.handle });
  await new Promise<void>(resolveListen => app.listen(0, '127.0.0.1', resolveListen));
  const address = app.address();
  if (!address || typeof address === 'string') throw new Error('gateway failed to listen');
  const results: string[] = [], rows: FixtureRow[] = [];
  const fixture = { name: '', childId: null as number | null, slug: '', records: rows, passed: results };
  let cleanupAuth: Auth | null = null;
  let step = 'login';
  checkLabel = 'login';
  try {
    const url = `http://127.0.0.1:${address.port}`;
    const first = await login(url, origin, starter), second = stopper ? await login(url, origin, stopper) : null, caregiver = caregiverAccount ? await login(url, origin, caregiverAccount) : null;
    cleanupAuth = first;
    for (const account of credentials) {
      const identity = identityByName.get(account.username)!;
      store.putSetting(`user:${identity.id}`, 'timerDeletePermission', identity.timerDeletePermission);
      store.putSetting(`user:${identity.id}`, 'permissions', identity.permissions);
    }
    store.putSetting('app', 'people', credentials.map(account => account.username));
    for (const auth of [first, second, caregiver].filter((item): item is Auth => item !== null)) {
      const record = store.getSession(auth.cookie.slice(`${COOKIE}=`.length));
      const identity = identityByName.get(auth.username);
      if (!record || !identity || record.babyBuddyUserId !== identity.id) throw new Error('live Baby Buddy identity does not match trusted identity file');
    }
    const context: Context = { url, origin, auth: first, results, rows, store, now };
    step = 'child setup';
    fixture.name = `LittleDaysRuntimeTest-${randomBytes(4).toString('hex')}`;
    const child = await api(context, '/api/children', 'POST', { operationId: randomUUID(), firstName: fixture.name, birthDate: '2026-10-01' });
    if (child.status !== 'saved') throw new Error('fixture child creation failed');
    const config = store.getSetting('app', 'child');
    if (!isObject(config) || !Number.isSafeInteger(config.id) || typeof config.slug !== 'string') throw new Error('fixture child link missing');
    fixture.childId = Number(config.id); fixture.slug = config.slug;
    check(context, true, 'fixture child setup');
    step = 'measurement roundtrip';
    await verifyUnits(sessions, first, store, fixture.childId, rows);
    check(context, true, 'Baby Buddy numeric unit readback');
    const plan = new Set(checkPlan(options['receipt-only'] === '1'));
    if (plan.has('caregiver permissions')) { step = 'caregiver permissions'; if (caregiver) await caregiverTest(context, caregiver, sessions); }
    if (plan.has('event roundtrip')) { step = 'event roundtrip'; await roundTripEvents(context, Date.now()); }
    if (plan.has('sleep edits and split')) { step = 'sleep edits and split'; await sleepEditSplitTest(context, sessions); }
    if (plan.has('appointment and visit roundtrip')) { step = 'appointment and visit roundtrip'; await appointmentVisitRoundTrip(context, fixture.childId); }
    if (plan.has('photo upload')) { step = 'photo upload'; await photoTest(context); }
    if (plan.has('cross-adult timer')) { step = 'cross-adult timer'; if (second) await timerTest(context, store, sessions, now, first, second); }
    if (plan.has('earlier switch and side correction')) { step = 'earlier switch and side correction'; await timerFixesTest(context, sessions, first); }
    step = 'CSV export';
    await exportTest(context);
    process.stdout.write(`${JSON.stringify({ status: 'passed', checks: results })}\n`);
  } catch {
    process.stderr.write(`Live smoke failed at: ${step} / ${checkLabel}. No credentials or upstream response were printed.\n`);
    process.exitCode = 1;
  } finally {
    if (!fixture.childId && fixture.name && cleanupAuth) {
      try {
        const sessionId = cleanupAuth.cookie.slice(`${COOKIE}=`.length);
        const found = await sessions.request(sessionId, { resource: 'children', method: 'GET', query: { first_name: fixture.name, limit: 5 } });
        const rows = Array.isArray(found) ? found : isObject(found) && Array.isArray(found.results) ? found.results : [];
        const child = rows.find((row: any) => isObject(row) && row.first_name === fixture.name && Number.isSafeInteger(row.id) && typeof row.slug === 'string');
        if (child) { fixture.childId = Number(child.id); fixture.slug = child.slug; }
      } catch { /* Keep the summary without claiming an unverified child ID. */ }
    }
    writeCleanup(cleanupPath, fixture);
    await new Promise<void>((resolveClose, reject) => app.close(error => error ? reject(error) : resolveClose()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  run().catch(() => { process.stderr.write('Live smoke could not start. Check required inputs and see the cleanup summary.\n'); process.exitCode = 1; });
}
