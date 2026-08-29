import {createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {requireDataApiKey} from '../../../../../lib/data-auth';
import {dataFail, dataJson, dataOptions} from '../../../../../lib/data-http';
import {dataQuery} from '../../../../../lib/neon';
import {queryBrasilApi, queryCguCeis, queryDataJud} from '../../../../../lib/provider-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.discriminatedUnion('provider', [
  z.object({provider: z.literal('BRASIL_API'), resource: z.enum(['CEP', 'CNPJ']), value: z.string().min(1).max(40)}),
  z.object({provider: z.literal('CGU'), resource: z.literal('CEIS'), value: z.string().min(1).max(40), page: z.number().int().min(1).max(100).default(1)}),
  z.object({
    provider: z.literal('DATAJUD'),
    resource: z.literal('PROCESS'),
    tribunalAlias: z.string().trim().toLowerCase().min(3).max(8).regex(/^[a-z0-9-]+$/),
    value: z.string().min(1).max(40)
  })
]);

type CacheRow = {response_status: 'FOUND' | 'NOT_FOUND'; response_body: unknown; source_http_status: number; expires_at: string};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    requireDataApiKey(request);
    const input = inputSchema.parse(await request.json());
    const cacheKey = createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
    const cached = await dataQuery<CacheRow>(`
      select response_status, response_body, source_http_status, expires_at
        from provider_cache where request_hash = $1 and expires_at > now() limit 1
    `, [cacheKey]);
    if (cached[0]) {
      return dataJson(request, {
        ok: true,
        data: {provider: input.provider, resource: input.resource, status: cached[0].response_status, result: cached[0].response_body, cached: true},
        meta: {durationMs: Date.now() - startedAt}
      });
    }
    const result = input.provider === 'BRASIL_API'
      ? await queryBrasilApi(input.resource, input.value)
      : input.provider === 'CGU'
        ? await queryCguCeis(input.value, input.page)
        : await queryDataJud(input.tribunalAlias, input.value);
    const ttlSeconds = input.provider === 'BRASIL_API' ? 86_400 : 3_600;
    await dataQuery(`
      insert into provider_cache (
        request_hash, provider, resource, response_status, response_body,
        source_http_status, fetched_at, expires_at
      ) values ($1, $2, $3, $4, $5::jsonb, $6, now(), now() + make_interval(secs => $7::int))
      on conflict (request_hash) do update set
        response_status = excluded.response_status,
        response_body = excluded.response_body,
        source_http_status = excluded.source_http_status,
        fetched_at = now(), expires_at = excluded.expires_at
    `, [cacheKey, input.provider, input.resource, result.status, JSON.stringify(result.data), result.httpStatus, ttlSeconds]);
    return dataJson(request, {
      ok: true,
      data: {provider: input.provider, resource: input.resource, status: result.status, result: result.data, cached: false},
      meta: {durationMs: Date.now() - startedAt}
    }, 200, {'Server-Timing': `provider;dur=${Date.now() - startedAt}`});
  } catch (error) {
    return dataFail(request, error);
  }
}

export function OPTIONS(request: NextRequest) {
  return dataOptions(request);
}
