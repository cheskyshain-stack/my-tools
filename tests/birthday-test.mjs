import assert from 'node:assert/strict';
import {launch,BASE} from './pw.mjs';
const browser=await launch(),errors=[];
const ctx=await browser.newContext({viewport:{width:393,height:852},timezoneId:'America/New_York'}),page=await ctx.newPage();
await page.clock.install({time:new Date('2026-11-18T15:00:00Z')});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
async function add(name,month,day,{calendar='english',year=''}={}){
 await page.locator('#addAnother').click();await page.fill('#name',name);await page.check(`input[name="calendar"][value="${calendar}"]`);await page.selectOption('#month',String(month));await page.selectOption('#day',String(day));if(year)await page.fill('#year',String(year));await page.locator('#saveBirthday').click();
 eq(await page.locator('#formError').isVisible(),false);
}
const card=name=>page.locator('.birthday').filter({has:page.getByRole('heading',{name,exact:true})});
try{
 await page.goto(`${BASE}/birthday/`,{waitUntil:'networkidle'});
 eq(await page.locator('#empty').isVisible(),true);ok((await page.locator('#today').textContent()).includes('8 Kislev 5787'));
 await page.locator('#saveBirthday').click();ok((await page.locator('#formError').textContent()).includes('name'));
 await add('Miriam',11,19,{year:2010});eq(await card('Miriam').getAttribute('data-days'),'1');ok((await card('Miriam').textContent()).includes('Turns 16'));
 await add('Dovid',9,8,{calendar:'hebrew',year:5756});eq(await card('Dovid').getAttribute('data-days'),'0');ok((await card('Dovid').textContent()).includes('Happy birthday!'));
 ok((await card('Dovid').textContent()).includes('Begins at sunset Nov 17'));eq(await page.locator('.birthday h3').first().textContent(),'Dovid');
 await add('Chana',12,14,{calendar:'hebrew'});ok((await card('Chana').textContent()).includes('Adar II'));
 await card('Chana').getByRole('button',{name:'Edit Chana',exact:true}).click();eq(await page.locator('#year').inputValue(),'');
 await page.selectOption('#adar','first');await page.fill('#name','Chana Leah');await page.locator('#saveBirthday').click();ok((await card('Chana Leah').textContent()).includes('Adar I'));
 eq(await page.locator('.birthday').count(),3);
 await page.reload({waitUntil:'networkidle'});eq(await page.locator('.birthday').count(),3);eq(await card('Miriam').getAttribute('data-days'),'1');
 await card('Miriam').getByRole('button',{name:'Remove Miriam',exact:true}).click();eq(await card('Miriam').count(),0);await page.locator('#undo').click();eq(await card('Miriam').count(),1);
 await card('Dovid').getByRole('button',{name:'Edit Dovid',exact:true}).click();await page.fill('#name','Do not save');await page.locator('#cancelEdit').click();eq(await card('Dovid').count(),1);
 await add('<img src=x onerror=alert(1)>',2,29,{year:2000});eq(await page.locator('.birthday img').count(),0);ok((await card('<img src=x onerror=alert(1)>').textContent()).includes('February 28'));
 await card('<img src=x onerror=alert(1)>').getByRole('button',{name:'Edit <img src=x onerror=alert(1)>',exact:true}).click();await page.selectOption('#february','mar1');await page.locator('#saveBirthday').click();ok((await card('<img src=x onerror=alert(1)>').textContent()).includes('March 1'));
 // An impossible date of birth is rejected rather than normalized to a different day.
 await page.locator('#addAnother').click();await page.fill('#name','Invalid leap day');await page.selectOption('#month','2');await page.selectOption('#day','29');await page.fill('#year','2023');await page.locator('#saveBirthday').click();ok((await page.locator('#formError').textContent()).includes('does not exist'));eq(await page.locator('.birthday').count(),4);
 await page.check('input[value="hebrew"]');await page.selectOption('#month','13');await page.selectOption('#day','10');await page.fill('#year','5786');await page.locator('#saveBirthday').click();ok((await page.locator('#formError').textContent()).includes('does not exist'));
 await page.locator('#addAnother').click();await page.fill('#name','Typing stays put');await page.fill('#year','200');await page.clock.runFor(30000);eq(await page.locator('#year').inputValue(),'200');eq(await page.locator('#name').inputValue(),'Typing stays put');
 // Midnight advances the counter without writing into the birthday being entered.
 await page.clock.setSystemTime(new Date('2026-11-19T04:59:55Z'));await page.clock.runFor(16000);eq(await card('Miriam').getAttribute('data-days'),'0');ok((await card('Miriam').textContent()).includes('Happy birthday!'));eq(await page.locator('#year').inputValue(),'200');
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await page.setViewportSize({width,height});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  eq(await page.locator('.birthday').evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);
  eq(await page.locator('.date-fields').evaluate(n=>{const b=n.getBoundingClientRect();return [...n.querySelectorAll('input,select')].some(c=>{const r=c.getBoundingClientRect();return r.left<b.left-1||r.right>b.right+1;});}),false);
  await page.screenshot({path:`birthday-${width}.png`,fullPage:true});
 }
 const saved=await page.evaluate(()=>localStorage.getItem('cjBirthdayCountdownsV1'));eq(JSON.parse(saved).birthdays.length,4);
 const other=await ctx.newPage();await other.goto(`${BASE}/birthday/`,{waitUntil:'networkidle'});await other.evaluate(()=>{const d=JSON.parse(localStorage.getItem('cjBirthdayCountdownsV1'));d.birthdays[0].name='Updated in other tab';localStorage.setItem('cjBirthdayCountdownsV1',JSON.stringify(d));});await page.waitForFunction(()=>document.getElementById('countdowns').textContent.includes('Updated in other tab'));eq(await page.locator('#year').inputValue(),'200');await other.close();
 // Direct page and portal navigation both work, with native Back/Forward preserved.
 await page.setViewportSize({width:375,height:667});await page.goto(`${BASE}/`,{waitUntil:'networkidle'});const home=page.frameLocator('#shellFrame');await home.locator('.tab[data-page="1"]').click();eq(await home.locator('.hidden-tool:visible').count(),0);await home.locator('a.tool[href="/birthday/"]').click();await page.waitForURL(`${BASE}/birthday/`);
 const tool=page.frameLocator('#shellFrame');eq(await tool.locator('.birthday').count(),4);eq(await tool.locator('body').evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
 await page.goBack();await page.waitForURL(`${BASE}/`);await page.goForward();await page.waitForURL(`${BASE}/birthday/`);eq(await page.locator('#shellFrame').count(),1);
 eq(errors,[]);console.log(`${checks} birthday form, countdown, storage, rollover, mobile and portal checks passed.`);
}finally{await ctx.close();await browser.close();}
