import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-for-tests-only';
process.env.AUT_MEDIA_SIGNING_SECRET ||= 'm'.repeat(32);
process.env.AUTENTIKO_ALLOWED_ORIGINS ||= 'https://script.google.com';
process.env.CLOUDINARY_ENABLED = 'true';
process.env.CLOUDINARY_CLOUD_NAME = 'llbdih6f';
process.env.CLOUDINARY_API_KEY = '123456789012345';
process.env.CLOUDINARY_API_SECRET = 's'.repeat(32);
process.env.CLOUDINARY_FOLDER_MODE = 'DYNAMIC_FOLDERS';

const {cloudinaryHandles, signedCloudinaryUpload} = await import('../src/lib/cloudinary');

test('Cloudinary recebe apenas imagens operacionais quando habilitado', () => {
  assert.equal(cloudinaryHandles('original', 'image/jpeg'), true);
  assert.equal(cloudinaryHandles('thumbnail', 'image/webp'), true);
  assert.equal(cloudinaryHandles('original', 'application/pdf'), false);
});

test('upload Cloudinary é autenticado, determinístico e usa pasta dinâmica', () => {
  const descriptor = signedCloudinaryUpload({
    processId: 'PROC-2026-001',
    documentId: 'DOC-001',
    version: 2,
    role: 'thumbnail',
    sha256: 'a'.repeat(64)
  });
  assert.equal(descriptor.provider, 'cloudinary');
  assert.equal(descriptor.deliveryType, 'authenticated');
  assert.equal(descriptor.publicId, 'aut_DOC-001_v2_thumbnail_aaaaaaaaaaaaaaaa');
  assert.equal(descriptor.assetFolder, 'autentiko/PALMER/PROC-2026-001/DOC-001/v2');
  assert.match(descriptor.signature, /^[a-f0-9]{40}$/);
  assert.match(descriptor.context, /sha256=a{64}$/);
  assert.equal(descriptor.overwrite, false);
});

test('identificadores inseguros não entram na assinatura Cloudinary', () => {
  assert.throws(() => signedCloudinaryUpload({
    processId: '../PROC',
    documentId: 'DOC-001',
    version: 1,
    role: 'original',
    sha256: 'b'.repeat(64)
  }), /Identificador de mídia inválido/);
});
