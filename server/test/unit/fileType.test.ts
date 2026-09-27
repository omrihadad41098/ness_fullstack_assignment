import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  matchesImageSignature,
  validateDeclaredFileType,
} from '../../src/validation/fileType.js';
import { AppError } from '../../src/http/errors.js';

const PNG_HEAD = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_HEAD = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const GIF_HEAD = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const WEBP_HEAD = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

describe('extensionOf', () => {
  it('takes the last extension, lowercased', () => {
    expect(extensionOf('photo.JPG')).toBe('jpg');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('returns empty for names without a usable extension', () => {
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
  });
});

describe('validateDeclaredFileType', () => {
  it('accepts the documented text types', () => {
    expect(validateDeclaredFileType('notes.txt', 'text/plain')).toEqual({
      kind: 'text',
      extension: 'txt',
    });
    expect(validateDeclaredFileType('doc.md', 'text/markdown').kind).toBe('text');
    expect(validateDeclaredFileType('rows.csv', 'text/csv').kind).toBe('text');
    expect(validateDeclaredFileType('data.json', 'application/json').kind).toBe('text');
  });

  it('accepts the documented image types', () => {
    expect(validateDeclaredFileType('a.png', 'image/png')).toEqual({
      kind: 'image',
      extension: 'png',
    });
    expect(validateDeclaredFileType('b.JPEG', 'image/jpeg').extension).toBe('jpeg');
    expect(validateDeclaredFileType('c.webp', 'image/webp').kind).toBe('image');
    expect(validateDeclaredFileType('d.gif', 'image/gif').kind).toBe('image');
  });

  it('ignores charset parameters on the declared type', () => {
    expect(validateDeclaredFileType('notes.txt', 'text/plain; charset=utf-8').kind).toBe('text');
  });

  it('rejects unsupported extensions with 415', () => {
    const error = catchError(() => validateDeclaredFileType('virus.exe', 'application/exe'));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((error as AppError).status).toBe(415);
  });

  it('rejects a supported extension carrying a mismatched MIME type', () => {
    expect(() => validateDeclaredFileType('fake.png', 'text/plain')).toThrow(
      /does not match ".png"/,
    );
  });

  it('rejects a file with no extension', () => {
    expect(() => validateDeclaredFileType('Makefile', 'text/plain')).toThrow(
      /Unsupported file type/,
    );
  });
});

describe('matchesImageSignature', () => {
  it('accepts real signatures', () => {
    expect(matchesImageSignature('png', PNG_HEAD)).toBe(true);
    expect(matchesImageSignature('jpg', JPEG_HEAD)).toBe(true);
    expect(matchesImageSignature('jpeg', JPEG_HEAD)).toBe(true);
    expect(matchesImageSignature('gif', GIF_HEAD)).toBe(true);
    expect(matchesImageSignature('webp', WEBP_HEAD)).toBe(true);
  });

  it('rejects a text file renamed to .png', () => {
    expect(matchesImageSignature('png', new TextEncoder().encode('hello world!'))).toBe(false);
  });

  it('rejects one image type declared as another', () => {
    expect(matchesImageSignature('png', JPEG_HEAD)).toBe(false);
    expect(matchesImageSignature('gif', PNG_HEAD)).toBe(false);
  });

  it('rejects RIFF containers that are not WEBP', () => {
    const riffWave = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]);

    expect(matchesImageSignature('webp', riffWave)).toBe(false);
  });

  it('rejects a head shorter than the signature', () => {
    expect(matchesImageSignature('png', PNG_HEAD.subarray(0, 4))).toBe(false);
    expect(matchesImageSignature('webp', WEBP_HEAD.subarray(0, 8))).toBe(false);
  });

  it('rejects unknown extensions', () => {
    expect(matchesImageSignature('bmp', PNG_HEAD)).toBe(false);
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
