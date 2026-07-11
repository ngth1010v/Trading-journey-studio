import { throwAppError } from "../../../../../shared/appError";
import type { Shape } from "../shared/types";

/**
 * Intermediate type representing the raw format incoming/outgoing from the server
 */
interface RawServerShape {
  id?: number;
  type: Shape["type"];
  fromTs: number;
  toTs: number;
  data: string;   // Server stores this as a raw JSON string
  styles: string; // Server stores this as a raw JSON string
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
 * Helper to parse raw server shape data and styles fields back into live JS types
 */
function mapRawToShape(shape: RawServerShape): Shape {
  let parsedData = shape.data;
  let parsedStyles = shape.styles;

  try { if (typeof shape.data === "string") parsedData = JSON.parse(shape.data); } catch { /* Fallback if already parsed or corrupt */ }
  try { if (typeof shape.styles === "string") parsedStyles = JSON.parse(shape.styles); } catch { /* Fallback if already parsed or corrupt */ }

  return {
    ...shape,
    data: parsedData,
    styles: parsedStyles,
  };
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

  const rawShapes = await request<RawServerShape[]>(url);
  return rawShapes.map(mapRawToShape);
}

/**
 * GET /api/strateries/:strategyName/:symbol/shapes/changed
 * Fetches shapes tracking specific update versions inside a time window
 */
async function getChangedShapes(
  strategyName: string,
  symbol: string,
  lastUpdateTs: number,
  fromTs: number,
  toTs: number
): Promise<Shape[]> {
  const params = new URLSearchParams({
    lastUpdateTs: String(lastUpdateTs),
    fromTs: String(fromTs),
    toTs: String(toTs),
  });

  const url = `${API_BASE}/${encodeURIComponent(strategyName)}/${encodeURIComponent(symbol)}/shapes/changed?${params}`;

  const rawShapes = await request<RawServerShape[]>(url);
  return rawShapes.map(mapRawToShape);
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
  
  // Transform live JS fields into the raw JSON strings required by the backend
  const payload: RawServerShape[] = shapes.map((shape) => ({
    ...shape,
    data: typeof shape.data === "string" ? shape.data : JSON.stringify(shape.data),
    styles: typeof shape.styles === "string" ? shape.styles : JSON.stringify(shape.styles),
  }));

  return request<{ message: string }>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
  getChangedShapes,
  saveShapes,
  deleteShape,
};