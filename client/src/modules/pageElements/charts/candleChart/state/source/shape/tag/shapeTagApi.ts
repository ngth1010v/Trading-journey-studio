import { request } from "../../../../../../../shared/apiClient";
import { type ShapeTag } from "./ShapeTagData";

const BASE_URL = "/api/chartData/candleChart/shapes/tags";

export async function fetchAllShapeTags(strategyId: number): Promise<ShapeTag[]> {
  return request<ShapeTag[]>(`${BASE_URL}/${strategyId}`);
}

export async function saveShapeTag(strategyId: number, tag: ShapeTag): Promise<{ id: number }> {
  return request<{ id: number }>(`${BASE_URL}/${strategyId}`, {
    method: "POST",
    body: JSON.stringify(tag),
  });
}

export async function deleteShapeTag(strategyId: number, id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${BASE_URL}/${strategyId}/${id}`, {
    method: "DELETE",
  });
}