import { Router, Request, Response } from "express";
import { TradeRepository } from "./trade.repository.js";
import { validateTrade } from "./trade.service.js";

const router = Router();
const BASE = "/api/chartData/trades";

router.get(`${BASE}`, (req: Request, res: Response) => {
  const { strategyId, symbol, fromTs, toTs } = req.query;

  if (
    strategyId === undefined ||
    symbol === undefined ||
    fromTs === undefined ||
    toTs === undefined
  ) {
    return res.status(400).json({
      error:
        "Missing required query parameters: strategyId, symbol, fromTs, toTs are all required.",
    });
  }

  const numStrategyId = Number(strategyId);
  const numFromTs = Number(fromTs);
  const numToTs = Number(toTs);
  const strSymbol = String(symbol);

  if (
    isNaN(numStrategyId) ||
    isNaN(numFromTs) ||
    isNaN(numToTs) ||
    !strSymbol
  ) {
    return res.status(400).json({ error: "Invalid parameter formats provided." });
  }

  const trades = TradeRepository.getTrades(
    numStrategyId,
    strSymbol,
    numFromTs,
    numToTs
  );

  res.json(trades);
});

router.get(`${BASE}/lastChange`, (req: Request, res: Response) => {
  res.json({ lastChangeTimestamp: TradeRepository.getLastChangeTimestamp() });
});

router.get(`${BASE}/:id`, (req: Request, res: Response) => {
  const trade = TradeRepository.getTradeById(Number(req.params.id));
  if (!trade) return res.status(404).json({ error: "Trade item not found" });
  res.json(trade);
});

router.post(`${BASE}`, (req: Request, res: Response) => {
  const validationError = validateTrade(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const result = TradeRepository.saveTrade(req.body);
  if (!result) return res.status(404).json({ error: "Update target item provided does not exist" });
  
  TradeRepository.refreshLastChangeTimestamp();
  res.json(result);
});

router.delete(`${BASE}/:id`, (req: Request, res: Response) => {
  const success = TradeRepository.deleteTrade(Number(req.params.id));
  if (!success) return res.status(404).json({ error: "Trade deletion target target missing" });
  
  TradeRepository.refreshLastChangeTimestamp();
  res.sendStatus(204);
});

export { router as tradeDataRouter };