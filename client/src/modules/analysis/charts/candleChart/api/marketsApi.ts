import { throwAppError } from "../../../../../shared/appError";
import type {
  Ohlc,
  SymbolData,
} from "../shared/types";

const API_BASE = "/api/markets";

async function request<T>(url: string): Promise<T> {
  try {
    const response = await fetch(url);

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

/**
 * GET /api/markets/:symbol
 */
async function getSymbolData(symbol: string): Promise<SymbolData> {
  return request<SymbolData>(
    `${API_BASE}/${encodeURIComponent(symbol)}`,
  );
}

/**
 * GET /api/markets/:symbol/:timeframe?fromTs=...&toTs=...
 */
async function getOhlcs(
  symbol: string,
  timeframe: string,
  fromTs: number,
  toTs: number,
): Promise<Ohlc[]> {
  const params = new URLSearchParams({
    fromTs: String(fromTs),
    toTs: String(toTs),
  });

  return request<Ohlc[]>(
    `${API_BASE}/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}?${params.toString()}`,
  );
}

/**
 * GET /api/markets/:symbol/last
 */
async function getLastOhlc(symbol: string, timeframe: string): Promise<Ohlc> {
  return request<Ohlc>(
    `${API_BASE}/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}/last`,
  );
}

/**
 * GET /api/markets/:symbol/last
 */
async function getFirstOhlc(symbol: string, timeframe: string): Promise<Ohlc> {
  return request<Ohlc>(
    `${API_BASE}/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}/first`,
  );
}

/**
 * GET /api/markets/:symbol/extend?fromTs=...&type=back
 */
async function callExtendBack(
  symbol: string,
  fromTs: number,
): Promise<void> {
  const params = new URLSearchParams({
    fromTs: String(fromTs),
    type: "back",
  });

  await request<unknown>(
    `${API_BASE}/${encodeURIComponent(symbol)}/extend?${params.toString()}`,
  );
}

/**
 * GET /api/markets/:symbol/extend/registerAuto
 */
async function registerAutoExtend(
  symbol: string,
): Promise<{ key?: number } | null> {
  return request<{ key?: number } | null>(
    `${API_BASE}/${encodeURIComponent(symbol)}/extend/registerAuto`,
  );
}

/**
 * GET /api/markets/:symbol/extend/unregisterAuto?key=...
 */
async function unregisterAutoExtend(
  symbol: string,
  key: number,
): Promise<void> {
  const params = new URLSearchParams({
    key: String(key),
  });

  await request<unknown>(
    `${API_BASE}/${encodeURIComponent(symbol)}/extend/unregisterAuto?${params.toString()}`,
  );
}

export const marketApi = {
  getSymbolData,
  getOhlcs,
  getLastOhlc,
  getFirstOhlc,
  callExtendBack,
  registerAutoExtend,
  unregisterAutoExtend,
};
