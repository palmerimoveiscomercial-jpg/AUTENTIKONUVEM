begin;

create extension if not exists pgcrypto;

create table if not exists public.media_documents (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  process_id text not null,
  version integer not null check (version > 0),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  drive_file_id text,
  media_status text not null default 'PENDING',
  sync_state text not null default 'PENDING',
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.media_objects (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  process_id text not null,
  version integer not null check (version > 0),
  role text not null check (role in ('original', 'thumbnail', 'preview')),
  bucket text not null check (bucket in ('autentiko-originals', 'autentiko-thumbnails', 'autentiko-previews')),
  object_key text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version, role),
  unique (bucket, object_key)
);

create table if not exists public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  process_id text not null,
  version integer not null check (version > 0),
  job_type text not null,
  provider text not null check (provider in ('LOCAL', 'ADOBE')),
  state text not null default 'PENDING',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  error_code text,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version, job_type)
);

create table if not exists public.media_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  document_id text,
  process_id text,
  version integer,
  event_type text not null,
  result text not null,
  actor_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists media_documents_process_idx
  on public.media_documents (process_id, updated_at desc);
create index if not exists media_objects_lookup_idx
  on public.media_objects (document_id, version, state);
create index if not exists media_jobs_queue_idx
  on public.media_jobs (state, next_attempt_at);
create index if not exists media_events_document_idx
  on public.media_events (document_id, created_at desc);

alter table public.media_documents enable row level security;
alter table public.media_objects enable row level security;
alter table public.media_jobs enable row level security;
alter table public.media_events enable row level security;

revoke all on public.media_documents from anon, authenticated;
revoke all on public.media_objects from anon, authenticated;
revoke all on public.media_jobs from anon, authenticated;
revoke all on public.media_events from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'autentiko-originals',
    'autentiko-originals',
    false,
    104857600,
    array['application/pdf','image/jpeg','image/png','image/webp','image/avif']
  ),
  (
    'autentiko-thumbnails',
    'autentiko-thumbnails',
    false,
    81920,
    array['image/jpeg','image/webp','image/avif']
  ),
  (
    'autentiko-previews',
    'autentiko-previews',
    false,
    26214400,
    array['application/pdf']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Não são criadas policies públicas. A API usa service_role e entrega apenas
-- URLs assinadas, após validar o ticket temporário do AUTENTIKO.

create or replace view public.adobe_monthly_usage
with (security_invoker = true) as
select
  date_trunc('month', created_at) as month,
  count(*)::bigint as transactions
from public.media_events
where event_type = 'ADOBE_TRANSACTION'
  and result = 'SUCCESS'
group by 1;

commit;
