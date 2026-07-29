import type { RGB, RGBA } from "../../shared/type.js";
import { themeApi } from "./themeApi.js";

type BBF = { background: RGBA; border: RGBA; font: RGB };

export interface Theme {
    id?: number;
    name: string;
    selected: boolean;
    background: RGBA;

    // Panel
    panel: {
        primary1: BBF;
        primary2: BBF;
        normal1: BBF;
        normal2: BBF;
        danger: BBF;
        success: BBF;
        warning: BBF;
        disable: BBF;
    };

    // Button
    button: {
        primary1: BBF;
        primary2: BBF;
        normal1: BBF;
        normal2: BBF;
        danger: BBF;
        success: BBF;
        warning: BBF;
        disable: BBF;
    };

    // Chart
    chart: {
        grid: RGBA;
        crosshair: RGBA;
    };
}

export const DEFAULT_THEME: Theme = {
    name: "Default",
    selected: false,
    background: [10,10,10,1],

    // Panel
    panel: {
        primary1: { background: [32, 43, 67, 1], border: [82, 118, 175, 1], font: [238, 242, 248] },
        primary2: { background: [24, 32, 50, 1], border: [67, 96, 145, 1], font: [225, 231, 240] },
        normal1:  { background: [30, 33, 42, 1], border: [55, 60, 74, 1],   font: [235, 238, 242] },
        normal2:  { background: [22, 25, 32, 1], border: [42, 46, 58, 1],   font: [210, 216, 225] },
        danger:   { background: [58, 28, 34, 1], border: [180, 50, 50, 1],  font: [255, 100, 100] },
        success:  { background: [24, 50, 46, 1], border: [74, 145, 130, 1], font: [100, 255, 100] },
        warning:  { background: [24, 50, 46, 1], border: [74, 145, 130, 1], font: [255, 255, 100] },
        disable:  { background: [25, 27, 32, 1], border: [42, 45, 52, 1],   font: [115, 120, 128] },
    },

    // Button
    button: {
        primary1: { background: [72, 105, 160, 1], border: [98, 132, 188, 1],  font: [248, 249, 250] },
        primary2: { background: [120, 90, 150, 1], border: [145, 118, 175, 1], font: [248, 248, 250] },
        normal1:  { background: [38, 42, 52, 1],   border: [60, 66, 78, 1],    font: [235, 238, 242] },
        normal2:  { background: [28, 31, 38, 1],   border: [48, 52, 62, 1],    font: [215, 220, 228] },
        danger:   { background: [150, 70, 78, 1],  border: [175, 95, 104, 1],   font: [255, 100, 100] },
        success:  { background: [58, 130, 118, 1], border: [84, 156, 143, 1],  font: [100, 255, 100] },
        warning:  { background: [58, 130, 118, 1], border: [84, 156, 143, 1],  font: [255, 255, 100] },
        disable:  { background: [34, 36, 42, 1],   border: [50, 54, 62, 1],    font: [120, 124, 132] },
    },

    // Chart
    chart: {
        grid: [52, 56, 68, 0.35],
        crosshair: [112, 142, 190, 0.65],
    },
};

const REFRESH_DURATION = 1000; // 1s

export default class ThemeData {
    private cache: Theme[] = [];
    private refreshIntervalId: any = null;
    private lastSelectedId: number | string | undefined = undefined;

    private onThemeDataChangeListeners = new Map<string, () => void>();
    private onSelectedThemeDataChangeListeners = new Map<string, () => void>();

    async init(): Promise<void> {
        await this.refresh();
        this.notifyDataChange();
        this.checkAndNotifySelectedChange();

        this.refreshIntervalId = setInterval(async () => {
            try {
                await this.refresh();
                this.notifyDataChange();
                this.checkAndNotifySelectedChange();
            } catch (err) {
                console.error("Theme background refresh failed:", err);
            }
        }, REFRESH_DURATION);
    }

    private async refresh(): Promise<void> {
        this.cache = await themeApi.getAll();
    }

    getAll(): Theme[] {
        return this.cache;
    }

    getSelected(): Theme {
        const selected = this.cache.find((t) => t.selected);
        return selected || DEFAULT_THEME;
    }

    async set(theme: Theme): Promise<void> {
        const originalCache = JSON.stringify(this.cache);
        
        // Match rule: Client handles turning other themes to unselected locally
        if (theme.selected) {
            for (const cached of this.cache) {
                cached.selected = false;
            }
        }

        let isNew = theme.id === undefined;
        let index = -1;

        if (!isNew) {
            index = this.cache.findIndex((t) => t.id === theme.id);
        }

        if (index !== -1) {
            this.cache[index] = theme;
        } else {
            this.cache.push(theme);
        }

        this.notifyDataChange();
        this.checkAndNotifySelectedChange();

        try {
            const result = await themeApi.save(theme);
            if (isNew) {
                // If it was a new record, map the assigned identifier
                theme.id = result.id;
                this.notifyDataChange();
            }
        } catch (error) {
            // Roll back cache structure on network failure
            this.cache = JSON.parse(originalCache);
            this.notifyDataChange();
            this.checkAndNotifySelectedChange();
            throw error;
        }
    }

    async delete(themeId: number): Promise<void> {
        const index = this.cache.findIndex((t) => t.id === themeId);
        if (index === -1) {
            throw new Error(`Theme execution fallback triggered: Theme with ID ${themeId} does not exist in local cache.`);
        }

        const originalCache = JSON.stringify(this.cache);
        this.cache.splice(index, 1);
        
        this.notifyDataChange();
        this.checkAndNotifySelectedChange();

        try {
            await themeApi.delete(themeId);
        } catch (error) {
            this.cache = JSON.parse(originalCache);
            this.notifyDataChange();
            this.checkAndNotifySelectedChange();
            throw error;
        }
    }

    addOnThemeDataChange(id: string, cb: () => void): void {
        this.onThemeDataChangeListeners.set(id, cb);
    }

    removeOnThemeDataChange(id: string): void {
        this.onThemeDataChangeListeners.delete(id);
    }

    addOnSelectedThemeDataChange(id: string, cb: () => void): void {
        this.onSelectedThemeDataChangeListeners.set(id, cb);
    }

    removeOnSelectedThemeDataChange(id: string): void {
        this.onSelectedThemeDataChangeListeners.delete(id);
    }

    private notifyDataChange(): void {
        for (const listener of this.onThemeDataChangeListeners.values()) {
            listener();
        }
    }

    private checkAndNotifySelectedChange(): void {
        const currentSelected = this.cache.find((t) => t.selected);
        // Identify fallback states natively by tracking undefined values explicitly
        const currentSelectedId = currentSelected ? currentSelected.id : "FALLBACK_DEFAULT";

        if (currentSelectedId !== this.lastSelectedId) {
            this.lastSelectedId = currentSelectedId;
            for (const listener of this.onSelectedThemeDataChangeListeners.values()) {
                listener();
            }
        }
    }

    // Call this if destroying or removing data controllers from memory
    destroy(): void {
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
        }
        this.onThemeDataChangeListeners.clear();
        this.onSelectedThemeDataChangeListeners.clear();
    }
}