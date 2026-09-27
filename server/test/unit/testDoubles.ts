import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';

export type FakeResponse = Response & {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
};

export function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/assets',
    originalUrl: '/api/assets',
    requestId: 'req-1',
    get: () => undefined,
    ...overrides,
  } as Request;
}

/** Express types `get` as an overloaded getter; unit tests only need the string form. */
export function headerGetter(value: string | undefined): Request['get'] {
  return (() => value) as unknown as Request['get'];
}

/** Minimal Express Response stand-in — avoids booting an HTTP server in unit tests. */
export function fakeResponse(): FakeResponse {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
  };
  return res as unknown as FakeResponse;
}

export function fakeNext(): NextFunction {
  return vi.fn();
}
