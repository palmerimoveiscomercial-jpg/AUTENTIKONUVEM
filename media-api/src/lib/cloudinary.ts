import {createHash, timingSafeEqual} from 'node:crypto';
import {v2 as cloudinary} from 'cloudinary';
import {ApiError} from './errors';
import {cloudinaryConfigured, cloudinaryEnabled, env} from './env';
import type {MediaRole} from './objects';

export type CloudinaryUploadProof = {
  provider: 'cloudinary';
  role: MediaRole;
  assetId: string;
  publicId: string;
  version: number;
  signature: string;
  bytes: number;
  format: string;
  resourceType: 'image' | 'video' | 'raw';
  type: string;
};

function configuredCloudinary() {
  if (!cloudinaryEnabled() || !cloudinaryConfigured()) {
    throw new ApiError(503, 'CLOUDINARY_NOT_CONFIGURED', 'O banco de imagens Cloudinary ainda não foi configurado.');
  }
  const values = env();
  cloudinary.config({
    cloud_name: values.CLOUDINARY_CLOUD_NAME,
    api_key: values.CLOUDINARY_API_KEY,
    api_secret: values.CLOUDINARY_API_SECRET,
    secure: true
  });
  return values;
}

function safeId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized) || normalized.includes('..')) {
    throw new ApiError(400, 'CLOUDINARY_ID_INVALID', 'Identificador de mídia inválido.');
  }
  return normalized;
}

export function cloudinaryHandles(role: MediaRole, mimeType: string): boolean {
  return cloudinaryEnabled() && cloudinaryConfigured() && (role === 'thumbnail' || mimeType.startsWith('image/'));
}

export function signedCloudinaryUpload(input: {
  processId: string;
  documentId: string;
  version: number;
  role: MediaRole;
  sha256: string;
}) {
  const values = configuredCloudinary();
  const processId = safeId(input.processId);
  const documentId = safeId(input.documentId);
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `aut_${documentId}_v${input.version}_${input.role}_${input.sha256.slice(0, 16)}`;
  const assetFolder = `autentiko/PALMER/${processId}/${documentId}/v${input.version}`;
  const params = {
    asset_folder: assetFolder,
    context: `tenant=PALMER|process_id=${processId}|document_id=${documentId}|role=${input.role}|sha256=${input.sha256}`,
    overwrite: 'false',
    public_id: publicId,
    timestamp,
    type: 'authenticated'
  };
  const signature = cloudinary.utils.api_sign_request(params, values.CLOUDINARY_API_SECRET!);
  return {
    provider: 'cloudinary' as const,
    role: input.role,
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(values.CLOUDINARY_CLOUD_NAME!)}/auto/upload`,
    apiKey: values.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    publicId,
    assetFolder,
    deliveryType: 'authenticated' as const,
    context: params.context,
    overwrite: false
  };
}

function constantTime(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function verifyCloudinaryProof(proof: CloudinaryUploadProof, expected: {
  role: MediaRole;
  publicId: string;
  assetFolder: string;
  size: number;
  sha256: string;
  mimeType: string;
}): Promise<void> {
  const values = configuredCloudinary();
  if (proof.provider !== 'cloudinary' || proof.role !== expected.role || proof.publicId !== expected.publicId) {
    throw new ApiError(422, 'CLOUDINARY_PROOF_INVALID', 'O comprovante do upload não corresponde ao objeto reservado.');
  }
  if (!proof.assetId || !Number.isInteger(proof.version) || proof.version < 1 || proof.bytes !== expected.size) {
    throw new ApiError(422, 'CLOUDINARY_PROOF_INVALID', 'O tamanho ou a versão do asset não confere.');
  }
  if (proof.type !== 'authenticated' || proof.resourceType !== 'image' || !expected.mimeType.startsWith('image/')) {
    throw new ApiError(422, 'CLOUDINARY_ACCESS_INVALID', 'O asset não foi armazenado com acesso autenticado.');
  }
  const signature = cloudinary.utils.api_sign_request({public_id: proof.publicId, version: proof.version}, values.CLOUDINARY_API_SECRET!);
  if (!constantTime(proof.signature, signature)) {
    throw new ApiError(422, 'CLOUDINARY_SIGNATURE_INVALID', 'A assinatura de resposta do Cloudinary é inválida.');
  }
  let asset: any;
  try {
    const result = await cloudinary.api.resources_by_asset_ids([proof.assetId]);
    asset = result?.resources?.[0];
  } catch {
    throw new ApiError(503, 'CLOUDINARY_VERIFICATION_UNAVAILABLE', 'O Cloudinary não confirmou os metadados do asset.');
  }
  const context = asset?.context?.custom || {};
  if (
    asset?.asset_id !== proof.assetId ||
    asset?.public_id !== proof.publicId ||
    Number(asset?.version) !== proof.version ||
    Number(asset?.bytes) !== expected.size ||
    asset?.resource_type !== 'image' ||
    asset?.type !== 'authenticated' ||
    asset?.format !== proof.format ||
    String(asset?.asset_folder || '') !== expected.assetFolder ||
    String(context.sha256 || '').toLowerCase() !== expected.sha256.toLowerCase()
  ) {
    throw new ApiError(422, 'CLOUDINARY_METADATA_MISMATCH', 'Os metadados do asset não correspondem ao upload reservado.');
  }
  const url = cloudinaryAccessUrl({
    publicId: proof.publicId,
    format: proof.format,
    resourceType: proof.resourceType,
    deliveryType: proof.type,
    download: false,
    expiresIn: 120
  });
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok || !response.body) {
    throw new ApiError(503, 'CLOUDINARY_READ_FAILED', 'O asset enviado ainda não pode ser validado.');
  }
  const hash = createHash('sha256');
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > expected.size || total > 25 * 1024 * 1024) {
      await reader.cancel();
      throw new ApiError(413, 'CLOUDINARY_FILE_TOO_LARGE', 'O asset ultrapassa o tamanho reservado.');
    }
    hash.update(value);
  }
  if (total !== expected.size || hash.digest('hex') !== expected.sha256.toLowerCase()) {
    throw new ApiError(422, 'CLOUDINARY_HASH_MISMATCH', 'O conteúdo recebido não confere com o hash informado.');
  }
}

export function cloudinaryAccessUrl(input: {
  publicId: string;
  format: string;
  resourceType: 'image' | 'video' | 'raw';
  deliveryType: string;
  download: boolean;
  expiresIn?: number;
}): string {
  configuredCloudinary();
  const expiresIn = Math.min(Math.max(input.expiresIn || 60, 10), 300);
  return cloudinary.utils.private_download_url(input.publicId, input.format, {
    resource_type: input.resourceType,
    type: input.deliveryType as 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    attachment: input.download
  });
}

export async function pingCloudinary(): Promise<boolean> {
  if (!cloudinaryEnabled() || !cloudinaryConfigured()) return false;
  try {
    configuredCloudinary();
    const response = await cloudinary.api.ping();
    return response?.status === 'ok';
  } catch {
    return false;
  }
}
