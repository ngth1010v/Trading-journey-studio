import type { Request } from "express";

import type { Ohlc, SymbolData } from "../../shared/type.js";
import { PythonClient } from "./python-client.js";
import { ohlcQuerySchema, symbolParamSchema } from "./markets.validator.js";

export class MarketsService {
  constructor(private readonly python: PythonClient) {}

  async listSymbols(): Promise<string[]> {
    const result = await this.python.listSymbols();
    return result.symbols;
  }

  async getSymbol(symbol: string): Promise<SymbolData> {
    const parsed = symbolParamSchema.parse({ symbol });
    return this.python.getSymbol(parsed.symbol);
  }

  async getOhlc(symbol: string, query: unknown): Promise<Ohlc[]> {
    const parsed = ohlcQuerySchema.parse(query);
    const result = await this.python.getOhlc({ symbol, ...parsed });
    return result.ohlc;
  }

  async getLastOhlc(symbol: string, timeframe: string): Promise<Ohlc> {
    const result = await this.python.getLastOhlc({ symbol, timeframe });
    return result.ohlc;
  }
}
