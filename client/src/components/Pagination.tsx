type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-slate-600">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}
