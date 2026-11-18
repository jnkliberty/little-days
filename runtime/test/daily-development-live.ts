// Synthetic child; no family records or production writes. Run with --dry-run first.
import assert from 'node:assert/strict';
import {createDevelopment} from '../server/development.ts';
import {openStore} from '../server/store.ts';

if(process.argv.includes('--dry-run')) {
  console.log('DRY RUN: two synthetic days at ages 40 and 41 days; at most four provider requests, six web searches, and six page fetches; memory-only store.');
} else {
  assert.ok(process.env.LITTLE_DAYS_ANTHROPIC_API_KEY, 'LITTLE_DAYS_ANTHROPIC_API_KEY is required');
  const store=openStore(':memory:');
  const state={child:{id:'synthetic',birthDate:'2026-10-01'},permissions:{resources:{children:{view:true}}}};
  let current=new Date('2026-11-10T18:00:00Z'),calls=0;
  const env={...process.env,LITTLE_DAYS_AI_MODEL:'claude-haiku-5-5'};
  const request:typeof fetch=async(input,init)=>{
    calls++;
    const sent=JSON.parse(String(init?.body));
    if(sent.output_config) {
      const context=JSON.parse(sent.messages[0].content);
      console.log(JSON.stringify({sources:context.sources.map(source=>({title:source.title,characters:source.passage.length,beginning:source.passage.slice(0,120),end:source.passage.slice(-160)}))}));
    }
    const start=Date.now(), response=await fetch(input,init);
    const body=await response.clone().json() as any;
    console.log(JSON.stringify({call:calls,status:response.status,seconds:(Date.now()-start)/1000,stop:body.stop_reason,error:body.error,blocks:body.content?.map(block=>block.type),usage:body.usage}));
    return response;
  };
  const service=createDevelopment({store,env,available:true,fetch:request,now:()=>current});
  try {
    for(let day=0;day<2;day++) {
      current=new Date(`2026-11-${10+day}T18:00:00Z`);
      const batch=await service.generate(state);
      console.log(JSON.stringify(batch));
      assert.equal(batch.status,'ready','source search and generation must yield three supported facts');
      assert.equal(batch.cards.length,3);
      const before=calls;
      assert.deepEqual(await service.generate(state),batch);
      assert.equal(calls,before,'same-day read must not make another provider request');
    }
    console.log('PASS: two fresh daily batches and stable same-day cache.');
  } finally {store.close();}
}
