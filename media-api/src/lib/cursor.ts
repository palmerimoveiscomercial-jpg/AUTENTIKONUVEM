import {ApiError} from './errors';

export type SearchCursor = {updatedAt: string; sourceId: string};

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeSearchCursor(raw: string | null): SearchCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as SearchCursor;
    if (!parsed || typeof parsed.sourceId !== 'string' || parsed.sourceId.length > 200 ||
        typeof parsed.updatedAt !== 'string' || Number.isNaN(Date.parse(parsed.updatedAt))) {
      throw new Error('invalid');
    }
    return parsed;
  } catch {
    throw new ApiError(400, 'CURSOR_INVALID', 'Cursor de paginação inválido.');
  }
}
