import {NextRequest} from 'next/server';
import {registerCompletedMedia} from '@/lib/database';
import {fail, json, options} from '@/lib/http';
import {completionRequestSchema, completionTokenSchema} from '@/lib/schemas';
import {verifyStoredObject} from '@/lib/storage';
import {signInternal, verifyInternal} from '@/lib/ticket';
import {verifyCloudinaryProof, type CloudinaryUploadProof} from '@/lib/cloudinary';
import type {StoredObject} from '@/lib/database';
import {ApiError} from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function POST(request: NextRequest) {
  try {
    const input = completionRequestSchema.parse(await request.json());
    const completion = verifyInternal(input.completionToken, completionTokenSchema);
    const verifiedObjects: StoredObject[] = [];
    for (const object of completion.objects) {
      if (object.provider === 'cloudinary') {
        const proof = input.providerProofs.find((item) => item.role === object.role && item.publicId === object.publicId);
        if (!proof) throw new ApiError(422, 'CLOUDINARY_PROOF_REQUIRED', 'O comprovante do upload Cloudinary não foi enviado.');
        await verifyCloudinaryProof(proof as CloudinaryUploadProof, {
          role: object.role,
          publicId: object.publicId || object.objectPath,
          assetFolder: object.assetFolder || '',
          size: object.size,
          sha256: object.sha256,
          mimeType: object.mimeType
        });
        verifiedObjects.push({
          role: object.role,
          provider: 'cloudinary',
          bucket: 'cloudinary',
          objectPath: object.objectPath,
          mimeType: object.mimeType,
          size: object.size,
          sha256: object.sha256,
          providerAssetId: proof.assetId,
          publicId: proof.publicId,
          format: proof.format,
          resourceType: proof.resourceType,
          deliveryType: proof.type,
          assetFolder: object.assetFolder || ''
        });
      } else {
        await verifyStoredObject(object.bucket, object.objectPath, object.sha256, object.size, object.mimeType);
        verifiedObjects.push({...object, provider: 'supabase'});
      }
    }
    const ticketLike = {
      v: 1 as const,
      iss: 'autentiko-apps-script' as const,
      sub: completion.sub,
      processId: completion.processId,
      documentId: completion.documentId,
      version: completion.version,
      action: 'UPLOAD' as const,
      requestId: completion.requestId,
      jti: `complete:${completion.requestId}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600
    };
    await registerCompletedMedia(ticketLike, verifiedObjects);
    const original = completion.objects.find((item) => item.role === 'original')!;
    const receipt = signInternal({
      kind: 'media-receipt',
      status: 'READY',
      processId: completion.processId,
      documentId: completion.documentId,
      version: completion.version,
      requestId: completion.requestId,
      originalHash: original.sha256,
      mediaProvider: original.provider === 'cloudinary' ? 'CLOUDINARY' : 'SUPABASE',
      thumbnailStatus: completion.objects.some((item) => item.role === 'thumbnail') ? 'READY' : 'PENDENTE',
      previewStatus: 'READY',
      exp: Math.floor(Date.now() / 1000) + 600
    });
    return json(request, {ok: true, data: {receipt, verified: true}});
  } catch (error) {
    return fail(request, error);
  }
}
