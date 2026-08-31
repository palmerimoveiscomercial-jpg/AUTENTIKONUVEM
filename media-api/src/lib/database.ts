import {ApiError} from './errors';
import type {MediaTicket} from './ticket';
import type {MediaRole} from './objects';
import {supabaseAdmin} from './supabase';

export type StoredObject = {
  role: MediaRole;
  provider: 'supabase' | 'cloudinary';
  bucket: string;
  objectPath: string;
  mimeType: string;
  size: number;
  sha256: string;
  providerAssetId?: string;
  publicId?: string;
  format?: string;
  resourceType?: 'image' | 'video' | 'raw';
  deliveryType?: string;
  assetFolder?: string;
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
  const needsOptimization = original.mimeType === 'application/pdf' &&
    (original.size > 4 * 1024 * 1024 || !objects.some((item) => item.role === 'thumbnail'));
  const jobs: Array<Record<string, unknown>> = [{
    document_id: ticket.documentId,
    process_id: ticket.processId,
    version: ticket.version,
    job_type: 'SYNC_DRIVE',
    provider: 'LOCAL',
    next_attempt_at: new Date().toISOString(),
    metadata: {direction: original.provider === 'cloudinary' ? 'CLOUDINARY_TO_DRIVE' : 'SUPABASE_TO_DRIVE'}
  }];
  if (needsOptimization) {
    jobs.push({
      document_id: ticket.documentId,
      process_id: ticket.processId,
      version: ticket.version,
      job_type: 'OPTIMIZE_PDF',
      provider: 'ADOBE',
      next_attempt_at: new Date().toISOString(),
      metadata: {reason: original.size > 4 * 1024 * 1024 ? 'PDF_ABOVE_4_MB' : 'THUMBNAIL_MISSING'}
    });
  }
  const usesCloudinary = objects.some((object) => object.provider === 'cloudinary');
  const {error} = await supabaseAdmin().rpc(usesCloudinary ? 'complete_media_upload_v2' : 'complete_media_upload', {
    p_document: {
      document_id: ticket.documentId,
      process_id: ticket.processId,
      version: ticket.version,
      mime_type: original.mimeType,
      size_bytes: original.size,
      sha256: original.sha256,
      drive_file_id: ''
    },
    p_objects: objects.map((object) => ({
      document_id: ticket.documentId,
      process_id: ticket.processId,
      version: ticket.version,
      role: object.role,
      bucket: object.bucket,
      object_key: object.objectPath,
      mime_type: object.mimeType,
      size_bytes: object.size,
      sha256: object.sha256,
      provider: object.provider,
      provider_asset_id: object.providerAssetId || '',
      public_id: object.publicId || '',
      format: object.format || '',
      resource_type: object.resourceType || '',
      delivery_type: object.deliveryType || '',
      asset_folder: object.assetFolder || ''
    })),
    p_jobs: jobs,
    p_event: {
      request_id: `complete:${ticket.requestId}`,
      document_id: ticket.documentId,
      process_id: ticket.processId,
      version: ticket.version,
      event_type: 'MEDIA_UPLOAD_COMPLETED',
      result: 'SUCCESS',
      actor_id: ticket.sub,
      details: {appRequestId: ticket.requestId, objectCount: objects.length}
    }
  });
  if (error) throw new ApiError(503, 'DATABASE_TRANSACTION_FAILED', 'Não foi possível confirmar o documento de forma atômica.');
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
    metadata: {direction: 'MEDIA_TO_DRIVE'}
  }, {onConflict: 'document_id,version,job_type'});
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível agendar a cópia redundante no Drive.');
}

export async function findReadyObject(documentId: string, version: number, roles: MediaRole[]): Promise<StoredObject> {
  let {data, error} = await supabaseAdmin()
    .from('media_objects')
    .select('role,provider,bucket,object_key,mime_type,size_bytes,sha256,provider_asset_id,public_id,format,resource_type,delivery_type,asset_folder')
    .eq('document_id', documentId)
    .eq('version', version)
    .eq('state', 'READY')
    .in('role', roles);
  if (error) {
    const legacy = await supabaseAdmin()
      .from('media_objects')
      .select('role,bucket,object_key,mime_type,size_bytes,sha256')
      .eq('document_id', documentId)
      .eq('version', version)
      .eq('state', 'READY')
      .in('role', roles);
    data = legacy.data as typeof data;
    error = legacy.error;
  }
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível consultar o documento.');
  const rows = data || [];
  for (const role of roles) {
    const row = rows.find((item: any) => item.role === role);
    if (row) {
      return {
        role: row.role as MediaRole,
        provider: (row.provider || (row.bucket === 'cloudinary' ? 'cloudinary' : 'supabase')) as 'supabase' | 'cloudinary',
        bucket: row.bucket,
        objectPath: row.object_key,
        mimeType: row.mime_type,
        size: Number(row.size_bytes),
        sha256: row.sha256,
        providerAssetId: row.provider_asset_id || '',
        publicId: row.public_id || '',
        format: row.format || '',
        resourceType: row.resource_type || undefined,
        deliveryType: row.delivery_type || '',
        assetFolder: row.asset_folder || ''
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
