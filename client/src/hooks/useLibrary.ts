import { useCallback, useEffect, useState } from 'react';
import { listAssets, searchAssets } from '../api/assets';
import { useDebouncedValue } from './useDebouncedValue';
import type { Asset, AssetKind, SearchResult } from '../api/types';

export const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;
/** While anything is still being analysed the list refreshes itself, so `ready` appears on its own. */
const POLL_INTERVAL_MS = 2_000;

export type LibraryState = {
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
  /** The query the results actually belong to — the typed one may still be waiting on the debounce. */
  activeQuery: string;
  refresh: () => void;
};

export type LibraryArgs = {
  query: string;
  kind: AssetKind | null;
  page: number;
};

type Loaded = {
  key: string;
  results: SearchResult[];
  total: number;
  error: string | null;
};

/**
 * One hook for both listing and searching: they return the same cards and differ only in the
 * endpoint, so sharing the state keeps the grid from flickering between two loading spinners.
 *
 * Loading is derived by comparing what is on screen with what is being asked for, rather than
 * being set at the top of the effect. That avoids an extra render per keystroke, and means a
 * background poll refreshes the data underneath the user without blanking the grid.
 */
export function useLibrary({ query, kind, page }: LibraryArgs): LibraryState {
  const trimmed = query.trim();
  const settled = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);
  // Clearing the box is a deliberate act, not typing: waiting 300ms to show the full library again
  // leaves "0 results matching" on screen for a query the user has already deleted.
  const debouncedQuery = trimmed === '' ? '' : settled;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const key = `${debouncedQuery}\u0000${kind ?? 'all'}\u0000${String(page)}`;
  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const args = { page, limit: PAGE_SIZE, kind, signal: controller.signal };

    const request =
      debouncedQuery === ''
        ? listAssets(args).then(({ assets, total }) => ({
            // A plain listing has no relevance score; the shared shape keeps the grid simple.
            results: assets.map((asset: Asset) => ({ asset, score: 0, matchedTags: [] })),
            total,
          }))
        : searchAssets({ ...args, q: debouncedQuery });

    request
      .then(({ results, total }) => setLoaded({ key, results, total, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key,
          results: [],
          total: 0,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      });

    return () => controller.abort();
  }, [key, debouncedQuery, kind, page, reloadToken]);

  const current = loaded !== null && loaded.key === key ? loaded : null;
  const results = current?.results ?? [];
  const hasUnfinished = results.some(
    ({ asset }) => asset.status === 'pending' || asset.status === 'processing',
  );

  useEffect(() => {
    if (!hasUnfinished) return;
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasUnfinished, refresh]);

  return {
    results,
    total: current?.total ?? 0,
    loading: current === null,
    error: current?.error ?? null,
    activeQuery: debouncedQuery,
    refresh,
  };
}
