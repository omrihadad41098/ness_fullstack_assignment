import AssetCard from './AssetCard';
import type { SearchResult } from '../api/types';

export default function AssetGrid({ results }: { results: SearchResult[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((result) => (
        <li key={result.asset.id}>
          <AssetCard result={result} />
        </li>
      ))}
    </ul>
  );
}
