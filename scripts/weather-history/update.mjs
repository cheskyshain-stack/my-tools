import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {FIELDS,UNITS,COLUMNS,parseCSV,stringifyCSV,instant,clockText,keyOf,cacheKey,makeEngine,makeGrid,geometry,needed,profilesFor,planWindows,requestCost,quotaDelay,retryTime,download,storeResponse,atomicWrite,readState,saveState,mergeState,iso} from './core.mjs';

const DEFAULT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const paths=root=>({
 csv:path.join(root,'sunset-weather/history/lakewood-comparison.csv'),
 meta:path.join(root,'sunset-weather/history/study.json'),
 state:path.join(root,'scripts/weather-history/checkpoint.json.gz'),
 grid:path.join(root,'scripts/weather-history/ny-grid.json.gz'),
 source:path.join(root,'sunset-weather/index.html'),
 backup:path.join(root,'.weather-history-cache/checkpoint.json.gz')
});
export function counts(rows){return {pending:rows.filter(r=>r.status==='pending').length,ok:rows.filter(r=>r.status==='ok').length,unavailable:rows.filter(r=>r.status==='unavailable').length};}
function nextScheduled(now){
 const date=new Date(now*1000);date.setUTCMinutes(13,0,0);
 while(date.getTime()/1000<=now||date.getUTCHours()%4!==0)date.setUTCHours(date.getUTCHours()+1);
 return date.getTime()/1000;
}
function sourceState(row,state){
 const key=keyOf(row),saved=state.results[key];
 if(saved&&JSON.stringify(COLUMNS.map(c=>saved[c]))!==JSON.stringify(COLUMNS.map(c=>row[c])))throw new Error('Saved result changed: '+key);
 if(row.status!=='pending')state.results[key]={...row};
}
function freeze(row,state,update){
 if(row.status!=='pending')throw new Error('Attempt to recalculate a saved result');
 Object.assign(row,update);state.results[keyOf(row)]={...row};delete state.jobs[keyOf(row)];
}
function invalidatePoint(state,p,t){
 for(const layer of [0,1])for(const hour of [Math.floor(t/3600)*3600,Math.ceil(t/3600)*3600])delete state.cache[cacheKey(layer,layer===0?p.key:p.key.split(':').slice(2).join(':'),hour)];
}
export async function runUpdate(options={}){
 const root=options.root||DEFAULT_ROOT,p=paths(root),now=options.now||(()=>Date.now()/1000),wait=options.sleep||sleep,request=options.request||download;
 const budget=options.budget??1000,maxSeconds=options.maxSeconds??240,maxRequests=options.maxRequests??100;
 if(!Number.isFinite(budget)||budget<0||budget>1000)throw new Error('Run budget must be between 0 and 1000');
 const rows=parseCSV(fs.readFileSync(p.csv,'utf8')),meta=JSON.parse(fs.readFileSync(p.meta,'utf8')),state=readState(p.state);
 const {engine,hash}=makeEngine(fs.readFileSync(p.source,'utf8'),meta),grid=makeGrid(JSON.parse(zlib.gunzipSync(fs.readFileSync(p.grid))));
 if(hash!==state.engineHash)throw new Error('Calculation code changed. Saved times were preserved; review the model version before resuming.');
 const original=new Map(rows.filter(r=>r.status!=='pending').map(r=>[keyOf(r),JSON.stringify(COLUMNS.map(c=>r[c]))]));
 if(fs.existsSync(p.backup))mergeState(state,readState(p.backup),rows);
 for(const row of rows){
  if(row.status==='pending'&&state.results[keyOf(row)])Object.assign(row,state.results[keyOf(row)]);
  sourceState(row,state);
  if(row.status==='ok'&&instant(row.weather_adjusted_local)-instant(row.standard_local)!==Number(row.difference_seconds))throw new Error('Saved clock difference is inconsistent');
 }
 const beforeCSV=fs.readFileSync(p.csv),started=now(),stats={kept:original.size,newCalculated:0,newUnavailable:0,calculationAttempts:0,requests:0,cost:0,cachedHours:0,status:'idle',checkpointChanged:false};
 let changedResults=false,stop=false;
 state.usage=state.usage.filter(u=>u.at>now()-86400);state.pauseUntil=state.pauseUntil||0;
 // Ignore corrupt weather entries, while retaining completed outcomes.
 for(const [key,value] of Object.entries(state.cache)){
  const layer=Number(key[0]);if(!FIELDS[layer]||!Array.isArray(value)||value.length!==FIELDS[layer].length||!value.every(Number.isFinite))delete state.cache[key];
 }
 function save(){
  for(const row of rows){if(original.has(keyOf(row))&&original.get(keyOf(row))!==JSON.stringify(COLUMNS.map(c=>row[c])))throw new Error('Refusing to overwrite a previously saved result');}
  const text=stringifyCSV(rows);if(!fs.existsSync(p.csv)||fs.readFileSync(p.csv,'utf8')!==text)atomicWrite(p.csv,text);
  const a=saveState(p.state,state),b=saveState(p.backup,state);stats.checkpointChanged=stats.checkpointChanged||a||b;
 }
 function dueEvents(){
  return rows.filter(r=>r.status==='pending'&&(state.jobs[keyOf(r)]?.nextAttemptAt||0)<=now()).map(r=>geometry(r,state,engine,grid));
 }
 function evaluate(){
  let progressed=false;
  for(const event of dueEvents()){
   let profiles;
   try{profiles=profilesFor(event,state,engine);}
   catch(error){
    if(error.point)invalidatePoint(state,error.point,event.standard);
    state.jobs[event.id]={...state.jobs[event.id],updatedAt:now(),nextAttemptAt:now()+21600,error:'invalid_atmospheric_data'};continue;
   }
   if(!profiles)continue;
   stats.calculationAttempts++;
   try{
    const ray=engine.atmosphericRay(profiles),adjusted=engine.eventCycle(event.day,ray.refraction,event.rising);
    if(!adjusted)throw new Error('No adjusted event');
    const bearing=engine.sunAt(new Date(adjusted.time),meta.latitude,meta.longitude).az,turn=Math.abs(((bearing-event.bearing+540)%360)-180);
    if(turn>.2&&event.round<2){state.jobs[event.id]={bearing,round:event.round+1,updatedAt:now()};progressed=true;continue;}
    if(turn>.2)throw new Error('Direction did not settle');
    const adjustedSeconds=adjusted.time/1000;
    freeze(event.row,state,{weather_adjusted_local:clockText(adjustedSeconds,meta.timezone),difference_seconds:String(adjustedSeconds-event.standard),status:'ok',reason:''});
    stats.newCalculated++;changedResults=true;progressed=true;
   }catch(error){
    const reason=String(error.message);
    if(!/surface|upper atmosphere|No adjusted event|Direction did not settle/.test(reason))throw error;
    freeze(event.row,state,{weather_adjusted_local:'',difference_seconds:'',status:'unavailable',reason});
    stats.newUnavailable++;changedResults=true;progressed=true;
   }
  }
  return progressed;
 }
 function deferIncomplete(windows){
  for(const event of dueEvents()){
   const bad=windows.some(w=>event.points.some(p=>{
    const cell=w.layer===0?p.key:p.key.split(':').slice(2).join(':');
    return cell===w.cell&&event.standard>=w.start&&event.standard<=w.end&&(!state.cache[cacheKey(w.layer,cell,Math.floor(event.standard/3600)*3600)]||!state.cache[cacheKey(w.layer,cell,Math.ceil(event.standard/3600)*3600)]);
   }));
   if(bad)state.jobs[event.id]={...state.jobs[event.id],updatedAt:now(),nextAttemptAt:now()+21600,error:'atmospheric_data_missing'};
  }
 }
 try{
  // Published results and restored completed results never enter this loop.
  while(!stop){
   for(let round=0;round<3;round++)if(!evaluate())break;
   save();
   const remaining=rows.filter(r=>r.status==='pending');
   if(!remaining.length){stats.status='complete';break;}
   if(now()<state.pauseUntil){stats.status=state.pauseReason||'rate_limited';break;}
   if(stats.requests>=maxRequests||stats.cost>=budget||now()-started>=maxSeconds-40){stats.status='batch_budget';break;}
   const events=dueEvents(),plans=planWindows(needed(events,state));
   if(!plans.length){stats.status='waiting_for_data';break;}
   const first=plans[0],batch=[];
   const remainingBudget=budget-stats.cost;
   for(const w of plans){
    if(w.layer!==first.layer)continue;
    if(batch.length>=(first.layer===0?40:10)||requestCost([...batch,w])>remainingBudget)break;
    batch.push(w);
   }
   if(!batch.length){stats.status='batch_budget';break;}
   const cost=requestCost(batch),allowed=quotaDelay(state,now(),cost);
   if(allowed>now()){
    if(allowed-now()>55||now()-started+(allowed-now())>=maxSeconds-40){state.pauseUntil=allowed;state.pauseReason='rate_limited';stats.status='rate_limited';break;}
    await wait((allowed-now())*1000);continue;
   }
   state.usage.push({id:crypto.randomUUID(),at:now(),cost});stats.cost+=cost;stats.requests++;
   save(); // Reserve this quota before a request, including interrupted requests.
   const response=await request(batch),headers=response.headers||{},body=response.body;
   const reason=body&&!Array.isArray(body)&&body.error?String(body.reason||''):'';
   if(response.status===429||(/limit|rate/i.test(reason)&&reason)){
    state.lastFailure={at:iso(now()),status:response.status,reason:reason||'Weather rate limit'};
    state.pauseUntil=retryTime(headers,reason,now());state.pauseReason='rate_limited';stats.status='rate_limited';break;
   }
   if(response.networkError||response.status<200||response.status>=300||!body||reason){
    state.lastFailure={at:iso(now()),status:response.status,reason:response.networkMessage||reason||'Weather service did not return usable data'};
    state.pauseUntil=now()+(response.status===401||response.status===403?86400:1200);state.pauseReason='weather_service_unavailable';stats.status='weather_service_unavailable';break;
   }
   try{stats.cachedHours+=storeResponse(state,batch,body);deferIncomplete(batch);}
   catch(error){
    state.lastFailure={at:iso(now()),status:response.status,reason:error.message};
    state.pauseUntil=now()+1200;state.pauseReason='weather_service_unavailable';stats.status='weather_service_unavailable';break;
   }
   const charged=Number(headers['x-ratelimit-cost']);
   if(Number.isFinite(charged)&&charged>cost){const extra=Math.ceil((charged-cost)*100)/100;state.usage.at(-1).cost+=extra;stats.cost+=extra;}
   const scope=Number(headers['x-ratelimit-window']),available=Number(headers['x-ratelimit-remaining']),reset=Number(headers['x-ratelimit-reset']);
   if([3600,86400].includes(scope)&&Number.isFinite(available)&&available<1&&reset>now()){state.pauseUntil=reset+2;state.pauseReason='rate_limited';}
   save();
  }
 }finally{
  save();
  meta.counts=counts(rows);
  if(changedResults||!beforeCSV.equals(fs.readFileSync(p.csv)))meta.created_utc=iso(now());
  const pendingJobs=Object.values(state.jobs).filter(j=>j.error),nextRetry=state.pauseUntil>now()?state.pauseUntil:nextScheduled(now());
  meta.automation={enabled:true,schedule:'Every 4 hours',lastCheckAt:iso(now()),lastOutcome:stats.status,nextCheckAfter:iso(Math.max(nextScheduled(now()),nextRetry)),retryAfter:state.pauseUntil>now()?iso(state.pauseUntil):null,keptResults:stats.kept,newResults:stats.newCalculated,newUnavailable:stats.newUnavailable,weatherRequests:stats.requests,quotaUsed:Math.round(stats.cost*100)/100,knownDataIssues:pendingJobs.length};
  meta.unavailable=rows.filter(r=>r.status==='unavailable').map(r=>({date:r.date,event:r.event,reason:r.reason}));
  meta.retryNotes=Object.fromEntries(rows.filter(r=>r.status==='pending'&&state.jobs[keyOf(r)]?.error).map(r=>[keyOf(r),{reason:state.jobs[keyOf(r)].error,retryAfter:iso(state.jobs[keyOf(r)].nextAttemptAt)}]));
  const text=JSON.stringify(meta,null,2)+'\n';if(!fs.existsSync(p.meta)||fs.readFileSync(p.meta,'utf8')!==text)atomicWrite(p.meta,text);
 }
 return {...stats,counts:counts(rows),nextRetryAt:state.pauseUntil>now()?iso(state.pauseUntil):null,lastFailure:state.lastFailure||null};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 let result;
 try{
  const root=path.resolve(get('--root',DEFAULT_ROOT));
  result=await runUpdate({root,budget:Number(get('--budget',1000)),maxSeconds:Number(get('--max-seconds',240)),maxRequests:Number(get('--max-requests',100))});
  const p=paths(root),build=spawnSync('python3',[path.join(root,'sunset-weather/history/update-data.py'),'--csv',p.csv,'--details',p.meta],{encoding:'utf8'});
  if(build.status!==0)throw new Error(build.stderr||'Could not update the public study snapshot');
  console.log(JSON.stringify(result));
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`checkpoint_changed=${result.checkpointChanged}\n`);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Weather history: ${result.counts.ok} calculated, ${result.counts.pending} pending, ${result.counts.unavailable} model unavailable.\n\nKept ${result.kept} saved outcomes without recalculating. Added ${result.newCalculated} results with ${result.requests} weather requests (${result.cost.toFixed(2)} weighted quota units). Status: ${result.status}.\n`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
