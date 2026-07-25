import {createHmac, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {env} from './env';
import {ApiError} from './errors';

const actionSchema = z.enum(['UPLOAD', 'VIEW', 'DOWNLOAD', 'STATUS', 'REPROCESS']);
const ticketSchema = z.object({
  v: z.literal(1),
  iss: z.literal('autentiko-apps-script'),
  sub: z.string().min(1).max(128),
  processId: z.string().min(1).max(128),
  documentId: z.string().min(1).max(128),
  version: z.number().int().positive(),
  action: actionSchema,
  requestId: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  jti: z.string().min(16).max(128),
  iat: z.number().int().positive(),
  exp: z.number().int().positive()
});

export type MediaTicket = z.infer<typeof ticketSchema>;

function signature(encoded: string): Buffer {
  return createHmac('sha256', env().AUT_MEDIA_SIGNING_SECRET).update(encoded).digest();
}

export function verifyTicket(compact: string, allowed: MediaTicket['action'][]): MediaTicket {
  const parts = compact.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ApiError(401, 'TICKET_INVALID', 'Ticket de mídia inválido.');
  }
  const expected = signature(parts[0]);
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError(401, 'TICKET_INVALID', 'Assinatura do ticket inválida.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(401, 'TICKET_INVALID', 'Conteúdo do ticket inválido.');
  }
  const ticket = ticketSchema.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  if (ticket.exp <= now || ticket.iat > now + 30 || ticket.exp - ticket.iat > 600) {
    throw new ApiError(401, 'TICKET_EXPIRED', 'Ticket expirado ou fora da janela permitida.');
  }
  if (!allowed.includes(ticket.action)) {
    throw new ApiError(403, 'TICKET_ACTION_DENIED', 'O ticket não permite esta operação.');
  }
  return ticket;
}

export function signInternal(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded).toString('base64url')}`;
}

export function verifyInternal<T>(compact: string, schema: z.ZodType<T>): T {
  const parts = compact.split('.');
  if (parts.length !== 2) throw new ApiError(401, 'TOKEN_INVALID', 'Token interno inválido.');
  const expected = signature(parts[0]);
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError(401, 'TOKEN_INVALID', 'Assinatura do token interno inválida.');
  }
  const payload = schema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')));
  const expiry = Number((payload as Record<string, unknown>).exp || 0);
  if (expiry <= Math.floor(Date.now() / 1000)) throw new ApiError(401, 'TOKEN_EXPIRED', 'Token interno expirado.');
  return payload;
}
