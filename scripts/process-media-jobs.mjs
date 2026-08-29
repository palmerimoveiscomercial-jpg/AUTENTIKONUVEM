import {
  checkpoint,
  downloadStorage,
  driveDownload,
  driveFindOrCreateFolder,
  driveUpload,
  linearizePdf,
  log,
  makeThumbnail,
  objectPath,
  required,
  sha256,
  sheetRows,
  supabase,
  updateSheetRow,
  uploadImmutable
} from './lib/common.mjs';
import {compressPdfAdobe} from './lib/adobe.mjs';

const limit = Math.max(1, Math.min(Number(process.env.MEDIA_JOB_LIMIT || 10), 50));
const now = new Date().toISOString();
const {data:jobs, error} = await supabase
  .from('media_jobs')
  .select('*')
  .in('state', ['PENDING','RETRY'])
  .lte('next_attempt_at', now)
  .order('created_at', {ascending:true})
  .limit(limit);
if (error) throw error;

const sheet = await sheetRows();
log('media_jobs_started', {records:jobs.length});

async function originalFor(job) {
  const {data, error} = await supabase
    .from('media_objects')
    .select('bucket,object_key,mime_type,size_bytes,sha256')
    .eq('document_id', job.document_id)
    .eq('version', job.version)
    .eq('role', 'original')
    .eq('state', 'READY')
    .single();
  if (error) throw error;
  const buffer = await downloadStorage(data.bucket, data.object_key);
  if (sha256(buffer) !== data.sha256) throw new Error('STORAGE_HASH_MISMATCH');
  return {...data, buffer};
}

async function ensureThumbnail(job, row, original) {
  const {data} = await supabase
    .from('media_objects')
    .select('id')
    .eq('document_id', job.document_id)
    .eq('version', job.version)
    .eq('role', 'thumbnail')
    .eq('state', 'READY')
    .maybeSingle();
  if (data) return;
  const buffer = await makeThumbnail(original.buffer, original.mime_type);
  const hash = sha256(buffer);
  const key = objectPath({...row, MEDIA_VERSAO:job.version}, hash, 'thumbnail', 'image/webp');
  await uploadImmutable('autentiko-thumbnails', key, buffer, 'image/webp');
  const {error} = await supabase.from('media_objects').upsert({
    document_id:job.document_id,
    process_id:job.process_id,
    version:job.version,
    role:'thumbnail',
    bucket:'autentiko-thumbnails',
    object_key:key,
    mime_type:'image/webp',
    size_bytes:buffer.length,
    sha256:hash,
    state:'READY',
    updated_at:new Date().toISOString()
  }, {onConflict:'document_id,version,role'});
  if (error) throw error;
  await updateSheetRow(sheet.headers, row._row, {
    THUMBNAIL_STATUS:'READY',
    MEDIA_ATUALIZADO_EM:new Date().toISOString()
  });
}

async function syncDrive(job, row, original) {
  let driveId = row.ARQUIVO_ID;
  if (driveId) {
    if (sha256(await driveDownload(driveId)) !== original.sha256) throw new Error('DRIVE_HASH_MISMATCH');
  } else {
    const folder = await driveFindOrCreateFolder(required('AUTENTIKO_DRIVE_ROOT_FOLDER_ID'), row.PROTOCOLO || row.ID_PROCESSO);
    const safeName = `${row.ID_DOCUMENTO}_v${job.version}_${row.ARQUIVO_NOME || 'documento'}`;
    driveId = await driveUpload(folder, safeName, original.mime_type, original.buffer);
  }
  await updateSheetRow(sheet.headers, row._row, {
    ARQUIVO_ID:driveId,
    SYNC_DRIVE_SUPABASE:'SINCRONIZADO',
    MEDIA_ATUALIZADO_EM:new Date().toISOString(),
    MEDIA_ERRO_CODIGO:''
  });
  await supabase.from('media_documents').update({
    drive_file_id:driveId,
    sync_state:'SYNCHRONIZED',
    last_error_code:null,
    updated_at:new Date().toISOString()
  }).eq('document_id', job.document_id).eq('version', job.version);
}

async function adobeUsage() {
  const firstDay = new Date();
  firstDay.setUTCDate(1);
  firstDay.setUTCHours(0, 0, 0, 0);
  const {count, error} = await supabase
    .from('media_events')
    .select('id', {count:'exact', head:true})
    .eq('event_type', 'ADOBE_TRANSACTION')
    .eq('result', 'SUCCESS')
    .gte('created_at', firstDay.toISOString());
  if (error) throw error;
  return Number(count || 0);
}

async function optimizePdf(job, row, original) {
  await ensureThumbnail(job, row, original);
  if (original.mime_type !== 'application/pdf') return;
  if (String(process.env.ADOBE_ENABLED || 'false').toLowerCase() !== 'true') {
    throw new Error('ADOBE_DISABLED');
  }
  const usage = await adobeUsage();
  const monthlyLimit = Math.max(Number(process.env.ADOBE_MONTHLY_LIMIT || 500), 1);
  if (usage >= monthlyLimit) throw new Error('ADOBE_MONTHLY_LIMIT_REACHED');
  if (usage >= Math.floor(monthlyLimit * .8)) log('adobe_limit_warning', {usage, monthlyLimit});
  const compressed = await compressPdfAdobe(original.buffer);
  if (!compressed.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('ADOBE_RESULT_INVALID');
  const optimized = await linearizePdf(compressed);
  const hash = sha256(optimized);
  const key = objectPath({...row, MEDIA_VERSAO:job.version}, hash, 'preview', 'application/pdf');
  await uploadImmutable('autentiko-previews', key, optimized, 'application/pdf');
  const {error} = await supabase.from('media_objects').upsert({
    document_id:job.document_id,
    process_id:job.process_id,
    version:job.version,
    role:'preview',
    bucket:'autentiko-previews',
    object_key:key,
    mime_type:'application/pdf',
    size_bytes:optimized.length,
    sha256:hash,
    state:'READY',
    updated_at:new Date().toISOString()
  }, {onConflict:'document_id,version,role'});
  if (error) throw error;
  await checkpoint(`adobe:${job.id}:${Date.now()}`, row, 'ADOBE_TRANSACTION', 'SUCCESS', {
    inputBytes:original.buffer.length,
    outputBytes:optimized.length,
    hash
  });
  await updateSheetRow(sheet.headers, row._row, {
    PREVIEW_STATUS:'OTIMIZADO',
    MEDIA_ATUALIZADO_EM:new Date().toISOString()
  });
}

let completed = 0;
let deferred = 0;
let failed = 0;

for (const job of jobs) {
  const row = sheet.rows.find(item => item.ID_DOCUMENTO === job.document_id);
  try {
    if (!row) throw new Error('SHEET_DOCUMENT_NOT_FOUND');
    const original = await originalFor(job);
    if (job.job_type === 'SYNC_DRIVE') await syncDrive(job, row, original);
    else if (job.job_type === 'OPTIMIZE_PDF') await optimizePdf(job, row, original);
    else throw new Error('JOB_TYPE_UNSUPPORTED');
    await supabase.from('media_jobs').update({
      state:'COMPLETED',
      attempts:Number(job.attempts || 0) + 1,
      error_code:null,
      error_summary:null,
      updated_at:new Date().toISOString()
    }).eq('id', job.id);
    completed += 1;
    log('media_job_completed', {jobId:job.id, jobType:job.job_type});
  } catch (jobError) {
    const code = String(jobError.message || 'MEDIA_JOB_FAILED').slice(0, 100);
    const attempts = Number(job.attempts || 0) + 1;
    const isDisabled = code === 'ADOBE_DISABLED';
    const terminal = attempts >= 5 || code === 'ADOBE_MONTHLY_LIMIT_REACHED';
    const delayMinutes = isDisabled ? 60 : Math.min(2 ** attempts, 60);
    await supabase.from('media_jobs').update({
      state:terminal ? 'FAILED' : 'RETRY',
      attempts,
      next_attempt_at:new Date(Date.now() + delayMinutes * 60000).toISOString(),
      error_code:code,
      error_summary:'A operação derivada falhou; o original permanece disponível.',
      updated_at:new Date().toISOString()
    }).eq('id', job.id);
    if (row) {
      await updateSheetRow(sheet.headers, row._row, {
        MEDIA_ERRO_CODIGO:code,
        MEDIA_ATUALIZADO_EM:new Date().toISOString()
      }).catch(() => {});
    }
    if (terminal) failed += 1;
    else deferred += 1;
    log('media_job_deferred', {jobId:job.id, jobType:job.job_type, code, attempts});
  }
}

log('media_jobs_finished', {completed, deferred, failed});
if (failed) process.exitCode = 2;
