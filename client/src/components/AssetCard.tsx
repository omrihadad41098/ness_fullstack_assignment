import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import TermChips from './TermChips';
import { displayTitle } from '../lib/displayTitle';
import { limitTerms, uniqueTags } from '../lib/terms';
import { deleteAsset } from '../api/assets';
import type { SearchResult } from '../api/types';

type Props = {
  result: SearchResult;
  onDeleted: () => void;
};

const CARD_TERM_LIMIT = 6;

export default function AssetCard({ result, onDeleted }: Props) {
  const { asset } = result;
  const title = displayTitle(asset);
  const { shown, hiddenCount } = limitTerms(uniqueTags(asset), CARD_TERM_LIMIT);
  const analysing = asset.status === 'pending' || asset.status === 'processing';
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (): Promise<void> => {
    setRemoving(true);
    setError(null);
    try {
      await deleteAsset(asset.id);
      onDeleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove this file');
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <Link
        to={`/assets/${asset.id}`}
        aria-label={title}
        className="group flex flex-col focus:outline-none focus:ring-2 focus:ring-slate-900"
      >
        <div className="flex h-40 items-center justify-center overflow-hidden bg-slate-100">
          {asset.kind === 'image' ? (
            <img
              src={asset.contentUrl}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <p className="px-4 text-sm text-slate-500">Text file</p>
          )}
        </div>

        <div className="flex items-start justify-between gap-2 p-4 pb-2">
          <div className="min-w-0 flex-1">
            {shown.length > 0 ? (
              <TermChips terms={shown} hiddenCount={hiddenCount} />
            ) : (
              <p className="text-xs text-slate-500">
                {analysing ? 'Analysing…' : 'No tags yet'}
              </p>
            )}
          </div>
          <StatusBadge status={asset.status} />
        </div>
      </Link>

      <div className="flex items-center justify-end px-4 pb-3">
        <button
          type="button"
          disabled={removing}
          onClick={() => void remove()}
          className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
      {error !== null && <p className="px-4 pb-3 text-xs text-red-700">{error}</p>}
    </div>
  );
}
