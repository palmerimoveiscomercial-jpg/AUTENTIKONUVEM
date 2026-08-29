import {neon, type NeonQueryFunction} from '@neondatabase/serverless';
import {ApiError} from './errors';

let cached: NeonQueryFunction<false, false> | undefined;

function sqlClient(): NeonQueryFunction<false, false> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new ApiError(503, 'NEON_NOT_CONFIGURED', 'O banco Neon ainda não foi configurado.');
  }
  if (!cached) cached = neon(connectionString);
  return cached;
}

export async function dataQuery<T extends Record<string, unknown>>(
  statement: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    return await sqlClient().query(statement, params) as T[];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('neon_query_error', {
      type: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message.slice(0, 240) : 'unknown'
    });
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'O banco de consultas não está disponível.');
  }
}

export async function pingNeon(): Promise<boolean> {
  try {
    const rows = await dataQuery<{ok: number}>('select 1 as ok');
    return rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
