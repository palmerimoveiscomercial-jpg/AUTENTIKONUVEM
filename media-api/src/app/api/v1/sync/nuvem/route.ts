import {createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {requireSyncSignature} from '../../../../../lib/data-auth';
import {dataFail, dataJson, dataOptions} from '../../../../../lib/data-http';
import {syncRequestSchema} from '../../../../../lib/data-schemas';
import {dataQuery} from '../../../../../lib/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SyncResult = {accepted: boolean; synchronized: number};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const rawBody = await request.text();
    requireSyncSignature(request, rawBody);
    const input = syncRequestSchema.parse(JSON.parse(rawBody));
    const payloadHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    const records = input.records.map((record) => ({
      tenant_id: record.tenantId,
      source_type: record.sourceType,
      source_id: record.sourceId,
      protocol: record.protocol,
      document_digits: record.document.replace(/\D/g, ''),
      title: record.title,
      status: record.status,
      source_updated_at: record.updatedAt || new Date().toISOString(),
      search_text: [record.protocol, record.document, record.title, record.status, JSON.stringify(record.payload)]
        .join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 100_000),
      payload: record.payload
    }));
    const rows = await dataQuery<SyncResult>(`
      with accepted_event as (
        insert into sync_events (request_id, source, payload_hash, record_count, status)
        values ($1, $2, $3, $4, 'ACCEPTED')
        on conflict (request_id) do nothing
        returning true as accepted
      ), source_rows as (
        select * from jsonb_to_recordset($5::jsonb) as item(
          tenant_id text,
          source_type text,
          source_id text,
          protocol text,
          document_digits text,
          title text,
          status text,
          source_updated_at timestamptz,
          search_text text,
          payload jsonb
        )
      ), synchronized as (
        insert into search_records (
          tenant_id, source_type, source_id, protocol, document_digits,
          title, status, source_updated_at, search_text, payload, updated_at
        )
        select tenant_id, source_type, source_id, protocol, document_digits,
               title, status, source_updated_at, search_text, payload, now()
          from source_rows
         where exists (select 1 from accepted_event)
        on conflict (tenant_id, source_type, source_id) do update set
          protocol = excluded.protocol,
          document_digits = excluded.document_digits,
          title = excluded.title,
          status = excluded.status,
          source_updated_at = excluded.source_updated_at,
          search_text = excluded.search_text,
          payload = excluded.payload,
          updated_at = now()
        where search_records.source_updated_at <= excluded.source_updated_at
        returning 1
      )
      select exists(select 1 from accepted_event) as accepted,
             (select count(*)::int from synchronized) as synchronized
    `, [input.requestId, input.source, payloadHash, records.length, JSON.stringify(records)]);
    const result = rows[0] || {accepted: false, synchronized: 0};
    return dataJson(request, {
      ok: true,
      data: {
        requestId: input.requestId,
        accepted: result.accepted,
        idempotent: !result.accepted,
        received: records.length,
        synchronized: Number(result.synchronized || 0)
      },
      meta: {durationMs: Date.now() - startedAt}
    }, result.accepted ? 202 : 200, {'Server-Timing': `app;dur=${Date.now() - startedAt}`});
  } catch (error) {
    return dataFail(request, error);
  }
}

export function OPTIONS(request: NextRequest) {
  return dataOptions(request);
}
