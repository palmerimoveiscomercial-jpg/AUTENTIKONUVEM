import {NextRequest} from 'next/server';
import {consumeTicket} from '@/lib/database';
import {fail, json, options} from '@/lib/http';
import {assertMediaInput, bucketFor, immutableObjectPath} from '@/lib/objects';
import {uploadRequestSchema} from '@/lib/schemas';
import {signedUpload} from '@/lib/storage';
import {signInternal, verifyTicket} from '@/lib/ticket';
import {cloudinaryHandles, signedCloudinaryUpload} from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function POST(request: NextRequest) {
  try {
    const input = uploadRequestSchema.parse(await request.json());
    const ticket = verifyTicket(input.ticket, ['UPLOAD']);
    await consumeTicket(ticket, 'UPLOAD_TICKET_CONSUMED');

    const objects = [];
    for (const item of input.objects) {
      assertMediaInput(item.role, item.mimeType, item.size, item.sha256);
      const objectPath = immutableObjectPath({
        processId: ticket.processId,
        documentId: ticket.documentId,
        version: ticket.version,
        sha256: item.sha256,
        role: item.role,
        mimeType: item.mimeType
      });
      if (cloudinaryHandles(item.role, item.mimeType)) {
        const upload = signedCloudinaryUpload({
          processId: ticket.processId,
          documentId: ticket.documentId,
          version: ticket.version,
          role: item.role,
          sha256: item.sha256
        });
        objects.push({...item, ...upload, bucket: 'cloudinary', objectPath: upload.publicId});
      } else {
        const bucket = bucketFor(item.role);
        const upload = await signedUpload(bucket, objectPath);
        objects.push({...item, provider: 'supabase' as const, ...upload});
      }
    }

    const completionToken = signInternal({
      kind: 'upload-completion',
      sub: ticket.sub,
      processId: ticket.processId,
      documentId: ticket.documentId,
      version: ticket.version,
      requestId: ticket.requestId,
      objects: objects.map((object) => ({
        role: object.role,
        mimeType: object.mimeType,
        size: object.size,
        sha256: object.sha256,
        provider: object.provider,
        bucket: object.bucket,
        objectPath: object.objectPath,
        publicId: object.provider === 'cloudinary' ? object.publicId : undefined,
        assetFolder: object.provider === 'cloudinary' ? object.assetFolder : undefined
      })),
      exp: Math.floor(Date.now() / 1000) + 600
    });

    return json(request, {ok: true, data: {objects, completionToken}});
  } catch (error) {
    return fail(request, error);
  }
}
