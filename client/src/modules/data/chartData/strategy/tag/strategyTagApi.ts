import { request } from "../../../../shared/apiClient";
import type { StrategyTag } from "./StrategyTagData";

const BASE_URL = "/api/chartData/strategies/tags";

export async function fetchAllStrategyTags(): Promise<StrategyTag[]> {
  return request<StrategyTag[]>(BASE_URL);
}

export async function fetchStrategyTagById(id: number): Promise<StrategyTag> {
  return request<StrategyTag>(`${BASE_URL}/${id}`);
}

export async function saveStrategyTag(tag: StrategyTag): Promise<{ id: number }> {
  return request<{ id: number }>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(tag),
  });
}

export async function deleteStrategyTagApi(id: number): Promise<void> {
  return request<void>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}