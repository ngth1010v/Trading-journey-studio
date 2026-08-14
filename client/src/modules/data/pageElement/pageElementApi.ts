import { request } from "../../shared/apiClient";
import type { PageElement } from "./PageElementData";

const BASE_URL = "/api/pageElements";

/**
 * Fetches all available page elements from the server.
 */
export async function fetchPageElements(): Promise<PageElement[]> {
  return await request<PageElement[]>(BASE_URL);
}

/**
 * Creates or updates a page element on the server.
 */
export async function savePageElement(pageElement: PageElement): Promise<{ id: number }> {
  return await request<{ id: number }>(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pageElement),
  });
}

/**
 * Deletes a page element from the server by ID.
 */
export async function deletePageElement(id: number): Promise<{ message: string }> {
  return await request<{ message: string }>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}