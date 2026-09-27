import type { Readable } from 'node:stream';
import type { Types } from 'mongoose';
import { log } from '../logger.js';
import { createLimiter, type Limiter } from '../lib/limiter.js';
import { MAX_PROMPT_TEXT_CHARS, PROMPT_VERSION } from '../ai/prompts.js';
import { MAX_EXTRACTED_TEXT_CHARS } from '../ai/parseMetadata.js';
import type { AiProvider, AssetMetadata } from '../ai/aiProvider.js';
import type { AssetRepository } from '../repositories/assetRepository.js';
import type { FileStorage } from '../storage/gridFsStorage.js';
import type { AssetRecord } from '../models/asset.model.js';

export type ProcessingService = {
  /** Fire-and-forget: upload answers 202 immediately and the client polls for `ready`. */
  schedule(ids: Types.ObjectId[]): void;
  /** Awaitable single run, used by the reprocess endpoint and by tests. */
  process(id: Types.ObjectId): Promise<void>;
  /** Re-queues assets left mid-flight by a crash or redeploy. Returns how many were queued. */
  recoverInterrupted(): Promise<number>;
  whenIdle(): Promise<void>;
};

export type ProcessingDeps = {
  repository: AssetRepository;
  storage: FileStorage;
  provider: AiProvider;
  concurrency: number;
};

export function createProcessingService({
  repository,
  storage,
  provider,
  concurrency,
}: ProcessingDeps): ProcessingService {
  const limiter: Limiter = createLimiter(concurrency);

  const run = async (id: Types.ObjectId): Promise<void> => {
    const assetId = id.toString();
    const record = await repository.claimForProcessing(id);
    if (record === null) {
      log.debug({ assetId }, 'asset already being processed; skipping');
      return;
    }

    const startedAt = Date.now();
    try {
      const metadata = await analyse(record, { storage, provider });
      await repository.markReady(id, {
        description: metadata.description === '' ? null : metadata.description,
        tags: metadata.tags,
        keywords: metadata.keywords,
        extractedText: metadata.extractedText,
        aiProvider: provider.name,
        aiModel: provider.model,
        promptVersion: PROMPT_VERSION,
      });
      log.info(
        {
          assetId,
          kind: record.kind,
          tags: metadata.tags.length,
          durationMs: Date.now() - startedAt,
        },
        'asset metadata stored',
      );
    } catch (err) {
      const message = describe(err);
      log.warn({ assetId, err: message }, 'asset analysis failed');
      // A failure must never leave the asset stuck in `processing`: the file is still viewable and
      // the user can retry from the UI.
      await repository.markFailed(id, message).catch((markErr: unknown) => {
        log.error({ assetId, err: describe(markErr) }, 'could not record analysis failure');
      });
    }
  };

  return {
    schedule(ids) {
      for (const id of ids) {
        void limiter.run(() => run(id));
      }
    },

    process(id) {
      return limiter.run(() => run(id));
    },

    async recoverInterrupted() {
      const ids = await repository.findIdsByStatus(['pending', 'processing']);
      for (const id of ids) void limiter.run(() => run(id));
      if (ids.length > 0) log.info({ count: ids.length }, 'requeued interrupted assets');
      return ids.length;
    },

    whenIdle() {
      return limiter.whenIdle();
    },
  };
}

async function analyse(
  record: AssetRecord,
  deps: { storage: FileStorage; provider: AiProvider },
): Promise<AssetMetadata> {
  const bytes = await readAll(deps.storage.createDownloadStream(record.fileId));

  if (record.kind === 'image') {
    return deps.provider.analyzeImage({
      data: bytes,
      mimeType: record.mimeType,
      fileName: record.originalName,
    });
  }

  const text = bytes.toString('utf8');
  const metadata = await deps.provider.analyzeText({
    // Only the opening is sent: descriptions do not improve with a novel attached, and tokens cost.
    text: text.slice(0, MAX_PROMPT_TEXT_CHARS),
    fileName: record.originalName,
  });
  // The file's own words are the best search material there is, so they are stored in full
  // regardless of what the model echoed back.
  const stored = text.trim().slice(0, MAX_EXTRACTED_TEXT_CHARS);
  return { ...metadata, extractedText: stored === '' ? null : stored };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
