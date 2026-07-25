import {z} from 'zod';

const schema = z.object({
  SUPABASE_URL: z.url().refine((value) => value.startsWith('https://')),
  SUPABASE_STORAGE_URL: z.url().refine((value) => value.startsWith('https://')).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AUT_MEDIA_SIGNING_SECRET: z.string().min(32),
  AUTENTIKO_ALLOWED_ORIGINS: z.string().min(1),
  ADOBE_ENABLED: z.string().default('false'),
  ADOBE_WEBHOOK_SECRET: z.string().optional(),
  ADOBE_MONTHLY_LIMIT: z.coerce.number().int().positive().default(500)
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function allowedOrigins(): Set<string> {
  return new Set(env().AUTENTIKO_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean));
}

export function adobeEnabled(): boolean {
  return env().ADOBE_ENABLED.toLowerCase() === 'true';
}
