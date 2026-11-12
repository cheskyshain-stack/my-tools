// Generates an activation link for an already approved user. It sends no email.
// The gateway may use verify_jwt=false because this handler verifies the caller
// against Supabase Auth and checks the platform administrator role itself.
export async function inviteHandler(request: Request, settings: {url:string;publicKey:string;serviceKey:string;origin:string}, call:typeof fetch=fetch):Promise<Response> {
 const cors={'Access-Control-Allow-Origin':settings.origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==settings.origin)return json({message:'This origin is not allowed.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return json({message:'Use POST.'},405);
 const authorization=request.headers.get('Authorization')||'';
 if(!/^Bearer \S+$/.test(authorization))return json({message:'Sign in first.'},401);
 if(!settings.url||!settings.publicKey||!settings.serviceKey)return json({message:'The invitation service has not been configured.'},503);
 const userHeaders={Authorization:authorization,apikey:settings.publicKey,'Content-Type':'application/json'};
 try{
  const identity=await call(settings.url+'/auth/v1/user',{headers:userHeaders});
  if(!identity.ok)return json({message:'Your login is not valid.'},401);
  const admin=await call(settings.url+'/rest/v1/rpc/catering_is_admin',{method:'POST',headers:userHeaders,body:'{}'});
  if(!admin.ok||await admin.json()!==true)return json({message:'Administrator approval is required.'},403);
  const text=await request.text();if(text.length>16000)return json({message:'Request too large.'},413);
  const body=JSON.parse(text),email=String(body.email||'').trim().toLowerCase(),companyId=String(body.companyId||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[a-f0-9-]{36}$/i.test(companyId))return json({message:'Enter an approved email and company.'},400);
  const query=new URL(settings.url+'/rest/v1/catering_members');query.searchParams.set('company_id','eq.'+companyId);query.searchParams.set('email','eq.'+email);query.searchParams.set('status','eq.active');query.searchParams.set('select','email');
  const membership=await call(query,{headers:userHeaders});const rows=membership.ok?await membership.json():[];
  if(!rows.length)return json({message:'Approve this user for the company before creating an invitation.'},403);
  const generated=await call(settings.url+'/auth/v1/admin/generate_link?redirect_to='+encodeURIComponent(settings.origin+'/catering/'),{method:'POST',headers:{Authorization:'Bearer '+settings.serviceKey,apikey:settings.serviceKey,'Content-Type':'application/json'},body:JSON.stringify({type:'invite',email})});
  const data=await generated.json();
  if(!generated.ok)return json({message:'The invitation could not be created. If this person already has a login, their approved company access is ready; they can sign in normally.'},409);
  const link=data.properties?.action_link||data.action_link;
  if(typeof link!=='string'||!link.startsWith(settings.url+'/auth/v1/'))return json({message:'The provider did not return a valid activation link.'},502);
  return json({email,link});
 }catch{return json({message:'The invitation service could not finish the request. Try again.'},502);}
}

if(import.meta.main){
 Deno.serve(request=>inviteHandler(request,{
  url:Deno.env.get('SUPABASE_URL')||'',
  publicKey:Deno.env.get('SUPABASE_ANON_KEY')||'',
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
  origin:Deno.env.get('CATERING_APP_ORIGIN')||'https://tools.cjaffa.com'
 }));
}
