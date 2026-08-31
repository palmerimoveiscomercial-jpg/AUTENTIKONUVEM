begin;

-- O Supabase é o espelho de recuperação. O Neon permanece como fonte
-- operacional e envia eventos idempotentes pela outbox do backend.
create table if not exists public.aut_replica_records (
  tenant_id text not null default 'PALMER',
  entity_type text not null,
  entity_id text not null,
  protocol text not null default '',
  document_digits text not null default '',
  status text not null default '',
  schema_version text not null,
  source_version bigint not null default 1,
  source_updated_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  replicated_at timestamptz not null default now(),
  primary key (tenant_id, entity_type, entity_id)
);

create index if not exists aut_replica_protocol_idx
  on public.aut_replica_records (tenant_id, protocol) where protocol <> '';
create index if not exists aut_replica_document_idx
  on public.aut_replica_records (tenant_id, document_digits) where document_digits <> '';
create index if not exists aut_replica_type_cursor_idx
  on public.aut_replica_records (tenant_id, entity_type, source_updated_at desc, entity_id desc);
create index if not exists aut_replica_status_idx
  on public.aut_replica_records (tenant_id, entity_type, status);
create index if not exists aut_replica_payload_idx
  on public.aut_replica_records using gin (payload jsonb_path_ops);

create table if not exists public.aut_replica_events (
  event_id uuid primary key,
  tenant_id text not null default 'PALMER',
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  source_created_at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'APPLIED' check (status in ('APPLIED', 'REJECTED')),
  applied_at timestamptz not null default now(),
  error_code text
);
create index if not exists aut_replica_events_aggregate_idx
  on public.aut_replica_events (tenant_id, aggregate_type, aggregate_id, applied_at desc);
create index if not exists aut_replica_events_created_idx
  on public.aut_replica_events (applied_at desc);

create or replace function public.aut_apply_replica_event(
  p_event jsonb,
  p_record jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := (p_event->>'eventId')::uuid;
  v_tenant text := coalesce(nullif(p_event->>'tenantId', ''), 'PALMER');
  v_row_count integer := 0;
begin
  insert into public.aut_replica_events (
    event_id, tenant_id, event_type, aggregate_type, aggregate_id,
    source_created_at, payload_hash
  ) values (
    v_event_id, v_tenant, p_event->>'eventType', p_event->>'aggregateType',
    p_event->>'aggregateId', (p_event->>'createdAt')::timestamptz,
    p_event->>'payloadHash'
  ) on conflict (event_id) do nothing;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then return false; end if;

  insert into public.aut_replica_records (
    tenant_id, entity_type, entity_id, protocol, document_digits, status,
    schema_version, source_version, source_updated_at, payload, checksum
  ) values (
    v_tenant, p_record->>'entityType', p_record->>'entityId',
    coalesce(p_record->>'protocol', ''), regexp_replace(coalesce(p_record->>'document', ''), '\D', '', 'g'),
    coalesce(p_record->>'status', ''), p_record->>'schemaVersion',
    coalesce((p_record->>'sourceVersion')::bigint, 1),
    (p_record->>'sourceUpdatedAt')::timestamptz,
    coalesce(p_record->'payload', '{}'::jsonb), p_record->>'checksum'
  )
  on conflict (tenant_id, entity_type, entity_id) do update set
    protocol = excluded.protocol,
    document_digits = excluded.document_digits,
    status = excluded.status,
    schema_version = excluded.schema_version,
    source_version = excluded.source_version,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    checksum = excluded.checksum,
    replicated_at = now()
  where public.aut_replica_records.source_version <= excluded.source_version;
  return true;
end;
$$;

alter table public.aut_replica_records enable row level security;
alter table public.aut_replica_events enable row level security;
revoke all on table public.aut_replica_records, public.aut_replica_events from anon, authenticated;
revoke all on function public.aut_apply_replica_event(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.aut_apply_replica_event(jsonb, jsonb) to service_role;

commit;
