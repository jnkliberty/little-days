import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHousehold } from '../server/household.ts';
import { createRecords } from '../server/records.ts';
import { createSessionService } from '../server/session.ts';
import { openStore } from '../server/store.ts';
import { HttpError } from '../server/http.ts';

const adult = { sessionId: 'A'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'Sage' };
const op = (tail: string) => `00000000-0000-4000-8000-0000000000${tail}`;

function fixture() {
  const store = openStore(':memory:');
  store.createSession({ sessionId: adult.sessionId, csrfToken: adult.csrfToken, adult: adult.adult, babyBuddyUserId: 17, expiresAt: Date.now() + 60_000 });
  const sessions = { get: (id: string) => id === adult.sessionId ? adult : null };
  const records = { state: async () => ({ me: adult.adult, people: ['Sage', 'Rowan'], entries: [{ id: 'changes:1', t: 60, type: 'diaper', by: '=2+2', note: 'He said "ok"' }], today: '2026-10-25' }) };
  return { store, sessions, records };
}

test('preferences validate web values and stay private to the authenticated adult', () => {
  const { store, sessions, records } = fixture(), household = createHousehold({ store, sessions, records: records as never });
  try {
    assert.equal(household.savePreference(adult, { operationId: op('01'), lang: 'es', units: 'us', palette: 'Sorbet', night: true }).status, 'saved');
    assert.deepEqual(store.getSetting('user:17', 'preferences'), { lang: 'es', units: 'us', palette: 'Sorbet', night: true });
    assert.throws(() => household.savePreference(adult, { operationId: op('02'), lang: 'fr', units: 'metric', palette: 'Sorbet', night: false }), (error: unknown) => error instanceof HttpError && error.status === 400);
    assert.throws(() => household.savePreference(adult, { operationId: op('03'), lang: 'en', units: 'metric', palette: 'unknown', night: false }), (error: unknown) => error instanceof HttpError && error.status === 400);
  } finally { store.close(); }
});

test('the optional growth chart retains the child and table choice and can be cleared', async () => {
  const { store, sessions, records } = fixture(), household = createHousehold({ store, sessions, records: records as never });
  const settings = { lang: 'en', units: 'metric', palette: 'Sorbet', night: false };
  try {
    const growthChart = { childId: 7, sex: 'girls' };
    assert.equal(household.savePreference(adult, { ...settings, operationId: op('11'), growthChart }).status, 'saved');
    assert.deepEqual((await household.state(adult)).preferences.growthChart, growthChart);
    assert.throws(() => household.savePreference(adult, { ...settings, operationId: op('12'), growthChart: { childId: 7, sex: 'any' } }), { status: 400 });
    assert.equal(household.savePreference(adult, { ...settings, operationId: op('13'), growthChart: null }).status, 'saved');
    assert.equal((await household.state(adult)).preferences.growthChart, undefined);
  } finally { store.close(); }
});

// Plan 2026-11-21, Group 1: each adult can turn the forecast facts off. An older client sends no `forecast` and still saves.
test('the optional forecast switch saves on or off, refuses other values, and is not required', async () => {
  const { store, sessions, records } = fixture(), household = createHousehold({ store, sessions, records: records as never });
  const settings = { lang: 'en', units: 'metric', palette: 'Sorbet', night: false };
  try {
    assert.equal(household.savePreference(adult, { ...settings, operationId: op('21'), forecast: 'off' }).status, 'saved');
    assert.equal((await household.state(adult)).preferences.forecast, 'off');
    assert.throws(() => household.savePreference(adult, { ...settings, operationId: op('22'), forecast: 'maybe' }), { status: 400 });
    assert.equal(household.savePreference(adult, { ...settings, operationId: op('23') }).status, 'saved');
    assert.equal((await household.state(adult)).preferences.forecast, undefined);
  } finally { store.close(); }
});

test('duty and reminders require known adults, deduplicate, and limit opt-in to self', async () => {
  const { store, sessions, records } = fixture();
  store.putSetting('app', 'people', ['Sage', 'Rowan']);
  const household = createHousehold({ store, sessions, records: records as never });
  const reminder = { recipient: 'Sage', what: 'feed', scheduledAt: '2026-10-25T16:30:00-06:00', enabled: true };
  try {
    const duty = { operationId: op('04'), who: 'Rowan', note: 'Home' };
    assert.equal(household.saveDuty(adult, duty).status, 'saved');
    assert.equal(household.saveDuty(adult, duty).status, 'saved');
    assert.equal((await household.state(adult)).dutyNoteBy, 'Sage');
    assert.equal((await household.state(adult)).dutyNote, 'Home');
    assert.equal(store.listDutyHistory().length, 1);
    assert.throws(() => household.saveDuty(adult, { ...duty, who: 'Unknown' }), (error: unknown) => error instanceof HttpError && error.status === 400);
    const saved = household.saveReminder(adult, { ...reminder, operationId: op('05') });
    assert.equal(saved.status, 'saved');
    assert.equal((saved as { delivery: string }).delivery, 'unavailable');
    assert.equal(household.saveReminder(adult, { ...reminder, operationId: op('05') }).status, 'saved');
    const savedId = (saved as {id: string}).id;
    assert.equal(savedId, 'reminder:00000000-0000-4000-8000-000000000005');
    assert.equal(household.saveReminder(adult, { ...reminder, enabled: false, operationId: op('08') }, savedId).status, 'saved');
    assert.throws(() => household.saveReminder(adult, { ...reminder, recipient: 'Rowan', operationId: op('06') }), (error: unknown) => error instanceof HttpError && error.status === 403);
    const state = await household.state(adult);
    assert.equal(state.duty, 'Rowan');
    assert.equal((state.dutyHistory as unknown[]).length, 1);
    assert.equal((state.people as {name: string; onDuty: boolean}[]).find(person => person.name === 'Rowan')?.onDuty, true);
    assert.equal((state.reminders as {delivery: string}[])[0].delivery, 'unavailable');
    assert.equal((state.entries as {type: string}[]).filter(entry => entry.type === 'reminder').length, 1);
  } finally { store.close(); }
});

test('CSV export quotes fields and prefixes formula-leading values', async () => {
  const { store, sessions, records } = fixture(), household = createHousehold({ store, sessions, records: records as never });
  try {
    const csv = await household.exportCsv(adult, { from: '2026-10-25', to: '2026-10-26' });
    assert.match(csv, /"'=2\+2"/);
    assert.match(csv, /"He said ""ok"""/);
    assert.match(csv, /"2026-10-25","1:00 AM"/);
    assert.match(csv, /\{""type"":""diaper""/);
  } finally { store.close(); }
});

test('CSV export formats records with seconds as whole clock minutes across midnight', async () => {
  const records = { state: async () => ({ today: '2026-10-25', entries: [
    { t: 60.5, type: 'diaper' },
    { t: -0.5, type: 'diaper' },
    { t: 1440.5, type: 'diaper' },
  ] }) };
  const household = createHousehold({ store: {} as never, sessions: {} as never, records: records as never });
  const csv = await household.exportCsv(adult, { from: '2026-10-24', to: '2026-10-27' });
  assert.match(csv, /"2026-10-25","1:00 AM"/);
  assert.match(csv, /"2026-10-24","11:59 PM"/);
  assert.match(csv, /"2026-10-26","12:00 AM"/);
});

test('new duty handoffs append once and survive a store restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'little-days-duty-')), path = join(dir, 'store.sqlite');
  let store = openStore(path);
  try {
    store.appendDutyHistory({ operationId: op('11'), who: 'Rowan', note: 'Shift A', adult: 'Sage', occurredAt: '2026-10-25T12:00:00.000Z' });
    store.appendDutyHistory({ operationId: op('11'), who: 'Rowan', note: 'Shift A', adult: 'Sage', occurredAt: '2026-10-25T12:00:00.000Z' });
    store.appendDutyHistory({ operationId: op('12'), who: 'Sage', note: 'Bottle at 2 am', adult: 'Rowan', occurredAt: '2026-10-25T13:00:00.000Z' });
    assert.equal(store.listDutyHistory().length, 2);
    store.close();
    store = openStore(path);
    assert.deepEqual(store.listDutyHistory().map(item => item.who), ['Rowan', 'Sage']);
    assert.equal(store.getSetting('app', 'duty'), 'Sage');
    assert.equal(store.getSetting('app', 'dutyNote'), 'Bottle at 2 am');
    assert.equal(store.listDutyHistory()[1].note, 'Bottle at 2 am');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('records use the real three-argument SessionService request contract', async () => {
  const store = openStore(':memory:');
  const upstream = {
    login: async (username: string) => ({ cookies: new Map(), csrfToken: 'unused', userId: 17, username }),
    request: async (_session: unknown, request: {resource: string; method: string}) => {
      if (request.resource === 'changes' && request.method === 'POST') return { id: 55 };
      if (request.resource === 'changes' && request.method === 'GET') return [];
      throw new Error('Unexpected upstream request');
    },
    identity: async (session: {userId: number; username: string}) => ({ id: session.userId, username: session.username }),
    logout: async () => {},
  };
  const sessions = createSessionService({ store, babyBuddy: upstream });
  try {
    const session = await sessions.login('Sage', 'password', sessions.issueLoginCsrf());
    store.putSetting('user:17', 'permissions', ['core.add_diaperchange', 'core.view_diaperchange', 'core.view_child']);
    store.putSetting('app', 'child', { id: 7, slug: 'ada' });
    const records = createRecords({ store, sessions });
    const result = await records.createEvent(session, { operationId: op('07'), event: { type: 'diaper', kind: 'W', time: '2026-10-25T16:00:00Z' } });
    assert.equal(result.status, 'saved');
    assert.equal(result.id, 'changes:55');
  } finally { store.close(); }
});
