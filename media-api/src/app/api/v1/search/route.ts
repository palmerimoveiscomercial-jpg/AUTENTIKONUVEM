import {NextRequest} from 'next/server';
import {z} from 'zod';
import {requireDataApiKey} from '../../../../lib/data-auth';
import {decodeSearchCursor, encodeSearchCursor} from '../../../../lib/cursor';
import {dataFail, dataJson, dataOptions} from '../../../../lib/data-http';
import {dataQuery} from '../../../../lib/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({
  q: z.string().trim().max(300).default(''),
  type: z.string().trim().max(60).regex(/^[A-Z0-9_]*$/).default(''),
  status: z.string().trim().max(80).default(''),
  protocol: z.string().trim().max(80).default(''),
  document: z.string().trim().max(40).default(''),
  tenantId: z.string().trim().min(1).max(200).default('PALMER'),
  cursor: z.string().max(1000).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

type SearchRow = {
  source_type: string;
  source_id: string;
  protocol: string;
  document_digits: string;
  title: string;
  status: string;
  updated_at: string;
  payload: Record<string, unknown>;
};

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    requireDataApiKey(request);
    const paramsObject = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = querySchema.parse(paramsObject);
    const cursor = decodeSearchCursor(filters.cursor);
    const values: unknown[] = [filters.tenantId];
    const where = ['tenant_id = $1'];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (filters.type) where.push(`source_type = ${bind(filters.type)}`);
    if (filters.status) where.push(`status = ${bind(filters.status)}`);
    if (filters.protocol) where.push(`protocol = ${bind(filters.protocol)}`);
    if (filters.document) where.push(`document_digits = ${bind(filters.document.replace(/\D/g, ''))}`);
    if (filters.q) {
      const marker = bind(filters.q);
      where.push(`(search_vector @@ websearch_to_tsquery('simple', ${marker}) OR search_text % ${marker} OR search_text ILIKE '%' || ${marker} || '%')`);
    }
    if (cursor) {
      const updatedMarker = bind(cursor.updatedAt);
      const idMarker = bind(cursor.sourceId);
      where.push(`(updated_at, source_id) < (${updatedMarker}::timestamptz, ${idMarker})`);
    }
    const limitMarker = bind(filters.limit + 1);
    const rows = await dataQuery<SearchRow>(`
      select source_type, source_id, protocol, document_digits, title, status, updated_at, payload
        from search_records
       where ${where.join(' and ')}
       order by updated_at desc, source_id desc
       limit ${limitMarker}
    `, values);
    const hasMore = rows.length > filters.limit;
    const page = rows.slice(0, filters.limit);
    const tail = page[page.length - 1];
    return dataJson(request, {
      ok: true,
      data: {
        items: page.map((row) => ({
          sourceType: row.source_type,
          sourceId: row.source_id,
          protocol: row.protocol,
          document: row.document_digits,
          title: row.title,
          status: row.status,
          updatedAt: row.updated_at,
          payload: row.payload
        })),
        nextCursor: hasMore && tail ? encodeSearchCursor({updatedAt: tail.updated_at, sourceId: tail.source_id}) : null,
        hasMore,
        limit: filters.limit
      },
      meta: {durationMs: Date.now() - startedAt}
    }, 200, {'Server-Timing': `app;dur=${Date.now() - startedAt}`});
  } catch (error) {
    return dataFail(request, error);
  }
}

export function OPTIONS(request: NextRequest) {
  return dataOptions(request);
}
