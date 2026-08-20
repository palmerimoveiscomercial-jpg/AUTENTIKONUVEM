import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { sha256 } from 'npm:@noble/hashes@2.3.0/sha2.js';

type Json = Record<string, unknown>;
type TicketAction = 'UPLOAD' | 'VIEW' | 'DOWNLOAD' | 'STATUS' | 'REPROCESS';
type MediaRole = 'original' | 'thumbnail' | 'preview';

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const encoder = new TextEncoder();
const allowedMimes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const extensions: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif'
};

function env(name: string): string {
  const value = Deno.env.get(name) || '';
  if (!value) throw new HttpError(500, 'SERVER_CONFIG_MISSING', `Configuração ausente: ${name}.`);
  return value;
}

function db() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function allowedOrigin(request: Request): string {
  const origin = request.headers.get('origin') || '';
  if (!origin) return '';
  let parsed: URL;
  try { parsed = new URL(origin); }
  catch { throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/') {
    throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.');
  }
  const configured = env('AUT_ALLOWED_ORIGINS').split(',').map(item => item.trim()).filter(Boolean);
  const accepted = configured.some(item => {
    if (item === origin) return true;
    if (item === 'https://*-script.googleusercontent.com') {
      return parsed.hostname.endsWith('-script.googleusercontent.com') &&
        parsed.hostname.length > '-script.googleusercontent.com'.length;
    }
    return false;
  });
  if (!accepted) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.');
  return origin;
}

function response(request: Request, body: unknown, status = 200): Response {
  const origin = allowedOrigin(request);
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Autentiko-Ticket',
    'Access-Control-Allow-Credentials': 'false',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin'
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function fail(request: Request, error: unknown): Response {
  const known = error instanceof HttpError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'INTERNAL_ERROR';
  const message = known ? error.message : 'Não foi possível concluir a operação documental.';
  if (!known) console.error('media-api', error instanceof Error ? error.message : String(error));
  try { return response(request, { ok: false, code, message }, status); }
  catch { return new Response(JSON.stringify({ ok: false, code, message }), { status, headers: { 'Content-Type': 'application/json' } }); }
}

function b64urlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(401, 'TOKEN_INVALID', 'Token inválido.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function b64urlEncode(bytes: Uint8Array): string {
  let raw = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    raw += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function constantEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let index = 0; index < size; index += 1) difference |= (left[index % Math.max(left.length, 1)] || 0) ^ (right[index % Math.max(right.length, 1)] || 0);
  return difference === 0;
}

async function hmac(value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env('AUT_MEDIA_SIGNING_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function sign(payload: Json): Promise<string> {
  const encoded = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${b64urlEncode(await hmac(encoded))}`;
}

async function verifyCompact(compact: string): Promise<Json> {
  const parts = String(compact || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new HttpError(401, 'TOKEN_INVALID', 'Token inválido.');
  const actual = b64urlDecode(parts[1]);
  const expected = await hmac(parts[0]);
  if (!constantEqual(actual, expected)) throw new HttpError(401, 'TOKEN_INVALID', 'Assinatura inválida.');
  let payload: Json;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))); }
  catch { throw new HttpError(401, 'TOKEN_INVALID', 'Conteúdo do token inválido.'); }
  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp || 0);
  const iat = Number(payload.iat || now);
  if (exp <= now || iat > now + 30 || exp - iat > 600) throw new HttpError(401, 'TOKEN_EXPIRED', 'Token expirado.');
  return payload;
}

function text(value: unknown, name: string, max = 128): string {
  const result = String(value || '').trim();
  if (!result || result.length > max) throw new HttpError(400, 'VALIDATION_ERROR', `${name} inválido.`);
  return result;
}

function safeSegment(value: unknown): string {
  const result = text(value, 'Identificador');
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(result) || result.includes('..')) throw new HttpError(400, 'OBJECT_PATH_INVALID', 'Identificador de objeto inválido.');
  return result;
}

function ticket(payload: Json, allowed: TicketAction[]): Json {
  if (payload.v !== 1 || payload.iss !== 'autentiko-apps-script') throw new HttpError(401, 'TICKET_INVALID', 'Emissor de ticket inválido.');
  if (!allowed.includes(payload.action as TicketAction)) throw new HttpError(403, 'TICKET_ACTION_DENIED', 'O ticket não permite esta operação.');
  text(payload.sub, 'Usuário'); text(payload.processId, 'Processo'); text(payload.documentId, 'Documento');
  text(payload.requestId, 'Requisição'); text(payload.jti, 'Ticket');
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) throw new HttpError(400, 'VALIDATION_ERROR', 'Versão inválida.');
  return payload;
}

function objectLimit(role: MediaRole, mime: string): number {
  if (role === 'thumbnail') return 80 * 1024;
  if (role === 'original' && mime === 'application/pdf') return 100 * 1024 * 1024;
  if (role === 'preview') return 25 * 1024 * 1024;
  return 25 * 1024 * 1024;
}

function validateObject(input: Json, allowPreview = false) {
  const role = text(input.role, 'Papel') as MediaRole;
  if (!['original', 'thumbnail', ...(allowPreview ? ['preview'] : [])].includes(role)) throw new HttpError(400, 'ROLE_INVALID', 'Papel de mídia inválido.');
  const mimeType = text(input.mimeType, 'MIME');
  if (!allowedMimes.has(mimeType)) throw new HttpError(400, 'MIME_NOT_ALLOWED', 'Formato de mídia não permitido.');
  const size = Number(input.size || 0);
  if (!Number.isInteger(size) || size < 1 || size > objectLimit(role, mimeType)) throw new HttpError(413, 'FILE_TOO_LARGE', 'Arquivo acima do limite seguro.');
  const sha256 = text(input.sha256, 'Hash', 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new HttpError(400, 'HASH_INVALID', 'Hash SHA-256 inválido.');
  if (role === 'thumbnail' && !mimeType.startsWith('image/')) throw new HttpError(400, 'THUMBNAIL_INVALID', 'Miniatura inválida.');
  return { role, mimeType, size, sha256 };
}

function bucketFor(role: MediaRole): string {
  return role === 'original' ? 'autentiko-originals' : role === 'thumbnail' ? 'autentiko-thumbnails' : 'autentiko-previews';
}

function objectPath(mediaTicket: Json, object: ReturnType<typeof validateObject>): string {
  return [safeSegment(mediaTicket.processId), safeSegment(mediaTicket.documentId), `v${Number(mediaTicket.version)}`, object.sha256, `${object.role}.${extensions[object.mimeType]}`].join('/');
}

async function consume(mediaTicket: Json, eventType: string) {
  const { error } = await db().from('media_events').insert({
    request_id: text(mediaTicket.jti, 'Ticket'), document_id: mediaTicket.documentId,
    process_id: mediaTicket.processId, version: mediaTicket.version, event_type: eventType,
    result: 'ACCEPTED', actor_id: mediaTicket.sub,
    details: { action: mediaTicket.action, appRequestId: mediaTicket.requestId }
  });
  if (error?.code === '23505') throw new HttpError(409, 'TICKET_REUSED', 'Este ticket já foi utilizado.');
  if (error) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'A auditoria da mídia não está disponível.');
}

function storageTusEndpoint(): string {
  const url = new URL(env('SUPABASE_URL'));
  const project = url.hostname.split('.')[0];
  return `https://${project}.storage.supabase.co/storage/v1/upload/resumable`;
}

async function uploadStart(body: Json) {
  const mediaTicket = ticket(await verifyCompact(text(body.ticket, 'Ticket', 8192)), ['UPLOAD']);
  const inputs = Array.isArray(body.objects) ? body.objects as Json[] : [];
  if (inputs.length < 1 || inputs.length > 2) throw new HttpError(400, 'VALIDATION_ERROR', 'Objetos de upload inválidos.');
  const objects = inputs.map(input => validateObject(input));
  if (objects.filter(item => item.role === 'original').length !== 1) throw new HttpError(400, 'ORIGINAL_REQUIRED', 'O original é obrigatório e deve ser único.');
  const prepared = [];
  for (const object of objects) {
    const bucket = bucketFor(object.role);
    const path = objectPath(mediaTicket, object);
    const { data, error } = await db().storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Não foi possível preparar o upload.');
    prepared.push({ ...object, bucket, objectPath: path, uploadToken: data.token, tusEndpoint: storageTusEndpoint() });
  }
  await consume(mediaTicket, 'UPLOAD_TICKET_CONSUMED');
  const completionToken = await sign({
    kind: 'upload-completion', sub: mediaTicket.sub, processId: mediaTicket.processId,
    documentId: mediaTicket.documentId, version: mediaTicket.version,
    requestId: mediaTicket.requestId,
    objects: prepared.map(({ role, mimeType, size, sha256, bucket, objectPath }) => ({ role, mimeType, size, sha256, bucket, objectPath })),
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600
  });
  return { objects: prepared, completionToken };
}

async function verifyStored(object: Json) {
  const bucket = text(object.bucket, 'Bucket');
  const path = text(object.objectPath, 'Objeto', 1024);
  const expected = validateObject(object);
  if (bucket !== bucketFor(expected.role)) throw new HttpError(422, 'BUCKET_MISMATCH', 'Destino do objeto inválido.');
  const { data: signed, error } = await db().storage.from(bucket).createSignedUrl(path, 60, { download: false });
  if (error || !signed?.signedUrl) throw new HttpError(503, 'STORAGE_READ_FAILED', 'O arquivo enviado ainda não pode ser validado.');
  const stored = await fetch(signed.signedUrl, { cache: 'no-store', headers: { Accept: expected.mimeType } });
  if (!stored.ok || !stored.body) throw new HttpError(503, 'STORAGE_READ_FAILED', 'O arquivo enviado ainda não pode ser validado.');
  const contentType = String(stored.headers.get('content-type') || expected.mimeType).split(';')[0];
  if (contentType !== expected.mimeType) throw new HttpError(422, 'MIME_MISMATCH', 'O formato recebido não confere.');
  const declaredSize = Number(stored.headers.get('content-length') || 0);
  if (declaredSize && declaredSize !== expected.size) throw new HttpError(422, 'SIZE_MISMATCH', 'O tamanho recebido não confere.');
  const hasher = sha256.create();
  const header = new Uint8Array(1024);
  let headerLength = 0;
  let received = 0;
  const reader = stored.body.getReader();
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    received += part.value.byteLength;
    if (received > expected.size) {
      await reader.cancel();
      throw new HttpError(422, 'SIZE_MISMATCH', 'O tamanho recebido não confere.');
    }
    if (headerLength < header.length) {
      const amount = Math.min(header.length - headerLength, part.value.byteLength);
      header.set(part.value.subarray(0, amount), headerLength);
      headerLength += amount;
    }
    hasher.update(part.value);
  }
  if (received !== expected.size) throw new HttpError(422, 'SIZE_MISMATCH', 'O tamanho recebido não confere.');
  const actual = Array.from(hasher.digest(), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected.sha256) throw new HttpError(422, 'HASH_MISMATCH', 'O arquivo recebido não confere com o hash informado.');
  if (expected.mimeType === 'application/pdf') {
    const signature = new TextDecoder('latin1').decode(header.subarray(0, headerLength));
    if (!signature.includes('%PDF-')) throw new HttpError(422, 'PDF_SIGNATURE_INVALID', 'Assinatura PDF inválida.');
  }
  return { ...expected, bucket, objectPath: path };
}

async function uploadComplete(body: Json) {
  const completion = await verifyCompact(text(body.completionToken, 'Comprovante', 16000));
  if (completion.kind !== 'upload-completion') throw new HttpError(401, 'TOKEN_INVALID', 'Comprovante de conclusão inválido.');
  const objectsInput = Array.isArray(completion.objects) ? completion.objects as Json[] : [];
  const verified = [];
  for (const object of objectsInput) verified.push(await verifyStored(object));
  const original = verified.find(item => item.role === 'original');
  if (!original) throw new HttpError(400, 'ORIGINAL_REQUIRED', 'Original não informado.');
  const documentId = text(completion.documentId, 'Documento');
  const processId = text(completion.processId, 'Processo');
  const version = Number(completion.version);
  const jobs: Json[] = [{ document_id: documentId, process_id: processId, version, job_type: 'SYNC_DRIVE', provider: 'LOCAL', next_attempt_at: new Date().toISOString(), metadata: { direction: 'SUPABASE_TO_DRIVE' } }];
  if (original.mimeType === 'application/pdf' && (original.size > 4 * 1024 * 1024 || !verified.some(item => item.role === 'thumbnail'))) {
    jobs.push({ document_id: documentId, process_id: processId, version, job_type: 'OPTIMIZE_PDF', provider: 'ADOBE', next_attempt_at: new Date().toISOString(), metadata: { reason: original.size > 4 * 1024 * 1024 ? 'PDF_ABOVE_4_MB' : 'THUMBNAIL_MISSING' } });
  }
  const { error } = await db().rpc('complete_media_upload', {
    p_document: { document_id: documentId, process_id: processId, version, mime_type: original.mimeType, size_bytes: original.size, sha256: original.sha256, drive_file_id: '' },
    p_objects: verified.map(item => ({ document_id: documentId, process_id: processId, version, role: item.role, bucket: item.bucket, object_key: item.objectPath, mime_type: item.mimeType, size_bytes: item.size, sha256: item.sha256 })),
    p_jobs: jobs,
    p_event: { request_id: `complete:${text(completion.requestId, 'Requisição')}`, document_id: documentId, process_id: processId, version, event_type: 'MEDIA_UPLOAD_COMPLETED', result: 'SUCCESS', actor_id: completion.sub, details: { objectCount: verified.length } }
  });
  if (error) throw new HttpError(503, 'DATABASE_TRANSACTION_FAILED', 'Não foi possível confirmar o documento de forma atômica.');
  const receipt = await sign({
    kind: 'media-receipt', status: 'READY', processId, documentId, version,
    requestId: completion.requestId, originalHash: original.sha256,
    thumbnailStatus: verified.some(item => item.role === 'thumbnail') ? 'READY' : 'PENDENTE',
    previewStatus: 'READY', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600
  });
  return { receipt, verified: true };
}

async function accessUrl(body: Json) {
  const mediaTicket = ticket(await verifyCompact(text(body.ticket, 'Ticket', 8192)), ['VIEW', 'DOWNLOAD']);
  const role = body.role === 'thumbnail' ? 'thumbnail' : 'document';
  const preferred = role === 'thumbnail' ? ['thumbnail'] : body.preferOptimized !== false && mediaTicket.action === 'VIEW' ? ['preview', 'original'] : ['original'];
  const { data, error } = await db().from('media_objects').select('role,bucket,object_key,mime_type,size_bytes,sha256')
    .eq('document_id', mediaTicket.documentId).eq('version', mediaTicket.version).eq('state', 'READY').in('role', preferred);
  if (error) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível consultar o documento.');
  let found: any = null;
  for (const wanted of preferred) found ||= (data || []).find((item: any) => item.role === wanted);
  if (!found) throw new HttpError(404, 'MEDIA_NOT_READY', 'A mídia ainda não está disponível.');
  const { data: signed, error: signError } = await db().storage.from(found.bucket).createSignedUrl(found.object_key, 60, { download: false });
  if (signError || !signed?.signedUrl) throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Não foi possível liberar a visualização.');
  await consume(mediaTicket, `${mediaTicket.action}_TICKET_CONSUMED`);
  return { accessUrl: signed.signedUrl, expiresIn: 60, mimeType: found.mime_type, size: Number(found.size_bytes), sha256: found.sha256, optimized: found.role === 'preview' };
}

async function status(mediaTicket: Json) {
  const { data, error } = await db().from('media_documents').select('media_status,sync_state,updated_at,last_error_code')
    .eq('document_id', mediaTicket.documentId).eq('version', mediaTicket.version).maybeSingle();
  if (error) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível consultar o estado da mídia.');
  await consume(mediaTicket, 'STATUS_TICKET_CONSUMED');
  return data || { media_status: 'NOT_FOUND', sync_state: 'PENDING', updated_at: null, last_error_code: null };
}

async function retry(mediaTicket: Json) {
  const { error } = await db().from('media_jobs').upsert({
    document_id: mediaTicket.documentId, process_id: mediaTicket.processId, version: mediaTicket.version,
    job_type: 'OPTIMIZE_PDF', provider: 'ADOBE', state: 'PENDING', attempts: 0,
    next_attempt_at: new Date().toISOString(), error_code: null, error_summary: null,
    metadata: { reason: 'ADMIN_REPROCESS' }
  }, { onConflict: 'document_id,version,job_type' });
  if (error) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível reagendar o processamento.');
  await consume(mediaTicket, 'REPROCESS_TICKET_CONSUMED');
  return { queued: true };
}

async function anchor(body: Json) {
  const payload = await verifyCompact(text(body.token, 'Comprovante', 8192));
  if (payload.kind !== 'audit-anchor' || payload.iss !== 'autentiko-apps-script' || payload.source !== 'APPS_SCRIPT_SHEETS') throw new HttpError(401, 'TOKEN_INVALID', 'Comprovante de ancoragem inválido.');
  const chainHash = String(payload.chainHash || '').toLowerCase();
  if (chainHash && !/^[a-f0-9]{64}$/.test(chainHash)) throw new HttpError(400, 'HASH_INVALID', 'Raiz de auditoria inválida.');
  const { data, error } = await db().from('audit_anchors').insert({
    source: payload.source, source_sequence: Number(payload.sourceSequence || 0), record_count: Number(payload.recordCount || 0),
    chain_hash: chainHash, app_version: text(payload.appVersion, 'Versão', 32), actor_id: text(payload.actorId, 'Ator'),
    request_id: text(payload.requestId, 'Requisição'), signed_at: text(payload.signedAt, 'Data', 64)
  }).select('sequence,anchor_hash,created_at').single();
  if (error?.code === '23505') return { idempotent: true };
  if (error) throw new HttpError(503, 'AUDIT_ANCHOR_UNAVAILABLE', 'A ancoragem externa não está disponível.');
  return data;
}

async function parseBody(request: Request): Promise<Json> {
  try { return await request.json(); }
  catch { throw new HttpError(400, 'JSON_INVALID', 'Corpo JSON inválido.'); }
}

Deno.serve(async request => {
  try {
    if (request.method === 'OPTIONS') return response(request, null, 204);
    const url = new URL(request.url);
    const base = '/media-api';
    const path = url.pathname.includes(base) ? url.pathname.slice(url.pathname.indexOf(base) + base.length) || '/' : url.pathname;
    if (request.method === 'GET' && (path === '/api/health' || path === '/health')) {
      const { error } = await db().from('audit_integrity_status').select('*').limit(1);
      const workerConfigured = String(Deno.env.get('AUT_DRIVE_SYNC_WORKER_ENABLED') || '').toLowerCase() === 'true';
      const databaseReady = !error;
      return response(request, { ok: true, data: {
        service: 'autentiko-media-api', version: '2.4.0', database: databaseReady,
        region: Deno.env.get('SB_REGION') || 'managed',
        driveSyncWorker: {
          configured: workerConfigured,
          healthy: workerConfigured && databaseReady
        },
        largeUploadReady: workerConfigured && databaseReady,
        deep: url.searchParams.get('deep') === '1'
      } });
    }
    if (request.method === 'POST' && path === '/api/v1/media/uploads') return response(request, { ok: true, data: await uploadStart(await parseBody(request)) });
    if (request.method === 'POST' && path === '/api/v1/media/uploads/complete') return response(request, { ok: true, data: await uploadComplete(await parseBody(request)) });
    if (request.method === 'POST' && path === '/api/v1/media/access-url') return response(request, { ok: true, data: await accessUrl(await parseBody(request)) });
    if (request.method === 'GET' && path === '/api/v1/media/status') {
      const mediaTicket = ticket(await verifyCompact(text(url.searchParams.get('ticket'), 'Ticket', 8192)), ['STATUS']);
      return response(request, { ok: true, data: await status(mediaTicket) });
    }
    if (request.method === 'POST' && path === '/api/v1/media/jobs/retry') {
      const body = await parseBody(request);
      const mediaTicket = ticket(await verifyCompact(text(body.ticket, 'Ticket', 8192)), ['REPROCESS']);
      return response(request, { ok: true, data: await retry(mediaTicket) });
    }
    if (request.method === 'POST' && path === '/api/v1/audit/anchor') return response(request, { ok: true, data: await anchor(await parseBody(request)) });
    throw new HttpError(404, 'NOT_FOUND', 'Rota não encontrada.');
  } catch (error) {
    return fail(request, error);
  }
});
