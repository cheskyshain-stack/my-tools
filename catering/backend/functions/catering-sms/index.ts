import '../_shared/sms-flow.js';
import {type SmsSettings,validTwilioSignature,xmlMessage,smsRpc,environmentSettings} from '../_shared/sms-gateway.ts';
const flow=(globalThis as any).CateringSms;
export async function smsWebhook(request:Request,settings:SmsSettings,call:typeof fetch=fetch):Promise<Response>{
 if(request.method!=='POST')return new Response('Use POST.',{status:405});
 if(!settings.url||!settings.serviceKey||!settings.accountSid||!settings.authToken||!settings.webhookUrl)return new Response('Text booking is not configured.',{status:503});
 const raw=await request.text();if(raw.length>20000)return new Response('Request too large.',{status:413});const params=new URLSearchParams(raw);
 if(params.get('AccountSid')!==settings.accountSid||!await validTwilioSignature(request,params,settings))return new Response('Invalid text-provider signature.',{status:403});
 const to=params.get('To')||'',from=params.get('From')||'',sid=params.get('MessageSid')||'',body=params.get('Body')||'';
 if(!/^\+[1-9]\d{7,14}$/.test(to)||!/^\+[1-9]\d{7,14}$/.test(from)||!/^SM[0-9a-f]{32}$/i.test(sid)||body.length>1600)return new Response('Invalid text message.',{status:400});
 try{for(let attempt=0;attempt<4;attempt++){
  const context=await smsRpc(settings,'catering_sms_context',{p_to:to,p_from:from,p_message_id:sid},call);if(!context)return xmlMessage('');if(context.duplicate)return xmlMessage(context.reply||'');
  const optout=params.get('OptOutType'),input=optout==='STOP'?'STOP':optout==='START'?'START':body;
  const result=flow.advance(context.conversation.state,input,{businessName:context.channel.business_name,today:context.today,reference:'SK-'+sid.slice(-12).toUpperCase()});
  const reply=optout==='STOP'||optout==='START'||optout==='HELP'?'':result.reply;
  const saved=await smsRpc(settings,'catering_sms_commit',{p_channel:context.channel.id,p_from:from,p_message_id:sid,p_revision:context.conversation.revision,p_state:result.state,p_reply:reply,p_body:body,p_request:result.request||null},call);
  if(saved.retry)continue;return xmlMessage(saved.reply||'');
 }return new Response('Please retry this message.',{status:503});}catch{return new Response('The booking service is temporarily unavailable. The provider may retry this message.',{status:503});}
}
if(import.meta.main)Deno.serve(request=>smsWebhook(request,environmentSettings()));
