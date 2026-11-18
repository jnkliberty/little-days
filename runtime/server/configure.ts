import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { readHouseholdFile, type Adult } from './household-file.ts';
import { openStore, type Store } from './store.ts';

export function trustedConfiguration(identities: any, receipt: any, household: Adult[]) {
  const accounts = identities?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== household.length) throw new Error('The identity file does not list the adults in the household file.');
  const names = household.map(adult => adult.username);
  if (accounts.some((account: any) => !names.includes(account.username) || !Number.isSafeInteger(account.id) || account.id < 1 || typeof account.timerDeletePermission !== 'boolean' || !Array.isArray(account.permissions) || account.permissions.some((p: unknown) => typeof p !== 'string' || (!/^core\.(?:view|add|change|delete)_[a-z]+$/.test(p) && p !== 'babybuddy.view_settings')))) throw new Error('Invalid household identity file.');
  if (new Set(accounts.map((account: any) => account.id)).size !== names.length || new Set(accounts.map((account: any) => account.username)).size !== names.length) throw new Error('Duplicate household identity.');
  if (!Array.isArray(receipt?.passed) || !receipt.passed.includes('Baby Buddy numeric unit readback') || !receipt.passed.includes('CSV values escaped and present')) throw new Error('Complete the live integration checks before configuring measurement units.');
  const labels = Object.fromEntries(household.filter(adult => adult.label).map(adult => [adult.username, adult.label]));
  return {accounts, people: names, labels, units: {verified: true, volume: 'ml', temperature: 'C', weight: 'kg', length: 'cm'}};
}

export function saveConfiguration(store: Store, config: ReturnType<typeof trustedConfiguration>) {
  store.putSetting('app', 'people', config.people);
  store.putSetting('app', 'labels', config.labels);
  for (const account of config.accounts) {
    store.putSetting(`user:${account.id}`, 'timerDeletePermission', account.timerDeletePermission);
    store.putSetting(`user:${account.id}`, 'permissions', account.permissions);
  }
  store.putSetting('app', 'unitContract', config.units);
  assert.deepEqual(store.getSetting('app', 'unitContract'), config.units, 'Configuration verification failed.');
}

function run() {
  const [mode, identityPath, receiptPath, householdPath] = process.argv.slice(2);
  if (!['--dry-run', '--apply'].includes(mode) || !identityPath || !receiptPath || !householdPath || !process.env.LITTLE_DAYS_DB) throw new Error('Usage: LITTLE_DAYS_DB=FILE node server/configure.ts --dry-run|--apply IDENTITIES LIVE_CHECK_RECEIPT HOUSEHOLD_FILE');
  const config = trustedConfiguration(JSON.parse(readFileSync(identityPath, 'utf8')), JSON.parse(readFileSync(receiptPath, 'utf8')), readHouseholdFile(householdPath));
  if (mode === '--dry-run') { console.log(`Configuration preview passed: ${config.people.length} ${config.people.length === 1 ? 'adult' : 'adults'} and verified metric units.`); return; }
  process.umask(0o077);
  const store = openStore(process.env.LITTLE_DAYS_DB);
  try {
    saveConfiguration(store, config);
    console.log('Household configuration saved. Child setup and care records were not changed.');
  } finally { store.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
