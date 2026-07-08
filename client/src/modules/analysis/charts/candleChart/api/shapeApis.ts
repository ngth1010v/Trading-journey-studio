import { throwAppError } from "../../../../../shared/appError";

export interface Shape {
  id?: number;
  type: string;
  fromTs: number;
  toTs: number;
  data: string;
  styles: string;
}

const API_BASE = "/api/strateries";

/**
 * Core simplified fetch utility for JSON requests
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throwAppError(
        String(response.status),
        response.statusText || "Request failed"
      );
    }

    return await response.json() as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AppError") {
      throw err;
    }
    throwAppError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

/**
 * GET /api/strateries/:strategyName/:symbol/shapes
 * Optionally filters by fromTs and toTs query parameters
 */
async function getShapes(
  strategyName: string,
  symbol: string,
  fromTs?: number,
  toTs?: number
): Promise<Shape[]> {
  let url = `${API_BASE}/${encodeURIComponent(strategyName)}/${encodeURIComponent(symbol)}/shapes`;
  
  if (fromTs !== undefined && toTs !== undefined) {
    const params = new URLSearchParams({
      fromTs: String(fromTs),
      toTs: String(toTs),
    });
    url += `?${params}`;
  }

  return request<Shape[]>(url);
}

/**
 * POST /api/strateries/:strategyName/:symbol/shapes
 */
async function saveShapes(
  strategyName: string,
  symbol: string,
  shapes: Shape[]
): Promise<{ message: string }> {
  const url = `${API_BASE}/${encodeURIComponent(strategyName)}/${encodeURIComponent(symbol)}/shapes`;
  
  return request<{ message: string }>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(shapes),
  });
}

/**
 * DELETE /api/strateries/:strategyName/:symbol/shapes/:id
 */
async function deleteShape(
  strategyName: string,
  symbol: string,
  id: number
): Promise<{ message: string }> {
  const url = `${API_BASE}/${encodeURIComponent(strategyName)}/${encodeURIComponent(symbol)}/shapes/${id}`;
  
  return request<{ message: string }>(url, {
    method: "DELETE",
  });
}

export const shapeApis = {
  getShapes,
  saveShapes,
  deleteShape,
};