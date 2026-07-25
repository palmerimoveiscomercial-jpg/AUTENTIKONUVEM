import {ApiError} from './errors';
import type {MediaTicket} from './ticket';
import type {MediaRole} from './objects';
import {supabaseAdmin} from './supabase';

export type StoredObject = {
  role: MediaRole;
  bucket: string;
  objectPath: string;
  mimeType: string;
  size: number;
  sha256: string;
};

export async function consumeTicket(ticket: MediaTicket, eventType: string): Promise<void> {
  const {error} = await supabaseAdmin().from('media_events').insert({
    request_id: ticket.jti,
    document_id: ticket.documentId,
    process_id: ticket.processId,
    version: ticket.version,
    event_type: eventType,
    result: 'ACCEPTED',
    actor_id: ticket.sub,
    details: {action: ticket.action, appRequestId: ticket.requestId}
  });
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'TICKET_REUSED', 'Este ticket já foi utilizado.');
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'A auditoria da mídia não está disponível.');
  }
}

export async function registerCompletedMedia(ticket: MediaTicket, objects: StoredObject[]): Promise<void> {
  const original = objects.find((item) => item.role === 'original');
  if (!original) throw new ApiError(400, 'ORIGINAL_REQUIRED', 'O arquivo original não foi informado.');
  const client = supabaseAdmin();
  const {error: documentError} = await client.from('media_documents').upsert({
    document_id: ticket.documentId,
    process_id: ticket.processId,
    version: ticket.version,
    mime_type: original.mimeType,
    size_bytes: original.size,
    sha256: original.sha256,
    media_status: 'READY',
    sync_state: 'STORAGE_READY',
    updated_at: new Date().toISOString()
  }, {onConflict: 'document_id,version'});
  if (documentError) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível registrar o documento.');

  for (const object of objects) {
    const {error} = await client.from('media_objects').upsert({
      document_id: ticket.documentId,
      process_id: ticket.processId,
      version: ticket.version,
      role: object.role,
      bucket: object.bucket,
      object_key: object.objectPath,
      mime_type: object.mimeType,
      size_bytes: object.size,
      sha256: object.sha256,
      state: 'READY',
      updated_at: new Date().toISOString()
    }, {onConflict: 'document_id,version,role'});
    if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível registrar um objeto de mídia.');
  }
}

export async function enqueueOptimizationIfNeeded(ticket: MediaTicket, objects: StoredObject[]): Promise<void> {
  const original = objects.find((item) => item.role === 'original');
  if (!original || original.mimeType !== 'application/pdf') return;
  const hasThumbnail = objects.some((item) => item.role === 'thumbnail');
  if (original.size <= 4 * 1024 * 1024 && hasThumbnail) return;
  const reason = original.size > 4 * 1024 * 1024 ? 'PDF_ABOVE_4_MB' : 'THUMBNAIL_MISSING';
  const {error} = await supabaseAdmin().from('media_jobs').upsert({
    document_id: ticket.documentId,
    process_id: ticket.processId,
    version: ticket.version,
    job_type: 'OPTIMIZE_PDF',
    provider: 'ADOBE',
    state: 'PENDING',
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    error_code: null,
    error_summary: null,
    metadata: {reason}
  }, {onConflict: 'document_id,version,job_type'});
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível agendar a otimização do PDF.');
}

export async function enqueueDriveSync(ticket: MediaTicket): Promise<void> {
  const {error} = await supabaseAdmin().from('media_jobs').upsert({
    document_id: ticket.documentId,
    process_id: ticket.processId,
    version: ticket.version,
    job_type: 'SYNC_DRIVE',
    provider: 'LOCAL',
    state: 'PENDING',
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    error_code: null,
    error_summary: null,
    metadata: {direction: 'SUPABASE_TO_DRIVE'}
  }, {onConflict: 'document_id,version,job_type'});
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível agendar a cópia redundante no Drive.');
}

export async function findReadyObject(documentId: string, version: number, roles: MediaRole[]): Promise<StoredObject> {
  const {data, error} = await supabaseAdmin()
    .from('media_objects')
    .select('role,bucket,object_key,mime_type,size_bytes,sha256')
    .eq('document_id', documentId)
    .eq('version', version)
    .eq('state', 'READY')
    .in('role', roles);
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível consultar o documento.');
  const rows = data || [];
  for (const role of roles) {
    const row = rows.find((item: any) => item.role === role);
    if (row) {
      return {
        role: row.role as MediaRole,
        bucket: row.bucket,
        objectPath: row.object_key,
        mimeType: row.mime_type,
        size: Number(row.size_bytes),
        sha256: row.sha256
      };
    }
  }
  throw new ApiError(404, 'MEDIA_NOT_READY', 'A mídia ainda não está disponível.');
}

export async function mediaStatus(documentId: string, version: number) {
  const {data, error} = await supabaseAdmin()
    .from('media_documents')
    .select('media_status,sync_state,updated_at,last_error_code')
    .eq('document_id', documentId)
    .eq('version', version)
    .maybeSingle();
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível consultar o estado da mídia.');
  return data || {media_status: 'NOT_FOUND', sync_state: 'PENDING', updated_at: null, last_error_code: null};
}
