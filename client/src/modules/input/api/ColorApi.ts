import type { RGBA } from "../../../shared/types/color.type";

export interface DbColor {
    id: number;
    color: RGBA;
}

const API_BASE = "/api/colors";

async function request<T>(
    url: string,
    method = "GET",
    body?: any
): Promise<T> {
    try {
        const options: RequestInit = { method };

        if (body !== undefined) {
            options.headers = {
                "Content-Type": "application/json",
            };
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(
                `Request failed with status ${response.status}: ${response.statusText}`
            );
        }

        const rawData = await response.json();

        if (
            rawData &&
            typeof rawData === "object" &&
            "success" in rawData
        ) {
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
        throw err instanceof Error
            ? err
            : new Error("Unknown error occurred");
    }
}

async function getAll(): Promise<DbColor[]> {
    return request<DbColor[]>(API_BASE);
}

async function save(
    color: RGBA,
    id?: number
): Promise<{ success: boolean; id: number }> {
    return request<{ success: boolean; id: number }>(
        API_BASE,
        "POST",
        { color, id }
    );
}

async function remove(id: number): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(
        `${API_BASE}/${id}`,
        "DELETE"
    );
}

export const colorApi = {
    getAll,
    save,
    delete: remove,
};