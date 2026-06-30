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
async function requestBinary(url: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });

    if (!response.ok) {
      throwAppError(
        String(response.status),
        response.statusText || "Request failed",
      );
    }

    return await response.arrayBuffer();
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



//================================================================================================
// PUBLIC
//================================================================================================
/**
 * GET /api/markets/
 */
async function getSymbols(): Promise<string[]> {
  return request<string[]>(`${API_BASE}/`);
}

/**
 * GET /api/markets/:symbol
 */
async function getSymbol(symbol: string): Promise<SymbolData> {
  return request<SymbolData>(
    `${API_BASE}/${encodeURIComponent(symbol)}`,
  );
}

/**
 * GET /api/markets/:symbol/:timeframe/bin?fromTs=...&toTs=...
 */
async function getRange(
  symbol: string,
  timeframe: string,
  fromTs: number,
  toTs: number,
): Promise<{
  t: BigInt64Array;
  o: BigInt64Array;
  h: BigInt64Array;
  l: BigInt64Array;
  c: BigInt64Array;
  v: BigInt64Array;
}> {
  const params = new URLSearchParams({
    fromTs: String(fromTs),
    toTs: String(toTs),
  });

  const buffer = await requestBinary(
    `${API_BASE}/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}/bin?${params}`,
  );

  const count = Number(new DataView(buffer).getBigInt64(0, true));

  let offset = 8;
  const bytes = count * 8;

  const t = new BigInt64Array(buffer, offset, count);
  offset += bytes;

  const o = new BigInt64Array(buffer, offset, count);
  offset += bytes;

  const h = new BigInt64Array(buffer, offset, count);
  offset += bytes;

  const l = new BigInt64Array(buffer, offset, count);
  offset += bytes;

  const c = new BigInt64Array(buffer, offset, count);
  offset += bytes;

  const v = new BigInt64Array(buffer, offset, count);

  return { t, o, h, l, c, v };
}


/**
 * GET /api/markets/:symbol/:timeframe/last
 */
async function getLast(
  symbol: string,
  timeframe: string,
): Promise<Ohlc> {
  return request<Ohlc>(
    `${API_BASE}/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}/last`,
  );
}

/**
 * GET /api/markets/:symbol/extend/:timestamp
 */
async function callExtend(
  symbol: string,
  timestamp: number,
): Promise<void> {
  await request<unknown>(
    `${API_BASE}/${encodeURIComponent(symbol)}/extend/${timestamp}`,
  );
}

export const marketApi = {
  getSymbols,
  getSymbol,
  getRange,
  getLast,
  callExtend,
};