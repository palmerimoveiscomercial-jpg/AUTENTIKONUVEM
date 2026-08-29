import {NextRequest, NextResponse} from 'next/server';
import {ApiError, publicError} from './errors';
import {dataAllowedOrigins} from './data-env';

function dataCorsOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin') || '';
  if (!origin) return '';
  if (!dataAllowedOrigins().has(origin)) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.');
  }
  return origin;
}

export function dataJson(
  request: NextRequest,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  const origin = dataCorsOrigin(request);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Autentiko-Api-Key, X-Autentiko-Signature, X-Autentiko-Timestamp',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return NextResponse.json(body, {status, headers});
}

export function dataOptions(request: NextRequest): NextResponse {
  return dataJson(request, null, 204);
}

export function dataFail(request: NextRequest, error: unknown): NextResponse {
  const result = publicError(error);
  try {
    return dataJson(request, result.body, result.status);
  } catch {
    return NextResponse.json(result.body, {
      status: result.status,
      headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
    });
  }
}
