import {type SmsSettings,smsRpc,environmentSettings} from '../_shared/sms-gateway.ts';
export async function smsSend(request:Request,settings:SmsSettings,call:typeof fetch=fetch):Promise<Response>{
 const cors={'Access-Control-Allow-Origin':settings.origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'},json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==settings.origin)return json({message:'Origin not allowed.'},403);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return json({message:'Use POST.'},405);
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)return json({message:'Sign in first.'},401);
 if(!settings.url||!settings.serviceKey||!settings.publicKey||!settings.accountSid||!settings.authToken)return json({message:'The texting provider is not connected yet.'},503);
 let claimed:any=null;
 try{
  const identity=await call(settings.url+'/auth/v1/user',{headers:{Authorization:'Bearer '+token,apikey:settings.publicKey},cache:'no-store'});if(!identity.ok)return json({message:'Sign in again.'},401);
  const raw=await request.text();if(raw.length>6000)return json({message:'Reply too large.'},413);let input:any;try{input=JSON.parse(raw);}catch{return json({message:'Invalid request.'},400);}
  if(!/^[0-9a-f-]{36}$/i.test(input.requestId||'')||!/^[0-9a-f-]{36}$/i.test(input.operation||'')||!['approve','decline','reply'].includes(input.action)||typeof input.message!=='string'||input.message.length>1000)return json({message:'Enter a valid request and reply.'},400);
  const outbox=await smsRpc(settings,'catering_sms_action',{p_request:input.requestId,p_action:input.action,p_message:input.message,p_operation:input.operation},call,token);
  claimed=await smsRpc(settings,'catering_sms_claim',{p_outbox:outbox.id},call);if(!claimed?.claimed)return json({status:claimed?.status||outbox.status,outboxId:outbox.id});
  const form=new URLSearchParams({From:claimed.from,To:claimed.to,Body:claimed.body});let response:Response;
  try{response=await call('https://api.twilio.com/2010-04-01/Accounts/'+settings.accountSid+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+btoa(settings.accountSid+':'+settings.authToken),'Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),signal:AbortSignal.timeout(10000)});}catch{await smsRpc(settings,'catering_sms_finish',{p_outbox:claimed.id,p_status:'unknown',p_provider_id:null,p_error:'Delivery is uncertain. Check provider logs before resending.'},call);return json({status:'unknown',message:'The send result is uncertain. Check the provider before sending again.',outboxId:claimed.id},202);}
  let result:any={};try{result=await response.json();}catch{}
  const sent=response.ok&&/^SM[0-9a-f]{32}$/i.test(result.sid||''),status=sent?'sent':response.status>=500||response.ok||response.status===408?'unknown':'failed';
  await smsRpc(settings,'catering_sms_finish',{p_outbox:claimed.id,p_status:status,p_provider_id:sent?result.sid:null,p_error:sent?'':status==='unknown'?'Delivery is uncertain. Check provider logs.':'Provider rejected the message'+(result.code?' (code '+String(result.code).slice(0,20)+')':'')+'.'},call);
  return json({status,outboxId:claimed.id,message:sent?'Text accepted by the provider.':status==='failed'?'The provider rejected this text.':'Delivery is uncertain; check the provider before resending.'},sent?200:202);
 }catch(error){return json({message:claimed?'The send result needs review in the provider logs.':error instanceof Error?error.message:'This text could not be prepared.'},claimed?202:400);}
}
if(import.meta.main)Deno.serve(request=>smsSend(request,environmentSettings()));
