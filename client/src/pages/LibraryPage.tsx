import { useState } from 'react';
import UploadDropzone from '../components/UploadDropzone';
import SearchBar from '../components/SearchBar';
import AssetGrid from '../components/AssetGrid';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import Pagination from '../components/Pagination';
import { PAGE_SIZE, useLibrary } from '../hooks/useLibrary';
import type { AssetKind } from '../api/types';

export default function LibraryPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [page, setPage] = useState(1);

  const { results, total, loading, error, activeQuery, refresh } = useLibrary({
    query,
    kind,
    page,
  });
  const searching = activeQuery !== '';

  // A new query or filter makes the old page number meaningless, so they are changed together
  // rather than reconciled afterwards in an effect.
  const changeQuery = (next: string): void => {
    setQuery(next);
    setPage(1);
  };
  const changeKind = (next: AssetKind | null): void => {
    setKind(next);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <UploadDropzone
        onUploaded={() => {
          setQuery('');
          setPage(1);
          refresh();
        }}
      />

      <SearchBar
        query={query}
        onQueryChange={changeQuery}
        kind={kind}
        onKindChange={changeKind}
        busy={loading && results.length > 0}
      />

      {error !== null && <ErrorBanner message={error} onRetry={refresh} />}

      {error === null && (
        <>
          <p className="text-sm text-slate-500">
            {loading && results.length === 0
              ? 'Loading…'
              : `${total} ${total === 1 ? 'asset' : 'assets'}${searching ? ` matching “${activeQuery}”` : ''}`}
          </p>

          {results.length > 0 ? (
            <AssetGrid results={results} />
          ) : (
            !loading &&
            (searching ? (
              <EmptyState
                title="No matches"
                hint="Try a broader word — the AI also indexes categories like “document”, “person” or “animal”."
              />
            ) : (
              <EmptyState
                title="Nothing here yet"
                hint="Upload a text file or an image to get started."
              />
            ))
          )}

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
