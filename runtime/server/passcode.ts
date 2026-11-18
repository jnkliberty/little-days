import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, type Store } from './store.ts';

// The household passcode. Only a salted scrypt hash is stored; the passcode is never logged or sent back.
export const MIN_LENGTH = 10;
const MAX_LENGTH = 256;
const KEY_LENGTH = 64;
// N = 2^17 is the OWASP minimum for scrypt (r = 8, p = 1). It needs about 134 MB and half a second for each check.
// The cost is stored with the hash, so a hash made with an older cost still verifies. A hash saved before the cost was stored used N = 2^14.
const COST = { N: 131072, r: 8, p: 1 };
const FIRST_COST = { N: 16384, r: 8, p: 1 };
type Cost = { N: number; r: number; p: number };
type Saved = Cost & { algorithm: 'scrypt'; salt: string; hash: string };

// The same text typed as one character or as a letter plus a combining mark is one passcode, so the length counts after normalization.
const normalized = (passcode: string) => passcode.normalize('NFKC');
const derive = (passcode: string, salt: Buffer, cost: Cost) => new Promise<Buffer>((done, fail) =>
  scrypt(normalized(passcode), salt, KEY_LENGTH, { ...cost, maxmem: 256 * cost.N * cost.r + 1024 * 1024 }, (error, key) => error ? fail(error) : done(key)));

function saved(store: Store): Saved | null {
  const value = store.getSetting('app', 'passcode') as Partial<Saved> | null;
  return value?.algorithm === 'scrypt' && typeof value.salt === 'string' && typeof value.hash === 'string' ? { ...FIRST_COST, ...value } as Saved : null;
}

export const passcodeIsSet = (store: Store) => saved(store) !== null;

// Saving a passcode, the first time or again, ends every sign-in in the same step. `cost` is for tests only.
export async function savePasscode(store: Store, passcode: unknown, cost: Partial<Cost> = {}): Promise<void> {
  const length = typeof passcode === 'string' ? normalized(passcode).length : 0;
  if (typeof passcode !== 'string' || length < MIN_LENGTH) throw new Error(`The passcode needs at least ${MIN_LENGTH} characters.`);
  if (length > MAX_LENGTH) throw new Error(`The passcode can have at most ${MAX_LENGTH} characters.`);
  const used = { ...COST, ...cost }, salt = randomBytes(16);
  const hash = await derive(passcode, salt, used);
  store.replacePasscode({ algorithm: 'scrypt', ...used, salt: salt.toString('hex'), hash: hash.toString('hex') });
}

export async function verifyPasscode(store: Store, passcode: unknown): Promise<boolean> {
  const record = saved(store);
  // The same length rule as on save: counted after normalization, so a passcode that was saved can sign in as typed.
  if (!record || typeof passcode !== 'string' || normalized(passcode).length === 0 || normalized(passcode).length > MAX_LENGTH) return false;
  const expected = Buffer.from(record.hash, 'hex');
  const actual = await derive(passcode, Buffer.from(record.salt, 'hex'), record);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// `deploy/set_passcode.sh` runs this file. The new passcode comes from standard input, never from an argument.
async function main() {
  const path = resolve(process.env.LITTLE_DAYS_DB || 'data/little-days.sqlite');
  const passcode = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  const store = openStore(path);
  try { await savePasscode(store, passcode); console.log('The passcode is saved. Every sign-in has ended.'); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
  finally { store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
