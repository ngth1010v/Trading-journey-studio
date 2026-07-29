import { request } from "../../../../../../../shared/apiClient";
import type { LinkState } from "./LinkStateData";

const BASE_URL = "/api/chartData/candleChart/links";

export async function fetchLinkState(linkId: number): Promise<LinkState> {
  return request<LinkState>(`${BASE_URL}/${linkId}/state`);
}

export async function saveLinkState(
  linkId: number,
  state: LinkState,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${BASE_URL}/${linkId}/state`, {
    method: "POST",
    body: JSON.stringify(state),
  });
}