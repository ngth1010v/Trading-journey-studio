import { Router, Request, Response } from 'express';
import { linkService } from './link.service.js';

const router = Router();

// GET /api/chartData/candleChart/sync/links/:id/state -> return state (404 if Link not found)
router.get('/api/chartData/candleChart/sync/links/:id/state', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid link ID' });
    return;
  }

  const link = linkService.getLinkById(id);
  if (!link) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  const state = linkService.getState(id);
  res.status(200).json({ id, state: state ?? null });
});

export const linkStateRouter = router;