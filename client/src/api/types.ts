/**
 * Mirror of `server/src/types/api.ts` — change both together
 * (and `agent_mds/PROJECT.md` §6 + the Postman collection).
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
  description: string | null;
  tags: string[];
  keywords: string[];
  extractedText: string | null;
  contentUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchResult = {
  asset: Asset;
  score: number;
  matchedTags: string[];
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
