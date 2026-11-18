/* Parent controls reuse the existing forms and confirmed writes. */
const FEEDBACK_COPY = {
  pauseSleep:['Pause sleep','Pausar sueño'], resumeSleep:['Resume sleep','Reanudar sueño'],
  endSleep:['End sleep','Finalizar sueño'], paused:['Sleep paused','Sueño en pausa'],
  cancelSleep:['Cancel timer','Cancelar temporizador'], cancelSleepQuestion:['Cancel this sleep timer?','¿Cancelar este temporizador de sueño?'],
  cancelSleepHelp:['This discards the active interval.','Se descarta el intervalo activo.'],
  timerCancelled:['Sleep timer cancelled.','Temporizador de sueño cancelado.'],
  sleepEnded:['Sleep ended.','Sueño finalizado.'], sleepPaused:['Sleep paused.','Sueño en pausa.'],
  autoSleepEnded:['Sleep ended when the feed or diaper change started.','El sueño terminó al iniciar la toma o el cambio de pañal.'],
  sleepDiscarded:['The feed or diaper was saved. The sleep timer was cancelled without a sleep entry.','La toma o el pañal se guardó. El temporizador de sueño se canceló sin registrar sueño.'],
  caption:['Caption (optional)','Descripción (opcional)'],
  customFood:['Log another food','Registrar otro alimento'], foodList:['All foods','Todos los alimentos'],
  preference:['Did she like it?','¿Le gustó?'], liked:['Liked','Le gustó'], disliked:["Didn't like",'No le gustó'],
  unknown:['Not recorded','Sin registrar'], notTried:['Not tried','Sin probar'], tried:['Tried; preference unknown','Probado; gusto sin registrar'],
  foodsLoading:['Loading food history…','Cargando historial de alimentos…'],
  foodsError:['Food history is unavailable. Try again to see which foods she has tried.','El historial no está disponible. Reintente para ver qué alimentos ha probado.'],
  foodsOrder:['About food introduction','Sobre la introducción de alimentos'],
  foodSave:['Log food','Registrar alimento'], sleepIncomplete:['The feed or diaper was saved. Sleep still needs attention.','La toma o el pañal se guardó. Falta finalizar el sueño.'],
};
const ft=key=>FEEDBACK_COPY[key][S.lang==='es'?1:0];
const foodCatalogOpen=()=>S.sheet?.kind==='quick'&&S.sheet.what==='solids'&&!S.sheet.foodSelected&&!S.sheet.food?.trim();

async function loadFoods() {
  const request=(S.foodRequest||0)+1;S.foodRequest=request;S.foodLoading=true;if(foodCatalogOpen())render();
  try {
    const data=await LittleDaysAPI.foods();
    if(S.foodRequest!==request||S.auth!=='ready')return;
    S.foodEntries=data.entries||[];S.foodError=!!data.unavailable?.length;
  } catch { if(S.foodRequest===request)S.foodError=true; }
  finally { if(S.foodRequest===request){S.foodLoading=false;if(foodCatalogOpen())render();} }
}
function foodStatus(item) {
  if(S.foodLoading)return ft('foodsLoading');
  if(S.foodError)return ft('unknown');
  return ft({'not-tried':'notTried',tried:'tried',liked:'liked',disliked:'disliked'}[item.status]);
}
function foodTile(item) {
  const known=!S.foodLoading&&!S.foodError,status=known?item.status:'unknown';
  const mark={liked:'✓',disliked:'×',tried:'—','not-tried':'○',unknown:'?'}[status];
  const picture=item.image?`<img src="${esc(item.image)}" alt="" width="56" height="56">`:`<span class="food-custom-image" aria-hidden="true">${ic('solids')}</span>`;
  const arg=item.id||item.name[0];
  return `<button type="button" class="food-tile" data-act="food-select" data-arg="${esc(arg)}">${picture}<span class="food-name">${esc(item.name[S.lang==='es'?1:0])}</span><span class="food-status food-${status}"><span aria-hidden="true">${mark}</span> ${esc(foodStatus(item))}</span></button>`;
}
function foodCatalogHTML() {
  const items=LITTLE_DAYS_FOODS.summary(S.foodEntries||[]),groups=new Map();
  for(const item of items){const name=item.group[S.lang==='es'?1:0];if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);}
  const error=S.foodError?`<p role="alert">${ft('foodsError')}</p><button type="button" class="btn" data-act="retry-foods">${t('retry')}</button>`:'';
  return `<button type="button" class="btn" data-act="food-custom">${ft('customFood')}</button>${error}${[...groups].map(([name,foods])=>`<section class="food-group"><h3>${esc(name)}</h3><div class="food-grid">${foods.map(foodTile).join('')}</div></section>`).join('')}<a class="text-link" href="https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html" target="_blank" rel="noopener noreferrer">${ft('foodsOrder')}</a>`;
}
function foodPreferenceHTML(value,edit=false) {
  const selected=value??null;
  return `<fieldset class="food-preference"><legend>${ft('preference')}</legend><div class="chips">${[[null,'unknown'],['liked','liked'],['disliked','disliked']].map(([v,label])=>`<button type="button" class="btn${selected===v?' selected':''}" data-act="${edit?'edit-food-preference':'food-preference'}" data-arg="${v||''}" aria-pressed="${selected===v}">${label==='liked'?'✓ ':label==='disliked'?'× ':''}${ft(label)}</button>`).join('')}</div></fieldset>`;
}
function solidsSheet(s) {
  if(!s.foodSelected&&!s.food?.trim())return sheetShell(t('solids'),foodCatalogHTML(),null);
  const selected=LITTLE_DAYS_FOODS.catalog.find(item=>item.id===s.foodId);
  const image=selected?`<img class="selected-food-image" src="${esc(selected.image)}" alt="" width="80" height="80">`:'';
  const body=`<button type="button" class="text-link" data-act="food-list">‹ ${ft('foodList')}</button>${image}${field('food',t('food'),s.food||'')}${foodPreferenceHTML(s.preference)}${field('amount',t('amountOptional'),s.amount||'','number','min="0" step="any"')}${whenFields(s)}${noteBlock(s,textareaField('note',t('note'),s.text||'',2),s.text)}`;
  return sheetShell(t('solids'),body,{label:t('save'),on:SAVE_VALIDATORS.quick(s)});
}
function sleepPausedHTML() {
  return `<p class="sleep-paused">${ft('paused')}</p><div class="sleep-actions"><button type="button" class="btn solid" data-act="resume-sleep" ${canStartTimer()?'':'disabled'}>${ft('resumeSleep')}</button><button type="button" class="btn" data-act="end-paused-sleep" ${canStopRun()?'':'disabled'}>${ft('endSleep')}</button></div>`;
}
function sleepExtraActions(run) {
  const disabled=canStopRun(run)?'':'disabled';
  return `<div class="sleep-actions"><button type="button" class="btn" data-act="pause-sleep" ${disabled}>${ft('pauseSleep')}</button><button type="button" class="text-link" data-act="cancel-sleep" ${disabled}>${ft('cancelSleep')}</button></div>`;
}
function cancelSleepSheet(s) {
  return bottomSheet(ft('cancelSleep'),`<h3>${ft('cancelSleepQuestion')}</h3><p>${ft('cancelSleepHelp')}</p><p>${t('startedBy',esc(shownName(S.sleepRun?.by||'')))}</p>`,`<div class="sh-foot"><button type="button" class="btn" data-act="cancel">${t('cancel')}</button><button type="button" class="btn solid" data-act="discard-sleep">${ft('cancelSleep')}</button></div>`);
}
function requestSleepAction(action,confirmOther=false) {
  const run=shownRun(S.sleepRun);if(!run||!canStopRun(run))return;
  if(otherAdult(run.by)&&!confirmOther){S.sheet={kind:'confirm',act:`sleep-${action}`,by:personName(run.by)||run.by,draft:S.sheet};render();return;}
  const owner=S.sheet||S;
  if(owner._preparedStop&&(owner._preparedStop.action!==action||owner._preparedStop.id!==run.id)){
    if(hasUnresolvedSheet(owner)||S.pendingSheetOperation){S.message=t('saveNotConfirmed');render();return;}
    clearOperation(owner);
  }
  const prepared=owner._preparedStop||(owner._preparedStop={id:run.id,action,confirmOther,note:S.sheet?.note||''});
  const label=action==='pause'?()=>ft('sleepPaused'):()=>ft('timerCancelled');
  return timerRequest(op=>LittleDaysAPI.writes.sleepAction(prepared.id,prepared.action,prepared.confirmOther,op,prepared.note),label,{close:true,undoable:action==='pause',toast:action==='pause',stopId:run.id,owner});
}
function pausedSleepAction(action,confirmOther=false) {
  const pauseId=S.sleepPaused?.id;if(!pauseId)return;
  if(action==='end'&&otherAdult(S.sleepPaused.by)&&!confirmOther){S.sheet={kind:'confirm',act:'sleep-end-paused',by:S.sleepPaused.by,draft:S.sheet};render();return;}
  // Resume and End each have their own save ID: a stop that waits out its Undo window on Home keeps its own.
  const holder=S.sheet||S,key=`${action}:${pauseId}`,owner=holder._pausedOwner?.key===key?holder._pausedOwner:(holder._pausedOwner={key});
  return timerRequest(op=>LittleDaysAPI.writes.pausedSleep(action,pauseId,op,confirmOther),()=>action==='resume'?t('started'):ft('sleepEnded'),{close:true,owner});
}
function feedbackAction(action,arg) {
  const s=S.sheet;
  switch(action){
    case 'cancel':case 'scrim':if(s?.kind!=='cancelSleep')return false;S.sheet=s.draft;break;
    case 'open-photo':formAction('open-note');S.sheet.photoOnly=true;render();document.querySelector('[data-sheet] [data-fid="photo"]')?.click();return true;
    case 'retry-foods':void loadFoods();return true;
    case 'food-select':{const food=LITTLE_DAYS_FOODS.catalog.find(item=>item.id===arg);Object.assign(s,{foodSelected:true,foodId:food?.id||null,food:food?food.name[S.lang==='es'?1:0]:arg,preference:null});break;}
    case 'food-custom':Object.assign(s,{foodSelected:true,foodId:null,food:'',preference:null});break;
    case 'food-list':s.foodSelected=false;s.food='';s.foodId=null;s.preference=null;void loadFoods();break;
    case 'food-preference':s.preference=arg||null;s.dirty=true;break;
    case 'edit-food-preference':s.valuePreference=arg||null;s.dirty=true;break;
    case 'pause-sleep':void requestSleepAction('pause');return true;
    case 'cancel-sleep':S.sheet={kind:'cancelSleep',draft:s};break;
    case 'discard-sleep':void requestSleepAction('discard',true);return true;
    case 'resume-sleep':void pausedSleepAction('resume');return true;
    case 'end-paused-sleep':void pausedSleepAction('end');return true;
    default:return false;
  }
  render();return true;
}
function offerSleepConfirmation(result,label,context) {
  const id=result.operationId||context.operationId;
  S.pendingOps[id]={label,context};S.pendingSheetOperation=null;
  S.message=ft('sleepIncomplete');S.retryLabel=ft('endSleep');
  S.retryAction=()=>timerRequest(()=>LittleDaysAPI.writes.confirmSleep(id),label,{...context,owner:context.operationOwner,close:true});
  void LittleDaysAPI.state().then(state=>{applyServerData(state);render();}).catch(()=>{});
  render();
}
function interruptedSleepAttention(result,label,context) {
  if(result.eventSaved&&result.status==='failed'){
    finalOperation({...result,status:'saved'},()=>result.error||ft('sleepIncomplete'),context);
    void LittleDaysAPI.state().then(state=>{applyServerData(state);render();}).catch(()=>{});
    return true;
  }
  if(!result.eventSaved||!result.warning)return false;
  if(result.correctionRequired&&result.sleepOperationId){
    const id=result.operationId||context.operationId;
    S.pendingOps[id]={label,context};
    finalOperation({...result,operationId:result.sleepOperationId},label,{...context,parentOperationId:id});
    return true;
  }
  if(result.needsConfirmation){offerSleepConfirmation(result,label,context);return true;}
  const id=result.operationId||context.operationId;
  S.pendingOps[id]={label,context};S.pendingSheetOperation=null;
  S.message=ft('sleepIncomplete');S.retryLabel=t('retry');S.retryAction=()=>checkOperationAgain(id);
  void LittleDaysAPI.state().then(state=>{applyServerData(state);render();}).catch(()=>{});
  render();return true;
}

function deferInterruptedSleep(id) {
  S.message=ft('sleepIncomplete');S.retryLabel=t('retry');S.retryAction=()=>checkOperationAgain(id);render();
}
