-- Tablecloth shapes and saved shopping plans. Apply after 001_companies.sql.
-- Existing bookings without a shape keep their original rules and stock history.
create or replace function public.catering_validate_document(p jsonb)
returns void language plpgsql set search_path=pg_catalog,public
as $$
declare v_key text;v_row jsonb;v_line jsonb;v_kind text;v_count numeric;v_balance numeric;
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'version') is distinct from 'number' or p->>'version'<>'2' or octet_length(p::text)>8388608 then raise exception 'Unsupported or oversized company data.';end if;
 if not(p ? 'lastExport') or jsonb_typeof(p->'lastExport') not in ('string','null') or length(p->>'lastExport')>40 then raise exception 'Invalid backup metadata.';end if;
 if p ? 'shoppingPlans' then
  if jsonb_typeof(p->'shoppingPlans') is distinct from 'array' or jsonb_array_length(p->'shoppingPlans')>1000 then raise exception 'Invalid shopping plans.';end if;
  if (select count(*) from jsonb_array_elements(p->'shoppingPlans'))<>(select count(distinct x->>'id') from jsonb_array_elements(p->'shoppingPlans') x) then raise exception 'Duplicate shopping plan identifiers.';end if;
  for v_row in select value from jsonb_array_elements(p->'shoppingPlans') loop
   perform public.catering_text_fields(v_row,'{"id":100,"preset":20,"from":10,"to":10,"mode":20,"updatedAt":40}');
   if v_row->>'id' !~ '^[A-Za-z0-9_-]{1,100}$' or v_row->>'preset' not in ('next7','next3','week','all','custom') or v_row->>'mode' not in ('full','shortage') then raise exception 'Invalid shopping plan options.';end if;
   if (v_row->>'from'<>'' and v_row->>'from' !~ '^\d{4}-\d{2}-\d{2}$') or (v_row->>'to'<>'' and v_row->>'to' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid shopping dates.';end if;
   if jsonb_typeof(v_row->'includeCompleted') is distinct from 'boolean' or jsonb_typeof(v_row->'showCovered') is distinct from 'boolean' or jsonb_typeof(v_row->'selected') is distinct from 'array' or jsonb_array_length(v_row->'selected')>20000 or jsonb_typeof(v_row->'checks') is distinct from 'object' then raise exception 'Invalid shopping selection.';end if;
   if exists(select 1 from jsonb_array_elements(v_row->'selected') x where jsonb_typeof(x) is distinct from 'string' or x#>>'{}' !~ '^[A-Za-z0-9_-]{1,100}$') or exists(select 1 from jsonb_each(v_row->'checks') x where jsonb_typeof(x.value) is distinct from 'boolean') then raise exception 'Invalid shopping checkmarks.';end if;
  end loop;
 end if;
 foreach v_key in array array['customers','events','neighborhoods','suppliers','inventory','movements','purchaseOrders'] loop
  if jsonb_typeof(p->v_key) is distinct from 'array' or jsonb_array_length(p->v_key)>20000 then raise exception 'Invalid collection: %',v_key;end if;
  if exists(select 1 from jsonb_array_elements(p->v_key) r where jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string' or coalesce(r->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or r->>'id' in ('__proto__','constructor','prototype')) then raise exception 'Invalid record identifier.';end if;
  if (select count(*) from jsonb_array_elements(p->v_key))<>(select count(distinct r->>'id') from jsonb_array_elements(p->v_key) r) then raise exception 'Duplicate record identifier.';end if;
 end loop;
 if jsonb_typeof(p->'templates') is distinct from 'object' or jsonb_typeof(p->'settings') is distinct from 'object' then raise exception 'Missing settings or supply templates.';end if;
 perform public.catering_text_fields(p->'settings','{"companyName":200,"companyEmail":200,"companyPhone":100,"deliveryAddress":500}');
 for v_row in select value from jsonb_array_elements(p->'customers') loop
  perform public.catering_text_fields(v_row,'{"name":200,"phone":100,"email":200,"notes":10000}');
  if trim(v_row->>'name')='' then raise exception 'Customer name is required.';end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p->'neighborhoods') loop
  perform public.catering_text_fields(v_row,'{"name":200,"notes":10000}');
  if trim(v_row->>'name')='' or jsonb_typeof(v_row->'rates') is distinct from 'object' then raise exception 'Invalid neighborhood.';end if;
  for v_key in select key from jsonb_each(v_row->'rates') loop if v_key !~ '^[A-Za-z0-9_-]{1,100}$' or v_key in ('__proto__','constructor','prototype') then raise exception 'Invalid neighborhood item identifier.';end if;perform public.catering_amount(v_row->'rates',v_key);end loop;
 end loop;
 if (select count(*) from jsonb_array_elements(p->'neighborhoods'))<>(select count(distinct lower(n->>'name')) from jsonb_array_elements(p->'neighborhoods') n) then raise exception 'Duplicate neighborhood names.';end if;
 for v_row in select value from jsonb_array_elements(p->'suppliers') loop
  perform public.catering_text_fields(v_row,'{"name":200,"email":200,"phone":100,"address":500,"notes":10000}');perform public.catering_amount(v_row,'leadDays');
  if trim(v_row->>'name')='' or (v_row->>'email'<>'' and v_row->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid supplier contact.';end if;
 end loop;
 foreach v_kind in array array['bris','kiddush'] loop
  if jsonb_typeof(p->'templates'->v_kind) is distinct from 'array' or jsonb_array_length(p->'templates'->v_kind)>500 then raise exception 'Invalid supply template.';end if;
 end loop;
 if (select count(*) from jsonb_array_elements((p->'templates'->'bris')||(p->'templates'->'kiddush')))<>(select count(distinct i->>'id') from jsonb_array_elements((p->'templates'->'bris')||(p->'templates'->'kiddush')) i) then raise exception 'Duplicate template item identifiers.';end if;
 for v_row in select value from jsonb_array_elements(p->'inventory') loop
  perform public.catering_text_fields(v_row,'{"name":200,"sku":100,"unit":100,"location":200,"notes":10000}');
  perform public.catering_amount(v_row,'price',true);perform public.catering_amount(v_row,'reorderLevel');perform public.catering_amount(v_row,'packSize',false,true);
  if trim(v_row->>'name')='' or jsonb_typeof(v_row->'active') is distinct from 'boolean' or jsonb_typeof(v_row->'counted') is distinct from 'boolean' or not(v_row ? 'supplierId') or jsonb_typeof(v_row->'supplierId') not in ('null','string') then raise exception 'Invalid inventory record.';end if;
  if coalesce(v_row->>'type','') not in ('consumable','reusable') or jsonb_typeof(v_row->'packSize') is distinct from 'number' or (v_row->>'packSize')::numeric<=0 or coalesce(v_row->>'unit','')='' then raise exception 'Invalid inventory item.';end if;
  if v_row->>'supplierId' is not null and not exists(select 1 from jsonb_array_elements(p->'suppliers') x where x->>'id'=v_row->>'supplierId') then raise exception 'Inventory refers to an unknown supplier.';end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p->'events') loop
  if v_row ? 'tableclothChoice' and jsonb_typeof(v_row->'tableclothChoice') is distinct from 'string' then raise exception 'Invalid tablecloth choice.';end if;
  if coalesce(v_row->>'tableclothChoice','unspecified') not in ('unspecified','round','rectangular','mixed') then raise exception 'Invalid tablecloth choice.';end if;
  foreach v_key in array array['roundTables','rectangularTables'] loop
   if v_row->'counts' ? v_key then
    v_count:=public.catering_amount(v_row->'counts',v_key);
    if v_count<>trunc(v_count) then raise exception 'Tablecloth table counts must be whole numbers.';end if;
   end if;
  end loop;
  if coalesce(v_row->>'tableclothChoice','unspecified')='unspecified' then
   if coalesce((v_row->'counts'->>'roundTables')::numeric,0)<>0 or coalesce((v_row->'counts'->>'rectangularTables')::numeric,0)<>0 then raise exception 'Choose a tablecloth shape before assigning round or rectangular tables.';end if;
  else
   if coalesce((v_row->'counts'->>'roundTables')::numeric,0)+coalesce((v_row->'counts'->>'rectangularTables')::numeric,0)<>(v_row->'counts'->>'regular')::numeric+(v_row->'counts'->>'kids')::numeric+(v_row->'counts'->>'head')::numeric then raise exception 'Tablecloth counts must add up to the dining table count.';end if;
   if v_row->>'tableclothChoice'='round' and coalesce((v_row->'counts'->>'rectangularTables')::numeric,0)<>0 then raise exception 'Round-only bookings cannot contain rectangular tables.';end if;
   if v_row->>'tableclothChoice'='rectangular' and coalesce((v_row->'counts'->>'roundTables')::numeric,0)<>0 then raise exception 'Rectangular-only bookings cannot contain round tables.';end if;
  end if;
  if v_row ? 'tableclothSources' then
   if jsonb_typeof(v_row->'tableclothSources') is distinct from 'array' or jsonb_array_length(v_row->'tableclothSources')>500 then raise exception 'Invalid saved tablecloth sources.';end if;
   for v_line in select value from jsonb_array_elements(v_row->'tableclothSources') loop
    perform public.catering_text_fields(v_line,'{"id":100,"name":200,"unit":100,"category":20}');
    perform public.catering_amount(v_line,'rate');perform public.catering_amount(v_line,'packSize',false,true);perform public.catering_amount(v_line,'price',true);
    if v_line->>'basis'<>'table' or v_line->>'category'<>'Paper goods' or v_line->>'name' !~* 'table[[:space:]]*cloth' then raise exception 'Invalid original tablecloth supply.';end if;
   end loop;
  end if;
  perform public.catering_text_fields(v_row,'{"customerId":100,"date":10,"returnDate":10,"time":5,"location":500,"neighborhood":200,"notes":10000,"createdAt":40,"updatedAt":40,"sourceLabel":500}');
  perform public.catering_text_fields(v_row->'contact','{"name":200,"phone":100}');
  perform public.catering_amount(v_row,'quote',true);perform public.catering_amount(v_row,'paid');
  perform public.catering_text_fields(v_row->'fees','{"waiterNames":1000,"waiterBasis":20}');
  if v_row->'fees'->>'waiterBasis' not in ('event','hour') or (v_row->'fees'->>'waiterCount')::numeric<>trunc((v_row->'fees'->>'waiterCount')::numeric) then raise exception 'Invalid waiter fee basis or count.';end if;
  perform public.catering_text_fields(v_row->'feedback','{"notes":10000,"outcome":20}');
  if v_row->'feedback'->>'outcome' not in ('','good','mixed','improve') or jsonb_typeof(v_row->'feedback'->'items') is distinct from 'object' or jsonb_typeof(v_row->'packed') is distinct from 'object' then raise exception 'Invalid feedback or packing state.';end if;
  for v_key,v_line in select key,value from jsonb_each(v_row->'feedback'->'items') loop if v_key !~ '^[A-Za-z0-9_-]{1,100}$' or v_key in ('__proto__','constructor','prototype') then raise exception 'Invalid feedback item identifier.';end if;perform public.catering_amount(v_line,'short');perform public.catering_amount(v_line,'left');end loop;
  if exists(select 1 from jsonb_each(v_row->'packed') v where jsonb_typeof(v.value) is distinct from 'boolean') then raise exception 'Invalid packing check.';end if;
  if not exists(select 1 from jsonb_array_elements(p->'customers') c where c->>'id'=v_row->>'customerId') then raise exception 'Booking refers to an unknown customer.';end if;
  if coalesce(v_row->>'kind','') not in ('bris','kiddush') or coalesce(v_row->>'status','') not in ('booked','completed','cancelled') or jsonb_typeof(v_row->'items') is distinct from 'array' or jsonb_typeof(v_row->'counts') is distinct from 'object' or jsonb_typeof(v_row->'overrides') is distinct from 'object' then raise exception 'Invalid booking.';end if;
  for v_key in select key from jsonb_each((v_row->'overrides')||(v_row->'packed')) loop if v_key !~ '^[A-Za-z0-9_-]{1,100}$' or v_key in ('__proto__','constructor','prototype') then raise exception 'Invalid booking item identifier.';end if;end loop;
  if jsonb_array_length(v_row->'items')>500 or (select count(*) from jsonb_array_elements(v_row->'items'))<>(select count(distinct i->>'id') from jsonb_array_elements(v_row->'items') i) then raise exception 'Duplicate or excessive booking supply items.';end if;
  if v_row->>'time'<>'' and v_row->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid event time.';end if;
  if coalesce(v_row->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(v_row->>'returnDate','') !~ '^\d{4}-\d{2}-\d{2}$' or v_row->>'returnDate'<v_row->>'date' then raise exception 'Invalid event or return date.';end if;
  perform (v_row->>'date')::date;perform (v_row->>'returnDate')::date;
  foreach v_key in array array['regular','kids','head','coffee','adults','children'] loop
   if jsonb_typeof(v_row->'counts'->v_key) is distinct from 'number' then raise exception 'Invalid booking count.';end if;
   v_count:=(v_row->'counts'->>v_key)::numeric;
   if v_count<0 or v_count>100000000 or v_count<>trunc(v_count) then raise exception 'Invalid booking count.';end if;
  end loop;
  foreach v_key in array array['service','waiterCount','waiterRate','waiterHours'] loop
   if jsonb_typeof(v_row->'fees'->v_key) is distinct from 'number' or (v_row->'fees'->>v_key)::numeric<0 or (v_row->'fees'->>v_key)::numeric>100000000 then raise exception 'Invalid service or waiter fee.';end if;
  end loop;
  if exists(select 1 from jsonb_each(v_row->'overrides') o where jsonb_typeof(o.value) is distinct from 'number' or (o.value::text)::numeric<0 or (o.value::text)::numeric>100000000) then raise exception 'Invalid booking quantity override.';end if;
 end loop;
 for v_line in select value from jsonb_array_elements((p->'templates'->'bris')||(p->'templates'->'kiddush')||(select coalesce(jsonb_agg(i),'[]') from jsonb_array_elements(p->'events') e cross join lateral jsonb_array_elements(e->'items') i)) loop
  perform public.catering_text_fields(v_line,'{"name":200,"unit":100,"id":100,"category":20}');
  perform public.catering_amount(v_line,'price',true);perform public.catering_amount(v_line,'rate');perform public.catering_amount(v_line,'packSize',false,true);
  if trim(v_line->>'name')='' or trim(v_line->>'unit')='' or v_line->>'id' !~ '^[A-Za-z0-9_-]{1,100}$' or v_line->>'id' in ('__proto__','constructor','prototype') or v_line->>'category' not in ('Paper goods','Food','Drinks','Service') or not(v_line ? 'inventoryId') or jsonb_typeof(v_line->'inventoryId') not in ('null','string') then raise exception 'Invalid supply item.';end if;
  if coalesce(v_line->>'basis','') not in ('table','regular','kids','head','coffee','adults','children','guests','event','roundTables','rectangularTables') or jsonb_typeof(v_line->'rate') is distinct from 'number' or (v_line->>'rate')::numeric<0 or (v_line->>'rate')::numeric>100000000 or jsonb_typeof(v_line->'packSize') is distinct from 'number' or (v_line->>'packSize')::numeric<=0 then raise exception 'Invalid supply rule.';end if;
  if v_line->>'inventoryId' is not null and not exists(select 1 from jsonb_array_elements(p->'inventory') i where i->>'id'=v_line->>'inventoryId') then raise exception 'Supply refers to missing inventory.';end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p->'purchaseOrders') loop
  perform public.catering_text_fields(v_row,'{"supplierId":100,"number":100,"deliveryDate":10,"deliveryAddress":500,"notes":10000,"subject":500,"body":30000,"createdAt":40,"updatedAt":40}');
  if v_row->>'deliveryDate'<>'' and v_row->>'deliveryDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid delivery date.';end if;
  if jsonb_typeof(v_row->'bookingIds') is distinct from 'array' or exists(select 1 from jsonb_array_elements(v_row->'bookingIds') b where jsonb_typeof(b) is distinct from 'string') or exists(select 1 from jsonb_array_elements_text(v_row->'bookingIds') b where not exists(select 1 from jsonb_array_elements(p->'events') e where e->>'id'=b)) then raise exception 'Unknown booking in supplier order.';end if;
  if coalesce(v_row->>'status','') not in ('draft','ordered','partial','received','cancelled') or jsonb_typeof(v_row->'items') is distinct from 'array' or jsonb_array_length(v_row->'items')=0 then raise exception 'Invalid supplier purchase.';end if;
  if jsonb_array_length(v_row->'items')>500 or (select count(*) from jsonb_array_elements(v_row->'items'))<>(select count(distinct i->>'id') from jsonb_array_elements(v_row->'items') i) then raise exception 'Duplicate or excessive purchase lines.';end if;
  if not exists(select 1 from jsonb_array_elements(p->'suppliers') s where s->>'id'=v_row->>'supplierId') then raise exception 'Unknown purchase supplier.';end if;
  for v_line in select value from jsonb_array_elements(v_row->'items') loop
   perform public.catering_text_fields(v_line,'{"id":100,"inventoryId":100}');perform public.catering_amount(v_line,'price',true);perform public.catering_amount(v_line,'packs',false,true);perform public.catering_amount(v_line,'packSize',false,true);
   if not exists(select 1 from jsonb_array_elements(p->'inventory') i where i->>'id'=v_line->>'inventoryId') or jsonb_typeof(v_line->'packs') is distinct from 'number' or jsonb_typeof(v_line->'packSize') is distinct from 'number' or (v_line->>'packs')::numeric<=0 or (v_line->>'packs')::numeric<>trunc((v_line->>'packs')::numeric) or (v_line->>'packSize')::numeric<=0 then raise exception 'Invalid purchase line.';end if;
  end loop;
 end loop;
 for v_row in select value from jsonb_array_elements(p->'movements') loop
  perform public.catering_text_fields(v_row,'{"unit":100,"date":40,"notes":10000}');
  if not(v_row ? 'bookingId' and v_row ? 'orderId' and v_row ? 'lineId') then raise exception 'Missing stock movement references.';end if;
  if jsonb_typeof(v_row->'bookingId') not in ('null','string') or jsonb_typeof(v_row->'orderId') not in ('null','string') or jsonb_typeof(v_row->'lineId') not in ('null','string') then raise exception 'Invalid stock movement references.';end if;
  if coalesce(v_row->>'type','') not in ('opening','receive','adjust-in','adjust-out','issue','return','damage') or jsonb_typeof(v_row->'quantity') is distinct from 'number' or (v_row->>'quantity')::numeric<0 or (v_row->>'quantity')::numeric>100000000 then raise exception 'Invalid stock movement.';end if;
  if not exists(select 1 from jsonb_array_elements(p->'inventory') i where i->>'id'=v_row->>'inventoryId' and i->>'unit'=v_row->>'unit') then raise exception 'Stock item or stock unit no longer matches its history.';end if;
  if v_row->>'bookingId' is not null and not exists(select 1 from jsonb_array_elements(p->'events') e where e->>'id'=v_row->>'bookingId') then raise exception 'A booking with stock history cannot be deleted.';end if;
  if v_row->>'type' in ('issue','return','damage') and not exists(select 1 from jsonb_array_elements(p->'events') e cross join lateral jsonb_array_elements(e->'items') i where e->>'id'=v_row->>'bookingId' and i->>'inventoryId'=v_row->>'inventoryId') then raise exception 'Stock must be linked to a booking supply.';end if;
  if v_row->>'type'='receive' and not exists(select 1 from jsonb_array_elements(p->'purchaseOrders') po cross join lateral jsonb_array_elements(po->'items') i where po->>'id'=v_row->>'orderId' and po->>'status'<>'cancelled' and i->>'id'=v_row->>'lineId' and i->>'inventoryId'=v_row->>'inventoryId') then raise exception 'A receipt must match an active supplier order line.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p->'movements') m group by m->>'inventoryId' having sum(case when m->>'type' in ('opening','receive','adjust-in','return') then (m->>'quantity')::numeric when m->>'type' in ('issue','adjust-out') then -(m->>'quantity')::numeric else 0 end)<-0.000001) then raise exception 'Not enough stock on hand. Refresh inventory before issuing or adjusting stock.';end if;
 if exists(select 1 from jsonb_array_elements(p->'movements') m where m->>'type' in ('issue','return','damage') group by m->>'bookingId',m->>'inventoryId' having sum(case when m->>'type' in ('return','damage') then (m->>'quantity')::numeric else -(m->>'quantity')::numeric end)>0.000001) then raise exception 'Returns and damage exceed issued stock.';end if;
 if exists(
  select 1 from jsonb_array_elements(p->'purchaseOrders') po cross join lateral jsonb_array_elements(po->'items') i
  where coalesce((select sum((m->>'quantity')::numeric) from jsonb_array_elements(p->'movements') m where m->>'type'='receive' and m->>'orderId'=po->>'id' and m->>'lineId'=i->>'id'),0)>(i->>'packs')::numeric*(i->>'packSize')::numeric+0.000001
 ) then raise exception 'Received quantity exceeds the supplier order.';end if;
 if exists(
  with requirements as (
   select e->>'id' booking_id,i->>'inventoryId' stock_id,
    sum(case when e->'overrides' ? (i->>'id') then (e->'overrides'->>(i->>'id'))::numeric else round((i->>'rate')::numeric * case i->>'basis'
     when 'table' then (e->'counts'->>'regular')::numeric+(e->'counts'->>'kids')::numeric+(e->'counts'->>'head')::numeric
     when 'event' then 1 when 'guests' then (e->'counts'->>'adults')::numeric+(e->'counts'->>'children')::numeric
     else (e->'counts'->>(i->>'basis'))::numeric end,6) end) needed
   from jsonb_array_elements(p->'events') e cross join lateral jsonb_array_elements(e->'items') i where i->>'inventoryId' is not null group by e->>'id',i->>'inventoryId'
  ), issues as (select m->>'bookingId' booking_id,m->>'inventoryId' stock_id,sum((m->>'quantity')::numeric) qty from jsonb_array_elements(p->'movements') m where m->>'type'='issue' group by m->>'bookingId',m->>'inventoryId')
  select 1 from issues m left join requirements r using(booking_id,stock_id) where m.qty>coalesce(r.needed,0)+0.000001
 ) then raise exception 'Issued stock exceeds the booking requirement. Another device may have issued it already.';end if;
end $$;
