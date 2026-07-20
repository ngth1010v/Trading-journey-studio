// shape/shape.route.tag.ts
import { Router, Request, Response } from "express";
import { ShapeRepository } from "./shape.repository.js";

const router = Router({ mergeParams: true });
const BASE = "/api/chartData/candleChart/shapes/tags"

router.get(`${BASE}/:strategyName`, (req: Request, res: Response) => {
  const { strategyName } = req.params;
  const tags = ShapeRepository.getAllTags(strategyName as string);
  res.json(tags);
});

router.post(`${BASE}/:strategyName`, (req: Request, res: Response): any => {
  const { strategyName } = req.params;
  const { id, name, color } = req.body;

  if (!name || !color || !Array.isArray(color.font) || !Array.isArray(color.background) || !Array.isArray(color.border)) {
    return res.status(400).json({ error: "Missing required properties for mapping color parameters mapping" });
  }

  if (id !== undefined && id !== null) {
    const existing = ShapeRepository.getTagById(strategyName as string, id);
    if (!existing) return res.status(404).json({ error: "Tag entity referenced does not exist" });
  }

  const generatedId = ShapeRepository.saveTag(strategyName as string, { id, name, color });
  return res.json({ id: generatedId });
});

router.delete(`${BASE}/:strategyName/:id`, (req: Request, res: Response): any => {
  const { strategyName, id } = req.params;
  const targetId = Number(id);

  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid numeric configuration identifier value" });

  const deleted = ShapeRepository.deleteTag(strategyName as string, targetId);
  if (!deleted) return res.status(404).json({ error: "Target structural context reference not located within runtime context" });

  return res.json({ success: true });
});

export const shapeTagRouter = router;