-- ============================================================
-- Vacancy Monitoring System — Supabase schema
-- Run this once against your Supabase project via the SQL editor
-- or the Supabase CLI: supabase db push
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for fuzzy company name search

-- ── vacancies ─────────────────────────────────────────────────────────────
create table if not exists vacancies (
  id                    uuid          primary key default uuid_generate_v4(),
  vacancy_id            text          not null unique, -- indeed_{jobKey}
  source                text          not null default 'indeed.nl',
  url                   text          not null,
  title                 text          not null,
  company_name          text          not null,
  location              text,
  sector                text,
  search_term           text,
  snippet               text,
  posted_at             timestamptz,
  raw_date              text,
  scraped_at            timestamptz   not null default now(),

  -- Status machine: new → enriching → enriched → lead_created → contacted → converted | rejected
  status                text          not null default 'new'
                          check (status in (
                            'new', 'enriching', 'enriched',
                            'lead_created', 'crm_duplicate',
                            'contacted', 'converted', 'rejected'
                          )),
  status_new_at         timestamptz,
  status_enriching_at   timestamptz,
  status_enriched_at    timestamptz,
  status_lead_created_at timestamptz,
  status_contacted_at   timestamptz,
  status_converted_at   timestamptz,
  status_rejected_at    timestamptz,

  -- Enrichment fields (filled by Clay callback)
  contact_name          text,
  contact_first_name    text,
  contact_email         text,
  email_valid           boolean       default false,
  linkedin_url          text,
  company_website       text,
  company_size          text,

  -- CRM
  simplicate_lead_id    text,

  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

-- Trigger to keep updated_at current
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vacancies_updated_at
  before update on vacancies
  for each row execute procedure set_updated_at();

-- Indexes
create index if not exists vacancies_status_idx        on vacancies (status);
create index if not exists vacancies_company_name_idx  on vacancies (company_name);
create index if not exists vacancies_sector_idx        on vacancies (sector);
create index if not exists vacancies_scraped_at_idx    on vacancies (scraped_at desc);
create index if not exists vacancies_email_valid_idx   on vacancies (email_valid) where email_valid = true;

-- ── logs ──────────────────────────────────────────────────────────────────
create table if not exists logs (
  id          bigserial     primary key,
  level       text          not null check (level in ('debug', 'info', 'warn', 'error')),
  module      text          not null,
  message     text          not null,
  data        jsonb,
  created_at  timestamptz   not null default now()
);

create index if not exists logs_level_idx      on logs (level);
create index if not exists logs_module_idx     on logs (module);
create index if not exists logs_created_at_idx on logs (created_at desc);

-- ── run_summaries ──────────────────────────────────────────────────────────
create table if not exists run_summaries (
  id                  bigserial   primary key,
  scraped             integer     not null default 0,
  new_vacancies       integer     not null default 0,
  enriched            integer     not null default 0,
  leads_created       integer     not null default 0,
  outreach_triggered  integer     not null default 0,
  errors              integer     not null default 0,
  run_at              timestamptz not null default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────
-- The service role key bypasses RLS; enable it so anon key cannot read data.
alter table vacancies       enable row level security;
alter table logs            enable row level security;
alter table run_summaries   enable row level security;

-- Allow only the service role (used by the backend) to read/write
create policy "service role only" on vacancies
  using (auth.role() = 'service_role');

create policy "service role only" on logs
  using (auth.role() = 'service_role');

create policy "service role only" on run_summaries
  using (auth.role() = 'service_role');

-- ── Convenience view: 30-day cooldown check ───────────────────────────────
create or replace view recent_companies as
select distinct lower(trim(company_name)) as company_name_lower
from vacancies
where status <> 'rejected'
  and created_at >= now() - interval '30 days';
