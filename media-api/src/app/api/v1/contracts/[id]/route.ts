import {NextRequest} from 'next/server';
import {requireDataApiKey} from '../../../../../lib/data-auth';
import {dataFail, dataJson, dataOptions} from '../../../../../lib/data-http';
import {ApiError} from '../../../../../lib/errors';
import {dataQuery} from '../../../../../lib/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ContractRow = {
  id: string;
  request_id: string;
  source_process_id: string;
  proposal_id: string | null;
  number: string;
  revision: number;
  template_code: string;
  template_version: number;
  status: string;
  html_hash: string;
  findings: unknown[];
  created_at: string;
  html: string;
};

export async function GET(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    requireDataApiKey(request);
    const {id} = await context.params;
    if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw new ApiError(400, 'CONTRACT_ID_INVALID', 'Identificador contratual inválido.');
    const includeHtml = request.nextUrl.searchParams.get('includeHtml') === '1';
    const rows = await dataQuery<ContractRow>(`
      select id, request_id, source_process_id, proposal_id, number, revision,
             template_code, template_version, status, html_hash, findings, created_at, html
        from contracts where id = $1 limit 1
    `, [id]);
    if (!rows[0]) throw new ApiError(404, 'CONTRACT_NOT_FOUND', 'Contrato não encontrado.');
    return dataJson(request, {ok: true, data: {...rows[0], html: includeHtml ? rows[0].html : undefined}});
  } catch (error) {
    return dataFail(request, error);
  }
}

export function OPTIONS(request: NextRequest) {
  return dataOptions(request);
}
