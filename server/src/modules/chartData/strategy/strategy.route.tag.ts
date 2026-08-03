import { Router, Request, Response } from "express";
import { repo } from "./strategy.repository.js";
import { StrategyService } from "./strategy.service.js";

const router = Router();
const BASE = "/api/chartData/strategies/tags";

// GET all tags
router.get(`${BASE}`, (req: Request, res: Response) => {
  try {
    const data = repo.getAllTags();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET specific tag
router.get(`${BASE}/:id`, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID must be a structural number." });
      return;
    }
    const tag = repo.getTagById(id);
    if (!tag) {
      res.status(404).json({ error: "StrategyTag context not found." });
      return;
    }
    res.json(tag);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST save (Create / Update)
router.post(`${BASE}`, (req: Request, res: Response) => {
  try {
    const errorMsg = StrategyService.validateTagPayload(req.body);
    if (errorMsg) {
      res.status(400).json({ error: errorMsg });
      return;
    }

    const targetId = req.body.id;

    if (targetId !== undefined && targetId !== null) {
      const exists = repo.getTagById(targetId);
      if (!exists) {
        res.status(404).json({ error: `Cannot update. Tag with ID ${targetId} does not exist.` });
        return;
      }

      repo.updateTag(req.body);
      res.json({ id: targetId });
    } else {
      const newId = repo.createTag(req.body);
      res.json({ id: newId });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete(`${BASE}/:id`, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID must be a valid number." });
      return;
    }
    const deleted = repo.deleteTag(id);
    if (!deleted) {
      res.status(404).json({ error: "Tag doesn't exist." });
      return;
    }
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;