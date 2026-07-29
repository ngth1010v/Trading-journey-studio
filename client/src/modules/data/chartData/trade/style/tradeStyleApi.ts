import { request } from "../../../../shared/apiClient";
import type { TradeStyle } from "./TradeStyleData";

const BASE_URL = "/api/trades/chartData/style";

export async function fetchTradeStyle(): Promise<TradeStyle> {
  return request<TradeStyle>(BASE_URL);
}

export async function saveTradeStyle(style: TradeStyle): Promise<void> {
  return request<void>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(style),
  });
}