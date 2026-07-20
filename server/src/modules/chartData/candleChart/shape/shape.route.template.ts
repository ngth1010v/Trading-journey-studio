// shape/shape.route.template.ts
import { Router, Request, Response } from "express";
import { ShapeRepository } from "./shape.repository.js";

const router = Router({ mergeParams: true });
const BASE = "/api/chartData/candleChart/shapes/templates"

router.get(`${BASE}/:strategyName`, (req: Request, res: Response) => {
  const { strategyName } = req.params;
  const templates = ShapeRepository.getAllTemplates(strategyName as string);
  res.json(templates);
});

router.post(`${BASE}/:strategyName`, (req: Request, res: Response): any => {
  const { strategyName } = req.params;
  const { id, type, name, style } = req.body;

  if (!type || !name || style === undefined) {
    return res.status(400).json({ error: "Missing template configuration mandatory structure attributes" });
  }

  if (id !== undefined && id !== null) {
    const existing = ShapeRepository.getTemplateById(strategyName as string, id);
    if (!existing) return res.status(404).json({ error: "Referenced Template context element entity target missing" });
  }

  const generatedId = ShapeRepository.saveTemplate(strategyName as string, { id, type, name, style });
  return res.json({ id: generatedId });
});

router.delete(`${BASE}/:strategyName/:id`, (req: Request, res: Response): any => {
  const { strategyName, id } = req.params;
  const targetId = Number(id);

  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid identity key element tracking schema identification values" });

  const deleted = ShapeRepository.deleteTemplate(strategyName as string, targetId);
  if (!deleted) return res.status(404).json({ error: "No target identity elements mapped within connection pool index definitions" });

  return res.json({ success: true });
});

export const shapeTemplateRouter = router;