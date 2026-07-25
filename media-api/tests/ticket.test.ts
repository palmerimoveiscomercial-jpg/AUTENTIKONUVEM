import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only-000000';
process.env.AUT_MEDIA_SIGNING_SECRET = 'ticket-secret-for-tests-only-000000000000';
process.env.AUTENTIKO_ALLOWED_ORIGINS = 'https://script.google.com';

const {verifyTicket} = await import('../src/lib/ticket');

function compact(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    iss: 'autentiko-apps-script',
    sub: 'USR-1',
    processId: 'PROC-1',
    documentId: 'DOC-1',
    version: 1,
    action: 'VIEW',
    requestId: 'request-1234',
    jti: randomUUID(),
    iat: now,
    exp: now + 60,
    ...overrides
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.AUT_MEDIA_SIGNING_SECRET!).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

test('aceita ticket íntegro e de curta duração', () => {
  const ticket = verifyTicket(compact(), ['VIEW']);
  assert.equal(ticket.documentId, 'DOC-1');
  assert.equal(ticket.action, 'VIEW');
});

test('rejeita ticket adulterado', () => {
  const ticket = compact();
  assert.throws(() => verifyTicket(`${ticket.slice(0, -1)}x`, ['VIEW']), /Assinatura do ticket inválida/);
});

test('rejeita ticket expirado', () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(() => verifyTicket(compact({iat: now - 120, exp: now - 60}), ['VIEW']), /Ticket expirado/);
});

test('rejeita ação diferente da autorizada', () => {
  assert.throws(() => verifyTicket(compact({action: 'DOWNLOAD'}), ['VIEW']), /não permite esta operação/);
});
