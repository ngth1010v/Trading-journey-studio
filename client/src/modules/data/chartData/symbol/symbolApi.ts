import { request } from "../../../shared/apiClient";
import type { Symbol } from "./SymbolData";

const BASE_URL = "/api/chartData/symbols";

/**
 * Fetches all available symbols from the server.
 */
export async function fetchSymbols(): Promise<Symbol[]> {
  return await request<Symbol[]>(BASE_URL);
}

/**
 * Updates a symbol's watching status on the server.
 */
export async function updateSymbol(symbol: string, watching: boolean): Promise<{ status: string; msg: string }> {
  return await request<{ status: string; msg: string }>(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ symbol, watching }),
  });
}