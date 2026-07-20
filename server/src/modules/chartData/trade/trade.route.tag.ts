import { Router, Request, Response } from "express";
import { TradeRepository } from "./trade.repository.js";
import { validateTag } from "./trade.service.js";

const router = Router();
const BASE = "/api/trades/chartData/tags"

router.get(`${BASE}`, (_req: Request, res: Response) => {
  res.json(TradeRepository.getTags());
});

router.get(`${BASE}/:id`, (req: Request, res: Response) => {
  const tag = TradeRepository.getTagById(Number(req.params.id));
  if (!tag) return res.status(404).json({ error: "Requested tag not found" });
  res.json(tag);
});

router.post(`${BASE}`, (req: Request, res: Response) => {
  const validationError = validateTag(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const result = TradeRepository.saveTag(req.body);
  if (!result) return res.status(404).json({ error: "Provided updating label tag index doesn't exist" });
  res.json(result);
});

router.delete(`${BASE}/:id`, (req: Request, res: Response) => {
  const success = TradeRepository.deleteTag(Number(req.params.id));
  if (!success) return res.status(404).json({ error: "Target structural tag data element not found" });
  res.sendStatus(204);
});

export { router as tradeTagRouter };