import {createHmac, timingSafeEqual} from 'node:crypto';
import {NextRequest} from 'next/server';
import {adobeEnabled, env} from '@/lib/env';
import {ApiError} from '@/lib/errors';
import {fail, json, options} from '@/lib/http';
import {supabaseAdmin} from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function POST(request: NextRequest) {
  try {
    if (!adobeEnabled()) throw new ApiError(503, 'ADOBE_DISABLED', 'O processamento Adobe está desativado.');
    const secret = env().ADOBE_WEBHOOK_SECRET || '';
    if (secret.length < 32) throw new ApiError(503, 'ADOBE_CONFIG_REQUIRED', 'O webhook Adobe não foi configurado.');
    const raw = await request.text();
    const supplied = request.headers.get('x-adobe-signature') || '';
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const actualBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Assinatura do webhook inválida.');
    }
    const payload = JSON.parse(raw) as {
      jobId?: string;
      status?: 'SUCCEEDED' | 'FAILED';
      errorCode?: string;
    };
    if (!payload.jobId || !payload.status) throw new ApiError(400, 'WEBHOOK_INVALID', 'Evento Adobe inválido.');
    const {error} = await supabaseAdmin().from('media_jobs').update({
      state: payload.status === 'SUCCEEDED' ? 'COMPLETED' : 'FAILED',
      error_code: payload.status === 'FAILED' ? String(payload.errorCode || 'ADOBE_FAILED').slice(0, 80) : null,
      error_summary: payload.status === 'FAILED' ? 'O provedor não concluiu a otimização.' : null,
      updated_at: new Date().toISOString()
    }).eq('id', payload.jobId);
    if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível registrar o retorno do provedor.');
    return json(request, {ok: true});
  } catch (error) {
    return fail(request, error);
  }
}
