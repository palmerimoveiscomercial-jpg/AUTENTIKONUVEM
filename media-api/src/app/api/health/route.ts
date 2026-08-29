import {NextResponse} from 'next/server';
import {supabaseAdmin} from '../../../lib/supabase';
import {dataCloudConfigured} from '../../../lib/data-env';
import {pingNeon} from '../../../lib/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get('deep') === '1';
  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  let database = supabaseConfigured;
  const neonConfigured = dataCloudConfigured();
  let neon = neonConfigured;
  if (deep && supabaseConfigured) {
    try {
      const {error} = await supabaseAdmin().from('audit_integrity_status').select('*').limit(1);
      database = !error;
    } catch {
      database = false;
    }
  }
  if (deep) {
    neon = neonConfigured && await pingNeon();
  }
  const workerConfigured = (process.env.AUT_DRIVE_SYNC_WORKER_ENABLED || 'false').toLowerCase() === 'true';
  return NextResponse.json({
    ok: true,
    data: {
      service: 'autentiko-media-api',
      version: '2.7.0',
      region: process.env.VERCEL_REGION || 'local',
      time: new Date().toISOString(),
      database,
      supabase: {
        configured: supabaseConfigured,
        healthy: database
      },
      dataCloud: {
        provider: 'NEON',
        configured: neonConfigured,
        healthy: neon
      },
      integrations: {
        brasilApi: {configured: true},
        cgu: {configured: Boolean(process.env.TRANSPARENCIA_API_KEY)},
        dataJud: {configured: Boolean(process.env.DATAJUD_API_KEY)},
        gemini: {configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL)},
        openRouter: {configured: Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL)}
      },
      driveSyncWorker: {
        configured: workerConfigured,
        healthy: workerConfigured && database
      },
      largeUploadReady: workerConfigured && database,
      deep
    }
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
