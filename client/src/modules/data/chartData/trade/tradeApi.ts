import { request } from "../../../shared/apiClient";
import type { Trade } from "./TradeData";

const BASE_URL = "/api/chartData/trades";

export async function fetchTrades(filter?: string): Promise<Trade[]> {
  const query = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  return request<Trade[]>(`${BASE_URL}${query}`);
}

export async function fetchLastChangeTimestamp(): Promise<number> {
  const response = await request<{ lastChangeTimestamp: number }>(
    `${BASE_URL}/lastChange`
  );
  return response.lastChangeTimestamp;
}

export async function fetchTradeById(id: number): Promise<Trade> {
  return request<Trade>(`${BASE_URL}/${id}`);
}

export async function saveTrade(trade: Trade): Promise<Trade> {
  return request<Trade>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(trade),
  });
}

export async function deleteTrade(id: number): Promise<void> {
  return request<void>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}