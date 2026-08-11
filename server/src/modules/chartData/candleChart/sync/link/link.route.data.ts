import { Router, Request, Response } from 'express';
import { linkService } from './link.service.js';

const router = Router();

// GET /api/chartData/candleChart/sync/links -> return Link[]
router.get('/api/chartData/candleChart/sync/links', (_req: Request, res: Response) => {
  const links = linkService.getAllLinks();
  res.json(links);
});

// POST /api/chartData/candleChart/sync/links -> return {id: number}
router.post('/api/chartData/candleChart/sync/links', (req: Request, res: Response) => {
  const linkData = req.body;
  if (!linkData || typeof linkData.name !== 'string' || !linkData.color) {
    res.status(400).json({ error: 'Invalid link payload' });
    return;
  }

  const result = linkService.saveLink(linkData);
  res.status(200).json(result);
});

// DELETE /api/chartData/candleChart/sync/links/:id -> return 404 if not found
router.delete('/api/chartData/candleChart/sync/links/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid link ID' });
    return;
  }

  const success = linkService.deleteLink(id);
  if (!success) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  res.status(200).json({ success: true, deletedId: id });
});

export const linkDataRouter = router;