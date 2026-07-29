import { request } from "../../../shared/apiClient";
import type { WatchListStage } from "./WatchListData";

const BASE_URL = "/api/chartData/candles/watchList";



interface ApiResponse<T> {
  status: string;
  data?: T;
  msg?: string;
  type?: string;
}

export async function fetchWatchList(): Promise<string[]> {
  const response = await request<ApiResponse<string[]>>(`${BASE_URL}/`);
  return response.data ?? [];
}

export async function setWatchListItem(
  symbol: string,
  order: number = 0,
): Promise<void> {
  await request<ApiResponse<void>>(`${BASE_URL}/`, {
    method: "POST",
    body: JSON.stringify({ symbol, order }),
  });
}

export async function removeWatchListItem(symbol: string): Promise<void> {
  await request<ApiResponse<void>>(
    `${BASE_URL}/${encodeURIComponent(symbol)}`,
    {
      method: "DELETE",
    },
  );
}

export async function extendWatchList(
  symbol: string,
  timestamp: number,
): Promise<void> {
  await request<ApiResponse<void>>(
    `${BASE_URL}/extend/${encodeURIComponent(symbol)}/${timestamp}`,
  );
}

export async function fetchWatchListStage(
  symbol: string,
): Promise<WatchListStage> {
  return await request<WatchListStage>(
    `${BASE_URL}/stage/${encodeURIComponent(symbol)}`,
  );
}