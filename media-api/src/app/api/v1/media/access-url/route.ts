import {NextRequest} from 'next/server';
import {consumeTicket, findReadyObject} from '@/lib/database';
import {fail, json, options} from '@/lib/http';
import {accessRequestSchema} from '@/lib/schemas';
import {signedAccessUrl} from '@/lib/storage';
import {verifyTicket} from '@/lib/ticket';
import {cloudinaryAccessUrl} from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function POST(request: NextRequest) {
  try {
    const input = accessRequestSchema.parse(await request.json());
    const ticket = verifyTicket(input.ticket, ['VIEW', 'DOWNLOAD']);
    await consumeTicket(ticket, `${ticket.action}_TICKET_CONSUMED`);
    const roles = input.role === 'thumbnail'
      ? ['thumbnail'] as const
      : input.preferOptimized && ticket.action === 'VIEW'
        ? ['preview', 'original'] as const
        : ['original'] as const;
    const object = await findReadyObject(ticket.documentId, ticket.version, [...roles]);
    const accessUrl = object.provider === 'cloudinary'
      ? cloudinaryAccessUrl({
          publicId: object.publicId || object.objectPath,
          format: object.format || object.mimeType.split('/')[1] || 'jpg',
          resourceType: object.resourceType || 'image',
          deliveryType: object.deliveryType || 'authenticated',
          download: ticket.action === 'DOWNLOAD',
          expiresIn: 60
        })
      : await signedAccessUrl(object.bucket, object.objectPath, 60);
    return json(request, {
      ok: true,
      data: {
        accessUrl,
        expiresIn: 60,
        mimeType: object.mimeType,
        size: object.size,
        sha256: object.sha256,
        optimized: object.role === 'preview',
        provider: object.provider
      }
    });
  } catch (error) {
    return fail(request, error);
  }
}
