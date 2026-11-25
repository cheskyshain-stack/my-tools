-- Text-only booking requests. Apply after migrations 001, 002 and 003.
create table if not exists public.catering_sms_channels (
 id uuid primary key default gen_random_uuid(),company_id uuid not null unique references public.catering_companies(id),
 phone text not null unique check(phone~'^\+[1-9][0-9]{7,14}$'),business_name text not null check(length(trim(business_name)) between 1 and 80),
 timezone text not null default 'America/New_York',enabled boolean not null default false
);
create table if not exists public.catering_sms_conversations (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.catering_companies(id),channel_id uuid not null references public.catering_sms_channels(id),
 phone text not null check(phone~'^\+[1-9][0-9]{7,14}$'),revision bigint not null default 0,state jsonb not null default '{"step":"start","data":{},"history":[],"optedOut":false}',
 latest_request_id uuid,updated_at timestamptz not null default now(),unique(channel_id,phone)
);
create table if not exists public.catering_sms_requests (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.catering_companies(id),conversation_id uuid not null references public.catering_sms_conversations(id),
 phone text not null,reference text not null,kind text not null check(kind in ('booking','question')),data jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','declined','closed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 decided_by uuid references auth.users(id),unique(company_id,reference)
);
create table if not exists public.catering_sms_messages (
 provider_id text primary key,company_id uuid not null references public.catering_companies(id),conversation_id uuid not null references public.catering_sms_conversations(id),
 request_id uuid references public.catering_sms_requests(id),body text not null,reply text not null,created_at timestamptz not null default now()
);
create table if not exists public.catering_sms_outbox (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.catering_companies(id),request_id uuid not null references public.catering_sms_requests(id),
 operation_id uuid not null,action text not null check(action in ('approve','decline','reply')),input_message text not null,body text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','unknown','blocked')),provider_id text,error text not null default '',attempts integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(request_id,operation_id)
);
alter table public.catering_sms_channels enable row level security;
alter table public.catering_sms_conversations enable row level security;
alter table public.catering_sms_requests enable row level security;
alter table public.catering_sms_messages enable row level security;
alter table public.catering_sms_outbox enable row level security;
create policy catering_sms_channels_read on public.catering_sms_channels for select to authenticated using(public.catering_can_read(company_id));
create policy catering_sms_conversations_read on public.catering_sms_conversations for select to authenticated using(public.catering_can_read(company_id));
create policy catering_sms_requests_read on public.catering_sms_requests for select to authenticated using(public.catering_can_read(company_id));
create policy catering_sms_messages_read on public.catering_sms_messages for select to authenticated using(public.catering_can_read(company_id));
create policy catering_sms_outbox_read on public.catering_sms_outbox for select to authenticated using(public.catering_can_read(company_id));
revoke all on public.catering_sms_channels,public.catering_sms_conversations,public.catering_sms_requests,public.catering_sms_messages,public.catering_sms_outbox from public,anon,authenticated;
grant select on public.catering_sms_channels,public.catering_sms_conversations,public.catering_sms_requests,public.catering_sms_messages,public.catering_sms_outbox to authenticated;

create or replace function public.catering_sms_configure(p_company uuid,p_phone text,p_name text,p_timezone text default 'America/New_York',p_enabled boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare channel uuid;
begin
 if not public.catering_is_admin() then raise exception 'Platform administrator access required.' using errcode='42501';end if;
 if p_phone!~'^\+[1-9][0-9]{7,14}$' or length(trim(p_name)) not between 1 and 80 or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Enter a valid texting number, business name and time zone.';end if;
 insert into public.catering_sms_channels(company_id,phone,business_name,timezone,enabled) values(p_company,p_phone,trim(p_name),p_timezone,p_enabled)
 on conflict(company_id) do update set phone=excluded.phone,business_name=excluded.business_name,timezone=excluded.timezone,enabled=excluded.enabled returning id into channel;
 return channel;
end $$;

-- These gateway procedures are service-role only. The webhook verifies Twilio first.
create or replace function public.catering_sms_context(p_to text,p_from text,p_message_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ch public.catering_sms_channels;conversation public.catering_sms_conversations;receipt public.catering_sms_messages;
begin
 select * into ch from public.catering_sms_channels where phone=p_to and enabled and exists(select 1 from public.catering_companies c where c.id=company_id and c.status='active');
 if not found then return null;end if;
 if p_from!~'^\+[1-9][0-9]{7,14}$' or p_message_id!~'^SM[0-9a-fA-F]{32}$' then raise exception 'Invalid text sender or message identifier.';end if;
 select * into receipt from public.catering_sms_messages where provider_id=p_message_id;
 if found then if receipt.company_id<>ch.company_id or not exists(select 1 from public.catering_sms_conversations v where v.id=receipt.conversation_id and v.channel_id=ch.id and v.phone=p_from) then raise exception 'Message belongs to another conversation.';end if;return jsonb_build_object('duplicate',true,'reply',receipt.reply);end if;
 insert into public.catering_sms_conversations(company_id,channel_id,phone) values(ch.company_id,ch.id,p_from) on conflict(channel_id,phone) do nothing;
 select * into conversation from public.catering_sms_conversations where channel_id=ch.id and phone=p_from;
 return jsonb_build_object('channel',to_jsonb(ch),'conversation',to_jsonb(conversation),'today',to_char(now() at time zone ch.timezone,'YYYY-MM-DD'));
end $$;
create or replace function public.catering_sms_commit(p_channel uuid,p_from text,p_message_id text,p_revision bigint,p_state jsonb,p_reply text,p_body text,p_request jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ch public.catering_sms_channels;conversation public.catering_sms_conversations;receipt public.catering_sms_messages;request_id uuid;ref text;
begin
 select * into ch from public.catering_sms_channels where id=p_channel and enabled and exists(select 1 from public.catering_companies c where c.id=company_id and c.status='active');if not found then raise exception 'This texting channel is not active.';end if;
 select * into conversation from public.catering_sms_conversations where channel_id=ch.id and phone=p_from for update;
 if not found then raise exception 'Text conversation not found.';end if;
 select * into receipt from public.catering_sms_messages where provider_id=p_message_id;
 if found then if receipt.company_id<>ch.company_id or receipt.conversation_id<>conversation.id then raise exception 'Message belongs to another conversation.';end if;return jsonb_build_object('reply',receipt.reply,'duplicate',true);end if;
 if conversation.revision<>p_revision then return jsonb_build_object('retry',true);end if;
 if p_message_id!~'^SM[0-9a-fA-F]{32}$' or length(p_body)>1600 or length(p_reply)>1600 or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>65536 or jsonb_typeof(p_state->'optedOut') is distinct from 'boolean' or jsonb_typeof(p_state->'data') is distinct from 'object' or jsonb_typeof(p_state->'history') is distinct from 'array' then raise exception 'Invalid text conversation update.';end if;
 if p_request is not null and p_request<>'null'::jsonb then
  if coalesce(p_request->>'kind','') not in ('booking','question') or length(trim(coalesce(p_request->>'name',''))) not between 1 and 120 or octet_length(p_request::text)>8000 then raise exception 'Invalid booking request.';end if;
  if p_request->>'kind'='booking' then
   if coalesce(p_request->>'service','') not in ('Kiddush','Vacht Nacht','Shalom Zachor','Bris','Other') or (p_request->>'package' is not null and p_request->>'package' not in ('Classic Package','Royal Package','King Package')) or coalesce(p_request->>'eventDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid booking options.';end if;
   perform (p_request->>'eventDate')::date;
  elsif length(trim(coalesce(p_request->>'question','')))<1 then raise exception 'A question is required.';end if;
  ref:='SK-'||upper(right(p_message_id,12));
  insert into public.catering_sms_requests(company_id,conversation_id,phone,reference,kind,data) values(ch.company_id,conversation.id,p_from,ref,p_request->>'kind',p_request) returning id into request_id;
 else request_id:=conversation.latest_request_id;end if;
 insert into public.catering_sms_messages(provider_id,company_id,conversation_id,request_id,body,reply) values(p_message_id,ch.company_id,conversation.id,request_id,p_body,p_reply);
 update public.catering_sms_conversations set state=p_state,revision=revision+1,latest_request_id=request_id,updated_at=now() where id=conversation.id;
 return jsonb_build_object('reply',p_reply,'requestId',request_id);
end $$;

create or replace function public.catering_sms_action(p_request uuid,p_action text,p_message text,p_operation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare req public.catering_sms_requests;ch public.catering_sms_channels;conversation public.catering_sms_conversations;outgoing public.catering_sms_outbox;booking jsonb;document jsonb;body text;
begin
 select * into req from public.catering_sms_requests where id=p_request for update;if not found or not public.catering_can_write(req.company_id) then raise exception 'Company write access required.' using errcode='42501';end if;
 if p_action not in ('approve','decline','reply') or length(p_message)>1000 then raise exception 'Invalid text action.';end if;
 select * into ch from public.catering_sms_channels where company_id=req.company_id and enabled;if not found then raise exception 'The texting number is not connected.';end if;
 select * into conversation from public.catering_sms_conversations where id=req.conversation_id;
 if (conversation.state->>'optedOut')::boolean then raise exception 'This customer has stopped text messages. They must text START before a reply can be sent.';end if;
 select * into outgoing from public.catering_sms_outbox where request_id=req.id and operation_id=p_operation;
 if found then if outgoing.action<>p_action or outgoing.input_message<>p_message then raise exception 'This action identifier was already used for another text.';end if;return to_jsonb(outgoing);end if;
 if p_action='reply' then if trim(p_message)='' then raise exception 'Enter a reply.';end if;body:=ch.business_name||': '||trim(p_message);
 else
  if req.status<>'pending' or req.kind<>'booking' then raise exception 'Only a pending booking request can be approved or declined.';end if;
  select data into document from public.catering_documents where company_id=req.company_id for update;
  select e into booking from jsonb_array_elements(document->'events') e where e->>'sourceSmsRequestId'=req.id::text limit 1;
  if p_action='approve' then
   if booking is null or booking->>'status'<>'booked' then raise exception 'Create and sync the booking before sending its confirmation.';end if;
   body:=ch.business_name||': Confirmed: '||coalesce(booking->>'serviceName',req.data->>'service')||' on '||(booking->>'date')||'. '||coalesce(req.data->>'package','Package as discussed')||'.'||case when booking->>'quote' is null then '' else ' Agreed charge: $'||to_char((booking->>'quote')::numeric,'FM9999999990.00')||'.' end;
  else
   if booking is not null and booking->>'status'<>'cancelled' then raise exception 'Cancel the linked booking before declining this request.';end if;
   body:=ch.business_name||': We cannot confirm request '||req.reference||'. Your date has not been reserved.';
  end if;
  body:=body||case when trim(p_message)='' then '' else ' '||trim(p_message) end;
  update public.catering_sms_requests set status=case p_action when 'approve' then 'approved' else 'declined' end,decided_by=auth.uid(),updated_at=now() where id=req.id;
 end if;
 body:=body||' Ref: '||req.reference||'. Reply here with questions. STOP to stop.';if length(body)>1600 then raise exception 'Please shorten the reply.';end if;
 insert into public.catering_sms_outbox(company_id,request_id,operation_id,action,input_message,body) values(req.company_id,req.id,p_operation,p_action,p_message,body) returning * into outgoing;
 return to_jsonb(outgoing);
end $$;
create or replace function public.catering_sms_claim(p_outbox uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare outgoing public.catering_sms_outbox;req public.catering_sms_requests;ch public.catering_sms_channels;conversation public.catering_sms_conversations;
begin
 select * into outgoing from public.catering_sms_outbox where id=p_outbox for update;if not found then return null;end if;
 if outgoing.status not in ('queued','failed') then return jsonb_build_object('status',outgoing.status,'claimed',false);end if;
 select * into req from public.catering_sms_requests where id=outgoing.request_id;select * into ch from public.catering_sms_channels where company_id=req.company_id and enabled;select * into conversation from public.catering_sms_conversations where id=req.conversation_id;
 if ch.id is null or not exists(select 1 from public.catering_companies c where c.id=req.company_id and c.status='active') then update public.catering_sms_outbox set status='blocked',error='Texting channel or company is inactive.' where id=outgoing.id;return jsonb_build_object('status','blocked','claimed',false);end if;
 if (conversation.state->>'optedOut')::boolean then update public.catering_sms_outbox set status='blocked',error='Customer stopped text messages.' where id=outgoing.id;return jsonb_build_object('status','blocked','claimed',false);end if;
 update public.catering_sms_outbox set status='sending',attempts=attempts+1,updated_at=now() where id=outgoing.id;
 return jsonb_build_object('claimed',true,'status','sending','id',outgoing.id,'from',ch.phone,'to',req.phone,'body',outgoing.body);
end $$;
create or replace function public.catering_sms_finish(p_outbox uuid,p_status text,p_provider_id text default null,p_error text default '')
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_status not in ('sent','failed','unknown') or length(p_error)>500 then raise exception 'Invalid text delivery state.';end if;
 update public.catering_sms_outbox set status=p_status,provider_id=p_provider_id,error=p_error,updated_at=now() where id=p_outbox and status='sending';
end $$;
revoke all on function public.catering_sms_configure(uuid,text,text,text,boolean),public.catering_sms_context(text,text,text),public.catering_sms_commit(uuid,text,text,bigint,jsonb,text,text,jsonb),public.catering_sms_action(uuid,text,text,uuid),public.catering_sms_claim(uuid),public.catering_sms_finish(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.catering_sms_configure(uuid,text,text,text,boolean),public.catering_sms_action(uuid,text,text,uuid) to authenticated;
grant execute on function public.catering_sms_context(text,text,text),public.catering_sms_commit(uuid,text,text,bigint,jsonb,text,text,jsonb),public.catering_sms_claim(uuid),public.catering_sms_finish(uuid,text,text,text) to service_role;

-- A linked SMS request belongs to the same company and may create only one booking.
create or replace function public.catering_sms_validate_links(p_company uuid,p_data jsonb)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from jsonb_array_elements(p_data->'events') e where e->>'serviceName' is not null and (jsonb_typeof(e->'serviceName') is distinct from 'string' or length(e->>'serviceName')>120)) then raise exception 'Invalid requested service name.';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'events') e where e->>'sourceSmsRequestId' is not null and not exists(select 1 from public.catering_sms_requests r where r.id::text=e->>'sourceSmsRequestId' and r.company_id=p_company and r.kind='booking')) then raise exception 'Text booking requests must belong to this company.';end if;
 if exists(select e->>'sourceSmsRequestId' from jsonb_array_elements(p_data->'events') e where e->>'sourceSmsRequestId' is not null group by e->>'sourceSmsRequestId' having count(*)>1) then raise exception 'Only one booking may be created for each text request.';end if;
 if exists(select 1 from public.catering_sms_requests r where r.company_id=p_company and r.status='approved' and not exists(select 1 from jsonb_array_elements(p_data->'events') e where e->>'sourceSmsRequestId'=r.id::text)) then raise exception 'Keep bookings linked to approved text requests; cancel the booking instead.';end if;
end $$;
revoke all on function public.catering_sms_validate_links(uuid,jsonb) from public,anon,authenticated;

create or replace function public.catering_commit(p_company uuid,p_expected_revision bigint,p_operation uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions
as $$
declare v_doc public.catering_documents;v_previous public.catering_commits;v_hash text;v_revision bigint;
begin
 if not public.catering_can_write(p_company) then raise exception 'Company write access is not approved.' using errcode='42501';end if;
 select * into v_doc from public.catering_documents where company_id=p_company for update;
 if not found then raise exception 'Company document not found.';end if;
 v_hash:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 select * into v_previous from public.catering_commits where company_id=p_company and operation_id=p_operation;
 if found then
  if v_previous.body_hash<>v_hash then raise exception 'This operation identifier was used for different data.';end if;
  return jsonb_build_object('revision',v_previous.revision,'idempotent',true);
 end if;
 if v_doc.revision<>p_expected_revision then return jsonb_build_object('conflict',true,'revision',v_doc.revision,'data',v_doc.data);end if;
 perform public.catering_validate_document(p_data);
 perform public.catering_validate_finance(p_data);
 perform public.catering_sms_validate_links(p_company,p_data);
 perform public.catering_finance_transition(v_doc.data,p_data);
 if v_doc.data is not null and exists(
  select 1 from jsonb_array_elements(v_doc.data->'movements') old
  where not exists(select 1 from jsonb_array_elements(p_data->'movements') fresh where fresh->>'id'=old->>'id' and fresh=old)
 ) then raise exception 'Shared stock history is permanent. Record an adjustment instead of rewriting or removing movements.';end if;
 v_revision:=v_doc.revision+1;
 update public.catering_documents set data=p_data,revision=v_revision,updated_at=now(),updated_by=auth.uid() where company_id=p_company;
 insert into public.catering_commits(company_id,operation_id,revision,body_hash) values(p_company,p_operation,v_revision,v_hash);
 insert into public.catering_audit(company_id,actor_id,action,detail) values(p_company,auth.uid(),'records.saved',jsonb_build_object('revision',v_revision,'operation',p_operation));
 return jsonb_build_object('revision',v_revision,'updatedAt',now());
end $$;
