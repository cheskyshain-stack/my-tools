import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

export const LEVELS=[1000,975,950,925,900,875,850,800,750,700,650,600,550,500,450,400,350,300,250,200,150,100,70,50,30,20,10];
export const FIELDS=[['temperature_2m','pressure_msl'],LEVELS.flatMap(p=>[`temperature_${p}hPa`,`geopotential_height_${p}hPa`])];
export const UNITS=Object.fromEntries(FIELDS.flat().map(k=>[k,k==='pressure_msl'?'hPa':k.startsWith('geopotential_height_')?'m':'°C']));
export const LIMITS={minute:480,hour:4000,day:7000};
export const COLUMNS=['date','event','standard_local','weather_adjusted_local','difference_seconds','status','reason'];
export const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
export const keyOf=row=>`${row.date}/${row.event==='Netz'?'rise':'set'}`;
export const cacheKey=(layer,cell,hour)=>`${layer}/${cell}/${hour}`;
export const iso=t=>new Date(t*1000).toISOString();

export function parseCSV(text){
 const records=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}
  else if(c==='"')quoted=true;
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'){row.push(field.replace(/\r$/,''));records.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 if(field||row.length){row.push(field.replace(/\r$/,''));records.push(row);}
 const headers=records.shift();
 if(JSON.stringify(headers)!==JSON.stringify(COLUMNS))throw new Error('Unexpected history columns');
 const seen=new Set();
 return records.filter(r=>r.some(Boolean)).map(values=>{
  if(values.length!==headers.length)throw new Error('Invalid CSV row');
  const r=Object.fromEntries(headers.map((h,i)=>[h,values[i]]));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!['Netz','Sunset'].includes(r.event)||!['ok','pending','unavailable'].includes(r.status))throw new Error('Invalid history record');
  const key=keyOf(r);if(seen.has(key))throw new Error('Duplicate history event');seen.add(key);
  if(r.status==='ok'&&(!r.weather_adjusted_local||!/^[-+]?\d+$/.test(r.difference_seconds)))throw new Error('Incomplete saved result');
  if(r.status!=='ok'&&(r.weather_adjusted_local||r.difference_seconds))throw new Error('Missing result must not be numeric');
  return r;
 });
}
export function stringifyCSV(rows){
 const escape=value=>/[",\r\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;
 return [COLUMNS,...rows.map(r=>COLUMNS.map(k=>String(r[k]??'')))].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
export function instant(text){
 const m=/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) (AM|PM) (EST|EDT)$/.exec(text);
 if(!m)throw new Error('Invalid saved local time');
 const hour=Number(m[4])%12+(m[7]==='PM'?12:0);
 return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),hour+(m[8]==='EDT'?4:5),Number(m[5]),Number(m[6]))/1000;
}
export function clockText(seconds,zone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZoneName:'short'}).formatToParts(new Date(seconds*1000)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour.padStart(2,'0')}:${parts.minute}:${parts.second} ${parts.dayPeriod} ${parts.timeZoneName}`;
}
export function engineSource(html){
 const segment=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<i)throw new Error('Calculation source markers are missing');return html.slice(i,j);};
 return segment('  var D2R =','  var KEY =')+segment('  function dateAt(','  function setZone(')+segment('  function eventCycle(','  function showTime(');
}
export function makeEngine(html,meta){
 const source=engineSource(html),engine={state:{place:{lat:meta.latitude,lon:meta.longitude}},zone:meta.timezone};
 vm.createContext(engine);vm.runInContext(source,engine);
 return {engine,hash:sha(source+JSON.stringify(engine.state.place))};
}
export function makeGrid(data){
 const F=Math.fround;
 function select(g,lat,lon){
  lat=F(lat);lon=F(lon);
  const x=Math.floor(F(F(lon-F(-180))/g.dx)+.5),y=Math.floor(F(F(lat-g.latMin)/g.dy)+.5);
  const at=(xx,yy)=>{
   if(xx<g.x0||yy<g.y0||xx>=g.x0+g.width||yy>=g.y0+g.height)throw new Error('Location is outside the saved weather grid');
   const v=g.elevations[(yy-g.y0)*g.width+xx-g.x0];return v===null?NaN:v;
  };
  const center=at(x,y);let best=Math.abs(center),chosen=[y,x],elevation=NaN;
  if(best<=100)return chosen;
  for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){
   const h=at(xx,yy);if(!Number.isFinite(h)||h<=-999)continue;
   const la=F(g.latMin+F(F(yy)*g.dy)),lo=F(F(-180)+F(F(xx)*g.dx));
   const da=F(F(la)-lat),do_=F(F(lo)-lon),squared=F(F(da*da)+F(do_*do_)),distance=F(F(Math.sqrt(squared))*F(111));
   const score=(h>=9999?0:Math.abs(h))+distance*30;
   if(score<best&&distance<50){best=score;chosen=[yy,xx];elevation=h;}
  }
  return !Number.isFinite(elevation)||best>1500?[y,x]:chosen;
 }
 return p=>data.grids.flatMap(g=>select(g,p.lat,p.lon)).join(':');
}
export function geometry(row,state,engine,grid){
 const id=keyOf(row),rising=row.event==='Netz',standard=instant(row.standard_local),job=state.jobs[id]||{};
 const bearing=job.bearing??engine.sunAt(new Date(standard*1000),engine.state.place.lat,engine.state.place.lon).az;
 const points=engine.PROFILE_DISTANCES.map(km=>{
  const p=engine.alongPath(engine.state.place.lat,engine.state.place.lon,bearing,km);
  const point={lat:Number(p.lat.toFixed(5)),lon:Number(p.lon.toFixed(5))};point.key=grid(point);return point;
 });
 return {id,row,rising,standard,day:Date.parse(row.date+'T00:00:00Z'),bearing,round:job.round||0,points};
}
export function needed(parts,state){
 const requests=new Map();
 for(const event of parts)for(const p of event.points)for(const layer of [0,1]){
  const cell=layer===0?p.key:p.key.split(':').slice(2).join(':'),lo=Math.floor(event.standard/3600)*3600,hi=Math.ceil(event.standard/3600)*3600;
  if(state.cache[cacheKey(layer,cell,lo)]&&state.cache[cacheKey(layer,cell,hi)])continue;
  const id=`${layer}/${cell}/${lo}`;
  if(!requests.has(id))requests.set(id,{layer,cell,p,time:event.standard,hours:[lo,hi]});
 }
 return [...requests.values()];
}
export function interpolate(state,layer,cell,t){
 const lo=Math.floor(t/3600)*3600,hi=Math.ceil(t/3600)*3600,a=state.cache[cacheKey(layer,cell,lo)],b=state.cache[cacheKey(layer,cell,hi)];
 if(!a||!b)return null;
 const f=(t-lo)/3600;
 return Object.fromEntries(FIELDS[layer].map((field,i)=>[field,a[i]+(b[i]-a[i])*f]));
}
export function profilesFor(event,state,engine){
 const profiles=[];
 for(let i=0;i<event.points.length;i++){
  const p=event.points[i],a=interpolate(state,0,p.key,event.standard),b=interpolate(state,1,p.key.split(':').slice(2).join(':'),event.standard);
  if(!a||!b)return null;
  try{profiles.push(engine.profileFrom({elevation:0,current:{time:event.standard,...a,...b},current_units:{time:'unixtime',...UNITS}},engine.PROFILE_DISTANCES[i]));}
  catch(error){error.point=p;throw error;}
 }
 return profiles;
}
export function planWindows(requests){
 const groups=new Map();
 for(const r of requests){const k=`${r.layer}/${r.cell}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 const windows=[];
 for(const items of groups.values()){
  items.sort((a,b)=>a.time-b.time);let active;
  for(const r of items){
   const start=Math.floor(r.time/3600)*3600,end=Math.ceil(r.time/3600)*3600;
   if(!active||end>active.limit){active={layer:r.layer,cell:r.cell,p:r.p,start,end,limit:start+14*86400-3600,wanted:new Set(r.hours)};windows.push(active);}
   else{active.end=Math.max(active.end,end);for(const h of r.hours)active.wanted.add(h);}
  }
 }
 return windows.sort((a,b)=>a.start-b.start||a.layer-b.layer||a.cell.localeCompare(b.cell));
}
export function requestCost(windows){return windows.length?Math.max(10,FIELDS[windows[0].layer].length)*windows.length/10:0;}
export function quotaDelay(state,now,cost){
 let until=now;
 for(const [seconds,limit] of [[60,LIMITS.minute],[3600,LIMITS.hour],[86400,LIMITS.day]]){
  const used=state.usage.filter(u=>u.at>now-seconds).sort((a,b)=>a.at-b.at);let sum=used.reduce((n,u)=>n+u.cost,0);
  for(const u of used){if(sum+cost<=limit)break;until=Math.max(until,u.at+seconds+1);sum-=u.cost;}
 }
 if(state.pauseUntil>now)until=Math.max(until,state.pauseUntil);
 return until;
}
export function parseHeaders(text){
 const headers={};
 for(const line of text.split(/\r?\n/)){const i=line.indexOf(':');if(i>0)headers[line.slice(0,i).toLowerCase()]=line.slice(i+1).trim();}
 return headers;
}
export function retryTime(headers,reason,now){
 const value=headers['retry-after'],reset=Number(headers['x-ratelimit-reset']);
 let retry=Number(value);
 if(value&&!Number.isFinite(retry))retry=(Date.parse(value)/1000)-now;
 if(!Number.isFinite(retry)||retry<0)retry=/monthly/i.test(reason)?31*86400:/daily/i.test(reason)?86400:/hourly/i.test(reason)?3600:60;
 return Math.max(now+retry,Number.isFinite(reset)?reset:0)+2;
}
export function download(windows){
 const layer=windows[0].layer,params=new URLSearchParams();
 const hour=t=>new Date(t*1000).toISOString().slice(0,13)+':00';
 Object.entries({latitude:windows.map(w=>w.p.lat.toFixed(5)).join(','),longitude:windows.map(w=>w.p.lon.toFixed(5)).join(','),start_hour:windows.map(w=>hour(w.start)).join(','),end_hour:windows.map(w=>hour(w.end)).join(','),hourly:FIELDS[layer].join(','),models:'gfs_global',elevation:windows.map(()=>0).join(','),timezone:'GMT',timeformat:'unixtime'}).forEach(([k,v])=>params.set(k,v));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cj-weather-'));
 try{
  const bodyPath=path.join(dir,'body'),headerPath=path.join(dir,'headers');
  const r=spawnSync('curl',['-sS','--http1.1','--compressed','--max-time','35','-D',headerPath,'-o',bodyPath,'-w','%{http_code}','https://historical-forecast-api.open-meteo.com/v1/forecast?'+params],{encoding:'utf8',timeout:40000});
  const headers=fs.existsSync(headerPath)?parseHeaders(fs.readFileSync(headerPath,'utf8')):{};
  let body;try{body=JSON.parse(fs.readFileSync(bodyPath,'utf8'));}catch{}
  return {status:Number(r.stdout)||0,headers,body,networkError:r.status!==0,networkMessage:r.status!==0?String(r.stderr||r.error?.message||'Network request failed').slice(0,300):undefined};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
export function storeResponse(state,windows,body){
 const list=Array.isArray(body)?body:[body];
 if(list.length!==windows.length)throw new Error('Weather response has the wrong number of columns');
 let added=0;
 list.forEach((d,i)=>{
  const w=windows[i],fields=FIELDS[w.layer],hours=d?.hourly?.time,units=d?.hourly_units;
  if(d?.elevation!==0||!Array.isArray(hours)||hours[0]!==w.start||hours.at(-1)!==w.end||units?.time!=='unixtime'||fields.some(k=>units[k]!==UNITS[k]||!Array.isArray(d.hourly[k])||d.hourly[k].length!==hours.length))throw new Error('Incomplete atmospheric response or units');
  for(let j=0;j<hours.length;j++){
   const t=hours[j];if(t!==w.start+j*3600)throw new Error('Weather hours are not aligned');
   if(!w.wanted.has(t))continue;
   const values=fields.map(k=>d.hourly[k][j]);
   if(!values.every(Number.isFinite))continue;
   if(w.layer===0&&(values[0]<-90||values[0]>65||values[1]<850||values[1]>1100))continue;
   if(w.layer===1&&values.some((v,k)=>k%2===0&&(v<-120||v>80)))continue;
   const key=cacheKey(w.layer,w.cell,t);
   if(!state.cache[key]){state.cache[key]=values;added++;}
  }
 });
 return added;
}
export function atomicWrite(file,bytes){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.next';fs.writeFileSync(temp,bytes);fs.renameSync(temp,file);
}
export function readState(file){
 const s=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
 if(s.version!==1||!s.cache||!s.results||!s.jobs||!Array.isArray(s.usage))throw new Error('Invalid update checkpoint');
 return s;
}
export function saveState(file,state){
 const bytes=zlib.gzipSync(Buffer.from(JSON.stringify(state)),{level:9});
 if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))return false;
 atomicWrite(file,bytes);return true;
}
export function mergeState(state,backup,rows){
 if(backup.engineHash!==state.engineHash)throw new Error('Cached checkpoint uses a different calculation version');
 for(const [k,v] of Object.entries(backup.cache))if(!state.cache[k])state.cache[k]=v;
 const keyed=new Map(rows.map(r=>[keyOf(r),r]));
 for(const [k,result] of Object.entries(backup.results)){
  const row=keyed.get(k);if(!row)throw new Error('Checkpoint event is outside this study');
  if(row.standard_local!==result.standard_local)throw new Error('Saved regular time changed');
  if(row.status==='pending'){Object.assign(row,result);state.results[k]={...row};}
  else if(JSON.stringify(COLUMNS.map(c=>row[c]))!==JSON.stringify(COLUMNS.map(c=>result[c])))throw new Error('Saved results conflict; refusing to overwrite them');
 }
 const seen=new Set(state.usage.map(u=>u.id));
 for(const u of backup.usage)if(!seen.has(u.id)){state.usage.push(u);seen.add(u.id);}
 for(const [k,v] of Object.entries(backup.jobs))if(keyed.get(k)?.status==='pending'&&(v.updatedAt||0)>(state.jobs[k]?.updatedAt||0))state.jobs[k]=v;
 if((backup.pauseUntil||0)>(state.pauseUntil||0)){state.pauseUntil=backup.pauseUntil;state.pauseReason=backup.pauseReason;state.lastFailure=backup.lastFailure;}
}
