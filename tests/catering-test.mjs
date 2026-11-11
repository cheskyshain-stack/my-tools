import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {launch, BASE} from './pw.mjs';

const browser=await launch({headless:true,args:['--no-sandbox']});
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const errors=[];
async function context(viewport={width:1280,height:900}){
 const ctx=await browser.newContext({viewport,colorScheme:'dark'});
 // Font availability is unrelated to local records, arithmetic, or offline caching.
 await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 ctx.on('page',page=>{
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)\.com|favicon\.ico/.test(m.location().url||''))errors.push(m.text());});
 });
 return ctx;
}
const go=async(p,view)=>p.locator(`[data-view="${view}"]`).click();
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const stored=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cjCateringV1')));
const supply=(p,name)=>p.locator('.supply-table tbody tr').filter({has:p.locator('.item-name strong').getByText(name,{exact:true})});
async function create(p,{kind='kiddush',name='Sample Customer',existing=false,regular=12,kids=0,head=0,coffee=0,adults=0,children=0,neighborhood=''}={}){
 await go(p,'bookings');await button(p,'+ New booking').click();
 const f=p.locator('#event-form');
 if(existing)await f.locator('[name=customer]').selectOption({label:name});
 else{await f.locator('[name=customer]').selectOption('new');await f.locator('[name=customerName]').fill(name);}
 await f.locator('[name=kind]').selectOption(kind);
 await f.locator('[name=date]').fill('2026-12-05');
 for(const [key,value] of Object.entries({regular,kids,head,coffee,adults,children}))await f.locator(`[name=${key}]`).fill(String(value));
 await f.locator('[name=neighborhood]').fill(neighborhood);
 await button(p,'Create booking').click();
 await p.locator('.supply-table').waitFor();
 return (await stored(p)).events.at(-1).id;
}
async function reopen(p,id){await go(p,'bookings');await p.locator(`[data-action=open-event][data-id="${id}"]`).click();}
async function fits(p,label){const box=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,dialog:document.querySelector('dialog[open]')?document.querySelector('dialog[open]').scrollWidth-document.querySelector('dialog[open]').clientWidth:0,header:[...document.querySelector('.cj-page-header').children].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})}));check(box.overflow===0&&box.dialog===0&&box.header,`${label}: no horizontal overflow and header fits. ${JSON.stringify(box)}`);}
async function addItem(p,name,basis,rate,packSize,price){await button(p,'+ Add item').click();const f=p.locator('#item-form');await f.locator('[name=name]').fill(name);await f.locator('[name=basis]').selectOption(basis);await f.locator('[name=rate]').fill(String(rate));await f.locator('[name=packSize]').fill(String(packSize));await f.locator('[name=price]').fill(String(price));await button(p,'Save item').click();}

try{
 const ctx=await context();const p=await ctx.newPage();
 await p.goto(BASE+'/catering/');
 check((await p.locator('.empty').innerText()).includes('Your next simcha starts here'),'A fresh install starts with no customer records.');
 check(await p.title()==='Catering Planner | CJ Portal','The app has its own title.');
 const unsafe='<img src=x onerror=alert(1)>';
 const first=await create(p,{name:unsafe});
 check(await p.locator('#main img').count()===0,'Customer content is escaped.');
 let row=supply(p,'Forks');
 check(await row.locator('.needed-cell strong').innerText()==='180','12 dining tables need 180 forks.');
 check((await row.locator('.buy-cell').innerText()).includes('4 packs × 50'),'180 forks round up to four packs of 50.');
 check(await row.locator('.cost-cell').innerText()==='$7.16','Four fork packs cost $7.16.');
 check((await supply(p,'7-inch plates').locator('.buy-cell').innerText()).includes('5 packs × 40'),'180 plates round up to five packs of 40.');
 check((await supply(p,'Cups').locator('.buy-cell').innerText()).includes('9 packs × 20'),'180 cups require nine packs.');
 await row.locator('input[type=checkbox]').check();
 await p.reload();await p.locator(`[data-action=open-event][data-id="${first}"]`).click();
 check(await supply(p,'Forks').locator('input').isChecked(),'Packing survives a reload.');

 await go(p,'templates');
 await p.locator('[data-action=edit-item][data-id=k-forks]').click();
 await p.locator('[name=rate]').fill('20');await p.locator('[name=price]').fill('2.25');await button(p,'Save item').click();
 await addItem(p,'Coffee cups','coffee',20,20,1);
 await addItem(p,'Service fee','event',1,1,150);
 await addItem(p,'Kids plates','kids',10,40,2);
 await addItem(p,'Adult bagels','adults',.5,1,1);
 await reopen(p,first);
 check(await supply(p,'Forks').locator('.needed-cell strong').innerText()==='180','Template edits preserve past booking quantities.');
 check(await supply(p,'Forks').locator('.cost-cell').innerText()==='$7.16','Template edits preserve past booking prices.');
 check(await supply(p,'Forks').locator('input').isChecked(),'Editing a template does not clear past packing progress.');
 check(await supply(p,'Service fee').count()===0,'New template items do not silently appear in existing bookings.');

 await go(p,'neighborhoods');await button(p,'+ Add neighborhood').click();
 await p.locator('#area-form [name=name]').fill('North Lakewood');
 await p.locator('#area-form [name=notes]').fill('Bring extra soda. Confirm portions with the host.');
 await button(p,'+ Add adjustment').click();await p.locator('[data-area-item]').selectOption('k-soda');await p.locator('[data-area-rate]').fill('2');
 await button(p,'+ Add adjustment').click();await p.locator('[data-area-item]').last().selectOption('k-herring');await p.locator('[data-area-rate]').last().fill('.5');
 await button(p,'Save neighborhood').click();
 const second=await create(p,{name:'Regular Customer',regular:10,kids:2,head:1,coffee:1,adults:100,children:20,neighborhood:'North Lakewood'});
 check(await supply(p,'Forks').locator('.needed-cell strong').innerText()==='260','Regular, kids, and head tables all count as dining tables; coffee is separate.');
 check(await supply(p,'Forks').locator('.cost-cell').innerText()==='$13.50','New bookings use the updated template rate and price.');
 check(await supply(p,'Coffee cups').locator('.needed-cell strong').innerText()==='20','Coffee supplies use coffee stations only.');
 check(await supply(p,'Kids plates').locator('.needed-cell strong').innerText()==='20','Kids supplies use kids tables only.');
 check(await supply(p,'Adult bagels').locator('.needed-cell strong').innerText()==='50','Per-adult supplies use the explicit adult count.');
 check(await supply(p,'Service fee').locator('.cost-cell').innerText()==='$150.00','Fixed event charges apply once.');
 check(await supply(p,'Soda').locator('.needed-cell strong').innerText()==='26','Neighborhood adjustments override the standard rate.');
 check(await supply(p,'Herring (2 lb)').locator('.needed-cell strong').innerText()==='6.5','Fractional portions are retained in demand.');
 check((await supply(p,'Herring (2 lb)').locator('.buy-cell').innerText()).startsWith('7 '),'Fractional demand rounds up for purchasing.');
 check((await p.locator('#event-content').innerText()).includes('Bring extra soda'),'Neighborhood notes are visible when packing.');

 await supply(p,'Forks').getByRole('button',{name:'Adjust',exact:true}).click();
 await p.locator('#override-form [name=needed]').fill('80');await button(p,'Save adjustment').click();
 check(await supply(p,'Forks').locator('.cost-cell').innerText()==='$4.50','A booking override recalculates whole packs and costs.');
 await supply(p,'Forks').getByRole('button',{name:'Adjust',exact:true}).click();
 await p.locator('#override-form [name=needed]').fill('0');await button(p,'Save adjustment').click();
 check(await supply(p,'Forks').count()===0,'A zero override omits the item.');
 await p.locator('details').filter({hasText:'Items with zero quantity'}).locator('summary').click();
 await p.locator('.list-row').filter({hasText:'Forks'}).getByRole('button',{name:'Adjust',exact:true}).click();
 await button(p,'Use automatic quantity').click();
 check(await supply(p,'Forks').locator('.needed-cell strong').innerText()==='260','An omitted item can be restored without refreshing the entire booking.');

 await button(p,'Feedback').last().click();
 await p.locator('#feedback-form [name=notes]').fill('Need more cups in North Lakewood. Host liked the setup.');
 await p.locator('#feedback-form [name=outcome]').selectOption('mixed');
 await p.locator('#feedback-form details summary').click();
 await p.locator('[data-short=k-cups]').fill('5');await p.locator('[data-left=k-soda]').fill('3');
 await p.locator('#feedback-form [name=complete]').check();await button(p,'Save feedback').click();
 await go(p,'history');await p.locator('#feedback-search').fill('North Lakewood');
 check((await p.locator('#feedback-results').innerText()).includes('5 short'),'Item shortages are searchable through their event.');
 check((await p.locator('#feedback-results').innerText()).includes('3 left over'),'Leftovers are retained.');
 check((await stored(p)).templates.kiddush.find(i=>i.id==='k-cups').rate===15,'Feedback never changes the template automatically.');
 const third=await create(p,{name:'Regular Customer',existing:true,kind:'bris'});
 check((await stored(p)).customers.length===2,'Repeat bookings reuse the existing customer.');
 check(await supply(p,'Tuna bowls (1 lb)').locator('.needed-cell strong').innerText()==='12','Bris tuna multiplies by table count.');
 check(await supply(p,'Egg salad bowls (1 lb)').locator('.needed-cell strong').innerText()==='12','Bris egg salad does not multiply the previous food total.');
 check(await supply(p,'Lox (1 lb)').locator('.needed-cell strong').innerText()==='12','Bris lox does not multiply a preceding food total.');
 check((await p.locator('.summary-grid').innerText()).includes('still need a price'),'Unknown food prices remain incomplete, rather than appearing free.');
 await button(p,'Booking details').click();
 await button(p,'Mark completed').click();
 check((await p.locator('.detail-heading').innerText()).includes('Completed'),'A booking can be completed without feedback.');
 await button(p,'Reopen booking').click();

 await go(p,'customers');await p.locator('#customer-search').fill('Regular Customer');await button(p,'History').click();
 check(await p.locator('#editor .booking-card').count()===2,'Customer history shows all their bookings.');
 await p.locator(`#editor [data-id="${second}"]`).click();
 check(!await p.locator('#editor').isVisible(),'Opening an event from customer history closes the dialog.');

 // Validate actual download contents and a reviewed restore, including unrelated data.
 await p.evaluate(()=>localStorage.setItem('cjCateringUnrelatedTest','keep'));
 await go(p,'backups');
 let downloadPromise=p.waitForEvent('download');await button(p,'Download full backup').click();
 let download=await downloadPromise;const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 check(backup.app==='cj-catering'&&backup.data.events.length===3,'Downloaded JSON contains bookings and templates.');
 const beforeInvalid=await stored(p);
 await p.locator('#backup-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'cj-catering',version:1,data:{version:1}}))});
 await p.waitForTimeout(100);
 check(JSON.stringify(await stored(p))===JSON.stringify(beforeInvalid),'A malformed restore preserves all current records.');
 await go(p,'customers');await button(p,'+ Add customer').click();await p.locator('#customer-form [name=name]').fill('Temporary contact');await button(p,'Save customer').click();
 await go(p,'backups');await p.locator('#backup-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await p.locator('#editor').waitFor({state:'visible'});
 check(await p.locator('#editor').isVisible(),'Import previews its impact before replacing data.');
 downloadPromise=p.waitForEvent('download');await button(p,'Replace records with this backup').click();download=await downloadPromise;
 const beforeRestore=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 check(beforeRestore.data.customers.length===3,'Restore first downloads the current readable records.');
 check((await stored(p)).customers.length===2,'Restore replaces records with the chosen backup.');
 check(await p.evaluate(()=>localStorage.getItem('cjCateringUnrelatedTest'))==='keep','Restore preserves other tools’ browser data.');
 await reopen(p,second);downloadPromise=p.waitForEvent('download');await button(p,'Export list (CSV)').click();download=await downloadPromise;
 const csv=await fs.readFile(await download.path(),'utf8');check(csv.includes('"Forks","units","260","50","6"'),'CSV uses the same saved whole-pack supply list.');
 await p.emulateMedia({media:'print'});
 check(await p.locator('.supply-table thead').isVisible(),'The printed checklist has column headings.');
 check(!await p.locator('.navigation').isVisible(),'Print output omits navigation.');
 await p.pdf({path:'/tmp/catering-checklist.pdf',format:'Letter'});await p.emulateMedia({media:'screen'});

 // New navigation and mutations work with every request disconnected.
 await p.waitForFunction(()=>navigator.serviceWorker.controller);
 await ctx.setOffline(true);const offline=await ctx.newPage();await offline.goto(BASE+'/catering/?offline-test=1');
 await offline.waitForFunction(()=>document.querySelector('#connection-status').textContent==='Working offline');
 check((await offline.locator('#connection-status').innerText()).includes('offline'),'A new offline page loads from the service-worker cache.');
 await create(offline,{name:'Offline Customer',kind:'bris',regular:8});
 check(await supply(offline,'Bagels').locator('.needed-cell strong').innerText()==='120','Bookings and calculations work offline.');
 await offline.reload();check((await stored(offline)).customers.some(c=>c.name==='Offline Customer'),'Offline edits survive reopening.');
 await offline.close();await ctx.setOffline(false);

 // Every section and editing surface must fit an actual phone viewport.
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await p.setViewportSize({width,height});
  for(const v of ['bookings','customers','templates','neighborhoods','history','backups']){await go(p,v);await fits(p,`${width}px ${v}`);}
  await go(p,'templates');await button(p,'+ Add item').click();await fits(p,`${width}px item editor`);await button(p,'Cancel').click();
  await go(p,'neighborhoods');await button(p,'+ Add neighborhood').click();await button(p,'+ Add adjustment').click();await fits(p,`${width}px neighborhood editor`);await button(p,'Cancel').click();
  await go(p,'bookings');await button(p,'+ New booking').click();await fits(p,`${width}px booking editor`);await button(p,'Cancel').click();
  await reopen(p,second);await fits(p,`${width}px supply list`);await button(p,'Feedback').last().click();await p.locator('#feedback-form details summary').click();await fits(p,`${width}px feedback editor`);
 }
 await go(p,'bookings');
 await p.goto(BASE+'/');await p.frameLocator('#shellFrame').locator('.tab[data-page="1"]').click();
 const home=p.frameLocator('#shellFrame');
 check(await home.locator('.hidden-tool:visible').count()===0,'Personal tools remain hidden by default.');
 await home.locator('#secretLogo').click({clickCount:3});
 check(await home.locator('a[href="/catering/"]').isVisible(),'The planner is available with the other personal tools.');
 await home.locator('a[href="/catering/"]').click();await p.waitForURL(BASE+'/catering/');
 let frame=p.frames().find(f=>f!==p.mainFrame()&&f.url().includes('/catering/'));
 await fits(frame,'Portal iframe');
 const fit=await p.locator('#shellFrame').evaluate(e=>({bottom:e.getBoundingClientRect().bottom,height:visualViewport.height}));
 check(Math.abs(fit.bottom-fit.height)<1,'The portal iframe fits the visible viewport.');
 await p.goBack();await p.waitForURL(BASE+'/');await p.goForward();await p.waitForURL(BASE+'/catering/');
 check(await p.frameLocator('#shellFrame').locator('#main').isVisible(),'Portal Back and Forward restore the planner.');
 const manifest=await (await ctx.request.get(BASE+'/catering/manifest.json')).json();
 check(manifest.start_url==='/catering/'&&manifest.scope==='/catering/','Installation is scoped to this app.');
 const icon=await (await ctx.request.get(BASE+'/catering/icon.png')).body();
 check(icon.readUInt32BE(16)===512&&icon.readUInt32BE(20)===512,'The app icon is 512 by 512.');
 await ctx.close();

 const bad=await context();await bad.addInitScript(()=>{if(location.protocol==='http:'||location.protocol==='https:')localStorage.setItem('cjCateringV1','unreadable');});
 const bp=await bad.newPage();await bp.goto(BASE+'/catering/');
 check(await bp.locator('#recovery-notice').isVisible(),'Corrupt local storage is reported.');
 await button(bp,'+ New booking').click();await bp.locator('[name=customerName]').fill('Do not overwrite');await button(bp,'Create booking').click();
 check(await bp.evaluate(()=>localStorage.getItem('cjCateringV1'))==='unreadable','Unreadable records cannot be silently overwritten by a new save.');
 await bad.close();
 check(errors.length===0,`No app console errors: ${errors.join('\n')}`);
 console.log(`${checks} Catering Planner checks passed.`);
}finally{await browser.close();}
