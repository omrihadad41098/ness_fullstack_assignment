import { useEffect, useState } from 'react';

/**
 * Delays a changing value so typing in the search box does not fire a request per keystroke.
 * The timer is cleared on every change, so only the pause after the last key sends a query.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
