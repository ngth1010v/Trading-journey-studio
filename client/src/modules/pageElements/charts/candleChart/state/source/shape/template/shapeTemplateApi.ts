import { request } from "../../../../../../../shared/apiClient";
import type { ShapeTemplate } from "./ShapeTemplateData";

const BASE_URL = "/api/chartData/candleChart/shapes/templates";

export async function fetchAllShapeTemplates(strategyId: number): Promise<ShapeTemplate[]> {
  return request<ShapeTemplate[]>(`${BASE_URL}/${strategyId}`);
}

export async function saveShapeTemplate(strategyId: number, template: ShapeTemplate): Promise<{ id: number }> {
  return request<{ id: number }>(`${BASE_URL}/${strategyId}`, {
    method: "POST",
    body: JSON.stringify(template),
  });
}

export async function deleteShapeTemplate(strategyId: number, id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${BASE_URL}/${strategyId}/${id}`, {
    method: "DELETE",
  });
}