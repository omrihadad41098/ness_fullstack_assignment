import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './client';

type FetchArgs = Parameters<typeof fetch>;

function mockFetch(response: Response) {
  const spy = vi.fn<(...args: FetchArgs) => Promise<Response>>().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('requests with cache: no-store', async () => {
    const spy = mockFetch(jsonResponse({ status: 'ok' }));

    await apiFetch('/api/health');

    expect(spy).toHaveBeenCalledWith('/api/health', expect.objectContaining({ cache: 'no-store' }));
  });

  it('returns the parsed body on success', async () => {
    mockFetch(jsonResponse({ status: 'ok', db: 'up', aiProvider: 'fake' }));

    await expect(apiFetch('/api/health')).resolves.toEqual({
      status: 'ok',
      db: 'up',
      aiProvider: 'fake',
    });
  });

  it('returns undefined for 204 without parsing a body', async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(apiFetch('/api/assets/1')).resolves.toBeUndefined();
  });

  it('turns the server error envelope into an ApiError', async () => {
    mockFetch(
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'asset not found', requestId: 'req-9' } },
        { status: 404 },
      ),
    );

    const error = await apiFetch('/api/assets/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'asset not found',
      status: 404,
      requestId: 'req-9',
    });
  });

  it('falls back to a generic ApiError for a non-JSON error body', async () => {
    mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    const error = await apiFetch('/api/health').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INTERNAL', status: 502 });
    expect((error as ApiError).message).toBe('Request failed with status 502');
  });

  it('propagates an abort', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('Aborted', 'AbortError'))),
    );
    controller.abort();

    await expect(apiFetch('/api/health', { signal: controller.signal })).rejects.toThrow('Aborted');
  });
});
