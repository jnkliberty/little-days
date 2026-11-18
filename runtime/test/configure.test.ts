import assert from 'node:assert/strict';
import test from 'node:test';
import { trustedConfiguration } from '../server/configure.ts';
import { parseHouseholdFile } from '../server/household-file.ts';
const household = parseHouseholdFile({adults: [{username: 'Rowan', role: 'owner'}, {username: 'Sage', role: 'owner'}, {username: 'Wren', role: 'caregiver'}]});
const accounts = ['Rowan', 'Sage', 'Wren'].map((username, index) => ({username, id: index + 2, timerDeletePermission: true, permissions: ['core.delete_timer']}));
test('household configuration requires unique trusted identities and a full live check receipt', () => {
  const receipt = {passed: ['Baby Buddy numeric unit readback', 'CSV values escaped and present']};
  assert.equal(trustedConfiguration({accounts}, receipt, household).units.verified, true);
  assert.throws(() => trustedConfiguration({accounts}, {passed: []}, household), /live integration/);
  assert.throws(() => trustedConfiguration({accounts: [accounts[0], accounts[0], accounts[2]]}, receipt, household), /Duplicate/);
  assert.throws(() => trustedConfiguration({accounts: [...accounts.slice(0, 2), {...accounts[2], username: 'Unknown'}]}, receipt, household), /Invalid/);
});
test('household configuration permits only the one reviewed Baby Buddy profile permission', () => {
  const receipt = {passed: ['Baby Buddy numeric unit readback', 'CSV values escaped and present']};
  const withProfilePermission = accounts.map((account) => ({...account, permissions: [...account.permissions, 'babybuddy.view_settings']}));
  assert.equal(trustedConfiguration({accounts: withProfilePermission}, receipt, household).accounts[0].permissions.includes('babybuddy.view_settings'), true);
  assert.throws(() => trustedConfiguration({accounts: accounts.map((account) => ({...account, permissions: ['babybuddy.add_settings']}))}, receipt, household), /Invalid/);
});
