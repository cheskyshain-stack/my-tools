import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, BASE } from './pw.mjs';
import {parseCSV,instant} from '../scripts/weather-history/core.mjs';

let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ok=(a,msg)=>{assert.ok(a,msg);checks++;};
const html=fs.readFileSync(new URL('../sunset-weather/history/index.html',import.meta.url),'utf8');
const data=JSON.parse(html.match(/<script type="application\/json" id="historyData">([\s\S]*?)<\/script>/)[1]);
eq(data.days.length,1826);
const source=parseCSV(fs.readFileSync(new URL('../sunset-weather/history/lakewood-comparison.csv',import.meta.url),'utf8'));
const sourceCounts={pending:0,ok:0,unavailable:0};for(const row of source)sourceCounts[row.status]++;
eq(data.counts,sourceCounts);
for(const d of data.days)for(const [event,offset] of [['Netz',1],['Sunset',4]]){
 const r=source.find(r=>r.date===d[0]&&r.event===event);assert.ok(r);
 assert.equal(d[offset],instant(r.standard_local));assert.equal(d[offset+1],r.status==='ok'?instant(r.weather_adjusted_local):null);
 assert.equal(d[offset+2],{pending:0,ok:1,unavailable:2}[r.status]);
}checks++;
function expectedValues(list){return [1,4].flatMap(i=>{const deltas=list.filter(d=>d[i+2]===1).map(d=>d[i+1]-d[i]);return [Math.min(...deltas.filter(n=>n<0)),Math.max(...deltas.filter(n=>n>0))];});}
function expectedCoverage(list){const c={ok:0,pending:0,unavailable:0};for(const d of list)for(const i of [3,6])c[d[i]===1?'ok':d[i]===2?'unavailable':'pending']++;return `${c.ok.toLocaleString('en-US')} of ${(list.length*2).toLocaleString('en-US')} times calculated · ${c.pending.toLocaleString('en-US')} awaiting data · ${c.unavailable} unavailable`;}

eq(data.days[0][0],'2021-11-17');eq(data.days.at(-1)[0],'2026-11-16');
eq(new Set(data.days.map(d=>d[0])).size,1826);
for(const d of data.days){
 for(const i of [1,4]){
  if(d[i+2]===1)assert.ok(Number.isFinite(d[i+1]));else assert.equal(d[i+1],null);
 }
}
checks++;
ok(!html.includes('\u2014'),'No em dash in the page');
const browser=await launch(),errors=[],weatherRequests=[];
const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true});
await context.route('**/api.open-meteo.com/**',r=>{weatherRequests.push(r.request().url());return r.abort();});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const normalize=s=>s.replace(/[\u00a0\u202f]/g,' ');
async function pick(date){await page.fill('#inspectDate',date);await page.locator('#inspectDate').dispatchEvent('change');}
async function values(){return page.locator('.extreme').evaluateAll(ns=>ns.map(n=>Number(n.dataset.value)));}
try{
 await page.goto(`${BASE}/sunset-weather/history/`,{waitUntil:'networkidle'});
 eq(await values(),expectedValues(data.days));
 if(data.counts.pending){eq(await page.locator('#studyStatus').textContent(),'Five-year study in progress');ok((await page.locator('#studyMessage').textContent()).includes('provisional'));}
 ok((await page.locator('#updateStatus').textContent()).includes('Last checked'));
 await page.locator('.gap-info summary').click();
 ok((await page.locator('.gap-info').textContent()).includes('300,000 per month'));
 ok((await page.locator('#retryStatus').textContent()).includes('Next scheduled check'));
 await page.locator('.gap-info summary').click();

 eq(await page.locator('#coverage').textContent(),expectedCoverage(data.days));
 await pick('2026-02-03');
 eq(normalize(await page.locator('#riseRegular').textContent()),'7:03:28 AM');
 eq(normalize(await page.locator('#riseWeather').textContent()),'7:02:09 AM');
 eq(await page.locator('#riseShift').textContent(),'1 min 19 sec earlier');
 await page.selectOption('#year','2022');await page.locator('#setLater').click();
 eq(await page.inputValue('#inspectDate'),'2022-02-03');
 eq(normalize(await page.locator('#setRegular').textContent()),'5:18:21 PM');
 eq(normalize(await page.locator('#setWeather').textContent()),'5:19:33 PM');
 eq(await page.locator('#setShift').textContent(),'1 min 12 sec later');

 await page.selectOption('#year','2022');
 eq(await page.locator('#coverage').textContent(),'728 of 730 times calculated · 0 awaiting data · 2 unavailable');
 eq(await page.locator('#chart [data-series="rise"]').getAttribute('data-samples'),'364');
 eq(await page.locator('#chart [data-series="set"]').getAttribute('data-samples'),'364');
 eq((await page.locator('#chart [data-series="rise"]').getAttribute('d')).match(/M/g).length,2);
 eq((await page.locator('#chart [data-series="set"]').getAttribute('d')).match(/M/g).length,2);
 await pick('2022-12-16');
 eq(await page.locator('#riseShift').textContent(),'Model unavailable');
 eq(await page.locator('#riseWeather').textContent(),'Not available');
 ok((await page.locator('#riseNote').textContent()).includes('bent back toward the ground'));
 await pick('2022-11-27');eq(await page.locator('#setShift').textContent(),'Model unavailable');
 await page.selectOption('#year','2026');eq(await values(),expectedValues(data.days.filter(d=>d[0].startsWith('2026'))));
 await page.locator('#showRise').uncheck();eq(await page.locator('#chart [data-series="rise"]').count(),0);
 await page.locator('#showSet').click();eq(await page.locator('#showSet').isChecked(),true);
 ok((await page.locator('#controlStatus').textContent()).includes('at least one'));
 await page.locator('#riseEarlier').click();eq(await page.locator('#showRise').isChecked(),true);

 const zero=data.days.find(d=>d[3]===1&&d[1]===d[2]);ok(zero,'The study has a real zero shift');
 await pick(zero[0]);eq(await page.locator('#riseShift').textContent(),'Same as regular time');
 eq(await page.inputValue('#year'),zero[0].slice(0,4));
 await page.selectOption('#year','all');await pick(data.startDate);
 eq(await page.locator('#previous').isDisabled(),true);
 await page.locator('#next').click();eq(await page.inputValue('#inspectDate'),'2021-11-18');
 await page.locator('#chart').focus();await page.keyboard.press('ArrowRight');eq(await page.inputValue('#inspectDate'),'2021-11-19');
 await page.keyboard.press('End');eq(await page.inputValue('#inspectDate'),data.endDate);
 eq(await page.locator('#next').isDisabled(),true);
 const last=data.days.at(-1);if(last[3]===0)eq(await page.locator('#riseShift').textContent(),'Awaiting weather data');else if(last[3]===2)eq(await page.locator('#riseShift').textContent(),'Model unavailable');else eq(normalize(await page.locator('#riseWeather').textContent()),new Intl.DateTimeFormat('en-US',{timeZone:data.timeZone,hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date(last[2]*1000)).replace(/[\u00a0\u202f]/g,' '));
 await page.keyboard.press('Home');eq(await page.inputValue('#inspectDate'),data.startDate);
 await page.selectOption('#year','2022');await pick('2022-01-01');
 await page.locator('#chart').scrollIntoViewIfNeeded();
 const box=await page.locator('#chart').boundingBox();await page.touchscreen.tap(box.x+box.width*.55,box.y+box.height*.5);
 ok((await page.inputValue('#inspectDate')).startsWith('2022-'));
 ok((await page.inputValue('#inspectDate'))!=='2022-01-01','Touch selects a day on the graph');
 eq(await page.locator('#controlStatus').textContent(),'');
 eq(await page.locator('#chart').evaluate(n=>getComputedStyle(n).touchAction),'pan-y');

 await page.selectOption('#year','all');
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(80);
  eq(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  eq(await page.locator('.extreme').evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);
  eq(await page.locator('#chart').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('text')].some(t=>{const b=t.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1;});}),false);
  await page.screenshot({path:`history-${width}.png`,fullPage:true});
 }
 await page.selectOption('#year','2021');
 ok(await page.locator('#chart text').evaluateAll(ns=>ns.some(n=>n.textContent==='Nov 17')),'The partial starting year has date ticks');
 eq(await page.locator('#chart').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('text')].some(t=>{const b=t.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1;});}),false);
 const download=await context.request.get(`${BASE}/sunset-weather/history/lakewood-comparison.csv`);
 eq(download.status(),200);eq((await download.text()).trim().split('\n').length,3653);
 eq(weatherRequests,[]);

 // Keep empty-year and missing-value UI covered even when the real study finishes.
 const empty=structuredClone(data);for(const d of empty.days)if(d[0].startsWith('2024')){d[2]=null;d[3]=0;d[5]=null;d[6]=0;}
 const handler=r=>r.fulfill({status:200,contentType:'text/html',body:html.replace(/(<script type="application\/json" id="historyData">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(empty)+b)});
 await page.route('**/sunset-weather/history/',handler);await page.reload({waitUntil:'networkidle'});
 await page.selectOption('#year','2024');eq(await page.locator('#coverage').textContent(),'0 of 732 times calculated · 732 awaiting data · 0 unavailable');
 eq(await page.locator('.extreme:disabled').count(),4);eq(await page.locator('#noData').isVisible(),true);eq(await page.locator('#chart [data-series="rise"]').getAttribute('d'),'');
 await pick('2024-06-15');eq(await page.locator('#riseShift').textContent(),'Awaiting weather data');eq(await page.locator('#setShift').textContent(),'Awaiting weather data');
 ok((await page.locator('#riseNote').textContent()).includes('automatically'));
 await page.unroute('**/sunset-weather/history/',handler);
 await page.setViewportSize({width:375,height:667});
 await page.goto(`${BASE}/`,{waitUntil:'networkidle'});
 const home=page.frameLocator('#shellFrame');await home.locator('.tab[data-page="1"]').click();
 await home.locator('a.tool[href="/sunset-weather/"]').click();await page.waitForURL(`${BASE}/sunset-weather/`);
 const calculator=page.frameLocator('#shellFrame');
 await calculator.locator('a[href="/sunset-weather/history/"]').click();await page.waitForURL(`${BASE}/sunset-weather/history/`);
 const history=page.frameLocator('#shellFrame');eq(await history.locator('#riseEarlier').getAttribute('data-value'),String(expectedValues(data.days)[0]));
 eq(await history.locator('body').evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
 await page.goBack();await page.waitForURL(`${BASE}/sunset-weather/`);
 await page.goForward();await page.waitForURL(`${BASE}/sunset-weather/history/`);
 eq(await page.locator('#shellFrame').count(),1);
 eq(errors,[]);eq(weatherRequests,[]);
 console.log(`${checks} weather-history data, gaps, controls, touch, keyboard, viewport and portal checks passed.`);
}finally{await context.close();await browser.close();}
