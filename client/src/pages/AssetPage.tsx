import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import TagList from '../components/TagList';
import ErrorBanner from '../components/ErrorBanner';
import { useAsset } from '../hooks/useAsset';
import { deleteAsset, reprocessAsset } from '../api/assets';
import { formatBytes } from '../lib/formatBytes';
import { formatDate } from '../lib/formatDate';
import type { Asset } from '../api/types';

export default function AssetPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { asset, loading, error, refresh } = useAsset(id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runAction = async (action: () => Promise<unknown>, after: () => void): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      after();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error !== null || asset === null) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error ?? 'Asset not found'} onRetry={refresh} />
        <Link to="/" className="text-sm text-blue-700 underline">
          Back to the library
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">
          ← Library
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction(() => reprocessAsset(asset.id), refresh)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Re-analyse
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void runAction(
                () => deleteAsset(asset.id),
                () => void navigate('/'),
              )
            }
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {actionError !== null && <ErrorBanner message={actionError} />}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{asset.originalName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {asset.mimeType} · {formatBytes(asset.sizeBytes)} · uploaded{' '}
            {formatDate(asset.createdAt)}
          </p>
        </div>
        <StatusBadge status={asset.status} />
      </header>

      {asset.status === 'failed' && asset.error !== null && (
        <ErrorBanner message={`Analysis failed: ${asset.error}`} />
      )}

      <Preview asset={asset} />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">AI metadata</h2>
        {asset.status === 'ready' ? (
          <dl className="mt-4 space-y-4 text-sm">
            <Field label="Description">
              <p className="text-slate-700">{asset.description ?? '—'}</p>
            </Field>
            <Field label="Tags">
              <TagList terms={asset.tags} />
            </Field>
            <Field label="Keywords">
              <TagList terms={asset.keywords} />
            </Field>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            {asset.status === 'failed'
              ? 'No metadata was stored. Use “Re-analyse” to try again.'
              : 'The AI is still analysing this file. This page updates itself.'}
          </p>
        )}
      </section>
    </div>
  );
}

function Preview({ asset }: { asset: Asset }) {
  if (asset.kind === 'image') {
    return (
      <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <img
          src={asset.contentUrl}
          alt={asset.description ?? asset.originalName}
          className="max-h-[32rem] w-full bg-slate-100 object-contain"
        />
      </figure>
    );
  }

  return (
    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700">
      {asset.extractedText ?? 'The file content has not been stored yet.'}
    </pre>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
