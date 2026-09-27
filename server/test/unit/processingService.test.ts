import { describe, expect, it, vi } from 'vitest';
import { createProcessingService } from '../../src/services/processingService.js';
import { PROMPT_VERSION, MAX_PROMPT_TEXT_CHARS } from '../../src/ai/prompts.js';
import { assetRecord, createFakeRepository, createFakeStorage } from './fakes.js';
import type { AiProvider, AssetMetadata } from '../../src/ai/aiProvider.js';
import type { AssetRecord } from '../../src/models/asset.model.js';

const metadata: AssetMetadata = {
  description: 'A woman with black hair.',
  tags: ['black hair'],
  keywords: ['person', 'portrait'],
  extractedText: null,
};

function createStubProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    name: 'stub',
    model: 'stub-1',
    analyzeImage: vi.fn(() => Promise.resolve(metadata)),
    analyzeText: vi.fn(() => Promise.resolve(metadata)),
    ...overrides,
  };
}

function setup(record: AssetRecord, provider: AiProvider = createStubProvider()) {
  const repository = createFakeRepository([record]);
  const storage = createFakeStorage();
  const service = createProcessingService({ repository, storage, provider, concurrency: 2 });
  return { repository, storage, service, provider };
}

describe('processingService', () => {
  it('stores metadata and provenance, then marks the asset ready', async () => {
    const record = assetRecord({ kind: 'image', mimeType: 'image/png', originalName: 'a.png' });
    const { repository, service } = setup(record);

    await service.process(record._id);

    const stored = repository.records[0];
    expect(stored?.status).toBe('ready');
    expect(stored?.tags).toEqual(['black hair']);
    expect(stored?.description).toBe('A woman with black hair.');
    expect(stored?.aiProvider).toBe('stub');
    expect(stored?.aiModel).toBe('stub-1');
    expect(stored?.promptVersion).toBe(PROMPT_VERSION);
    expect(stored?.error).toBeNull();
  });

  it('sends image bytes and the declared mime type to the provider', async () => {
    const record = assetRecord({ kind: 'image', mimeType: 'image/png' });
    const provider = createStubProvider();
    const { storage, service } = setup(record, provider);
    storage.contents.set(record.fileId.toString(), Buffer.from([0x89, 0x50]));

    await service.process(record._id);

    expect(provider.analyzeImage).toHaveBeenCalledWith({
      data: Buffer.from([0x89, 0x50]),
      mimeType: 'image/png',
      fileName: record.originalName,
    });
  });

  it('stores a text file verbatim, not whatever the model echoed back', async () => {
    const record = assetRecord({ kind: 'text', originalName: 'notes.txt' });
    const provider = createStubProvider({
      analyzeText: vi.fn(() => Promise.resolve({ ...metadata, extractedText: 'hallucinated' })),
    });
    const { repository, storage, service } = setup(record, provider);
    storage.contents.set(record.fileId.toString(), Buffer.from('the meeting notes'));

    await service.process(record._id);

    expect(repository.records[0]?.extractedText).toBe('the meeting notes');
  });

  it('truncates the prompt but never the stored text', async () => {
    const record = assetRecord({ kind: 'text' });
    const provider = createStubProvider();
    const { repository, storage, service } = setup(record, provider);
    const long = 'x'.repeat(MAX_PROMPT_TEXT_CHARS + 500);
    storage.contents.set(record.fileId.toString(), Buffer.from(long));

    await service.process(record._id);

    const [call] = vi.mocked(provider.analyzeText).mock.calls;
    expect(call?.[0].text).toHaveLength(MAX_PROMPT_TEXT_CHARS);
    expect(repository.records[0]?.extractedText).toHaveLength(long.length);
  });

  it('marks the asset failed with the reason when the provider throws', async () => {
    const record = assetRecord({ kind: 'image' });
    const provider = createStubProvider({
      analyzeImage: vi.fn(() => Promise.reject(new Error('Gemini responded 401'))),
    });
    const { repository, service } = setup(record, provider);

    await service.process(record._id);

    expect(repository.records[0]?.status).toBe('failed');
    expect(repository.records[0]?.error).toBe('Gemini responded 401');
  });

  it('never leaves an asset stuck in processing', async () => {
    const record = assetRecord({ kind: 'text' });
    const provider = createStubProvider({
      analyzeText: vi.fn(() => Promise.reject(new Error('boom'))),
    });
    const { repository, service } = setup(record, provider);

    await service.process(record._id);

    expect(repository.records[0]?.status).not.toBe('processing');
  });

  it('skips an asset another worker already claimed', async () => {
    const record = assetRecord({ status: 'processing' });
    const provider = createStubProvider();
    const { service } = setup(record, provider);

    await service.process(record._id);

    expect(provider.analyzeText).not.toHaveBeenCalled();
  });

  it('requeues interrupted assets and reports how many', async () => {
    const pending = assetRecord({ status: 'pending' });
    const stuck = assetRecord({ status: 'processing' });
    const done = assetRecord({ status: 'ready' });
    const repository = createFakeRepository([pending, stuck, done]);
    const service = createProcessingService({
      repository,
      storage: createFakeStorage(),
      provider: createStubProvider(),
      concurrency: 2,
    });

    await expect(service.recoverInterrupted()).resolves.toBe(2);
  });

  it('honours the concurrency limit when a batch is scheduled', async () => {
    const records = [0, 1, 2, 3].map(() => assetRecord({ kind: 'text' }));
    const repository = createFakeRepository(records);
    let active = 0;
    let peak = 0;
    const provider = createStubProvider({
      analyzeText: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return metadata;
      },
    });
    const service = createProcessingService({
      repository,
      storage: createFakeStorage(),
      provider,
      concurrency: 2,
    });

    service.schedule(records.map((record) => record._id));
    await service.whenIdle();

    expect(peak).toBeLessThanOrEqual(2);
    expect(repository.records.every((record) => record.status === 'ready')).toBe(true);
  });
});
