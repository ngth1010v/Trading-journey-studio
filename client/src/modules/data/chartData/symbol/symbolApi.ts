import { request } from "../../../shared/apiClient";
import type { Symbol } from "./SymbolData";

const BASE_URL = "/api/chartData/symbols";

/**
 * Fetches all available symbols from the server.
 */
export async function fetchSymbols(): Promise<Symbol[]> {
  return await request<Symbol[]>(BASE_URL);
}