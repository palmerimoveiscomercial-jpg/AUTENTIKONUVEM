import {
  checkpoint,
  checkpointExists,
  driveDownload,
  log,
  makeThumbnail,
  objectPath,
  registerMedia,
  sha256,
  sheetRows,
  updateSheetRow,
  uploadImmutable
} from './lib/common.mjs';

const dryRun = String(process.env.MIGRATION_DRY_RUN || 'true').toLowerCase() !== 'false';
const limit = Math.max(1, Math.min(Number(process.env.MIGRATION_LIMIT || 25), 500));
const supported = new Set(['application/pdf','image/jpeg','image/png','image/webp','image/avif']);

const {headers, rows} = await sheetRows();
const pending = rows.filter(row =>
  row.ID_DOCUMENTO &&
  row.ID_PROCESSO &&
  row.ARQUIVO_ID &&
  !row.EXCLUIDO_EM &&
  supported.has(String(row.MIME_TYPE || '').toLowerCase())
).slice(0, limit);

log('migration_started', {dryRun, records:pending.length});

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const row of pending) {
  const version = Math.max(Number(row.MEDIA_VERSAO || row.VERSAO || 1), 1);
  const checkpointId = `migration:${row.ID_DOCUMENTO}:${version}`;
  try {
    if (await checkpointExists(checkpointId)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      log('migration_dry_run_record', {documentId:row.ID_DOCUMENTO, version});
      skipped += 1;
      continue;
    }
    const originalBuffer = await driveDownload(row.ARQUIVO_ID);
    const mimeType = String(row.MIME_TYPE).toLowerCase();
    const sourceLimit = mimeType === 'application/pdf' ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
    if (!originalBuffer.length || originalBuffer.length > sourceLimit) throw new Error('FILE_SIZE_INVALID');
    const originalHash = sha256(originalBuffer);
    const existingHash = String(row.HASH_SHA256 || '').toLowerCase();
    if (existingHash && existingHash !== originalHash) throw new Error('DRIVE_HASH_MISMATCH');
    const originalKey = objectPath(row, originalHash, 'original', mimeType);
    await uploadImmutable('autentiko-originals', originalKey, originalBuffer, mimeType);

    let thumbnail = null;
    try {
      const thumbnailBuffer = await makeThumbnail(originalBuffer, mimeType);
      const thumbnailHash = sha256(thumbnailBuffer);
      const thumbnailKey = objectPath(row, thumbnailHash, 'thumbnail', 'image/webp');
      await uploadImmutable('autentiko-thumbnails', thumbnailKey, thumbnailBuffer, 'image/webp');
      thumbnail = {buffer:thumbnailBuffer, hash:thumbnailHash, key:thumbnailKey};
    } catch (thumbnailError) {
      log('migration_thumbnail_pending', {
        documentId:row.ID_DOCUMENTO,
        code:String(thumbnailError.message || 'THUMBNAIL_FAILED').slice(0, 80)
      });
    }

    await registerMedia(row, {
      buffer:originalBuffer,
      hash:originalHash,
      key:originalKey
    }, thumbnail);
    await updateSheetRow(headers, row._row, {
      MEDIA_STATUS:'READY',
      MEDIA_VERSAO:version,
      THUMBNAIL_STATUS:thumbnail ? 'READY' : 'PENDENTE',
      PREVIEW_STATUS:'READY',
      SYNC_DRIVE_SUPABASE:'SINCRONIZADO',
      MEDIA_ATUALIZADO_EM:new Date().toISOString(),
      MEDIA_ERRO_CODIGO:''
    });
    await checkpoint(checkpointId, row, 'MIGRATION_COMPLETED', 'SUCCESS', {
      originalHash,
      thumbnail:Boolean(thumbnail)
    });
    migrated += 1;
    log('migration_record_completed', {documentId:row.ID_DOCUMENTO, version});
  } catch (error) {
    failed += 1;
    const code = String(error.message || 'MIGRATION_FAILED').slice(0, 100);
    await updateSheetRow(headers, row._row, {
      MEDIA_STATUS:'MIGRATION_FAILED',
      MEDIA_ERRO_CODIGO:code,
      MEDIA_ATUALIZADO_EM:new Date().toISOString()
    }).catch(() => {});
    await checkpoint(`${checkpointId}:failed:${Date.now()}`, row, 'MIGRATION_FAILED', 'FAILED', {code}).catch(() => {});
    log('migration_record_failed', {documentId:row.ID_DOCUMENTO, version, code});
  }
}

log('migration_finished', {migrated, skipped, failed});
if (failed) process.exitCode = 2;
