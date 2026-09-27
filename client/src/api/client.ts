import type { ErrorCode, ErrorResponse } from './types';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string | null;

  constructor(code: ErrorCode, message: string, status: number, requestId: string | null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export type RequestOptions = {
  signal?: AbortSignal;
  method?: string;
  body?: BodyInit;
};

/**
 * Single entry point for API calls: forces `no-store` (project constraint) and
 * turns the server's error envelope into an ApiError the UI can render.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const requestId = response.headers.get('x-request-id');
    if (isErrorResponse(payload)) {
      throw new ApiError(
        payload.error.code,
        payload.error.message,
        response.status,
        payload.error.requestId ?? requestId,
      );
    }
    // Non-JSON body (proxy error page, gateway timeout): keep a usable message.
    throw new ApiError(
      'INTERNAL',
      `Request failed with status ${response.status}`,
      response.status,
      requestId,
    );
  }

  return payload as T;
}
