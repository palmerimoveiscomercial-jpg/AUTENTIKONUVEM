import {NextRequest} from 'next/server';
import {enqueueDriveSync, enqueueOptimizationIfNeeded, registerCompletedMedia} from '@/lib/database';
import {fail, json, options} from '@/lib/http';
import {completionRequestSchema, completionTokenSchema} from '@/lib/schemas';
import {verifyStoredObject} from '@/lib/storage';
import {signInternal, verifyInternal} from '@/lib/ticket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return options(request);
}

export async function POST(request: NextRequest) {
  try {
    const input = completionRequestSchema.parse(await request.json());
    const completion = verifyInternal(input.completionToken, completionTokenSchema);
    for (const object of completion.objects) {
      await verifyStoredObject(object.bucket, object.objectPath, object.sha256, object.size, object.mimeType);
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
    await registerCompletedMedia(ticketLike, completion.objects);
    await enqueueDriveSync(ticketLike);
    await enqueueOptimizationIfNeeded(ticketLike, completion.objects);
    const original = completion.objects.find((item) => item.role === 'original')!;
    const receipt = signInternal({
      kind: 'media-receipt',
      status: 'READY',
      processId: completion.processId,
      documentId: completion.documentId,
      version: completion.version,
      requestId: completion.requestId,
      originalHash: original.sha256,
      thumbnailStatus: completion.objects.some((item) => item.role === 'thumbnail') ? 'READY' : 'PENDENTE',
      previewStatus: 'READY',
      exp: Math.floor(Date.now() / 1000) + 600
    });
    return json(request, {ok: true, data: {receipt, verified: true}});
  } catch (error) {
    return fail(request, error);
  }
}
