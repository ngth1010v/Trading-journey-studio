// shape/shape.route.template.ts
import { Router, Request, Response } from "express";
import { ShapeRepository } from "./shape.repository.js";

const router = Router({ mergeParams: true });
const BASE = "/api/chartData/candleChart/shapes/templates"

router.get(`${BASE}/:strategyId`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const templates = ShapeRepository.getAllTemplates(strategyId);
  return res.json(templates);
});

router.post(`${BASE}/:strategyId`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const { id, type, name, style } = req.body;

  if (!type || !name || style === undefined) {
    return res.status(400).json({ error: "Missing template configuration mandatory structure attributes" });
  }

  if (id !== undefined && id !== null) {
    const existing = ShapeRepository.getTemplateById(strategyId, id);
    if (!existing) return res.status(404).json({ error: "Referenced Template context element entity target missing" });
  }

  const generatedId = ShapeRepository.saveTemplate(strategyId, { id, type, name, style });
  return res.json({ id: generatedId });
});

router.delete(`${BASE}/:strategyId/:id`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  const targetId = Number(req.params.id);

  if (isNaN(strategyId) || isNaN(targetId)) return res.status(400).json({ error: "Invalid identity key element tracking schema identification values" });

  const deleted = ShapeRepository.deleteTemplate(strategyId, targetId);
  if (!deleted) return res.status(404).json({ error: "No target identity elements mapped within connection pool index definitions" });

  return res.json({ success: true });
});

export const shapeTemplateRouter = router;