import {createHash} from 'node:crypto';
import type {SheetsMigrationRequest} from './data-schemas';
import {dataQuery} from './neon';

type MigrationResult = {
  accepted: boolean;
  staged: number;
  applied: number;
  enqueued: number;
};

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function migrateSheetsBatch(input: SheetsMigrationRequest, rawBody: string): Promise<MigrationResult> {
  const records = input.records.map((record) => ({
    source_row: record.sourceRow,
    raw_record: record.raw,
    canonical_record: record.canonical,
    record_hash: hash(JSON.stringify([record.canonical, record.raw]))
  }));
  const payloadHash = hash(rawBody);
  const rows = await dataQuery<MigrationResult>(`
    with accepted_batch as (
      insert into autentiko.migration_batches (
        tenant_id, batch_id, migration_id, source_system, source_table,
        schema_version, payload_hash, record_count, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED')
      on conflict (tenant_id, batch_id) do nothing
      returning true as accepted
    ), source_rows as (
      select * from jsonb_to_recordset($9::jsonb) as item(
        source_row integer,
        raw_record jsonb,
        canonical_record jsonb,
        record_hash text
      )
    ), staged as (
      insert into autentiko.migration_rows (
        tenant_id, source_system, source_table, source_row, migration_id,
        schema_version, canonical_record, raw_record, record_hash, migrated_at
      )
      select $1, $4, $5, source_row, $3, $6, canonical_record, raw_record, record_hash, now()
        from source_rows where exists (select 1 from accepted_batch)
      on conflict (tenant_id, source_system, source_table, source_row) do update set
        migration_id = excluded.migration_id,
        schema_version = excluded.schema_version,
        canonical_record = excluded.canonical_record,
        raw_record = excluded.raw_record,
        record_hash = excluded.record_hash,
        migrated_at = now()
      returning source_row, canonical_record as c, raw_record as r
    ), migrated_users as (
      insert into autentiko.users (
        tenant_id, user_id, full_name, email, username, role, status,
        permissions, source_updated_at, payload, updated_at
      )
      select $1,
        coalesce(nullif(c->>'ID_USUARIO',''), 'USUARIOS:' || source_row),
        coalesce(c->>'NOME',''), lower(coalesce(c->>'EMAIL','')),
        coalesce(c->>'USUARIO',''), coalesce(c->>'PERFIL',''), coalesce(c->>'STATUS',''),
        case when jsonb_typeof(c->'PERMISSOES_JSON') = 'array' then c->'PERMISSOES_JSON'
             else coalesce(nullif(c->>'PERMISSOES_JSON','')::jsonb, '[]'::jsonb) end,
        nullif(c->>'ATUALIZADO_EM','')::timestamptz, r, now()
      from staged where $5 = 'USUARIOS'
      on conflict (tenant_id, user_id) do update set
        full_name=excluded.full_name, email=excluded.email, username=excluded.username,
        role=excluded.role, status=excluded.status, permissions=excluded.permissions,
        source_updated_at=excluded.source_updated_at, payload=excluded.payload, updated_at=now()
      returning 1
    ), migrated_clients as (
      insert into autentiko.clients (
        tenant_id, client_id, person_type, full_name, cpf_cnpj, email, phone,
        address, roles, source_updated_at, payload, updated_at
      )
      select $1,
        coalesce(nullif(c->>'ID_CADASTRO',''), nullif(c->>'ID_CLIENTE',''), 'BASE_CLIENTES:' || source_row),
        coalesce(nullif(c->>'TIPO_PESSOA',''), 'PF'),
        coalesce(c->>'NOME_RAZAO_SOCIAL', c->>'NOME', ''),
        coalesce(c->>'CPF_CNPJ', c->>'CPF', ''), lower(coalesce(c->>'EMAIL','')),
        coalesce(c->>'TELEFONE', c->>'CONTATO', ''),
        case when jsonb_typeof(c->'ENDERECO_JSON')='object' then c->'ENDERECO_JSON' else '{}'::jsonb end,
        case when jsonb_typeof(c->'PAPEIS_JSON')='array' then c->'PAPEIS_JSON' else '[]'::jsonb end,
        nullif(c->>'ATUALIZADO_EM','')::timestamptz, r, now()
      from staged where $5 = 'BASE_CLIENTES'
      on conflict (tenant_id, client_id) do update set
        person_type=excluded.person_type, full_name=excluded.full_name, cpf_cnpj=excluded.cpf_cnpj,
        email=excluded.email, phone=excluded.phone, address=excluded.address, roles=excluded.roles,
        source_updated_at=excluded.source_updated_at, payload=excluded.payload, updated_at=now()
      returning 1
    ), migrated_properties as (
      insert into autentiko.properties (
        tenant_id, property_id, internal_code, capture_id, property_type, status,
        full_address, address, registration, water_registration, consumer_unit,
        source_updated_at, payload, updated_at
      )
      select $1,
        coalesce(nullif(c->>'ID_IMOVEL',''), nullif(c->>'ID_CADASTRO',''), 'BASE_IMOVEIS:' || source_row),
        coalesce(c->>'CODIGO_INTERNO', c->>'CODIGO_INTERNO_IMOVEL', ''),
        coalesce(c->>'ID_CAPTACAO',''), coalesce(c->>'TIPO_IMOVEL',''), coalesce(c->>'STATUS',''),
        coalesce(c->>'ENDERECO_COMPLETO', c->>'IMOVEL_ENDERECO', ''),
        case when jsonb_typeof(c->'ENDERECO_JSON')='object' then c->'ENDERECO_JSON' else '{}'::jsonb end,
        coalesce(c->>'NUMERO_REGISTRO', c->>'REGISTRO_CARTORIO_NUMERO', ''),
        coalesce(c->>'MATRICULA_AGUA', c->>'MATRICULA_AGUA_NUMERO', ''),
        coalesce(c->>'UNIDADE_CONSUMIDORA', c->>'UNIDADE_CONSUMIDORA_NUMERO', ''),
        nullif(c->>'ATUALIZADO_EM','')::timestamptz, r, now()
      from staged where $5 = 'BASE_IMOVEIS'
      on conflict (tenant_id, property_id) do update set
        internal_code=excluded.internal_code, capture_id=excluded.capture_id,
        property_type=excluded.property_type, status=excluded.status,
        full_address=excluded.full_address, address=excluded.address,
        registration=excluded.registration, water_registration=excluded.water_registration,
        consumer_unit=excluded.consumer_unit, source_updated_at=excluded.source_updated_at,
        payload=excluded.payload, updated_at=now()
      returning 1
    ), migrated_processes as (
      insert into autentiko.processes (
        tenant_id, process_id, protocol, process_type, status, phase, workflow_status,
        responsible_user_id, responsible_name, client_id, property_id, record_version,
        source_updated_at, payload, deleted_at, created_at, updated_at
      )
      select $1,
        coalesce(nullif(c->>'ID_PROCESSO',''), 'PROCESSOS:' || source_row),
        coalesce(nullif(c->>'PROTOCOLO',''), coalesce(nullif(c->>'ID_PROCESSO',''), 'PROCESSOS:' || source_row)),
        coalesce(c->>'TIPO_PROCESSO',''), coalesce(c->>'STATUS',''),
        coalesce(c->>'FASE',''), coalesce(c->>'STATUS_TRAMITACAO',''),
        nullif(c->>'ID_RESPONSAVEL',''), coalesce(c->>'RESPONSAVEL',''),
        nullif(c->>'ID_CLIENTE_BASE',''), nullif(c->>'ID_IMOVEL_BASE',''),
        greatest(coalesce(nullif(c->>'VERSAO_REGISTRO','')::integer,1),1),
        nullif(c->>'ATUALIZADO_EM','')::timestamptz, r,
        nullif(c->>'EXCLUIDO_EM','')::timestamptz,
        coalesce(nullif(c->>'CRIADO_EM','')::timestamptz, now()), now()
      from staged where $5 = 'PROCESSOS'
      on conflict (tenant_id, process_id) do update set
        protocol=excluded.protocol, process_type=excluded.process_type, status=excluded.status,
        phase=excluded.phase, workflow_status=excluded.workflow_status,
        responsible_user_id=excluded.responsible_user_id, responsible_name=excluded.responsible_name,
        client_id=excluded.client_id, property_id=excluded.property_id,
        record_version=excluded.record_version, source_updated_at=excluded.source_updated_at,
        payload=excluded.payload, deleted_at=excluded.deleted_at, updated_at=now()
      where autentiko.processes.record_version <= excluded.record_version
      returning 1
    ), migrated_participants as (
      insert into autentiko.process_participants (
        tenant_id, participant_id, process_id, client_id, person_type, roles,
        full_name, cpf_cnpj, active, record_version, payload, updated_at
      )
      select $1,
        coalesce(nullif(c->>'ID_PARTICIPANTE',''), 'PROCESSO_PARTICIPANTES:' || source_row),
        c->>'ID_PROCESSO', nullif(c->>'ID_CADASTRO_BASE',''),
        coalesce(nullif(c->>'TIPO_PESSOA',''), 'PF'),
        case when jsonb_typeof(c->'PAPEIS_JSON')='array' then c->'PAPEIS_JSON'
             else coalesce(nullif(c->>'PAPEIS_JSON','')::jsonb, '[]'::jsonb) end,
        coalesce(c->>'NOME_RAZAO_SOCIAL',''), coalesce(c->>'CPF_CNPJ',''),
        coalesce(c->>'ATIVO','SIM')='SIM',
        greatest(coalesce(nullif(c->>'VERSAO_REGISTRO','')::integer,1),1), r, now()
      from staged
      where $5 = 'PROCESSO_PARTICIPANTES' and nullif(c->>'ID_PROCESSO','') is not null
      on conflict (tenant_id, participant_id) do update set
        client_id=excluded.client_id, person_type=excluded.person_type, roles=excluded.roles,
        full_name=excluded.full_name, cpf_cnpj=excluded.cpf_cnpj, active=excluded.active,
        record_version=excluded.record_version, payload=excluded.payload, updated_at=now()
      where autentiko.process_participants.record_version <= excluded.record_version
      returning 1
    ), migrated_fields as (
      insert into autentiko.process_fields (
        tenant_id, field_row_id, process_id, section, field_name, field_label,
        field_index_code, field_state, value_text, value_json, data_type,
        process_version, active, source_updated_at, updated_at
      )
      select $1,
        coalesce(nullif(c->>'ID_DADO',''), 'PROCESSO_DADOS:' || source_row),
        c->>'ID_PROCESSO', coalesce(c->>'SECAO',''), c->>'CAMPO', coalesce(c->>'ROTULO',''),
        coalesce(c->>'CODIGO_INDICE',''),
        case when c->>'ESTADO_CAMPO' in ('INFORMADO','NAO_INFORMADO','NAO_APLICAVEL','PENDENTE_VALIDACAO')
             then c->>'ESTADO_CAMPO' else 'PENDENTE_VALIDACAO' end,
        case when left(trim(coalesce(c->>'VALOR','')),1) in ('[','{') then null else c->>'VALOR' end,
        case when left(trim(coalesce(c->>'VALOR','')),1) in ('[','{') then (c->>'VALOR')::jsonb else null end,
        coalesce(c->>'TIPO_DADO','text'), greatest(coalesce(nullif(c->>'VERSAO_PROCESSO','')::integer,1),1),
        coalesce(c->>'ATIVO','SIM') = 'SIM', nullif(c->>'ATUALIZADO_EM','')::timestamptz, now()
      from staged where $5 = 'PROCESSO_DADOS' and nullif(c->>'ID_PROCESSO','') is not null and nullif(c->>'CAMPO','') is not null
      on conflict (tenant_id, field_row_id) do update set
        section=excluded.section, field_name=excluded.field_name, field_label=excluded.field_label,
        field_index_code=excluded.field_index_code, field_state=excluded.field_state,
        value_text=excluded.value_text, value_json=excluded.value_json, data_type=excluded.data_type,
        process_version=excluded.process_version, active=excluded.active,
        source_updated_at=excluded.source_updated_at, updated_at=now()
      returning 1
    ), migrated_forms as (
      insert into autentiko.field_catalog (
        tenant_id, process_type, field_name, field_index_code, section, label,
        data_type, source_system, source_sheet, source_column, schema_version,
        active, metadata, updated_at
      )
      select $1, c->>'TIPO_PROCESSO', c->>'CAMPO', c->>'CODIGO_INDICE',
        coalesce(c->>'SECAO',''), coalesce(c->>'ROTULO',''), coalesce(c->>'TIPO_CAMPO','text'),
        coalesce(nullif(c->>'FONTE_SISTEMA',''), 'AUTENTIKO_OK_NUVEM'),
        coalesce(nullif(c->>'FONTE_ABA',''), 'PROCESSO_DADOS'), coalesce(c->>'FONTE_COLUNA',''),
        coalesce(nullif(c->>'SCHEMA_VERSION',''), $6), coalesce(c->>'ATIVO','SIM')='SIM', r, now()
      from staged where $5 = 'FORMULARIOS'
        and nullif(c->>'TIPO_PROCESSO','') is not null
        and nullif(c->>'CAMPO','') is not null
        and nullif(c->>'CODIGO_INDICE','') is not null
      on conflict (tenant_id, process_type, field_name) do update set
        field_index_code=excluded.field_index_code, section=excluded.section,
        label=excluded.label, data_type=excluded.data_type,
        source_system=excluded.source_system, source_sheet=excluded.source_sheet,
        source_column=excluded.source_column, schema_version=excluded.schema_version,
        active=excluded.active, metadata=excluded.metadata, updated_at=now()
      returning 1
    ), migrated_documents as (
      insert into autentiko.documents (
        tenant_id, document_id, process_id, protocol, document_type_id, name,
        file_name, mime_type, size_bytes, sha256, version, review_status,
        media_status, drive_file_id, source_updated_at, payload, deleted_at, created_at, updated_at
      )
      select $1, coalesce(nullif(c->>'ID_DOCUMENTO',''), 'PROCESSO_DOCUMENTOS:' || source_row),
        c->>'ID_PROCESSO', coalesce(c->>'PROTOCOLO',''), coalesce(c->>'ID_DOCUMENTO_TIPO',''),
        coalesce(c->>'NOME_DOCUMENTO',''), coalesce(c->>'ARQUIVO_NOME',''), coalesce(c->>'MIME_TYPE',''),
        greatest(coalesce(nullif(c->>'TAMANHO_BYTES','')::bigint,0),0), coalesce(c->>'HASH_SHA256',''),
        greatest(coalesce(nullif(c->>'VERSAO','')::integer,1),1), coalesce(c->>'STATUS_CONFERENCIA',''),
        coalesce(c->>'MEDIA_STATUS',''), coalesce(c->>'ARQUIVO_ID',''),
        nullif(c->>'MEDIA_ATUALIZADO_EM','')::timestamptz, r,
        nullif(c->>'EXCLUIDO_EM','')::timestamptz,
        coalesce(nullif(c->>'CRIADO_EM','')::timestamptz,now()), now()
      from staged where $5 = 'PROCESSO_DOCUMENTOS' and nullif(c->>'ID_PROCESSO','') is not null
      on conflict (tenant_id, document_id) do update set
        review_status=excluded.review_status, media_status=excluded.media_status,
        drive_file_id=excluded.drive_file_id, source_updated_at=excluded.source_updated_at,
        payload=excluded.payload, deleted_at=excluded.deleted_at, updated_at=now()
      returning 1
    ), migrated_audit as (
      insert into autentiko.audit_events (
        tenant_id, audit_id, sequence, event_at, actor_id, actor_name, action,
        entity_type, entity_id, previous_hash, event_hash, payload
      )
      select $1, coalesce(nullif(c->>'ID_AUDITORIA',''), 'AUDITORIA:' || source_row),
        nullif(c->>'SEQUENCIA','')::bigint, nullif(c->>'DATA_HORA','')::timestamptz,
        coalesce(c->>'ID_USUARIO',''), coalesce(c->>'USUARIO',''), coalesce(c->>'ACAO',''),
        coalesce(c->>'ENTIDADE',''), coalesce(c->>'ID_ENTIDADE',''),
        coalesce(c->>'HASH_ANTERIOR',''), coalesce(c->>'HASH_ATUAL',''), r
      from staged where $5 = 'AUDITORIA'
      on conflict (tenant_id, audit_id) do update set
        sequence=excluded.sequence, event_at=excluded.event_at, actor_id=excluded.actor_id,
        actor_name=excluded.actor_name, action=excluded.action, entity_type=excluded.entity_type,
        entity_id=excluded.entity_id, previous_hash=excluded.previous_hash,
        event_hash=excluded.event_hash, payload=excluded.payload
      returning 1
    ), replica_outbox as (
      insert into autentiko.outbox (
        tenant_id, aggregate_type, aggregate_id, event_type, payload,
        dedupe_key, destination, status, next_attempt_at
      )
      select $1, $5,
        coalesce(
          nullif(c->>'ID_USUARIO',''), nullif(c->>'ID_CADASTRO',''), nullif(c->>'ID_IMOVEL',''),
          nullif(c->>'ID_CAMPO',''), nullif(c->>'ID_DOCUMENTO_TIPO',''), nullif(c->>'ID_PROCESSO',''),
          nullif(c->>'ID_PARTICIPANTE',''), nullif(c->>'ID_DADO',''), nullif(c->>'ID_DOCUMENTO',''),
          nullif(c->>'ID_ACEITE',''), nullif(c->>'ID_CHECKLIST',''), nullif(c->>'ID_PENDENCIA',''),
          nullif(c->>'ID_ATUACAO',''), nullif(c->>'ID_MOVIMENTACAO',''), nullif(c->>'ID_PROPOSTA',''),
          nullif(c->>'ID_CONDICAO',''), nullif(c->>'ID_MODELO',''), nullif(c->>'ID_CLAUSULA',''),
          nullif(c->>'ID_CONTRATO',''), nullif(c->>'ID_CONTRATO_PARTE',''), nullif(c->>'ID_INDICE',''),
          nullif(c->>'ID_ARQUIVO',''), nullif(c->>'ID_CONFLITO',''), $5 || ':' || source_row
        ),
        'MIGRATED_UPSERT',
        jsonb_build_object('record', jsonb_build_object(
          'entityType', $5,
          'entityId', coalesce(
            nullif(c->>'ID_USUARIO',''), nullif(c->>'ID_CADASTRO',''), nullif(c->>'ID_IMOVEL',''),
            nullif(c->>'ID_CAMPO',''), nullif(c->>'ID_DOCUMENTO_TIPO',''), nullif(c->>'ID_PROCESSO',''),
            nullif(c->>'ID_PARTICIPANTE',''), nullif(c->>'ID_DADO',''), nullif(c->>'ID_DOCUMENTO',''),
            nullif(c->>'ID_ACEITE',''), nullif(c->>'ID_CHECKLIST',''), nullif(c->>'ID_PENDENCIA',''),
            nullif(c->>'ID_ATUACAO',''), nullif(c->>'ID_MOVIMENTACAO',''), nullif(c->>'ID_PROPOSTA',''),
            nullif(c->>'ID_CONDICAO',''), nullif(c->>'ID_MODELO',''), nullif(c->>'ID_CLAUSULA',''),
            nullif(c->>'ID_CONTRATO',''), nullif(c->>'ID_CONTRATO_PARTE',''), nullif(c->>'ID_INDICE',''),
            nullif(c->>'ID_ARQUIVO',''), nullif(c->>'ID_CONFLITO',''), $5 || ':' || source_row
          ),
          'protocol', coalesce(c->>'PROTOCOLO',''),
          'document', coalesce(c->>'CPF_CNPJ', c->>'CPF', ''),
          'status', coalesce(c->>'STATUS',''),
          'schemaVersion', $6,
          'sourceVersion', greatest(coalesce(nullif(c->>'VERSAO_REGISTRO','')::bigint, 1), 1),
          'sourceUpdatedAt', coalesce(
            nullif(c->>'ATUALIZADO_EM','')::timestamptz,
            nullif(c->>'CRIADO_EM','')::timestamptz,
            now()
          ),
          'payload', c,
          'checksum', record_hash
        )),
        record_hash, 'SUPABASE', 'PENDING', now()
      from staged
      on conflict (tenant_id, destination, event_type, aggregate_type, aggregate_id, dedupe_key)
        where dedupe_key <> '' do nothing
      returning 1
    )
    select exists(select 1 from accepted_batch) as accepted,
      (select count(*)::int from staged) as staged,
      ((select count(*) from migrated_users) + (select count(*) from migrated_clients) +
       (select count(*) from migrated_properties) + (select count(*) from migrated_processes) +
       (select count(*) from migrated_participants) + (select count(*) from migrated_fields) +
       (select count(*) from migrated_forms) + (select count(*) from migrated_documents) +
       (select count(*) from migrated_audit))::int as applied,
      (select count(*)::int from replica_outbox) as enqueued
  `, [
    input.tenantId, input.batchId, input.migrationId, input.sourceSystem,
    input.sourceTable, input.schemaVersion, payloadHash, records.length,
    JSON.stringify(records)
  ]);
  return rows[0] || {accepted: false, staged: 0, applied: 0, enqueued: 0};
}
