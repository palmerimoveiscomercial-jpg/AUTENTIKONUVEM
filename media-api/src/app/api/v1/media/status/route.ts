import {NextRequest} from 'next/server';
import {consumeTicket, mediaStatus} from '@/lib/database';
import {fail, json, options} from '@/lib/http';
import {statusRequestSchema} from '@/lib/schemas';
import {verifyTicket} from '@/lib/ticket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function GET(request: NextRequest) {
  try {
    const ticketValue = request.nextUrl.searchParams.get('ticket') || '';
    const input = statusRequestSchema.parse({ticket: ticketValue});
    const ticket = verifyTicket(input.ticket, ['STATUS']);
    await consumeTicket(ticket, 'STATUS_TICKET_CONSUMED');
    const status = await mediaStatus(ticket.documentId, ticket.version);
    return json(request, {ok: true, data: status});
  } catch (error) {
    return fail(request, error);
  }
}
