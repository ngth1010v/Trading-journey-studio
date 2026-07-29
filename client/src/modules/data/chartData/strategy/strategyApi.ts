import { request } from "../../../shared/apiClient";
import type { Strategy } from "./StrategyData";

const BASE_URL = "/api/chartData/strategies";

export async function fetchAllStrategies(): Promise<Strategy[]> {
  return request<Strategy[]>(BASE_URL);
}

export async function fetchStrategyById(id: number): Promise<Strategy> {
  return request<Strategy>(`${BASE_URL}/${id}`);
}

export async function saveStrategy(strategy: Strategy): Promise<{ id: number }> {
  return request<{ id: number }>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(strategy),
  });
}

export async function deleteStrategyApi(id: number): Promise<void> {
  return request<void>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}