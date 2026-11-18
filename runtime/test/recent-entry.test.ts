import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('Home includes a saved feed in the current minute and excludes future entries', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const precise = app.match(/^const nowExactM =.*$/m)?.[0] || '';
  const reads = app.slice(app.indexOf('const lastOf ='), app.indexOf('const nextSide ='));
  const context = vm.createContext({
    nowM: () => 900, Date: { now: () => 30500 }, shownRun: () => null,
    S: { entries: [{type:'feed',t:800,side:'R'}, {type:'feed',t:900.25,side:'L'}, {type:'feed',t:901,side:'R'}] },
  });
  vm.runInContext(`${precise}\n${reads}\nglobalThis.result = {last:lastOf('feed')};`, context);
  assert.equal(context.result.last.t, 900.25);
  assert.equal(context.result.last.side, 'L');
});
