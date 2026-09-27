import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import type { Config } from './config.js';
import { log } from './logger.js';
import { requestId } from './http/middleware/requestId.js';
import { noCache } from './http/middleware/noCache.js';
import { errorHandler, notFoundHandler } from './http/middleware/errorHandler.js';
import { createHealthRouter } from './http/routes/health.js';
import { createAssetsRouter, type AssetsDeps } from './http/routes/assets.js';
import { createSearchRouter, type SearchDeps } from './http/routes/search.js';

export type AppDeps = AssetsDeps &
  SearchDeps & {
    config: Config;
    isDbUp: () => boolean;
  };

/** Pure wiring: no listening, no DB connection — so tests can build an app with fakes. */
export function createApp(deps: AppDeps): Express {
  const app = express();

  // ETags are a cache; the project requires every response to be recomputed.
  app.set('etag', false);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      log.debug(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
        'request handled',
      );
    });
    next();
  });

  const api = express.Router();
  api.use(noCache);
  api.use(express.json({ limit: '100kb' }));
  api.use(
    createHealthRouter({
      aiProviderName: deps.config.aiProvider,
      isDbUp: deps.isDbUp,
    }),
  );
  api.use(
    createAssetsRouter({
      assetService: deps.assetService,
      processingService: deps.processingService,
      parseUploadRequest: deps.parseUploadRequest,
    }),
  );
  api.use(createSearchRouter({ searchService: deps.searchService }));
  api.use(notFoundHandler);
  app.use('/api', api);

  mountClient(app, deps.config);

  app.use(errorHandler);
  return app;
}

/**
 * In production one container serves API and UI from the same origin (no CORS).
 * In dev the Vite server proxies /api here instead, so a missing build is not an error.
 */
function mountClient(app: Express, config: Config): void {
  const distDir = path.resolve(process.cwd(), config.clientDistDir);
  if (!existsSync(distDir)) {
    log.warn({ distDir }, 'client build not found — serving API only');
    return;
  }

  app.use(express.static(distDir, { etag: false, lastModified: false, cacheControl: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}
