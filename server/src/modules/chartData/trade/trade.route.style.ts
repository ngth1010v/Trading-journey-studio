import { Router, Request, Response } from "express";
import { TradeRepository } from "./trade.repository.js";
import { validateStyle } from "./trade.service.js";

const router = Router();
const BASE = "/api/trades/chartData/style"

router.get(`${BASE}`, (_req: Request, res: Response) => {
  res.json(TradeRepository.getStyle());
});

router.post(`${BASE}`, (req: Request, res: Response) => {
  const validationError = validateStyle(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  TradeRepository.saveStyle(req.body);
  res.sendStatus(200);
});

export { router as tradeStyleRouter };