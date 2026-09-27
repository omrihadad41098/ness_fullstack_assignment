import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import type { HealthResponse } from '../api/types';

type State = {
  data: HealthResponse | null;
  error: string | null;
  loading: boolean;
};

export function useHealth(): State {
  const [state, setState] = useState<State>({ data: null, error: null, loading: true });

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<HealthResponse>('/api/health', { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          data: null,
          error: err instanceof Error ? err.message : 'Unknown error',
          loading: false,
        });
      });

    return () => controller.abort();
  }, []);

  return state;
}
