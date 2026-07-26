import { Router, Request, Response } from 'express';
import { PageService } from './page.service.js';

const BASE = "/api/pages";

export function createPageRouter(service: PageService): Router {
  const router = Router();

  router.get(`${BASE}`, (req: Request, res: Response) => {
    try {
      const summaries = service.getAllPages();
      res.json(summaries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get(`${BASE}/:id`, (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const page = service.getPageById(id);
      res.json(page);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });

  router.post(`${BASE}`, (req: Request, res: Response) => {
    try {
      const { id, name, data } = req.body;
      
      // Basic payload validation
      if (!name || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Missing or malformed fields: name and data are required' });
      }

      const result = service.savePage({ id, name, data });

      // Return 200 OK for updates, 201 Created for new pages
      const statusCode = id !== undefined ? 200 : 201;
      return res.status(statusCode).json(result);
    } catch (error: any) {
      // Differentiate unexpected errors (500) or missing items (404)
      const isNotFound = error.message.includes('does not exist');
      return res.status(isNotFound ? 404 : 500).json({ error: error.message });
    }
  });

  router.delete(`${BASE}/:id`, (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      service.deletePage(id);
      res.status(200).json({ message: `Page ${id} deleted successfully` });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });

  return router;
}