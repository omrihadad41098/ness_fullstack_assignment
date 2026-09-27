import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import TagList from './TagList';
import { formatBytes } from '../lib/formatBytes';
import type { SearchResult } from '../api/types';

export default function AssetCard({ result }: { result: SearchResult }) {
  const { asset, matchedTags, score } = result;

  return (
    <Link
      to={`/assets/${asset.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900"
    >
      <div className="flex h-40 items-center justify-center overflow-hidden bg-slate-100">
        {asset.kind === 'image' ? (
          <img
            src={asset.contentUrl}
            alt={asset.description ?? asset.originalName}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <p className="line-clamp-6 px-4 py-3 text-xs leading-relaxed text-slate-500">
            {asset.extractedText ?? 'Text file'}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-slate-900" title={asset.originalName}>
            {asset.originalName}
          </h3>
          <StatusBadge status={asset.status} />
        </div>

        <p className="line-clamp-2 text-xs text-slate-600">
          {asset.description ?? describeMissingDescription(asset.status)}
        </p>

        <div className="mt-auto space-y-2 pt-1">
          <TagList terms={[...asset.tags, ...asset.keywords]} highlighted={matchedTags} limit={5} />
          <p className="text-[11px] text-slate-400">
            {asset.kind} · {formatBytes(asset.sizeBytes)}
            {score > 0 && ` · relevance ${score.toFixed(1)}`}
          </p>
        </div>
      </div>
    </Link>
  );
}

function describeMissingDescription(status: SearchResult['asset']['status']): string {
  if (status === 'failed') return 'Analysis failed — open to retry.';
  return 'Waiting for AI metadata…';
}
