import type { AssetKind } from '../api/types';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  kind: AssetKind | null;
  onKindChange: (kind: AssetKind | null) => void;
  busy: boolean;
};

const KINDS: { value: AssetKind | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'text', label: 'Text' },
];

export default function SearchBar({ query, onQueryChange, kind, onKindChange, busy }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search everything — try “black hair” or “document”"
          aria-label="Search assets"
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-4 pr-24 text-sm shadow-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        {busy && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            searching…
          </span>
        )}
      </div>

      <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
        {KINDS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={kind === value}
            onClick={() => onKindChange(value)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              kind === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
