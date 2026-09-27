import { Router } from 'express';
import type { HealthResponse } from '../../types/api.js';

export type HealthDeps = {
  aiProviderName: string;
  isDbUp: () => boolean;
};

export function buildHealthResponse(deps: HealthDeps): HealthResponse {
  return {
    status: 'ok',
    db: deps.isDbUp() ? 'up' : 'down',
    aiProvider: deps.aiProviderName,
  };
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json(buildHealthResponse(deps));
  });

  return router;
}
