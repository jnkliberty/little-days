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
