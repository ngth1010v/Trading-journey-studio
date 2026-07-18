import { throwAppError } from "../../../../shared/appError";
import type { Trade, TradeTag, TradeTemplate } from "../type";

// Base request wrapper preserving your application's customized error envelope logic
async function request<T>(url: string, method = "GET", body?: any): Promise<T> {
  try {
    const options: RequestInit = { method };
    if (body) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throwAppError(
        String(response.status),
        response.statusText || "Request failed",
      );
    }

    const rawData = await response.json();

    if (rawData && typeof rawData === "object" && "success" in rawData) {
      const result = rawData as {
        success: boolean;
        data?: T;
        error?: { code?: string; msg?: string };
      };

      if (!result.success) {
        throwAppError(
          result.error?.code ?? "REQUEST_FAILED",
          result.error?.msg ?? "Request failed",
        );
      }

      return result.data as T;
    }

    return rawData as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AppError") {
      throw err;
    }

    throwAppError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}

// Helper to generate safe URL component sequences for wildcards and named path segments
function getUrlBase(strategyName: string, symbol: string): string {
  return `/api/strateries/${encodeURIComponent(strategyName)}/${encodeURIComponent(symbol)}/trades`;
}

//================================================================================================
// PUBLIC API
//================================================================================================

/**
 * GET /api/strateries/:strateryName/:symbol/trades
 * Fetches all trades inside a valid timestamp window. Optional lastUpdateTs filter.
 */
async function getTrades(
  strategyName: string,
  symbol: string,
  fromTs: number,
  toTs: number,
  lastUpdateTs?: number
): Promise<Trade[]> {
  let url = `${getUrlBase(strategyName, symbol)}?fromTs=${fromTs}&toTs=${toTs}`;
  if (lastUpdateTs !== undefined) {
    url += `&lastUpdateTs=${lastUpdateTs}`;
  }
  return request<Trade[]>(url);
}

/**
 * POST /api/strateries/:strateryName/:symbol/trades
 * Creates a trade if id is undefined, or updates it if id exists.
 */
async function saveTrade(strategyName: string, symbol: string, trade: Trade): Promise<{ message: string }> {
  return request<{ message: string }>(getUrlBase(strategyName, symbol), "POST", trade);
}

/**
 * DELETE /api/strateries/:strateryName/:symbol/trades/:id
 */
async function deleteTrade(strategyName: string, symbol: string, id: number): Promise<{ message: string }> {
  return request<{ message: string }>(
    `${getUrlBase(strategyName, symbol)}/${id}`,
    "DELETE"
  );
}

/**
 * GET /api/strateries/:strateryName/:symbol/trades/tags
 */
async function getTags(strategyName: string, symbol: string, lastUpdateTs?: number): Promise<TradeTag[]> {
  let url = `${getUrlBase(strategyName, symbol)}/tags`;
  if (lastUpdateTs !== undefined) {
    url += `?lastUpdateTs=${lastUpdateTs}`;
  }
  return request<TradeTag[]>(url);
}

/**
 * POST /api/strateries/:strateryName/:symbol/trades/tags
 */
async function saveTag(strategyName: string, symbol: string, tag: TradeTag): Promise<{ message: string }> {
  return request<{ message: string }>(`${getUrlBase(strategyName, symbol)}/tags`, "POST", tag);
}

/**
 * DELETE /api/strateries/:strateryName/:symbol/trades/tags/:id
 */
async function deleteTag(strategyName: string, symbol: string, id: number): Promise<{ message: string }> {
  return request<{ message: string }>(
    `${getUrlBase(strategyName, symbol)}/tags/${id}`,
    "DELETE"
  );
}

/**
 * GET /api/strateries/:strateryName/:symbol/trades/templates
 * Always retrieves all templates matching strategy and symbol.
 */
async function getTemplates(strategyName: string, symbol: string): Promise<TradeTemplate[]> {
  return request<TradeTemplate[]>(`${getUrlBase(strategyName, symbol)}/templates`);
}

/**
 * POST /api/strateries/:strateryName/:symbol/trades/templates
 */
async function saveTemplate(strategyName: string, symbol: string, template: TradeTemplate): Promise<{ message: string }> {
  return request<{ message: string }>(`${getUrlBase(strategyName, symbol)}/templates`, "POST", template);
}

/**
 * DELETE /api/strateries/:strateryName/:symbol/trades/templates/:name
 * Targets templates via string primary key identifier path suffix.
 */
async function deleteTemplate(strategyName: string, symbol: string, name: string): Promise<{ message: string }> {
  return request<{ message: string }>(
    `${getUrlBase(strategyName, symbol)}/templates/${encodeURIComponent(name)}`,
    "DELETE"
  );
}

export const tradeApis = {
  getTrades,
  saveTrade,
  deleteTrade,
  getTags,
  saveTag,
  deleteTag,
  getTemplates,
  saveTemplate,
  deleteTemplate,
};