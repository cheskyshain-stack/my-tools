import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FIELDS,LEVELS,UNITS,parseCSV,stringifyCSV,keyOf,makeEngine,readState,saveState,retryTime,quotaDelay} from '../scripts/weather-history/core.mjs';
import {runUpdate,paths} from '../scripts/weather-history/update.mjs';

const repo=path.resolve(new URL('..',import.meta.url).pathname),roots=[];
let checks=0,time=Date.parse('2026-11-18T00:00:00Z')/1000;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ok=(a,message)=>{assert.ok(a,message);checks++;};
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cj-history-test-'));roots.push(root);
 const p=paths(root);fs.mkdirSync(path.dirname(p.csv),{recursive:true});fs.mkdirSync(path.dirname(p.state),{recursive:true});
 for(const file of ['sunset-weather/index.html','scripts/weather-history/ny-grid.json.gz'])fs.copyFileSync(path.join(repo,file),path.join(root,file));
 const all=parseCSV(fs.readFileSync(path.join(repo,'sunset-weather/history/lakewood-comparison.csv'),'utf8'));
 const saved=all.find(r=>r.status==='ok'),missing={...all.find(r=>r.date==='2024-06-15'&&r.event==='Sunset'),status:'pending',weather_adjusted_local:'',difference_seconds:'',reason:'Waiting'};
 const meta=JSON.parse(fs.readFileSync(path.join(repo,'sunset-weather/history/study.json')));
 fs.writeFileSync(p.csv,stringifyCSV([saved,missing]));fs.writeFileSync(p.meta,JSON.stringify(meta));
 const {hash}=makeEngine(fs.readFileSync(p.source,'utf8'),meta);
 saveState(p.state,{version:1,engineHash:hash,cache:{},results:{[keyOf(saved)]:saved},jobs:{},usage:[],pauseUntil:0});
 return {root,p,saved,missing,initialCSV:fs.readFileSync(p.csv),initialState:fs.readFileSync(p.state)};
}
function response(windows,{nulls=false}={}){
 const value=k=>{
  if(k==='temperature_2m')return 15;if(k==='pressure_msl')return 1013.25;
  const pressure=Number(k.match(/_(\d+)hPa/)[1]),height=pressure>=226.3213?44330.77*(1-(pressure/1013.25)**.190263):11000-6341.62*Math.log(pressure/226.3213);
  return k.startsWith('geopotential')?height:pressure>=226.3213?15-.0065*height:-56.5;
 };
 return {status:200,headers:{},body:windows.map(w=>{
  const time=Array.from({length:(w.end-w.start)/3600+1},(_,i)=>w.start+i*3600),hourly={time},hourly_units={time:'unixtime'};
  for(const field of FIELDS[w.layer]){hourly[field]=time.map(()=>nulls?null:value(field));hourly_units[field]=UNITS[field];}
  return {elevation:0,hourly,hourly_units};
 })};
}
const run=(f,extra={})=>runUpdate({root:f.root,now:()=>time,sleep:async ms=>{time+=ms/1000;},...extra});
try{
 const f=fixture();let calls=[];
 let result=await run(f,{maxRequests:2,request:async windows=>{calls.push(windows[0].layer);return calls.length===1?response(windows):{status:429,headers:{'retry-after':'120','x-ratelimit-reset':String(time+130)},body:{error:true,reason:'Hourly API request limit exceeded'}};}});
 eq(calls,[0,1]);eq(result.status,'rate_limited');eq(result.counts,{pending:1,ok:1,unavailable:0});
 ok(Object.keys(readState(f.p.state).cache).length>0,'Successful hours saved before a quota interruption');
 const resumeAt=readState(f.p.state).pauseUntil;eq(resumeAt,time+132);
 result=await run(f,{request:()=>{throw new Error('must not request before retry');}});eq(result.requests,0);eq(result.calculationAttempts,0);
 time=resumeAt+1;calls=[];
 result=await run(f,{request:async windows=>{calls.push(windows[0].layer);return response(windows);}});
 eq(calls,[1]);eq(result.newCalculated,1);eq(result.counts,{pending:0,ok:2,unavailable:0});
 eq(parseCSV(fs.readFileSync(f.p.csv,'utf8'))[0],f.saved);
 const completedCSV=fs.readFileSync(f.p.csv);result=await run(f,{request:()=>{throw new Error('must not refetch saved data');}});
 eq(result.requests,0);eq(result.calculationAttempts,0);eq(fs.readFileSync(f.p.csv),completedCSV);
 // A newer recovery cache restores a result after a failed repository push.
 fs.writeFileSync(f.p.csv,f.initialCSV);fs.writeFileSync(f.p.state,f.initialState);
 result=await run(f,{request:()=>{throw new Error('must restore without calculation');}});
 eq(result.calculationAttempts,0);eq(fs.readFileSync(f.p.csv),completedCSV);

 const unavailable=fixture();result=await run(unavailable,{request:async()=>({status:503,headers:{},body:null})});
 eq(result.counts,{pending:1,ok:1,unavailable:0});eq(result.status,'weather_service_unavailable');
 ok(readState(unavailable.p.state).pauseUntil>time,'Network failures back off and retain pending values');

 const missing=fixture();result=await run(missing,{request:async w=>response(w,{nulls:true})});
 eq(result.status,'waiting_for_data');eq(result.counts.pending,1);eq(result.counts.unavailable,0);
 const afterNull=readState(missing.p.state);eq(Object.keys(afterNull.cache).length,0);
 ok(afterNull.jobs[keyOf(missing.missing)].nextAttemptAt>time,'Null archive fields get a retry time');
 result=await run(missing,{request:()=>{throw new Error('retry backoff must persist');}});eq(result.requests,0);
 time+=21601;result=await run(missing,{request:async w=>response(w)});eq(result.newCalculated,1);

 const limited=fixture(),s=readState(limited.p.state);s.usage=[{id:'shared',at:time,cost:7000}];saveState(limited.p.state,s);
 result=await run(limited,{request:()=>{throw new Error('daily budget must survive process restarts');}});eq(result.status,'rate_limited');eq(result.requests,0);
 eq(quotaDelay({usage:[{at:time-30,cost:480}]},time,10),time+31);
 eq(retryTime({'retry-after':'Wed, 18 Nov 2026 02:00:00 GMT'},'',Date.parse('2026-11-18T01:00:00Z')/1000),Date.parse('2026-11-18T02:00:02Z')/1000);

 const conflict=fixture(),backup=readState(conflict.p.state);backup.results[keyOf(conflict.saved)].difference_seconds='999';saveState(conflict.p.backup,backup);
 await assert.rejects(run(conflict),/conflict/);checks++;
 const changed=fixture();fs.appendFileSync(changed.p.source,'\n');
 // Changes outside the shared engine do not invalidate archived data.
 result=await run(changed,{budget:0});eq(result.requests,0);
 fs.writeFileSync(changed.p.source,fs.readFileSync(changed.p.source,'utf8').replace('var D2R =','var D2R = 0 +'));
 await assert.rejects(run(changed),/Calculation code changed/);checks++;
 eq(LEVELS.length,27);
 console.log(`${checks} historical updater checks passed.`);
}finally{for(const root of roots)fs.rmSync(root,{recursive:true,force:true});}
