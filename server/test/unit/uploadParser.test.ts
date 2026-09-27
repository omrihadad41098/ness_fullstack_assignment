import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingHttpHeaders } from 'node:http';
import { parseUpload, type UploadedFile } from '../../src/http/uploadParser.js';
import { AppError } from '../../src/http/errors.js';
import { createFakeStorage, type FakeStorage } from './fakes.js';

const BOUNDARY = 'kmsboundary';
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 7),
]);

type Part = { field?: string; filename: string; contentType: string; body: Buffer | string };

function multipartRequest(parts: Part[]): Readable & { headers: IncomingHttpHeaders } {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="${part.field ?? 'files'}"; filename="${part.filename}"\r\n` +
          `Content-Type: ${part.contentType}\r\n\r\n`,
      ),
      Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));

  const req = Readable.from([Buffer.concat(chunks)]) as Readable & {
    headers: IncomingHttpHeaders;
  };
  req.headers = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };
  return req;
}

let storage: FakeStorage;

function upload(
  parts: Part[],
  limits: { maxBytes?: number; maxFiles?: number } = {},
): Promise<UploadedFile[]> {
  return parseUpload(multipartRequest(parts), {
    storage,
    maxBytes: limits.maxBytes ?? 1024 * 1024,
    maxFiles: limits.maxFiles ?? 10,
  });
}

beforeEach(() => {
  storage = createFakeStorage();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseUpload', () => {
  it('streams several files into storage and reports their metadata', async () => {
    const files = await upload([
      { filename: 'notes.txt', contentType: 'text/plain', body: 'hello world' },
      { filename: 'cat.png', contentType: 'image/png', body: PNG_BYTES },
    ]);

    expect(files).toHaveLength(2);
    expect(files.map((f) => [f.originalName, f.kind, f.sizeBytes])).toEqual([
      ['notes.txt', 'text', 11],
      ['cat.png', 'image', PNG_BYTES.length],
    ]);
    expect(storage.stored.size).toBe(2);
    expect([...storage.written.values()].some((b) => b.equals(PNG_BYTES))).toBe(true);
  });

  it('rejects an unsupported extension with 415 and stores nothing', async () => {
    const error = await upload([
      { filename: 'script.exe', contentType: 'application/exe', body: 'MZ' },
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(415);
    expect(storage.stored.size).toBe(0);
  });

  it('rejects a text file renamed .png and deletes the partial file', async () => {
    const error = await upload([
      { filename: 'fake.png', contentType: 'image/png', body: 'this is not a png' },
    ]).catch((e: unknown) => e);

    expect((error as AppError).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(storage.stored.size).toBe(0);
  });

  it('rejects invalid UTF-8 declared as text', async () => {
    const error = await upload([
      { filename: 'bad.txt', contentType: 'text/plain', body: Buffer.from([0xff, 0xfe, 0xfd]) },
    ]).catch((e: unknown) => e);

    expect((error as AppError).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(storage.stored.size).toBe(0);
  });

  it('rejects a file over the size limit with 413 and cleans up', async () => {
    const error = await upload(
      [{ filename: 'big.txt', contentType: 'text/plain', body: 'x'.repeat(5000) }],
      { maxBytes: 1000 },
    ).catch((e: unknown) => e);

    expect((error as AppError).code).toBe('FILE_TOO_LARGE');
    expect((error as AppError).status).toBe(413);
    expect(storage.stored.size).toBe(0);
  });

  it('deletes already-accepted files when a later file in the batch fails', async () => {
    const error = await upload([
      { filename: 'good.txt', contentType: 'text/plain', body: 'fine' },
      { filename: 'bad.exe', contentType: 'application/exe', body: 'nope' },
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    // The whole request fails, so the first file must not survive as a half-applied upload.
    expect(storage.stored.size).toBe(0);
  });

  it('rejects a file name longer than the model allows with 400, not a database 500', async () => {
    const error = await upload([
      { filename: `${'a'.repeat(300)}.txt`, contentType: 'text/plain', body: 'hi' },
    ]).catch((e: unknown) => e);

    expect((error as AppError).code).toBe('VALIDATION_ERROR');
    expect((error as AppError).status).toBe(400);
    expect(storage.stored.size).toBe(0);
  });

  it('rejects more files than the limit allows', async () => {
    const parts = Array.from({ length: 3 }, (_, i) => ({
      filename: `f${i}.txt`,
      contentType: 'text/plain',
      body: 'data',
    }));

    const error = await upload(parts, { maxFiles: 2 }).catch((e: unknown) => e);

    expect((error as AppError).code).toBe('VALIDATION_ERROR');
    expect(storage.stored.size).toBe(0);
  });

  it('rejects the wrong form field name', async () => {
    const error = await upload([
      { field: 'file', filename: 'notes.txt', contentType: 'text/plain', body: 'hi' },
    ]).catch((e: unknown) => e);

    expect((error as AppError).message).toMatch(/upload files under "files"/);
  });

  it('rejects a request with no files', async () => {
    const error = await upload([]).catch((e: unknown) => e);

    expect((error as AppError).code).toBe('VALIDATION_ERROR');
    expect((error as AppError).message).toMatch(/No files uploaded/);
  });

  it('rejects a body that is not multipart', async () => {
    const req = Readable.from([Buffer.from('{"not":"multipart"}')]) as Readable & {
      headers: IncomingHttpHeaders;
    };
    req.headers = { 'content-type': 'application/json' };

    const error = await parseUpload(req, { storage, maxBytes: 1000, maxFiles: 5 }).catch(
      (e: unknown) => e,
    );

    expect((error as AppError).code).toBe('VALIDATION_ERROR');
    expect((error as AppError).message).toMatch(/multipart\/form-data/);
  });
});
