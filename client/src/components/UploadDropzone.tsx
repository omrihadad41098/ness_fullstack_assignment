import { useRef, useState } from 'react';
import { ACCEPT_ATTRIBUTE, MAX_FILES } from '../lib/validateFile';
import { useUpload } from '../hooks/useUpload';
import ErrorBanner from './ErrorBanner';

type Props = {
  /** Called after a successful upload so the library can show the new, still-queued assets. */
  onUploaded: () => void;
};

export default function UploadDropzone({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { uploading, error, rejected, upload, clearProblems } = useUpload();

  const send = async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    const count = await upload(files);
    if (count > 0) onUploaded();
  };

  return (
    <section>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void send([...event.dataTransfer.files]);
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white'
        }`}
      >
        <p className="text-sm font-medium text-slate-700">
          {uploading ? 'Uploading…' : 'Drop files here'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Up to {MAX_FILES} text files or images (10 MB each) ·{' '}
          {ACCEPT_ATTRIBUTE.replace(/,/g, ' ')}
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            // Reset so picking the same file twice in a row still fires a change event.
            event.target.value = '';
            void send(files);
          }}
        />
      </div>

      {error !== null && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-4">
            <ul className="space-y-1">
              {rejected.map((problem) => (
                <li key={`${problem.fileName}-${problem.reason}`}>
                  <span className="font-medium">{problem.fileName}</span> was not uploaded:{' '}
                  {problem.reason}.
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={clearProblems}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
