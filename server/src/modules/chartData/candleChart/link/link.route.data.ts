import { Router, Request, Response } from "express";
import { linkService } from "./link.service.js";

export const dataRouter = Router();

// GET /api/chartData/candleChart/links
dataRouter.get("/api/chartData/candleChart/links", (_req: Request, res: Response) => {
  const links = linkService.getAllLinks();
  res.json(links);
});

// POST /api/chartData/candleChart/links
dataRouter.post("/api/chartData/candleChart/links", (req: Request, res: Response) => {
  const linkData = req.body;
  
  if (!linkData || typeof linkData.name !== "string" || !Array.isArray(linkData.children)) {
    return res.status(400).json({ error: "Invalid link structure" });
  }

  const id = linkService.saveLink(linkData);
  return res.json({ id });
});

// DELETE /api/chartData/candleChart/links/:id
dataRouter.delete("/api/chartData/candleChart/links/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid ID parameter" });
  }

  const deleted = linkService.deleteLink(id);
  if (!deleted) {
    return res.status(404).json({ error: "Link not found" });
  }

  return res.status(200).json({ success: true });
});