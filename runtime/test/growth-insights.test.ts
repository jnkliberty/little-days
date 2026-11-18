import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const context: any = {};
runInNewContext(readFileSync(new URL('../web/growth-insights.js', import.meta.url), 'utf8'), context);
const { cards, chartSex } = context.LittleDaysGrowthInsights;
const permissions = { resources: { children: { view: true }, weight: { view: true }, height: { view: true } } };
const weight = { id: 'weight:1', type: 'growth', date: '2026-11-03', kg: 5.45, growthPair: 'one' };
const length = { id: 'height:1', type: 'growth', date: weight.date, cm: 60, growthPair: 'one', recumbent: true };
const input = { entries: [weight, length], permissions, child: { id: 1, birthDate: '2026-09-01' }, today: '2026-11-18', lang: 'en', units: 'metric' };
const who = data => cards({ ...input, chartSex: 'girls', ...data }).find(card => card.topic === 'weight-for-length');

test('uses the sex-specific published percentile bands and cites both measurement rows and WHO', () => {
  const girls = who({});
  assert.match(girls.body, /15th to 50th percentile.*WHO chart for girls/);
  assert.match(who({ chartSex: 'boys' }).body, /3rd to 15th percentile.*WHO chart for boys/);
  assert.equal(girls.evidence.filter(item => item.id === weight.id || item.id === length.id).length, 2);
  assert.match(girls.evidence.find(item => item.kind === 'source').url, /cdn\.who\.int.*wfl-girls/);
});

test('WHO comparison requires an in-range recumbent pair, an eligible date and confirmed chart', () => {
  assert.equal(who({ chartSex: undefined }), undefined);
  assert.equal(who({ entries: [weight, { ...length, growthPair: 'other' }] }), undefined);
  assert.equal(who({ entries: [weight, { ...length, date: '2026-11-02' }] }), undefined);
  assert.ok(who({ entries: [{ ...weight, date: '2026-11-02' }, { ...length, date: '2026-11-02' }] }));
  assert.equal(who({ entries: [weight, { ...length, recumbent: undefined }] }), undefined);
  assert.equal(who({ entries: [weight, { ...length, cm: 44.9 }] }), undefined);
  assert.equal(who({ child: { ...input.child, birthDate: '2024-11-03' } }), undefined);
  assert.equal(who({ unavailable: ['height'] }), undefined);
});

test('growth cards use the latest records on distinct dates and honor units, language and permission', () => {
  const previous = { ...weight, id: 'weight:2', date: '2026-10-09', kg: 4.5 };
  const sameDate = { ...weight, id: 'weight:0', kg: 5 };
  const result = cards({ ...input, lang: 'es', units: 'us', entries: [previous, sameDate, weight, length], permissions: { resources: { children: { view: true }, weight: { view: true } } } });
  assert.equal(result.length, 1);
  assert.match(result[0].body, /3 nov.*12 lb 0 oz.*9 oct.*9 lb 15 oz.*\+2 lb 1 oz$/);
  assert.equal(result[0].evidence.length, 2);
  assert.equal(chartSex({ growthChart: { childId: 2, sex: 'girls' } }, 1), '');
  assert.equal(chartSex({ growthChart: { childId: 1, sex: 'girls' } }, 1), 'girls');
});
