import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const feedback = readFileSync(new URL('../web/parent-feedback.js', import.meta.url), 'utf8');
const between = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
const W = vm.runInNewContext(`(${between(app, 'const W = {', '\n};\nconst t =').replace('const W = ', '')}\n})`);
const FEEDBACK = vm.runInNewContext(`(${between(feedback, 'const FEEDBACK_COPY = {', '\n};\nconst ft=').replace('const FEEDBACK_COPY = ', '')}\n})`);

const pairs = (table: Record<string, unknown>, name: string): [string, unknown[]][] =>
  Object.entries(table).flatMap(([key, value]) => Array.isArray(value) ? [[`${name}.${key}`, value] as [string, unknown[]]] : pairs(value as Record<string, unknown>, `${name}.${key}`));

test('clean copy: every word has English and Spanish, and a cut or rewrite lands in both', () => {
  for (const [name, pair] of [...pairs(W, 'W'), ...pairs(FEEDBACK, 'FEEDBACK_COPY')]) {
    assert.equal(pair.length, 2, `${name} needs exactly an English and a Spanish entry`);
    assert.ok(pair.every(v => typeof v === 'function' || (typeof v === 'string' && v.trim())), `${name} has an empty entry`);
  }
});

test('clean copy: strings that were never shown or only restate the screen are gone', () => {
  for (const key of ['gapEmpty', 'chartHelp', 'nextSideText']) assert.equal(key in W, false, `${key} was cut`);
  assert.equal(/t\('gapEmpty'\)/.test(app), false, 'no screen reads a cut string');
});

test('clean copy: rewritten strings keep the consequence and drop the reassurance', () => {
  assert.deepEqual(Array.from(W.reminderLimited), ['Reminder saved.', 'Recordatorio guardado.']);
  assert.deepEqual(Array.from(W.diaperTap), ['Tap a type to save it now.', 'Toque un tipo para guardarlo ya.']);
  assert.deepEqual(Array.from(W.aiUnavailable), ['Ask AI is not connected yet.', 'La IA todavía no está conectada.']);
  assert.deepEqual(Array.from(FEEDBACK.cancelSleepHelp), ['This discards the active interval.', 'Se descarta el intervalo activo.']);
});

test('clean copy: the copy that must stay is still there', () => {
  assert.match(W.correctRange[0], /within 24 hours/);
  assert.match(W.correctHelp[0], /actual end time/);
  assert.match(W.reminderNote[0], /no alert/);
  assert.match(W.waitUndo[0], /undone/);
  assert.match(W.developmentNote[0], /talk with your doctor/);
});
