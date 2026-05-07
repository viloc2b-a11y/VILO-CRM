-- ============================================================
-- VILO CRM - Organization-centric CRM hardening
-- Review and apply manually. This does not delete data.
-- Make org_id required only after cleanup/backfill is complete.
-- ============================================================

-- Compatibility aliases for requested parent-child relationships.
alter table public.contacts
  add column if not exists organization_id uuid;

update public.contacts
set organization_id = coalesce(organization_id, org_id)
where organization_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_organization_id_fk'
  ) then
    alter table public.contacts
      add constraint contacts_organization_id_fk
      foreign key (organization_id) references public.organizations(id)
      not valid;
  end if;
end $$;

alter table public.vilo_opportunities
  add column if not exists organization_id uuid,
  add column if not exists name text,
  add column if not exists status_text text,
  add column if not exists stage_updated_at timestamptz;

update public.vilo_opportunities
set organization_id = coalesce(organization_id, org_id),
    name = coalesce(name, company_name || ' opportunity'),
    stage_updated_at = coalesce(stage_updated_at, updated_at)
where true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vilo_opportunities_organization_id_fk'
  ) then
    alter table public.vilo_opportunities
      add constraint vilo_opportunities_organization_id_fk
      foreign key (organization_id) references public.organizations(id)
      not valid;
  end if;
end $$;

-- Keep org_id and organization_id synchronized while older code still uses org_id.
create or replace function public.sync_vilo_opportunity_organization_id()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null then
    new.organization_id := new.org_id;
  end if;
  if new.org_id is null then
    new.org_id := new.organization_id;
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    new.stage_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_vilo_opportunity_organization_id on public.vilo_opportunities;
create trigger trg_sync_vilo_opportunity_organization_id
before insert or update on public.vilo_opportunities
for each row execute function public.sync_vilo_opportunity_organization_id();

create index if not exists idx_contacts_organization_id on public.contacts(organization_id);
create index if not exists idx_vilo_opportunities_organization_id on public.vilo_opportunities(organization_id);
create index if not exists idx_vilo_opportunities_org_stage on public.vilo_opportunities(organization_id, status);
create index if not exists idx_vilo_opportunities_stage_updated_at on public.vilo_opportunities(stage_updated_at);

-- Duplicate detection helpers.
create index if not exists idx_organizations_normalized_name
  on public.organizations (lower(name))
  where archived = false;

create index if not exists idx_contacts_org_email
  on public.contacts(organization_id, lower(email))
  where archived = false and email is not null;

create index if not exists idx_contacts_org_phone
  on public.contacts(organization_id, phone)
  where archived = false and phone is not null;

create index if not exists idx_opportunities_org_name
  on public.vilo_opportunities(organization_id, lower(name))
  where archived = false;

-- Generic task/activity relationships for organization workspaces.
alter table public.tasks
  add column if not exists related_type text,
  add column if not exists related_id uuid,
  add column if not exists owner text,
  add column if not exists next_action text,
  add column if not exists completed_at timestamptz;

alter table public.activity_log
  add column if not exists related_type text,
  add column if not exists related_id uuid,
  add column if not exists activity_type text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists created_by uuid;

-- Optional cleanup gate: inspect before enforcing NOT NULL.
-- select id, company_name from public.vilo_opportunities where organization_id is null and archived = false;
-- alter table public.vilo_opportunities alter column organization_id set not null;
-- alter table public.contacts alter column organization_id set not null;
