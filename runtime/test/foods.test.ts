import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import '../web/foods.js';
import { mapEvent, mapBabyBuddyRecord } from '../server/mapping.ts';
const foods = (globalThis as any).LITTLE_DAYS_FOODS;
const now = new Date('2026-11-09T18:00:00Z');
const meal = { type: 'other', what: 'solids', food: 'Avocado', time: '2026-11-08T15:00:00Z' };

test('catalog identities work in both languages and every illustration is bundled', () => {
  assert.equal(foods.resolve(' aguacate '), 'avocado');
  assert.equal(foods.resolve('AVOCADO'), 'avocado');
  assert.equal(foods.resolve('Avocado puree'), null);
  assert.equal(foods.resolve('platano'), null);
  assert.equal(new Set(foods.catalog.map((food: any) => food.id)).size, foods.catalog.length);
  for (const food of foods.catalog) assert.ok(existsSync(new URL(`../web${food.image}`, import.meta.url)), food.image);
});

test('summary uses exact legacy names and the latest explicit preference, regardless of input order', () => {
  const entries = [
    {...meal, food: 'Aguacate', preference: 'disliked', t: -200},
    {...meal, preference: null, t: 100},
    {...meal, foodId: 'avocado', preference: 'liked', t: -100},
    {...meal, food: 'Banana', t: 0},
    {...meal, food: 'Homemade soup', t: 1},
    {type: 'note', what: 'solids', food: 'Rice', t: 0},
  ];
  const summary = foods.summary(entries);
  assert.deepEqual(summary.filter((food: any) => food.tried).map((food: any) => [food.id, food.preference, food.status]), [
    ['avocado', 'liked', 'liked'], ['banana', null, 'tried'], [null, null, 'tried'],
  ]);
  assert.equal(summary.find((food: any) => food.id === 'rice').status, 'not-tried');
  assert.equal(foods.summary(entries.filter((entry: any) => entry.preference !== 'liked'))[0].status, 'disliked');
  assert.equal(foods.summary([])[0].status, 'not-tried');
});

test('solids mapping validates metadata and reads old meals without guessing preference', () => {
  for (const fields of [{foodId: 'missing'}, {foodId: 1}, {preference: 'safe'}, {preference: false}, {preference: ['liked']}]) {
    assert.throws(() => mapEvent({...meal, ...fields}, 7, now, null), (error: any) => error.status === 400);
  }
  const write = mapEvent({...meal, foodId: 'avocado', preference: 'liked'}, 7, now, null).writes[0];
  const row = {id: 1, ...write.body};
  const saved = mapBabyBuddyRecord('feedings', row, write.metadata, now, 'Parent');
  assert.equal(saved.foodId, 'avocado'); assert.equal(saved.preference, 'liked');
  const old = mapBabyBuddyRecord('feedings', row, {food: 'Aguacate'}, now, 'Parent');
  assert.equal(old.foodId, 'avocado'); assert.equal(old.preference, null);
  assert.equal(mapBabyBuddyRecord('feedings', row, {food: 'Avocado puree'}, now, 'Parent').foodId, null);
});
