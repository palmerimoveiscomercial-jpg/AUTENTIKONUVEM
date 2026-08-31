begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create schema if not exists autentiko;

create table if not exists autentiko.tenants (
  tenant_id text primary key,
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into autentiko.tenants (tenant_id, name) values ('PALMER', 'PALMER IMÓVEIS')
on conflict (tenant_id) do nothing;

create table if not exists autentiko.users (
  tenant_id text not null references autentiko.tenants(tenant_id),
  user_id text not null,
  full_name text not null default '',
  email text not null default '',
  username text not null default '',
  role text not null default '',
  status text not null default '',
  permissions jsonb not null default '[]'::jsonb,
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create unique index if not exists aut_users_email_uidx on autentiko.users (tenant_id, lower(email)) where email <> '';
create index if not exists aut_users_status_role_idx on autentiko.users (tenant_id, status, role);
create index if not exists aut_users_name_trgm_idx on autentiko.users using gin (full_name gin_trgm_ops);

create table if not exists autentiko.clients (
  tenant_id text not null references autentiko.tenants(tenant_id),
  client_id text not null,
  person_type text not null default 'PF',
  full_name text not null default '',
  cpf_cnpj text not null default '',
  document_digits text generated always as (regexp_replace(cpf_cnpj, '\D', '', 'g')) stored,
  email text not null default '',
  phone text not null default '',
  address jsonb not null default '{}'::jsonb,
  roles jsonb not null default '[]'::jsonb,
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, client_id)
);
create unique index if not exists aut_clients_document_uidx on autentiko.clients (tenant_id, document_digits) where document_digits <> '';
create index if not exists aut_clients_name_trgm_idx on autentiko.clients using gin (full_name gin_trgm_ops);
create index if not exists aut_clients_email_idx on autentiko.clients (tenant_id, lower(email)) where email <> '';
create index if not exists aut_clients_roles_idx on autentiko.clients using gin (roles jsonb_path_ops);

create table if not exists autentiko.properties (
  tenant_id text not null references autentiko.tenants(tenant_id),
  property_id text not null,
  internal_code text not null default '',
  capture_id text not null default '',
  property_type text not null default '',
  status text not null default '',
  full_address text not null default '',
  address jsonb not null default '{}'::jsonb,
  registration text not null default '',
  water_registration text not null default '',
  consumer_unit text not null default '',
  owner_client_id text,
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, property_id)
);
create unique index if not exists aut_properties_code_uidx on autentiko.properties (tenant_id, upper(internal_code)) where internal_code <> '';
create index if not exists aut_properties_capture_idx on autentiko.properties (tenant_id, capture_id) where capture_id <> '';
create index if not exists aut_properties_status_type_idx on autentiko.properties (tenant_id, status, property_type);
create index if not exists aut_properties_address_trgm_idx on autentiko.properties using gin (full_address gin_trgm_ops);
create index if not exists aut_properties_payload_idx on autentiko.properties using gin (payload jsonb_path_ops);

create table if not exists autentiko.processes (
  tenant_id text not null references autentiko.tenants(tenant_id),
  process_id text not null,
  protocol text not null,
  process_type text not null,
  status text not null,
  phase text not null default '',
  workflow_status text not null default '',
  responsible_user_id text,
  responsible_name text not null default '',
  client_id text,
  property_id text,
  record_version integer not null default 1 check (record_version >= 1),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, process_id)
);
create unique index if not exists aut_processes_protocol_uidx on autentiko.processes (tenant_id, protocol);
create index if not exists aut_processes_status_cursor_idx on autentiko.processes (tenant_id, status, updated_at desc, process_id desc) where deleted_at is null;
create index if not exists aut_processes_type_cursor_idx on autentiko.processes (tenant_id, process_type, updated_at desc, process_id desc) where deleted_at is null;
create index if not exists aut_processes_responsible_idx on autentiko.processes (tenant_id, responsible_user_id, updated_at desc) where deleted_at is null;
create index if not exists aut_processes_client_idx on autentiko.processes (tenant_id, client_id) where client_id is not null;
create index if not exists aut_processes_property_idx on autentiko.processes (tenant_id, property_id) where property_id is not null;
create index if not exists aut_processes_payload_idx on autentiko.processes using gin (payload jsonb_path_ops);

create table if not exists autentiko.process_participants (
  tenant_id text not null,
  participant_id text not null,
  process_id text not null,
  client_id text,
  person_type text not null default 'PF',
  roles jsonb not null default '[]'::jsonb,
  full_name text not null default '',
  cpf_cnpj text not null default '',
  active boolean not null default true,
  record_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, participant_id),
  foreign key (tenant_id, process_id) references autentiko.processes(tenant_id, process_id) on delete cascade
);
create index if not exists aut_participants_process_idx on autentiko.process_participants (tenant_id, process_id, active);
create index if not exists aut_participants_document_idx on autentiko.process_participants (tenant_id, (regexp_replace(cpf_cnpj, '\D', '', 'g'))) where cpf_cnpj <> '';
create index if not exists aut_participants_roles_idx on autentiko.process_participants using gin (roles jsonb_path_ops);

create table if not exists autentiko.process_fields (
  tenant_id text not null,
  field_row_id text not null,
  process_id text not null,
  section text not null default '',
  field_name text not null,
  field_label text not null default '',
  field_index_code text not null default '',
  field_state text not null default 'PENDENTE_VALIDACAO' check (field_state in ('INFORMADO', 'NAO_INFORMADO', 'NAO_APLICAVEL', 'PENDENTE_VALIDACAO')),
  value_text text,
  value_json jsonb,
  data_type text not null default 'text',
  process_version integer not null default 1,
  active boolean not null default true,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, field_row_id),
  foreign key (tenant_id, process_id) references autentiko.processes(tenant_id, process_id) on delete cascade
);
create unique index if not exists aut_process_fields_active_uidx on autentiko.process_fields (tenant_id, process_id, field_name) where active;
create index if not exists aut_process_fields_process_version_idx on autentiko.process_fields (tenant_id, process_id, process_version desc);
create index if not exists aut_process_fields_code_value_idx on autentiko.process_fields (tenant_id, field_index_code, value_text) where active;
create index if not exists aut_process_fields_json_idx on autentiko.process_fields using gin (value_json jsonb_path_ops) where value_json is not null;

create table if not exists autentiko.documents (
  tenant_id text not null,
  document_id text not null,
  process_id text not null,
  protocol text not null default '',
  document_type_id text not null default '',
  name text not null default '',
  file_name text not null default '',
  mime_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text not null default '',
  version integer not null default 1,
  review_status text not null default '',
  media_status text not null default '',
  drive_file_id text not null default '',
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, document_id),
  foreign key (tenant_id, process_id) references autentiko.processes(tenant_id, process_id) on delete cascade
);
create index if not exists aut_documents_process_idx on autentiko.documents (tenant_id, process_id, created_at desc) where deleted_at is null;
create index if not exists aut_documents_hash_idx on autentiko.documents (tenant_id, sha256) where sha256 <> '' and deleted_at is null;
create index if not exists aut_documents_type_status_idx on autentiko.documents (tenant_id, document_type_id, review_status);

create table if not exists autentiko.media_assets (
  tenant_id text not null,
  asset_id text not null,
  document_id text not null,
  process_id text not null,
  role text not null check (role in ('original', 'preview', 'thumbnail')),
  provider text not null check (provider in ('CLOUDINARY', 'DRIVE', 'SUPABASE')),
  provider_asset_id text not null default '',
  public_id text not null default '',
  resource_type text not null default '',
  delivery_type text not null default '',
  asset_folder text not null default '',
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  sha256 text not null default '',
  version integer not null default 1,
  state text not null default 'READY',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, asset_id),
  foreign key (tenant_id, document_id) references autentiko.documents(tenant_id, document_id) on delete cascade
);
create unique index if not exists aut_media_provider_asset_uidx on autentiko.media_assets (tenant_id, provider, provider_asset_id) where provider_asset_id <> '';
create unique index if not exists aut_media_role_version_uidx on autentiko.media_assets (tenant_id, document_id, role, version);
create index if not exists aut_media_process_idx on autentiko.media_assets (tenant_id, process_id, role, updated_at desc);
create index if not exists aut_media_public_id_idx on autentiko.media_assets (tenant_id, public_id) where public_id <> '';

create table if not exists autentiko.field_catalog (
  tenant_id text not null,
  process_type text not null,
  field_name text not null,
  field_index_code text not null,
  section text not null default '',
  label text not null default '',
  data_type text not null default 'text',
  source_system text not null default 'AUTENTIKO_OK_NUVEM',
  source_sheet text not null default 'PROCESSO_DADOS',
  source_column text not null default '',
  schema_version text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, process_type, field_name),
  unique (tenant_id, field_index_code)
);
create index if not exists aut_field_catalog_source_idx on autentiko.field_catalog (tenant_id, source_system, source_sheet, source_column);

create table if not exists autentiko.field_aliases (
  tenant_id text not null,
  source_system text not null,
  source_sheet text not null,
  source_field text not null,
  canonical_field text not null,
  schema_version text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, source_system, source_sheet, source_field)
);
create index if not exists aut_field_aliases_canonical_idx on autentiko.field_aliases (tenant_id, canonical_field);

create table if not exists autentiko.search_history (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  actor_id text not null default '',
  normalized_query text not null,
  filters jsonb not null default '{}'::jsonb,
  result_count integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists aut_search_history_actor_idx on autentiko.search_history (tenant_id, actor_id, created_at desc);
create index if not exists aut_search_history_query_trgm_idx on autentiko.search_history using gin (normalized_query gin_trgm_ops);

create table if not exists autentiko.idempotency_keys (
  tenant_id text not null,
  idempotency_key text not null,
  operation text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key)
);
create index if not exists aut_idempotency_expiry_idx on autentiko.idempotency_keys (expires_at);

create table if not exists autentiko.outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  payload jsonb not null,
  dedupe_key text not null default '',
  destination text not null check (destination in ('SUPABASE', 'SHEETS', 'DRIVE', 'CLOUDINARY')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table autentiko.outbox add column if not exists dedupe_key text not null default '';
create unique index if not exists aut_outbox_dedupe_uidx
  on autentiko.outbox (tenant_id, destination, event_type, aggregate_type, aggregate_id, dedupe_key)
  where dedupe_key <> '';
create index if not exists aut_outbox_worker_idx on autentiko.outbox (destination, status, next_attempt_at, created_at) where status in ('PENDING', 'FAILED');
create index if not exists aut_outbox_aggregate_idx on autentiko.outbox (tenant_id, aggregate_type, aggregate_id, created_at desc);

create table if not exists autentiko.migration_batches (
  tenant_id text not null,
  batch_id text not null,
  migration_id text not null,
  source_system text not null,
  source_table text not null,
  schema_version text not null,
  payload_hash text not null,
  record_count integer not null check (record_count between 1 and 400),
  status text not null default 'COMPLETED',
  created_at timestamptz not null default now(),
  primary key (tenant_id, batch_id)
);
create index if not exists aut_migration_batches_run_idx on autentiko.migration_batches (tenant_id, migration_id, created_at);

create table if not exists autentiko.migration_rows (
  tenant_id text not null,
  source_system text not null,
  source_table text not null,
  source_row integer not null,
  migration_id text not null,
  schema_version text not null,
  canonical_record jsonb not null,
  raw_record jsonb not null,
  record_hash text not null,
  migrated_at timestamptz not null default now(),
  primary key (tenant_id, source_system, source_table, source_row)
);
create index if not exists aut_migration_rows_run_idx on autentiko.migration_rows (tenant_id, migration_id, source_table, source_row);
create index if not exists aut_migration_rows_payload_idx on autentiko.migration_rows using gin (canonical_record jsonb_path_ops);

create table if not exists autentiko.audit_events (
  tenant_id text not null,
  audit_id text not null,
  sequence bigint,
  event_at timestamptz,
  actor_id text not null default '',
  actor_name text not null default '',
  action text not null default '',
  entity_type text not null default '',
  entity_id text not null default '',
  previous_hash text not null default '',
  event_hash text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (tenant_id, audit_id)
);
create index if not exists aut_audit_sequence_idx on autentiko.audit_events (tenant_id, sequence desc);
create index if not exists aut_audit_entity_idx on autentiko.audit_events (tenant_id, entity_type, entity_id, event_at desc);
create index if not exists aut_audit_actor_idx on autentiko.audit_events (tenant_id, actor_id, event_at desc);

revoke all on schema autentiko from public;
revoke all on all tables in schema autentiko from public;
revoke all on all sequences in schema autentiko from public;

commit;
