import {NextRequest} from 'next/server';
import {consumeTicket} from '@/lib/database';
import {fail, json, options} from '@/lib/http';
import {retryRequestSchema} from '@/lib/schemas';
import {supabaseAdmin} from '@/lib/supabase';
import {verifyTicket} from '@/lib/ticket';
import {ApiError} from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function POST(request: NextRequest) {
  try {
    const input = retryRequestSchema.parse(await request.json());
    const ticket = verifyTicket(input.ticket, ['REPROCESS']);
    await consumeTicket(ticket, 'REPROCESS_TICKET_CONSUMED');
    const {error} = await supabaseAdmin().from('media_jobs').upsert({
      document_id: ticket.documentId,
      process_id: ticket.processId,
      version: ticket.version,
      job_type: 'OPTIMIZE_PDF',
      provider: 'ADOBE',
      state: 'PENDING',
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      error_code: null,
      error_summary: null,
      metadata: {reason: 'ADMIN_REPROCESS'}
    }, {onConflict: 'document_id,version,job_type'});
    if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível reagendar o processamento.');
    return json(request, {ok: true, data: {queued: true}});
  } catch (error) {
    return fail(request, error);
  }
}
