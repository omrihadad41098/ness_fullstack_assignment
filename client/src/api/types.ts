/**
 * Mirror of `server/src/types/api.ts` — change both together
 * (and `agent_mds/PROJECT.md` §6).
 */

export type AssetKind = 'text' | 'image';
export type AssetStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type Asset = {
  id: string;
  originalName: string;
  mimeType: string;
  kind: AssetKind;
  sizeBytes: number;
  status: AssetStatus;
  error: string | null;
  /** Short human-readable caption ("Black cat"), shown as the name on the detail page. */
  title: string | null;
  /** 1–3 sentence AI description, shown on the detail page. */
  description: string | null;
  /** Concrete AI terms ("black hair"), shown as chips. Keywords stay server-side for search. */
  tags: string[];
  /** File body for text assets, so the detail page can preview it. Images stay null. */
  extractedText: string | null;
  /** Relative URL: /api/assets/:id/content */
  contentUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchResult = {
  asset: Asset;
  score: number;
};

export type HealthResponse = {
  status: 'ok';
  db: 'up' | 'down';
  aiProvider: string;
};

export type ListAssetsResponse = {
  assets: Asset[];
  page: number;
  limit: number;
  total: number;
};

export type UploadAssetsResponse = {
  assets: Asset[];
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  total: number;
};

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'AI_UNAVAILABLE'
  | 'INTERNAL';

export type ErrorResponse = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
};
