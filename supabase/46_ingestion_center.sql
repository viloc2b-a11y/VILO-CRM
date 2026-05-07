-- ============================================================
-- VILO CRM - Ingestion Center
-- Staging queue for manual, CSV, future email/PDF/API ingestion.
-- Review and apply manually in Supabase. Do not expose service keys.
-- ============================================================

create table if not exists public.ingestion_staging (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('manual', 'csv', 'email', 'pdf', 'api')),
  entity_type text not null check (entity_type in ('organization', 'contact', 'opportunity', 'study', 'task', 'financial')),
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'invalid', 'needs_review', 'imported')),
  validation_errors jsonb not null default '[]'::jsonb,
  duplicate_match_id uuid,
  imported_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ingestion_staging enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ingestion_staging'
      and policyname = 'ingestion_staging_authenticated_all'
  ) then
    create policy ingestion_staging_authenticated_all
      on public.ingestion_staging
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

create index if not exists idx_ingestion_staging_status
  on public.ingestion_staging(validation_status, created_at desc);

create index if not exists idx_ingestion_staging_entity
  on public.ingestion_staging(entity_type, source_type, created_at desc);

-- Optional compatibility columns for a more generic activity-log shape.
alter table public.activity_log
  add column if not exists related_type text,
  add column if not exists related_id uuid,
  add column if not exists activity_type text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists created_by uuid;

update public.activity_log
set related_type = coalesce(related_type, entity_type),
    related_id = coalesce(related_id, entity_id),
    activity_type = coalesce(activity_type, action),
    title = coalesce(title, entity_label),
    description = coalesce(description, metadata->>'description')
where related_type is null
   or activity_type is null
   or title is null;
