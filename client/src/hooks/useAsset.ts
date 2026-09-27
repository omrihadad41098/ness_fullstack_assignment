import { useCallback, useEffect, useState } from 'react';
import { getAsset } from '../api/assets';
import type { Asset } from '../api/types';

const POLL_INTERVAL_MS = 1_500;

export type AssetState = {
  asset: Asset | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/** Polls only while the asset is still being analysed, then stops on its own. */
export function useAsset(id: string): AssetState {
  const [state, setState] = useState<{
    asset: Asset | null;
    loading: boolean;
    error: string | null;
  }>({ asset: null, loading: true, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    getAsset(id, controller.signal)
      .then((asset) => setState({ asset, loading: false, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          asset: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      });

    return () => controller.abort();
  }, [id, reloadToken]);

  const status = state.asset?.status;
  const inProgress = status === 'pending' || status === 'processing';

  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [inProgress, refresh]);

  return { ...state, refresh };
}
