import { Router, type Request } from 'express';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../errors.js';
import { log } from '../../logger.js';
import { parseObjectId } from '../../validation/ids.js';
import { parseListQuery } from '../../validation/query.js';
import type { UploadedFile } from '../uploadParser.js';
import type { AssetService } from '../../services/assetService.js';
import type { ProcessingService } from '../../services/processingService.js';
import type { UploadAssetsResponse } from '../../types/api.js';

export type AssetsDeps = {
  assetService: AssetService;
  processingService: ProcessingService;
  /** Bound in `index.ts` with the storage and limits, so the route stays HTTP-only. */
  parseUploadRequest: (req: Request) => Promise<UploadedFile[]>;
};

export function createAssetsRouter(deps: AssetsDeps): Router {
  const router = Router();

  // 202, not 201: the bytes are stored, but AI metadata arrives later and the client polls for it.
  router.post('/assets', async (req, res) => {
    const files = await deps.parseUploadRequest(req);
    const assets = await deps.assetService.createFromUploads(files);
    log.info({ requestId: req.requestId, count: assets.length }, 'assets uploaded');
    // Deliberately not awaited: analysis takes seconds and the upload response must not wait.
    deps.processingService.schedule(assets.map((asset) => parseObjectId(asset.id)));
    const body: UploadAssetsResponse = { assets };
    res.status(202).json(body);
  });

  // Retry after a `failed` analysis, or re-run it after a prompt change.
  router.post('/assets/:id/reprocess', async (req, res) => {
    const id = parseObjectId(req.params.id);
    // Resetting to `pending` before queueing means the response already reflects the new state,
    // so the client can start polling without guessing.
    const asset = await deps.assetService.requeue(id);
    deps.processingService.schedule([id]);
    res.status(202).json(asset);
  });

  router.get('/assets', async (req, res) => {
    res.json(await deps.assetService.list(parseListQuery(req.query)));
  });

  router.get('/assets/:id', async (req, res) => {
    res.json(await deps.assetService.getById(parseObjectId(req.params.id)));
  });

  router.get('/assets/:id/content', async (req, res) => {
    const content = await deps.assetService.getContent(parseObjectId(req.params.id));
    res.setHeader('Content-Type', content.mimeType);
    res.setHeader('Content-Length', content.sizeBytes);
    res.setHeader('Content-Disposition', contentDisposition(content.originalName));
    try {
      await pipeline(content.stream, res);
    } catch (err) {
      // Headers are already sent, so the error handler cannot produce a JSON body here.
      log.warn({ requestId: req.requestId, err: describe(err) }, 'content stream aborted');
      res.destroy();
    }
  });

  router.delete('/assets/:id', async (req, res) => {
    await deps.assetService.delete(parseObjectId(req.params.id));
    res.status(204).end();
  });

  return router;
}

/**
 * The client filename is untrusted: quotes and newlines would let it forge header fields, so the
 * ASCII form is stripped down and the exact name is carried by the RFC 5987 `filename*` parameter.
 */
function contentDisposition(originalName: string): string {
  const ascii = originalName.replace(/[^\w.\- ]/g, '_') || 'download';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

function describe(err: unknown): string {
  return err instanceof AppError || err instanceof Error ? err.message : String(err);
}
