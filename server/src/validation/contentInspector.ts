import { AppError } from '../http/errors.js';
import { MAGIC_BYTES_NEEDED, matchesImageSignature } from './fileType.js';
import type { AssetKind } from '../types/api.js';

/**
 * Validates a file's *bytes* while they stream past, so a 10 MB upload is never buffered whole.
 * `update` throws as soon as the content is provably wrong; `end` catches files that were too short
 * to judge or empty.
 */
export type ContentInspector = {
  update(chunk: Uint8Array): void;
  end(): void;
};

export function createContentInspector(
  kind: AssetKind,
  extension: string,
  fileName: string,
): ContentInspector {
  return kind === 'image'
    ? createImageInspector(extension, fileName)
    : createTextInspector(fileName);
}

function createImageInspector(extension: string, fileName: string): ContentInspector {
  const head: number[] = [];
  let decided = false;

  const judge = (final: boolean): void => {
    if (decided) return;
    if (!final && head.length < MAGIC_BYTES_NEEDED) return;
    decided = true;
    if (!matchesImageSignature(extension, Uint8Array.from(head))) {
      throw new AppError(
        'UNSUPPORTED_FILE_TYPE',
        `File content is not a valid ${extension.toUpperCase()} image`,
        { fileName },
      );
    }
  };

  return {
    update(chunk) {
      if (decided) return;
      for (const byte of chunk) {
        if (head.length >= MAGIC_BYTES_NEEDED) break;
        head.push(byte);
      }
      judge(false);
    },
    end() {
      if (head.length === 0) throw emptyFile(fileName);
      judge(true);
    },
  };
}

function createTextInspector(fileName: string): ContentInspector {
  // fatal:true makes the decoder throw on invalid sequences; stream:true keeps multi-byte
  // characters split across chunk boundaries valid.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let sawBytes = false;

  const reject = (): never => {
    throw new AppError('UNSUPPORTED_FILE_TYPE', 'Text file is not valid UTF-8', { fileName });
  };

  return {
    update(chunk) {
      if (chunk.length > 0) sawBytes = true;
      try {
        decoder.decode(chunk, { stream: true });
      } catch {
        reject();
      }
    },
    end() {
      if (!sawBytes) throw emptyFile(fileName);
      try {
        decoder.decode();
      } catch {
        // A truncated multi-byte character at EOF means the file is not valid UTF-8 either.
        reject();
      }
    },
  };
}

function emptyFile(fileName: string): AppError {
  return new AppError('VALIDATION_ERROR', 'File is empty', { fileName });
}
