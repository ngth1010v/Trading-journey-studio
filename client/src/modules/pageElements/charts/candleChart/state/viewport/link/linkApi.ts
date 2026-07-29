import { request } from "../../../../../../shared/apiClient";
import { type Link } from "./LinkData";

const BASE_URL = "/api/chartData/candleChart/links";

export async function fetchAllLinks(): Promise<Link[]> {
  return request<Link[]>(BASE_URL);
}

export async function saveLink(link: Link): Promise<{ id: number }> {
  return request<{ id: number }>(BASE_URL, {
    method: "POST",
    body: JSON.stringify(link),
  });
}

export async function removeLink(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}