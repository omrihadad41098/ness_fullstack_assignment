import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import ErrorBanner from '../components/ErrorBanner';
import TermChips from '../components/TermChips';
import { uniqueTags } from '../lib/terms';
import { useAsset } from '../hooks/useAsset';
import { deleteAsset } from '../api/assets';
import { displayTitle } from '../lib/displayTitle';
import type { Asset } from '../api/types';

export default function AssetPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { asset, loading, error, refresh } = useAsset(id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      await deleteAsset(id);
      void navigate('/');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not remove this file');
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

  const title = displayTitle(asset);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">
          ← Library
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>

      {actionError !== null && <ErrorBanner message={actionError} />}

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <StatusBadge status={asset.status} />
        </div>
        {asset.description !== null && asset.description.trim() !== '' && (
          <p className="max-w-3xl text-sm leading-relaxed text-slate-700">{asset.description}</p>
        )}
        <TermChips terms={uniqueTags(asset)} size="md" />
      </header>

      {asset.status === 'failed' && (
        <ErrorBanner message="Analysis failed. Remove the file and upload it again." />
      )}

      <Preview asset={asset} title={title} />
    </div>
  );
}

function Preview({ asset, title }: { asset: Asset; title: string }) {
  if (asset.kind === 'image') {
    return (
      <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <img
          src={asset.contentUrl}
          alt={title}
          className="max-h-[32rem] w-full bg-slate-100 object-contain"
        />
      </figure>
    );
  }

  return (
    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700">
      {asset.extractedText ??
        (asset.status === 'ready' ? 'No text to show.' : 'Opening the file…')}
    </pre>
  );
}
