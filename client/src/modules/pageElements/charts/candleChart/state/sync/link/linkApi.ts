import type { Link } from "./LinkData";

const BASE_URL = "/api/chartData/candleChart/sync/links";

export async function fetchLinks(): Promise<Link[]> {
  const res = await fetch(BASE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch links: ${res.statusText}`);
  }
  return res.json();
}

export async function saveLink(link: Link): Promise<{ id: number }> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(link),
  });
  if (!res.ok) {
    throw new Error(`Failed to save link: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteLink(id: number): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    if (res.status === 404) return false;
    throw new Error(`Failed to delete link: ${res.statusText}`);
  }
  return true;
}