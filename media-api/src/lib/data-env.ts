import {z} from 'zod';

const dataSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  AUT_DATA_API_KEY: z.string().min(32),
  AUT_DATA_SYNC_SECRET: z.string().min(32),
  AUT_DATA_ALLOWED_ORIGINS: z.string().default('https://script.google.com,https://script.googleusercontent.com'),
  AUT_CONTRACT_FINAL_ENABLED: z.string().default('false')
});

export type DataEnv = z.infer<typeof dataSchema>;

let cached: DataEnv | undefined;

export function dataEnv(): DataEnv {
  if (!cached) cached = dataSchema.parse(process.env);
  return cached;
}

export function dataCloudConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL &&
    process.env.AUT_DATA_API_KEY &&
    process.env.AUT_DATA_SYNC_SECRET
  );
}

export function dataAllowedOrigins(): Set<string> {
  const raw = process.env.AUT_DATA_ALLOWED_ORIGINS ||
    'https://script.google.com,https://script.googleusercontent.com';
  return new Set(raw.split(',').map((value) => value.trim()).filter(Boolean));
}

export function finalContractEnabled(): boolean {
  return (process.env.AUT_CONTRACT_FINAL_ENABLED || 'false').toLowerCase() === 'true';
}
