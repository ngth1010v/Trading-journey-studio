import { request } from "../../../shared/apiClient";
import type { Hotkey } from "./Hotkey";

const BASE_URL = "/api/chartData/hotkey";

/**
 * Fetches all hotkeys associated with a given chart type.
 */
export async function fetchHotkeysByChart(chartType: string): Promise<Hotkey[]> {
  return request<Hotkey[]>(`${BASE_URL}/${encodeURIComponent(chartType)}`);
}

/**
 * Creates or updates a hotkey on the server.
 */
export async function saveHotkey(hotkey: Hotkey): Promise<Hotkey> {
  return request<Hotkey>(`${BASE_URL}/`, {
    method: "POST",
    body: JSON.stringify(hotkey),
  });
}

/**
 * Deletes a hotkey by ID from the server.
 */
export async function deleteHotkey(id: number): Promise<void> {
  return request<void>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}