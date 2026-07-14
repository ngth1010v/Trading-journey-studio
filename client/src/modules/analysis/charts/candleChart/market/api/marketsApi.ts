import type { Ohlc, SymbolData } from "../type";

const API_BASE = "/api/markets";

async function request<T>(url: string): Promise<T> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(response.statusText || "Request failed");
    }

    const rawData = await response.json();

    if (rawData && typeof rawData === "object" && "success" in rawData) {
      const result = rawData as {
        success: boolean;
        data?: T;
        error?: { code?: string; msg?: string };
      };

      if (!result.success) {
        throw new Error(
          result.error?.msg ?? "Request failed",
        );
      }

      return result.data as T;
    }

    return rawData as T;
  } catch (err) {
    throw new Error(
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
      throw new Error(response.statusText || "Request failed");
    }

    return await response.arrayBuffer();
  } catch (err) {
    throw new Error(
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
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
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

  const t = new Float64Array(buffer, offset, count);
  offset += bytes;

  const o = new Float64Array(buffer, offset, count);
  offset += bytes;

  const h = new Float64Array(buffer, offset, count);
  offset += bytes;

  const l = new Float64Array(buffer, offset, count);
  offset += bytes;

  const c = new Float64Array(buffer, offset, count);
  offset += bytes;

  const v = new Float64Array(buffer, offset, count);

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