import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../web/development.js', import.meta.url), 'utf8');
test('Node age cards do not depend on window or dismissal storage', () => {
  const context: any = {};
  runInNewContext(source, context);
  const { cardsForAge } = context.LITTLE_DAYS_DEVELOPMENT;
  const cards = cardsForAge('2026-10-20', '2026-11-08');
  assert.ok(cards.length >= 4);
  assert.ok(cards.some(card => card.id === 'early-talk'));
  assert.equal(cardsForAge('2026-02-30', '2026-11-08').length, 0);
  const browser = development();
  browser.dismiss('early-talk');
  assert.ok(!browser.cardsFor('2026-10-20', '2026-11-08').some(card => card.id === 'early-talk'));
  assert.ok(browser.cardsForAge('2026-10-20', '2026-11-08').some(card => card.id === 'early-talk'));
});
function development(storage = new Map<string, string>()) {
  const window = { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } };
  runInNewContext(source, { window });
  return window.LITTLE_DAYS_DEVELOPMENT;
}

test('age bands use completed calendar months and reject invalid or future birth dates', () => {
  const { ageMonths } = development();
  assert.equal(ageMonths('2026-04-26', '2026-10-26'), 6);
  assert.equal(ageMonths('2026-04-27', '2026-10-26'), 5);
  assert.equal(ageMonths('2026-02-29', '2026-10-26'), null);
  assert.equal(ageMonths('2026-10-27', '2026-10-26'), null);
  assert.equal(ageMonths('', '2026-10-26'), null);
});

test('eligible cards include each lower boundary and exclude each upper boundary', () => {
  const { cardsFor } = development();
  assert.ok(cardsFor('2026-04-26', '2026-10-26').some(card => card.id === 'sleep-range'));
  assert.ok(cardsFor('2026-03-26', '2026-10-26').some(card => card.id === 'solids-readiness'));
  assert.ok(!cardsFor('2026-02-26', '2026-10-26').some(card => card.id === 'solids-readiness'));
  assert.ok(cardsFor('2025-10-26', '2026-10-26').some(card => card.id === 'sleep-range'));
  assert.ok(!cardsFor('2025-09-26', '2026-10-26').some(card => card.id === 'sleep-range'));
  assert.equal(cardsFor('', '2026-10-26').length, 0);
});

test('dismissed cards stay hidden across reads without storing child data', () => {
  const storage = new Map<string, string>();
  const { cardsFor, dismiss } = development(storage);
  const before = cardsFor('2026-04-26', '2026-10-26');
  assert.ok(before.some(card => card.id === 'sleep-range'));
  dismiss('sleep-range');
  assert.ok(!cardsFor('2026-04-26', '2026-10-26').some(card => card.id === 'sleep-range'));
  assert.deepEqual([...storage.keys()], ['little-days-development-dismissed']);
  assert.equal(storage.get('little-days-development-dismissed'), '["sleep-range"]');
});
