import 'dotenv/config';
import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {createClient} from '@supabase/supabase-js';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

function log(event, details = {}) {
  console.log(JSON.stringify({time:new Date().toISOString(), event, ...details}));
}

const sql = neon(required('DATABASE_URL'));
const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth:{persistSession:false, autoRefreshToken:false}
});
const limit = Math.max(1, Math.min(Number(process.env.DATA_OUTBOX_LIMIT || 50), 200));

const events = await sql`
  with selected as (
    select id from autentiko.outbox
    where destination = 'SUPABASE'
      and (
        (status in ('PENDING', 'FAILED') and next_attempt_at <= now())
        or (status = 'PROCESSING' and locked_at < now() - interval '15 minutes')
      )
    order by created_at, id
    limit ${limit}
    for update skip locked
  )
  update autentiko.outbox o set
    status = 'PROCESSING', locked_at = now(), attempts = o.attempts + 1
  from selected where o.id = selected.id
  returning o.id, o.tenant_id, o.aggregate_type, o.aggregate_id,
    o.event_type, o.payload, o.attempts, o.created_at
`;

let completed = 0;
let deferred = 0;
for (const event of events) {
  try {
    const record = event.payload?.record;
    if (!record?.entityType || !record?.entityId || !record?.checksum) {
      throw new Error('OUTBOX_PAYLOAD_INVALID');
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(event.payload)).digest('hex');
    const {error} = await supabase.rpc('aut_apply_replica_event', {
      p_event:{
        eventId:event.id,
        tenantId:event.tenant_id,
        eventType:event.event_type,
        aggregateType:event.aggregate_type,
        aggregateId:event.aggregate_id,
        createdAt:event.created_at,
        payloadHash
      },
      p_record:record
    });
    if (error) throw error;
    await sql`
      update autentiko.outbox set status='COMPLETED', completed_at=now(),
        locked_at=null, last_error=null where id=${event.id}
    `;
    completed += 1;
  } catch (error) {
    const attempts = Number(event.attempts || 1);
    const delaySeconds = Math.min(2 ** attempts * 30, 3600);
    const summary = String(error?.message || error || 'OUTBOX_FAILED').slice(0, 500);
    await sql`
      update autentiko.outbox set status='FAILED', locked_at=null,
        next_attempt_at=now() + (${delaySeconds}::text || ' seconds')::interval,
        last_error=${summary} where id=${event.id}
    `;
    deferred += 1;
  }
}

log('data_outbox_finished', {selected:events.length, completed, deferred});
if (deferred) process.exitCode = 2;
