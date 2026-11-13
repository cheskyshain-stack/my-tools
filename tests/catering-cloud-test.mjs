import assert from 'node:assert/strict';
import {launch} from './pw.mjs';
import {startCloudServer} from './catering-cloud-server.mjs';
import {USERS,COMPANIES} from './catering-db.mjs';

const server=await startCloudServer();
const browser=await launch({headless:true,args:['--no-sandbox']});let checks=0;const errors=[];
const check=(v,message)=>{assert.ok(v,message);checks++;};
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const nav=(p,view)=>p.locator(`[data-view="${view}"]`).first().click();
async function client(user,width=393){const c=await browser.newContext({viewport:{width,height:852}});await c.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(server.url+'/catering/');await p.locator('#cloud-login-form [name=email]').fill(user.email);await p.locator('#cloud-login-form [name=password]').fill('test-password');await button(p,'Sign in').click();if(user!==USERS.pending)await p.locator('.navigation').waitFor({state:'visible'});else await p.getByRole('heading',{name:'Request company access'}).waitFor();return {c,p};}
async function synced(p){await p.waitForFunction(()=>cloud.company&&!cloud.busy&&!cloud.error&&!cloud.conflicts.length&&!unsynced(),{},{timeout:20000});}
async function forceSync(p){await p.evaluate(()=>syncCompany({force:true}));await synced(p);}
async function addCustomer(p,name){await nav(p,'customers');await button(p,'+ Add customer').click();await p.locator('#customer-form [name=name]').fill(name);await button(p,'Save customer').click();await p.locator('#editor').waitFor({state:'hidden'});}
async function editCustomer(p,name,newName){await nav(p,'customers');await p.locator('#customer-search').fill(name);await button(p,'Edit').click();await p.locator('#customer-form [name=name]').fill(newName);await button(p,'Save customer').click();await p.locator('#editor').waitFor({state:'hidden'});}
try{
 const owner=await client(USERS.owner,1280),alice=await client(USERS.alice),bob=await client(USERS.bob),viewer=await client(USERS.viewer),pending=await client(USERS.pending);
 await Promise.all([synced(owner.p),synced(alice.p),synced(bob.p),synced(viewer.p)]);
 check((await alice.p.locator('#company-bar').innerText()).includes('Company A'),'A user opens their approved company.');
 check((await bob.p.locator('#company-bar').innerText()).includes('Company B'),'Another company has a separate workspace.');
 check(await pending.p.locator('.navigation').isHidden(),'Unapproved users cannot open company records.');
 await addCustomer(alice.p,'Shared Family');await synced(alice.p);await forceSync(owner.p);await nav(owner.p,'customers');
 check((await owner.p.locator('#customer-results').innerText()).includes('Shared Family'),'A new customer synchronizes to another device.');
 await nav(bob.p,'customers');check(!(await bob.p.locator('#customer-results').innerText()).includes('Shared Family'),'Other companies never receive that customer.');
 await nav(viewer.p,'customers');await button(viewer.p,'+ Add customer').click();await viewer.p.locator('#customer-form [name=name]').fill('Forbidden customer');await button(viewer.p,'Save customer').click();
 check((await viewer.p.locator('#toast').innerText()).includes('read-only'),'Read-only users cannot save a mutation.');
 await button(viewer.p,'Cancel').click();
 check(!(await viewer.p.evaluate(()=>state.customers)).some(c=>c.name==='Forbidden customer'),'A viewer’s attempted save does not modify the device copy.');

 const shoppingPhone=await client(USERS.alice);
 await nav(shoppingPhone.p,'shopping');await nav(alice.p,'shopping');await button(alice.p,'All open bookings').click();await synced(alice.p);await forceSync(shoppingPhone.p);
 check(await shoppingPhone.p.locator('[data-shopping-booking="booking-test"]').isChecked(),'The same login can prepare its shopping selection on one device and open it on another.');
 await shoppingPhone.p.locator('.shopping-table input[data-shopping-check]').first().check();await synced(shoppingPhone.p);await forceSync(alice.p);
 check(await alice.p.locator('.shopping-table input[data-shopping-check]').first().isChecked(),'Shopping checkmarks synchronize between devices after the company save.');
 check((await alice.p.evaluate(()=>state.movements)).length===1,'Shared shopping checkmarks do not post stock receipts or issues.');
 await shoppingPhone.c.close();

 await alice.p.waitForFunction(()=>navigator.serviceWorker.controller&&offlineReady);
 await alice.c.setOffline(true);await addCustomer(alice.p,'Offline Family');
 check((await alice.p.locator('#company-bar').innerText()).includes('Changes queued'),'Offline changes are labeled as waiting for sync.');
 await nav(owner.p,'customers');await owner.p.locator('#customer-search').fill('Company A customer');await button(owner.p,'Edit').click();await owner.p.locator('#customer-form [name=phone]').fill('555-0123');await button(owner.p,'Save customer').click();await synced(owner.p);
 await alice.c.setOffline(false);await forceSync(alice.p);await forceSync(owner.p);
 const merged=await alice.p.evaluate(()=>state.customers);
 check(merged.some(c=>c.name==='Offline Family')&&merged.find(c=>c.id==='customer-test').phone==='555-0123','Three-way sync preserves an offline addition and a different device’s contact edit.');

 await alice.c.setOffline(true);await editCustomer(alice.p,'Shared Family','Local Family');
 await editCustomer(owner.p,'Shared Family','Remote Family');await synced(owner.p);
 await alice.c.setOffline(false);await alice.p.evaluate(()=>syncCompany({force:true}));
 await alice.p.waitForFunction(()=>cloud.conflicts.length>0);
 await nav(alice.p,'account');await button(alice.p,'Review conflicting changes').click();
 const radios=alice.p.locator('#cloud-conflict-form input[value=local]');for(let n=0;n<await radios.count();n++)await radios.nth(n).check();
 await button(alice.p,'Apply choices and sync').click();await synced(alice.p);await forceSync(owner.p);await nav(owner.p,'customers');await owner.p.locator('#customer-search').fill('Local Family');
 check((await owner.p.locator('#customer-results').innerText()).includes('Local Family'),'Conflicting edits are resolved explicitly and shared.');

 await pending.p.locator('#cloud-access-form [name=companyName]').fill('Third Caterer');await button(pending.p,'Submit access request').click();
 await nav(owner.p,'account');await button(owner.p,'Refresh requests').click();await owner.p.locator('#cloud-admin-content').getByText('Third Caterer',{exact:true}).waitFor();await owner.p.locator('#cloud-admin-content [data-action=cloud-review-request]').click();
 await button(owner.p,'Approve access').click();await owner.p.locator('#editor').waitFor({state:'hidden'});await button(pending.p,'Check approval').click();await pending.p.locator('.navigation').waitFor({state:'visible'});await synced(pending.p);
 check((await pending.p.locator('#company-bar').innerText()).includes('Third Caterer'),'Administrator approval activates a new company for its user.');
 check(!(await pending.p.evaluate(()=>state.customers)).some(c=>c.name==='Local Family'),'Newly approved companies start with isolated records.');

 // A booking is available offline after a fresh page is opened, not just while
 // an already loaded DOM happens to remain on screen.
 await alice.p.waitForFunction(()=>offlineReady);await alice.c.setOffline(true);const reopened=await alice.c.newPage();reopened.on('pageerror',e=>errors.push(e.message));await reopened.goto(server.url+'/catering/?cloud-offline=1');
 await reopened.locator('.navigation').waitFor({state:'visible'});
 check((await reopened.locator('#company-bar').innerText()).includes('Company A'),'An approved company can reopen its saved workspace offline.');
 await nav(reopened,'bookings');await reopened.locator('[data-action=open-event]').first().click();await button(reopened,'Issue stock').click();
 check((await reopened.locator('#toast').innerText()).includes('Connect to confirm shared stock'),'Offline users can plan but cannot confirm shared dispatch against stale inventory.');
 await reopened.close();await alice.c.setOffline(false);

 await nav(alice.p,'account');
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){await alice.p.setViewportSize({width,height});const size=await alice.p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,header:[...document.querySelector('.cj-page-header').children].every(e=>e.getBoundingClientRect().right<=innerWidth+1)}));check(size.overflow===0&&size.header,`${width}px company/account controls fit the viewport.`);}
 await nav(owner.p,'account');
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){await owner.p.setViewportSize({width,height});await owner.p.locator('#cloud-admin-content').getByText('Approved companies',{exact:true}).waitFor();check(await owner.p.evaluate(()=>document.documentElement.scrollWidth===innerWidth),`${width}px owner approval controls fit the viewport.`);}
 await forceSync(alice.p);await button(alice.p,'Sign out').click();await alice.p.locator('#cloud-login-form').waitFor();
 check(await alice.p.evaluate(uid=>!Object.keys(localStorage).some(k=>k.startsWith('cjCateringCompanyV2:'+uid+':')),USERS.alice.id),'Sign-out removes the account’s cached company records from the device.');
 check(errors.length===0,'No JavaScript errors: '+errors.join('\n'));
 console.log(`${checks} two-device company, approval, offline, and conflict checks passed.`);
 for(const c of [owner.c,alice.c,bob.c,viewer.c,pending.c])await c.close();
}finally{await browser.close();await server.close();}
