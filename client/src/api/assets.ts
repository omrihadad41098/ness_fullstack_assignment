import { apiFetch } from './client';
import { buildQueryString } from '../lib/buildQueryString';
import type {
  Asset,
  AssetKind,
  ListAssetsResponse,
  SearchResponse,
  UploadAssetsResponse,
} from './types';

export type ListArgs = {
  page: number;
  limit: number;
  kind: AssetKind | null;
  signal?: AbortSignal;
};

export type SearchArgs = ListArgs & { q: string };

const signalOf = (signal?: AbortSignal) => (signal === undefined ? {} : { signal });

export function listAssets({ page, limit, kind, signal }: ListArgs): Promise<ListAssetsResponse> {
  const query = buildQueryString({ page, limit, kind });
  return apiFetch<ListAssetsResponse>(`/api/assets${query}`, signalOf(signal));
}

export function searchAssets({
  q,
  page,
  limit,
  kind,
  signal,
}: SearchArgs): Promise<SearchResponse> {
  const query = buildQueryString({ q, page, limit, kind });
  return apiFetch<SearchResponse>(`/api/search${query}`, signalOf(signal));
}

export function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  return apiFetch<Asset>(`/api/assets/${id}`, signalOf(signal));
}

export function uploadAssets(files: File[], signal?: AbortSignal): Promise<UploadAssetsResponse> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  // No Content-Type header: the browser must set the multipart boundary itself.
  return apiFetch<UploadAssetsResponse>('/api/assets', {
    method: 'POST',
    body: form,
    ...signalOf(signal),
  });
}

export function reprocessAsset(id: string): Promise<Asset> {
  return apiFetch<Asset>(`/api/assets/${id}/reprocess`, { method: 'POST' });
}

export function deleteAsset(id: string): Promise<void> {
  return apiFetch<void>(`/api/assets/${id}`, { method: 'DELETE' });
}
