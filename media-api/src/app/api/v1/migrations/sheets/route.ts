import {NextRequest} from 'next/server';
import {requireSyncSignature} from '@/lib/data-auth';
import {dataFail, dataJson, dataOptions} from '@/lib/data-http';
import {sheetsMigrationRequestSchema} from '@/lib/data-schemas';
import {migrateSheetsBatch} from '@/lib/operational-migration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const rawBody = await request.text();
    requireSyncSignature(request, rawBody);
    const input = sheetsMigrationRequestSchema.parse(JSON.parse(rawBody));
    const result = await migrateSheetsBatch(input, rawBody);
    return dataJson(request, {
      ok: true,
      data: {
        migrationId: input.migrationId,
        batchId: input.batchId,
        sourceTable: input.sourceTable,
        accepted: result.accepted,
        idempotent: !result.accepted,
        received: input.records.length,
        staged: Number(result.staged || 0),
        applied: Number(result.applied || 0),
        replicaEventsEnqueued: Number(result.enqueued || 0)
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
