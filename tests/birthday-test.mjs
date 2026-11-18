import assert from 'node:assert/strict';
import {launch,BASE} from './pw.mjs';
const browser=await launch(),errors=[];
const ctx=await browser.newContext({viewport:{width:393,height:852},timezoneId:'America/New_York'}),page=await ctx.newPage();
await page.clock.install({time:new Date('2026-11-18T14:59:00Z')});
await page.clock.pauseAt(new Date('2026-11-18T15:00:00Z'));
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const card=name=>page.locator('.birthday').filter({has:page.getByRole('heading',{name,exact:true})});
const managed=name=>page.locator('.managed-birthday').filter({has:page.getByRole('heading',{name,exact:true})});
async function setup(){if(!await page.locator('#settings').evaluate(n=>n.open))await page.locator('#addAnother').click();}
async function fresh(){await setup();if(await page.locator('#newBirthday').isVisible())await page.locator('#newBirthday').click();}
async function edit(name){await setup();await managed(name).getByRole('button',{name:'Edit '+name,exact:true}).click();}
async function add(name,month,day,{calendar='english',year=''}={}){
 await fresh();await page.fill('#name',name);await page.check(`input[name="calendar"][value="${calendar}"]`);await page.selectOption('#month',String(month));await page.selectOption('#day',String(day));if(year)await page.fill('#year',String(year));await page.locator('#saveBirthday').click();
 eq(await page.locator('#formError').isVisible(),false);eq(await page.locator('#settings').isVisible(),false);
}
async function time(iso){await page.clock.setSystemTime(new Date(iso));await page.clock.runFor(1001);}
try{
 await page.goto(`${BASE}/birthday/`,{waitUntil:'networkidle'});
 eq(await page.locator('#empty').isVisible(),true);eq(await page.locator('#settings').isVisible(),false);eq(await page.locator('#name').isVisible(),false);
 await page.locator('#firstBirthday').click();eq(await page.locator('#name').isVisible(),true);
 await page.locator('#saveBirthday').click();ok((await page.locator('#formError').textContent()).includes('name'));
 await add('Miriam',11,19,{year:2010});eq(await card('Miriam').getAttribute('data-hours'),'14');eq(await card('Miriam').locator('[data-unit=month],[data-unit=day]').count(),0);
 await setup();ok((await managed('Miriam').textContent()).includes('Turns 16'));await page.keyboard.press('Escape');eq(await page.locator('#settings').isVisible(),false);
 await add('Dovid',9,8,{calendar:'hebrew',year:5756});ok((await card('Dovid').textContent()).includes('Happy birthday!'));eq(await page.locator('.birthday h3').first().textContent(),'Dovid');
 await setup();ok((await managed('Dovid').textContent()).includes('Begins at sunset Nov 17'));
 await add('Chana',12,14,{calendar:'hebrew'});await setup();ok((await managed('Chana').textContent()).includes('Adar II'));
 await edit('Chana');eq(await page.locator('#year').inputValue(),'');await page.selectOption('#adar','first');await page.fill('#name','Chana Leah');await page.locator('#saveBirthday').click();
 await setup();ok((await managed('Chana Leah').textContent()).includes('Adar I'));await page.locator('#closeSettings').click();
 await page.reload({waitUntil:'networkidle'});eq(await page.locator('.birthday').count(),3);eq(await page.locator('#settings').isVisible(),false);eq(await card('Miriam').getAttribute('data-hours'),'14');
 await setup();await managed('Miriam').getByRole('button',{name:'Delete Miriam',exact:true}).click();eq(await card('Miriam').count(),1);await managed('Miriam').getByRole('button',{name:'Confirm delete',exact:true}).click();eq(await card('Miriam').count(),0);await page.locator('#undo').click();eq(await card('Miriam').count(),1);
 await edit('Dovid');await page.fill('#name','Do not save');await page.locator('#cancelEdit').click();eq(await card('Dovid').count(),1);
 await add('<img src=x onerror=alert(1)>',2,29,{year:2000});eq(await page.locator('.birthday img').count(),0);await setup();ok((await managed('<img src=x onerror=alert(1)>').textContent()).includes('February 28'));
 await edit('<img src=x onerror=alert(1)>');await page.selectOption('#february','mar1');await page.locator('#saveBirthday').click();await setup();ok((await managed('<img src=x onerror=alert(1)>').textContent()).includes('March 1'));
 await fresh();await page.fill('#name','Invalid leap day');await page.selectOption('#month','2');await page.selectOption('#day','29');await page.fill('#year','2023');await page.locator('#saveBirthday').click();ok((await page.locator('#formError').textContent()).includes('does not exist'));eq(await page.locator('.birthday').count(),4);
 await page.check('input[value="hebrew"]');await page.selectOption('#month','13');await page.selectOption('#day','10');await page.fill('#year','5786');await page.locator('#saveBirthday').click();ok((await page.locator('#formError').textContent()).includes('does not exist'));
 await add('December birthday',12,20);eq(await card('December birthday').getAttribute('data-months'),'1');eq(await card('December birthday').locator('[data-unit=month]').count(),1);eq(await card('December birthday').locator('[data-unit=hour],[data-unit=minute],[data-unit=second]').count(),3);
 await fresh();await page.fill('#name','Typing stays put');await page.fill('#year','200');await page.clock.runFor(30000);eq(await page.locator('#year').inputValue(),'200');eq(await page.locator('#name').inputValue(),'Typing stays put');
 // Midnight and the month boundary both update while the setup form is focused.
 await time('2026-11-19T05:00:00Z');ok((await card('Miriam').textContent()).includes('Happy birthday!'));eq(await page.locator('#year').inputValue(),'200');
 await time('2026-11-20T05:00:00Z');eq(await card('December birthday').getAttribute('data-months'),'0');eq(await card('December birthday').locator('[data-unit=month]').count(),0);eq(await card('December birthday').locator('[data-unit=hour],[data-unit=minute]').count(),2);
 await time('2026-12-20T04:54:00Z');eq(await card('December birthday').locator('.time-unit').count(),3);eq(await card('December birthday').locator('[data-unit=minute] .time-number').textContent(),'05');
 await time('2026-12-20T04:59:30Z');eq(await card('December birthday').locator('[data-unit=second] .time-number').textContent(),'29');
 await time('2026-12-20T05:00:00Z');ok((await card('December birthday').textContent()).includes('Happy birthday!'));eq(await page.locator('#name').inputValue(),'Typing stays put');
 await time('2026-11-18T15:00:00Z');
 eq(await page.locator('.birthday .birth-date,.birthday .card-actions,.birthday .age,.birthday .next-date').count(),0);
 eq(await page.locator('.birthday').first().evaluate(n=>[...n.children].map(c=>c.tagName)),['DIV','DIV','BUTTON']);
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await page.setViewportSize({width,height});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  eq(await page.locator('.birthday').evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);
  eq(await page.locator('.date-fields').evaluate(n=>{const b=n.getBoundingClientRect();return [...n.querySelectorAll('input,select')].some(c=>{const r=c.getBoundingClientRect();return r.left<b.left-1||r.right>b.right+1;});}),false);
  eq(await page.locator('#settings').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1&&n.scrollWidth<=n.clientWidth;}),true);
  await page.screenshot({path:`birthday-setup-${width}.png`,fullPage:true});await page.locator('#closeSettings').click();eq(await page.locator('#name').isVisible(),false);
  await page.screenshot({path:`birthday-${width}.png`,fullPage:true});await setup();
 }
 eq(JSON.parse(await page.evaluate(()=>localStorage.getItem('cjBirthdayCountdownsV1'))).birthdays.length,5);
 const other=await ctx.newPage();await other.goto(`${BASE}/birthday/`,{waitUntil:'networkidle'});await other.evaluate(()=>{const d=JSON.parse(localStorage.getItem('cjBirthdayCountdownsV1'));d.birthdays[0].name='Updated in other tab';localStorage.setItem('cjBirthdayCountdownsV1',JSON.stringify(d));});await page.waitForFunction(()=>document.getElementById('countdowns').textContent.includes('Updated in other tab'));eq(await page.locator('#year').inputValue(),'200');await other.close();
 await page.setViewportSize({width:375,height:667});await page.goto(`${BASE}/`,{waitUntil:'networkidle'});const home=page.frameLocator('#shellFrame');await home.locator('.tab[data-page="1"]').click();eq(await home.locator('.hidden-tool:visible').count(),0);await home.locator('a.tool[href="/birthday/"]').click();await page.waitForURL(`${BASE}/birthday/`);
 const tool=page.frameLocator('#shellFrame');eq(await tool.locator('.birthday').count(),5);eq(await tool.locator('body').evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);eq(await tool.locator('#settings').isVisible(),false);
 await tool.locator('#addAnother').click();eq(await tool.locator('#settings').isVisible(),true);eq(await tool.locator('#settings').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight+1),true);await tool.locator('#closeSettings').click();
 await page.goBack();await page.waitForURL(`${BASE}/`);await page.goForward();await page.waitForURL(`${BASE}/birthday/`);eq(await page.locator('#shellFrame').count(),1);
 // A storage failure remains visible in setup instead of closing as if saved.
 const failed=await browser.newContext(),failurePage=await failed.newPage();
 await failurePage.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('Saving unavailable');};});
 await failurePage.goto(`${BASE}/birthday/`,{waitUntil:'networkidle'});await failurePage.locator('#firstBirthday').click();await failurePage.fill('#name','Temporary birthday');await failurePage.selectOption('#month','12');await failurePage.selectOption('#day','25');await failurePage.locator('#saveBirthday').click();
 eq(await failurePage.locator('#settings').isVisible(),true);ok((await failurePage.locator('#noticeText').textContent()).includes('saving is unavailable'));eq(await failurePage.locator('.birthday').count(),1);await failed.close();
 eq(errors,[]);console.log(`${checks} birthday setup, live units, storage, rollover, mobile and portal checks passed.`);
}finally{await ctx.close();await browser.close();}
