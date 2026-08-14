import { Router, Request, Response } from "express";
import { pageElementService } from "./pageElement.service.js";

export const dataRouter = Router();

// GET /api/pageElements -> get all current elements
dataRouter.get("/api/pageElements", (_req: Request, res: Response) => {
  try {
    const elements = pageElementService.getAllElements();
    return res.status(200).json(elements);
  } catch (error: any) {
    console.log(error)
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /api/pageElements -> create or update element, return { id: number }
dataRouter.post("/api/pageElements", (req: Request, res: Response) => {
  try {
    const result = pageElementService.saveElement(req.body);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(result.status).json(result.data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /api/pageElements/:id
dataRouter.delete("/api/pageElements/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid element ID" });
    }

    const result = pageElementService.deleteElement(id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(result.status).json({ message: result.message });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});