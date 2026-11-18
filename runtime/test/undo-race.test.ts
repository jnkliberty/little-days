import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const section = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('a sleep pause retry keeps the original timer and note after the sheet closes', async () => {
  const calls: unknown[]=[];
  const context: any={S:{sheet:{note:'Woke to feed'},run:null},shownRun:()=>({id:'51',by:'Rowan'}),canStopRun:()=>true,otherAdult:()=>false,
    LittleDaysAPI:{writes:{sleepAction:(...args: unknown[])=>calls.push(args)}},timerRequest:(request: any)=>request};
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../web/parent-feedback.js', import.meta.url), 'utf8'),context);
  const request=context.requestSleepAction('pause');
  context.S.sheet.note='Changed after the request';context.S.sheet=null;
  await request('same-operation');await request('same-operation');
  assert.deepEqual(calls,[['51','pause',false,'same-operation','Woke to feed'],['51','pause',false,'same-operation','Woke to feed']]);
});

test('Pause does not reuse a pending End operation as a malformed request', () => {
  let writes=0;
  const context:any={S:{sheet:{_preparedStop:{kind:'sleep',note:'note'}},pendingSheetOperation:true},shownRun:()=>({id:'51',by:'Rowan'}),canStopRun:()=>true,otherAdult:()=>false,
    hasUnresolvedSheet:()=>true,t:(key:string)=>key,render:()=>{},timerRequest:()=>{writes++;}};
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../web/parent-feedback.js',import.meta.url),'utf8'),context);
  context.requestSleepAction('pause');
  assert.equal(writes,0);assert.equal(context.S.message,'saveNotConfirmed');
});

test('late food history does not redraw a different open form', async () => {
  let reply:(value:unknown)=>void=()=>{},renders=0;
  const response=new Promise(resolve=>{reply=resolve;});
  const context:any={S:{auth:'ready',sheet:{kind:'quick',what:'solids'}},render:()=>{renders++;},LittleDaysAPI:{foods:()=>response}};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../web/parent-feedback.js',import.meta.url),'utf8'),context);
  const loading=context.loadFoods();context.S.sheet={kind:'diaper'};
  reply({entries:[],unavailable:[]});await loading;
  assert.equal(renders,1);assert.equal(context.S.foodLoading,false);
});

test('cancelled Undo restores the timer and ignores its late stop reply', async () => {
  let reply: (value: unknown) => void = () => {};
  const inFlight = new Promise(resolve => { reply = resolve; });
  const timer = {id: 'timer:feed-1', side: 'L'};
  const S: any = {pendingOps: {}, stopping: new Set([timer.id]), toast: {undoId: 'stop-op', pending: true}, run: timer};
  const context: any = {
    S, Date, crypto: {randomUUID: () => 'undo-op'}, LittleDaysBunny: {react: () => {}}, setTimeout: () => 0, t: (key: string) => key === 'undone' ? 'Undone.' : key,
    render: () => {}, canUndo: () => true, wait: async () => {}, clearOperation: () => {},
    homeReadAttempts: new Map(), queueMicrotask, refreshHomeEvidence: () => {},
    recoverWrite: (error: unknown) => { throw error; },
    clearPendingToast: (id: string) => { if (S.toast?.undoId === id) S.toast = null; },
    clearOwnToast: () => { S.toast = null; },
    applyServerData: (state: any) => { S.run = state.run; },
    showDone: (label: any) => { S.message = typeof label === 'function' ? label() : label; },
    // server/timers.ts undo returns the cancelled original stop, as test/timers.test.ts verifies.
    LittleDaysAPI: {operation: () => inFlight, writes: {undo: async () => ({status: 'cancelled', operationId: 'stop-op', state: {run: timer}})}},
  };
  vm.createContext(context);
  vm.runInContext([
    readFileSync(new URL('../web/parent-feedback.js', import.meta.url), 'utf8'),
    section('function finalOperation(', 'const wait ='),
    section('async function handleOperationStatus(', 'async function pollOperation('),
    section('async function pollOperation(', 'async function addEntries('),
    section('function saveUndo(', '\nfunction '),
  ].join('\n'), context);
  const polling = context.pollOperation({status: 'pending', operationId: 'stop-op'}, '', {release: () => S.stopping.delete(timer.id)});
  await Promise.resolve();
  context.saveUndo();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(S.message, 'Undone.');
  assert.equal(S.pendingOps['stop-op'], undefined);
  assert.equal(S.stopping.size, 0);
  reply({status: 'cancelled', operationId: 'stop-op', state: {run: null}});
  await polling;
  assert.equal(S.message, 'Undone.');
  assert.deepEqual(S.run, timer);
});
