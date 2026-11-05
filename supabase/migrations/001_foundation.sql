-- Review and apply to a separate DEVELOPMENT Supabase project first.
-- No public/demo data is imported automatically. No paid resources are provisioned.
begin;
create table public.tenants (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), created_at timestamptz not null default now()
);
create table public.memberships (
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check(role in ('owner','editor','viewer')), primary key(tenant_id,user_id)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants,
  name text not null check(length(name) between 1 and 120), revision integer not null default 0,
  settings jsonb not null default '{"readBriefings":{"morning":false,"evening":false}}', created_at timestamptz not null default now()
);
create table public.field_updates (
  project_id uuid not null references public.projects on delete cascade, id text not null check(length(id) between 1 and 100),
  payload jsonb not null check(jsonb_typeof(payload)='object' and length(payload->>'text')<=4000),
  created_by uuid references auth.users, created_at timestamptz not null default now(), primary key(project_id,id)
);
create table public.work_items (
  project_id uuid not null references public.projects on delete cascade,
  collection text not null check(collection in ('tasks','commitments','events','reminders','risks','journal')),
  id text not null check(length(id) between 1 and 100), payload jsonb not null,
  created_at timestamptz not null default now(), primary key(project_id,collection,id),
  check(jsonb_typeof(payload)='object' and length(payload->>'title') between 1 and 1000),
  check(collection='risks' or payload->>'status' in ('pending','scheduled','confirmed','completed'))
);
create table public.delivery_preferences (
  project_id uuid not null references public.projects on delete cascade, user_id uuid not null references auth.users on delete cascade,
  morning_time time not null default '06:30', evening_time time not null default '17:30', timezone text not null default 'America/New_York',
  sms_opt_in boolean not null default false, consent_recorded_at timestamptz, primary key(project_id,user_id),
  check(not sms_opt_in or consent_recorded_at is not null)
);
-- Phone verification is a separate service-owned record, never a user-editable preference.
create table public.verified_phones (
  user_id uuid primary key references auth.users on delete cascade, phone text unique not null,
  verified_at timestamptz not null, provider_opt_out boolean not null default false
);
create table public.message_log (
  provider_id text primary key, user_id uuid references auth.users, direction text not null check(direction in ('inbound','outbound')),
  command text not null, body text not null check(length(body)<=4000), created_at timestamptz not null default now()
);
create table public.billing_accounts (
  tenant_id uuid primary key references public.tenants, stripe_customer_id text unique, stripe_subscription_id text unique,
  status text not null default 'inactive', trial_start timestamptz, trial_end timestamptz, last_event_at bigint not null default 0
);
create table public.provider_events (
  id text primary key, provider text not null, received_at timestamptz not null default now()
);
create table public.delivery_outbox (
  idempotency_key text primary key, tenant_id uuid references public.tenants, user_id uuid references auth.users,
  kind text not null, payload jsonb not null, status text not null default 'pending' check(status in ('pending','sent','failed')),
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key, project_id uuid references public.projects, user_id uuid references auth.users,
  revision integer not null, created_at timestamptz not null default now()
);
create index memberships_user on public.memberships(user_id,tenant_id);
create index work_items_project on public.work_items(project_id,collection);
create index field_updates_project on public.field_updates(project_id,created_at);

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.field_updates enable row level security;
alter table public.work_items enable row level security;
alter table public.delivery_preferences enable row level security;
alter table public.verified_phones enable row level security;
alter table public.message_log enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.provider_events enable row level security;
alter table public.delivery_outbox enable row level security;
alter table public.audit_log enable row level security;

create policy own_membership on public.memberships for select to authenticated using(user_id=auth.uid());
create policy tenant_read on public.tenants for select to authenticated using(exists(select 1 from public.memberships m where m.tenant_id=tenants.id and m.user_id=auth.uid()));
create policy project_read on public.projects for select to authenticated using(exists(select 1 from public.memberships m where m.tenant_id=projects.tenant_id and m.user_id=auth.uid()));
create policy item_read on public.work_items for select to authenticated using(exists(select 1 from public.projects p where p.id=work_items.project_id));
create policy note_read on public.field_updates for select to authenticated using(exists(select 1 from public.projects p where p.id=field_updates.project_id));
create policy preferences_own on public.delivery_preferences for all to authenticated using(user_id=auth.uid() and exists(select 1 from public.projects p where p.id=delivery_preferences.project_id)) with check(user_id=auth.uid() and exists(select 1 from public.projects p where p.id=delivery_preferences.project_id));
create policy phone_read on public.verified_phones for select to authenticated using(user_id=auth.uid());
create policy messages_own on public.message_log for select to authenticated using(user_id=auth.uid());
create policy billing_read on public.billing_accounts for select to authenticated using(exists(select 1 from public.memberships m where m.tenant_id=billing_accounts.tenant_id and m.user_id=auth.uid() and m.role='owner'));
create policy audit_read on public.audit_log for select to authenticated using(exists(select 1 from public.projects p where p.id=audit_log.project_id));
-- No browser write policy for membership, billing, verified phones, provider events,
-- messages, audit or outbox. No anonymous policies. No user can elevate their role.
revoke all on public.tenants,public.memberships,public.projects,public.field_updates,public.work_items,public.delivery_preferences,public.verified_phones,public.message_log,public.billing_accounts,public.provider_events,public.delivery_outbox,public.audit_log from anon,authenticated;
grant select on public.tenants,public.memberships,public.projects,public.field_updates,public.work_items,public.delivery_preferences,public.verified_phones,public.message_log,public.billing_accounts,public.audit_log to authenticated;
grant insert,update,delete on public.delivery_preferences to authenticated;
grant all on public.tenants,public.memberships,public.projects,public.field_updates,public.work_items,public.delivery_preferences,public.verified_phones,public.message_log,public.billing_accounts,public.provider_events,public.delivery_outbox,public.audit_log to service_role;
grant usage,select on all sequences in schema public to service_role;

create function public.bootstrap_workspace(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid; project uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if length(trim(p_name)) not between 1 and 120 then raise exception 'Invalid name'; end if;
  insert into public.tenants(name) values(trim(p_name)) returning id into tenant;
  insert into public.memberships values(tenant,auth.uid(),'owner');
  insert into public.projects(tenant_id,name) values(tenant,trim(p_name)) returning id into project;
  return project;
end $$;

create function public.get_workspace(p_project uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('project',jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'name',p.name),'revision',p.revision,'state',
 jsonb_build_object('schemaVersion',2,
 'tasks',coalesce((select jsonb_agg(payload order by created_at desc,id) from public.work_items where project_id=p.id and collection='tasks'),'[]'::jsonb),
 'commitments',coalesce((select jsonb_agg(payload order by created_at desc,id) from public.work_items where project_id=p.id and collection='commitments'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(payload order by created_at desc,id) from public.work_items where project_id=p.id and collection='events'),'[]'::jsonb),
 'reminders',coalesce((select jsonb_agg(payload order by created_at desc,id) from public.work_items where project_id=p.id and collection='reminders'),'[]'::jsonb),
 'risks',coalesce((select jsonb_agg(payload order by created_at desc,id) from public.work_items where project_id=p.id and collection='risks'),'[]'::jsonb),
 'journal',coalesce((select jsonb_agg(payload order by created_at desc,id) from public.work_items where project_id=p.id and collection='journal'),'[]'::jsonb),
 'activities',coalesce((select jsonb_agg(payload order by created_at desc,id) from public.field_updates where project_id=p.id),'[]'::jsonb),
 'readBriefings',p.settings->'readBriefings')) from public.projects p where p.id=p_project;
$$;

create function public.apply_workspace(p_project uuid,p_revision integer,p_state jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare project public.projects; bucket text; item jsonb; note jsonb; count_items integer:=0;
begin
  select p.* into project from public.projects p join public.memberships m on m.tenant_id=p.tenant_id where p.id=p_project and m.user_id=auth.uid() and m.role in ('owner','editor') for update of p;
  if not found then raise insufficient_privilege; end if;
  if project.revision<>p_revision then raise exception using errcode='40001',message='Revision conflict'; end if;
  if p_state->>'schemaVersion'<>'2' or jsonb_typeof(p_state->'activities')<>'array' or jsonb_array_length(p_state->'activities')>2000 then raise exception 'Invalid workspace'; end if;
  -- Existing notes must be present byte-for-byte at the JSON value level.
  if exists(select 1 from public.field_updates f where f.project_id=p_project and not exists(select 1 from jsonb_array_elements(p_state->'activities') n where n->>'id'=f.id and n=f.payload)) then raise exception 'Original notes are immutable'; end if;
  for note in select * from jsonb_array_elements(p_state->'activities') loop
    if note->>'id' is null or note->>'text' is null then raise exception 'Invalid note'; end if;
    insert into public.field_updates(project_id,id,payload,created_by) values(p_project,note->>'id',note,auth.uid()) on conflict(project_id,id) do nothing;
  end loop;
  foreach bucket in array array['tasks','commitments','events','reminders','risks','journal'] loop
    if jsonb_typeof(p_state->bucket) is distinct from 'array' then raise exception 'Invalid collection'; end if;
    count_items:=count_items+jsonb_array_length(p_state->bucket);
    if count_items>3000 then raise exception 'Workspace limits reached'; end if;
    delete from public.work_items w where w.project_id=p_project and w.collection=bucket and not exists(select 1 from jsonb_array_elements(p_state->bucket) n where n->>'id'=w.id);
    for item in select * from jsonb_array_elements(p_state->bucket) loop
      if item->>'id' is null or item->>'title' is null then raise exception 'Invalid item'; end if;
      insert into public.work_items(project_id,collection,id,payload) values(p_project,bucket,item->>'id',item) on conflict(project_id,collection,id) do update set payload=excluded.payload;
    end loop;
  end loop;
  update public.projects set revision=revision+1,settings=jsonb_build_object('readBriefings',p_state->'readBriefings') where id=p_project;
  insert into public.audit_log(project_id,user_id,revision) values(p_project,auth.uid(),p_revision+1);
  return p_revision+1;
end $$;

create function public.record_sms_webhook(p_sid text,p_phone text,p_command text,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid; inserted integer;
begin
  select user_id into recipient from public.verified_phones where phone=p_phone;
  insert into public.message_log(provider_id,user_id,direction,command,body) values(p_sid,recipient,'inbound',p_command,left(p_body,4000)) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return; end if;
  if p_command in ('stop','start') then update public.verified_phones set provider_opt_out=(p_command='stop') where phone=p_phone; end if;
  -- START never changes app consent. User opt-in AND verified phone are still required.
end $$;

create function public.record_stripe_event(p_event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare inserted integer; subscription jsonb:=p_event->'sitemind_subscription'; tenant uuid;
begin
  insert into public.provider_events(id,provider) values(p_event->>'id','stripe') on conflict do nothing;
  get diagnostics inserted=row_count;if inserted=0 then return;end if;
  if subscription is null then return;end if;
  tenant:=(subscription->'metadata'->>'tenant_id')::uuid;
  -- The API obtains this canonical test subscription using a server key before
  -- calling this service-role-only function. Duplicates remain idempotent.
  insert into public.billing_accounts(tenant_id,stripe_customer_id,stripe_subscription_id,status,trial_start,trial_end,last_event_at)
  values(tenant,subscription->>'customer',subscription->>'id',subscription->>'status',to_timestamp((subscription->>'trial_start')::double precision),to_timestamp((subscription->>'trial_end')::double precision),(p_event->>'created')::bigint)
  on conflict(tenant_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,status=excluded.status,trial_start=excluded.trial_start,trial_end=excluded.trial_end,last_event_at=excluded.last_event_at
  where public.billing_accounts.last_event_at<=excluded.last_event_at;
end $$;
revoke all on function public.bootstrap_workspace(text),public.get_workspace(uuid),public.apply_workspace(uuid,integer,jsonb),public.record_sms_webhook(text,text,text,text),public.record_stripe_event(jsonb) from public,anon,authenticated;
grant execute on function public.bootstrap_workspace(text),public.get_workspace(uuid),public.apply_workspace(uuid,integer,jsonb) to authenticated;
grant execute on function public.record_sms_webhook(text,text,text,text),public.record_stripe_event(jsonb) to service_role;
commit;
