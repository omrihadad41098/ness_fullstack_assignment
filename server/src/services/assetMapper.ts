import type { AssetRecord } from '../models/asset.model.js';
import type { Asset } from '../types/api.js';

/**
 * DB record → wire DTO. Internal fields (`fileId`, AI provenance) stay server-side; `contentUrl` is
 * relative so the same response works on localhost, in the container and behind any deployed host.
 */
export function toAssetDto(record: AssetRecord): Asset {
  const id = record._id.toString();
  return {
    id,
    originalName: record.originalName,
    mimeType: record.mimeType,
    kind: record.kind,
    sizeBytes: record.sizeBytes,
    status: record.status,
    error: record.error,
    title: record.title,
    description: record.description,
    tags: record.tags,
    extractedText: record.kind === 'text' ? record.extractedText : null,
    contentUrl: `/api/assets/${id}/content`,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
