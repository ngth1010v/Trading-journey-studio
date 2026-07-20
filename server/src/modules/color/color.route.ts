import { Router, Request, Response } from "express";
import { ColorService } from "./color.service.js";

export function createColorRouter(service: ColorService): Router {
  const router = Router();

  // GET /api/colors
  router.get("/api/colors", (_req: Request, res: Response) => {
    try {
      const colors = service.getAllColors();
      res.json(colors);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // POST /api/colors
  router.post("/api/colors", (req: Request, res: Response) => {
    try {
      const result = service.saveColor(req.body);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid payload" });
    }
  });

  // DELETE /api/colors/:id
  router.delete("/api/colors/:id", (req: Request, res: Response) => {
    try {

        if (Array.isArray(req.params.id)) {
            throw new Error('Invalid route parameters');
        }
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID format" });
            return;
        }

        const deleted = service.deleteColor(id);
        if (!deleted) {
            res.status(404).json({ error: "Color not found" });
            return;
        }

        res.json({ success: true });
        } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
        }
  });

  return router;
}