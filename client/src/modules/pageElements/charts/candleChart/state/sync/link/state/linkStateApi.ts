import type { LinkState } from "./LinkStateData";

export async function fetchLinkState(id: number): Promise<LinkState | null> {
  const res = await fetch(`/api/chartData/candleChart/sync/links/${id}/state`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch link state: ${res.statusText}`);
  }
  const data = await res.json();
  return data.state ?? null;
}