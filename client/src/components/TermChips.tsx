type Props = {
  terms: string[];
  hiddenCount?: number;
  size?: 'sm' | 'md';
};

export default function TermChips({ terms, hiddenCount = 0, size = 'sm' }: Props) {
  if (terms.length === 0) return null;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <ul className="flex flex-wrap gap-1.5">
      {terms.map((term) => (
        <li key={term} className={`rounded-full bg-slate-900 text-white ${padding}`}>
          {term}
        </li>
      ))}
      {hiddenCount > 0 && (
        <li className={`rounded-full text-slate-500 ${padding}`}>+{hiddenCount} more</li>
      )}
    </ul>
  );
}
