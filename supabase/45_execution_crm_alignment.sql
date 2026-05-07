-- ============================================================
-- VILO CRM - Execution CRM alignment
-- Purpose: align the existing Supabase model with the clinical
-- research execution CRM surface without destructive changes.
-- Apply manually in Supabase after review.
-- ============================================================

-- Pipeline vocabulary requested for Vilo B2B.
alter type public.vilo_stage add value if not exists 'Budget / CTA';
alter type public.vilo_stage add value if not exists 'Startup';
alter type public.vilo_stage add value if not exists 'Active Study';
alter type public.vilo_stage add value if not exists 'Closed Won';

-- Opportunity types requested by the execution CRM.
alter type public.opportunity_type add value if not exists 'Study';
alter type public.opportunity_type add value if not exists 'Biospecimen';
alter type public.opportunity_type add value if not exists 'IVD';
alter type public.opportunity_type add value if not exists 'Partnership';
alter type public.opportunity_type add value if not exists 'Vendor';

-- Organization model alignment. Existing orgs already cover Sponsor/CRO/Lab/Partner.
alter type public.org_type add value if not exists 'Vendor';

alter table public.organizations
  add column if not exists status text default 'active';

alter table public.contacts
  add column if not exists status text default 'active';

alter table public.vilo_opportunities
  add column if not exists owner text,
  add column if not exists expected_revenue numeric(14,2),
  add column if not exists probability integer,
  add column if not exists next_step text,
  add column if not exists next_step_date date;

update public.vilo_opportunities
set expected_revenue = coalesce(expected_revenue, potential_value),
    probability = coalesce(
      probability,
      case status::text
        when 'Lead Identified' then 10
        when 'Outreach Sent' then 15
        when 'Response Received' then 25
        when 'Intro Call Pending' then 35
        when 'Feasibility Sent' then 45
        when 'Negotiation' then 65
        when 'Budget / CTA' then 65
        when 'Startup' then 80
        when 'Active Study' then 90
        when 'Activated' then 100
        when 'Closed Won' then 100
        else 0
      end
    ),
    next_step = coalesce(next_step, next_follow_up, notes),
    next_step_date = coalesce(next_step_date, next_followup_date)
where archived = false;

alter table public.studies
  add column if not exists sponsor_id uuid references public.organizations(id),
  add column if not exists cro_id uuid references public.organizations(id),
  add column if not exists opportunity_id uuid references public.vilo_opportunities(id),
  add column if not exists protocol_number text,
  add column if not exists indication text,
  add column if not exists expected_revenue numeric(14,2),
  add column if not exists actual_revenue numeric(14,2),
  add column if not exists margin numeric(14,2),
  add column if not exists startup_date date,
  add column if not exists activation_date date;

alter table public.tasks
  add column if not exists related_type text,
  add column if not exists related_id uuid,
  add column if not exists status text default 'open',
  add column if not exists next_action text,
  add column if not exists owner text,
  add column if not exists completed_at timestamptz;

update public.tasks
set status = case when done then 'completed' else coalesce(status, 'open') end,
    completed_at = case when done and completed_at is null then done_at else completed_at end
where true;

create table if not exists public.financials (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references public.studies(id),
  opportunity_id uuid references public.vilo_opportunities(id),
  expected_amount numeric(14,2),
  actual_amount numeric(14,2),
  category text not null default 'revenue',
  status text not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'financials'
      and policyname = 'financials_authenticated_all'
  ) then
    create policy financials_authenticated_all
      on public.financials
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
