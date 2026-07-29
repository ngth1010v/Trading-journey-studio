import { request } from "../../../../shared/apiClient";
import type { TradeTag } from "./TradeTagData";

const BASE_URL = "/api/trades/chartData/tags";

export async function fetchAllTradeTags(): Promise<TradeTag[]> {
  return request<TradeTag[]>(BASE_URL);
}

export async function fetchTradeTagById(id: number): Promise<TradeTag> {
  return request<TradeTag>(`${BASE_URL}/${id}`);
}

export async function saveTradeTag(tag: TradeTag): Promise<TradeTag> {
  return request<TradeTag>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(tag),
  });
}

export async function deleteTradeTag(id: number): Promise<void> {
  return request<void>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}