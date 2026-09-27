import { describe, expect, it, vi } from 'vitest';
import { noCache } from '../../src/http/middleware/noCache.js';
import { requestId } from '../../src/http/middleware/requestId.js';
import { buildHealthResponse } from '../../src/http/routes/health.js';
import { fakeNext, fakeRequest, fakeResponse, headerGetter } from './testDoubles.js';

describe('noCache', () => {
  it('sets no-store on every response', () => {
    const res = fakeResponse();
    const next = fakeNext();

    noCache(fakeRequest(), res, next);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requestId', () => {
  it('reuses an incoming x-request-id', () => {
    const req = fakeRequest({ get: headerGetter(' from-client ') });
    const res = fakeResponse();

    requestId(req, res, fakeNext());

    expect(req.requestId).toBe('from-client');
    expect(res.headers['x-request-id']).toBe('from-client');
  });

  it('generates an id when the header is absent or blank', () => {
    const req = fakeRequest({ get: headerGetter('   ') });
    const res = fakeResponse();

    requestId(req, res, fakeNext());

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-request-id']).toBe(req.requestId);
  });
});

describe('buildHealthResponse', () => {
  it('reports the db as up or down from the injected probe', () => {
    expect(buildHealthResponse({ aiProviderName: 'fake', isDbUp: () => true })).toEqual({
      status: 'ok',
      db: 'up',
      aiProvider: 'fake',
    });
    expect(buildHealthResponse({ aiProviderName: 'gemini', isDbUp: vi.fn(() => false) })).toEqual({
      status: 'ok',
      db: 'down',
      aiProvider: 'gemini',
    });
  });
});
