begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.search_records (
  tenant_id text not null default 'PALMER',
  source_type text not null,
  source_id text not null,
  protocol text not null default '',
  document_digits text not null default '',
  title text not null default '',
  status text not null default '',
  source_updated_at timestamptz not null,
  search_text text not null default '',
  search_vector tsvector generated always as (to_tsvector('simple', search_text)) stored,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, source_type, source_id),
  check (source_type ~ '^[A-Z0-9_]+$'),
  check (document_digits ~ '^\d*$')
);

create index if not exists search_records_cursor_idx
  on public.search_records (tenant_id, updated_at desc, source_id desc);
create index if not exists search_records_type_cursor_idx
  on public.search_records (tenant_id, source_type, updated_at desc, source_id desc);
create index if not exists search_records_protocol_idx
  on public.search_records (tenant_id, protocol) where protocol <> '';
create index if not exists search_records_document_idx
  on public.search_records (tenant_id, document_digits) where document_digits <> '';
create index if not exists search_records_status_idx
  on public.search_records (tenant_id, source_type, status);
create index if not exists search_records_fts_idx
  on public.search_records using gin (search_vector);
create index if not exists search_records_trgm_idx
  on public.search_records using gin (search_text gin_trgm_ops);
create index if not exists search_records_payload_idx
  on public.search_records using gin (payload jsonb_path_ops);

create table if not exists public.sync_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  source text not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  record_count integer not null check (record_count between 1 and 500),
  status text not null check (status in ('ACCEPTED', 'COMPLETED', 'FAILED')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists sync_events_created_idx
  on public.sync_events (created_at desc);

create sequence if not exists public.contract_number_seq start with 1;

create table if not exists public.contract_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  process_id text,
  proposal_id text,
  requested_by text not null,
  final boolean not null default false,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('PROCESSING', 'COMPLETED', 'FAILED')),
  result_contract_id uuid,
  error_code text,
  error_summary text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists contract_jobs_process_idx
  on public.contract_jobs (process_id, created_at desc);
create index if not exists contract_jobs_status_idx
  on public.contract_jobs (status, updated_at);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  source_process_id text not null,
  source_process_version integer not null check (source_process_version >= 1),
  proposal_id text,
  number text not null unique,
  revision integer not null check (revision >= 1),
  template_code text not null,
  template_version integer not null check (template_version >= 1),
  status text not null check (status in ('MINUTA_GERADA', 'EMITIDO_AGUARDANDO_DRIVE', 'ARQUIVADO', 'SUBSTITUIDO')),
  snapshot jsonb not null,
  html text not null,
  html_hash text not null check (html_hash ~ '^[a-f0-9]{64}$'),
  findings jsonb not null default '[]'::jsonb,
  drive_doc_id text,
  drive_pdf_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contract_jobs
  drop constraint if exists contract_jobs_result_contract_fk;
alter table public.contract_jobs
  add constraint contract_jobs_result_contract_fk
  foreign key (result_contract_id) references public.contracts(id);

create index if not exists contracts_process_idx
  on public.contracts (source_process_id, created_at desc);
create index if not exists contracts_status_idx
  on public.contracts (status, created_at desc);
create index if not exists contracts_snapshot_idx
  on public.contracts using gin (snapshot jsonb_path_ops);

create table if not exists public.api_usage (
  id bigint generated always as identity primary key,
  request_id text,
  action text not null,
  status_code integer not null,
  duration_ms integer not null check (duration_ms >= 0),
  result_count integer,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_action_created_idx
  on public.api_usage (action, created_at desc);

create table if not exists public.provider_cache (
  request_hash text primary key check (request_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('BRASIL_API', 'CGU', 'DATAJUD')),
  resource text not null,
  response_status text not null check (response_status in ('FOUND', 'NOT_FOUND')),
  response_body jsonb,
  source_http_status integer not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists provider_cache_expiry_idx
  on public.provider_cache (expires_at);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  provider text not null check (provider in ('GEMINI', 'OPENROUTER')),
  model text not null,
  process_id text,
  contract_id text,
  requested_by text not null,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text check (output_hash ~ '^[a-f0-9]{64}$'),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  analysis jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_process_created_idx
  on public.ai_usage (process_id, created_at desc);
create index if not exists ai_usage_provider_created_idx
  on public.ai_usage (provider, created_at desc);

-- O backend usa uma credencial PostgreSQL privada. Nenhuma tabela é exposta
-- diretamente ao navegador; toda autorização ocorre nas Vercel Functions.
revoke all on table public.search_records, public.sync_events, public.contract_jobs,
  public.contracts, public.api_usage, public.provider_cache, public.ai_usage from public;
revoke all on sequence public.contract_number_seq from public;

commit;
