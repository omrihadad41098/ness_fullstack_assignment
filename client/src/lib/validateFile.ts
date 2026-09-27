/**
 * Mirrors the extension allow-list in `server/src/validation/fileType.ts`. This is a courtesy check
 * only - it gives instant feedback instead of a round-trip - and is never the security boundary:
 * the server re-checks the declared type and the actual bytes.
 */
export const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json'] as const;
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;

export const ACCEPT_ATTRIBUTE = [...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS]
  .map((extension) => `.${extension}`)
  .join(',');

export const MAX_FILES = 10;

export type FileProblem = { fileName: string; reason: string };

export function extensionOf(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function validateFile(file: File, maxBytes: number): FileProblem | null {
  const extension = extensionOf(file.name);
  const allowed: readonly string[] = [...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS];

  if (!allowed.includes(extension)) {
    return {
      fileName: file.name,
      reason: `unsupported type${extension === '' ? '' : ` ".${extension}"`}`,
    };
  }
  if (file.size === 0) return { fileName: file.name, reason: 'file is empty' };
  if (file.size > maxBytes) {
    return { fileName: file.name, reason: `larger than ${Math.round(maxBytes / 1024 / 1024)} MB` };
  }
  return null;
}

export type FileSelection = {
  accepted: File[];
  problems: FileProblem[];
};

/** Splits a drop or file-picker selection into what can be sent and what to explain to the user. */
export function partitionFiles(files: File[], maxBytes: number): FileSelection {
  const accepted: File[] = [];
  const problems: FileProblem[] = [];

  for (const file of files) {
    const problem = validateFile(file, maxBytes);
    if (problem !== null) problems.push(problem);
    else if (accepted.length < MAX_FILES) accepted.push(file);
    else problems.push({ fileName: file.name, reason: `over the ${MAX_FILES}-file limit` });
  }

  return { accepted, problems };
}
