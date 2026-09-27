import type { Readable } from 'node:stream';
import type { Types } from 'mongoose';
import { AppError } from '../http/errors.js';
import { log } from '../logger.js';
import { toAssetDto } from './assetMapper.js';
import type { AssetRepository, ListQuery } from '../repositories/assetRepository.js';
import type { FileStorage } from '../storage/gridFsStorage.js';
import type { UploadedFile } from '../http/uploadParser.js';
import type { Asset, ListAssetsResponse } from '../types/api.js';

export type AssetContent = {
  stream: Readable;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};

export type AssetService = {
  createFromUploads(files: UploadedFile[]): Promise<Asset[]>;
  list(query: ListQuery): Promise<ListAssetsResponse>;
  getById(id: Types.ObjectId): Promise<Asset>;
  getContent(id: Types.ObjectId): Promise<AssetContent>;
  requeue(id: Types.ObjectId): Promise<Asset>;
  delete(id: Types.ObjectId): Promise<void>;
};

export type AssetServiceDeps = {
  repository: AssetRepository;
  storage: FileStorage;
};

export function createAssetService({ repository, storage }: AssetServiceDeps): AssetService {
  return {
    async createFromUploads(files) {
      try {
        const records = await repository.createMany(
          files.map((file) => ({
            originalName: file.originalName,
            mimeType: file.mimeType,
            kind: file.kind,
            sizeBytes: file.sizeBytes,
            fileId: file.fileId,
          })),
        );
        return records.map(toAssetDto);
      } catch (err) {
        // insertMany is not atomic: a failure mid-batch can leave some documents written. Remove
        // those before the bytes, or the library would list assets whose content is gone.
        const fileIds = files.map((file) => file.fileId);
        await repository.deleteByFileIds(fileIds).catch(() => undefined);
        await Promise.all(fileIds.map((fileId) => storage.delete(fileId).catch(() => undefined)));
        throw err;
      }
    },

    async list(query) {
      const { assets, total } = await repository.list(query);
      return { assets: assets.map(toAssetDto), page: query.page, limit: query.limit, total };
    },

    async getById(id) {
      return toAssetDto(await findOrThrow(repository, id));
    },

    async getContent(id) {
      const record = await findOrThrow(repository, id);
      return {
        stream: storage.createDownloadStream(record.fileId),
        mimeType: record.mimeType,
        originalName: record.originalName,
        sizeBytes: record.sizeBytes,
      };
    },

    async requeue(id) {
      const record = await repository.resetToPending(id);
      if (record === null) throw notFound(id);
      return toAssetDto(record);
    },

    async delete(id) {
      const record = await repository.deleteById(id);
      if (record === null) throw notFound(id);
      // Document first, then bytes: a failed byte delete leaves a harmless orphan rather than an
      // asset the UI can list but never open.
      try {
        await storage.delete(record.fileId);
      } catch (err) {
        log.warn(
          { assetId: id.toString(), fileId: record.fileId.toString(), err: describe(err) },
          'asset deleted but its GridFS file remains',
        );
      }
    },
  };
}

async function findOrThrow(repository: AssetRepository, id: Types.ObjectId) {
  const record = await repository.findById(id);
  if (record === null) throw notFound(id);
  return record;
}

function notFound(id: Types.ObjectId): AppError {
  return new AppError('NOT_FOUND', `No asset with id ${id.toString()}`);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
