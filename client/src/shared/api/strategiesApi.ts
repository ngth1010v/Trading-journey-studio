import { throwAppError } from "../appError";
import type { Strategy, StrategyTag } from "../types/strategies.type"; // Điều chỉnh đường dẫn import type cho đúng thực tế của bạn

const API_BASE = "/api/strategies";

async function request<T>(url: string, method = "GET", body?: any): Promise<T> {
  try {
    const options: RequestInit = { method };
    if (body) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throwAppError(
        String(response.status),
        response.statusText || "Request failed",
      );
    }

    const rawData = await response.json();

    if (rawData && typeof rawData === "object" && "success" in rawData) {
      const result = rawData as {
        success: boolean;
        data?: T;
        error?: { code?: string; msg?: string };
      };

      if (!result.success) {
        throwAppError(
          result.error?.code ?? "REQUEST_FAILED",
          result.error?.msg ?? "Request failed",
        );
      }

      return result.data as T;
    }

    return rawData as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AppError") {
      throw err;
    }

    throwAppError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}

//================================================================================================
// PUBLIC API
//================================================================================================

/**
 * GET /api/strategies -> Lấy toàn bộ danh sách strategies
 */
async function getAllStrategies(): Promise<Strategy[]> {
  return request<Strategy[]>(API_BASE);
}

/**
 * GET /api/strategies/tags -> Lấy toàn bộ danh sách strategy tags
 */
async function getAllTags(): Promise<StrategyTag[]> {
  return request<StrategyTag[]>(`${API_BASE}/tags`);
}

/**
 * POST /api/strategies -> Tạo hoặc cập nhật một strategy
 */
async function saveStrategy(strategy: Strategy): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(API_BASE, "POST", strategy);
}

/**
 * POST /api/strategies/tags -> Tạo hoặc cập nhật một tag
 */
async function saveTag(tag: StrategyTag): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/tags`, "POST", tag);
}

/**
 * DELETE /api/strategies/:name -> Xóa một strategy theo tên
 */
async function deleteStrategy(name: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `${API_BASE}/${encodeURIComponent(name)}`,
    "DELETE"
  );
}

/**
 * DELETE /api/strategies/tags/:name -> Xóa một tag theo tên
 */
async function deleteTag(name: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `${API_BASE}/tags/${encodeURIComponent(name)}`,
    "DELETE"
  );
}

export const strategiesApi = {
  getAllStrategies,
  getAllTags,
  saveStrategy,
  saveTag,
  deleteStrategy,
  deleteTag,
};