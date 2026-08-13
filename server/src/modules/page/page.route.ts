import { Router, Request, Response } from "express";
import { PageService } from "./page.service.js";

const BASE = "/api/pages";

export function createPageRouter(service: PageService): Router {
  const router = Router();

  router.get(`${BASE}/registry`, (_req: Request, res: Response) => {
    try {
      const key = service.registerKey();
      res.json({ key });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get(`${BASE}/unregistry/:key`, (req: Request, res: Response) => {
    try {
      const key = req.params.key as string;
      const removed = service.unregisterKey(key);
      if (!removed) {
        return res.status(404).json({ error: "Key not found or already unregistered" });
      }
      res.json({ message: `Key ${key} successfully unregistered` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get(`${BASE}/flush`, (_req: Request, res: Response) => {
    try {
      service.flush();
      res.json({ message: "In-memory database flushed to disk successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}