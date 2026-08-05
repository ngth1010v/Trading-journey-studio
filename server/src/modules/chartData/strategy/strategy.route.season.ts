import { Router, Request, Response } from "express";
import { repo } from "./strategy.repository.js";
import { StrategyService } from "./strategy.service.js";

const router = Router();
const BASE = "/api/chartData/strategies/seasons";

// GET all seasons
router.get(`${BASE}`, (req: Request, res: Response) => {
  try {
    const data = repo.getAllSeasons();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET specific season
router.get(`${BASE}/:id`, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID must be a structural number." });
      return;
    }
    const season = repo.getSeasonById(id);
    if (!season) {
      res.status(404).json({ error: "StrategySeason context not found." });
      return;
    }
    res.json(season);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST save (Create / Update)
router.post(`${BASE}`, (req: Request, res: Response) => {
  try {
    const errorMsg = StrategyService.validateSeasonPayload(req.body);
    if (errorMsg) {
      res.status(400).json({ error: errorMsg });
      return;
    }

    const targetId = req.body.id;

    if (targetId !== undefined && targetId !== null) {
      const exists = repo.getSeasonById(targetId);
      if (!exists) {
        res.status(404).json({ error: `Cannot update. Season with ID ${targetId} does not exist.` });
        return;
      }

      repo.updateSeason(req.body);
      res.json({ id: targetId });
    } else {
      const newId = repo.createSeason(req.body);
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
    const deleted = repo.deleteSeason(id);
    if (!deleted) {
      res.status(404).json({ error: "Season doesn't exist." });
      return;
    }
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;