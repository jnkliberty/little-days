import test from 'node:test';
import assert from 'node:assert/strict';

// "Is this normal?" (plan 2026-11-21, Group 2; look A approved by owner 2026-11-22). Every range must be a row of the table
// the owner approved at STOP 0 (research/2026-11-21-age-norms.md), cut by the answers of 2026-11-21.
await import('../web/age-norms.js');
const {normFor, place} = (globalThis as any).LittleDaysAgeNorms;

test('feeds: CDC 8 to 12 from day 0 to day 28, nothing after', () => {
  for (const d of [0, 15, 28]) assert.deepEqual([normFor('feeds', d)?.low, normFor('feeds', d)?.high], [8, 12], `day ${d}`);
  assert.equal(normFor('feeds', 29), null);
});

test('wet: at least 5 to 6 from day 5 to day 28, nothing outside', () => {
  assert.equal(normFor('wet', 4), null);
  for (const d of [5, 28]) assert.equal(normFor('wet', d)?.kind, 'atLeast', `day ${d}`);
  assert.equal(normFor('wet', 29), null);
});

test('sleep: the under-4-months sentence to day 121, 12 to 16 h from day 122 to day 365', () => {
  assert.equal(normFor('sleepHours', 121)?.kind, 'under4');
  assert.deepEqual([normFor('sleepHours', 122)?.low, normFor('sleepHours', 122)?.high], [12, 16]);
  assert.equal(normFor('sleepHours', 365)?.kind, 'range');
  assert.equal(normFor('sleepHours', 366), null);
});

test('no birth date, a future birth date or a metric with no trusted figure gives no row', () => {
  for (const d of [NaN, -1, undefined]) assert.equal(normFor('feeds', d), null);
  assert.equal(normFor('dirty', 10), null);
});

test('place: below, inside or above; an "at least" row has no above', () => {
  const feeds = normFor('feeds', 10), wet = normFor('wet', 10);
  assert.deepEqual([7.4, 8, 12, 12.1].map(v => place(v, feeds)), ['below', 'inside', 'inside', 'above']);
  assert.deepEqual([4.9, 5, 9].map(v => place(v, wet)), ['below', 'inside', 'inside']);
  assert.equal(place(14, normFor('sleepHours', 30)), null);
});
