import {createHash, randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {renderContractHtml} from '../../../../../lib/contract-engine';
import {requireDataApiKey} from '../../../../../lib/data-auth';
import {finalContractEnabled} from '../../../../../lib/data-env';
import {dataFail, dataJson, dataOptions} from '../../../../../lib/data-http';
import {contractIssueSchema} from '../../../../../lib/data-schemas';
import {ApiError} from '../../../../../lib/errors';
import {dataQuery} from '../../../../../lib/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JobRow = {id: string; input_hash: string; status: string; result_contract_id: string | null};
type ContextRow = {payload: Record<string, unknown>};
type ContractRow = {id: string; number: string; status: string; html_hash: string; html: string; findings: unknown[]; created_at: string};

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

async function loadContext(processId: string | undefined, protocol: string | undefined): Promise<Record<string, unknown>> {
  const rows = await dataQuery<ContextRow>(`
    select payload
      from search_records
     where tenant_id = 'PALMER'
       and source_type = 'PROCESS_CONTEXT'
       and ($1::text is null or source_id = $1)
       and ($2::text is null or protocol = $2)
     order by source_updated_at desc
     limit 2
  `, [processId || null, protocol || null]);
  if (rows.length !== 1) {
    throw new ApiError(404, 'CONTRACT_CONTEXT_NOT_FOUND', 'O contexto contratual não foi sincronizado ou é ambíguo.');
  }
  return rows[0].payload;
}

async function existingContract(requestId: string): Promise<ContractRow | null> {
  const rows = await dataQuery<ContractRow>(`
    select id, number, status, html_hash, html, findings, created_at
      from contracts where request_id = $1 limit 1
  `, [requestId]);
  return rows[0] || null;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let jobId = '';
  try {
    requireDataApiKey(request);
    const input = contractIssueSchema.parse(await request.json());
    if (input.final && !finalContractEnabled()) {
      throw new ApiError(409, 'FINAL_CONTRACT_DISABLED', 'A emissão final no Vercel permanece desativada até homologação jurídica e operacional.');
    }
    const context = input.context || await loadContext(input.processId, input.protocol);
    const inputHash = hashJson({
      processId: input.processId,
      protocol: input.protocol,
      proposalId: input.proposalId,
      final: input.final,
      context
    });
    const jobs = await dataQuery<JobRow>(`
      insert into contract_jobs (request_id, process_id, proposal_id, requested_by, final, input_hash, status)
      values ($1, $2, $3, $4, $5, $6, 'PROCESSING')
      on conflict (request_id) do update set request_id = excluded.request_id
      returning id, input_hash, status, result_contract_id
    `, [input.idempotencyKey, input.processId || null, input.proposalId || null, input.requestedBy, input.final, inputHash]);
    const job = jobs[0];
    jobId = job.id;
    if (job.input_hash !== inputHash) {
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi utilizada com outro conteúdo.');
    }
    const prior = await existingContract(input.idempotencyKey);
    if (prior) {
      return dataJson(request, {
        ok: true,
        data: {...prior, html: input.includeHtml ? prior.html : undefined, idempotent: true},
        meta: {durationMs: Date.now() - startedAt}
      });
    }
    const contractId = randomUUID();
    const sequenceRows = await dataQuery<{value: string}>('select nextval(\'contract_number_seq\')::text as value');
    const sequence = Number(sequenceRows[0]?.value || 0);
    const number = `CTR-${new Date().getUTCFullYear()}-${String(sequence).padStart(6, '0')}-R01`;
    const rendered = renderContractHtml(context, number, input.final);
    const htmlHash = createHash('sha256').update(rendered.html, 'utf8').digest('hex');
    const process = context.process && typeof context.process === 'object' ? context.process as Record<string, unknown> : {};
    const model = context.contractModel && typeof context.contractModel === 'object' ? context.contractModel as Record<string, unknown> : {};
    const inserted = await dataQuery<ContractRow>(`
      insert into contracts (
        id, request_id, source_process_id, source_process_version, proposal_id,
        number, revision, template_code, template_version, status,
        snapshot, html, html_hash, findings, created_by
      ) values ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb, $14)
      on conflict (request_id) do nothing
      returning id, number, status, html_hash, html, findings, created_at
    `, [
      contractId,
      input.idempotencyKey,
      input.processId || String(process.id || ''),
      Number(process.version || process.recordVersion || 1),
      input.proposalId || null,
      number,
      String(model.id || model.code || ''),
      Number(model.version || 1),
      input.final ? 'EMITIDO_AGUARDANDO_DRIVE' : 'MINUTA_GERADA',
      JSON.stringify(context),
      rendered.html,
      htmlHash,
      JSON.stringify(rendered.findings),
      input.requestedBy
    ]);
    const contract = inserted[0] || await existingContract(input.idempotencyKey);
    if (!contract) throw new ApiError(503, 'CONTRACT_PERSISTENCE_FAILED', 'Não foi possível persistir o contrato.');
    await dataQuery(`
      update contract_jobs
         set status = 'COMPLETED', result_contract_id = $2, completed_at = now(), updated_at = now()
       where id = $1
    `, [job.id, contract.id]);
    return dataJson(request, {
      ok: true,
      data: {...contract, html: input.includeHtml ? contract.html : undefined, idempotent: false},
      meta: {durationMs: Date.now() - startedAt}
    }, 201, {'Server-Timing': `app;dur=${Date.now() - startedAt}`});
  } catch (error) {
    if (jobId) {
      try {
        await dataQuery(`
          update contract_jobs
             set status = 'FAILED', error_code = $2, error_summary = $3, updated_at = now()
           where id = $1 and status <> 'COMPLETED'
        `, [
          jobId,
          error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
          error instanceof Error ? error.message.slice(0, 500) : 'Falha desconhecida'
        ]);
      } catch {}
    }
    return dataFail(request, error);
  }
}

export function OPTIONS(request: NextRequest) {
  return dataOptions(request);
}
