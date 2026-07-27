import { Router, Request, Response } from "express";
import { linkService } from "./link.service.js";

export const stateRouter = Router();

// GET /api/chartData/candleChart/links/:id/state
stateRouter.get("/api/chartData/candleChart/links/:id/state", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid ID parameter" });
  }

  const state = linkService.getLinkState(id);
  if (!state) {
    return res.status(404).json({ error: "Link state not found" });
  }

  return res.json(state);
});

// POST /api/chartData/candleChart/links/:id/state
stateRouter.post("/api/chartData/candleChart/links/:id/state", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid ID parameter" });
  }

  const newState = req.body;
  const result = linkService.updateLinkState(id, newState);

  if (!result.success) {
    return res.status(400).json({ error: result.reason });
  }

  return res.status(200).json({ success: true });
});