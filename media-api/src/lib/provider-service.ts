import {ApiError} from './errors';

const FETCH_TIMEOUT_MS = 12_000;

type ExternalJson = Record<string, unknown> | unknown[];

export type ProviderResult = {
  status: 'FOUND' | 'NOT_FOUND';
  data: ExternalJson | null;
  httpStatus: number;
};

const DATAJUD_TRIBUNAL_ALIASES = new Set([
  'tst', 'tse', 'stj', 'stm',
  'trf1', 'trf2', 'trf3', 'trf4', 'trf5', 'trf6',
  'tjac', 'tjal', 'tjam', 'tjap', 'tjba', 'tjce', 'tjdft', 'tjes', 'tjgo',
  'tjma', 'tjmg', 'tjms', 'tjmt', 'tjpa', 'tjpb', 'tjpe', 'tjpi', 'tjpr',
  'tjrj', 'tjrn', 'tjro', 'tjrr', 'tjrs', 'tjsc', 'tjse', 'tjsp', 'tjto',
  ...Array.from({length: 24}, (_, index) => `trt${index + 1}`),
  'tre-ac', 'tre-al', 'tre-am', 'tre-ap', 'tre-ba', 'tre-ce', 'tre-dft',
  'tre-es', 'tre-go', 'tre-ma', 'tre-mg', 'tre-ms', 'tre-mt', 'tre-pa',
  'tre-pb', 'tre-pe', 'tre-pi', 'tre-pr', 'tre-rj', 'tre-rn', 'tre-ro',
  'tre-rr', 'tre-rs', 'tre-sc', 'tre-se', 'tre-sp', 'tre-to',
  'tjmmg', 'tjmrs', 'tjmsp'
]);

async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
  method: 'GET' | 'POST' = 'GET',
  body?: string
): Promise<ProviderResult> {
  const response = await fetch(url, {
    method, headers: {
      Accept: 'application/json',
      'User-Agent': 'AUTENTIKO-OK-DOC/2.7 (+https://palmerimoveis.com.br)',
      ...headers
    },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store'
  }).catch((error) => {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new ApiError(504, 'PROVIDER_TIMEOUT', 'A fonte externa excedeu o tempo de resposta.');
    }
    throw new ApiError(502, 'PROVIDER_UNAVAILABLE', 'Não foi possível alcançar a fonte externa.');
  });
  if (response.status === 404) return {status: 'NOT_FOUND', data: null, httpStatus: 404};
  if (response.status === 429) throw new ApiError(429, 'PROVIDER_RATE_LIMIT', 'A fonte externa limitou temporariamente as consultas.');
  if (!response.ok) throw new ApiError(502, 'PROVIDER_HTTP_ERROR', `A fonte externa respondeu com HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(502, 'PROVIDER_INVALID_RESPONSE', 'A fonte externa não devolveu JSON.');
  }
  try {
    return {status: 'FOUND', data: await response.json() as ExternalJson, httpStatus: response.status};
  } catch {
    throw new ApiError(502, 'PROVIDER_INVALID_JSON', 'A fonte externa devolveu JSON inválido.');
  }
}

export async function queryBrasilApi(resource: 'CEP' | 'CNPJ', value: string) {
  const normalized = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (resource === 'CEP') {
    if (!/^\d{8}$/.test(normalized)) throw new ApiError(400, 'CEP_INVALID', 'CEP inválido.');
    return fetchJson(`https://brasilapi.com.br/api/cep/v2/${encodeURIComponent(normalized)}`);
  }
  if (!/^[0-9A-Z]{14}$/.test(normalized)) throw new ApiError(400, 'CNPJ_INVALID', 'CNPJ inválido.');
  return fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(normalized)}`);
}

export async function queryCguCeis(value: string, page: number) {
  const apiKey = process.env.TRANSPARENCIA_API_KEY || '';
  if (!apiKey) throw new ApiError(503, 'CGU_NOT_CONFIGURED', 'A chave do Portal da Transparência ainda não foi configurada no Vercel.');
  const document = value.replace(/\D/g, '');
  if (![11, 14].includes(document.length)) throw new ApiError(400, 'DOCUMENT_INVALID', 'Informe CPF ou CNPJ válido para a consulta CEIS.');
  const params = new URLSearchParams({codigoSancionado: document, pagina: String(page)});
  return fetchJson(`https://api.portaldatransparencia.gov.br/api-de-dados/ceis?${params}`, {
    'chave-api-dados': apiKey
  });
}

export async function queryDataJud(tribunalAlias: string, value: string): Promise<ProviderResult> {
  const apiKey = (process.env.DATAJUD_API_KEY || '').replace(/^ApiKey\s+/i, '').trim();
  if (!apiKey) throw new ApiError(503, 'DATAJUD_NOT_CONFIGURED', 'A chave pública vigente do DataJud ainda não foi configurada no Vercel.');
  const alias = tribunalAlias.trim().toLowerCase();
  if (!DATAJUD_TRIBUNAL_ALIASES.has(alias)) {
    throw new ApiError(400, 'DATAJUD_TRIBUNAL_INVALID', 'Tribunal não permitido para consulta no DataJud.');
  }
  const processNumber = value.replace(/\D/g, '');
  if (!/^\d{20}$/.test(processNumber)) {
    throw new ApiError(400, 'PROCESS_NUMBER_INVALID', 'Informe um número CNJ válido com 20 dígitos.');
  }
  const result = await fetchJson(
    `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`,
    {Authorization: `APIKey ${apiKey}`, 'Content-Type': 'application/json'},
    'POST',
    JSON.stringify({size: 10, query: {match: {numeroProcesso: processNumber}}})
  );
  const body = result.data;
  const hits = body && !Array.isArray(body) && typeof body.hits === 'object' && body.hits
    ? body.hits as {hits?: unknown[]; total?: {value?: number} | number}
    : null;
  const total = typeof hits?.total === 'number' ? hits.total : hits?.total?.value;
  const found = (typeof total === 'number' && total > 0) || Boolean(hits?.hits?.length);
  return {...result, status: found ? 'FOUND' : 'NOT_FOUND'};
}
