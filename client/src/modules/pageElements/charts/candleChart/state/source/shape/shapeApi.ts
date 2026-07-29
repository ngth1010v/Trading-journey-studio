import { request } from "../../../../../../shared/apiClient";
import type { Shape } from "./ShapeData";

const BASE_URL = "/api/chartData/candleChart/shapes";

export async function fetchShapes(
  strategyId: number,
  symbol: string,
  fromTs: number,
  toTs: number
): Promise<Shape[]> {
  const filter = `"symbol=${symbol}"&"${fromTs}<toTs"&"fromTs<${toTs}"`;
  const url = `${BASE_URL}/${strategyId}?filter=${encodeURIComponent(filter)}`;
  return request<Shape[]>(url);
}

export async function fetchLastChangeTimestamp(strategyId: number): Promise<number> {
  const res = await request<{ lastChangeTimestamp: number }>(
    `${BASE_URL}/${strategyId}/lastChange`
  );
  return res.lastChangeTimestamp;
}

export async function saveShape(strategyId: number, shape: Shape): Promise<{ id: number }> {
  return request<{ id: number }>(`${BASE_URL}/${strategyId}`, {
    method: "POST",
    body: JSON.stringify(shape),
  });
}

export async function deleteShape(strategyId: number, id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${BASE_URL}/${strategyId}/${id}`, {
    method: "DELETE",
  });
}