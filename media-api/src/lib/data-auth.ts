import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {NextRequest} from 'next/server';
import {ApiError} from './errors';
import {dataEnv} from './data-env';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function constantTimeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

export function requireDataApiKey(request: NextRequest): void {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const provided = bearer || request.headers.get('x-autentiko-api-key') || '';
  if (!provided || !constantTimeEqual(provided, dataEnv().AUT_DATA_API_KEY)) {
    throw new ApiError(401, 'API_KEY_INVALID', 'Chave de acesso inválida.');
  }
}

export function signSyncBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

export function requireSyncSignature(request: NextRequest, rawBody: string, nowMs = Date.now()): void {
  const timestamp = request.headers.get('x-autentiko-timestamp') || '';
  const signature = request.headers.get('x-autentiko-signature') || '';
  const timestampMs = Number(timestamp) * 1000;
  if (!/^\d{10}$/.test(timestamp) || !Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > 300_000) {
    throw new ApiError(401, 'SYNC_TIMESTAMP_INVALID', 'Assinatura expirada ou com horário inválido.');
  }
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    throw new ApiError(401, 'SYNC_SIGNATURE_INVALID', 'Assinatura de sincronização inválida.');
  }
  const expected = signSyncBody(dataEnv().AUT_DATA_SYNC_SECRET, timestamp, rawBody);
  if (!constantTimeEqual(signature.toLowerCase(), expected)) {
    throw new ApiError(401, 'SYNC_SIGNATURE_INVALID', 'Assinatura de sincronização inválida.');
  }
}
