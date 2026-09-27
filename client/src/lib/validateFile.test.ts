import { describe, expect, it } from 'vitest';
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILES,
  extensionOf,
  partitionFiles,
  validateFile,
} from './validateFile';

const MB = 1024 * 1024;

/** A File stand-in: only `name` and `size` are read, and Node has no real File picker. */
function fakeFile(name: string, size: number): File {
  return { name, size } as File;
}

describe('extensionOf', () => {
  it('lowercases the extension', () => {
    expect(extensionOf('Photo.PNG')).toBe('png');
  });

  it('uses the last dot', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('returns empty for names without a usable extension', () => {
    for (const name of ['README', '.gitignore', 'trailing.']) {
      expect(extensionOf(name)).toBe('');
    }
  });
});

describe('validateFile', () => {
  it('accepts the documented text and image types', () => {
    for (const name of ['a.txt', 'a.md', 'a.csv', 'a.json', 'a.png', 'a.jpg', 'a.webp', 'a.gif']) {
      expect(validateFile(fakeFile(name, 100), 10 * MB)).toBeNull();
    }
  });

  it('rejects an unsupported extension by name', () => {
    expect(validateFile(fakeFile('clip.mp4', 100), 10 * MB)?.reason).toContain('".mp4"');
  });

  it('rejects an empty file', () => {
    expect(validateFile(fakeFile('a.txt', 0), 10 * MB)?.reason).toBe('file is empty');
  });

  it('rejects a file over the limit and states the limit', () => {
    expect(validateFile(fakeFile('a.png', 11 * MB), 10 * MB)?.reason).toBe('larger than 10 MB');
  });
});

describe('partitionFiles', () => {
  it('keeps the good files and explains each rejection', () => {
    const { accepted, problems } = partitionFiles(
      [fakeFile('a.txt', 10), fakeFile('b.mp4', 10), fakeFile('c.png', 99 * MB)],
      10 * MB,
    );

    expect(accepted.map((file) => file.name)).toEqual(['a.txt']);
    expect(problems.map((problem) => problem.fileName)).toEqual(['b.mp4', 'c.png']);
  });

  it('caps the batch at the server limit instead of failing the whole upload', () => {
    const files = Array.from({ length: MAX_FILES + 3 }, (_, i) => fakeFile(`f${i}.txt`, 10));

    const { accepted, problems } = partitionFiles(files, 10 * MB);

    expect(accepted).toHaveLength(MAX_FILES);
    expect(problems).toHaveLength(3);
    expect(problems[0]?.reason).toContain('10-file limit');
  });
});

describe('ACCEPT_ATTRIBUTE', () => {
  it('lists every supported extension for the file picker', () => {
    expect(ACCEPT_ATTRIBUTE).toBe('.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif');
  });
});
