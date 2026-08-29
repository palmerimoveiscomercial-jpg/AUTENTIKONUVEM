import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {analyzeWithAi} from '../../../../../lib/ai-service';
import {requireDataApiKey} from '../../../../../lib/data-auth';
import {dataFail, dataJson, dataOptions} from '../../../../../lib/data-http';
import {dataQuery} from '../../../../../lib/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const requestSchema = z.object({
  requestId: z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9._:@/-]+$/),
  provider: z.enum(['GEMINI', 'OPENROUTER']).default('GEMINI'),
  processId: z.string().trim().max(200).optional(),
  contractId: z.string().trim().max(200).optional(),
  requestedBy: z.string().trim().min(1).max(200),
  instruction: z.string().trim().max(2_000).default(''),
  facts: z.record(z.string(), z.unknown())
});

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    requireDataApiKey(request);
    const input = requestSchema.parse(await request.json());
    const previous = await dataQuery<{provider: string; model: string; analysis: Record<string, unknown>; prompt_tokens: number; completion_tokens: number; total_tokens: number}>(`
      select provider, model, analysis, prompt_tokens, completion_tokens, total_tokens
        from ai_usage where request_id = $1 and status = 'SUCCESS' limit 1
    `, [input.requestId]);
    if (previous[0]) {
      return dataJson(request, {ok: true, data: {...previous[0], idempotent: true}, meta: {durationMs: Date.now() - startedAt}});
    }
    const result = await analyzeWithAi(input.provider, input.facts, input.instruction);
    const id = randomUUID();
    await dataQuery(`
      insert into ai_usage (
        id, request_id, provider, model, process_id, contract_id, requested_by,
        status, input_hash, output_hash, prompt_tokens, completion_tokens,
        total_tokens, duration_ms, analysis
      ) values ($1, $2, $3, $4, $5, $6, $7, 'SUCCESS', $8, $9, $10, $11, $12, $13, $14::jsonb)
      on conflict (request_id) do nothing
    `, [
      id, input.requestId, result.provider, result.model, input.processId || null,
      input.contractId || null, input.requestedBy, result.inputHash, result.outputHash,
      result.usage.promptTokens, result.usage.completionTokens, result.usage.totalTokens,
      Date.now() - startedAt, JSON.stringify(result.analysis)
    ]);
    return dataJson(request, {
      ok: true,
      data: {provider: result.provider, model: result.model, analysis: result.analysis, usage: result.usage, idempotent: false},
      meta: {durationMs: Date.now() - startedAt}
    }, 200, {'Server-Timing': `ai;dur=${Date.now() - startedAt}`});
  } catch (error) {
    return dataFail(request, error);
  }
}

export function OPTIONS(request: NextRequest) {
  return dataOptions(request);
}
