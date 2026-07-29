import { request } from "../../../../../../shared/apiClient";
import type { BinCandles, Candle } from "./CandleData";

const BASE_URL = "/api/chartData/candles";

/**
 * Parses binary OHLC data returned from /bin endpoint.
 * Protocol Layout:
 * - 8 bytes (Int64): count (N candles)
 * - N * 8 bytes: t (Float64Array)
 * - N * 8 bytes: o (Float64Array)
 * - N * 8 bytes: h (Float64Array)
 * - N * 8 bytes: l (Float64Array)
 * - N * 8 bytes: c (Float64Array)
 * - N * 8 bytes: v (Float64Array)
 */
export function parseBinCandles(buffer: ArrayBuffer): BinCandles {
  const dataView = new DataView(buffer);
  
  // Read count (BigInt64 little-endian)
  const countBig = dataView.getBigInt64(0, true);
  const count = Number(countBig);

  const headerOffset = 8;
  const bytesPerArray = count * Float64Array.BYTES_PER_ELEMENT;

  // Extract individual contiguous TypedArrays
  const t = new Float64Array(buffer.slice(headerOffset, headerOffset + bytesPerArray));
  const o = new Float64Array(buffer.slice(headerOffset + bytesPerArray, headerOffset + 2 * bytesPerArray));
  const h = new Float64Array(buffer.slice(headerOffset + 2 * bytesPerArray, headerOffset + 3 * bytesPerArray));
  const l = new Float64Array(buffer.slice(headerOffset + 3 * bytesPerArray, headerOffset + 4 * bytesPerArray));
  const c = new Float64Array(buffer.slice(headerOffset + 4 * bytesPerArray, headerOffset + 5 * bytesPerArray));
  const v = new Float64Array(buffer.slice(headerOffset + 5 * bytesPerArray, headerOffset + 6 * bytesPerArray));

  return { t, o, h, l, c, v };
}

/**
 * Fetches closed candles in binary format.
 */
export async function fetchClosedCandlesBin(
  symbol: string,
  timeframe: string,
  fromTs: number,
  toTs: number
): Promise<BinCandles> {
  const url = `${BASE_URL}/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}/bin?fromTs=${fromTs}&toTs=${toTs}`;
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/octet-stream",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch binary candles (${response.status}): ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return parseBinCandles(arrayBuffer);
}

/**
 * Fetches the current opening candle via JSON.
 */
export async function fetchOpeningCandle(
  symbol: string,
  timeframe: string
): Promise<Candle | null> {
  const url = `${BASE_URL}/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}/last`;
  
  const rawData = await request<Candle | Candle[] | Record<string, unknown>>(url);
  
  if (!rawData || (Array.isArray(rawData) && rawData.length === 0)) {
    return null;
  }

  if (Array.isArray(rawData)) {
    return rawData[0] as Candle;
  }

  return rawData as unknown as Candle;
}