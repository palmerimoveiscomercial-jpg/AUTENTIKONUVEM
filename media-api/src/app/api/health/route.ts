import {NextResponse} from 'next/server';
import {env} from '../../../lib/env';
import {supabaseAdmin} from '../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get('deep') === '1';
  let database = true;
  if (deep) {
    const {error} = await supabaseAdmin().from('audit_integrity_status').select('*').limit(1);
    database = !error;
  }
  const workerConfigured = env().AUT_DRIVE_SYNC_WORKER_ENABLED.toLowerCase() === 'true';
  return NextResponse.json({
    ok: true,
    data: {
      service: 'autentiko-media-api',
      version: '2.4.0',
      region: process.env.VERCEL_REGION || 'local',
      time: new Date().toISOString(),
      database,
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
