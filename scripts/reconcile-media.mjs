import {
  checkpoint,
  downloadStorage,
  driveDownload,
  log,
  sha256,
  supabase
} from './lib/common.mjs';

const limit = Math.max(1, Math.min(Number(process.env.RECONCILE_LIMIT || 100), 1000));
const {data:documents, error} = await supabase
  .from('media_documents')
  .select('document_id,process_id,version,sha256,drive_file_id')
  .order('updated_at', {ascending:true})
  .limit(limit);
if (error) throw error;

log('reconcile_started', {records:documents.length});
let verified = 0;
let failed = 0;

for (const document of documents) {
  const row = {
    ID_DOCUMENTO:document.document_id,
    ID_PROCESSO:document.process_id,
    VERSAO:document.version
  };
  try {
    const {data:object, error:objectError} = await supabase
      .from('media_objects')
      .select('bucket,object_key,sha256')
      .eq('document_id', document.document_id)
      .eq('version', document.version)
      .eq('role', 'original')
      .eq('state', 'READY')
      .single();
    if (objectError) throw objectError;
    const storageBuffer = await downloadStorage(object.bucket, object.object_key);
    const storageHash = sha256(storageBuffer);
    if (storageHash !== object.sha256 || storageHash !== document.sha256) {
      throw new Error('SUPABASE_HASH_MISMATCH');
    }
    if (document.drive_file_id) {
      const driveHash = sha256(await driveDownload(document.drive_file_id));
      if (driveHash !== storageHash) throw new Error('DRIVE_HASH_MISMATCH');
    }
    await supabase.from('media_documents').update({
      sync_state:document.drive_file_id ? 'SYNCHRONIZED' : 'DRIVE_PENDING',
      last_error_code:null,
      updated_at:new Date().toISOString()
    }).eq('document_id', document.document_id).eq('version', document.version);
    await checkpoint(
      `reconcile:${document.document_id}:${document.version}:${Date.now()}`,
      row,
      'RECONCILIATION_VERIFIED',
      'SUCCESS',
      {hash:storageHash, driveChecked:Boolean(document.drive_file_id)}
    );
    verified += 1;
  } catch (reconcileError) {
    const code = String(reconcileError.message || 'RECONCILIATION_FAILED').slice(0, 100);
    await supabase.from('media_documents').update({
      sync_state:'HASH_MISMATCH',
      last_error_code:code,
      updated_at:new Date().toISOString()
    }).eq('document_id', document.document_id).eq('version', document.version);
    await checkpoint(
      `reconcile:${document.document_id}:${document.version}:failed:${Date.now()}`,
      row,
      'RECONCILIATION_FAILED',
      'FAILED',
      {code}
    ).catch(() => {});
    failed += 1;
    log('reconcile_record_failed', {documentId:document.document_id, version:document.version, code});
  }
}

log('reconcile_finished', {verified, failed});
if (failed) process.exitCode = 2;
