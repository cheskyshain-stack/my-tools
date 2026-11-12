import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDatabase,USERS} from './catering-db.mjs';

// Only the managed email/password provider is simulated. Tenant authorization,
// revision transactions and inventory checks run in the actual PostgreSQL schema.
export async function startCloudServer({port=0}={}){
 const store=await createDatabase();const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
 const definitions={
  catering_session:[],catering_request_access:[['p_company_name','text']],
  catering_admin_create_company:[['p_name','text'],['p_owner_email','text']],
  catering_admin_save_member:[['p_company','uuid'],['p_email','text'],['p_role','text'],['p_status','text']],
  catering_admin_approve_request:[['p_request','uuid'],['p_company','uuid'],['p_role','text']],
  catering_admin_decline_request:[['p_request','uuid']],catering_admin_company_status:[['p_company','uuid'],['p_status','text']],
  catering_commit:[['p_company','uuid'],['p_expected_revision','bigint'],['p_operation','uuid'],['p_data','jsonb']]
 };
 const output=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,apikey,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'});res.end(value===null?'':JSON.stringify(value));};
 async function body(req){let result='';for await(const chunk of req)result+=chunk;if(result.length>10*1024*1024)throw Error('Request too large');return result?JSON.parse(result):{};}
 const token=user=>'test-token-'+user.id;
 const getUser=req=>Object.values(USERS).find(u=>req.headers.authorization==='Bearer '+token(u));
 function session(user){return {access_token:token(user),refresh_token:'refresh-'+user.id,expires_in:3600,user:{id:user.id,email:user.email}};}
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  try{
   if(req.method==='OPTIONS'){output(res,204,null);return;}
   if(url.pathname==='/api/auth/v1/token'){
    const data=await body(req);let user;
    if(url.searchParams.get('grant_type')==='refresh_token')user=Object.values(USERS).find(u=>data.refresh_token==='refresh-'+u.id);
    else user=Object.values(USERS).find(u=>u.email===data.email&&data.password==='test-password');
    if(!user){output(res,400,{message:'Invalid login credentials'});return;}output(res,200,session(user));return;
   }
   if(url.pathname==='/api/auth/v1/user'){
    const user=getUser(req);if(!user){output(res,401,{message:'Sign in first'});return;}
    output(res,200,{id:user.id,email:user.email});return;
   }
   if(url.pathname==='/api/auth/v1/logout'){output(res,204,null);return;}
   if(url.pathname==='/api/auth/v1/recover'||url.pathname==='/api/auth/v1/signup'){output(res,200,{user:{id:USERS.pending.id}});return;}
   if(url.pathname.startsWith('/api/rest/v1/')){
    const user=getUser(req);if(!user){output(res,401,{message:'Sign in first'});return;}
    const route=url.pathname.slice('/api/rest/v1/'.length);
    if(route.startsWith('rpc/')){
     const name=route.slice(4),params=definitions[name];if(!params){output(res,404,{message:'Unknown procedure'});return;}
     const data=await body(req),args=params.map(([key,type])=>type==='jsonb'?JSON.stringify(data[key]):data[key]);
     const sql=`select public.${name}(${params.map(([,type],n)=>'$'+(n+1)+'::'+type).join(',')}) result`;
     const result=await store.as(user,sql,args);output(res,200,result.rows[0].result);return;
    }
    if(route==='catering_documents'){
     const company=url.searchParams.get('company_id')?.replace(/^eq\./,'');
     const fields=(url.searchParams.get('select')||'revision,data,updated_at').split(',');
     if(!fields.every(f=>['revision','data','updated_at'].includes(f)))throw Error('Invalid columns');
     output(res,200,(await store.as(user,`select ${fields.join(',')} from public.catering_documents where company_id=$1::uuid`,[company])).rows);return;
    }
    if(route==='catering_access_requests'){output(res,200,(await store.as(user,"select * from public.catering_access_requests where status='pending' order by created_at")).rows);return;}
    if(route==='catering_members'){output(res,200,(await store.as(user,'select company_id,email,role,status from public.catering_members order by email')).rows);return;}
    output(res,404,{message:'Unknown table'});return;
   }
   if(url.pathname==='/catering/cloud-config.js'){
    res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-cache'});res.end('window.CATERING_CLOUD='+JSON.stringify({url:'http://127.0.0.1:'+port+'/api',publishableKey:'public-test-key'})+';');return;
   }
   let target=decodeURIComponent(url.pathname);if(target==='/favicon.ico')target='/logo.png';if(target.endsWith('/'))target+='index.html';
   const full=path.resolve(root,'.'+target);if(!full.startsWith(root+path.sep))throw Error('Invalid path');
   const bytes=await fs.readFile(full);const ext=path.extname(full),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
   res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
  }catch(error){if(error.code==='ENOENT'){res.writeHead(404);res.end('Not found');return;}output(res,error.code==='42501'?403:400,{message:error.message});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 port=server.address().port;
 return {url:'http://127.0.0.1:'+port,store,close:async()=>{await new Promise(r=>server.close(r));await store.close();}};
}
