import { fetchSymbols, updateSymbol } from "./symbolApi.js";

export interface Symbol {
    symbol: string;
    point: number;
    contractSize: number;
    currency: string;
    watching: boolean;
}

export const REFRESH_DURATION = 500; // 500ms

// ============================================================================
// GLOBAL STATE & LOOP
// ============================================================================

interface MainTrigger {
    triggerSymbolDataChange: () => void;
}

let isSymbolInitialized = false;
let globalRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
let symbolsCacheMap: Map<string, Symbol> = new Map();

// Cache tracking variable for change detection
let previousSymbolsJson = "";

const symbolDataCallbackMap = new Map<string, MainTrigger>();

async function executeGlobalRefresh(): Promise<void> {
    try {
        const freshSymbols = await fetchSymbols();
        const freshJson = JSON.stringify(freshSymbols);

        const hasDataChanged = freshJson !== previousSymbolsJson;

        // Update shared global cache map
        const newMap = new Map<string, Symbol>();
        for (const item of freshSymbols) {
            newMap.set(item.symbol, {
                symbol: item.symbol,
                point: item.point,
                contractSize: item.contractSize,
                currency: item.currency,
                watching: item.watching,
            });
        }

        symbolsCacheMap = newMap;
        previousSymbolsJson = freshJson;

        // Notify registered SymbolData main triggers
        if (hasDataChanged) {
            for (const { triggerSymbolDataChange } of symbolDataCallbackMap.values()) {
                triggerSymbolDataChange();
            }
        }
    } catch (err) {
        console.error("Global symbol refresh failed:", err);
    }
}

export function initSymbol(): void {
    if (isSymbolInitialized) {
        return;
    }
    isSymbolInitialized = true;

    // Run initial fetch tick
    executeGlobalRefresh();

    // Start background refresh loop
    globalRefreshIntervalId = setInterval(executeGlobalRefresh, REFRESH_DURATION);
}

export function destroySymbol(): void {
    if (!isSymbolInitialized) {
        return;
    }

    if (globalRefreshIntervalId !== null) {
        clearInterval(globalRefreshIntervalId);
        globalRefreshIntervalId = null;
    }

    symbolDataCallbackMap.clear();
    symbolsCacheMap.clear();
    previousSymbolsJson = "";
    isSymbolInitialized = false;
}

// ============================================================================
// SYMBOLDATA CLASS
// ============================================================================

export default class SymbolData {
    public id: string | null = null;

    private onSymbolDataChangeListeners = new Map<string, () => void>();

    public init(): void {
        if (this.id !== null) {
            return; // Prevent duplicate initialization
        }

        this.id = `symbol_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

        // Register main trigger into global map
        symbolDataCallbackMap.set(this.id, {
            triggerSymbolDataChange: () => this.notifyDataChange(),
        });
    }

    public get(symbol: string): Symbol | null {
        return symbolsCacheMap.get(symbol) ?? null;
    }

    public getAll(): Symbol[] {
        return Array.from(symbolsCacheMap.values());
    }

    public async setWatching(symbol: string, watching: boolean): Promise<boolean> {
        try {
            await updateSymbol(symbol, watching);
            // Optimistically update local cache
            const target = symbolsCacheMap.get(symbol);
            if (target) {
                target.watching = watching;
                this.notifyDataChange();
            }
            return true;
        } catch (err) {
            console.error(`Failed to set watching status for symbol ${symbol}:`, err);
            return false;
        }
    }

    public addOnSymbolDataChange(id: string, cb: () => void): void {
        this.onSymbolDataChangeListeners.set(id, cb);
    }

    public removeOnSymbolDataChange(id: string): void {
        if (!this.onSymbolDataChangeListeners.has(id)) {
            console.warn(`[SymbolData] Listener ID '${id}' not found in onSymbolDataChange listeners.`);
            return;
        }
        this.onSymbolDataChangeListeners.delete(id);
    }

    private notifyDataChange(): void {
        for (const listener of this.onSymbolDataChangeListeners.values()) {
            try {
                listener();
            } catch (err) {
                console.error("Error executing onSymbolDataChange callback:", err);
            }
        }
    }

    public destroy(): void {
        if (this.id !== null) {
            symbolDataCallbackMap.delete(this.id);
            this.id = null;
        }
        this.onSymbolDataChangeListeners.clear();
    }
}