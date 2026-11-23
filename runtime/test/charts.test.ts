import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({});
for (const path of ['vendor/d3-array-ticks-3.2.4.js', 'trends.js', 'charts.js']) {
  vm.runInContext(readFileSync(new URL(`../web/${path}`, import.meta.url), 'utf8'), context);
}
const charts = context.LittleDaysCharts;
test('growth ticks retain whole, fractional, descending and single-point axis values', () => {
  for (const [start, stop, expected] of [
    [4, 16, [5, 10, 15]],
    [17, 26, [18, 20, 22, 24, 26]],
    [12, 18, [12, 14, 16, 18]],
    [0, 0.3, [0, 0.1, 0.2, 0.3]],
    [9, 3, [8, 6, 4]],
    [5, 5, [5]],
  ] as const) {
    assert.deepEqual([...context.LittleDaysTicks(start, stop, 3)], expected);
  }
  assert.deepEqual([...context.LittleDaysTicks(0, 1, 0)], []);
});
const numbers = (svg: string, tag: string, attribute: string) =>
  [...svg.matchAll(new RegExp(`<${tag}[^>]*? ${attribute}="([-\\d.]+)"`, 'g'))].map(match => Number(match[1]));

test('L1 an axis keeps the mockup limits while the records fit and grows by whole steps when one is larger', () => {
  assert.equal(charts.scale(10, 5, 8).max, 10);
  assert.deepEqual([...charts.scale(10, 5, 8).ticks], [0, 5, 10]);
  assert.equal(charts.scale(10, 5, 10).max, 10);
  assert.equal(charts.scale(10, 5, 14).max, 15);
  assert.deepEqual([...charts.scale(10, 5, 14).ticks], [0, 5, 10, 15]);
  assert.equal(charts.scale(18, 6, 19).max, 24);
  assert.equal(charts.scale(8, 4, 9).max, 12);
  assert.equal(charts.scale(4, 2, 4.5).max, 6);
  assert.equal(charts.scale(10, 5, 0).max, 10);
});

test('L2 14 feeds in one day keep every bar inside the plot and the Today bar hollow with its part names', () => {
  const rows = [{ x: 'M', v: [14, 0] }, { x: 'T', v: [3, 2] }, { x: 'Today', part: true, v: [14, 1] }];
  const panel = { ...charts.scale(10, 5, 15), colors: ['var(--a)', 'var(--b)'], names: ['Breast', 'Bottle'] };
  const svg = charts.columns(326, 'Feeds', rows, panel, ['a', 'b', 'c'], 'chart-feeds', '');
  assert.doesNotMatch(svg, /NaN|Infinity/);
  const top = 8, height = 8 + 152 + 32;
  for (const y of numbers(svg, 'rect', 'y')) assert.ok(y >= top - 4 && y <= height, `rect y ${y} is inside the plot`);
  for (const match of svg.matchAll(/<rect x="[-\d.]+" y="([-\d.]+)" width="[-\d.]+" height="([-\d.]+)" fill="var\(--[ab]\)"/g)) {
    assert.ok(Number(match[1]) >= top - 1e-9, `a bar starts at ${match[1]}, not above the plot top ${top}`);
  }
  assert.match(svg, /fill="var\(--card\)" stroke="var\(--c-ink\)"/, 'Today is hollow');
  assert.match(svg, /class="name"[^>]*>Breast</);
  assert.match(svg, /class="name"[^>]*>Bottle</);
  assert.equal([...svg.matchAll(/class="col"/g)].length, 3);
  assert.match(svg, /data-dates="a\|b\|c"/);
  assert.match(svg, /role="slider"[^>]*aria-valuemax="3"/);
});

test('L3 a day with no value draws no bar and no NaN, and a name without a label is not written', () => {
  const rows = [{ x: 'M', v: [0] }, { x: 'Today', part: true, v: [0] }];
  const svg = charts.columns(326, 'Wet', rows, { ...charts.scale(8, 4, 0), colors: ['var(--c)'], names: [''] }, ['a', 'b'], 'chart-wet', '');
  assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.equal([...svg.matchAll(/<path d="M/g)].length, 0);
  assert.doesNotMatch(svg, /class="name"/);
});

test('L4 rhythm clips at now, keeps proportional sleep, draws a dot for breast and a diamond for bottle, and labels an empty row', () => {
  const rows = [
    { label: 'Nov 8', today: false, sleep: [[0, 60], [60, 180], [720, 1080]], feeds: [{ t: 100, kind: 'breast' }, { t: 200, kind: 'bottle' }], until: 1440, empty: '' },
    { label: 'Nov 9', today: false, sleep: [], feeds: [], until: 1440, empty: 'No records' },
    { label: 'Today', today: true, sleep: [[0, 300]], feeds: [{ t: 30, kind: 'breast' }, { t: 600, kind: 'breast' }], until: 120, empty: '' },
  ];
  const svg = charts.rhythm(326, rows, [[0, '7 AM', 'start'], [1440, '7 AM', 'end']], 'Rhythm');
  assert.doesNotMatch(svg, /NaN|Infinity/);
  const widths = [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="10" rx="5"/g)].map(match => Number(match[1]));
  const plotWidth = 326 - 52;
  assert.equal(widths.length, 4);
  for (const [index, expected] of [1 / 24, 1 / 12, 1 / 4, 120 / 1440].entries()) assert.ok(Math.abs(widths[index] - plotWidth * expected) < 1e-9, `sleep bar ${index}`);
  assert.equal([...svg.matchAll(/<circle/g)].length, 2, 'the breast feed after now is not drawn');
  assert.equal([...svg.matchAll(/<path d="M[\d.]+ [\d.]+l6 6-6 6-6-6Z"/g)].length, 1);
  assert.match(svg, />No records</);
  assert.match(svg, /class="val">Today</);
});

test('L5 growth draws one point as a finite dot with no line, and several points as a line', () => {
  const words = { name: 'Luna', birth: 'Birth', mid: '4 weeks', end: '8 weeks' };
  const one = charts.growth(326, { lo: 2, hi: 7, ticks: [2, 4, 6], weeks: 8, points: [{ week: 0, value: 3.3 }] }, words, 'Weight');
  assert.doesNotMatch(one, /NaN|Infinity/);
  assert.equal([...one.matchAll(/<circle/g)].length, 1);
  assert.doesNotMatch(one, /<path d="M/);
  const many = charts.growth(326, { lo: 2, hi: 10, ticks: [2, 4, 6, 8], weeks: 26, points: [{ week: 0, value: 3.3 }, { week: 26, value: 9 }] }, { ...words, mid: '13 weeks', end: '26 weeks' }, 'Weight');
  assert.match(many, /<path d="M[^"]*L/);
  for (const y of numbers(many, 'circle', 'cy')) assert.ok(y >= 12 - 5 && y <= 216 - 32 + 5, `dot y ${y} is inside the plot`);
});
