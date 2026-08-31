import {z} from 'zod';

const schema = z.object({
  SUPABASE_URL: z.url().refine((value) => value.startsWith('https://')),
  SUPABASE_STORAGE_URL: z.url().refine((value) => value.startsWith('https://')).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AUT_MEDIA_SIGNING_SECRET: z.string().min(32),
  AUTENTIKO_ALLOWED_ORIGINS: z.string().min(1),
  AUT_DRIVE_SYNC_WORKER_ENABLED: z.string().default('false'),
  ADOBE_ENABLED: z.string().default('false'),
  ADOBE_WEBHOOK_SECRET: z.string().optional(),
  ADOBE_MONTHLY_LIMIT: z.coerce.number().int().positive().default(500),
  CLOUDINARY_ENABLED: z.string().default('false'),
  CLOUDINARY_CLOUD_NAME: z.string().trim().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().trim().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(20).optional(),
  CLOUDINARY_FOLDER_MODE: z.string().default('DYNAMIC_FOLDERS')
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

function resolvedEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.AUTENTIKO_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.AUTENTIKO_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.AUTENTIKO_SUPABASE_SECRET_KEY
  };
}

export function env(): Env {
  if (!cached) cached = schema.parse(resolvedEnvironment());
  return cached;
}

export function supabaseConfigured(): boolean {
  const resolved = resolvedEnvironment();
  return Boolean(resolved.SUPABASE_URL && resolved.SUPABASE_SERVICE_ROLE_KEY);
}

export function allowedOrigins(): Set<string> {
  return new Set(env().AUTENTIKO_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean));
}

export function adobeEnabled(): boolean {
  return env().ADOBE_ENABLED.toLowerCase() === 'true';
}

export function cloudinaryEnabled(): boolean {
  return env().CLOUDINARY_ENABLED.toLowerCase() === 'true';
}

export function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}
