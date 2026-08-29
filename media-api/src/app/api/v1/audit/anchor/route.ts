import {NextRequest} from 'next/server';
import {auditAnchorRequestSchema, auditAnchorTokenSchema} from '@/lib/schemas';
import {verifyInternal} from '@/lib/ticket';
import {supabaseAdmin} from '@/lib/supabase';
import {ApiError} from '@/lib/errors';
import {fail, json, options} from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function POST(request: NextRequest) {
  try {
    const input = auditAnchorRequestSchema.parse(await request.json());
    const anchor = verifyInternal(input.token, auditAnchorTokenSchema);
    const now = Math.floor(Date.now() / 1000);
    if (anchor.exp <= now || anchor.iat > now + 30 || anchor.exp - anchor.iat > 120) {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Comprovante de ancoragem expirado.');
    }
    const {data, error} = await supabaseAdmin().from('audit_anchors').insert({
      source: anchor.source,
      source_sequence: anchor.sourceSequence,
      record_count: anchor.recordCount,
      chain_hash: anchor.chainHash.toLowerCase(),
      app_version: anchor.appVersion,
      actor_id: anchor.actorId,
      request_id: anchor.requestId,
      signed_at: anchor.signedAt
    }).select('sequence,anchor_hash,created_at').single();
    if (error && error.code !== '23505') {
      throw new ApiError(503, 'AUDIT_ANCHOR_UNAVAILABLE', 'A ancoragem externa não está disponível.');
    }
    return json(request, {ok: true, data: data || {idempotent: true}});
  } catch (error) {
    return fail(request, error);
  }
}
