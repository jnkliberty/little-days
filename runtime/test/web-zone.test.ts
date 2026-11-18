import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// The browser clock follows the zone the server sends with the session (LittleDaysZone), not a fixed city.
const source = (name: string) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const line = (text: string, start: string) => text.split('\n').find(row => row.startsWith(start)) || '';
function browser(now: string) {
  const RealDate = Date;
  class FixedDate extends RealDate { constructor(...args: any[]) { if (args.length) super(...(args as [any])); else super(now); } }
  const context = vm.createContext({ Date: FixedDate, Intl, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { documentElement: { dataset: {} }, querySelector: () => null } });
  const app = source('app.js');
  vm.runInContext([source('theme.js'), line(app, 'const todayISO'), line(app, 'const nowM'), 'globalThis.today = todayISO; globalThis.minutes = nowM; globalThis.dim = LittleDaysTheme.dimHour;'].join('\n'), context);
  return context as any;
}

test('the browser date and clock follow the zone from the session', () => {
  const b = browser('2026-03-08T20:00:00Z');
  b.LittleDaysZone.set('America/Chicago');
  assert.deepEqual([b.today(), b.minutes()], ['2026-03-08', 15 * 60]);
  b.LittleDaysZone.set('Asia/Tokyo');
  assert.deepEqual([b.today(), b.minutes()], ['2026-03-09', 5 * 60]);
  b.LittleDaysZone.set('Not/AZone');
  assert.deepEqual([b.today(), b.minutes()], ['2026-03-09', 5 * 60], 'a wrong zone keeps the last good one');
});

test('Auto dim follows the install zone: dim from 8 PM to 7 AM', () => {
  const b = browser('2026-03-09T01:30:00Z');
  b.LittleDaysZone.set('America/Chicago');
  assert.equal(b.dim(), true, '8:30 PM in Chicago');
  b.LittleDaysZone.set('Asia/Tokyo');
  assert.equal(b.dim(), false, '10:30 AM in Tokyo');
});
