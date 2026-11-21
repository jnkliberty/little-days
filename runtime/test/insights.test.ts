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
  // Card mix: the 6 days before today still show; 7 days later they are gone.
  assert.equal(pool({...input,entries:[],developmentCards,today:'2026-11-14'}).length,3);
  assert.equal(pool({...input,entries:[],developmentCards,today:'2026-11-15'}).length,0);
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

test('card mix: earlier days’ facts follow today’s, newest day first, and a future or old card never shows', () => {
  const card = (id, date) => ({id, date, topic:[id,id], title:['English title '+id,'Título '+id], body:['English fact about the baby '+id,'Dato del bebé '+id], source:['CDC','CDC'], url:'https://www.cdc.gov/x', sourceDate:'Retrieved '+date});
  const developmentCards = [card('old','2026-11-01'), card('two','2026-11-06'), card('today','2026-11-08'), card('one','2026-11-07'), card('future','2026-11-09')];
  assert.deepEqual(Array.from(pool({...input, entries:[], developmentCards}), fact => fact.id), ['source:today','source:one','source:two']);
});

test('card mix: fun and stat facts alternate from a fun card, the rest follow, and a repeated id or body shows once', () => {
  const { mix } = context.LittleDaysInsights;
  const f = (id, kind, extra = {}) => ({id, kind, topic:'t', body:'body '+id, ...extra});
  const order = list => Array.from(mix(list), fact => fact.id);
  assert.deepEqual(order([f('s1','record'), f('s2','record'), f('s3','record'), f('d1','source'), f('m','record',{fun:true})]), ['d1','s1','m','s2','s3']);
  assert.deepEqual(order([f('s1','record'), f('s2','record')]), ['s1','s2']);
  assert.deepEqual(order([f('d1','source'), f('d2','source'), f('s1','record')]), ['d1','s1','d2']);
  assert.deepEqual(order([f('d1','source'), f('d1','source'), f('d2','source',{body:'BODY d1 '})]), ['d1']);
  assert.deepEqual(order([]), []);
});

test('card mix: tummy time is one card, today’s minutes as the headline and yesterday in the note', () => {
  const tummy = entries => facts(entries).find(fact => fact.topic === 'tummy');
  const both = tummy([{id:'tummy-times:1',type:'other',what:'tummy',t:30,dur:10},{id:'tummy-times:2',type:'other',what:'tummy',t:90,dur:5},{id:'tummy-times:3',type:'other',what:'tummy',t:-600,dur:10}]);
  assert.equal(facts([{id:'tummy-times:1',type:'other',what:'tummy',t:30,dur:10},{id:'tummy-times:3',type:'other',what:'tummy',t:-600,dur:10}]).filter(fact => fact.topic === 'tummy').length, 1);
  assert.equal(both.headline, '15 min today');
  assert.equal(both.note, '2 sessions · yesterday 10 min');
  assert.equal(both.big, true);
  assert.equal(both.evidence.length, 3);
  const untimed = tummy([{id:'tummy-times:1',type:'other',what:'tummy',t:30}]);
  assert.equal(untimed.headline, '1 session today');
  assert.equal(untimed.note, '');
  assert.equal(tummy([{id:'tummy-times:3',type:'other',what:'tummy',t:-600,dur:10}]).headline, '10 min yesterday');
  assert.equal(tummy([]), undefined);
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
const plain = value => JSON.parse(JSON.stringify(value));
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

// Card mix (owner, 2026-11-19): one "Last 7 days" card replaces the per-type week cards, the week and month comparisons and the coverage cards.
const lastWeek = cards => period(cards, 'week', 'seven');
const removedWindows = ['month', 'month-coverage', 'previous-month-coverage'];

test('last 7 days: one card, a row only for a care type with all 7 finished days, and the change column only with 14', () => {
  const entries = range(-14, 0).flatMap(day => day % 2 ? [feed(day)] : [feed(day), feed(day, 615)]);
  const eleven = trend(entries.filter(entry => entry.t >= -11 * 1440), range(-12, 0));
  const week = lastWeek(eleven);
  assert.deepEqual(plain(week.viz.rows.map(row => [row.name, row.change, row.days.length])), [['Feeds', '', 7]]);
  assert.equal(week.viz.change, false);
  assert.doesNotMatch(week.body, /7 days before/);
  assert.match(period(eleven, 'feeds', 'baseline').body, /median 1.*range 1 to 2.*7 days/);
  const fourteen = lastWeek(trend(entries, range(-15, 0)));
  assert.equal(fourteen.viz.change, true);
  assert.match(fourteen.viz.rows[0].change, /^(0|[+−]\d)/);
  assert.match(fourteen.body, /Feeds: 1\.\d a day over the last 7 days \(.* the 7 days before\)\./);
  // A missing day leaves the row out; a missing day in the week before leaves only the change out.
  assert.equal(lastWeek(trend(entries.filter(e => e.t < -1440 || e.t >= 0), range(-15, 0))), undefined);
  assert.equal(lastWeek(trend(entries, range(-15, 0).filter(day => day !== -10))).viz.change, false);
  for (const cards of [eleven, trend(entries, range(-15, 0))]) {
    assert.equal(cards.filter(card => /^trend:[^:]+:(seven|week|month)/.test(card.id)).length, 1);
    for (const window of removedWindows) assert.equal(cards.some(card => card.id.includes(`:${window}:`)), false);
  }
});

test('last 7 days: a sleep gap drops only the sleep row; Spanish rows read "al día"', () => {
  const entries = range(-15, 0).flatMap(day => [
    feed(day), {id: `sleep:${day}`, type: 'sleep', t: day * 1440 + 100, dur: 60},
    {id: `changes:${day}`, type: 'diaper', kind: 'B', t: day * 1440 + 400}
  ]);
  const gap = lastWeek(trend(entries.filter(e => e.id !== 'sleep:-3'), range(-16, 0)));
  assert.deepEqual(plain(gap.viz.rows.map(row => row.tone)), ['c-feed', 'c-dia']);
  const es = lastWeek(trend(entries, range(-16, 0), {lang:'es'}));
  assert.deepEqual(plain(es.viz.rows.map(row => [row.name, row.avg, row.change])), [['Tomas', '1 al día', '0'], ['Cambios de pañal', '1 al día', '0'], ['Sueño', '1 h al día', '0']]);
  assert.equal(es.viz.head, 'vs. semana anterior');
  assert.match(es.body, /igual que los 7 días anteriores/);
});

test('last 7 days: a birth inside the week shows no card; a birth before it does', () => {
  const entries = range(-77, 0).map(day => feed(day));
  const newborn = trend(entries.filter(entry => entry.t >= -4 * 1440), range(-77, 0), {child:{birthDate:trendDate(-4)}});
  assert.equal(lastWeek(newborn), undefined);
  assert.match(period(newborn, 'feeds', 'baseline').body, /4 days/);
  assert.ok(lastWeek(trend(entries, range(-77, 0), {child:{birthDate:'2026-01-20'}})));
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
  assert.match(period(cards, 'sleep', 'baseline').body, /median 1 h.*range 1 h to 1 h/);
  // The today card is the fallback when no by-this-time card exists, so read it with two days of records only.
  const twoDays = trend(entries.filter(entry => entry.t >= -1440), [-2, -1, 0], {nowMinutes:900});
  assert.match(period(twoDays, 'sleep', 'day').body, /1 h.*1 h.*no change/);
  const feedDay = period(twoDays, 'feeds', 'day');
  assert.match(feedDay.body, /1 feed.*1 yesterday.*no change/);
  assert.equal(feedDay.evidence.length, 4);
  assert.match(period(cards, 'feeds', 'baseline').body, /median 1.*range 1 to 1/);
});

test('completed overnight sleep is clipped, overlaps count once, and no handoff insight card is emitted', () => {
  const entries = [
    {id: 'sleep:1', type: 'sleep', t: -60, dur: 150},
    {id: 'sleep:2', type: 'sleep', t: 60, dur: 60},
    {id: 'sleep:past', type: 'sleep', t: -900, dur: 60},
    {id: 'sleep:live', type: 'sleep', t: 480, dur: 30, live: true},
    {id: 'changes:1', type: 'diaper', kind: 'B', t: 7 * 60},
  ];
  const cards = trend(entries, [-2, -1, 0], {handoffAt: -30});
  assert.match(period(cards, 'sleep', 'day').body, /2 h.*1 h yesterday/);
  // One night is not enough for the night card (it compares last night with the nights before).
  assert.equal(period(cards, 'sleep', 'night'), undefined);
  // The "Since the handoff" insight card was removed (owner, 2026-11-21).
  assert.equal(period(cards, 'handoff', 'handoff'), undefined);
  assert.equal(period(trend(entries, [-2, -1, 0], {handoffAt: -30, lang: 'es'}), 'handoff', 'handoff'), undefined);
});

// Night sleep: totals 7 PM to 7 AM. nights[i] is the night that starts on day i - nights.length (the last one is last night).
const nightTrend = (nights: number[], extra = {}) => trend(nights.map((dur, i) => ({id:`night:${i}`, type:'sleep',
  t:(i - nights.length) * 1440 + 1200, dur})), range(-nights.length - 1, 0), {nowMinutes:600, ...extra});

test('night sleep: last night against the average, with the by-this-time verdict rule and the longest stretch in the sentence', () => {
  const card = period(nightTrend([470, 600, 540, 630, 515, 575, 535]), 'sleep', 'night');
  assert.equal(card.headline, 'About average');
  assert.equal(card.note, '17 min under the average 9 h 12 min');
  assert.match(card.body, /^Last night, 8 h 55 min logged, 17 min under the average of 9 h 12 min over the last 7 completed nights\. Median longest stretch 9 h\.$/);
  assert.equal(card.viz.usual, 552);
  assert.deepEqual(plain(card.viz.bars.map(bar => bar.value)), [470, 600, 540, 630, 515, 575, 535]);
  assert.equal(card.viz.bars.at(-1).today, true);
  assert.deepEqual(plain(card.viz.letters), ['W', 'T', 'F', 'S', 'S', 'M', 'T']);
  assert.equal(period(nightTrend([470, 600, 400]), 'sleep', 'night').headline, 'Less than any of the 2 nights before');
  assert.equal(period(nightTrend([470, 700]), 'sleep', 'night').headline, 'More than the night before');
  const es = period(nightTrend([470, 600, 540, 630, 515, 575, 535], {lang:'es'}), 'sleep', 'night');
  assert.equal(es.headline, 'Cerca del promedio');
  assert.equal(es.note, '17 min menos. Promedio: 9 h 12 min.');
  assert.match(es.title, /^Noche · 7\u00a0p\.\u00a0m\. a 7\u00a0a\.\u00a0m\.$/);
  // Last night not logged: no card, so the card never calls an older night "last night".
  assert.equal(period(trend([{id:'n', type:'sleep', t:-3 * 1440 + 1200, dur:500}, {id:'m', type:'sleep', t:-2 * 1440 + 1200, dur:500}], range(-4, 0), {nowMinutes:600}), 'sleep', 'night'), undefined);
});

// Seven past days of sleep (400 to 460 min, usual 430) and today's total, all by 3:00 PM.
const sleepWeek = (today: number, extra = {}) => trend(range(-7, 0).map(day => ({id:`sleep:${day}`, type:'sleep', t:day * 1440 + 60,
  dur:day === 0 ? today : 400 + 10 * (day + 7)})), range(-8, 0), {nowMinutes:900, ...extra});

test('home graphs: the by-this-time headline is a neutral verdict and the note gives the amount and the clock time', () => {
  // Failure cases (owner review 2026-11-19): the headline repeats the Today card's total, or a verdict uses a judging word.
  const inside = period(sleepWeek(427), 'sleep', 'baseline');
  assert.equal(inside.headline, 'About usual');
  assert.equal(inside.note, '3 min under the usual 7 h 10 min');
  assert.match(inside.body, /7 h 7 min logged today/);
  const below = period(sleepWeek(300), 'sleep', 'baseline');
  assert.equal(below.headline, 'Less than any of the last 7 days');
  assert.equal(below.note, '2 h 10 min under the usual 7 h 10 min');
  const above = period(sleepWeek(500), 'sleep', 'baseline');
  assert.equal(above.headline, 'More than any of the last 7 days');
  assert.equal(above.note, '1 h 10 min over the usual 7 h 10 min');
  assert.equal(period(sleepWeek(430), 'sleep', 'baseline').note, 'The usual is 7 h 10 min');
  assert.equal(period(sleepWeek(500, {lang:'es'}), 'sleep', 'baseline').headline, 'Más que cualquiera de los últimos 7 días');
  const feeds = trend(range(-7, 0).flatMap(day => [feed(day), feed(day, 615), ...(day === 0 ? [feed(day, 630)] : [])]), range(-8, 0), {nowMinutes:900});
  const feedCard = period(feeds, 'feeds', 'baseline');
  assert.equal(feedCard.headline, 'More than any of the last 7 days');
  assert.equal(feedCard.note, '1 feed over the usual 2');
  for (const card of [inside, below, above, feedCard]) assert.doesNotMatch(card.headline + card.note, /\b(low|high|good|bad|normal)\b/i);
});

test('home graphs: by-this-time columns are drawn from the usual level, with today last', () => {
  // Failure case: the drawing loses a day, or today is not the solid last column the labels sit under.
  const card = period(sleepWeek(427), 'sleep', 'baseline');
  assert.equal(card.viz.kind, 'columns');
  assert.equal(card.viz.usual, 430);
  assert.deepEqual(plain(card.viz.bars.map(bar => bar.value)), [400, 410, 420, 430, 440, 450, 460, 427]);
  assert.deepEqual(plain(card.viz.bars.at(-1)), {value:427, today:true});
  assert.deepEqual([card.viz.usualLabel, card.viz.span, card.viz.todayLabel], ['usual', 'Last 7 days', 'Today']);
});

test('home graphs: one card per care type; the today card is only the fallback', () => {
  // Failure case: sleep shows two cards with the same total, or no card at all when there is no week to compare.
  const week = sleepWeek(427);
  assert.ok(period(week, 'sleep', 'baseline'));
  assert.equal(period(week, 'sleep', 'day'), undefined);
  const twoDays = [{id:'s:-1', type:'sleep', t:-1440 + 60, dur:460}, {id:'s:0', type:'sleep', t:60, dur:380}];
  const fallback = period(trend(twoDays, [-2, -1, 0], {nowMinutes:900}), 'sleep', 'day');
  assert.equal(period(trend(twoDays, [-2, -1, 0], {nowMinutes:900}), 'sleep', 'baseline'), undefined);
  assert.equal(fallback.headline, '1 h 20 min less than yesterday');
  assert.equal(fallback.note, 'Yesterday by 3:00 PM: 7 h 40 min.');
  assert.deepEqual(plain(fallback.viz.bars.map(bar => [bar.label, bar.value])), [['Yesterday', 460], ['Today', 380]]);
  const more = period(trend([feed(-1), feed(0), feed(0, 700)], [-2, -1, 0], {nowMinutes:900}), 'feeds', 'day');
  assert.equal(more.headline, '1 feed more than yesterday');
  assert.equal(more.note, 'Yesterday by 3:00 PM: 1 feed.');
  const close = trend([{id:'s:-1', type:'sleep', t:-1440 + 60, dur:60.4}, {id:'s:0', type:'sleep', t:60, dur:59.6}], [-2, -1, 0], {nowMinutes:900});
  assert.equal(period(close, 'sleep', 'day').headline, 'Same as yesterday');
  const first = period(trend([{id:'d:0', type:'diaper', kind:'W', t:300}], range(-8, 0), {nowMinutes:900}), 'diapers', 'day');
  assert.equal(first.headline, '1 diaper change');
  assert.equal(first.note, 'Nothing logged yesterday by this time.');
});

test('home graphs: a week where every day and today are equal has no drawing', () => {
  // Failure case: a row of equal columns that says nothing, or "the last 1 days" for a newborn.
  const even = period(trend(range(-7, 0).map(day => ({id:`d:${day}`, type:'diaper', kind:'W', t:day * 1440 + 300})), range(-8, 0), {nowMinutes:900}), 'diapers', 'baseline');
  assert.equal(even.headline, 'Same as each of the last 7 days');
  assert.match(even.note, /^1 diaper change by 3:00\sPM$/);
  assert.equal(even.viz, undefined);
  const newborn = trend([{id:'d:-1', type:'diaper', kind:'W', t:-1440 + 300}, {id:'d:0', type:'diaper', kind:'W', t:300}], range(-8, 0),
    {nowMinutes:900, child:{birthDate:trendDate(-1)}});
  assert.equal(period(newborn, 'diapers', 'baseline').headline, 'Same as the last day');
});

test('home graphs: the bottle headline counts every bottle, and the note names nursing and a missing amount', () => {
  // Failure cases (owner review 2026-11-19): "4 bottles" over 5 marks, and a 4-item key under the drawing.
  const entries = [feed(0), {id:'feedings:b', type:'bottle', t:520, ml:60, unit:'ml'}, {id:'feedings:c', type:'bottle', t:530, ml:90, unit:'unknown'}];
  const card = period(trend(entries, [-2, -1, 0]), 'bottles', 'breakdown');
  assert.equal(card.headline, '2 bottles · 1 nursing');
  assert.equal(card.title, 'Bottle volumes, mL');
  assert.equal(period(trend(entries, [-2, -1, 0], {units:'us'}), 'bottles', 'breakdown').title, 'Bottle volumes, oz');
  assert.equal(card.note, 'Nursing. 1 bottle has no amount.');
  assert.equal(card.noteMark, 'nurse');
  assert.equal(card.viz.kind, 'timeline');
  assert.equal(card.viz.key, undefined);
  assert.deepEqual(plain(card.viz.marks.filter(mark => !mark.nurse).map(mark => [mark.ml, mark.shown])), [[60, '60'], [null, '?']]);
  assert.equal(card.viz.marks.filter(mark => mark.nurse).length, 1);
  const plainBottle = period(trend([{id:'feedings:b', type:'bottle', t:520, ml:60, unit:'ml'}], [-2, -1, 0]), 'bottles', 'breakdown');
  assert.deepEqual([plainBottle.headline, plainBottle.note, plainBottle.noteMark], ['1 bottle', '', '']);
  // Spanish: the nursing count moves to the note, so the headline fits one line at 320 px (card mix, 2026-11-19).
  const es = period(trend(entries, [-2, -1, 0], {lang:'es'}), 'bottles', 'breakdown');
  assert.deepEqual([es.headline, es.note], ['2 biberones', '1 al pecho. 1 biberón sin cantidad.']);
});

test('home graphs: column height follows the difference from usual, with a unit floor so a small difference stays small', () => {
  // Failure case: a 10-minute difference fills the whole half of the drawing.
  const charts: any = {};
  runInNewContext(readFileSync(new URL('../web/charts.js', import.meta.url), 'utf8'), charts);
  const heights = svg => [...svg.matchAll(/<rect class="([\w ]+)"[^>]* y="([\d.]+)"[^>]* height="([\d.]+)"/g)].map(m => [m[1], +(+m[2]).toFixed(2), +(+m[3]).toFixed(2)]);
  const {mini} = charts.LittleDaysCharts;
  // A duration has no unit floor: half-scale is 10 percent of usual (43 min). +20 min is 20 / 43 of the 23-unit half (48-unit drawing, card mix 2026-11-19);
  // +10 min (7.2 units) is raised to the 8-unit minimum. A past day equal to usual is an 8-unit outlined box centered on the line
  // at 24 (the outline sits 1 unit inside it). G2 (review 2026-11-19) failed before: the equal day was a 2-unit dash.
  assert.deepEqual(heights(mini([{value:430}, {value:450, today:true}], 430, 'x', 0)), [['past same', 21, 6], ['today', 13.3, 10.7]]);
  assert.deepEqual(heights(mini([{value:440, today:true}, {value:430, today:true}], 430, 'x', 0)), [['today', 16, 8], ['today same', 20, 8]]);
  // A count has a floor of 2: one feed over a usual 1 fills half of the half.
  assert.deepEqual(heights(mini([{value:2, today:true}], 1, 'x', 2)), [['today', 12.5, 11.5]]);
  // Less than usual draws down from the line; a day with no record (null) draws nothing.
  assert.deepEqual(heights(mini([{value:null}, {value:300, today:true}], 430, 'x', 0)), [['today', 24, 23]]);
  // The card data names the floor; the drawing never guesses the unit.
  assert.equal(period(sleepWeek(427), 'sleep', 'baseline').viz.floor, 0);
  const feeds = trend(range(-7, 0).flatMap(day => [feed(day), feed(day, 615), ...(day === 0 ? [feed(day, 630)] : [])]), range(-8, 0), {nowMinutes:900});
  assert.equal(period(feeds, 'feeds', 'baseline').viz.floor, 2);
});

test('home graphs: a bottle number is skipped only when the one before it is too close for both labels', () => {
  // Failure case (validator, 2026-11-19): a fixed 28-unit gap hid the number of a bar that had room for it.
  const {daylineLabels, labelGap} = (() => { const charts: any = {}; runInNewContext(readFileSync(new URL('../web/charts.js', import.meta.url), 'utf8'), charts); return charts.LittleDaysCharts; })();
  assert.equal(labelGap('50', '70'), 24);
  assert.equal(labelGap('100', '?'), 33);
  // 144 minutes is 26 drawing units: room for two 2-digit numbers, not for a 3-digit one.
  const two = [{t:600, ml:50, shown:'50'}, {t:744, ml:70, shown:'70'}];
  assert.deepEqual(plain(daylineLabels(two).map(label => label.text)), ['50', '70']);
  assert.deepEqual(plain(daylineLabels([{t:600, ml:120, shown:'120'}, {t:744, ml:70, shown:'70'}]).map(label => label.text)), ['120']);
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

// Review round 1 (2026-11-19): each test below failed before its fix.
const chartsModule = () => { const charts: any = {}; runInNewContext(readFileSync(new URL('../web/charts.js', import.meta.url), 'utf8'), charts); return charts.LittleDaysCharts; };
const rects = svg => [...svg.matchAll(/<rect class="([\w ]+)" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)]
  .map(m => ({cls:m[1], x:+m[2], y:+m[3], width:+m[4], height:+m[5]}));

test('C1 home graphs: sleep columns use the rounded minutes that the note uses', () => {
  // Failure case: 430.4 usual and 430.6 today drew an equal mark under a note that says "1 min over".
  const card = period(trend(range(-7, 0).map(day => ({id:`sleep:${day}`, type:'sleep', t:day * 1440 + 60,
    dur:day === 0 ? 430.6 : 400.4 + 10 * (day + 7)})), range(-8, 0), {nowMinutes:900}), 'sleep', 'baseline');
  assert.equal(card.note, '1 min over the usual 7 h 10 min');
  assert.equal(card.viz.usual, 430);
  assert.deepEqual(plain(card.viz.bars.map(bar => bar.value)), [400, 410, 420, 430, 440, 450, 460, 431]);
});

test('C2 home graphs: with gaps the verdict names the days with records', () => {
  // Failure case: "the last day" for one record six days back, and "the last 2 days" for two records in a week.
  const diaper = day => ({id:`d:${day}`, type:'diaper', kind:'W', t:day * 1440 + 300});
  const one = trend([diaper(-6), diaper(0)], range(-8, 0), {nowMinutes:900});
  assert.equal(period(one, 'diapers', 'baseline').headline, 'Same as the day with records');
  const two = trend([diaper(-6), diaper(-3), diaper(0), {...diaper(0), id:'d:0b', t:400}], range(-8, 0), {nowMinutes:900});
  assert.equal(period(two, 'diapers', 'baseline').headline, 'More than any of the 2 days with records');
  assert.equal(period(trend([diaper(-6), diaper(-3), diaper(0), {...diaper(0), id:'d:0b', t:400}], range(-8, 0), {nowMinutes:900, lang:'es'}), 'diapers', 'baseline').headline,
    'Más que cualquiera de los 2 días con registros');
  const newborn = trend([diaper(-1), diaper(0)], range(-8, 0), {nowMinutes:900, child:{birthDate:trendDate(-1)}});
  assert.equal(period(newborn, 'diapers', 'baseline').headline, 'Same as the last day');
});

test('C3 home graphs: a small past value on the 2-column card keeps a visible column', () => {
  // Failure case: 1 against 100 gave the outlined column height 0.
  const [past] = rects(chartsModule().mini([{value:1}, {value:100, today:true}], null, 'x')).filter(r => r.cls === 'past');
  assert.equal(past.y + past.height + 1, 48);
  assert.ok(past.height >= 6, `height ${past.height}`);
});

test('C4 home graphs: a 1 mL and a 10 mL bottle draw different heights', () => {
  // Failure case: both were raised to the same 4-unit minimum.
  const bars = rects(chartsModule().dayline([{t:300, ml:1, shown:'1'}, {t:600, ml:10, shown:'10'}, {t:900, ml:120, shown:'120'}], 1000, 'x'));
  const [one, ten] = [300, 600].map(t => bars.find(r => Math.abs(r.x + 3 - (10 + 260 * t / 1440)) < 0.01));
  assert.ok(one.height < ten.height, `${one.height} < ${ten.height}`);
  assert.ok(Math.abs(one.height - (2 + 18 / 120)) < 1e-9, `${one.height}`);
});

test('C5 R4 home graphs: bottles at the same or a near time stand at least 7 units apart, and their numbers follow', () => {
  // Failure cases: two bottles at 10:00 AM drew as one bar (C5); 10:00, 10:00 and 10:19 put the third bar 0.07 units
  // from the second (R4, review round 2).
  const {dayline, daylineLabels} = chartsModule();
  const centers = marks => rects(dayline(marks, 1000, 'x')).map(r => r.x + r.width / 2).sort((a, b) => a - b);
  const at = t => 10 + 260 * t / 1440;
  const same = [{t:600, ml:60, shown:'60'}, {t:600, ml:90, shown:'90'}];
  const xs = centers(same);
  assert.equal(xs.length, 2);
  assert.ok(Math.abs(xs[0] - at(600)) < 0.01 && Math.abs(xs[1] - xs[0] - 7) < 0.01, `${xs}`);
  assert.ok(Math.abs(daylineLabels(same)[0].x * 280 - xs[0]) < 0.01);
  const near = centers([{t:600, ml:60, shown:'60'}, {t:600, ml:90, shown:'90'}, {t:619, ml:30, shown:'30'}]);
  assert.ok(near[1] - near[0] >= 7 - 1e-9 && near[2] - near[1] >= 7 - 1e-9, `${near}`);
  // A run that would pass the now line (here the end of the day) shifts left so it ends there.
  const late = rects(dayline([{t:1440, ml:60, shown:'60'}, {t:1440, ml:90, shown:'90'}], 1440, 'x')).map(r => r.x + r.width / 2).sort((a, b) => a - b);
  // The last bar's right edge ends at the now line (Codex r1: edges, not centers, stay inside).
  assert.ok(Math.abs(late[1] - (at(1440) - 3)) < 0.01 && Math.abs(late[1] - late[0] - 7) < 0.01, `${late}`);
});

test('R1 home graphs: a usual level of 0 still draws the difference columns', () => {
  // Failure case: a usual that rounds to 0 (15 s of sleep each past day) fell to the zero-based chart with no labels.
  const card = period(trend(range(-7, 0).map(day => ({id:`sleep:${day}`, type:'sleep', t:day * 1440 + 60, dur:day === 0 ? 1 : 0.25})),
    range(-8, 0), {nowMinutes:900}), 'sleep', 'baseline');
  assert.equal(card.viz.usual, 0);
  const svg = chartsModule().mini(card.viz.bars, card.viz.usual, 'x', card.viz.floor);
  assert.match(svg, /class="usual"/);
  assert.equal(rects(svg).length, 8);
});

test('R2 home graphs: a recorded zero draws; only a day with no record is skipped', () => {
  // Failure case: a past or today value that rounds to 0 lost its column, though it was counted in the verdict.
  const entries = range(-7, 0).filter(day => day !== -3).map(day => ({id:`sleep:${day}`, type:'sleep', t:day * 1440 + 60,
    dur:day === 0 || day === -5 ? 0.3 : 30}));
  const card = period(trend(entries, range(-8, 0), {nowMinutes:900}), 'sleep', 'baseline');
  assert.deepEqual(plain(card.viz.bars.map(bar => bar.value)), [30, 30, 0, 30, null, 30, 30, 0]);
  // The recorded 0 on day -5 is in the range, so today's 0 is "About usual", not "Less than any of the 5 days with records".
  assert.equal(card.headline, 'About usual');
  const svg = chartsModule().mini(card.viz.bars, card.viz.usual, 'x', card.viz.floor);
  assert.equal(rects(svg).length, 7);
  assert.equal(rects(svg).filter(r => r.cls.startsWith('today')).length, 1);
});

test('R3 home graphs: a larger bottle is always a taller bar', () => {
  // Failure case: 1 mL and 10 mL both drew at the 2-unit minimum.
  const bars = rects(chartsModule().dayline([{t:300, ml:1, shown:'1'}, {t:600, ml:10, shown:'10'}, {t:900, ml:200, shown:'200'}], 1000, 'x'))
    .sort((a, b) => a.x - b.x).map(r => +r.height.toFixed(2));
  assert.deepEqual(bars, [2.09, 2.9, 20]);
});

test('G3 home graphs: the Spanish note is two short sentences with no bare number', () => {
  // Failure case: "1 toma por debajo de lo usual, 9, hasta las 10:23 p.m." left the usual as a bare number.
  const note = period(sleepWeek(427, {lang:'es'}), 'sleep', 'baseline').note;
  assert.match(note, /^3 min menos\. Lo usual es 7 h 10 min\.$/);
  assert.match(period(sleepWeek(500, {lang:'es'}), 'sleep', 'baseline').note, /^1 h 10 min más\. Lo usual es 7 h 10 min\.$/);
});

test('F1 home graphs: a bottle bar never lands right of the now line, and its number follows it', () => {
  // Failure case (Codex round 3): now 10:15, bottles at 10:00 and 10:10; the second bar moved to about 10:39, past now.
  const {dayline, daylineLabels} = chartsModule();
  const marks = [{t:600, ml:60, shown:'60'}, {t:610, ml:90, shown:'90'}], now = 615, nowX = 10 + 260 * now / 1440;
  const xs = rects(dayline(marks, now, 'x')).map(r => r.x + r.width / 2).sort((a, b) => a - b);
  assert.equal(xs.length, 2);
  assert.ok(xs.every(x => x <= nowX + 1e-9), `${xs} vs now ${nowX}`);
  assert.ok(xs[1] - xs[0] >= 7 - 1e-9, `${xs}`);
  const labels = daylineLabels(marks, now).map(label => label.x * 280);
  assert.ok(Math.abs(labels[0] - xs[0]) < 1e-9, `${labels} vs ${xs}`);
});

// Card polish (owner, 2026-11-19): whole mL on every Home card, and no bottle bar left of midnight.
const mlStrings = card => JSON.stringify(plain(card)).match(/\d[\d.,]*\s*mL/g) || [];
const bottleDay = (today, yesterday = []) => [...today.map((ml, i) => ({id:`feedings:t${i}`, type:'bottle', t:300 + 60 * i, ml, unit:'ml'})),
  ...yesterday.map((ml, i) => ({id:`feedings:y${i}`, type:'bottle', t:-1440 + 300 + 60 * i, ml, unit:'ml'}))];

test('P1 whole mL: an even count of 50 and 55 mL reads "53 mL per bottle" (half rounds up), en and es', () => {
  // Failure case: the per-bottle amount of 50 and 55 mL read "52.5 mL".
  const opts = {child:{birthDate:trendDate(-6)}, nowMinutes:900};
  assert.match(period(trend(bottleDay([50, 55]), range(-7, 0), opts), 'bottles', 'breakdown').body, /105 mL total, 53 mL per bottle/);
  assert.match(period(trend(bottleDay([50, 55]), range(-7, 0), {...opts, lang:'es'}), 'bottles', 'breakdown').body, /105 mL en total, 53 mL por biberón/);
});

test('P2 whole mL: no mL amount on any card has a decimal (total, per bottle, difference, bar numbers, largest bottle)', () => {
  // Failure case: typed decimals (55.4 mL) and averages showed "55.4", "105.4 mL", "65.1 mL more".
  const entries = bottleDay([50, 55.4], [40.3]);
  for (const lang of ['en', 'es']) {
    const cards = trend(entries, range(-7, 0), {child:{birthDate:trendDate(-6)}, nowMinutes:900, lang});
    const bottles = period(cards, 'bottles', 'breakdown');
    assert.deepEqual(plain(bottles.viz.marks.map(mark => mark.shown)), ['50', '55']);
    assert.match(bottles.body, lang === 'en' ? /105 mL total, 53 mL per bottle.*65 mL more/ : /105 mL en total, 53 mL por biberón.*65 mL más/);
    assert.equal(period(cards, 'bottles', 'largest').headline, '55 mL');
    const all = cards.flatMap(mlStrings);
    assert.ok(all.length >= 5, `${all}`);
    for (const amount of all) assert.match(amount, /^\d+\s*mL$/, `${lang}: ${amount}`);
  }
});

test('P3 US units keep one decimal for oz', () => {
  // Failure case: whole-number rounding applied to oz too ("4 oz" for 120 mL).
  const cards = trend(bottleDay([50, 55]), range(-7, 0), {child:{birthDate:trendDate(-6)}, nowMinutes:900, units:'us'});
  const bottles = period(cards, 'bottles', 'breakdown');
  assert.deepEqual(plain(bottles.viz.marks.map(mark => mark.shown)), ['1.7', '1.9']);
  assert.match(bottles.body, /3\.6 oz total, 1\.8 oz per bottle/);
  assert.equal(period(cards, 'bottles', 'largest').headline, '1.9 oz');
});

test('P4 home graphs: every bottle bar, edges included, stays between the midnight mark and the now line', () => {
  // Failure cases: at 12:10 AM with bottles at 12:00 and 12:05 the pull-back put the first bar 4 units left of midnight;
  // Codex r1: with centers inside, a 6-unit bar still spilled 3 units before midnight and 3 units past now.
  // One bar is 6 units wide; the first 33 minutes of the day are narrower than that (12:10 AM is 1.8 units), so until then
  // the bars start at the midnight mark and may reach past the now line by at most one bar width from midnight.
  const {dayline, daylineLabels} = chartsModule();
  const at = t => 10 + 260 * t / 1440;
  const check = (marks, now) => {
    const svg = dayline(marks, now, 'x'), bars = rects(svg), xs = bars.map(r => r.x + r.width / 2).sort((a, b) => a - b);
    const right = Math.max(at(now), at(0) + 6);
    assert.doesNotMatch(svg, /NaN/);
    assert.equal(bars.length, marks.length);
    for (const r of bars) assert.ok(r.x >= at(0) - 1e-9 && r.x + r.width <= right + 1e-9, `edges ${r.x}..${r.x + r.width} outside [${at(0)}, ${right}]`);
    for (const label of daylineLabels(marks, now)) assert.ok(Number.isFinite(label.x) && label.x * 280 >= at(0) - 1e-9 && label.x * 280 <= right + 1e-9);
    return xs;
  };
  check([{t:0, ml:60, shown:'60'}, {t:5, ml:90, shown:'90'}], 10);
  check([{t:0, ml:60, shown:'60'}, {t:4, ml:90, shown:'90'}, {t:8, ml:30, shown:'30'}], 10);
  // 12:40 AM (7.2 units): three bars fit with their edges inside, spaced evenly.
  const three = check([{t:0, ml:60, shown:'60'}, {t:5, ml:90, shown:'90'}, {t:35, ml:30, shown:'30'}], 40);
  assert.ok(three[0] >= at(0) + 3 - 1e-9 && three[2] <= at(40) - 3 + 1e-9, `${three}`);
  assert.ok(Math.abs((three[1] - three[0]) - (three[2] - three[1])) < 1e-9, `${three}`);
  // A bottle at midnight with now at midnight: one place, no NaN.
  check([{t:0, ml:60, shown:'60'}, {t:0, ml:90, shown:'90'}], 0);
  // A bottle at the now line late in the day.
  check([{t:900, ml:60, shown:'60'}], 900);
  // About 40 bottles in one day.
  check(Array.from({length:40}, (_, i) => ({t:i * 20, ml:30 + i, shown:String(30 + i)})), 800);
  check(Array.from({length:40}, (_, i) => ({t:i, ml:i % 3 ? 60 : null, shown:i % 3 ? '60' : '?'})), 40);
});

test('P6 a half-mL difference rounds up, from the unrounded totals', () => {
  // Failure case (Codex r1): 64.1 mL today and 63.6 mL yesterday (0.4999999999999929 in floating point) read "no change".
  const entries = [{id:'feedings:t', type:'bottle', t:300, ml:64.1, unit:'ml'}, {id:'feedings:y', type:'bottle', t:-1440 + 300, ml:63.6, unit:'ml'}];
  const body = lang => period(trend(entries, range(-7, 0), {child:{birthDate:trendDate(-6)}, nowMinutes:900, lang}), 'bottles', 'breakdown').body;
  assert.match(body('en'), /\(1 mL more today\)/);
  assert.match(body('es'), /\(1 mL más hoy\)/);
});

test('P5 a usual count is a whole number: 6 days of 9 and 10 diaper changes read "the usual 10", never 9.5', () => {
  // Failure case: the median of an even count of days read "2.5 diaper changes over the usual 9.5" and "median 9.5".
  const changes = (day, n) => range(1, n).map(i => ({id:`dc:${day}:${i}`, type:'diaper', kind:'W', t:day * 1440 + i * 60}));
  const entries = [-7, -6, -5, -4, -2, -1].flatMap((day, i) => changes(day, i % 2 ? 10 : 9)).concat(changes(0, 12));
  for (const lang of ['en', 'es']) {
    const card = period(trend(entries, range(-8, 0), {nowMinutes:900, lang}), 'diapers', 'baseline');
    assert.equal(card.note, lang === 'en' ? '2 diaper changes over the usual 10' : '2 cambios de pañal más. Lo usual es 10.');
    assert.equal(card.viz.usual, 10);
    assert.match(card.body, lang === 'en' ? /median 10,/ : /mediana 10,/);
    assert.doesNotMatch(JSON.stringify(plain(card)), /\d[.,]5\b/);
  }
});

// About-her facts (card mix, owner, 2026-11-19): from loaded records only, no AI.
const about = cards => cards.filter(card => card.fun);
const diaper = (day: number, minute: number) => ({id:`changes:${day}:${minute}`, type:'diaper', kind:'W', t:day * 1440 + minute});
const nap = (day: number, minute: number, dur: number) => ({id:`sleep:${day}:${minute}`, type:'sleep', t:day * 1440 + minute, dur});

test('about her: with every day since birth loaded, the cards say "so far"; a tie keeps the earliest record', () => {
  // Failure cases: "so far" over a partial history, a later tie replacing the first record, a bottle with no amount winning.
  const entries = [nap(-4, 100, 250), nap(-2, 100, 250), nap(-1, 100, 90),
    {id:'feedings:a', type:'bottle', t:-3 * 1440 + 500, ml:90, unit:'ml'}, {id:'feedings:b', type:'bottle', t:-1 * 1440 + 500, ml:300, unit:'unknown'}];
  const cards = about(trend(entries, range(-7, 0), {child:{birthDate:trendDate(-6)}}));
  assert.deepEqual(plain(cards.map(card => [card.title, card.headline, card.note, card.big])),
    [['Longest sleep so far', '4 h 10 min', 'Mar 14', true], ['Largest bottle so far', '90 mL', 'Mar 15', true]]);
  assert.equal(cards[0].evidence[0].id, 'sleep:-4:100');
  const es = about(trend(entries, range(-7, 0), {child:{birthDate:trendDate(-6)}, lang:'es'}));
  assert.deepEqual(plain(es.map(card => [card.title, card.note])), [['El sueño más largo', '14 mar'], ['El biberón más grande', '15 mar']]);
  // Only bottles with no amount: no bottle card.
  assert.deepEqual(plain(about(trend([entries[4]], range(-7, 0), {child:{birthDate:trendDate(-6)}}))), []);
});

test('about her: a partial history names the first loaded day and shows no round-number card', () => {
  const entries = [nap(-4, 100, 250), ...range(-9, 0).flatMap(day => range(1, day === 0 ? 5 : 5).map(i => diaper(day, i * 60)))];
  const cards = about(trend(entries, range(-10, 0), {nowMinutes:900}));
  assert.deepEqual(plain(cards.map(card => card.title)), ['Longest sleep since Mar 8']);
  assert.equal(about(trend(entries, range(-10, 0), {nowMinutes:900, lang:'es'}))[0].title, 'El sueño más largo desde el 8 mar');
});

test('about her: a round number shows on the day it is reached, not later', () => {
  // Five days of 9 diaper changes, then today: the 50th is the 5th change today.
  const before = range(-5, -1).flatMap(day => range(1, 9).map(i => diaper(day, i * 60)));
  const today = range(1, 5).map(i => diaper(0, i * 60));
  const birth = {child:{birthDate:trendDate(-6)}, nowMinutes:900};
  const reached = about(trend([...before, ...today], range(-7, 0), birth));
  assert.deepEqual(plain(reached.map(card => [card.title, card.headline, card.note])), [['Diaper number 50', 'Today', 'Counted since Mar 12']]);
  assert.equal(reached[0].evidence[0].id, 'changes:0:300');
  assert.equal(about(trend([...before, ...today], range(-7, 0), {...birth, lang:'es'}))[0].title, 'Pañal número 50');
  // Reached yesterday (the 50th was on day -1): no card today.
  const early = range(-5, -1).flatMap(day => range(1, 10).map(i => diaper(day, i * 60)));
  assert.deepEqual(plain(about(trend([...early, diaper(0, 60)], range(-7, 0), birth))), []);
  // 49 so far: no card.
  assert.deepEqual(plain(about(trend([...before, ...today.slice(0, 4)], range(-7, 0), birth))), []);
});

// US units on the record cards (card mix review, 2026-11-19). Failure cases: mL on a US card, an unrounded oz, "undefined".
test('US units: the bottle bars and the largest bottle', () => {
  const entries = [{id:'feedings:a', type:'bottle', t:-1440 + 500, ml:90, unit:'ml'}, {id:'feedings:b', type:'bottle', t:300, ml:120, unit:'ml'},
    {id:'feedings:c', type:'bottle', t:400, unit:'unknown'}, {id:'sleep:1', type:'sleep', t:-60, dur:150}, diaper(0, 420)];
  const cards = trend(entries, range(-7, 0), {child:{birthDate:trendDate(-6)}, units:'us', nowMinutes:600});
  const bottles = period(cards, 'bottles', 'breakdown');
  assert.equal(bottles.title, 'Bottle volumes, oz');
  assert.deepEqual(plain(bottles.viz.marks.map(mark => mark.shown)), ['4.1', '?']);
  assert.match(bottles.body, /4\.1 oz total/);
  assert.deepEqual([period(cards, 'bottles', 'largest').headline, period(cards, 'bottles', 'largest').note], ['4.1 oz', 'Mar 18']);
  for (const card of cards) assert.doesNotMatch(JSON.stringify(card), /undefined|NaN|mL/);
});

// Review round 1 (2026-11-19).
test('r1 night: before 7 AM the night still running is not shown, and no older night is called "last night"', () => {
  // Failure case: at 6 AM the card called the night that ended yesterday morning "last night".
  const nights = [470, 600, 540, 630, 515, 575, 535].map((dur, i) => ({id:`night:${i}`, type:'sleep', t:(i - 8) * 1440 + 1200, dur}));
  assert.equal(period(trend(nights, range(-9, 0), {nowMinutes:360}), 'sleep', 'night'), undefined);
  assert.ok(period(nightTrend([470, 600, 540, 630, 515, 575, 535]), 'sleep', 'night'));
});

test('r1 about her: the loaded window is the run of loaded days that ends today; a gap starts it after the gap', () => {
  // Failure case: with only Mar 8, Mar 17 and Mar 18 loaded the card said "since Mar 8".
  const entries = [nap(-1, 100, 250)];
  assert.deepEqual(plain(about(trend(entries, [-10, -1, 0], {nowMinutes:900}))), []);
  const gapped = about(trend(entries, [-10, -9, -8, ...range(-6, 0)], {nowMinutes:900}));
  assert.deepEqual(plain(gapped.map(card => card.title)), ['Longest sleep since Mar 12']);
});

test('r1 last 7 days: the change comes from the unrounded averages, rounded once', () => {
  // 13 feeds over the last 7 days (1.857, shown 1.9) and 12 over the 7 before (1.714, shown 1.7): the change is +0.1, not +0.2.
  const counts = [1, 1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2];
  const entries = counts.flatMap((n, i) => range(1, n).map(k => feed(i - 14, 500 + 30 * k)));
  const row = lastWeek(trend(entries, range(-15, 0))).viz.rows[0];
  assert.deepEqual([row.avg, row.change], ['1.9 a day', '+0.1']);
});

test('r1 round number: when 50 and 51 both come today, the note does not give 50 as the total', () => {
  const before = range(-5, -1).flatMap(day => range(1, 9).map(i => diaper(day, i * 60)));
  const today = range(1, 6).map(i => diaper(0, i * 60));
  const [card] = about(trend([...before, ...today], range(-7, 0), {child:{birthDate:trendDate(-6)}, nowMinutes:900}));
  assert.equal(card.title, 'Diaper number 50');
  assert.doesNotMatch(card.note + card.body, /50 diaper changes/);
  assert.equal(card.note, 'Counted since Mar 12');
});

// Review round 2 (2026-11-19).
test('r2 about her: one window (the run of loaded days ending today, at least 7) picks the records, not only the title', () => {
  // Failure case: Mar 9 and Mar 12 to 18 loaded; the cards said "since Mar 12" but showed the Mar 9 records.
  const entries = [nap(-9, 100, 300), {id:'feedings:old', type:'bottle', t:-9 * 1440 + 500, ml:150, unit:'ml'},
    nap(-1, 100, 60), {id:'feedings:new', type:'bottle', t:-1 * 1440 + 500, ml:60, unit:'ml'}];
  const cards = about(trend(entries, [-9, ...range(-6, 0)], {nowMinutes:900}));
  assert.deepEqual(plain(cards.map(card => [card.title, card.headline, card.note])),
    [['Longest sleep since Mar 12', '1 h', 'Mar 17'], ['Largest bottle since Mar 12', '60 mL', 'Mar 17']]);
});

test('r2 about her: a baby under 7 days old gets no about-her card, so "so far" never rests on under a week', () => {
  const entries = [nap(-1, 100, 250), {id:'feedings:a', type:'bottle', t:-1440 + 500, ml:90, unit:'ml'}];
  assert.deepEqual(plain(about(trend(entries, range(-6, 0), {child:{birthDate:trendDate(-5)}, nowMinutes:900}))), []);
  assert.equal(about(trend(entries, range(-7, 0), {child:{birthDate:trendDate(-6)}, nowMinutes:900}))[0].title, 'Longest sleep so far');
});
