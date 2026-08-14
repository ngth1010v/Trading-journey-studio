import { Router, Request, Response } from "express";
import { pageElementService } from "./pageElement.service.js";

export const configRouter = Router();

// GET /api/pageElements/:id/config
configRouter.get("/api/pageElements/:id/config", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid element ID" });
    }

    const result = pageElementService.getConfig(id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(result.status).json(result.config);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /api/pageElements/:id/config
configRouter.post("/api/pageElements/:id/config", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid element ID" });
    }

    const result = pageElementService.setConfig(id, req.body);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(result.status).json({ message: result.message });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});