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
    background: [10, 10, 10, 1],

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

// ============================================================================
// GLOBAL STATE & LOOP
// ============================================================================

interface MainTrigger {
    triggerThemeDataChange: () => void;
    triggerSelectedThemeDataChange: () => void;
}

let isThemeInitialized = false;
let globalRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
let themesCache: Theme[] = [];

// Cache tracking variables for change detection
let previousThemesJson = "";
let previousSelectedId: number | string | undefined = undefined;

const themeDataCallbackMap = new Map<string, MainTrigger>();

async function executeGlobalRefresh(): Promise<void> {
    try {
        const freshThemes = await themeApi.getAll();
        const freshJson = JSON.stringify(freshThemes);

        const hasDataChanged = freshJson !== previousThemesJson;

        const currentSelected = freshThemes.find((t) => t.selected);
        const currentSelectedId = currentSelected ? currentSelected.id : "FALLBACK_DEFAULT";
        const hasSelectedChanged = currentSelectedId !== previousSelectedId;

        // Update shared global cache
        themesCache = freshThemes;
        previousThemesJson = freshJson;
        previousSelectedId = currentSelectedId;

        // Notify registered ThemeData main triggers
        if (hasDataChanged || hasSelectedChanged) {
            for (const { triggerThemeDataChange, triggerSelectedThemeDataChange } of themeDataCallbackMap.values()) {
                if (hasDataChanged) {
                    triggerThemeDataChange();
                }
                if (hasSelectedChanged) {
                    triggerSelectedThemeDataChange();
                }
            }
        }
    } catch (err) {
        console.error("Global theme refresh failed:", err);
    }
}

export function initTheme(): void {
    if (isThemeInitialized) {
        return;
    }
    isThemeInitialized = true;

    // Run initial fetch tick
    executeGlobalRefresh();

    // Start background refresh loop
    globalRefreshIntervalId = setInterval(executeGlobalRefresh, REFRESH_DURATION);
}

export function destroyTheme(): void {
    if (!isThemeInitialized) {
        return;
    }

    if (globalRefreshIntervalId !== null) {
        clearInterval(globalRefreshIntervalId);
        globalRefreshIntervalId = null;
    }

    themeDataCallbackMap.clear();
    themesCache = [];
    previousThemesJson = "";
    previousSelectedId = undefined;
    isThemeInitialized = false;
}

// ============================================================================
// THEMEDATA CLASS
// ============================================================================

export default class ThemeData {
    public id: string | null = null;

    private onThemeDataChangeListeners = new Map<string, () => void>();
    private onSelectedThemeDataChangeListeners = new Map<string, () => void>();

    public init(): void {
        if (this.id !== null) {
            return; // Prevent duplicate initialization
        }

        this.id = `theme_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

        // Register main triggers into global map
        themeDataCallbackMap.set(this.id, {
            triggerThemeDataChange: () => this.notifyDataChange(),
            triggerSelectedThemeDataChange: () => this.notifySelectedChange(),
        });
    }

    public getAll(): Theme[] {
        return themesCache;
    }

    public getSelected(): Theme {
        const selected = themesCache.find((t) => t.selected);
        return selected || DEFAULT_THEME;
    }

    public async set(theme: Theme): Promise<void> {
        // Send directly to server; global refresh loop handles cache & notification updates
        await themeApi.save(theme);
    }

    public async delete(themeId: number): Promise<void> {
        // Send directly to server; global refresh loop handles cache & notification updates
        await themeApi.delete(themeId);
    }

    public addOnThemeDataChange(id: string, cb: () => void): void {
        this.onThemeDataChangeListeners.set(id, cb);

        // Trigger immediately if initial data is already available
        if (themesCache.length) {
            cb();
        }
    }

    public removeOnThemeDataChange(id: string): void {
        if (!this.onThemeDataChangeListeners.has(id)) {
            console.warn(`[ThemeData] Listener ID '${id}' not found in onThemeDataChange listeners.`);
            return;
        }
        this.onThemeDataChangeListeners.delete(id);
    }

    public addOnSelectedThemeDataChange(id: string, cb: () => void): void {
        this.onSelectedThemeDataChangeListeners.set(id, cb);
        cb(); 
    }

    public removeOnSelectedThemeDataChange(id: string): void {
        if (!this.onSelectedThemeDataChangeListeners.has(id)) {
            console.warn(`[ThemeData] Listener ID '${id}' not found in onSelectedThemeDataChange listeners.`);
            return;
        }
        this.onSelectedThemeDataChangeListeners.delete(id);
    }

    private notifyDataChange(): void {
        for (const listener of this.onThemeDataChangeListeners.values()) {
            listener();
        }
    }

    private notifySelectedChange(): void {
        for (const listener of this.onSelectedThemeDataChangeListeners.values()) {
            listener();
        }
    }

    public destroy(): void {
        if (this.id !== null) {
            themeDataCallbackMap.delete(this.id);
            this.id = null;
        }
        this.onThemeDataChangeListeners.clear();
        this.onSelectedThemeDataChangeListeners.clear();
    }
}