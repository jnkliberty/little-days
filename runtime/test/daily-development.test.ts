import test from 'node:test';
import assert from 'node:assert/strict';
import {createAI} from '../server/ai.ts';
import {createRouter} from '../server/router.ts';
import {createApp} from '../server/app.ts';
import {openStore} from '../server/store.ts';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const session = {sessionId:'a'.repeat(43),csrfToken:'csrf',adult:'PRIVATE_ADULT'};
const env = {LITTLE_DAYS_AI_ENABLED:'true',LITTLE_DAYS_AI_MODEL:'synthetic-model',LITTLE_DAYS_ANTHROPIC_API_KEY:'synthetic-key'};

const claims = [
  ['nearby-faces','Newborns see nearby faces most clearly.','Los recién nacidos ven mejor los rostros cercanos.'],
  ['hearing-voices','A familiar voice can attract a young baby’s attention.','Una voz conocida puede llamar la atención de un bebé pequeño.'],
  ['smell-recognition','Babies can recognize familiar smells early in life.','Los bebés pueden reconocer olores conocidos al inicio de la vida.'],
  ['touch-comfort','Gentle touch can help a baby feel secure.','El contacto suave puede ayudar a un bebé a sentirse seguro.'],
  ['sound-turns','Answering a baby’s sounds supports early communication.','Responder a los sonidos de un bebé apoya la comunicación temprana.'],
  ['play-breaks','Turning away during play can signal a need for a break.','Apartar la mirada durante el juego puede indicar que necesita una pausa.'],
];
const passage = claims.map(claim=>claim[1]).join(' ');
const sourceUrl = 'https://www.healthychildren.org/English/ages-stages/baby/Pages/default.aspx';
const output = (offset=0) => ({cards:claims.slice(offset,offset+3).map(([topic,en,es])=>({topic,title:[topic,'Título '+topic],body:[en,es],source_id:'web-0',quote:en}))});
function fixture(store=openStore(':memory:')) {
  let current=new Date('2026-11-09T05:59:00Z'),result=output(),search:any,fail=false,prefix:any[]=[];
  const state = {child:{id:1,birthDate:'2026-10-01',name:'PRIVATE_CHILD'},permissions:{resources:{children:{view:true}}},entries:[{id:'notes:1',text:'PRIVATE_LOG'}]};
  const calls:any[]=[];
  const options={store,env,now:()=>current,records:{state:async()=>state} as any,fetch:async(_url,init)=>{
    const body=JSON.parse(String(init.body));calls.push(body);
    if(fail)throw new Error('provider');
    const content=body.tools?(search || [
      {type:'web_search_tool_result',content:[{type:'web_search_result',url:sourceUrl,title:'HealthyChildren development',encrypted_content:'opaque'}]},
      {type:'text',text:'Research with citations',citations:[{type:'web_search_result_location',url:sourceUrl,title:'HealthyChildren development',cited_text:passage}]},
    ]):[...prefix,{type:'text',text:JSON.stringify(body.output_config?.format?.schema?.properties?.answer?{answer:'A general development answer.',record_ids:[],source_ids:[]}:result)}];
    return new Response(JSON.stringify({stop_reason:'end_turn',content}));
  }};
  return {store,state,calls,options,setDate:value=>{current=new Date(value);},setOutput:value=>{result=value;},setSearch:value=>{search=value;},setFail:()=>{fail=true;},setPrefix:value=>{prefix=value;}};
}

test('daily generation sends a supported schema and accepts only well-formed reasoning before its final answer', async t => {
  for(const [name,prefix,expected] of [
    ['thinking',[{type:'thinking',thinking:'private reasoning',signature:'signed'}],'ready'],
    ['redacted',[{type:'redacted_thinking',data:'opaque'}],'ready'],
    ['malformed thinking',[{type:'thinking',thinking:'private reasoning'}],'unavailable'],
    ['extra text',[{type:'text',text:'unvalidated answer'}],'unavailable'],
  ] as [string,any[],string][])await t.test(name,async()=>{
    const f=fixture();f.setPrefix(prefix);
    try {
      const result=await createAI({...f.options,env:{...env,LITTLE_DAYS_AI_MODEL:'claude-haiku-5-5'}}).dailyDevelopment(session);
      assert.equal(result.status,expected);
      const schema=JSON.stringify(f.calls[1].output_config.format.schema);
      assert.ok(!schema.includes('maxItems'));
      assert.ok(!schema.includes('minItems'));
      assert.ok(!JSON.stringify(result).includes('private reasoning'));
    } finally{f.store.close();}
  });
});

test('fresh bilingual batch is shared across users, survives restart, and changes at Mexico City midnight', async () => {
  const directory=mkdtempSync(join(tmpdir(),'little-days-development-'));
  const path=join(directory,'app.sqlite');
  const f=fixture(openStore(path));
  let restarted;
  try {
    const ai=createAI(f.options);
    const [first,second]=await Promise.all([ai.dailyDevelopment(session),ai.dailyDevelopment({...session,adult:'PRIVATE_OTHER'})]);
    assert.equal(first.status,'ready');assert.equal(first.date,'2026-11-08');assert.equal(first.cards.length,3);
    assert.deepEqual(first,second);assert.equal(f.calls.length,2,'concurrent users share one search and one generation');
    assert.deepEqual(first.cards[0].body,['Newborns see nearby faces most clearly.','Los recién nacidos ven mejor los rostros cercanos.']);
    assert.equal(first.cards[0].url,sourceUrl);
    const sent=JSON.stringify(f.calls);
    for(const privateValue of ['PRIVATE_','2026-10-01','notes:1'])assert.ok(!sent.includes(privateValue),privateValue);
    assert.equal(JSON.parse(f.calls[0].messages[0].content).ageDays,38);
    assert.deepEqual(f.calls[0].tools[0].allowed_domains,['cdc.gov','healthychildren.org','nih.gov','nhs.uk']);
    f.store.close();restarted=openStore(path);
    const afterRestart=createAI({...f.options,store:restarted});
    assert.deepEqual(await afterRestart.dailyDevelopment(session),first);
    assert.equal(f.calls.length,2);
    f.setDate('2026-11-09T06:00:00Z');f.setOutput(output(3));
    const next=await afterRestart.dailyDevelopment(session);
    assert.equal(next.date,'2026-11-09');assert.equal(next.status,'ready');assert.notDeepEqual(next.cards,first.cards);
    assert.equal(f.calls.length,4);
    assert.equal(JSON.parse(f.calls[2].messages[0].content).recentClaims.length,3);
  } finally {if(restarted)restarted.close();else try{f.store.close();}catch{}rmSync(directory,{recursive:true,force:true});}
});

test('child access and valid age gate cache reads and generation; different child gets a new batch', async () => {
  const f=fixture();
  try {
    const ai=createAI(f.options);
    await ai.dailyDevelopment(session);
    f.state.permissions.resources.children.view=false;
    await assert.rejects(ai.dailyDevelopment(session),{status:403});assert.equal(f.calls.length,2);
    f.state.permissions.resources.children.view=true;
    for(const birthDate of ['2026-02-30','2027-01-01','invalid']){f.state.child.birthDate=birthDate;assert.equal((await ai.dailyDevelopment(session)).status,'unavailable');}
    assert.equal(f.calls.length,2);
    f.state.child.birthDate='2026-10-01';f.state.child.id=2;
    assert.equal((await ai.dailyDevelopment(session)).status,'ready');assert.equal(f.calls.length,4);
  } finally {f.store.close();}
});

test('Ask AI receives the displayed daily fact and its retrieved passage in either language', async () => {
  const f=fixture();
  f.state.entries=[];
  try {
    const ai=createAI(f.options);await ai.dailyDevelopment(session);
    for(const lang of ['en','es']){
      await ai.chat(session,{question:'Tell me more',lang,factId:'source:daily-2026-11-08-1'});
      const context=JSON.parse(JSON.parse(f.calls.at(-1).messages[0].content).context);
      assert.equal(context.selectedFact.body,claims[0][lang==='es'?2:1]);
      assert.equal(context.sources.find(source=>source.id==='daily-2026-11-08-1').body,claims[0][1]);
      assert.equal(context.facts.filter(fact=>fact.kind==='source').length,3);
    }
    f.state.permissions.resources.children.view=false;
    await ai.chat(session,{question:'Tell me more',lang:'en',factId:'source:daily-2026-11-08-1'});
    const context=JSON.parse(JSON.parse(f.calls.at(-1).messages[0].content).context);
    assert.equal(context.selectedFact,null);
    assert.ok(!context.sources.some(source=>source.id.startsWith('daily-')));
  } finally{f.store.close();}
});

test('fetched articles supply bounded generation context while persisted cards keep only their supporting quote', async () => {
  const f=fixture();
  f.setSearch([{type:'web_fetch_tool_result',content:{type:'web_fetch_result',url:sourceUrl,retrieved_at:'2026-11-08T12:00:00Z',content:{type:'document',title:'HealthyChildren development',source:{type:'text',media_type:'text/plain',data:passage+' More source context.'.repeat(10000)}}}}]);
  try {
    const result=await createAI(f.options).dailyDevelopment(session);
    assert.equal(result.status,'ready');
    assert.deepEqual(f.calls[0].tools[1],{type:'web_fetch_20250910',name:'web_fetch',max_uses:3,max_content_tokens:20000,allowed_domains:['cdc.gov','healthychildren.org','nih.gov','nhs.uk'],citations:{enabled:true}});
    assert.ok(f.calls[1].messages[0].content.length<=60000);
    assert.equal(result.cards[0].passage,claims[0][1]);
  } finally{f.store.close();}
});

test('source bounds retain the article after a long site navigation section', async () => {
  const f=fixture();
  const navigation='| [Breastfeeding](https://www.healthychildren.org/menu) | Crying & Colic |\n'.repeat(600);
  f.setSearch([{type:'web_fetch_tool_result',content:{type:'web_fetch_result',url:sourceUrl,content:{type:'document',title:'Development - HealthyChildren.org',source:{type:'text',media_type:'text/plain',data:'title: Development\n# Ages & Stages\n'+navigation+'# Development\n'+passage}}}}]);
  try {
    const result=await createAI(f.options).dailyDevelopment(session);
    assert.equal(result.status,'ready');
    const sources=JSON.parse(f.calls[1].messages[0].content).sources;
    assert.ok(sources[0].passage.startsWith('# Development\n'));
    assert.ok(sources[0].passage.includes(claims[2][1]));
    assert.ok(!sources[0].passage.includes('Crying & Colic'));
  } finally{f.store.close();}
});

test('unsupported source citations and malformed batches never become daily cards', async t => {
  const badSources = [
    [{type:'text',citations:[{type:'web_search_result_location',url:sourceUrl,title:'AAP',cited_text:passage}]}],
    [{type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://healthychildren.org.evil.test/page'}]},{type:'text',citations:[{type:'web_search_result_location',url:'https://healthychildren.org.evil.test/page',title:'AAP',cited_text:passage}]}],
    [{type:'web_fetch_tool_result',content:{type:'web_fetch_result',url:'https://healthychildren.org.evil.test/page',content:{type:'document',title:'AAP',source:{type:'text',data:passage}}}}],
    [{type:'web_fetch_tool_result',content:{type:'web_fetch_result',url:sourceUrl,content:{type:'document',title:'AAP',source:{type:'base64',data:passage}}}}],
  ];
  for(const [index,source] of badSources.entries())await t.test('unverified citation '+index,async()=>{
    const f=fixture();f.setSearch(source);
    try{assert.equal((await createAI(f.options).dailyDevelopment(session)).status,'unavailable');assert.equal(f.calls.length,1);}finally{f.store.close();}
  });
  for(const [name,change] of [
    ['wrong count',value=>value.cards.pop()],
    ['invented source',value=>{value.cards[0].source_id='made-up';}],
    ['unsupported quote',value=>{value.cards[0].quote='This claim never appeared in the retrieved passage.';}],
    ['missing translation',value=>{value.cards[0].body=['English only'];}],
    ['invented URL',value=>{value.cards[0].body[0]='See https://evil.test';}],
    ['duplicate claim',value=>{value.cards[1].body=value.cards[0].body;}],
    ['duplicate topic',value=>{value.cards[1].topic=value.cards[0].topic;}],
    ['unexpected field',value=>{value.cards[0].url=sourceUrl;}],
  ] as [string,(value:any)=>void][])await t.test(name,async()=>{
    const f=fixture(),value=output();change(value);f.setOutput(value);
    try{const result=await createAI(f.options).dailyDevelopment(session);assert.equal(result.status,'unavailable');assert.deepEqual(result.cards,[]);}finally{f.store.close();}
  });
});

test('a repeated next-day claim or a provider failure cannot label yesterday’s batch fresh', async () => {
  const f=fixture();
  try {
    const ai=createAI(f.options);await ai.dailyDevelopment(session);
    f.setDate('2026-11-09T06:00:00Z');
    assert.deepEqual(await ai.dailyDevelopment(session),{date:'2026-11-09',status:'unavailable',cards:[]});
    assert.equal(f.calls.length,4);
    await ai.dailyDevelopment(session);assert.equal(f.calls.length,4);
    f.setDate('2026-11-09T06:16:00Z');f.setOutput(output(3));
    assert.equal((await ai.dailyDevelopment(session)).status,'ready');assert.equal(f.calls.length,6);
    f.setDate('2026-11-10T06:00:00Z');f.setFail();
    assert.deepEqual(await ai.dailyDevelopment(session),{date:'2026-11-10',status:'unavailable',cards:[]});
  } finally{f.store.close();}
});

test('requests across midnight preserve both saved days, including a late failure', async t => {
  for(const fails of [false,true])await t.test(fails?'late failure':'reverse success',async()=>{
    const f=fixture(),held:any[]=[];
    const ai=createAI({...f.options,fetch:async(url,init)=>{
      const body=JSON.parse(String(init.body));
      if(body.tools)return f.options.fetch(url,init);
      return new Promise<Response>((resolve,reject)=>held.push({resolve:()=>resolve(new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(output())}]}))),reject}));
    }});
    const waitFor = async count=>{while(held.length<count)await new Promise(resolve=>setImmediate(resolve));};
    try {
      const before=ai.dailyDevelopment(session);await waitFor(1);
      f.setDate('2026-11-09T06:00:00Z');
      const after=ai.dailyDevelopment(session);await waitFor(2);
      held[1].resolve();assert.equal((await after).status,'ready');
      if(fails)held[0].reject(new Error('provider'));else held[0].resolve();
      const old=await before;
      assert.equal(old.date,'2026-11-08');assert.equal(old.status,fails?'unavailable':'ready');
      if(fails)assert.deepEqual(old.cards,[]);
      const todayPromise=ai.dailyDevelopment(session);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(held.length,2,'today stays cached after yesterday finishes');
      const today=await todayPromise;
      assert.equal(today.date,'2026-11-09');assert.equal(today.status,'ready');
      assert.equal(held.length,2,'today stays cached after yesterday finishes');
      if(!fails){f.setDate('2026-11-09T05:59:00Z');const yesterday=ai.dailyDevelopment(session);await new Promise(resolve=>setImmediate(resolve));assert.equal(held.length,2);assert.equal((await yesterday).status,'ready');}
    } finally{f.store.close();}
  });
});

test('a prior-day success preserves today’s failed-request cooldown', async () => {
  const f=fixture(),held:any[]=[];
  const ai=createAI({...f.options,fetch:async(url,init)=>{
    const body=JSON.parse(String(init.body));
    if(body.tools)return f.options.fetch(url,init);
    return new Promise<Response>((resolve,reject)=>held.push({resolve:()=>resolve(new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(output())}]}))),reject}));
  }});
  const waitFor=async count=>{while(held.length<count)await new Promise(resolve=>setImmediate(resolve));};
  try {
    const yesterday=ai.dailyDevelopment(session);await waitFor(1);
    f.setDate('2026-11-09T06:00:00Z');
    const today=ai.dailyDevelopment(session);await waitFor(2);
    held[1].reject(new Error('provider'));assert.equal((await today).status,'unavailable');
    held[0].resolve();assert.equal((await yesterday).status,'ready');
    const calls=f.calls.length;
    const retry=ai.dailyDevelopment({...session,adult:'OTHER_ADULT'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.length,calls,'another adult must not start paid research during the cooldown');
    assert.equal((await retry).status,'unavailable');
  } finally {f.store.close();}
});

test('thirty days of maximum-length history leaves room for the next day’s sources', async () => {
  const f=fixture();
  const put=f.store.putSetting;let key='';
  f.store.putSetting=(scope,name,value)=>{key=name;put(scope,name,value);};
  try {
    const ai=createAI(f.options),first=await ai.dailyDevelopment(session);
    const batches=Array.from({length:30},(_,index)=>({date:new Date(Date.UTC(2026,9,9+index)).toISOString().slice(0,10),cards:first.cards.map((card,offset)=>({...card,topic:[('historical-'+index+'-'+offset+'-').padEnd(100,'x'),'Histórico'],body:[('Past claim '+index+' '+offset+' ').padEnd(650,'y'),'Dato anterior']}))}));
    put('app',key,{batches});
    f.setDate('2026-11-09T06:00:00Z');f.setOutput(output(3));
    const next=await ai.dailyDevelopment(session);
    assert.equal(next.status,'ready');
    const discovery=JSON.parse(f.calls.at(-2).messages[0].content);
    assert.ok(JSON.stringify(discovery.recentClaims).length<=24000);
    assert.ok(discovery.recentClaims.length>0);
    assert.equal(discovery.recentClaims.at(-1).topic,batches.at(-1)!.cards.at(-1)!.topic[0]);
    assert.ok(f.calls.at(-1).messages[0].content.length<=60000);
  } finally{f.store.close();}
});

test('daily development route is protected and failure cannot remove the care state', async () => {
  const store = openStore(':memory:');
  const state = {child:{id:1,birthDate:'2026-10-01',name:'PRIVATE_CHILD'},permissions:{resources:{children:{view:true}}},entries:[]};
  let calls = 0;
  const ai = createAI({store,env,records:{state:async()=>state} as any,fetch:async()=>{calls++;throw new Error('PRIVATE_FAILURE');}});
  const router = createRouter({store,ai,household:{state:async()=>state},timers:{active:async()=>({})}} as any);
  const sessions = {passcodeSet:()=>true,get:id=>id===session.sessionId?session:null,renew:()=>{},requireCsrf:(_id,csrf)=>{if(csrf!=='csrf')throw new Error();}} as any;
  const server = createApp({sessions,origin:'https://little-days.test',webDir:'.',domain:router.handle,integration:async()=>{}});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+(server.address() as any).port;
  const headers = {cookie:'__Host-little-days='+session.sessionId,origin:'https://little-days.test','x-csrf-token':'csrf','content-type':'application/json'};
  const post = overrides=>fetch(base+'/api/development',{method:'POST',headers:{...headers,...overrides},body:'{}'});
  try {
    assert.equal((await post({cookie:''})).status,401);
    assert.equal((await post({origin:'https://other.test'})).status,403);
    assert.equal((await post({'x-csrf-token':'wrong'})).status,403);
    const response = await post({});
    assert.equal(response.status,200);
    const result = await response.json();
    assert.equal(result.status,'unavailable');
    assert.deepEqual(result.cards,[]);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    await post({});
    assert.equal(calls,1,'failed generation must not cause a paid call on each refresh');
    assert.deepEqual((await (await fetch(base+'/api/state',{headers})).json()).entries,[]);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
});

test('a failed generation writes one log line with the error message and no private text', async () => {
  const f=fixture();f.setFail();
  const lines:string[]=[],original=process.stderr.write;
  process.stderr.write=((chunk:string|Uint8Array)=>{lines.push(String(chunk));return true;}) as typeof process.stderr.write;
  try {
    const result=await createAI(f.options).dailyDevelopment(session);
    process.stderr.write=original;
    assert.equal(result.status,'unavailable');
    assert.equal(lines.length,1);
    assert.equal(lines[0],'daily development failed: provider\n');
    assert.ok(!lines.join('').includes('PRIVATE'));
  } finally{process.stderr.write=original;f.store.close();}
});

// Public edition default: AI is on only with the installer's own key.
test('daily development calls no provider without the installer\'s key, and uses the default model with only a key', async () => {
  const none=fixture();
  try {
    const result=await createAI({...none.options,env:{ANTHROPIC_API_KEY:'synthetic-key',LITTLE_DAYS_AI_MODEL:''}}).dailyDevelopment(session);
    assert.deepEqual(result.cards,[]);
    assert.equal(none.calls.length,0);
  } finally{none.store.close();}
  const keyed=fixture();
  try {
    await createAI({...keyed.options,env:{LITTLE_DAYS_AI_MODEL:'',LITTLE_DAYS_ANTHROPIC_API_KEY:'synthetic-key'}}).dailyDevelopment(session);
    assert.ok(keyed.calls.length>0);
    assert.deepEqual([...new Set(keyed.calls.map(call=>call.model))],['claude-haiku-5-5']);
  } finally{keyed.store.close();}
});

test('daily development calls no provider with an OpenAI-compatible provider, and Chat still works', async () => {
  const f=fixture();
  try {
    const ai=createAI({...f.options,env:{LITTLE_DAYS_AI_PROVIDER:'openai',LITTLE_DAYS_AI_API_KEY:'synthetic-key',LITTLE_DAYS_AI_MODEL:'synthetic-model'}});
    const result=await ai.dailyDevelopment(session);
    assert.equal(result.status,'unavailable');
    assert.deepEqual(result.cards,[]);
    assert.equal(f.calls.length,0);
    assert.equal(ai.status().available,true);
    assert.equal(ai.status().dailyDevelopment,false);
  } finally{f.store.close();}
});
