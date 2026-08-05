import { request } from "../../../../shared/apiClient";
import type { StrategySeason } from "./StrategySeasonData";

const BASE_URL = "/api/chartData/strategies/seasons";

export async function fetchAllStrategySeasons(): Promise<StrategySeason[]> {
  return request<StrategySeason[]>(BASE_URL);
}

export async function fetchStrategySeasonById(id: number): Promise<StrategySeason> {
  return request<StrategySeason>(`${BASE_URL}/${id}`);
}

export async function saveStrategySeason(season: StrategySeason): Promise<{ id: number }> {
  return request<{ id: number }>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(season),
  });
}

export async function deleteStrategySeasonApi(id: number): Promise<void> {
  return request<void>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}