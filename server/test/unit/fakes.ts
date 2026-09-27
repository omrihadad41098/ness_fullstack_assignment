import { Readable, Writable } from 'node:stream';
import { Types } from 'mongoose';
import type { AssetRecord } from '../../src/models/asset.model.js';
import type { AssetRepository, CreateAssetInput } from '../../src/repositories/assetRepository.js';
import type { FileStorage } from '../../src/storage/gridFsStorage.js';
import type { ProcessingService } from '../../src/services/processingService.js';

export function assetRecord(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    _id: new Types.ObjectId(),
    originalName: 'notes.txt',
    mimeType: 'text/plain',
    kind: 'text',
    sizeBytes: 128,
    fileId: new Types.ObjectId(),
    status: 'pending',
    error: null,
    title: null,
    description: null,
    tags: [],
    keywords: [],
    extractedText: null,
    aiProvider: null,
    aiModel: null,
    promptVersion: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:06.000Z'),
    ...overrides,
  };
}

export type FakeRepository = AssetRepository & {
  records: AssetRecord[];
  failNextWith: (err: Error) => void;
};

/** In-memory stand-in for the Mongo repository: same contract, no database. */
export function createFakeRepository(initial: AssetRecord[] = []): FakeRepository {
  const records = [...initial];
  let nextFailure: Error | null = null;

  const takeFailure = (): void => {
    if (nextFailure === null) return;
    const err = nextFailure;
    nextFailure = null;
    throw err;
  };

  const build = (input: CreateAssetInput): AssetRecord =>
    assetRecord({ ...input, status: 'pending' });

  return {
    records,
    failNextWith(err) {
      nextFailure = err;
    },

    create(input) {
      takeFailure();
      const record = build(input);
      records.push(record);
      return Promise.resolve(record);
    },

    createMany(inputs) {
      takeFailure();
      const created = inputs.map(build);
      records.push(...created);
      return Promise.resolve(created);
    },

    findById(id) {
      takeFailure();
      return Promise.resolve(records.find((r) => r._id.equals(id)) ?? null);
    },

    list({ page, limit, kind }) {
      takeFailure();
      const filtered = kind === null ? records : records.filter((r) => r.kind === kind);
      const sorted = [...filtered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return Promise.resolve({
        assets: sorted.slice((page - 1) * limit, page * limit),
        total: filtered.length,
      });
    },

    // Deliberately naive: the real ranking is MongoDB's job and is covered by the filter-builder
    // tests. This only needs to let the service layer be tested.
    search({ q, page, limit, kind }) {
      takeFailure();
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = records.filter((record) => {
        if (record.status !== 'ready') return false;
        if (kind !== null && record.kind !== kind) return false;
        const haystack = [...record.tags, ...record.keywords, record.description ?? '']
          .join(' ')
          .toLowerCase();
        return words.some((word) => haystack.includes(word));
      });
      return Promise.resolve({
        results: matches
          .slice((page - 1) * limit, page * limit)
          .map((asset, index) => ({ asset, score: matches.length - index })),
        total: matches.length,
        strategy: 'text' as const,
      });
    },

    deleteById(id) {
      takeFailure();
      const index = records.findIndex((r) => r._id.equals(id));
      if (index === -1) return Promise.resolve(null);
      return Promise.resolve(records.splice(index, 1)[0] ?? null);
    },

    deleteByFileIds(fileIds) {
      takeFailure();
      const doomed = new Set(fileIds.map((id) => id.toString()));
      for (let i = records.length - 1; i >= 0; i--) {
        if (doomed.has(records[i]?.fileId.toString() ?? '')) records.splice(i, 1);
      }
      return Promise.resolve();
    },

    claimForProcessing(id) {
      takeFailure();
      const record = records.find((r) => r._id.equals(id));
      if (record === undefined || record.status === 'processing') return Promise.resolve(null);
      record.status = 'processing';
      record.error = null;
      return Promise.resolve(record);
    },

    markReady(id, metadata) {
      takeFailure();
      const record = records.find((r) => r._id.equals(id));
      if (record !== undefined) Object.assign(record, metadata, { status: 'ready', error: null });
      return Promise.resolve();
    },

    markFailed(id, message) {
      takeFailure();
      const record = records.find((r) => r._id.equals(id));
      if (record !== undefined) Object.assign(record, { status: 'failed', error: message });
      return Promise.resolve();
    },

    resetToPending(id) {
      takeFailure();
      const record = records.find((r) => r._id.equals(id));
      if (record === undefined) return Promise.resolve(null);
      record.status = 'pending';
      record.error = null;
      return Promise.resolve(record);
    },

    findIdsByStatus(statuses) {
      takeFailure();
      return Promise.resolve(records.filter((r) => statuses.includes(r.status)).map((r) => r._id));
    },
  };
}

export type FakeProcessingService = ProcessingService & { scheduled: string[] };

/** Records what the routes queued without running any analysis. */
export function createFakeProcessingService(): FakeProcessingService {
  const scheduled: string[] = [];
  return {
    scheduled,
    schedule(ids) {
      scheduled.push(...ids.map((id) => id.toString()));
    },
    process(id) {
      scheduled.push(id.toString());
      return Promise.resolve();
    },
    recoverInterrupted: () => Promise.resolve(0),
    whenIdle: () => Promise.resolve(),
  };
}

export type FakeStorage = FileStorage & {
  /** File ids currently "stored", so tests can assert cleanup actually happened. */
  stored: Set<string>;
  written: Map<string, Buffer>;
  /** Bytes a download should yield, keyed by file id. */
  contents: Map<string, Buffer>;
  failDeleteWith: (err: Error) => void;
};

export function createFakeStorage(): FakeStorage {
  const stored = new Set<string>();
  const written = new Map<string, Buffer>();
  const contents = new Map<string, Buffer>();
  let deleteFailure: Error | null = null;

  return {
    stored,
    written,
    contents,
    failDeleteWith(err) {
      deleteFailure = err;
    },

    createUploadStream(storageName) {
      const id = new Types.ObjectId();
      stored.add(id.toString());
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
        final(callback) {
          written.set(storageName, Buffer.concat(chunks));
          callback();
        },
      });
      return { id, stream };
    },

    createDownloadStream(fileId) {
      const body = contents.get(fileId.toString()) ?? Buffer.from(`bytes of ${fileId.toString()}`);
      return Readable.from([body]);
    },

    delete(fileId) {
      if (deleteFailure !== null) {
        const err = deleteFailure;
        deleteFailure = null;
        return Promise.reject(err);
      }
      stored.delete(fileId.toString());
      return Promise.resolve();
    },
  };
}
