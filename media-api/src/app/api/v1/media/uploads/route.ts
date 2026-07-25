import {NextRequest} from 'next/server';
import {consumeTicket} from '@/lib/database';
import {fail, json, options} from '@/lib/http';
import {assertMediaInput, bucketFor, immutableObjectPath} from '@/lib/objects';
import {uploadRequestSchema} from '@/lib/schemas';
import {signedUpload} from '@/lib/storage';
import {signInternal, verifyTicket} from '@/lib/ticket';

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
      const bucket = bucketFor(item.role);
      const objectPath = immutableObjectPath({
        processId: ticket.processId,
        documentId: ticket.documentId,
        version: ticket.version,
        sha256: item.sha256,
        role: item.role,
        mimeType: item.mimeType
      });
      const upload = await signedUpload(bucket, objectPath);
      objects.push({...item, ...upload});
    }

    const completionToken = signInternal({
      kind: 'upload-completion',
      sub: ticket.sub,
      processId: ticket.processId,
      documentId: ticket.documentId,
      version: ticket.version,
      requestId: ticket.requestId,
      objects: objects.map(({role, mimeType, size, sha256, bucket, objectPath}) => ({
        role, mimeType, size, sha256, bucket, objectPath
      })),
      exp: Math.floor(Date.now() / 1000) + 600
    });

    return json(request, {ok: true, data: {objects, completionToken}});
  } catch (error) {
    return fail(request, error);
  }
}
