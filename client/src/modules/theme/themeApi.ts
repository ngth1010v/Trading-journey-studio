import type { Theme, PartialTheme } from "./type";

const API_BASE = "/api/themes";

async function request<T>(url: string, method = "GET", body?: any): Promise<T> {
  try {
    const options: RequestInit = { method };
    if (body) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    const rawData = await response.json();

    if (rawData && typeof rawData === "object" && "success" in rawData) {
      const result = rawData as {
        success: boolean;
        data?: T;
        error?: string;
      };

      if (!result.success) {
        throw new Error(result.error ?? "Request failed");
      }

      return result.data as T;
    }

    return rawData as T;
  } catch (err) {
    throw err instanceof Error ? err : new Error("Unknown error occurred");
  }
}

async function getAllThemes(): Promise<Theme[]> {
  return request<Theme[]>(API_BASE);
}

// Added integration for fetching changed themes matching specific timestamp tracking marks
async function getChangedThemes(timestamp: number): Promise<string[]> {
  return request<string[]>(`${API_BASE}/changed/${timestamp}`);
}

async function saveTheme(name: string, theme: PartialTheme): Promise<Theme> {
  return request<Theme>(`${API_BASE}/${encodeURIComponent(name)}`, "POST", theme);
}

async function deleteTheme(name: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/${encodeURIComponent(name)}`, "DELETE");
}

export const themeApi = {
  getAllThemes,
  getChangedThemes,
  saveTheme,
  deleteTheme,
};