import { Router } from 'express';
import { parseSearchQuery } from '../../validation/query.js';
import type { SearchService } from '../../services/searchService.js';

export type SearchDeps = {
  searchService: SearchService;
};

export function createSearchRouter(deps: SearchDeps): Router {
  const router = Router();

  router.get('/search', async (req, res) => {
    res.json(await deps.searchService.search(parseSearchQuery(req.query)));
  });

  return router;
}
