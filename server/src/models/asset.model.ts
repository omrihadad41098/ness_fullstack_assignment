import { Schema, model, type Types } from 'mongoose';
import { MAX_FILE_NAME_LENGTH } from '../validation/fileType.js';
import type { AssetKind, AssetStatus } from '../types/api.js';

/** Shape returned by `.lean()` reads — the only asset type the layers above see. */
export type AssetRecord = {
  _id: Types.ObjectId;
  originalName: string;
  mimeType: string;
  kind: AssetKind;
  sizeBytes: number;
  fileId: Types.ObjectId;
  status: AssetStatus;
  error: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  keywords: string[];
  extractedText: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  promptVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const assetSchema = new Schema<AssetRecord>(
  {
    originalName: { type: String, required: true, trim: true, maxlength: MAX_FILE_NAME_LENGTH },
    mimeType: { type: String, required: true },
    kind: { type: String, required: true, enum: ['text', 'image'] },
    sizeBytes: { type: Number, required: true, min: 1 },
    fileId: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
    },
    error: { type: String, default: null },
    title: { type: String, default: null },
    description: { type: String, default: null },
    tags: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    extractedText: { type: String, default: null },
    aiProvider: { type: String, default: null },
    aiModel: { type: String, default: null },
    promptVersion: { type: String, default: null },
  },
  { timestamps: true, minimize: false },
);

// MongoDB allows one text index per collection, so search fields share this one.
// Weights decide ranking: AI tags beat keywords beat prose, raw extracted text ranks last.
// `title` is deliberately absent: its words already appear in the tags and description, so adding
// it would buy nothing and force every existing deployment to rebuild the index.
assetSchema.index(
  {
    tags: 'text',
    keywords: 'text',
    description: 'text',
    originalName: 'text',
    extractedText: 'text',
  },
  {
    name: 'asset_search_text',
    weights: { tags: 10, keywords: 8, description: 5, originalName: 3, extractedText: 2 },
    default_language: 'english',
  },
);
assetSchema.index({ createdAt: -1 });
assetSchema.index({ status: 1 });

export const AssetModel = model<AssetRecord>('Asset', assetSchema);
