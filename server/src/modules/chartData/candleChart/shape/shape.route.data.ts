// shape/shape.route.data.ts
import { Router, Request, Response } from "express";
import { ShapeRepository } from "./shape.repository.js";
import { strategyDbManager } from "./shape.service.js";

const router = Router({ mergeParams: true });
const BASE = "/api/chartData/candleChart/shapes";

// GET shapes with required query params: strategyId, symbol, fromTs, toTs
router.get(`${BASE}`, (req: Request, res: Response): any => {
  const { strategyId, symbol, fromTs, toTs } = req.query;

  if (!strategyId || !symbol || fromTs === undefined || toTs === undefined) {
    return res.status(400).json({
      error: "Missing required query parameters: strategyId, symbol, fromTs, toTs",
    });
  }

  const numStrategyId = Number(strategyId);
  const numFromTs = Number(fromTs);
  const numToTs = Number(toTs);

  if (isNaN(numStrategyId) || isNaN(numFromTs) || isNaN(numToTs)) {
    return res.status(400).json({
      error: "Invalid numeric values for strategyId, fromTs, or toTs",
    });
  }

  try {
    const shapes = ShapeRepository.getShapesByRange(
      numStrategyId,
      String(symbol),
      numFromTs,
      numToTs
    );
    return res.json(shapes);
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to fetch shapes" });
  }
});

// GET strategy lastChange timestamp tracker status
router.get(`${BASE}/:strategyId/lastChange`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const lastChangeTimestamp = strategyDbManager.getLastChange(strategyId);
  return res.json({ lastChangeTimestamp });
});

// POST save single shape mutation payload sequence
router.post(`${BASE}/:strategyId`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const { id, type, symbol, tagIds, fromTs, toTs, data, style } = req.body;

  if (
    !type ||
    !symbol ||
    !Array.isArray(tagIds) ||
    fromTs === undefined ||
    toTs === undefined ||
    data === undefined ||
    style === undefined
  ) {
    return res
      .status(400)
      .json({ error: "Missing required properties from request payload context" });
  }

  if (id !== undefined && id !== null) {
    const existing = ShapeRepository.getShapeById(strategyId, id);
    if (!existing) {
      return res
        .status(404)
        .json({ error: "Target shape record entity reference id not found" });
    }
  }

  const generatedId = ShapeRepository.saveShape(strategyId, {
    id,
    type,
    symbol,
    tagIds,
    fromTs,
    toTs,
    data,
    style,
  });
  strategyDbManager.updateLastChange(strategyId);

  return res.json({ id: generatedId });
});

// DELETE shape record tracking entry context instance
router.delete(`${BASE}/:strategyId/:id`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  const targetId = Number(req.params.id);

  if (isNaN(strategyId) || isNaN(targetId))
    return res.status(400).json({ error: "Invalid target dynamic ID" });

  const deleted = ShapeRepository.deleteShape(strategyId, targetId);
  if (!deleted)
    return res
      .status(404)
      .json({ error: "Target structural context identifier reference was not resolved" });
  strategyDbManager.updateLastChange(strategyId);

  return res.json({ success: true });
});

export const shapeDataRouter = router;