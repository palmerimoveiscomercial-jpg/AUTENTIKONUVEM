import {z} from 'zod';

export const objectInputSchema = z.object({
  role: z.enum(['original', 'thumbnail']),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i)
});

export const uploadRequestSchema = z.object({
  ticket: z.string().min(20),
  objects: z.array(objectInputSchema).min(1).max(2)
}).refine((value) => value.objects.filter((item) => item.role === 'original').length === 1, {
  message: 'O original é obrigatório e deve ser único.'
});

export const completionObjectSchema = objectInputSchema.extend({
  bucket: z.enum(['autentiko-originals', 'autentiko-thumbnails']),
  objectPath: z.string().min(10).max(1024)
});

export const completionTokenSchema = z.object({
  kind: z.literal('upload-completion'),
  sub: z.string(),
  processId: z.string(),
  documentId: z.string(),
  version: z.number().int().positive(),
  requestId: z.string(),
  objects: z.array(completionObjectSchema).min(1).max(2),
  exp: z.number().int().positive()
});

export const completionRequestSchema = z.object({
  completionToken: z.string().min(20)
});

export const accessRequestSchema = z.object({
  ticket: z.string().min(20),
  preferOptimized: z.boolean().default(true),
  role: z.enum(['document', 'thumbnail']).default('document')
});

export const statusRequestSchema = z.object({
  ticket: z.string().min(20)
});

export const retryRequestSchema = z.object({
  ticket: z.string().min(20)
});

export const auditAnchorTokenSchema = z.object({
  kind: z.literal('audit-anchor'),
  iss: z.literal('autentiko-apps-script'),
  source: z.literal('APPS_SCRIPT_SHEETS'),
  sourceSequence: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  chainHash: z.string().regex(/^(?:[a-f0-9]{64})?$/i),
  appVersion: z.string().min(1).max(32),
  actorId: z.string().min(1).max(128),
  requestId: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  signedAt: z.string().min(20).max(64),
  iat: z.number().int().positive(),
  exp: z.number().int().positive()
});

export const auditAnchorRequestSchema = z.object({
  token: z.string().min(20)
});
