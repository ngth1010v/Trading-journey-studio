// client/src/shared/apis/marketsApi.ts

import type { Result } from "../../../../../shared/result";
import type {
  Ohlc,
  SymbolData,
} from '../shared/types';

const API_BASE = '/api/markets';

async function request<T>(url: string): Promise<Result<T>> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: {
          code: String(response.status),
          msg: response.statusText || 'Request failed',
        },
      };
    }

    const rawData = await response.json();

    // Kiểm tra xem dữ liệu trả về đã có sẵn định dạng Result { success, ... } hay chưa
    if (rawData && typeof rawData === 'object' && ('success' in rawData)) {
      return rawData as Result<T>;
    }

    // Nếu backend trả về trực tiếp mảng hoặc dữ liệu thô, ta bọc nó vào Result thành công
    return {
      success: true,
      data: rawData as T,
      error: null,
    };
    
  } catch (err) {
    return {
      success: false,
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        msg: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }
}

//======================================================================================================
// PUBLIC API
//======================================================================================================
/**
 * GET /api/markets/:symbol
 */
async function getSymbolData(
  symbol: string,
): Promise<Result<SymbolData>> {
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
): Promise<Result<Ohlc[]>> {
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
async function getLastOhlc(
  symbol: string,
): Promise<Result<Ohlc>> {
  return request<Ohlc>(
    `${API_BASE}/${encodeURIComponent(symbol)}/last`,
  );
}

/**
 * GET /api/markets/:symbol/extend?fromTs=...&type=back
 */
async function callExtendBack(
  symbol: string,
  fromTs: number,
): Promise<Result<null>> {
  const params = new URLSearchParams({
    fromTs: String(fromTs),
    type: 'back',
  });

  return request<null>(
    `${API_BASE}/${encodeURIComponent(symbol)}/extend?${params.toString()}`,
  );
}

/**
 * GET /api/markets/:symbol/extend/registerAuto
 */
async function registerAutoExtend(
  symbol: string,
): Promise<Result<null>> {
  return request<null>(
    `${API_BASE}/${encodeURIComponent(symbol)}/extend/registerAuto`,
  );
}

/**
 * GET /api/markets/:symbol/extend/unregisterAuto?key=...
 */
async function unregisterAutoExtend(
  symbol: string,
  key: number,
): Promise<Result<null>> {
  const params = new URLSearchParams({
    key: String(key),
  });

  return request<null>(
    `${API_BASE}/${encodeURIComponent(symbol)}/extend/unregisterAuto?${params.toString()}`,
  );
}

export const marketApi = {
    getSymbolData,
    getOhlcs,
    getLastOhlc,
    callExtendBack,
    registerAutoExtend,
    unregisterAutoExtend
}