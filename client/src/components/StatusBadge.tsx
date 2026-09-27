import type { AssetStatus } from '../api/types';

const STYLES: Record<AssetStatus, { label: string; className: string }> = {
  pending: { label: 'Queued', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  processing: { label: 'Analysing', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  ready: { label: 'Ready', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 ring-red-200' },
};

export default function StatusBadge({ status }: { status: AssetStatus }) {
  const { label, className } = STYLES[status];
  const busy = status === 'pending' || status === 'processing';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-70"
        />
      )}
      {label}
    </span>
  );
}
