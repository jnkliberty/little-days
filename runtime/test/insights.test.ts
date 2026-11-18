import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const context: any = {};
for (const file of ['development', 'insights']) runInNewContext(readFileSync(new URL(`../web/${file}.js`, import.meta.url), 'utf8'), context);
const { pool, next } = context.LittleDaysInsights;
const permissions = { resources: Object.fromEntries(['children', 'feedings', 'changes', 'sleep', 'tummy-times', 'notes'].map(name => [name, { view: true }])) };
const input = { today: '2026-11-08', nowMinutes: 720, lang: 'en', child: { birthDate: '2026-10-20' }, permissions };
const facts = entries => pool({ ...input, entries }).filter(fact => fact.kind === 'record');

test('counts recorded feed sessions once, including duplicates and a session across midnight', () => {
  const result = facts([
    {id: 'feedings:1', type: 'feed', sid: 'one', t: -10},
    {id: 'feedings:2', type: 'feed', sid: 'one', t: 5},
    {id: 'feedings:4', type: 'bottle', sid: 'one', t: 10, ml: 30},
    {id: 'feedings:3', type: 'bottle', t: 60, ml: 90},
    {id: 'feedings:3', type: 'bottle', t: 60, ml: 90},
  ]);
  assert.equal(result.length, 2);
  assert.match(result.find(fact => fact.id.endsWith('2026-11-08')).body, /^1 feed recorded today/);
  assert.match(result.find(fact => fact.id.endsWith('2026-11-07')).body, /^1 feed recorded yesterday/);
  assert.equal(result.find(fact => fact.id.endsWith('2026-11-07')).evidence.length, 3);
  assert.ok(result.every(fact => !fact.body.includes('ml')));
});

test('only current permitted records produce facts; missing permission fails closed', () => {
  const entries = [
    {id: 'changes:1', type: 'diaper', kind: 'W', t: -1440},
    {id: 'changes:2', type: 'diaper', kind: 'B', t: 720},
    {id: 'changes:3', type: 'diaper', kind: 'D', t: -1441},
    {id: 'changes:4', type: 'diaper', kind: 'D', t: 721},
    {id: 'changes:5', type: 'diaper', kind: 'D', t: NaN},
  ];
  assert.equal(facts(entries).length, 2);
  assert.equal(pool({...input, entries, permissions: {resources: {children: {view: true}}}}).filter(fact => fact.kind === 'record').length, 0);
  assert.equal(pool({...input, entries, permissions: {}}).length, 0);
  assert.equal(pool({...input, entries, today: '2026-02-30'}).length, 0);
});

test('reports known tummy durations, completed sleep and a recorded milestone', () => {
  const result = facts([
    {id:'tummy-times:1',type:'other',what:'tummy',t:30,dur:5},
    {id:'tummy-times:2',type:'other',what:'tummy',t:60,completed:true},
    {id:'sleep:1',type:'sleep',t:90,dur:120},
    {id:'sleep:2',type:'sleep',t:600,dur:121},
    {id:'sleep:3',type:'sleep',t:200,dur:-1},
    {id:'notes:1',type:'other',what:'mile',t:300,title:'First smile'},
  ]);
  assert.match(result.find(fact => fact.topic === 'tummy').body, /2 sessions recorded today; 5 minutes with recorded duration/);
  assert.match(result.find(fact => fact.topic === 'sleep').body, /120 minutes/);
  assert.equal(result.find(fact => fact.topic === 'sleep').evidence[0].id, 'sleep:1');
  assert.match(result.find(fact => fact.topic === 'milestone').body, /First smile/);
  assert.match(pool({...input, entries: [{id:'changes:1',type:'diaper',kind:'W',t:5}],lang:'es'}).find(fact => fact.kind === 'record').body, /registrado/);
});

test('only current daily development cards appear, localized, without a static fallback', () => {
  const developmentCards = ['one','two','three'].map(id=>({id,date:'2026-11-08',topic:[id,id],title:['English title','Título español'],body:['English fact','Dato español'],source:['CDC','CDC'],url:'https://www.cdc.gov/child-development/',sourceDate:'Retrieved 2026-11-08'}));
  const result = pool({...input,entries:[],lang:'es',developmentCards});
  assert.equal(result.length,3);
  assert.equal(result[0].body,'Dato español');
  assert.equal(pool({...input,entries:[]}).length,0);
  assert.equal(pool({...input,entries:[],developmentCards,today:'2026-11-09'}).length,0);
  assert.equal(pool({...input,entries:[],developmentCards,permissions:{resources:{}}}).length,0);
  assert.ok(result.every(fact => fact.kind === 'source' && fact.evidence[0].url.startsWith('https://')));
  const seen: string[] = [];
  let current = null;
  for (let i = 0; i < result.length; i++) {
    current = next(result, current?.id, seen);
    assert.ok(!seen.includes(current.id));
    seen.push(current.id);
  }
  assert.notEqual(next(result, current.id, seen).id, current.id);
  assert.equal(next([], null), null);
  assert.equal(next([result[0]], result[0].id, [result[0].id]), result[0]);
  const options = [{id:'a',topic:'feed'},{id:'b',topic:'feed'},{id:'c',topic:'sleep'}];
  assert.equal(next(options,'a',[]).id,'c');
  assert.equal(next(options,'a',['c']).id,'b');
});

test('fresh record and source facts alternate before recent cards repeat', () => {
  const options = [
    {id:'a',kind:'record',topic:'feeds'},
    {id:'b',kind:'record',topic:'sleep'},
    {id:'c',kind:'source',topic:'Vision'},
    {id:'d',kind:'source',topic:'Play'},
  ];
  assert.equal(next(options,'a',['a']).id,'c');
  assert.equal(next(options,'c',['a','c']).id,'b');
  assert.equal(next(options,'b',['a','c','b']).id,'d');
});

test('milestones require notes access and absent units never become milk estimates', () => {
  const entries = [
    {id:'notes:1',type:'other',what:'mile',title:'First smile',t:20},
    {id:'feedings:1',type:'bottle',t:30,ml:90,unit:'unknown'},
  ];
  const result = pool({...input,entries,permissions:{resources:{feedings:{view:true}}}});
  assert.equal(result.length,1);
  assert.match(result[0].body,/1 feed recorded today/);
  assert.equal(result[0].evidence[0].id,'feedings:1');
  assert.ok(!result[0].body.includes('90'));
  assert.equal(facts([]).length,0);
});

for (const file of ['trends', 'personal-trends']) runInNewContext(readFileSync(new URL(`../web/${file}.js`, import.meta.url), 'utf8'), context);
const trendDate = (offset: number) => new Date(Date.UTC(2026, 2, 18 + offset)).toISOString().slice(0, 10);
const trend = (entries, available, extra = {}) => (context.LittleDaysPersonalTrends?.pool({
  ...input, child: {birthDate:'2025-12-01'}, today: '2026-03-18', entries, readDates: new Set(available.map(trendDate)), ...extra
}) || []);
const range = (from: number, to: number) => Array.from({length: to - from + 1}, (_, i) => from + i);
const feed = (day: number, minute = 600) => ({id: `feedings:${day}:${minute}`, type: 'feed', t: day * 1440 + minute});
const period = (cards, topic, window) => cards.find(card => card.id.startsWith(`trend:${topic}:${window}:`));

test('daily cutoffs count a cross-midnight feed once and exclude later prior-day feeds', () => {
  const entries = [
    {...feed(-1, 1430), sid: 'shared'}, {...feed(0, 10), sid: 'shared'},
    feed(-1), feed(-1, 800), feed(0), feed(0, 620),
  ];
  assert.match(period(trend(entries, [-2, -1, 0]), 'feeds', 'day').body, /2 feeds.*today.*1 yesterday/);
  assert.match(period(trend(entries, [-2, -1, 0], {nowMinutes: 800}), 'feeds', 'day').body, /2 feeds.*today.*2 yesterday/);
  assert.equal(period(trend(entries, [-2, 0]), 'feeds', 'day'), undefined);
});

test('finished weeks need metric coverage and the same-time baseline gives the median and range', () => {
  const entries = range(-14, 0).flatMap(day => day % 2 ? [feed(day)] : [feed(day), feed(day, 615)]);
  const eleven = trend(entries.filter(entry => entry.t >= -11 * 1440), range(-12, 0));
  assert.match(period(eleven, 'feeds', 'seven').body, /per day/);
  assert.equal(period(eleven, 'feeds', 'week'), undefined);
  assert.match(period(eleven, 'feeds', 'baseline').body, /median 1.*range 1 to 2.*7 days/);
  assert.match(period(trend(entries, range(-15, 0)), 'feeds', 'week').body, /per day/);
  const gap = trend(entries.filter(e => e.t < -1440 || e.t >= 0), range(-15, 0));
  assert.match(period(gap, 'feeds', 'seven').body, /6 of 7 days/);
  assert.equal(period(gap, 'feeds', 'week'), undefined);
  assert.equal(period(trend(entries, range(-15, 0).filter(day => day !== -8)), 'feeds', 'week'), undefined);
});

test('unequal months compare daily averages and a sleep gap leaves the feed comparison intact', () => {
  const entries = range(-76, 0).flatMap(day => [
    feed(day), {id: `sleep:${day}`, type: 'sleep', t: day * 1440 + 100, dur: 60},
    {id: `changes:${day}`, type: 'diaper', kind: 'B', t: day * 1440 + 400}
  ]);
  const available = range(-77, 0);
  assert.match(period(trend(entries, available), 'feeds', 'month').body, /1.*1.*no change/i);
  const gap = trend(entries.filter(e => e.id !== 'sleep:-30'), available);
  assert.match(period(gap, 'sleep', 'month-coverage').body, /27 of 28 days/);
  assert.equal(period(gap, 'sleep', 'month'), undefined);
  assert.ok(period(gap, 'feeds', 'month'));
});

test('week and month cards suppress birth windows that cover only part of the period', () => {
  const entries = range(-77, 0).map(day => feed(day));
  const newborn = trend(entries.filter(entry => entry.t >= -4 * 1440), range(-77, 0), {child:{birthDate:trendDate(-4)}});
  assert.equal(period(newborn, 'feeds', 'seven'), undefined);
  assert.equal(period(newborn, 'feeds', 'week'), undefined);
  assert.match(period(newborn, 'feeds', 'baseline').body, /4 days/);
  const bornInJanuary = trend(entries, range(-77, 0), {child:{birthDate:'2026-01-20'}});
  assert.ok(period(bornInJanuary, 'feeds', 'week'));
  assert.equal(period(bornInJanuary, 'feeds', 'month'), undefined);
  assert.equal(period(bornInJanuary, 'feeds', 'previous-month-coverage'), undefined);
});

test('daily sleep and feed comparisons exclude records unfinished at either cutoff', () => {
  const entries = range(-7, 0).flatMap(day => [
    {...feed(day), dur:15, sid:`earlier:${day}`},
    {...feed(day, 670), dur:15, sid:`earlier:${day}`},
    {id:`sleep:${day}:short`, type:'sleep', t:day * 1440 + 300, dur:60},
    {id:`sleep:${day}:long`, type:'sleep', t:day * 1440 + 780, dur:180, live:day === 0},
    {...feed(day, 880), dur:30, sid:`unfinished:${day}`, live:day === 0},
    {...feed(day, 910), dur:15, sid:`unfinished:${day}`},
  ]);
  const cards = trend(entries, range(-8, 0), {nowMinutes:900});
  assert.match(period(cards, 'sleep', 'day').body, /60 min.*60 min.*no change/);
  assert.match(period(cards, 'sleep', 'baseline').body, /median 60 min.*range 60 min to 60 min/);
  const feedDay = period(cards, 'feeds', 'day');
  assert.match(feedDay.body, /1 feed.*1 yesterday.*no change/);
  assert.equal(feedDay.evidence.length, 4);
  assert.match(period(cards, 'feeds', 'baseline').body, /median 1.*range 1 to 1/);
});

test('completed overnight sleep is clipped, overlaps count once, and handoff evidence uses the start date', () => {
  const entries = [
    {id: 'sleep:1', type: 'sleep', t: -60, dur: 150},
    {id: 'sleep:2', type: 'sleep', t: 60, dur: 60},
    {id: 'sleep:past', type: 'sleep', t: -900, dur: 60},
    {id: 'sleep:live', type: 'sleep', t: 480, dur: 30, live: true},
    {id: 'changes:1', type: 'diaper', kind: 'B', t: 7 * 60},
  ];
  const cards = trend(entries, [-2, -1, 0], {handoffAt: -30});
  assert.match(period(cards, 'sleep', 'day').body, /120 min.*60 min/);
  const summary = period(cards, 'handoff', 'handoff');
  assert.match(summary.body, /150 min.*7:00 AM/);
  assert.equal(summary.evidence.find(item => item.id === 'sleep:1').date, '2026-03-17');
  assert.match(period(cards, 'sleep', 'night').body, /180 min logged per night.*180 min/);
  assert.match(period(trend(entries, [-2, -1, 0], {lang: 'es'}), 'handoff', 'handoff').title, /Desde las 7/);
});

test('bottle volume uses known amounts only, reports nursing separately and respects units', () => {
  const entries = [
    feed(0), {id: 'feedings:b', type: 'bottle', t: 520, ml: 60, unit: 'ml'},
    {id: 'feedings:a', type: 'bottle', t: -920, ml: 30, unit: 'ml'},
  ];
  const card = period(trend(entries, [-2, -1, 0], {units: 'us'}), 'bottles', 'breakdown');
  assert.match(card.body, /2 oz.*1 oz.*nursing/i);
  entries.push({id: 'feedings:unknown', type: 'bottle', t: 530, ml: 90, unit: 'unknown'});
  const missing = period(trend(entries, [-2, -1, 0]), 'bottles', 'breakdown');
  assert.match(missing.body, /2 bottles.*amount missing/i);
  assert.match(missing.body, /Measured bottles: 60 mL total, 60 mL per bottle/);
  assert.doesNotMatch(missing.body, /yesterday|90|150/);
  assert.deepEqual(Array.from(trend(entries, [-2, -1, 0], {permissions:{resources:{}}})), []);
});
