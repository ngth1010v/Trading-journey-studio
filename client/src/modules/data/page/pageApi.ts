import { request } from "../../shared/apiClient";
import type { Page } from "./PageData";

const BASE_URL = "/api/pages";

export async function fetchAllPages(): Promise<Page[]> {
  return request<Page[]>(BASE_URL);
}

export async function fetchPageById(id: number): Promise<Page> {
  return request<Page>(`${BASE_URL}/${id}`);
}

export async function savePageApi(page: Page): Promise<Page> {
  return request<Page>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(page),
  });
}

export async function deletePageApi(id: number): Promise<void> {
  return request<{ message: string }>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  }).then(() => undefined);
}