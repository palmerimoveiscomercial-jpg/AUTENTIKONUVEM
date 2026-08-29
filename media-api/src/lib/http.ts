import {NextRequest, NextResponse} from 'next/server';
import {allowedOrigins} from './env';
import {ApiError, publicError} from './errors';

function corsOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin') || '';
  if (!origin) return '';
  if (!allowedOrigins().has(origin)) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.');
  }
  return origin;
}

export function json(request: NextRequest, body: unknown, status = 200): NextResponse {
  const origin = corsOrigin(request);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Headers': 'Content-Type, X-Autentiko-Ticket, X-Adobe-Signature',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return NextResponse.json(body, {
    status,
    headers
  });
}

export function options(request: NextRequest): NextResponse {
  return json(request, null, 204);
}

export function fail(request: NextRequest, error: unknown): NextResponse {
  const result = publicError(error);
  try {
    return json(request, result.body, result.status);
  } catch {
    return NextResponse.json(result.body, {status: result.status, headers: {'Cache-Control': 'no-store'}});
  }
}
