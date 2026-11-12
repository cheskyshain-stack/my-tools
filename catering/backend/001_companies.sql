-- Catering Planner company accounts and transactional document synchronization.
-- Run through the Supabase SQL migration interface. No private keys belong here.

create table if not exists public.catering_platform_admins (
 email text primary key check (email = lower(trim(email))),
 user_id uuid unique references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.catering_companies (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 200),
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now()
);
create table if not exists public.catering_members (
 company_id uuid not null references public.catering_companies(id),
 email text not null check (email = lower(trim(email))),
 user_id uuid references auth.users(id) on delete set null,
 role text not null check (role in ('admin','staff','viewer')),
 status text not null default 'active' check (status in ('active','disabled')),
 created_at timestamptz not null default now(),
 primary key (company_id,email)
);
create index if not exists catering_member_user_idx on public.catering_members(user_id);
create table if not exists public.catering_access_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 email text not null,
 company_name text not null check (length(trim(company_name)) between 1 and 200),
 status text not null default 'pending' check (status in ('pending','approved','declined')),
 company_id uuid references public.catering_companies(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id,company_name)
);
create table if not exists public.catering_documents (
 company_id uuid primary key references public.catering_companies(id),
 revision bigint not null default 0,
 data jsonb,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
create table if not exists public.catering_commits (
 company_id uuid not null references public.catering_companies(id),
 operation_id uuid not null,
 revision bigint not null,
 body_hash text not null,
 created_at timestamptz not null default now(),
 primary key(company_id,operation_id)
);
create table if not exists public.catering_audit (
 id bigint generated always as identity primary key,
 company_id uuid references public.catering_companies(id),
 actor_id uuid references auth.users(id),
 action text not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create or replace function public.catering_verified_email()
returns text language sql stable security definer set search_path=pg_catalog,public
as $$ select lower(u.email) from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null $$;

create or replace function public.catering_is_admin()
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$
 select public.catering_verified_email() is not null and exists (
  select 1 from public.catering_platform_admins a
  where a.user_id=auth.uid() or (a.user_id is null and a.email=public.catering_verified_email())
 )
$$;
create or replace function public.catering_can_read(p_company uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$
 select public.catering_verified_email() is not null and exists (
  select 1 from public.catering_companies c where c.id=p_company and c.status='active'
  and (public.catering_is_admin() or exists (
   select 1 from public.catering_members m where m.company_id=c.id and m.status='active'
   and (m.user_id=auth.uid() or (m.user_id is null and m.email=public.catering_verified_email()))
  ))
 )
$$;
create or replace function public.catering_can_write(p_company uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$
 select public.catering_can_read(p_company) and (public.catering_is_admin() or exists (
  select 1 from public.catering_members m where m.company_id=p_company and m.status='active'
  and m.role in ('admin','staff') and (m.user_id=auth.uid() or (m.user_id is null and m.email=public.catering_verified_email()))
 ))
$$;

alter table public.catering_platform_admins enable row level security;
alter table public.catering_companies enable row level security;
alter table public.catering_members enable row level security;
alter table public.catering_access_requests enable row level security;
alter table public.catering_documents enable row level security;
alter table public.catering_commits enable row level security;
alter table public.catering_audit enable row level security;

create policy catering_companies_read on public.catering_companies for select to authenticated
 using (public.catering_can_read(id) or public.catering_is_admin());
create policy catering_members_read on public.catering_members for select to authenticated
 using (public.catering_is_admin() or user_id=auth.uid());
create policy catering_requests_read on public.catering_access_requests for select to authenticated
 using (public.catering_is_admin() or user_id=auth.uid());
create policy catering_documents_read on public.catering_documents for select to authenticated
 using (public.catering_can_read(company_id));
create policy catering_audit_read on public.catering_audit for select to authenticated
 using (public.catering_is_admin());

-- No direct client writes to account, membership, document or audit tables.
revoke all on public.catering_platform_admins,public.catering_companies,public.catering_members,
 public.catering_access_requests,public.catering_documents,public.catering_commits,public.catering_audit from anon,authenticated;
grant select on public.catering_companies,public.catering_members,public.catering_access_requests,
 public.catering_documents,public.catering_audit to authenticated;

create or replace function public.catering_session()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_email text:=public.catering_verified_email();v_result jsonb;
begin
 if v_email is null then raise exception 'Verify your email address before signing in.' using errcode='42501';end if;
 update public.catering_platform_admins set user_id=auth.uid() where user_id is null and email=v_email;
 update public.catering_members set user_id=auth.uid() where user_id is null and email=v_email and status='active';
 select jsonb_build_object('userId',auth.uid(),'email',v_email,'isAdmin',public.catering_is_admin(),
  'companies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'status',c.status,
    'role',case when public.catering_is_admin() then 'admin' else (select m.role from public.catering_members m where m.company_id=c.id and m.user_id=auth.uid() and m.status='active' limit 1) end) order by c.name)
   from public.catering_companies c where public.catering_is_admin() or public.catering_can_read(c.id)),'[]'::jsonb)) into v_result;
 return v_result;
end $$;

create or replace function public.catering_request_access(p_company_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_email text:=public.catering_verified_email();v_id uuid;
begin
 if v_email is null then raise exception 'Verify your email first.' using errcode='42501';end if;
 if length(trim(p_company_name)) not between 1 and 200 then raise exception 'Enter a company name.';end if;
 insert into public.catering_access_requests(user_id,email,company_name)
 values(auth.uid(),v_email,trim(p_company_name)) on conflict(user_id,company_name)
 do update set status=case when catering_access_requests.status='approved' then 'approved' else 'pending' end,updated_at=now()
 returning id into v_id;
 return jsonb_build_object('id',v_id,'status','pending');
end $$;

create or replace function public.catering_admin_create_company(p_name text,p_owner_email text default '')
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_id uuid;v_email text:=lower(trim(p_owner_email));
begin
 if not public.catering_is_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 if length(trim(p_name)) not between 1 and 200 then raise exception 'Enter a company name.';end if;
 if v_email<>'' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid owner email.';end if;
 insert into public.catering_companies(name) values(trim(p_name)) returning id into v_id;
 insert into public.catering_documents(company_id) values(v_id);
 if v_email<>'' then insert into public.catering_members(company_id,email,role) values(v_id,v_email,'admin');end if;
 insert into public.catering_audit(company_id,actor_id,action,detail) values(v_id,auth.uid(),'company.created',jsonb_build_object('name',trim(p_name)));
 return v_id;
end $$;

create or replace function public.catering_admin_save_member(p_company uuid,p_email text,p_role text,p_status text default 'active')
returns void language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_email text:=lower(trim(p_email));v_user uuid;
begin
 if not public.catering_is_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 if p_role not in ('admin','staff','viewer') or p_status not in ('active','disabled') then raise exception 'Invalid member role or status.';end if;
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.';end if;
 select id into v_user from auth.users where lower(email)=v_email and email_confirmed_at is not null limit 1;
 insert into public.catering_members(company_id,email,user_id,role,status) values(p_company,v_email,v_user,p_role,p_status)
 on conflict(company_id,email) do update set role=excluded.role,status=excluded.status,
 user_id=coalesce(catering_members.user_id,excluded.user_id);
 insert into public.catering_audit(company_id,actor_id,action,detail) values(p_company,auth.uid(),'member.updated',jsonb_build_object('email',v_email,'role',p_role,'status',p_status));
end $$;

create or replace function public.catering_admin_approve_request(p_request uuid,p_company uuid default null,p_role text default 'admin')
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_request public.catering_access_requests;v_company uuid:=p_company;
begin
 if not public.catering_is_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 select * into v_request from public.catering_access_requests where id=p_request for update;
 if not found or v_request.status<>'pending' then raise exception 'This access request is no longer pending.';end if;
 if v_company is null then v_company:=public.catering_admin_create_company(v_request.company_name,'');end if;
 perform public.catering_admin_save_member(v_company,v_request.email,p_role,'active');
 update public.catering_access_requests set status='approved',company_id=v_company,updated_at=now() where id=p_request;
 return v_company;
end $$;
create or replace function public.catering_admin_decline_request(p_request uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public
as $$begin
 if not public.catering_is_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 update public.catering_access_requests set status='declined',updated_at=now() where id=p_request and status='pending';
end $$;
create or replace function public.catering_admin_company_status(p_company uuid,p_status text)
returns void language plpgsql security definer set search_path=pg_catalog,public
as $$begin
 if not public.catering_is_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 if p_status not in ('active','suspended') then raise exception 'Invalid company status.';end if;
 update public.catering_companies set status=p_status where id=p_company;
 insert into public.catering_audit(company_id,actor_id,action,detail) values(p_company,auth.uid(),'company.status',jsonb_build_object('status',p_status));
end $$;

create or replace function public.catering_text_fields(p jsonb,p_fields jsonb)
returns void language plpgsql set search_path=pg_catalog,public
as $$declare k text;v text;begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid record object.';end if;
 for k,v in select key,value from jsonb_each_text(p_fields) loop
  if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>v::integer then raise exception 'Invalid text field: %',k;end if;
 end loop;
end $$;
create or replace function public.catering_amount(p jsonb,p_key text,p_nullable boolean default false,p_positive boolean default false)
returns numeric language plpgsql set search_path=pg_catalog,public
as $$declare v numeric;begin
 if p_nullable and p ? p_key and jsonb_typeof(p->p_key)='null' then return null;end if;
 if jsonb_typeof(p->p_key) is distinct from 'number' then raise exception 'Invalid numeric field: %',p_key;end if;
 v:=(p->>p_key)::numeric;
 if v<0 or v>100000000 or (p_positive and v=0) then raise exception 'Invalid numeric field: %',p_key;end if;
 return v;
end $$;

-- Shared inventory validation runs inside the same transaction as the revision check.
create or replace function public.catering_validate_document(p jsonb)
returns void language plpgsql set search_path=pg_catalog,public
as $$
declare v_key text;v_row jsonb;v_line jsonb;v_kind text;v_count numeric;v_balance numeric;
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'version') is distinct from 'number' or p->>'version'<>'2' or octet_length(p::text)>8388608 then raise exception 'Unsupported or oversized company data.';end if;
 if not(p ? 'lastExport') or jsonb_typeof(p->'lastExport') not in ('string','null') or length(p->>'lastExport')>40 then raise exception 'Invalid backup metadata.';end if;
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
  if coalesce(v_line->>'basis','') not in ('table','regular','kids','head','coffee','adults','children','guests','event') or jsonb_typeof(v_line->'rate') is distinct from 'number' or (v_line->>'rate')::numeric<0 or (v_line->>'rate')::numeric>100000000 or jsonb_typeof(v_line->'packSize') is distinct from 'number' or (v_line->>'packSize')::numeric<=0 then raise exception 'Invalid supply rule.';end if;
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

revoke all on function public.catering_verified_email(),public.catering_is_admin(),public.catering_can_read(uuid),public.catering_can_write(uuid),
 public.catering_session(),public.catering_request_access(text),public.catering_admin_create_company(text,text),
 public.catering_admin_save_member(uuid,text,text,text),public.catering_admin_approve_request(uuid,uuid,text),
 public.catering_admin_decline_request(uuid),public.catering_admin_company_status(uuid,text),
 public.catering_validate_document(jsonb),public.catering_commit(uuid,bigint,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.catering_text_fields(jsonb,jsonb),public.catering_amount(jsonb,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.catering_verified_email(),public.catering_is_admin(),public.catering_can_read(uuid),public.catering_can_write(uuid),
 public.catering_session(),public.catering_request_access(text),public.catering_admin_create_company(text,text),
 public.catering_admin_save_member(uuid,text,text,text),public.catering_admin_approve_request(uuid,uuid,text),
 public.catering_admin_decline_request(uuid),public.catering_admin_company_status(uuid,text),public.catering_commit(uuid,bigint,uuid,jsonb) to authenticated;

-- Bootstrap only the owner's explicitly supplied email using a separate SQL action:
-- insert into public.catering_platform_admins(email) values(lower('<owner-email>'));
