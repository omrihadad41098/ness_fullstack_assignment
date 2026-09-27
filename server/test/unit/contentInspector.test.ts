import { describe, expect, it } from 'vitest';
import { createContentInspector } from '../../src/validation/contentInspector.js';
import { AppError } from '../../src/http/errors.js';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function inspectImage(extension: string, chunks: Uint8Array[]): void {
  const inspector = createContentInspector('image', extension, `file.${extension}`);
  for (const chunk of chunks) inspector.update(chunk);
  inspector.end();
}

function inspectText(chunks: Uint8Array[]): void {
  const inspector = createContentInspector('text', 'txt', 'file.txt');
  for (const chunk of chunks) inspector.update(chunk);
  inspector.end();
}

describe('image inspector', () => {
  it('accepts a valid PNG split across chunks', () => {
    expect(() =>
      inspectImage('png', [PNG_HEADER.subarray(0, 3), PNG_HEADER.subarray(3), Buffer.alloc(64)]),
    ).not.toThrow();
  });

  it('rejects a text file renamed to .png as 415', () => {
    const error = catchError(() => inspectImage('png', [Buffer.from('not really a png at all')]));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((error as AppError).status).toBe(415);
  });

  it('rejects a file too short to carry a signature', () => {
    expect(() => inspectImage('png', [PNG_HEADER.subarray(0, 4)])).toThrow(/not a valid PNG/);
  });

  it('rejects an empty file with 400, not 415', () => {
    const error = catchError(() => inspectImage('png', []));

    expect((error as AppError).code).toBe('VALIDATION_ERROR');
  });

  it('stops inspecting once the signature is known good', () => {
    const inspector = createContentInspector('image', 'png', 'ok.png');
    inspector.update(Buffer.concat([PNG_HEADER, Buffer.alloc(4)]));

    // Garbage after the header is picture data as far as we are concerned.
    expect(() => {
      inspector.update(Buffer.from('anything at all'));
      inspector.end();
    }).not.toThrow();
  });
});

describe('text inspector', () => {
  it('accepts ASCII and multi-byte UTF-8', () => {
    expect(() => inspectText([Buffer.from('hello'), Buffer.from('שלום 😀')])).not.toThrow();
  });

  it('accepts a multi-byte character split across chunk boundaries', () => {
    const emoji = Buffer.from('😀', 'utf8');

    expect(() => inspectText([emoji.subarray(0, 2), emoji.subarray(2)])).not.toThrow();
  });

  it('rejects invalid UTF-8 (e.g. a JPEG renamed to .txt)', () => {
    const error = catchError(() => inspectText([Buffer.from([0xff, 0xd8, 0xff, 0xe0])]));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((error as AppError).message).toMatch(/not valid UTF-8/);
  });

  it('rejects a truncated multi-byte character at end of file', () => {
    const emoji = Buffer.from('😀', 'utf8');

    expect(() => inspectText([emoji.subarray(0, 2)])).toThrow(/not valid UTF-8/);
  });

  it('rejects an empty file with 400', () => {
    const error = catchError(() => inspectText([]));

    expect((error as AppError).code).toBe('VALIDATION_ERROR');
    expect((error as AppError).status).toBe(400);
  });
});

function catchError(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (err) {
    return err;
  }
}
