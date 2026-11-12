import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,USERS,COMPANIES,fixtureState,move} from './catering-db.mjs';

const store=await createDatabase();let checks=0;
const check=(ok,message)=>{assert.ok(ok,message);checks++;};
const commit=(user,company,revision,data,operation=randomUUID())=>store.as(user,'select public.catering_commit($1::uuid,$2::bigint,$3::uuid,$4::jsonb) result',[company,revision,operation,JSON.stringify(data)]).then(r=>r.rows[0].result);
const denied=async(task,pattern,message)=>{await assert.rejects(task,pattern,message);checks++;};
try{
 for(const [user,expected] of [[USERS.owner,2],[USERS.alice,1],[USERS.bob,1],[USERS.viewer,1],[USERS.pending,0],[USERS.unverified,0]]){
  const r=await store.as(user,'select company_id from public.catering_documents');check(r.rows.length===expected,`${user.email} sees only authorized companies.`);
 }
 await denied(()=>commit(USERS.alice,COMPANIES.b,1,fixtureState()),/not approved/,'A company A user cannot write company B.');
 await denied(()=>commit(USERS.viewer,COMPANIES.a,1,fixtureState()),/not approved/,'A viewer cannot write.');
 await denied(()=>store.as(USERS.alice,"select public.catering_admin_create_company('Unauthorized','')"),/Administrator access/,'Staff cannot create or approve a company.');
 await denied(()=>store.as(USERS.alice,'update public.catering_documents set revision=9'),/permission denied/,'Direct writes cannot bypass revision or inventory validation.');
 await denied(()=>store.as(USERS.unverified,'select public.catering_session()'),/Verify/,'An unverified email is not a company identity.');

 const initial=fixtureState(),operation=randomUUID();initial.customers[0].phone='555-0100';
 const saved=await commit(USERS.alice,COMPANIES.a,1,initial,operation);
 check(saved.revision===2,'A valid company update increments its revision.');
 const repeat=await commit(USERS.alice,COMPANIES.a,1,initial,operation);
 check(repeat.idempotent&&repeat.revision===2,'An uncertain retry is idempotent.');
 const changed=structuredClone(initial);changed.settings.companyName='Different';
 await denied(()=>commit(USERS.alice,COMPANIES.a,2,changed,operation),/different data/,'An operation identifier cannot be reused for different records.');
 const stale=await commit(USERS.alice,COMPANIES.a,1,changed);
 check(stale.conflict&&stale.revision===2&&stale.data.customers[0].phone==='555-0100','A stale save returns current shared records rather than overwriting them.');
 const left=structuredClone(initial),right=structuredClone(initial);left.customers[0].notes='Left device';right.customers[0].notes='Right device';
 const race=await Promise.all([commit(USERS.alice,COMPANIES.a,2,left),commit(USERS.alice,COMPANIES.a,2,right)]);
 check(race.filter(r=>r.conflict).length===1&&race.filter(r=>r.revision===3&&!r.conflict).length===1,'Simultaneous writes to the same revision cannot both succeed.');

 let current=(await store.as(USERS.alice,'select data,revision from public.catering_documents where company_id=$1',[COMPANIES.a])).rows[0];
 const issue=structuredClone(current.data);issue.movements.push(move('issue-first','issue',7,{bookingId:'booking-test'}));
 const issued=await commit(USERS.alice,COMPANIES.a,current.revision,issue);check(issued.revision===4,'Valid dispatch is committed.');
 const duplicate=structuredClone(issue);duplicate.movements.push(move('issue-second','issue',7,{bookingId:'booking-test'}));
 await denied(()=>commit(USERS.alice,COMPANIES.a,4,duplicate),/Not enough stock|exceeds the booking/,'Duplicate or competing dispatch cannot consume stock twice.');
 const negative=structuredClone(issue);negative.movements.push(move('adjust-too-far','adjust-out',4));
 await denied(()=>commit(USERS.alice,COMPANIES.a,4,negative),/Not enough stock/,'Shared stock cannot become negative.');
 const tooManyReturns=structuredClone(issue);tooManyReturns.movements.push(move('return-too-many','return',8,{bookingId:'booking-test'}));
 await denied(()=>commit(USERS.alice,COMPANIES.a,4,tooManyReturns),/Returns and damage/,'Returns cannot exceed issued quantities.');
 const changedHistory=structuredClone(issue);changedHistory.movements[0].quantity=100;
 await denied(()=>commit(USERS.alice,COMPANIES.a,4,changedHistory),/history is permanent/,'A client cannot rewrite an accepted stock count.');
 const deletedHistory=structuredClone(issue);deletedHistory.movements.pop();
 await denied(()=>commit(USERS.alice,COMPANIES.a,4,deletedHistory),/history is permanent/,'A client cannot remove accepted stock history.');
 const noBooking=structuredClone(issue);noBooking.events=[];
 await denied(()=>commit(USERS.alice,COMPANIES.a,4,noBooking),/booking|Booking/,'Bookings with stock history cannot disappear.');
 const returned=structuredClone(issue);returned.movements.push(move('return-valid','return',2,{bookingId:'booking-test'}));
 check((await commit(USERS.alice,COMPANIES.a,4,returned)).revision===5,'Valid unused supplies return to inventory.');

 const purchase=structuredClone(returned);purchase.suppliers.push({id:'supplier-test',name:'Supplier',email:'orders@supplier.test',phone:'',address:'',leadDays:0,notes:''});
 purchase.purchaseOrders.push({id:'po-test',number:'PO-TEST',supplierId:'supplier-test',status:'ordered',deliveryDate:'2026-12-01',deliveryAddress:'',bookingIds:['booking-test'],items:[{id:'po-line',inventoryId:'stock-cups',packs:2,packSize:10,price:2}],notes:'',subject:'Test order',body:'Please supply cups.',createdAt:'2026-11-12T12:00:00Z',updatedAt:'2026-11-12T12:00:00Z'});
 purchase.movements.push(move('receipt-first','receive',12,{orderId:'po-test',lineId:'po-line'}));
 check((await commit(USERS.alice,COMPANIES.a,5,purchase)).revision===6,'Partial deliveries add stock against a purchase order.');
 const overReceive=structuredClone(purchase);overReceive.movements.push(move('receipt-duplicate','receive',12,{orderId:'po-test',lineId:'po-line'}));
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,overReceive),/Received quantity exceeds/,'Competing receipts cannot exceed the supplier order.');
 const badUnit=structuredClone(purchase);badUnit.inventory[0].unit='boxes';
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,badUnit),/unit no longer matches/,'Changing units cannot rewrite stock history.');
 const missingArrays=structuredClone(purchase);delete missingArrays.movements;
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,missingArrays),/Invalid collection/,'Incomplete documents are rejected.');
 const invalidFee=structuredClone(purchase);invalidFee.events[0].fees.service=-1;
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,invalidFee),/Invalid service/,'Negative service fees are rejected.');
 const invalidPrice=structuredClone(purchase);invalidPrice.events[0].items[0].price=-1;
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,invalidPrice),/Invalid numeric/,'Negative pack prices cannot poison a shared document.');
 const missingCustomerName=structuredClone(purchase);delete missingCustomerName.customers[0].name;
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,missingCustomerName),/Invalid text/,'Server validation rejects incomplete contact records.');
 const stringVersion=structuredClone(purchase);stringVersion.version='2';
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,stringVersion),/Unsupported/,'A malformed document version is rejected.');
 const duplicateSupply=structuredClone(purchase);duplicateSupply.events[0].items.push(structuredClone(duplicateSupply.events[0].items[0]));
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,duplicateSupply),/Duplicate/,'Duplicate booking supplies cannot break other devices.');

 const request=(await store.as(USERS.pending,"select public.catering_request_access('New Caterer') result")).rows[0].result;
 await denied(()=>store.as(USERS.pending,'select public.catering_admin_approve_request($1::uuid,null,\'admin\')',[request.id]),/Administrator access/,'A user cannot approve their own request.');
 const company=(await store.as(USERS.owner,'select public.catering_admin_approve_request($1::uuid,null,\'admin\') id',[request.id])).rows[0].id;
 const profile=(await store.as(USERS.pending,'select public.catering_session() result')).rows[0].result;
 check(profile.companies.some(c=>c.id===company),'Owner approval grants the requested company access.');
 check(!(await store.as(USERS.pending,'select company_id from public.catering_documents')).rows.some(r=>r.company_id===COMPANIES.a),'New company approval does not expose existing tenants.');
 await store.as(USERS.owner,"select public.catering_admin_save_member($1,$2,'staff','disabled')",[COMPANIES.a,USERS.alice.email]);
 check((await store.as(USERS.alice,'select company_id from public.catering_documents')).rows.length===0,'Disabling a user revokes database reads.');
 await denied(()=>commit(USERS.alice,COMPANIES.a,6,purchase),/not approved/,'Disabling a user revokes writes.');
 await store.as(USERS.owner,"select public.catering_admin_company_status($1,'suspended')",[COMPANIES.b]);
 check((await store.as(USERS.bob,'select company_id from public.catering_documents')).rows.length===0,'Suspending a company blocks its users.');
 console.log(`${checks} PostgreSQL company, synchronization, and inventory checks passed.`);
}finally{await store.close();}
