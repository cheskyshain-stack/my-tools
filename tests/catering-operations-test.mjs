import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {launch,BASE} from './pw.mjs';

const browser=await launch({headless:true,args:['--no-sandbox']});let checks=0;const errors=[],sent=[];
const check=(value,message)=>{assert.ok(value,message);checks++;};
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const nav=(p,v)=>p.locator(`[data-view="${v}"]`).first().click();
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('cjCateringV1')));
const supply=(p,name)=>p.locator('.supply-table tbody tr').filter({has:p.locator('.item-name strong').getByText(name,{exact:true})});
async function fits(p,label){const size=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,dialog:document.querySelector('dialog[open]')?document.querySelector('dialog[open]').scrollWidth-document.querySelector('dialog[open]').clientWidth:0}));check(size.overflow===0&&size.dialog===0,label+' '+JSON.stringify(size));}
async function close(p){await button(p,'Cancel').click();}
try{
 const ctx=await browser.newContext({viewport:{width:393,height:852}});await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')sent.push(r.url());});
 await p.goto(BASE+'/catering/');
 await nav(p,'suppliers');await button(p,'+ Add supplier').click();
 await p.locator('#supplier-form [name=name]').fill('Supply House');await p.locator('#supplier-form [name=email]').fill('orders@supply.test');await button(p,'Save supplier').click();
 const supplierId=(await saved(p)).suppliers[0].id;
 await nav(p,'inventory');await button(p,'+ Add inventory item').click();
 let f=p.locator('#stock-form');await f.locator('[name=name]').fill('Reusable serving trays');await f.locator('[name=unit]').fill('trays');await f.locator('[name=type]').selectOption('reusable');await f.locator('[name=packSize]').fill('2');await f.locator('[name=price]').fill('10');await f.locator('[name=opening]').fill('10');await f.locator('[name=supplierId]').selectOption(supplierId);await button(p,'Save inventory item').click();
 const stock=(await saved(p)).inventory.find(i=>i.name==='Reusable serving trays');
 check(!!stock,'An inventory item is stored with its supplier and reusable type.');
 let stockCard=p.locator('#inventory-results article').filter({hasText:'Reusable serving trays'});
 check((await stockCard.locator('.inventory-metrics').innerText()).includes('10'),'Opening counts are posted to stock on hand.');
 await stockCard.getByRole('button',{name:'Count / adjust'}).click();await p.locator('#stock-count-form [name=quantity]').fill('12');await p.locator('#stock-count-form [name=notes]').fill('Found two extra trays');await button(p,'Record stock count').click();
 check((await saved(p)).movements.filter(m=>m.inventoryId===stock.id).length===2,'Stock counts create audit movements instead of rewriting opening stock.');

 await nav(p,'templates');await p.locator('[data-action=template-kind][data-kind=kiddush]').click();
 // A minimal custom rule is enough to issue and reconcile stock without
 // requiring fictional opening counts for every food in the starter workbook.
 await button(p,'+ Add item').click();f=p.locator('#item-form');await f.locator('[name=name]').fill('Serving trays');await f.locator('[name=rate]').fill('2');await f.locator('[name=inventoryId]').selectOption(stock.id);await f.locator('[name=packSize]').fill('2');await f.locator('[name=price]').fill('10');await button(p,'Save item').click();
 const templateId=(await saved(p)).templates.kiddush.find(i=>i.name==='Serving trays').id;
 await nav(p,'bookings');await button(p,'+ New booking').click();f=p.locator('#event-form');await f.locator('[name=customerName]').fill('Inventory Family');await f.locator('[name=date]').fill('2026-12-05');await f.locator('[name=regular]').fill('2');await f.locator('[name=serviceFee]').fill('150');await f.locator('[name=waiterCount]').fill('2');await f.locator('[name=waiterRate]').fill('30');await f.locator('[name=waiterBasis]').selectOption('hour');await f.locator('[name=waiterHours]').fill('4');await f.locator('[name=waiterNames]').fill('Avi: setup\nMoshe: serving');await button(p,'Create booking').click();
 const booking=(await saved(p)).events[0];
 check(booking.fees.service===150&&booking.fees.waiterCount===2,'Service and waiter fees are stored with the booking.');
 check((await p.locator('#main').innerText()).includes('Waiters: $240.00'),'Two waiters at $30 for four hours calculate $240.');
 const totals=await p.evaluate(()=>({supply:totals(state.events[0]).cost,charge:feeTotals(state.events[0]).total}));
 check(Math.abs(totals.charge-totals.supply-390)<1e-6,'Calculated charges add service and waiter fees exactly once.');
 await button(p,'Booking details').click();check((await p.locator('#event-content').innerText()).includes('Moshe: serving'),'Waiter assignments appear in booking details.');
 await button(p,'Supply list').click();
 check(await supply(p,'Serving trays').locator('.needed-cell strong').innerText()==='4','The booking uses the linked inventory rule.');
 await nav(p,'inventory');await p.locator('#inventory-date').fill('2026-12-05');
 stockCard=p.locator('#inventory-results article').filter({hasText:'Reusable serving trays'});
 check((await stockCard.locator('.inventory-metrics').innerText()).includes('4\nReserved'),'Open bookings reserve reusable stock on the event date.');
 await p.locator('#inventory-date').fill('2026-12-06');check((await stockCard.locator('.inventory-metrics').innerText()).includes('0\nReserved'),'Non-overlapping dates do not reserve the same reusable stock.');

 // Newly added standard supplies reach an old open booking without replacing
 // existing rates, prices, packing checks or per-booking adjustments.
 await nav(p,'bookings');await p.locator(`[data-action=open-event][data-id="${booking.id}"]`).click();await supply(p,'Forks').locator('input').check();
 await nav(p,'templates');await button(p,'+ Add item').click();f=p.locator('#item-form');await f.locator('[name=name]').fill('Extra centerpiece');await f.locator('[name=rate]').fill('1');await f.locator('[name=price]').fill('5');await button(p,'Save item').click();
 await nav(p,'bookings');await p.locator(`[data-action=open-event][data-id="${booking.id}"]`).click();
 check(await supply(p,'Extra centerpiece').count()===1,'A new template item appears in an old open booking.');
 check(await supply(p,'Forks').locator('input').isChecked(),'Adding a template item preserves previous packing checks.');
 await button(p,'+ Add supply').click();f=p.locator('#booking-item-form');await f.locator('[name=name]').fill('Custom delivery service');await f.locator('[name=category]').selectOption('Service');await f.locator('[name=quantity]').fill('1');await f.locator('[name=price]').fill('20');await button(p,'Add to booking').click();
 check(await supply(p,'Custom delivery service').count()===1,'A custom supply can be added directly to an existing booking.');
 check(!(await saved(p)).templates.kiddush.some(i=>i.name==='Custom delivery service'),'Booking-only supplies do not alter the template.');

 await button(p,'Issue stock').click();
 const dispatch=p.locator('#dispatch-form');
 // Only the trays actually leave in this dispatch; other supplies can be
 // issued later after they are received from their own suppliers.
 for(const input of await dispatch.locator('[data-issue]').all())await input.fill('0');
 await dispatch.locator(`[data-issue="${stock.id}"]`).fill('4');await button(p,'Issue stock').last().click();
 check((await saved(p)).movements.some(m=>m.type==='issue'&&m.inventoryId===stock.id&&m.quantity===4),'Dispatch posts a booking-linked inventory movement.');
 check((await p.locator('#event-content').innerText()).includes('Partially issued'),'The booking distinguishes partial stock issuance.');
 await button(p,'Returns / damage').click();f=p.locator('#returns-form');await f.locator(`[name="return-${stock.id}"]`).fill('3');await f.locator(`[name="damage-${stock.id}"]`).fill('1');await button(p,'Record returns').click();
 const afterReturns=await p.evaluate(id=>({onhand:stockOnHand(id),remaining:outstanding(state.events[0],id)}),stock.id);
 check(afterReturns.onhand===11&&afterReturns.remaining===0,'Three returned trays go on hand; one damaged tray does not.');

 await nav(p,'purchases');await button(p,'+ New supplier order').click();f=p.locator('#purchase-form');await f.locator('[name=supplierId]').selectOption(supplierId);await f.locator('[name=deliveryDate]').fill('2026-12-01');await f.locator('[name=deliveryAddress]').fill('Warehouse desk');await f.locator('[name=bookingIds]').selectOption(booking.id);await f.locator(`[data-po-pick="${stock.id}"]`).check();await f.locator(`[data-pick-id="${stock.id}"] [data-pick-packs]`).fill('3');await button(p,'Save supplier order').click();
 const po=(await saved(p)).purchaseOrders[0];
 check(po.status==='draft'&&po.bookingIds.includes(booking.id),'A supplier purchase starts as a draft linked to its booking.');
 check(po.body.includes('3 pack(s) x 2 trays = 6 trays')&&po.body.includes('Warehouse desk'),'The email draft includes package quantities and delivery details.');
 await p.locator('#supplier-draft-form [name=body]').fill(po.body+'\nPlease call on arrival.');await button(p,'Save draft').click();
 check((await saved(p)).purchaseOrders[0].body.includes('Please call on arrival.'),'Edited supplier email text is saved.');
 const downloadPromise=p.waitForEvent('download');await button(p,'Download email (.eml)').click();const download=await downloadPromise;const eml=await fs.readFile(await download.path(),'utf8');
 check(eml.includes('To: orders@supply.test')&&eml.includes('X-Unsent: 1'),'The exported email is a draft, not a sent message.');
 check(sent.length===0,'Supplier email drafting never sends a request, order, or notification.');
 await button(p,'Mark ordered').click();
 check((await saved(p)).purchaseOrders[0].status==='ordered','An order is marked placed only by an explicit action.');
 await button(p,'Receive stock').click();await p.locator('[data-receive]').fill('2');await button(p,'Record receipt').click();
 check((await saved(p)).purchaseOrders[0].status==='partial','A partial receipt leaves the order partially received.');
 check(await p.evaluate(id=>stockOnHand(id),stock.id)===13,'Only the received units are added to stock.');
 await button(p,'Receive stock').click();await p.locator('[data-receive]').fill('4');await button(p,'Record receipt').click();
 check((await saved(p)).purchaseOrders[0].status==='received','The final receipt completes the supplier order.');
 check(await p.evaluate(id=>stockOnHand(id),stock.id)===17,'All six purchased units are counted exactly once.');

 await nav(p,'inventory');stockCard=p.locator('#inventory-results article').filter({hasText:'Reusable serving trays'});await stockCard.getByRole('button',{name:'Edit',exact:true}).click();await p.locator('#stock-form [name=price]').fill('24');await p.locator('#stock-form [name=packSize]').fill('3');await button(p,'Save inventory item').click();
 await nav(p,'bookings');await button(p,'+ New booking').click();f=p.locator('#event-form');await f.locator('[name=customer]').selectOption('new');await f.locator('[name=customerName]').fill('Catalog price check');await f.locator('[name=date]').fill('2026-12-06');await f.locator('[name=regular]').fill('2');await button(p,'Create booking').click();
 const prices=await saved(p),oldLine=prices.events.find(e=>e.id===booking.id).items.find(i=>i.id===templateId),newLine=prices.events.at(-1).items.find(i=>i.id===templateId);
 check(oldLine.price===10&&oldLine.packSize===2,'Catalog price changes preserve existing booking snapshots.');
 check(newLine.price===24&&newLine.packSize===3,'New bookings use current catalog prices and purchase pack sizes.');
 check(prices.purchaseOrders[0].items[0].price===10&&prices.purchaseOrders[0].items[0].packSize===2,'Supplier purchase history keeps its original prices and package sizes.');

 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await p.setViewportSize({width,height});
  for(const view of ['inventory','suppliers','purchases','account']){await nav(p,view);await fits(p,`${width}px ${view}`);if(view==='inventory')check(await p.locator('#inventory-date').evaluate(e=>e.getBoundingClientRect().height)<=50,`${width}px reservation date remains a normal-height input.`);}
  await nav(p,'inventory');await button(p,'+ Add inventory item').click();await fits(p,`${width}px inventory editor`);await close(p);
  await nav(p,'suppliers');await button(p,'+ Add supplier').click();await fits(p,`${width}px supplier editor`);await close(p);
  await nav(p,'purchases');await button(p,'+ New supplier order').click();await fits(p,`${width}px purchase editor`);await close(p);
  await nav(p,'bookings');await p.locator(`[data-action=open-event][data-id="${booking.id}"]`).click();await button(p,'+ Add supply').click();await fits(p,`${width}px direct supply editor`);await close(p);
 }
 check(errors.length===0,'No JavaScript errors: '+errors.join('\n'));
 const legacy=await p.evaluate(()=>fresh());legacy.customers.push({id:'legacy-customer',name:'Legacy customer',phone:'',email:'',notes:''});
 const legacyContext=await browser.newContext({viewport:{width:375,height:667}});await legacyContext.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await legacyContext.addInitScript(data=>{if(location.protocol==='http:'&&!localStorage.getItem('cjCateringV1'))localStorage.setItem('cjCateringV1',JSON.stringify(data));},legacy);
 const old=await legacyContext.newPage();await old.goto(BASE+'/catering/');await nav(old,'customers');
 check((await old.locator('#customer-results').innerText()).includes('Legacy customer'),'The upgrade retains existing version 1 device records.');
 await button(old,'+ Add customer').click();await old.locator('#customer-form [name=name]').fill('New customer after upgrade');await button(old,'Save customer').click();
 const upgraded=await saved(old),backupVersion=await old.evaluate(()=>JSON.parse(localStorage.getItem('cjCateringLastGoodV1')).version);
 check(upgraded.version===2&&upgraded.customers.length===2&&backupVersion===2,'Main records and recovery backups upgrade together, preventing an old cached app from restoring a stale schema.');
 await legacyContext.close();
 console.log(`${checks} inventory, supplier-draft, fee, and existing-booking checks passed.`);
 await ctx.close();
}finally{await browser.close();}
