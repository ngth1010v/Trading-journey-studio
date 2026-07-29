import { request } from "../../shared/apiClient";
import type { Theme } from "./ThemeData";

interface ServerEnvelope<T> {
    success: boolean;
    data: T;
    error?: string;
}

interface SaveResponse {
    id: number;
}

export const themeApi = {
    async getAll(): Promise<Theme[]> {
        const res = await request<ServerEnvelope<Theme[]>>("/api/themes", {
            method: "GET",
        });
        return res.data;
    },

    async save(theme: Theme): Promise<SaveResponse> {
        return await request<SaveResponse>("/api/themes", {
            method: "POST",
            body: JSON.stringify(theme),
        });
    },

    async delete(themeId: number): Promise<void> {
        await request<{ success: boolean; message?: string }>(`/api/themes/${themeId}`, {
            method: "DELETE",
        });
    },
};