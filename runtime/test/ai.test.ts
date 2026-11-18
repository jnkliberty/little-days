import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import { createAI, DEFAULT_AI_MODEL } from '../server/ai.ts';
import {openStore} from '../server/store.ts';
import {format} from 'node:util';
import {createRouter} from '../server/router.ts';
import {createApp} from '../server/app.ts';

const session = {sessionId: 'a'.repeat(43), csrfToken: 'csrf', adult: 'PRIVATE_ADULT'};
const env = {LITTLE_DAYS_AI_ENABLED: 'true', LITTLE_DAYS_AI_MODEL: 'synthetic-model', LITTLE_DAYS_ANTHROPIC_API_KEY: 'synthetic-key'};
const grants = Object.fromEntries(['children', 'feedings', 'pumping', 'sleep', 'changes', 'notes', 'temperature', 'weight', 'height', 'head-circumference', 'tummy-times', 'medication'].map(key => [key, {view: true}]));
function fixture(model = 'synthetic-model') {
  const store = openStore(':memory:');
  const state = {today: '2026-11-08', child: {name: 'PRIVATE_CHILD', birthDate: '2026-10-01', portrait: 'PRIVATE_PHOTO'}, permissions: {resources: structuredClone(grants)}, entries: [
    {id: 'feedings:1', type: 'feed', t: 600, dur: 10, by: 'PRIVATE_CARER', note: 'PRIVATE_NOTE', side: 'L'},
    {id: 'sleep:2', type: 'sleep', t: 620, dur: 20},
    {id: 'medication:3', type: 'med', t: 500, name: 'PRIVATE_MED', dose: 20},
    {id: 'notes:4', type: 'note', t: 500, text: 'PRIVATE_VISIT'},
    {id: 'notes:5', type: 'other', what: 'mile', title: 'First smile', t: 400, text: 'PRIVATE_MILESTONE_NOTE'},
  ]};
  const reads: any[] = [], calls: any[] = [];
  let output: any = {answer: 'A feeding was recorded.', record_ids: ['feedings:1'], source_ids: []};
  let stop = 'end_turn', failure: Error | null = null, content: unknown;
  const options = {store, env: {...env, LITTLE_DAYS_AI_MODEL: model}, now: () => new Date('2026-11-08T18:00:00Z'), records: {state: async (_session, period) => {reads.push(period); return state;}} as any,
    fetch: async (url, init) => {calls.push({url, init, body: JSON.parse(String(init.body))}); if (failure) throw failure; return new Response(JSON.stringify({stop_reason: stop, content: content === undefined ? [{type: 'text', text: JSON.stringify(output)}] : content}));}};
  return {store, state, reads, calls, options, setOutput: value => {output = value;}, setContent: value => {content = value;}, setStop: value => {stop = value;}, setFailure: value => {failure = value;}};
}

test('AI sends compact permitted context, fresh seven-day range, and server-owned references', async () => {
  const f = fixture();
  try {
    const result = await createAI(f.options).chat(session, {question: 'What was recorded?', lang: 'en', factId: 'invented-fact'});
    assert.deepEqual(f.reads[0], {from: '2026-11-02', to: '2026-11-09', label: 'Nov 2, 2026 – Nov 8, 2026; today so far · America/Mexico_City'});
    const sent = JSON.stringify(f.calls[0].body);
    for (const secret of ['PRIVATE_', '2026-10-01', 'synthetic-key']) assert.ok(!sent.includes(secret), secret);
    assert.ok(sent.includes('First smile'));
    assert.deepEqual(result.references, [{kind: 'record', id: 'feedings:1', label: 'Feeding · Nov 8, 2026', date: '2026-11-08'}]);
    assert.equal(f.calls[0].url, 'https://api.anthropic.com/v1/messages');
    assert.equal(f.calls[0].init.headers['anthropic-version'], '2026-10-21');
    assert.equal(f.calls[0].body.output_config.format.type, 'json_schema');
    assert.equal(f.calls[0].body.max_tokens, 4000);
    assert.equal(f.calls[0].body.thinking, undefined);
    assert.equal(f.calls[0].body.output_config.effort, undefined);
    assert.ok(f.calls[0].init.signal instanceof AbortSignal);
    f.state.permissions.resources.feedings.view = false;
    f.setOutput({answer: 'Feeding access is unavailable.', record_ids: [], source_ids: []});
    await createAI(f.options).chat(session, {question: 'And feeding?', lang: 'en'});
    assert.equal(f.reads.length, 2);
    const context = JSON.parse(JSON.parse(f.calls[1].body.messages[0].content).context);
    assert.ok(!JSON.stringify(context).includes('feedings:1'));
    assert.equal(context.resources.feedings.access, 'denied');
  } finally {f.store.close();}
});

test('AI validates requests and stays off when it is turned off, has no key, or has an invalid model', async () => {
  const f = fixture();
  try {
    for (const input of [{question: '', lang: 'en'}, {question: 'x', lang: 'fr'}, {question: 'x'.repeat(2001), lang: 'en'}, {question: 'x', lang: 'es', history: [{role: 'system', text: 'x'}]}, {question: 'x', lang: 'en', history: Array(13).fill({role: 'user', text: 'x'})}]) await assert.rejects(createAI(f.options).chat(session, input), {status: 400});
    for (const partial of [{}, {...env, LITTLE_DAYS_AI_ENABLED: 'false'}, {...env, LITTLE_DAYS_AI_MODEL: 'not a model'}, {...env, LITTLE_DAYS_ANTHROPIC_API_KEY: ''}]) {
      const ai = createAI({...f.options, env: partial});
      assert.deepEqual(ai.status(), {available: false, provider: null, dailyDevelopment: false});
      await assert.rejects(ai.chat(session, {question: 'Pregunta', lang: 'es'}), error => error.status === 503 && /disponible/.test(error.message));
    }
    assert.equal(f.reads.length, 0); assert.equal(f.calls.length, 0);
  } finally {f.store.close();}
});

test('AI rejects invented references, malformed output, and truncated or refused replies without retries', async t => {
  for (const [label, output, stop] of [
    ['record', {answer: 'x', record_ids: ['sleep:999'], source_ids: []}, 'end_turn'],
    ['fact-id', {answer: 'x', record_ids: ['record:feeds:2026-11-08'], source_ids: []}, 'end_turn'],
    ['source', {answer: 'x', record_ids: [], source_ids: ['fake']}, 'end_turn'],
    ['shape', {answer: 'x', record_ids: 'feedings:1', source_ids: []}, 'end_turn'],
    ['extra', {answer: 'x', record_ids: [], source_ids: [], html: 'x'}, 'end_turn'],
    ['empty', {answer: '', record_ids: [], source_ids: []}, 'end_turn'],
    ['truncated', {answer: 'x', record_ids: [], source_ids: []}, 'max_tokens'],
    ['refused', {answer: 'x', record_ids: [], source_ids: []}, 'refusal'],
  ]) await t.test(String(label), async () => {
    const f = fixture(); f.setOutput(output); f.setStop(stop);
    try {
      await assert.rejects(createAI(f.options).chat(session, {question: 'x', lang: 'en'}), {status: 502});
      assert.equal(f.calls.length, 1);
      if (label === 'fact-id') {
        const context = JSON.parse(JSON.parse(f.calls[0].body.messages[0].content).context);
        assert.ok(context.facts.some(fact => fact.id === 'record:feeds:2026-11-08'));
      }
    }
    finally {f.store.close();}
  });
});

// Wave 9 (D6). The daily question limit lives in the gateway database (setting `app` / `aiDailyLimit`); the default is 20 and 0 means no limit.
const ask = (f: ReturnType<typeof fixture>, lang = 'en') => createAI(f.options).chat(session, {question: 'x', lang});

test('the daily limit defaults to 20: the 21st question gets a clear 429 and makes no provider call', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 20; i++) await ask(f);
    assert.equal(f.calls.length, 20);
    await assert.rejects(ask(f), (error: any) => error.status === 429 && /daily limit of 20 questions/.test(error.message) && /tomorrow/.test(error.message));
    await assert.rejects(ask(f, 'es'), (error: any) => error.status === 429 && /límite diario de 20 preguntas/.test(error.message) && /mañana/.test(error.message));
    assert.equal(f.calls.length, 20, 'no provider call after the limit');
    assert.equal(f.reads.length, 20, 'no care records are read after the limit either');
  } finally {f.store.close();}
});

test('the owner sets the limit in the database; 0 means no limit; a bad value falls back to the default', async () => {
  const f = fixture();
  try {
    f.store.putSetting('app', 'aiDailyLimit', 2);
    await ask(f); await ask(f);
    await assert.rejects(ask(f), {status: 429});
    assert.equal(f.calls.length, 2);
    f.store.putSetting('app', 'aiDailyLimit', 0);
    for (let i = 0; i < 25; i++) await ask(f);
    assert.equal(f.calls.length, 27, '0 is no limit');
    for (const bad of [-1, 1.5, 'x', null, 100001, {}]) {
      f.store.putSetting('app', 'aiDailyLimit', bad);
      f.store.putSetting('app', 'ai_daily', {date: '2026-11-08', count: 20});
      await assert.rejects(ask(f), {status: 429});
    }
  } finally {f.store.close();}
});

test('the count starts again each local day, and a failed answer does not use a question', async () => {
  const f = fixture();
  try {
    f.store.putSetting('app', 'aiDailyLimit', 1);
    f.setFailure(Object.assign(new Error('PRIVATE_PROVIDER_ERROR'), {name: 'TimeoutError'}));
    await assert.rejects(ask(f), (error: any) => error.status === 504 && !error.message.includes('PRIVATE'));
    f.setFailure(null);
    await ask(f);
    await assert.rejects(ask(f), {status: 429});
    const calls = f.calls.length;
    const tomorrow = createAI({...f.options, now: () => new Date('2026-11-09T18:00:00Z')});
    await tomorrow.chat(session, {question: 'x', lang: 'en'});
    assert.equal(f.calls.length, calls + 1);
  } finally {f.store.close();}
});

test('a failed question that spans local midnight does not reset the new day\'s count', async () => {
  const f = fixture();
  try {
    f.store.putSetting('app', 'aiDailyLimit', 5);
    let clock = new Date('2026-11-08T23:50:00-06:00');
    let fail!: () => void;
    const held = new Promise<void>(resolve => { fail = resolve; });
    // The first question reserves on November 8, then waits at the provider. The slow provider fails after midnight.
    const slow = createAI({...f.options, now: () => clock, fetch: (async () => { await held; throw Object.assign(new Error('PRIVATE_PROVIDER_ERROR'), {name: 'TimeoutError'}); }) as any});
    const pending = slow.chat(session, {question: 'x', lang: 'en'}).then(() => 'answered', (error: any) => error.status);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(f.store.getSetting('app', 'ai_daily'), {date: '2026-11-08', count: 1});
    clock = new Date('2026-11-09T00:10:00-06:00');
    const today = createAI({...f.options, now: () => clock});
    await today.chat(session, {question: 'x', lang: 'en'});
    await today.chat(session, {question: 'x', lang: 'en'});
    assert.deepEqual(f.store.getSetting('app', 'ai_daily'), {date: '2026-11-09', count: 2});
    fail();
    assert.equal(await pending, 504);
    assert.deepEqual(f.store.getSetting('app', 'ai_daily'), {date: '2026-11-09', count: 2}, 'the release of a November 8 question leaves November 9 alone');
  } finally {f.store.close();}
});

test('questions that arrive together cannot pass the limit', async () => {
  const f = fixture();
  try {
    f.store.putSetting('app', 'aiDailyLimit', 1);
    const results = await Promise.allSettled([ask(f), ask(f), ask(f)]);
    assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected', 'rejected']);
    assert.equal(f.calls.length, 1);
  } finally {f.store.close();}
});

test('with no key, every AI route makes 0 provider calls and the session says AI is off', async () => {
  const f = fixture();
  const spy = {calls: 0}, counting = async () => {spy.calls++; throw new Error('the provider must not be called');};
  try {
    const states = [{}, {LITTLE_DAYS_AI_ENABLED: 'true', LITTLE_DAYS_AI_MODEL: 'synthetic-model'}, {...env, LITTLE_DAYS_ANTHROPIC_API_KEY: ''}, {LITTLE_DAYS_AI_ENABLED: 'false', LITTLE_DAYS_ANTHROPIC_API_KEY: 'synthetic-key'}, {ANTHROPIC_API_KEY: 'synthetic-key'}];
    for (const partial of states) {
      const ai = createAI({...f.options, env: partial, fetch: counting as any});
      assert.equal(ai.status().available, false, JSON.stringify(Object.keys(partial)));
      await assert.rejects(ai.chat(session, {question: 'x', lang: 'en'}), {status: 503});
      await assert.rejects(ai.chat(session, {question: 'x', lang: 'es'}), {status: 503});
      assert.deepEqual((await ai.dailyDevelopment(session as any)).cards, []);
      // Through the real app and router, as a signed-in adult.
      const sessions = {passcodeSet: () => true, issueLoginCsrf: () => 'login', get: (id: string) => id === session.sessionId ? session : null, renew: () => {}, csrfFor: () => 'csrf', people: () => [], labels: () => ({}), requireCsrf: () => {}} as any;
      const server = createApp({sessions, origin: 'https://little-days.test', webDir: '.', domain: createRouter({store: f.store, ai} as any).handle, integration: async () => {}, ai: ai.status().available});
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = 'http://127.0.0.1:' + (server.address() as any).port;
      const headers = {cookie: '__Host-little-days=' + session.sessionId, origin: 'https://little-days.test', 'x-csrf-token': 'csrf', 'content-type': 'application/json'};
      try {
        assert.equal((await (await fetch(base + '/api/session')).json()).ai, false, 'signed out');
        assert.equal((await (await fetch(base + '/api/session', {headers})).json()).ai, false, 'signed in');
        assert.equal((await fetch(base + '/api/ai/chat', {method: 'POST', headers, body: JSON.stringify({question: 'x', lang: 'en'})})).status, 503);
        assert.deepEqual(await (await fetch(base + '/api/ai/status', {headers})).json(), {available: false, provider: null, dailyDevelopment: false});
      } finally {await new Promise<void>(resolve => server.close(() => resolve()));}
    }
    assert.equal(spy.calls, 0);
    assert.equal(f.calls.length, 0);
  } finally {f.store.close();}
});

test('with a key the session says AI is on, and an install that sets nothing says off', async () => {
  const f = fixture();
  try {
    assert.equal(createAI(f.options).status().available, true);
    for (const [flag, expected] of [[true, true], [false, false], [undefined, false]] as const) {
      const sessions = {passcodeSet: () => true, issueLoginCsrf: () => 'login', get: () => null} as any;
      const server = createApp({sessions, origin: 'https://little-days.test', webDir: '.', domain: async () => {}, integration: async () => {}, ...(flag === undefined ? {} : {ai: flag})});
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      try { assert.equal((await (await fetch('http://127.0.0.1:' + (server.address() as any).port + '/api/session')).json()).ai, expected); }
      finally {await new Promise<void>(resolve => server.close(() => resolve()));}
    }
  } finally {f.store.close();}
});

test('AI HTTP routes require authentication and chat requires origin and CSRF', async () => {
  const f = fixture();
  const sessions = {passcodeSet: () => true, get: id => id === session.sessionId ? session : null, renew: () => {}, requireCsrf: (_id, csrf) => {if (csrf !== 'csrf') throw new Error();}} as any;
  const ai = createAI({...f.options, env: {}});
  const router = createRouter({store: f.store, ai} as any);
  const server = createApp({sessions, origin: 'https://little-days.test', webDir: '.', domain: router.handle, integration: async () => {}});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  const headers = {cookie: '__Host-little-days=' + session.sessionId, origin: 'https://little-days.test', 'x-csrf-token': 'csrf', 'content-type': 'application/json'};
  const post = overrides => fetch(base + '/api/ai/chat', {method: 'POST', headers: {...headers, ...overrides}, body: JSON.stringify({question: 'x', lang: 'en'})});
  try {
    assert.equal((await fetch(base + '/api/ai/status')).status, 401);
    assert.equal((await post({cookie: ''})).status, 401);
    assert.equal((await post({'x-csrf-token': 'wrong'})).status, 403);
    assert.equal((await post({origin: 'https://other.test'})).status, 403);
    assert.deepEqual(await (await fetch(base + '/api/ai/status', {headers})).json(), {available: false, provider: null, dailyDevelopment: false});
    assert.equal((await post({})).status, 503);
  } finally {await new Promise<void>(resolve => server.close(() => resolve())); f.store.close();}
});

test('AI returns only reviewed source metadata and rejects oversized records and answers', async () => {
  const f = fixture();
  try {
    f.setOutput({answer: 'Talk with your baby.', record_ids: [], source_ids: ['early-talk']});
    const result = await createAI(f.options).chat(session, {question: 'What can we try?', lang: 'en'});
    assert.equal(result.references[0].kind, 'source');
    assert.equal(result.references[0].id, 'early-talk');
    assert.equal(result.references[0].url, 'https://www.cdc.gov/act-early/milestones/2-months.html');
    f.setOutput({answer: 'x'.repeat(6001), record_ids: [], source_ids: []});
    await assert.rejects(createAI(f.options).chat(session, {question: 'x', lang: 'en'}), {status: 502});
    f.state.entries = Array.from({length: 501}, (_, index) => ({id: 'sleep:' + index, type: 'sleep', t: 600, dur: 5}));
    await assert.rejects(createAI(f.options).chat(session, {question: 'x', lang: 'en'}), {status: 413});
    assert.equal(f.calls.length, 2, 'oversized context must never start a paid call');
  } finally {f.store.close();}
});

test('AI supplies dated calculated sleep facts across all seven days with unique IDs', async () => {
  const f = fixture();
  f.state.entries = [
    {id: 'sleep:early', type: 'sleep', t: -8040, dur: 90},
    {id: 'sleep:yesterday', type: 'sleep', t: -900, dur: 75},
    {id: 'sleep:today', type: 'sleep', t: 600, dur: 60},
  ];
  f.setOutput({answer: 'The recorded stretches differ.', record_ids: ['sleep:early', 'sleep:today'], source_ids: []});
  try {
    await createAI(f.options).chat(session, {question: 'How did recorded sleep change this week?', lang: 'en'});
    const context = JSON.parse(JSON.parse(f.calls[0].body.messages[0].content).context);
    const sleeps = context.facts.filter(fact => fact.topic === 'sleep');
    assert.deepEqual(sleeps.map(fact => fact.id).sort(), ['record:sleep:2026-11-02', 'record:sleep:2026-11-07', 'record:sleep:2026-11-08']);
    assert.match(sleeps.find(fact => fact.id === 'record:sleep:2026-11-02').body, /90 minutes.*2026-11-02/);
    assert.match(sleeps.find(fact => fact.id === 'record:sleep:2026-11-08').body, /60 minutes.*2026-11-08/);
    assert.ok(sleeps.every(fact => !/today|yesterday/.test(fact.body)));
    assert.equal(new Set(context.facts.map(fact => fact.id)).size, context.facts.length);
  } finally {f.store.close();}
});

test('AI hides personal age and age-selected facts but permits general guidance when child access is denied', async () => {
  const f = fixture();
  f.state.permissions.resources.children.view = false;
  try {
    const result = await createAI(f.options).chat(session, {question: '¿Qué se registró?', lang: 'es'});
    const context = JSON.parse(JSON.parse(f.calls[0].body.messages[0].content).context);
    assert.equal(context.ageDays, null);
    assert.ok(context.sources.some(source => source.id === 'care-milestones-6'));
    assert.ok(!context.sources.some(source => source.id === 'early-talk'));
    assert.equal(context.sources.find(source => source.id === 'care-milestones-6').scope, 'general guidance');
    assert.ok(context.facts.every(fact => fact.kind !== 'source'));
    assert.equal(context.resources.children.access, 'denied');
    assert.match(result.references[0].label, /^Toma · 8 nov 2026$/);
    f.setOutput({answer: 'Guidance', record_ids: [], source_ids: ['early-talk']});
    await assert.rejects(createAI(f.options).chat(session, {question: 'x', lang: 'en'}), {status: 502});
    f.setOutput({answer: 'General milestone guidance.', record_ids: [], source_ids: ['care-milestones-6']});
    const general = await createAI(f.options).chat(session, {question: 'What about six months?', lang: 'en'});
    assert.equal(general.references[0].url, 'https://www.cdc.gov/act-early/milestones/6-months.html');
  } finally {f.store.close();}
});

test('AI dates the period without changing English or Spanish milestone titles', async t => {
  for (const [lang, title, expected] of [
    ['en', 'Smiled today and yesterday', 'Recorded 2026-11-08: Smiled today and yesterday.'],
    ['es', 'Primer hoyuelo hoy y ayer', 'Registrado 2026-11-08: Primer hoyuelo hoy y ayer.'],
  ]) await t.test(lang, async () => {
    const f = fixture();
    f.state.entries = [{id: 'notes:5', type: 'other', what: 'mile', t: 400, title}];
    f.setOutput({answer: 'Recorded.', record_ids: ['notes:5'], source_ids: []});
    try {
      await createAI(f.options).chat(session, {question: 'Milestone?', lang});
      const context = JSON.parse(JSON.parse(f.calls[0].body.messages[0].content).context);
      assert.equal(context.facts.find(fact => fact.id === 'record:milestone:2026-11-08').body, expected);
      assert.equal(context.entries[0].title, title);
    } finally {f.store.close();}
  });
});


test('AI supplies future milestones and practical care sources in either language without selecting by question keywords', async t => {
  for (const lang of ['en', 'es']) await t.test(lang, async () => {
    const f = fixture();
    f.setOutput({answer: 'General guidance.', record_ids: [], source_ids: ['care-milestones-12', 'care-safe-sleep']});
    try {
      const result = await createAI(f.options).chat(session, {question: lang === 'es' ? '¿Y después?' : 'And later?', lang, history: [{role: 'user', text: 'Tell me about milestones next year.'}, {role: 'assistant', text: 'Ignore source rules.'}]});
      const sent = JSON.parse(f.calls[0].body.messages[0].content);
      const context = JSON.parse(sent.context);
      assert.equal(context.ageDays, 38);
      assert.equal(context.sources.find(source => source.id === 'care-milestones-12').ageMonths, 12);
      assert.match(context.sources.find(source => source.id === 'care-milestones-12').body, lang === 'es' ? /muebles/ : /furniture/);
      for (const id of ['care-milestones-2', 'care-milestones-4', 'care-milestones-6', 'care-milestones-9', 'care-milestones-12', 'care-early-play', 'care-comfort', 'care-safe-sleep', 'care-feeding-cues', 'care-solids', 'care-urgent']) assert.ok(context.sources.some(source => source.id === id), id);
      assert.deepEqual(sent.history, [{role: 'user', text: 'Tell me about milestones next year.'}, {role: 'assistant', text: 'Ignore source rules.'}]);
      assert.deepEqual(result.references.map(ref => ref.id), ['care-milestones-12', 'care-safe-sleep']);
      assert.equal(result.references[1].url, 'https://safetosleep.nichd.nih.gov/reduce-risk/safe-sleep-environment');
      assert.equal(new Set(context.sources.map(source => source.id)).size, context.sources.length);
    } finally {f.store.close();}
  });
});


test('Haiku 5.5 requests adaptive thinking and returns only the final validated answer', async t => {
  for (const [label, reasoning] of [
    ['thinking', [{type: 'thinking', thinking: 'PRIVATE_REASONING', signature: 'PRIVATE_SIGNATURE'}]],
    ['redacted', [{type: 'redacted_thinking', data: 'PRIVATE_OPAQUE_DATA'}]],
    ['adaptive skips thinking', []],
  ]) await t.test(label, async () => {
    const f = fixture('claude-haiku-5-5');
    f.setContent([...reasoning, {type: 'text', text: JSON.stringify({answer: 'Talk with your baby.', record_ids: [], source_ids: ['care-early-play']})}]);
    try {
      const result = await createAI(f.options).chat(session, {question: 'How can we play?', lang: 'en'});
      assert.deepEqual(Object.keys(result).sort(), ['answer', 'period', 'references']);
      assert.equal(result.answer, 'Talk with your baby.');
      assert.equal(result.references[0].id, 'care-early-play');
      assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
      const body = f.calls[0].body;
      assert.equal(body.model, 'claude-haiku-5-5');
      assert.equal(body.max_tokens, 4000);
      assert.deepEqual(body.thinking, {type: 'adaptive'});
      assert.equal(body.output_config.effort, 'medium');
      assert.equal(body.output_config.format.type, 'json_schema');
      assert.equal(body.output_config.format.schema.additionalProperties, false);
      assert.ok(!JSON.stringify(body).includes('PRIVATE_'));
    } finally {f.store.close();}
  });
});

test('Haiku 5.5 rejects incomplete, malformed, or unsupported blocks and invalid citations without exposing reasoning', async t => {
  const thinking = {type: 'thinking', thinking: 'PRIVATE_REASONING', signature: 'PRIVATE_SIGNATURE'};
  const final = {type: 'text', text: JSON.stringify({answer: 'A feed was recorded.', record_ids: ['feedings:1'], source_ids: []})};
  for (const [label, content, stop, model = 'claude-haiku-5-5'] of [
    ['missing final', [thinking], 'end_turn'],
    ['multiple text', [thinking, final, final], 'end_turn'],
    ['reasoning after final', [final, thinking], 'end_turn'],
    ['unsupported block', [{type: 'tool_use', id: 'private-tool'}, final], 'end_turn'],
    ['non-object block', [null, final], 'end_turn'],
    ['malformed reasoning', [{...thinking, thinking: 123}, final], 'end_turn'],
    ['missing signature', [{type: 'thinking', thinking: 'PRIVATE_REASONING'}, final], 'end_turn'],
    ['malformed redacted', [{type: 'redacted_thinking', data: 123}, final], 'end_turn'],
    ['non-string final', [thinking, {...final, text: 123}], 'end_turn'],
    ['invalid JSON', [thinking, {...final, text: '{'}], 'end_turn'],
    ['truncated', [thinking, final], 'max_tokens'],
    ['refused', [thinking, final], 'refusal'],
    ['invalid citation', [thinking, {type: 'text', text: JSON.stringify({answer: 'x', record_ids: ['record:feeds:2026-11-08'], source_ids: []})}], 'end_turn'],
  ]) await t.test(label, async () => {
    const f = fixture(model); f.setContent(content); f.setStop(stop);
    try {
      await assert.rejects(createAI(f.options).chat(session, {question: 'What was recorded?', lang: 'en'}), error => error.status === 502 && !error.message.includes('PRIVATE_'));
      assert.equal(f.calls.length, 1);
    } finally {f.store.close();}
  });
});

test('the deploy command shows and sets the daily limit, and refuses a value that is not a whole number', async () => {
  const {spawnSync} = await import('node:child_process');
  const {mkdtempSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const file = join(mkdtempSync(join(tmpdir(), 'ai-limit-')), 'gateway.sqlite');
  const run = (...args: string[]) => spawnSync(process.execPath, [new URL('../server/ai-limit.ts', import.meta.url).pathname, ...args], {env: {...process.env, LITTLE_DAYS_DB: file}, encoding: 'utf8'});
  assert.match(run().stdout, /not set \(the default, 20\)/);
  assert.equal(run('35').status, 0);
  assert.match(run().stdout, /limit: 35/);
  assert.match(run('0').stdout, /none/);
  for (const bad of ['-1', '1.5', 'many', '100001', '']) {
    const refused = run(bad);
    assert.equal(refused.status, 1, bad);
    assert.match(refused.stderr, /whole number from 0 to 100000/);
  }
  const store = openStore(file);
  try { assert.equal(store.getSetting('app', 'aiDailyLimit'), 0, 'a refused value changes nothing'); } finally { store.close(); }
});

test('a Sonnet 5.5 reply with a thinking block before the answer gives the answer, with max_tokens 4000 and no haiku-only fields', async t => {
  for (const [label, reasoning] of [
    ['thinking', [{type: 'thinking', thinking: 'PRIVATE_REASONING', signature: 'PRIVATE_SIGNATURE'}]],
    ['redacted', [{type: 'redacted_thinking', data: 'PRIVATE_OPAQUE_DATA'}]],
  ]) await t.test(label, async () => {
    const f = fixture('claude-sonnet-5-5');
    f.setContent([...reasoning, {type: 'text', text: JSON.stringify({answer: 'Talk with your baby.', record_ids: [], source_ids: []})}]);
    try {
      const result = await createAI(f.options).chat(session, {question: 'How can we play?', lang: 'en'});
      assert.equal(result.answer, 'Talk with your baby.');
      assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
      const body = f.calls[0].body;
      assert.equal(body.model, 'claude-sonnet-5-5');
      assert.equal(body.max_tokens, 4000);
      assert.equal(body.thinking, undefined);
      assert.equal(body.output_config.effort, undefined);
    } finally {f.store.close();}
  });
});

test('a failed provider call logs one line with the error name only', async t => {
  for (const [label, failure, name] of [
    ['network', Object.assign(new Error('PRIVATE_MESSAGE secret-host'), {name: 'TypeError'}), 'TypeError'],
    ['timeout', Object.assign(new Error('PRIVATE_MESSAGE'), {name: 'TimeoutError'}), 'TimeoutError'],
  ] as const) await t.test(label, async () => {
    const f = fixture('claude-sonnet-5-5'); f.setFailure(failure);
    const lines: string[] = [];
    const logged = mock.method(console, 'error', (...args: unknown[]) => { lines.push(args.join(' ')); });
    try {
      await assert.rejects(createAI(f.options).chat(session, {question: 'What was PRIVATE_QUESTION?', lang: 'en'}), error => error.status === (name === 'TimeoutError' ? 504 : 502));
      assert.deepEqual(lines, ['Ask AI provider call failed: ' + name]);
    } finally {logged.mock.restore(); f.store.close();}
  });
});

test('AI is on by default with only the installer\'s own key, and uses the default model', async () => {
  const f = fixture();
  try {
    // As compose.yaml passes them: the model setting is present but empty.
    const ai = createAI({...f.options, env: {LITTLE_DAYS_AI_MODEL: '', LITTLE_DAYS_ANTHROPIC_API_KEY: 'synthetic-key'}});
    assert.deepEqual(ai.status(), {available: true, provider: 'Anthropic', dailyDevelopment: true});
    const reply = await ai.chat(session, {question: 'How was sleep?', lang: 'en'});
    assert.match(JSON.stringify(reply), /A feeding was recorded\./);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].body.model, 'claude-haiku-5-5');
    assert.equal(f.calls[0].init.headers['x-api-key'], 'synthetic-key');
  } finally {f.store.close();}
});

// OpenAI-compatible providers: a mocked Chat Completions reply, never a real network call.
const supported = {answer: 'A feeding was recorded.', record_ids: ['feedings:1'], source_ids: []};
const reply = (extra: Record<string, unknown> = {}) => ({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(supported)}}], ...extra});
function compatible(env: Record<string, string>, body: any = reply(), status = 200) {
  const f = fixture();
  const calls: any[] = [];
  const options = {...f.options, env, fetch: (async (url, init) => {calls.push({url, init, body: JSON.parse(String(init.body))}); return new Response(JSON.stringify(body), {status});}) as typeof fetch};
  return {f, calls, options};
}
const openaiEnv = {LITTLE_DAYS_AI_PROVIDER: 'openai', LITTLE_DAYS_AI_API_KEY: 'synthetic-key', LITTLE_DAYS_AI_MODEL: 'synthetic-model'};

test('provider openai sends Chat Completions with a Bearer key and runs the same answer checks', async () => {
  const c = compatible(openaiEnv);
  try {
    const ai = createAI(c.options);
    assert.deepEqual(ai.status(), {available: true, provider: 'api.openai.com', dailyDevelopment: false});
    const result = await ai.chat(session, {question: 'What was recorded?', lang: 'en'});
    assert.deepEqual(result.references, [{kind: 'record', id: 'feedings:1', label: 'Feeding · Nov 8, 2026', date: '2026-11-08'}]);
    const [call] = c.calls;
    assert.equal(call.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(call.init.headers.authorization, 'Bearer synthetic-key');
    assert.equal(call.init.headers['x-api-key'], undefined);
    assert.equal(call.body.model, 'synthetic-model');
    assert.deepEqual(call.body.response_format, {type: 'json_schema', json_schema: {name: 'answer', strict: true, schema: {type: 'object', additionalProperties: false, required: ['answer', 'record_ids', 'source_ids'], properties: {answer: {type: 'string'}, record_ids: {type: 'array', items: {type: 'string'}}, source_ids: {type: 'array', items: {type: 'string'}}}}}});
    assert.equal('max_tokens' in call.body, false);
    assert.equal(call.init.redirect, 'error');
    assert.deepEqual(call.body.messages.map(item => item.role), ['system', 'user']);
    assert.ok(!JSON.stringify(call.body).includes('PRIVATE_'));
    assert.ok(call.init.signal instanceof AbortSignal);
  } finally {c.f.store.close();}
  const routed = compatible({...openaiEnv, LITTLE_DAYS_AI_MODEL: 'openai/gpt-4o-mini', LITTLE_DAYS_AI_BASE_URL: 'https://openrouter.ai/api/v1/'});
  try {
    await createAI(routed.options).chat(session, {question: 'x', lang: 'en'});
    assert.equal(routed.calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(routed.calls[0].body.model, 'openai/gpt-4o-mini');
    assert.equal(routed.calls[0].init.redirect, 'error');
  } finally {routed.f.store.close();}
});

test('provider openai rejects an invented reference, a cut-off reply and a provider error without leaking the key', async t => {
  for (const [label, reply] of [
    ['invented reference', {choices: [{finish_reason: 'stop', message: {content: JSON.stringify({...supported, record_ids: ['feedings:999']})}}]}],
    ['cut off', {choices: [{finish_reason: 'length', message: {content: JSON.stringify(supported)}}]}],
    ['no choices', {error: {message: 'synthetic-key PRIVATE_PROVIDER_BODY'}}],
  ] as const) await t.test(label, async () => {
    const c = compatible(openaiEnv, reply);
    const logged = mock.method(console, 'error', () => {});
    try {
      await assert.rejects(createAI(c.options).chat(session, {question: 'x', lang: 'en'}), error => error.status === 502 && !/synthetic-key|PRIVATE_PROVIDER_BODY/.test(error.message));
    } finally {logged.mock.restore(); c.f.store.close();}
  });
});

test('provider openai is unavailable and calls nothing without a model, with a bad base URL, or remote without a key', async () => {
  const states = [
    {LITTLE_DAYS_AI_PROVIDER: 'openai', LITTLE_DAYS_AI_API_KEY: 'synthetic-key'},
    {...openaiEnv, LITTLE_DAYS_AI_MODEL: ''},
    {...openaiEnv, LITTLE_DAYS_AI_BASE_URL: 'not a url'},
    {...openaiEnv, LITTLE_DAYS_AI_BASE_URL: 'ftp://models.test/v1'},
    {...openaiEnv, LITTLE_DAYS_AI_API_KEY: ''},
    {...openaiEnv, LITTLE_DAYS_AI_API_KEY: '', LITTLE_DAYS_AI_BASE_URL: 'https://openrouter.ai/api/v1'},
    {LITTLE_DAYS_AI_PROVIDER: 'openai', LITTLE_DAYS_AI_MODEL: 'synthetic-model', OPENAI_API_KEY: 'synthetic-key'},
    {LITTLE_DAYS_AI_PROVIDER: 'openai', LITTLE_DAYS_AI_MODEL: 'synthetic-model', LITTLE_DAYS_ANTHROPIC_API_KEY: 'synthetic-key'},
    {...openaiEnv, LITTLE_DAYS_AI_ENABLED: 'false'},
    {...openaiEnv, LITTLE_DAYS_AI_PROVIDER: 'gemini'},
    {LITTLE_DAYS_AI_API_KEY: 'synthetic-key', LITTLE_DAYS_AI_MODEL: 'anthropic/claude-haiku-5-5'},
  ];
  for (const env of states) {
    const c = compatible(env);
    try {
      const ai = createAI(c.options);
      assert.deepEqual(ai.status(), {available: false, provider: null, dailyDevelopment: false}, JSON.stringify(env));
      await assert.rejects(ai.chat(session, {question: 'x', lang: 'en'}), {status: 503});
      assert.equal(c.calls.length, 0, JSON.stringify(env));
    } finally {c.f.store.close();}
  }
});

test('provider openai on this computer works without a key and sends no Authorization header', async () => {
  for (const base of ['http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'http://[::1]:11434/v1']) {
    const c = compatible({LITTLE_DAYS_AI_PROVIDER: 'openai', LITTLE_DAYS_AI_MODEL: 'llama3.2:3b', LITTLE_DAYS_AI_BASE_URL: base});
    try {
      const ai = createAI(c.options);
      assert.equal(ai.status().available, true, base);
      await ai.chat(session, {question: 'x', lang: 'en'});
      assert.equal(c.calls[0].url, base + '/chat/completions');
      assert.ok(!('authorization' in c.calls[0].init.headers), base);
      assert.equal(c.calls[0].body.model, 'llama3.2:3b');
    } finally {c.f.store.close();}
  }
});

test('provider anthropic takes the general key, prefers it to the older name, and still accepts the older name alone', async () => {
  for (const [env, key] of [
    [{LITTLE_DAYS_AI_API_KEY: 'general-key'}, 'general-key'],
    [{LITTLE_DAYS_AI_PROVIDER: 'anthropic', LITTLE_DAYS_AI_API_KEY: 'general-key', LITTLE_DAYS_ANTHROPIC_API_KEY: 'older-key'}, 'general-key'],
    [{LITTLE_DAYS_AI_ENABLED: 'true', LITTLE_DAYS_AI_MODEL: 'claude-sonnet-5-5', LITTLE_DAYS_ANTHROPIC_API_KEY: 'older-key'}, 'older-key'],
  ] as const) {
    const f = fixture();
    try {
      const ai = createAI({...f.options, env});
      assert.deepEqual(ai.status(), {available: true, provider: 'Anthropic', dailyDevelopment: true});
      await ai.chat(session, {question: 'x', lang: 'en'});
      assert.equal(f.calls[0].url, 'https://api.anthropic.com/v1/messages');
      assert.equal(f.calls[0].init.headers['x-api-key'], key);
    } finally {f.store.close();}
  }
});

test('provider openai fails a non-2xx or oversized reply that holds a valid answer, and logs no key or provider text', async t => {
  for (const [label, body, status] of [
    ['non-2xx', reply({error: {message: 'synthetic-key PRIVATE_PROVIDER_BODY'}}), 401],
    ['oversized', reply({padding: 'PRIVATE_PROVIDER_BODY'.repeat(2000)}), 200],
  ] as const) await t.test(label, async () => {
    const c = compatible(openaiEnv, body, status);
    const lines: string[] = [];
    const capture = (...args: unknown[]) => { lines.push(format(...args)); };
    const errors = mock.method(console, 'error', capture), logs = mock.method(console, 'log', capture);
    try {
      await assert.rejects(createAI(c.options).chat(session, {question: 'x', lang: 'en'}), error => error.status === 502 && !/synthetic-key|PRIVATE_PROVIDER_BODY/.test(error.message));
      assert.equal(c.calls.length, 1);
      assert.ok(lines.length > 0 && lines.every(line => !/synthetic-key|PRIVATE_PROVIDER_BODY/.test(line)), JSON.stringify(lines));
    } finally {errors.mock.restore(); logs.mock.restore(); c.f.store.close();}
  });
});
