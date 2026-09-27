import type { Asset } from '../api/types';

/**
 * What to call an asset on screen. The AI title is the only label a user should read
 * ("Black cat") — the original filename is an implementation detail and is never shown.
 */
export function displayTitle(asset: Pick<Asset, 'title' | 'status'>): string {
  const title = asset.title?.trim() ?? '';
  if (title !== '') return title;
  if (asset.status === 'pending' || asset.status === 'processing') return 'Analysing…';
  return 'Untitled';
}
