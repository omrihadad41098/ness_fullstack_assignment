import { useCallback, useState } from 'react';
import { uploadAssets } from '../api/assets';
import { partitionFiles, type FileProblem } from '../lib/validateFile';

/** Kept in step with the server's `MAX_UPLOAD_MB` default. */
const MAX_BYTES = 10 * 1024 * 1024;

export type UploadState = {
  uploading: boolean;
  error: string | null;
  rejected: FileProblem[];
  /** Resolves to how many files the server accepted, so the caller can refresh the list. */
  upload: (files: File[]) => Promise<number>;
  clearProblems: () => void;
};

export function useUpload(): UploadState {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<FileProblem[]>([]);

  const upload = useCallback(async (files: File[]): Promise<number> => {
    const { accepted, problems } = partitionFiles(files, MAX_BYTES);
    setRejected(problems);
    setError(null);
    if (accepted.length === 0) return 0;

    setUploading(true);
    try {
      const { assets } = await uploadAssets(accepted);
      return assets.length;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      return 0;
    } finally {
      setUploading(false);
    }
  }, []);

  const clearProblems = useCallback(() => {
    setRejected([]);
    setError(null);
  }, []);

  return { uploading, error, rejected, upload, clearProblems };
}
