import {createHash} from 'node:crypto';
import {ApiError} from './errors';
import {env} from './env';
import {supabaseAdmin} from './supabase';

function resumableUploadEndpoint(): string {
  const configured = env().SUPABASE_STORAGE_URL?.replace(/\/+$/, '');
  if (configured) return `${configured}/storage/v1/upload/resumable`;

  const projectUrl = new URL(env().SUPABASE_URL);
  const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(projectUrl.hostname);
  if (!match) {
    throw new ApiError(
      500,
      'STORAGE_ENDPOINT_INVALID',
      'Configure SUPABASE_STORAGE_URL para habilitar uploads retomáveis.'
    );
  }
  return `https://${match[1]}.storage.supabase.co/storage/v1/upload/resumable`;
}

export async function signedUpload(bucket: string, objectPath: string) {
  const {data, error} = await supabaseAdmin().storage.from(bucket).createSignedUploadUrl(objectPath, {upsert: false});
  if (error || !data?.token) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Não foi possível preparar o upload.');
  return {
    bucket,
    objectPath,
    uploadToken: data.token,
    tusEndpoint: resumableUploadEndpoint()
  };
}

export async function signedAccessUrl(bucket: string, objectPath: string, expiresIn = 60): Promise<string> {
  const {data, error} = await supabaseAdmin().storage.from(bucket).createSignedUrl(objectPath, expiresIn, {download: false});
  if (error || !data?.signedUrl) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Não foi possível liberar a visualização.');
  return data.signedUrl;
}

export async function verifyStoredObject(
  bucket: string,
  objectPath: string,
  expectedHash: string,
  expectedSize: number,
  mimeType: string
): Promise<void> {
  const url = await signedAccessUrl(bucket, objectPath, 120);
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok || !response.body) throw new ApiError(503, 'STORAGE_READ_FAILED', 'O arquivo enviado ainda não pode ser validado.');
  const length = Number(response.headers.get('content-length') || 0);
  if (length && length !== expectedSize) throw new ApiError(422, 'SIZE_MISMATCH', 'O tamanho recebido não confere.');
  const hash = createHash('sha256');
  let total = 0;
  const signatureChunks: Uint8Array[] = [];
  let signatureBytes = 0;
  const reader = response.body.getReader();
  const maxBytes = bucket === 'autentiko-thumbnails'
    ? 80 * 1024
    : bucket === 'autentiko-originals' && mimeType === 'application/pdf'
      ? 100 * 1024 * 1024
      : 25 * 1024 * 1024;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'FILE_TOO_LARGE', 'O arquivo ultrapassa o limite seguro configurado.');
    }
    if (signatureBytes < 1024) {
      const remaining = 1024 - signatureBytes;
      const slice = value.slice(0, Math.min(value.byteLength, remaining));
      signatureChunks.push(slice);
      signatureBytes += slice.byteLength;
    }
    hash.update(value);
  }
  if (total !== expectedSize) throw new ApiError(422, 'SIZE_MISMATCH', 'O tamanho recebido não confere.');
  if (hash.digest('hex') !== expectedHash.toLowerCase()) {
    throw new ApiError(422, 'HASH_MISMATCH', 'O arquivo recebido não confere com o hash informado.');
  }
  if (mimeType === 'application/pdf') {
    const signature = Buffer.concat(signatureChunks.map((chunk) => Buffer.from(chunk))).toString('latin1');
    if (!signature.includes('%PDF-')) {
      throw new ApiError(422, 'PDF_SIGNATURE_INVALID', 'O arquivo enviado não possui uma assinatura PDF válida.');
    }
  }
}
