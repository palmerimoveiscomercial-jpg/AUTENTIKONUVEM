import {ApiError} from './errors';

export type MediaRole = 'original' | 'thumbnail' | 'preview';

const extensionByMime: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif'
};

export function assertMediaInput(role: MediaRole, mimeType: string, size: number, sha256: string): void {
  if (!extensionByMime[mimeType]) throw new ApiError(400, 'MIME_NOT_ALLOWED', 'Formato de mídia não permitido.');
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new ApiError(400, 'HASH_INVALID', 'Hash SHA-256 inválido.');
  const max = role === 'thumbnail'
    ? 80 * 1024
    : role === 'original' && mimeType === 'application/pdf'
      ? 100 * 1024 * 1024
      : 25 * 1024 * 1024;
  if (!Number.isInteger(size) || size < 1 || size > max) {
    throw new ApiError(413, 'FILE_TOO_LARGE', role === 'thumbnail'
      ? 'A miniatura deve possuir no máximo 80 KB.'
      : mimeType === 'application/pdf'
        ? 'O PDF original deve possuir no máximo 100 MB.'
        : 'O documento deve possuir no máximo 25 MB.');
  }
  if (role === 'thumbnail' && !mimeType.startsWith('image/')) {
    throw new ApiError(400, 'THUMBNAIL_INVALID', 'A miniatura deve ser uma imagem.');
  }
}

function safeSegment(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized) || normalized.includes('..')) {
    throw new ApiError(400, 'OBJECT_PATH_INVALID', 'Identificador de objeto inválido.');
  }
  return normalized;
}

export function bucketFor(role: MediaRole): string {
  if (role === 'original') return 'autentiko-originals';
  if (role === 'thumbnail') return 'autentiko-thumbnails';
  return 'autentiko-previews';
}

export function immutableObjectPath(input: {
  processId: string;
  documentId: string;
  version: number;
  sha256: string;
  role: MediaRole;
  mimeType: string;
}): string {
  const extension = extensionByMime[input.mimeType];
  if (!extension) throw new ApiError(400, 'MIME_NOT_ALLOWED', 'Formato de mídia não permitido.');
  return [
    safeSegment(input.processId),
    safeSegment(input.documentId),
    `v${input.version}`,
    input.sha256.toLowerCase(),
    `${input.role}.${extension}`
  ].join('/');
}
