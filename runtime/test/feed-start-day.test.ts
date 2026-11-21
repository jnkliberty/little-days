import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner report, 2026-11-20 just after midnight: two bottle parts (breast milk, then formula) would not save. A start typed as
// 11:50 PM after midnight was read as tonight, later than now, so every feed form refused it ("The end time must be now or
// earlier."). These checks run the form's own range code from app.js at a fixed clock. The data is invented.
const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../web/theme.js', import.meta.url), 'utf8');
const rows = app.split('\n');
// One top-level definition: its first line, the indented lines that continue it, and a closing brace line.
function block(start: string): string {
  const at = rows.findIndex(row => row.startsWith(start));
  assert.ok(at >= 0, `app.js has no line that starts with ${start}`);
  let end = at + 1;
  while (end < rows.length && /^\s/.test(rows[end])) end++;
  if (rows[end]?.startsWith('}')) end++;
  return rows.slice(at, end).join('\n');
}
const NAMES = ['const todayISO', 'const nowM', 'const pad', 'const shiftISO', 'const dayISO', 'const isoDay', 'function validDate', 'function startMinutes',
  'function validNumber', 'function positive', 'const allowsZeroLength', 'function validDurationRange', 'function rangeMinutes', 'function clockOf',
  'function followManualStart', 'function followFeedEnd', 'function followStartDay', 'function syncRange'];

function form(now: string) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: any[]) { if (args.length) super(...(args as [any])); else super(now); }
    static now() { return RealDate.parse(now); }
  }
  const context = vm.createContext({ Date: FixedDate, Intl, Math, Number, String, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { documentElement: { dataset: {} }, querySelector: () => null } });
  // The form action for "Enter the minutes" / "Use the timer" is one `case 'manual':` line inside formAction's switch.
  const manualCase = rows.find(row => row.trimStart().startsWith("case 'manual':"));
  assert.ok(manualCase, "app.js has no case 'manual' line");
  vm.runInContext([theme, 'var S={entries:[],lang:"en"};const $=()=>null;', ...NAMES.map(block), 'function currentClock', 'function dropClockText']
    .map(part => part.startsWith('function ') && !part.includes('{') ? block(part) : part).concat([
    `function manualMode(s){switch('manual'){${manualCase}}}`,
    'LittleDaysZone.set("America/Chicago");',
    'globalThis.api={S,syncRange,dayISO,manualMode,startOf:s=>startMinutes(s.manualDate,s.hour,s.minute,s.period),ok:s=>validDurationRange(s,"manualDate","hour","minute","period","manualDuration")};']).join('\n'), context);
  return (context as any).api;
}

// A form as the parent leaves it after typing Started: the Day field (in More details) still holds the day the form opened.
function typeStart(api: any, sheet: Record<string, unknown>, hour: string, minute: string, period: string) {
  Object.assign(sheet, { hour, minute, period, timeEdited: true });
  api.S.sheet = sheet;
  api.syncRange('manualClock');
  api.syncRange('manualPeriod');
  return sheet;
}
const bottle = (api: any, milk: string, ml: number) => ({ kind: 'feed', tab: 'bottle', manualDate: api.dayISO(0), endHour: '12', endMinute: '05',
  endPeriod: 'AM', manualDuration: '0', milk, ml });

test('after midnight, a bottle part typed as 11:50 PM is last night and can save', () => {
  const api = form('2026-11-20T06:05:00Z');  // 12:05 AM in Chicago
  for (const [milk, ml] of [['breast', 60], ['formula', 30]] as const) {
    const s = typeStart(api, bottle(api, milk, ml), '11', '50', 'PM');
    assert.equal(s.manualDate, '2026-11-19', `${milk}: the start moves to the day before`);
    assert.equal(api.ok(s), true, `${milk}: the range is in the past, so Save works`);
  }
});

test('after midnight, a bottle part from 11:50 PM to 12:02 AM keeps its 12 minutes', () => {
  const api = form('2026-11-20T06:05:00Z');
  const s = bottle(api, 'formula', 30);
  typeStart(api, s, '11', '50', 'PM');
  Object.assign(s, { endHour: '12', endMinute: '02', endPeriod: 'AM' });
  api.syncRange('manualEndClock');
  assert.equal(s.manualDuration, '12');
  assert.equal(api.ok(s), true);
});

test('a breast feed typed after midnight with a start before midnight can save', () => {
  const api = form('2026-11-20T06:10:00Z');  // 12:10 AM
  const s = typeStart(api, { kind: 'feed', tab: 'breast', manual: true, manualDate: api.dayISO(0), endHour: '12', endMinute: '10', endPeriod: 'AM', manualDuration: '15' }, '11', '40', 'PM');
  api.syncRange('manualEndClock');
  assert.equal(s.manualDate, '2026-11-19');
  assert.equal(api.ok(s), true);
});

test('a Day the parent chose is kept, and an earlier time today stays today', () => {
  const api = form('2026-11-20T06:05:00Z');
  const chosen = bottle(api, 'breast', 60);
  chosen.dayEdited = true;
  typeStart(api, chosen, '11', '50', 'PM');
  assert.equal(chosen.manualDate, '2026-11-20', 'a chosen Day is never changed');
  const noon = form('2026-11-19T18:00:00Z');  // 12:00 PM
  const today = typeStart(noon, bottle(noon, 'breast', 60), '11', '30', 'AM');
  assert.equal(today.manualDate, '2026-11-19');
  assert.equal(noon.ok(today), true);
});

test('a start more than 12 hours back stays today, so a typo still shows the error', () => {
  const api = form('2026-11-19T16:00:00Z');  // 10:00 AM: 9 PM yesterday is 13 hours back
  const s = typeStart(api, bottle(api, 'breast', 60), '9', '00', 'PM');
  assert.equal(s.manualDate, '2026-11-19');
  assert.equal(api.ok(s), false);
});

test('Enter the minutes after an 11:50 PM bottle start restarts at now today, not 24 hours early', () => {
  const api = form('2026-11-20T06:05:00Z');  // 12:05 AM
  const s = typeStart(api, bottle(api, 'breast', 60), '11', '50', 'PM');
  assert.equal(s.manualDate, '2026-11-19');
  Object.assign(s, { tab: 'breast', manual: false });
  api.manualMode(s);  // Enter the minutes: Started and Ended restart at now
  assert.deepEqual([s.hour, s.minute, s.period], ['12', '05', 'AM']);
  assert.equal(s.manualDate, '2026-11-20', 'the Day the app moved is today again');
  assert.equal(api.startOf(s), 5, 'the saved start is 12:05 AM today');
  const picked = typeStart(api, { ...bottle(api, 'breast', 60), dayEdited: true, manualDate: '2026-11-18' }, '11', '50', 'PM');
  Object.assign(picked, { tab: 'breast', manual: false });
  api.manualMode(picked);
  assert.equal(picked.manualDate, '2026-11-18', 'a Day the parent picked is kept');
});

test('Minutes typed after Enter the minutes count back from now, even after a Bottle Started was typed', () => {
  const api = form('2026-11-20T06:05:00Z');  // 12:05 AM
  const s = typeStart(api, bottle(api, 'breast', 60), '11', '50', 'PM');
  Object.assign(s, { tab: 'breast', manual: false });
  api.manualMode(s);
  s.manualDuration = '15';
  api.syncRange('manualDuration');
  assert.equal(api.startOf(s), -10, 'Started is now minus 15 minutes: 11:50 PM yesterday');
  assert.deepEqual([s.endHour, s.endMinute, s.endPeriod], ['12', '05', 'AM'], 'Ended is now');
  assert.equal(api.ok(s), true, 'Save is accepted');
});

test('after Enter the minutes again, a typed Started keeps Ended where it is', () => {
  const api = form('2026-11-20T06:30:00Z');  // 12:30 AM
  const s: Record<string, unknown> = { kind: 'feed', tab: 'breast', manual: false, manualDate: api.dayISO(0) };
  api.S.sheet = s;
  api.manualMode(s);
  s.manualDuration = '10';
  api.syncRange('manualDuration');  // Minutes typed once
  api.manualMode(s);
  api.manualMode(s);  // Use the timer, then Enter the minutes again: Started and Ended restart at 12:30 AM
  typeStart(api, s, '12', '10', 'AM');
  assert.deepEqual([s.endHour, s.endMinute, s.endPeriod], ['12', '30', 'AM'], 'Ended stays at its own value');
  assert.equal(s.manualDuration, '20');
  assert.equal(api.ok(s), true);
});
