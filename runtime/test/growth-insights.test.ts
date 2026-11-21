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

// Failure case: shipping WHO percentile tables without reuse permission emits a weight-for-length card or enables chartSex.
test('omits WHO weight-for-length comparisons until permission is granted', () => {
  assert.equal(who({}), undefined);
  assert.equal(who({ chartSex: 'boys' }), undefined);
  assert.equal(chartSex({ growthChart: { childId: 1, sex: 'girls' } }, 1), '');
  assert.equal(chartSex({ growthChart: { childId: 2, sex: 'girls' } }, 1), '');
});

test('growth cards use the latest records on distinct dates and honor units, language and permission', () => {
  const previous = { ...weight, id: 'weight:2', date: '2026-10-09', kg: 4.5 };
  const sameDate = { ...weight, id: 'weight:0', kg: 5 };
  const result = cards({ ...input, lang: 'es', units: 'us', entries: [previous, sameDate, weight, length], permissions: { resources: { children: { view: true }, weight: { view: true } } } });
  assert.equal(result.length, 1);
  assert.match(result[0].body, /3 nov.*12 lb 0 oz.*9 oct.*9 lb 15 oz.*\+2 lb 1 oz$/);
  assert.equal(result[0].evidence.length, 2);
});

// Card mix (owner, 2026-11-19). Failure cases: a line drawn through a single point, a drawing with two points on one date,
// a headline that disagrees with the latest record, or "undefined" in a note.
test('growth look: one record is only the number; more records draw a line, one point per date, and name the change', () => {
  const weightOnly = { resources: { children: { view: true }, weight: { view: true } } };
  const [one] = cards({ ...input, entries: [weight], permissions: weightOnly });
  assert.deepEqual([one.headline, one.big, one.note, one.viz], ['5.45 kg', true, 'Recorded Nov 3', undefined]);
  const earlier = { ...weight, id: 'weight:2', date: '2026-10-20', kg: 5.25 }, sameDate = { ...weight, id: 'weight:0', kg: 5 };
  const [line] = cards({ ...input, entries: [earlier, sameDate, weight], permissions: weightOnly });
  assert.deepEqual([line.headline, line.big, line.note], ['5.45 kg', undefined, '+0.2 kg since Oct 20']);
  assert.equal(line.viz.kind, 'growth');
  assert.deepEqual(Array.from(line.viz.points, p => p.v), [5.25, 5.45]);
  assert.deepEqual([line.viz.first, line.viz.last], ['Oct 20', 'Nov 3']);
  const [es] = cards({ ...input, lang: 'es', entries: [earlier, weight], permissions: weightOnly });
  assert.equal(es.note, '+0.2 kg desde el 20 oct');
  for (const card of [one, line, es]) assert.doesNotMatch(JSON.stringify(card), /undefined|NaN/);
});

// US units on the growth cards (card mix review, 2026-11-19). Failure cases: a kg or cm value on a US card, a 2-decimal inch, "undefined".
test('US units: weight in lb and oz with an oz change note; length in inches at one decimal', () => {
  const rows = [{ id: 'w1', type: 'growth', date: '2026-11-01', kg: 3.4 }, { id: 'w2', type: 'growth', date: '2026-11-03', kg: 3.62 },
    { id: 'l1', type: 'growth', date: '2026-11-01', cm: 50 }, { id: 'l2', type: 'growth', date: '2026-11-03', cm: 52.3 }];
  const [weightCard, lengthCard] = cards({ ...input, units: 'us', entries: rows, permissions: { resources: { children: { view: true }, weight: { view: true }, height: { view: true } } } });
  assert.deepEqual([weightCard.headline, weightCard.note], ['8 lb 0 oz', '+8 oz since Nov 1']);
  assert.deepEqual([lengthCard.headline, lengthCard.note], ['20.6 in', '+0.9 in since Nov 1']);
  const [one] = cards({ ...input, units: 'us', lang: 'es', entries: [rows[3]], permissions: { resources: { children: { view: true }, height: { view: true } } } });
  assert.deepEqual([one.headline, one.note], ['20.6 pulg', 'Registrado el 3 nov']);
  for (const card of [weightCard, lengthCard, one]) assert.doesNotMatch(JSON.stringify(card), /undefined|NaN|kg|cm/);
});

// Review r1 (2026-11-19): the line's screen-reader label covers every drawn point, not only the last two records.
test('r1 growth line label: the count of drawn records, the first and the latest', () => {
  const rows = [{ ...weight, id: 'w0', date: '2026-10-09', kg: 4.5 }, { ...weight, id: 'w1', date: '2026-10-20', kg: 5.25 }, weight];
  const [line] = cards({ ...input, entries: rows, permissions: { resources: { children: { view: true }, weight: { view: true } } } });
  assert.equal(line.viz.points.length, 3);
  assert.equal(line.viz.label, 'Recorded weight, 3 records: Oct 9 · 4.5 kg, Oct 20 · 5.25 kg, Nov 3 · 5.45 kg.');
  const [es] = cards({ ...input, lang: 'es', entries: rows, permissions: { resources: { children: { view: true }, weight: { view: true } } } });
  assert.equal(es.viz.label, 'Peso registrado, 3 registros: 9 oct · 4.5 kg, 20 oct · 5.25 kg, 3 nov · 5.45 kg.');
});
