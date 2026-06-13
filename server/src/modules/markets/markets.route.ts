import { Router, type Request, type Response } from "express";

import { MarketsService } from "./markets.service.js";
import { symbolParamSchema, timeframeParamSchema } from "./markets.validator.js";

export function createMarketsRouter(service: MarketsService): Router {
  const router = Router();

  router.get("/symbols", async (_req: Request, res: Response) => {
    try {
      const symbols = await service.listSymbols();
      res.json(symbols);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
    }
  });


  router.get("/:symbol/last-ohlc", async (req: Request, res: Response) => {
    try {
      const parsed = timeframeParamSchema.parse({ symbol: req.params.symbol, timeframe: req.query.timeframe });
      const candle = await service.getLastOhlc(parsed.symbol, parsed.timeframe);
      res.json(candle);
    } catch (error) {
      const status = error instanceof Error && error.message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: error instanceof Error ? error.message : "unknown error" });
    }
  });

  router.get("/:symbol/ohlc", async (req: Request, res: Response) => {
    try {
      const symbol = symbolParamSchema.parse({ symbol: req.params.symbol }).symbol;
      const candles = await service.getOhlc(symbol, req.query);
      res.json(candles);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.get("/:symbol", async (req: Request, res: Response) => {
    try {
      const parsed = symbolParamSchema.parse({ symbol: req.params.symbol });
      const symbolData = await service.getSymbol(parsed.symbol);
      res.json(symbolData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  return router;
}
