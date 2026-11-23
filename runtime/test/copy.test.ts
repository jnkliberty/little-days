import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const feedback = readFileSync(new URL('../web/parent-feedback.js', import.meta.url), 'utf8');
const reportsUi = readFileSync(new URL('../web/reports-ui.js', import.meta.url), 'utf8');
const extrasUi = readFileSync(new URL('../web/extras-ui.js', import.meta.url), 'utf8');
const alertsUi = readFileSync(new URL('../web/alerts-ui.js', import.meta.url), 'utf8');
const between = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
const W = vm.runInNewContext(`(${between(app, 'const W = {', '\n};\nconst t =').replace('const W = ', '')}\n})`);
// The later block of web/app.js (Object.assign(W, {...})) is read too, so every string table is checked (plan 2026-11-21, Group 1).
const W2 = vm.runInNewContext(`(${between(app, 'Object.assign(W,{', '\n});').replace('Object.assign(W,', '')}\n})`);
const FEEDBACK = vm.runInNewContext(`(${between(feedback, 'const FEEDBACK_COPY = {', '\n};\nconst ft=').replace('const FEEDBACK_COPY = ', '')}\n})`);
const REPORTS_W = vm.runInNewContext(`((NB) => (${between(reportsUi, 'const W = {', '\n  };\n  const L =').replace('const W = ', '')}\n  }))('\u00a0')`);
const EXTRAS_W = vm.runInNewContext(`((NB) => (${between(extrasUi, 'const W = {', '\n  };\n\n  const L =').replace('const W = ', '')}\n  }))('\u00a0')`);
const ALERTS_W = vm.runInNewContext(`((NB) => (${between(alertsUi, 'const W = {', '\n  };\n\n  const L =').replace('const W = ', '')}\n  }))('\u00a0')`);

const pairs = (table: Record<string, unknown>, name: string): [string, unknown[]][] =>
  Object.entries(table).flatMap(([key, value]) => Array.isArray(value) ? [[`${name}.${key}`, value] as [string, unknown[]]] : pairs(value as Record<string, unknown>, `${name}.${key}`));

test('clean copy: every word has English and Spanish, and a cut or rewrite lands in both', () => {
  assert.ok(Object.keys(W2).length > 10, 'the later W block is read');
  assert.ok(Object.keys(REPORTS_W).length > 40, 'the Reports W block is read');
  assert.ok(Object.keys(EXTRAS_W).length > 30, 'the Extras W block is read');
  assert.ok(Object.keys(ALERTS_W).length > 30, 'the Alerts W block is read');
  for (const [name, pair] of [...pairs(W, 'W'), ...pairs(W2, 'W'), ...pairs(FEEDBACK, 'FEEDBACK_COPY'), ...pairs(REPORTS_W, 'REPORTS_W'), ...pairs(EXTRAS_W, 'EXTRAS_W'), ...pairs(ALERTS_W, 'ALERTS_W')]) {
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

test('clean copy: the forecast facts have both languages, say "forecast", and use 12-hour Spanish ranges', () => {
  for (const key of ['fcFeed', 'fcNap', 'fcBasis', 'fcPassed', 'fcNow', 'fcRange', 'fcAskFeed', 'fcAskNap', 'fcSetH', 'fcSetL', 'fcOn', 'fcOff']) assert.ok(key in W, `${key} is missing`);
  assert.match(W.fcFeed[0], /forecast/); assert.match(W.fcFeed[1], /Pronóstico/);
  assert.equal(W.fcRange[1]('3:10', '3:40\u00a0p.\u00a0m.'), '3:10 a\u00a03:40\u00a0p.\u00a0m.');
});
