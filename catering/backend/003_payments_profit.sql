-- Add booking payments, profit adjustments and actual-cost validation.
-- Apply after 001_companies.sql and 002_tablecloth_shapes.sql.
create or replace function public.catering_validate_finance(p jsonb)
returns void language plpgsql set search_path=pg_catalog,public
as $$
declare rows jsonb:=coalesce(p->'financeEntries','[]'::jsonb);v_entry jsonb;e jsonb;f jsonb;paid numeric;charged numeric;calculated numeric;
begin
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)>20000 then raise exception 'Invalid payment and expense records.';end if;
 if (select count(*) from jsonb_array_elements(rows))<>(select count(distinct x->>'id') from jsonb_array_elements(rows) x) then raise exception 'Duplicate financial record identifiers.';end if;
 for v_entry in select value from jsonb_array_elements(rows) loop
  perform public.catering_text_fields(v_entry,'{"id":100,"bookingId":100,"type":30,"date":10,"method":30,"reference":200,"note":10000,"createdAt":40,"voidReason":1000}');
  if v_entry->>'id' !~ '^[A-Za-z0-9_-]{1,100}$' or v_entry->>'id' in ('__proto__','constructor','prototype') or not exists(select 1 from jsonb_array_elements(p->'events') x where x->>'id'=v_entry->>'bookingId') then raise exception 'A financial entry must belong to an existing booking.';end if;
  perform public.catering_amount(v_entry,'amount',false,true);
  if (v_entry->>'amount')::numeric<>round((v_entry->>'amount')::numeric,2) or v_entry->>'type' not in ('payment','refund','charge','discount','expense','income') or v_entry->>'method' not in ('cash','check','bank','card','other','unknown') or v_entry->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or trim(v_entry->>'note')='' or jsonb_typeof(v_entry->'voided') is distinct from 'boolean' then raise exception 'Invalid financial entry.';end if;
  perform (v_entry->>'date')::date;
  if ((v_entry->>'voided')::boolean and trim(v_entry->>'voidReason')='') or (not (v_entry->>'voided')::boolean and v_entry->>'voidReason'<>'') then raise exception 'A voided financial entry requires a reason.';end if;
 end loop;
 for e in select value from jsonb_array_elements(p->'events') loop
  if e ? 'financials' then
   f:=e->'financials';if jsonb_typeof(f) is distinct from 'object' then raise exception 'Invalid booking costs.';end if;
   perform public.catering_amount(f,'actualSupplyCost',true);perform public.catering_amount(f,'waiterCost',true);
  end if;
  select round((e->>'paid')::numeric+coalesce(sum(case r->>'type' when 'payment' then (r->>'amount')::numeric when 'refund' then -(r->>'amount')::numeric else 0 end),0),2) into paid from jsonb_array_elements(rows) r where r->>'bookingId'=e->>'id' and not (r->>'voided')::boolean;
  if paid<0 then raise exception 'Refunds cannot exceed recorded customer payments.';end if;
  if jsonb_typeof(e->'quote')='number' then calculated:=(e->>'quote')::numeric;
  else
   select coalesce(sum(round(ceil(greatest(0,case when e->'overrides' ? (i->>'id') then (e->'overrides'->>(i->>'id'))::numeric else round((i->>'rate')::numeric * case i->>'basis' when 'table' then (e->'counts'->>'regular')::numeric+(e->'counts'->>'kids')::numeric+(e->'counts'->>'head')::numeric when 'event' then 1 when 'guests' then (e->'counts'->>'adults')::numeric+(e->'counts'->>'children')::numeric else coalesce((e->'counts'->>(i->>'basis'))::numeric,0) end,6) end)/(i->>'packSize')::numeric-0.0000000001)*coalesce((i->>'price')::numeric,0),2)),0) into calculated from jsonb_array_elements(e->'items') i;
   calculated:=round(calculated+(e->'fees'->>'service')::numeric+round((e->'fees'->>'waiterCount')::numeric*(e->'fees'->>'waiterRate')::numeric*case e->'fees'->>'waiterBasis' when 'hour' then (e->'fees'->>'waiterHours')::numeric else 1 end,2),2);
  end if;
  select calculated+coalesce(sum(case r->>'type' when 'charge' then (r->>'amount')::numeric when 'discount' then -(r->>'amount')::numeric else 0 end),0) into charged from jsonb_array_elements(rows) r where r->>'bookingId'=e->>'id' and not (r->>'voided')::boolean;
  if charged<0 then raise exception 'Discounts cannot exceed the customer charge.';end if;
 end loop;
end $$;

create or replace function public.catering_finance_transition(previous jsonb,next_data jsonb)
returns void language plpgsql set search_path=pg_catalog,public
as $$
begin
 if previous is null then return;end if;
 if exists(select 1 from jsonb_array_elements(coalesce(previous->'financeEntries','[]'::jsonb)) old where not exists(select 1 from jsonb_array_elements(coalesce(next_data->'financeEntries','[]'::jsonb)) fresh where fresh->>'id'=old->>'id' and fresh-'voided'-'voidReason'=old-'voided'-'voidReason' and (not (old->>'voided')::boolean or fresh=old))) then raise exception 'Payment and expense history must be retained. Void an incorrect entry and add a replacement.';end if;
 if exists(select 1 from jsonb_array_elements(previous->'events') old where ((old->>'paid')::numeric>0 or exists(select 1 from jsonb_array_elements(coalesce(previous->'financeEntries','[]'::jsonb)) r where r->>'bookingId'=old->>'id')) and not exists(select 1 from jsonb_array_elements(next_data->'events') fresh where fresh->>'id'=old->>'id' and fresh->'paid'=old->'paid')) then raise exception 'Keep bookings and their previous payment totals. Add payments or refunds instead.';end if;
end $$;

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

revoke all on function public.catering_validate_finance(jsonb),public.catering_finance_transition(jsonb,jsonb) from public,anon,authenticated;
