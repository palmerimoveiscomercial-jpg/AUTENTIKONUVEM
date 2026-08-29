import {z} from 'zod';

const safeIdentifier = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:@/-]+$/);

export const searchRecordSchema = z.object({
  tenantId: safeIdentifier.default('PALMER'),
  sourceType: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_]+$/),
  sourceId: safeIdentifier,
  protocol: z.string().trim().max(80).default(''),
  document: z.string().trim().max(40).default(''),
  title: z.string().trim().max(500).default(''),
  status: z.string().trim().max(80).default(''),
  updatedAt: z.iso.datetime({offset: true}).or(z.iso.datetime()).optional(),
  payload: z.record(z.string(), z.unknown())
});

export const syncRequestSchema = z.object({
  schemaVersion: z.literal('1.0.0').default('1.0.0'),
  requestId: safeIdentifier,
  source: z.enum(['APPS_SCRIPT_SHEETS', 'MIGRATION', 'ADMIN_REBUILD']).default('APPS_SCRIPT_SHEETS'),
  records: z.array(searchRecordSchema).min(1).max(500)
});

export const contractIssueSchema = z.object({
  idempotencyKey: safeIdentifier,
  processId: safeIdentifier.optional(),
  protocol: z.string().trim().min(1).max(80).optional(),
  proposalId: safeIdentifier.optional(),
  requestedBy: safeIdentifier,
  final: z.boolean().default(false),
  includeHtml: z.boolean().default(false),
  context: z.record(z.string(), z.unknown()).optional()
}).refine((value) => Boolean(value.processId || value.protocol || value.context), {
  message: 'Informe processId, protocolo ou contexto contratual.'
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type ContractIssueRequest = z.infer<typeof contractIssueSchema>;
