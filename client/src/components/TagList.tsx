type Props = {
  terms: string[];
  /** Terms the current query matched, highlighted so the user can see why a result appeared. */
  highlighted?: string[];
  limit?: number;
};

export default function TagList({ terms, highlighted = [], limit }: Props) {
  if (terms.length === 0) return null;
  const shown = limit === undefined ? terms : terms.slice(0, limit);
  const hidden = terms.length - shown.length;
  const matched = new Set(highlighted);

  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((term) => (
        <li
          key={term}
          className={`rounded px-1.5 py-0.5 text-xs ${
            matched.has(term)
              ? 'bg-amber-100 font-medium text-amber-900'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {term}
        </li>
      ))}
      {hidden > 0 && <li className="px-1 py-0.5 text-xs text-slate-400">+{hidden} more</li>}
    </ul>
  );
}
