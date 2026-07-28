// shape/shape.route.tag.ts
import { Router, Request, Response } from "express";
import { ShapeRepository } from "./shape.repository.js";

const router = Router({ mergeParams: true });
const BASE = "/api/chartData/candleChart/shapes/tags"

router.get(`${BASE}/:strategyId`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const tags = ShapeRepository.getAllTags(strategyId);
  return res.json(tags);
});

router.post(`${BASE}/:strategyId`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const { id, name, color } = req.body;

  if (!name || !color || !Array.isArray(color.font) || !Array.isArray(color.background) || !Array.isArray(color.border)) {
    return res.status(400).json({ error: "Missing required properties for mapping color parameters mapping" });
  }

  if (id !== undefined && id !== null) {
    const existing = ShapeRepository.getTagById(strategyId, id);
    if (!existing) return res.status(404).json({ error: "Tag entity referenced does not exist" });
  }

  const generatedId = ShapeRepository.saveTag(strategyId, { id, name, color });
  return res.json({ id: generatedId });
});

router.delete(`${BASE}/:strategyId/:id`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  const targetId = Number(req.params.id);

  if (isNaN(strategyId) || isNaN(targetId)) return res.status(400).json({ error: "Invalid numeric configuration identifier value" });

  const deleted = ShapeRepository.deleteTag(strategyId, targetId);
  if (!deleted) return res.status(404).json({ error: "Target structural context reference not located within runtime context" });

  return res.json({ success: true });
});

export const shapeTagRouter = router;