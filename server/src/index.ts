import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { describeConfig, loadConfig } from './config.js';
import { connectToMongo, disconnectFromMongo, isDbUp } from './db/connection.js';
import { log, setLogLevel } from './logger.js';
import { createGridFsStorage } from './storage/gridFsStorage.js';
import { createAssetRepository } from './repositories/assetRepository.js';
import { createAssetService } from './services/assetService.js';
import { createProcessingService } from './services/processingService.js';
import { createSearchService } from './services/searchService.js';
import { createAiProvider } from './ai/createProvider.js';
import { parseUpload } from './http/uploadParser.js';
import { AssetModel } from './models/asset.model.js';

const MAX_FILES_PER_UPLOAD = 10;
const SHUTDOWN_DRAIN_MS = 5_000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Local dev convenience; in containers the env is provided by the platform.
if (existsSync('.env')) process.loadEnvFile('.env');

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  setLogLevel(config.logLevel);
  log.info(describeConfig(config), 'starting server');

  await connectToMongo(config.mongodbUri);
  // Indexes (including the text index search depends on) must exist before serving traffic.
  await AssetModel.createIndexes();

  const storage = createGridFsStorage();
  const repository = createAssetRepository();
  const assetService = createAssetService({ repository, storage });
  const searchService = createSearchService(repository);
  const provider = createAiProvider(config);
  log.info({ provider: provider.name, model: provider.model }, 'ai provider ready');
  const processingService = createProcessingService({
    repository,
    storage,
    provider,
    concurrency: config.aiConcurrency,
  });
  const maxBytes = config.maxUploadMb * 1024 * 1024;

  const app = createApp({
    config,
    isDbUp,
    assetService,
    searchService,
    processingService,
    parseUploadRequest: (req) =>
      parseUpload(req, { storage, maxBytes, maxFiles: MAX_FILES_PER_UPLOAD }),
  });
  const server = app.listen(config.port, () => {
    log.info({ port: config.port }, 'http server listening');
  });

  // A crash or redeploy can leave assets stuck mid-analysis; pick them up once traffic is served.
  void processingService.recoverInterrupted().catch((err: unknown) => {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'recovery scan failed');
  });

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'shutting down');
    server.close(() => {
      // Let in-flight analyses finish writing, but never hold the container past its grace period —
      // anything still running is left in `processing` and picked up by the next boot.
      void Promise.race([processingService.whenIdle(), delay(SHUTDOWN_DRAIN_MS)])
        .then(() => disconnectFromMongo())
        .finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  // Fail fast and loudly: a bad MONGODB_URI or missing AI key must not start a half-working server.
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'failed to start');
  process.exit(1);
});
