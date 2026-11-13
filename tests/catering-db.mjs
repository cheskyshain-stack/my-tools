import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';

export const USERS={
 owner:{id:'00000000-0000-0000-0000-000000000001',email:'owner@planner.test'},
 alice:{id:'00000000-0000-0000-0000-000000000002',email:'alice@planner.test'},
 bob:{id:'00000000-0000-0000-0000-000000000003',email:'bob@planner.test'},
 viewer:{id:'00000000-0000-0000-0000-000000000004',email:'viewer@planner.test'},
 pending:{id:'00000000-0000-0000-0000-000000000005',email:'pending@planner.test'},
 unverified:{id:'00000000-0000-0000-0000-000000000006',email:'unverified@planner.test'}
};
export const COMPANIES={a:'10000000-0000-0000-0000-000000000001',b:'10000000-0000-0000-0000-000000000002'};
export function fixtureState(name='Company A'){
 const line={id:'supply-cups',name:'Cups',category:'Paper goods',basis:'table',rate:5,packSize:10,price:2,unit:'cups',inventoryId:'stock-cups'};
 const customer={id:'customer-test',name:name+' customer',phone:'',email:'',notes:''};
 const event={id:'booking-test',customerId:customer.id,contact:{name:customer.name,phone:''},kind:'kiddush',date:'2026-12-05',time:'',location:'Test hall',neighborhood:'',status:'booked',counts:{regular:2,kids:0,head:0,coffee:0,adults:0,children:0},quote:null,paid:0,notes:'',items:[line],overrides:{},packed:{},feedback:{notes:'',outcome:'',items:{}},createdAt:'2026-11-12T12:00:00.000Z',updatedAt:'2026-11-12T12:00:00.000Z',sourceLabel:'Test fixture',fees:{service:0,waiterCount:0,waiterRate:0,waiterHours:1,waiterBasis:'event',waiterNames:''},returnDate:'2026-12-05'};
 return {version:2,lastExport:null,customers:[customer],events:[event],neighborhoods:[],templates:{bris:[],kiddush:[line]},suppliers:[],inventory:[{id:'stock-cups',name:'Cups',sku:'CUP',unit:'cups',packSize:10,price:2,supplierId:null,type:'consumable',reorderLevel:2,location:'Shelf A',notes:'',active:true,counted:true}],movements:[{id:'opening-cups',inventoryId:'stock-cups',type:'opening',quantity:10,unit:'cups',date:'2026-11-12T12:00:00.000Z',notes:'Opening count',bookingId:null,orderId:null,lineId:null}],purchaseOrders:[],settings:{companyName:name,companyEmail:'',companyPhone:'',deliveryAddress:''}};
}
export function move(id,type,quantity,extra={}){return {id,inventoryId:'stock-cups',type,quantity,unit:'cups',date:'2026-11-12T13:00:00.000Z',notes:'Fixture movement',bookingId:null,orderId:null,lineId:null,...extra};}
export async function createDatabase({documents=true}={}){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;`);
 await db.exec(await fs.readFile(new URL('../catering/backend/001_companies.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../catering/backend/002_tablecloth_shapes.sql',import.meta.url),'utf8'));
 for(const [name,u] of Object.entries(USERS))await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[u.id,u.email,name==='unverified'?null:'2026-11-12T12:00:00Z']);
 await db.query('insert into public.catering_platform_admins(email) values($1)',[USERS.owner.email]);
 await db.query("insert into public.catering_companies(id,name) values($1,'Company A'),($2,'Company B')",[COMPANIES.a,COMPANIES.b]);
 for(const [company,user,role] of [[COMPANIES.a,USERS.alice,'staff'],[COMPANIES.b,USERS.bob,'staff'],[COMPANIES.a,USERS.viewer,'viewer']])await db.query('insert into public.catering_members(company_id,email,user_id,role) values($1,$2,$3,$4)',[company,user.email,user.id,role]);
 for(const [company,name] of [[COMPANIES.a,'Company A'],[COMPANIES.b,'Company B']])await db.query('insert into public.catering_documents(company_id,revision,data) values($1,$2,$3::jsonb)',[company,documents?1:0,documents?JSON.stringify(fixtureState(name)):null]);
 let queue=Promise.resolve();
 const as=(user,sql,params=[])=>{
  const task=queue.then(async()=>{await db.exec('begin;set local role authenticated;');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user?.id||'']);const result=await db.query(sql,params);await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}});
  queue=task.catch(()=>{});return task;
 };
 return {db,as,close:()=>queue.then(()=>db.close())};
}
