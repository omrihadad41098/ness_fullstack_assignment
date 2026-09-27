import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { createAssetService } from '../../src/services/assetService.js';
import { AppError } from '../../src/http/errors.js';
import type { UploadedFile } from '../../src/http/uploadParser.js';
import { assetRecord, createFakeRepository, createFakeStorage } from './fakes.js';

function uploadedFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    originalName: 'notes.txt',
    mimeType: 'text/plain',
    kind: 'text',
    sizeBytes: 12,
    fileId: new Types.ObjectId(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFromUploads', () => {
  it('creates one pending asset per uploaded file', async () => {
    const repository = createFakeRepository();
    const service = createAssetService({ repository, storage: createFakeStorage() });

    const assets = await service.createFromUploads([
      uploadedFile({ originalName: 'notes.txt' }),
      uploadedFile({ originalName: 'cat.png', mimeType: 'image/png', kind: 'image' }),
    ]);

    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.originalName)).toEqual(['notes.txt', 'cat.png']);
    expect(assets.every((a) => a.status === 'pending')).toBe(true);
    expect(assets[0]?.contentUrl).toBe(`/api/assets/${assets[0]?.id}/content`);
  });

  it('deletes the stored bytes when the documents cannot be written', async () => {
    const repository = createFakeRepository();
    const storage = createFakeStorage();
    const files = [uploadedFile(), uploadedFile({ originalName: 'second.txt' })];
    for (const file of files) storage.stored.add(file.fileId.toString());
    repository.failNextWith(new Error('mongo is down'));
    const service = createAssetService({ repository, storage });

    await expect(service.createFromUploads(files)).rejects.toThrow('mongo is down');

    // Otherwise the bytes would sit in GridFS with no document ever pointing at them.
    expect(storage.stored.size).toBe(0);
  });

  it('removes documents a partial insert already wrote, so none point at deleted bytes', async () => {
    const files = [uploadedFile(), uploadedFile({ originalName: 'second.txt' })];
    const alreadyWritten = assetRecord({ fileId: files[0]!.fileId });
    const unrelated = assetRecord();
    const repository = createFakeRepository([alreadyWritten, unrelated]);
    const storage = createFakeStorage();
    for (const file of files) storage.stored.add(file.fileId.toString());
    repository.failNextWith(new Error('connection reset mid-insert'));
    const service = createAssetService({ repository, storage });

    await expect(service.createFromUploads(files)).rejects.toThrow('connection reset');

    expect(repository.records.map((r) => r._id.toString())).toEqual([unrelated._id.toString()]);
    expect(storage.stored.size).toBe(0);
  });
});

describe('list', () => {
  it('returns the page alongside the unpaged total', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      assetRecord({ originalName: `f${i}.txt`, createdAt: new Date(2026, 0, i + 1) }),
    );
    const service = createAssetService({
      repository: createFakeRepository(records),
      storage: createFakeStorage(),
    });

    const result = await service.list({ page: 2, limit: 2, kind: null });

    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.assets).toHaveLength(2);
  });

  it('filters by kind', async () => {
    const service = createAssetService({
      repository: createFakeRepository([
        assetRecord({ kind: 'text' }),
        assetRecord({ kind: 'image', mimeType: 'image/png' }),
      ]),
      storage: createFakeStorage(),
    });

    const result = await service.list({ page: 1, limit: 20, kind: 'image' });

    expect(result.total).toBe(1);
    expect(result.assets[0]?.kind).toBe('image');
  });
});

describe('getById / getContent', () => {
  it('returns the asset and its bytes', async () => {
    const record = assetRecord({ originalName: 'cat.png', mimeType: 'image/png', kind: 'image' });
    const service = createAssetService({
      repository: createFakeRepository([record]),
      storage: createFakeStorage(),
    });

    const asset = await service.getById(record._id);
    const content = await service.getContent(record._id);

    expect(asset.id).toBe(record._id.toString());
    expect(content).toMatchObject({
      mimeType: 'image/png',
      originalName: 'cat.png',
      sizeBytes: record.sizeBytes,
    });
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const service = createAssetService({
      repository: createFakeRepository(),
      storage: createFakeStorage(),
    });
    const missing = new Types.ObjectId();

    await expect(service.getById(missing)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    await expect(service.getContent(missing)).rejects.toBeInstanceOf(AppError);
  });
});

describe('delete', () => {
  it('removes the document and its GridFS file', async () => {
    const record = assetRecord();
    const repository = createFakeRepository([record]);
    const storage = createFakeStorage();
    storage.stored.add(record.fileId.toString());
    const service = createAssetService({ repository, storage });

    await service.delete(record._id);

    expect(repository.records).toHaveLength(0);
    expect(storage.stored.size).toBe(0);
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const service = createAssetService({
      repository: createFakeRepository(),
      storage: createFakeStorage(),
    });

    await expect(service.delete(new Types.ObjectId())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('still succeeds when the file delete fails, leaving only an orphan', async () => {
    const record = assetRecord();
    const repository = createFakeRepository([record]);
    const storage = createFakeStorage();
    storage.failDeleteWith(new Error('gridfs unavailable'));
    const service = createAssetService({ repository, storage });

    await expect(service.delete(record._id)).resolves.toBeUndefined();
    expect(repository.records).toHaveLength(0);
  });
});
