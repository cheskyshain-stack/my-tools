import assert from 'node:assert/strict';
import {launch,BASE} from './pw.mjs';
const browser=await launch(),errors=[];let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const key='cjBirthdayCountdownsV1';
const saved={version:1,birthdays:[
 {id:'nossi',name:'Nossi',calendar:'english',month:4,day:19,year:2010,adar:'second',february:'feb28'},
 {id:'ari',name:'Ari',calendar:'hebrew',month:9,day:8,year:5756,adar:'second',february:'feb28'},
 {id:'miriam',name:'Miriam',calendar:'english',month:11,day:19,year:null,adar:'second',february:'feb28'}
]};
const context=await browser.newContext({viewport:{width:393,height:852},timezoneId:'America/New_York'}),page=await context.newPage();
await context.addInitScript(({key,saved})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(saved));},{key,saved});
await page.clock.install({time:new Date('2026-11-18T14:59:00Z')});await page.clock.pauseAt(new Date('2026-11-18T15:00:00Z'));
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const card=name=>page.locator('.birthday').filter({has:page.getByRole('heading',{name,exact:true})});
const stored=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).birthdays,key);
const toggle=(name,calendar)=>card(name).locator(`[data-calendar="${calendar}"]`).click();
try{
 await page.goto(`${BASE}/birthday/`,{waitUntil:'networkidle'});
 // Existing V1 entries are kept and brought to their first date review once.
 eq(await page.locator('#settings').isVisible(),true);eq(await page.inputValue('#name'),'Nossi');eq(await page.inputValue('#year'),'2010');
 eq((await stored()).map(r=>[r.id,r.calendar,r.month,r.day,r.year]),saved.birthdays.map(r=>[r.id,r.calendar,r.month,r.day,r.year]));
 await page.locator('#closeSettings').click();await page.reload({waitUntil:'networkidle'});eq(await page.locator('#settings').isVisible(),false);eq(await page.locator('.birthday').count(),3);
 eq(await card('Nossi').getAttribute('data-months'),'5');eq(await card('Nossi').locator('[data-unit=day]').count(),0);
 eq(await card('Nossi').locator('.verify-date time').getAttribute('datetime'),'2027-04-19T04:00:00.000Z');
 await toggle('Nossi','hebrew');eq(await page.locator('#settings').isVisible(),true);eq(await page.inputValue('#name'),'Nossi');eq(await page.inputValue('#month'),'4');
 await page.selectOption('#birthTime','evening');ok((await page.locator('#birthDatePreview').textContent()).includes('April 19, 2010'));
 await page.locator('#saveBirthday').click();eq(await card('Nossi').getAttribute('data-calendar'),'hebrew');
 const hebrewTarget=await card('Nossi').getAttribute('data-date');ok(hebrewTarget!=='2027-04-19','The other calendar has its own annual birthday');
 let record=(await stored()).find(r=>r.id==='nossi');eq([record.calendar,record.month,record.day,record.year,record.birthTime],['english',4,19,2010,'evening']);eq(record.viewCalendar,'hebrew');
 await page.reload({waitUntil:'networkidle'});eq(await card('Nossi').getAttribute('data-date'),hebrewTarget);eq(await card('Nossi').locator('[data-calendar=hebrew]').getAttribute('aria-pressed'),'true');
 await toggle('Nossi','english');eq(await card('Nossi').getAttribute('data-date'),'2027-04-19');
 // For a known Hebrew date, an evening birth maps to the previous English day.
 await toggle('Ari','english');eq(await page.inputValue('#name'),'Ari');await page.selectOption('#birthTime','evening');
 const eveningPreview=await page.locator('#birthDatePreview').textContent();await page.locator('#saveBirthday').click();const eveningTarget=await card('Ari').getAttribute('data-date');
 await card('Ari').locator('.verify-date').click();await page.selectOption('#birthTime','afterMidnight');
 ok(await page.locator('#birthDatePreview').textContent()!==eveningPreview,'After-midnight and evening births map to different English dates');await page.locator('#saveBirthday').click();
 const morningTarget=await card('Ari').getAttribute('data-date');eq(Date.parse(morningTarget)-Date.parse(eveningTarget),86400000);
 await toggle('Ari','hebrew');eq(await card('Ari').getAttribute('data-date'),'2026-11-18');
 // A missing year is requested, rather than inventing an original date of birth.
 await toggle('Miriam','hebrew');eq(await page.locator('#settings').isVisible(),true);eq(await page.inputValue('#year'),'');
 await page.locator('#saveBirthday').click();ok((await page.locator('#formError').textContent()).includes('birth year'));eq((await stored()).find(r=>r.id==='miriam').year,null);
 await page.fill('#year','2010');await page.selectOption('#birthTime','daytime');await page.locator('#saveBirthday').click();
 eq(await card('Miriam').getAttribute('data-calendar'),'hebrew');eq((await stored()).find(r=>r.id==='miriam').calendar,'english');
 eq(await page.locator('#reviewDates').isVisible(),false);
 // Delete is only in setup and cannot change storage before confirmation.
 eq(await page.locator('.birthday').getByRole('button',{name:/Delete/}).count(),0);
 const beforeDelete=JSON.stringify(await stored());
 await page.locator('#addAnother').click();
 const managedMiriam=page.locator('.managed-birthday').filter({has:page.getByRole('heading',{name:'Miriam',exact:true})});
 await managedMiriam.getByRole('button',{name:'Delete Miriam',exact:true}).click();
 eq(await card('Miriam').count(),1);eq(JSON.stringify(await stored()),beforeDelete);
 eq(await managedMiriam.getByRole('button',{name:'Confirm delete',exact:true}).isVisible(),true);
 eq(await page.evaluate(()=>document.activeElement.textContent),'Cancel');
 await managedMiriam.getByRole('button',{name:'Cancel',exact:true}).click();eq(await page.locator('.delete-confirm').count(),0);eq(JSON.stringify(await stored()),beforeDelete);
 // Closing setup also cancels a pending request, including native Escape.
 await managedMiriam.getByRole('button',{name:'Delete Miriam',exact:true}).click();await page.keyboard.press('Escape');
 await page.locator('#addAnother').click();eq(await page.locator('.delete-confirm').count(),0);eq(JSON.stringify(await stored()),beforeDelete);
 await managedMiriam.getByRole('button',{name:'Delete Miriam',exact:true}).click();await page.locator('#closeSettings').click();
 await page.locator('#addAnother').click();eq(await page.locator('.delete-confirm').count(),0);eq(JSON.stringify(await stored()),beforeDelete);
 await managedMiriam.getByRole('button',{name:'Delete Miriam',exact:true}).click();await managedMiriam.getByRole('button',{name:'Confirm delete',exact:true}).click();
 eq(await card('Miriam').count(),0);eq(await page.locator('#undo').isVisible(),true);eq((await stored()).some(r=>r.id==='miriam'),false);
 await page.locator('#undo').click();eq(await card('Miriam').count(),1);eq(await card('Miriam').getAttribute('data-calendar'),'hebrew');
 eq(JSON.stringify((await stored()).find(r=>r.id==='miriam')),JSON.stringify(JSON.parse(beforeDelete).find(r=>r.id==='miriam')));
 await page.locator('#closeSettings').click();
 await page.locator('#addAnother').click();await page.locator('#newBirthday').click();await page.fill('#name','Soon');await page.selectOption('#month','12');await page.selectOption('#day','24');await page.fill('#year','2010');await page.selectOption('#birthTime','daytime');await page.locator('#saveBirthday').click();
 // Remainder days split into weeks; three normal rows should fit comfortably.
 await page.clock.setSystemTime(new Date('2026-12-01T15:00:00Z'));await page.clock.runFor(5001);
 const weekly=await page.locator('.birthday [data-unit=week]').count();ok(weekly>0,'The list shows weeks when a remainder contains them');
 eq(await card('Soon').locator('[data-unit=week],[data-unit=day],[data-unit=hour],[data-unit=minute]').count(),4);
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await page.setViewportSize({width,height});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  eq(await page.locator('.birthday').evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);
  if(width<500)ok(await page.locator('.birthday').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height<=125)),'Compact rows stay at most 125px tall');
  if(width<500)ok(await card('Soon').locator('.countdown-row').evaluate(n=>n.getBoundingClientRect().height<=35),'Weeks, days, hours and minutes fit in one compact row');
  await page.screenshot({path:`birthday-compact-${width}.png`,fullPage:true});
  eq(await page.locator('.birthday').getByRole('button',{name:/Delete/}).count(),0);
  await page.locator('#addAnother').click();
  const managedSoon=page.locator('.managed-birthday').filter({has:page.getByRole('heading',{name:'Soon',exact:true})});
  await managedSoon.getByRole('button',{name:'Delete Soon',exact:true}).click();
  eq(await page.locator('.delete-confirm').evaluate(n=>{const r=n.getBoundingClientRect();return n.scrollWidth<=n.clientWidth&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1;}),true);
  await page.screenshot({path:`birthday-delete-${width}.png`,fullPage:true});
  await managedSoon.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('#closeSettings').click();

 }
 await page.reload({waitUntil:'networkidle'});eq(await page.locator('.birthday').count(),4);eq(await page.locator('#settings').isVisible(),false);
 eq(errors,[]);console.log(`${checks} birthday calendar switching, original-date preservation, night review, confirmed deletion, weeks and compact-layout checks passed.`);
}finally{await context.close();await browser.close();}
