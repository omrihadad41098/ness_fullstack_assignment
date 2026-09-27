export type QueryParams = Record<string, string | number | undefined | null>;

/** Skips empty values so `/api/assets?kind=` never reaches the server. */
export function buildQueryString(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const asString = typeof value === 'number' ? String(value) : value.trim();
    if (asString === '') continue;
    search.set(key, asString);
  }
  const query = search.toString();
  return query === '' ? '' : `?${query}`;
}
