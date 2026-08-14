import { request } from "../../../shared/apiClient";

const BASE_URL = "/api/pageElements";

/**
 * Fetches the configuration for a specific page element from the server.
 */
export async function fetchPageElementConfig(pageElementId: number): Promise<any> {
  return await request<any>(`${BASE_URL}/${pageElementId}/config`);
}

/**
 * Updates/flushes the configuration for a specific page element on the server.
 */
export async function updatePageElementConfig(
  pageElementId: number,
  config: any
): Promise<{ message: string }> {
  return await request<{ message: string }>(`${BASE_URL}/${pageElementId}/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });
}