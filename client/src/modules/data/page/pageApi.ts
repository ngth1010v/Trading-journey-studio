import { request } from "../../shared/apiClient";

const BASE_URL = "/api/pages";

export async function registerPageApi(): Promise<{ key: string }> {
  return request<{ key: string }>(`${BASE_URL}/registry`);
}

export async function unregisterPageApi(key: string): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE_URL}/unregistry/${key}`);
}

export async function flushServerApi(): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE_URL}/flush`);
}