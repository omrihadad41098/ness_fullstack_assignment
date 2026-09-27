import { AppError } from '../http/errors.js';
import type { AssetKind } from '../types/api.js';

/**
 * Canonical extension → accepted declared MIME types. A browser may send a vaguer type than the
 * extension implies (`.csv` as `text/plain`, `.md` as `application/octet-stream` on Windows), so the
 * declared type is an allow-list check, never the sole source of truth: images are re-checked against
 * their magic bytes and text against UTF-8 decoding.
 */
const TEXT_TYPES: Record<string, string[]> = {
  txt: ['text/plain'],
  md: ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream'],
  csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  json: ['application/json', 'text/json', 'text/plain'],
};

const IMAGE_TYPES: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
};

/** Mirrors the `maxlength` on `Asset.originalName`, so a long name is a 400 rather than a 500. */
export const MAX_FILE_NAME_LENGTH = 255;

export type DeclaredFileType = {
  kind: AssetKind;
  /** Normalised extension without the dot; `jpg` and `jpeg` stay distinct but share a signature. */
  extension: string;
};

export function extensionOf(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function supportedExtensions(): string[] {
  return [...Object.keys(TEXT_TYPES), ...Object.keys(IMAGE_TYPES)];
}

/** Throws `UNSUPPORTED_FILE_TYPE` (415) unless both extension and declared MIME are allowed. */
export function validateDeclaredFileType(fileName: string, mimeType: string): DeclaredFileType {
  if (fileName.trim().length > MAX_FILE_NAME_LENGTH) {
    throw new AppError(
      'VALIDATION_ERROR',
      `File name is longer than ${MAX_FILE_NAME_LENGTH} characters`,
      { length: fileName.length },
    );
  }
  const extension = extensionOf(fileName);
  const declared = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

  const kind: AssetKind | null =
    extension in TEXT_TYPES ? 'text' : extension in IMAGE_TYPES ? 'image' : null;

  if (kind === null) {
    throw new AppError(
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported file type ".${extension}". Allowed: ${supportedExtensions().join(', ')}`,
      { fileName },
    );
  }

  const allowed = (kind === 'text' ? TEXT_TYPES : IMAGE_TYPES)[extension] ?? [];
  if (!allowed.includes(declared)) {
    throw new AppError(
      'UNSUPPORTED_FILE_TYPE',
      `Content type "${declared}" does not match ".${extension}"`,
      { fileName, mimeType: declared },
    );
  }

  return { kind, extension };
}

/** Bytes needed before an image signature can be judged (WEBP needs RIFF....WEBP). */
export const MAGIC_BYTES_NEEDED = 12;

const SIGNATURES: Record<string, (head: Uint8Array) => boolean> = {
  png: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  jpeg: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  gif: (h) => startsWith(h, [0x47, 0x49, 0x46, 0x38]),
  webp: (h) =>
    startsWith(h, [0x52, 0x49, 0x46, 0x46]) && startsWith(h.subarray(8), [0x57, 0x45, 0x42, 0x50]),
};

function startsWith(head: Uint8Array, signature: number[]): boolean {
  if (head.length < signature.length) return false;
  return signature.every((byte, index) => head[index] === byte);
}

export function matchesImageSignature(extension: string, head: Uint8Array): boolean {
  const check = SIGNATURES[extension];
  return check === undefined ? false : check(head);
}
