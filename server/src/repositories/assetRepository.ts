import type { Types } from 'mongoose';
import { AssetModel, type AssetRecord } from '../models/asset.model.js';
import { buildRegexFilter, buildTextFilter } from './searchFilters.js';
import type { AssetKind, AssetStatus } from '../types/api.js';

export type CreateAssetInput = {
  originalName: string;
  mimeType: string;
  kind: AssetKind;
  sizeBytes: number;
  fileId: Types.ObjectId;
};

export type ListQuery = {
  page: number;
  limit: number;
  kind: AssetKind | null;
};

export type ListResult = {
  assets: AssetRecord[];
  total: number;
};

export type SearchQuery = ListQuery & { q: string };

export type ScoredAsset = { asset: AssetRecord; score: number };

export type SearchResultPage = {
  results: ScoredAsset[];
  total: number;
  /** Which query strategy produced the results — surfaced in logs, useful when tuning. */
  strategy: 'text' | 'regex';
};

export type AssetMetadataUpdate = {
  description: string | null;
  tags: string[];
  keywords: string[];
  extractedText: string | null;
  aiProvider: string;
  aiModel: string;
  promptVersion: string;
};

/** The only place that talks to the assets collection. */
export type AssetRepository = {
  create(input: CreateAssetInput): Promise<AssetRecord>;
  createMany(inputs: CreateAssetInput[]): Promise<AssetRecord[]>;
  findById(id: Types.ObjectId): Promise<AssetRecord | null>;
  list(query: ListQuery): Promise<ListResult>;
  search(query: SearchQuery): Promise<SearchResultPage>;
  deleteById(id: Types.ObjectId): Promise<AssetRecord | null>;
  /** Atomically moves an asset to `processing`; null means someone else already claimed it. */
  claimForProcessing(id: Types.ObjectId): Promise<AssetRecord | null>;
  markReady(id: Types.ObjectId, metadata: AssetMetadataUpdate): Promise<void>;
  markFailed(id: Types.ObjectId, message: string): Promise<void>;
  /** Puts an asset back in the queue; null means it does not exist. */
  resetToPending(id: Types.ObjectId): Promise<AssetRecord | null>;
  findIdsByStatus(statuses: AssetStatus[]): Promise<Types.ObjectId[]>;
};

/** What `.lean()` yields when the projection adds `$meta: 'textScore'`. */
type ScoredAssetDoc = AssetRecord & { score: number };

export function createAssetRepository(): AssetRepository {
  return {
    async create(input) {
      const created = await AssetModel.create({ ...input, status: 'pending' });
      return created.toObject<AssetRecord>();
    },

    async createMany(inputs) {
      const created = await AssetModel.insertMany(
        inputs.map((input) => ({ ...input, status: 'pending' as const })),
      );
      return created.map((doc) => doc.toObject<AssetRecord>());
    },

    async findById(id) {
      return AssetModel.findById(id).lean<AssetRecord>().exec();
    },

    async list({ page, limit, kind }) {
      const filter = kind === null ? {} : { kind };
      // countDocuments runs alongside the page query; no cached totals (project constraint).
      const [assets, total] = await Promise.all([
        AssetModel.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean<AssetRecord[]>()
          .exec(),
        AssetModel.countDocuments(filter).exec(),
      ]);
      return { assets, total };
    },

    async search({ q, page, limit, kind }) {
      const skip = (page - 1) * limit;

      const textFilter = buildTextFilter(q, kind);
      const [textDocs, textTotal] = await Promise.all([
        AssetModel.find(textFilter, { score: { $meta: 'textScore' } })
          // Sorting by the index's own score keeps ranking inside MongoDB; nothing is re-ordered
          // in Node. `createdAt` breaks ties so paging is stable.
          .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean<ScoredAssetDoc[]>()
          .exec(),
        AssetModel.countDocuments(textFilter).exec(),
      ]);

      if (textTotal > 0) {
        return {
          results: textDocs.map(({ score, ...asset }) => ({ asset, score })),
          total: textTotal,
          strategy: 'text' as const,
        };
      }

      const regexFilter = buildRegexFilter(q, kind);
      const [regexDocs, regexTotal] = await Promise.all([
        AssetModel.find(regexFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean<AssetRecord[]>()
          .exec(),
        AssetModel.countDocuments(regexFilter).exec(),
      ]);

      // No textScore exists for a regex match; 0 states plainly that these are unranked.
      return {
        results: regexDocs.map((asset) => ({ asset, score: 0 })),
        total: regexTotal,
        strategy: 'regex' as const,
      };
    },

    async deleteById(id) {
      return AssetModel.findByIdAndDelete(id).lean<AssetRecord>().exec();
    },

    async claimForProcessing(id) {
      // The status filter is the lock: two workers racing on the same id, or a reprocess arriving
      // mid-analysis, can only ever produce one winner because MongoDB applies the update once.
      return AssetModel.findOneAndUpdate(
        { _id: id, status: { $in: ['pending', 'ready', 'failed'] } },
        { $set: { status: 'processing', error: null } },
        { new: true },
      )
        .lean<AssetRecord>()
        .exec();
    },

    async markReady(id, metadata) {
      await AssetModel.updateOne(
        { _id: id },
        { $set: { ...metadata, status: 'ready', error: null } },
      ).exec();
    },

    async markFailed(id, message) {
      await AssetModel.updateOne(
        { _id: id },
        { $set: { status: 'failed', error: message.slice(0, 500) } },
      ).exec();
    },

    async resetToPending(id) {
      return AssetModel.findOneAndUpdate(
        { _id: id },
        { $set: { status: 'pending', error: null } },
        { new: true },
      )
        .lean<AssetRecord>()
        .exec();
    },

    async findIdsByStatus(statuses) {
      const docs = await AssetModel.find({ status: { $in: statuses } })
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>()
        .exec();
      return docs.map((doc) => doc._id);
    },
  };
}
