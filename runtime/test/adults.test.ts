import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../server/http.ts';
import { parseHouseholdFile } from '../server/household-file.ts';
import { saveConfiguration, trustedConfiguration } from '../server/configure.ts';
import { createRecords } from '../server/records.ts';
import { createSessionService, readTrustedAccounts } from '../server/session.ts';
import { openStore } from '../server/store.ts';

// Invented adults only. Each household is a file's contents: one object for each adult.
type Row = { username: string; role: string; label?: string };
const households: Record<string, Row[]> = {
  'one owner': [{ username: 'river', role: 'owner' }],
  'one owner and one caregiver': [{ username: 'river', role: 'owner' }, { username: 'wren', role: 'caregiver', label: 'Grandma' }],
  'five adults': [
    { username: 'river', role: 'owner' }, { username: 'ash', role: 'owner' }, { username: 'wren', role: 'caregiver' },
    { username: 'moss', role: 'caregiver' }, { username: 'fern', role: 'caregiver' },
  ],
};
const ownerGrants = ['child', 'feeding', 'diaperchange', 'sleep'].flatMap(model => ['view', 'add', 'change', 'delete'].map(action => `core.${action}_${model}`));
const caregiverGrants = ownerGrants.filter(grant => !grant.startsWith('core.delete_'));
const receipt = { passed: ['Baby Buddy numeric unit readback', 'CSV values escaped and present'] };
const sampleSecret = ['synthetic', 'only'].join('-');
const identityFor = (rows: Row[]) => ({ accounts: rows.map((row, index) => ({ username: row.username, id: index + 2, timerDeletePermission: row.role === 'owner', permissions: row.role === 'owner' ? ownerGrants : caregiverGrants })) });

test('the household file accepts 1 adult or more and refuses a household that cannot work', () => {
  for (const [name, rows] of Object.entries(households)) assert.deepEqual(parseHouseholdFile({ adults: rows }).map(adult => adult.username), rows.map(row => row.username), name);
  const bad: unknown[] = [null, {}, { adults: [] }, { adults: [{ username: 'wren', role: 'caregiver' }] }, { adults: [{ username: 'a', role: 'owner' }, { username: 'a', role: 'caregiver' }] },
    { adults: [{ username: 'a', role: 'admin' }] }, { adults: [{ username: '', role: 'owner' }] }, { adults: [{ username: 'a b', role: 'owner' }] }, { adults: [{ username: 'a', role: 'owner', label: 5 }] }, { adults: [{ username: 'a', role: 'owner', extra: true }] }];
  for (const value of bad) assert.throws(() => parseHouseholdFile(value), /household/i, JSON.stringify(value));
});

test('a label is one text, or one text for each language', () => {
  const read = (label: unknown) => parseHouseholdFile({ adults: [{ username: 'a', role: 'owner', label }] })[0].label;
  assert.equal(read(' Grandma '), 'Grandma');
  assert.deepEqual(read({ en: 'Other', es: 'Otra persona' }), { en: 'Other', es: 'Otra persona' });
  assert.deepEqual(read({ en: 'Other' }), { en: 'Other' });
  for (const bad of ['', '  ', 5, {}, { es: 'Otra' }, { en: 'Other', fr: 'Autre' }, { en: 'Other', es: '' }, 'x'.repeat(101)]) assert.throws(() => read(bad), /label/, JSON.stringify(bad));
});

test('configuration saves each adult, in file order, with the label the screens show', () => {
  const rows = households['five adults'].map(row => row.username === 'wren' ? { ...row, label: 'Grandma' } : row);
  const config = trustedConfiguration(identityFor(rows), receipt, parseHouseholdFile({ adults: rows }));
  const store = openStore(':memory:');
  try {
    saveConfiguration(store, config);
    assert.deepEqual(store.getSetting('app', 'people'), ['river', 'ash', 'wren', 'moss', 'fern']);
    assert.deepEqual(store.getSetting('app', 'labels'), { wren: 'Grandma' });
    assert.equal(store.getSetting('user:2', 'timerDeletePermission'), true);
    assert.equal(store.getSetting('user:4', 'timerDeletePermission'), false);
  } finally { store.close(); }
});

test('configuration refuses identities that do not match the household file', () => {
  const rows = households['one owner and one caregiver'], file = parseHouseholdFile({ adults: rows });
  assert.throws(() => trustedConfiguration(identityFor(rows.slice(0, 1)), receipt, file), /household/i);
  assert.throws(() => trustedConfiguration(identityFor([rows[0], { username: 'stranger', role: 'caregiver' }]), receipt, file), /household|Invalid/);
  assert.throws(() => trustedConfiguration({ accounts: [] }, receipt, file), /household/i);
  assert.throws(() => trustedConfiguration(identityFor(rows), { passed: [] }, file), /live integration/);
});

for (const [name, rows] of Object.entries(households)) {
  test(`sign-in and Home work with ${name}`, async () => {
    const file = parseHouseholdFile({ adults: rows });
    const store = openStore(':memory:');
    const people = rows.map(row => row.username);
    // The credential file lists every adult; the gateway accepts it for exactly the configured people.
    const accounts = readTrustedAccounts(JSON.stringify({ accounts: people.map(username => ({ username, password: sampleSecret })) }), people);
    saveConfiguration(store, trustedConfiguration(identityFor(rows), receipt, file));
    store.putSetting('app', 'child', { id: 7, slug: 'fake' });
    const logins = new Map<string, number>(rows.map((row, index) => [row.username, index + 2]));
    const babyBuddy = {
      login: async (username: string, secret: string) => { assert.equal(secret, sampleSecret); return { cookies: {} as any, csrfToken: 'x', userId: logins.get(username)!, username }; },
      logout: async () => {}, identity: async (session: any) => ({ id: session.userId, username: session.username }),
      request: async (_session: any, request: any) => request.resource === 'children' ? { id: 7, slug: 'fake', first_name: 'Fake', birth_date: '2026-10-01' } : [],
    };
    const sessions = createSessionService({ store, babyBuddy: babyBuddy as any, accounts });
    const records = createRecords({ store, sessions, now: () => new Date('2026-10-25T18:00:00.000Z') });
    try {
      assert.deepEqual(sessions.people(), people);
      for (const row of rows) {
        const session = await sessions.select(row.username, sessions.issueLoginCsrf());
        assert.equal(session.adult, row.username);
        const home: any = await records.state(session);
        assert.equal(home.me, row.username);
        assert.deepEqual(home.people, people);
        assert.equal(home.permissions.resources.changes.delete, row.role === 'owner');
      }
      await assert.rejects(sessions.select('stranger', sessions.issueLoginCsrf()), /Unknown household member/);
    } finally { store.close(); }
  });
}

// Characterization: this passes before and after the household-file change.
test('a caregiver cannot do an owner-only action; an owner can', async () => {
  const store = openStore(':memory:');
  const owner = { sessionId: 'O'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'river' };
  const caregiver = { sessionId: 'G'.repeat(43), csrfToken: 'C'.repeat(43), adult: 'wren' };
  store.createSession({ ...owner, babyBuddyUserId: 2, expiresAt: Date.now() + 60_000 });
  store.createSession({ ...caregiver, babyBuddyUserId: 3, expiresAt: Date.now() + 60_000 });
  store.putSetting('user:2', 'permissions', ownerGrants);
  store.putSetting('user:3', 'permissions', caregiverGrants);
  store.putSetting('app', 'child', { id: 7, slug: 'fake' });
  const sent: any[] = [];
  const sessions = { people: () => ['river', 'wren'], request: async (_sid: string, input: any) => {
    if (input.method === 'GET') return input.resource === 'children' ? { id: 7, slug: 'fake', first_name: 'Fake', birth_date: '2026-10-01' } : { id: 42, child: 7, time: '2026-10-25T14:00:00Z', wet: true };
    sent.push(input.method); return {};
  } };
  const records = createRecords({ store, sessions, now: () => new Date('2026-10-25T18:00:00.000Z') });
  try {
    await assert.rejects(records.deleteEvent(caregiver, 'changes:42', { operationId: '00000000-0000-4000-8000-000000000001' }), (error: any) => error instanceof HttpError && error.status === 403);
    assert.deepEqual(sent, []);
    const result: any = await records.deleteEvent(owner, 'changes:42', { operationId: '00000000-0000-4000-8000-000000000002' });
    assert.equal(result.status, 'saved');
    assert.deepEqual(sent, ['DELETE']);
  } finally { store.close(); }
});
