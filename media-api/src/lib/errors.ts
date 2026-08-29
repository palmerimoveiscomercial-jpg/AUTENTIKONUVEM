export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function publicError(error: unknown): {status: number; body: Record<string, unknown>} {
  if (error instanceof ApiError) {
    return {status: error.status, body: {ok: false, code: error.code, message: error.message}};
  }
  if (error && typeof error === 'object' && 'issues' in error) {
    return {status: 400, body: {ok: false, code: 'VALIDATION_ERROR', message: 'Dados de mídia inválidos.'}};
  }
  console.error('media_api_error', {
    type: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message.slice(0, 240) : 'unknown'
  });
  return {status: 500, body: {ok: false, code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação solicitada.'}};
}
