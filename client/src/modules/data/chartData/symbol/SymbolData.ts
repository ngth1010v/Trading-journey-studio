import { fetchSymbols } from "./symbolApi";

export interface Symbol {
  symbol: string;
  point: number;
  contractSize: number;
  currency: string;
}

const REFRESH_DURATION = 500; // ms

export default class SymbolData {
  private symbolsMap: Map<string, Symbol> = new Map();
  private initialized: boolean = false;
  private callbacks: Map<string, () => void> = new Map();
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed: boolean = false;

  /**
   * Initializes the controller by fetching all symbols from the server
   * and starting the recursive refresh loop.
   * If already initialized, this call returns early without starting duplicate loops.
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.isDestroyed = false;
      const symbols = await fetchSymbols();
      this.updateCache(symbols);

      this.initialized = true;
      this.scheduleNextRefresh();
    } catch (error) {
      this.initialized = false;
      throw new Error(`Failed to initialize SymbolData: ${(error as Error).message}`);
    }
  }

  /**
   * Registers a listener callback that gets invoked whenever symbol data changes.
   */
  public addOnSymbolDataChange(id: string, cb: () => void): void {
    this.callbacks.set(id, cb);
  }

  /**
   * Removes a previously registered callback by its ID.
   */
  public removeOnSymbolDataChange(id: string): void {
    this.callbacks.delete(id);
  }

  /**
   * Retrieves a single symbol by its symbol key.
   * Throws an error if called before `init()` completes successfully.
   */
  public get(symbol: string): Symbol | null {
    this.ensureInitialized();
    return this.symbolsMap.get(symbol) ?? null;
  }

  /**
   * Retrieves all loaded symbols.
   * Throws an error if called before `init()` completes successfully.
   */
  public getAll(): Symbol[] {
    this.ensureInitialized();
    return Array.from(this.symbolsMap.values());
  }

  /**
   * Cleans up all callback listeners, stops the background loop, and resets initialization status.
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.stopRefreshLoop();
    this.callbacks.clear();
    this.symbolsMap.clear();
    this.initialized = false;
  }

  /**
   * Recursively schedules the next refresh execution after completion.
   */
  private scheduleNextRefresh(): void {
    if (this.isDestroyed) return;

    this.refreshTimeoutId = setTimeout(async () => {
      await this.runRefreshLoop();
    }, REFRESH_DURATION);
  }

  /**
   * Background task that fetches data, checks for changes, updates cache, and handles errors.
   */
  private async runRefreshLoop(): Promise<void> {
    if (this.isDestroyed) return;

    try {
      const freshSymbols = await fetchSymbols();
      if (this.isDestroyed) return;

      const hasChanged = this.hasDataChanged(freshSymbols);

      if (hasChanged) {
        this.updateCache(freshSymbols);
        this.notifyChange();
      }

      this.scheduleNextRefresh();
    } catch (error) {
      // Option B chosen: stop loop on error
      console.error("SymbolData refresh loop stopped due to an error:", error);
      this.stopRefreshLoop();
    }
  }

  /**
   * Compares the current symbols map against incoming data using JSON serialization.
   */
  private hasDataChanged(freshSymbols: Symbol[]): boolean {
    const currentData = Array.from(this.symbolsMap.values());
    return JSON.stringify(currentData) !== JSON.stringify(freshSymbols);
  }

  /**
   * Populates local cache map with latest symbols.
   */
  private updateCache(symbols: Symbol[]): void {
    this.symbolsMap.clear();
    for (const item of symbols) {
      this.symbolsMap.set(item.symbol, {
        symbol: item.symbol,
        point: item.point,
        contractSize: item.contractSize,
        currency: item.currency,
      });
    }
  }

  /**
   * Notifies all registered callbacks of data changes.
   */
  private notifyChange(): void {
    this.callbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error executing onSymbolDataChange callback:", err);
      }
    });
  }

  /**
   * Clears the active timeout handle.
   */
  private stopRefreshLoop(): void {
    if (this.refreshTimeoutId !== null) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }
  }

  /**
   * Ensures that data is loaded before allowing access.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SymbolData is not initialized. Please call and await `init()` first.");
    }
  }
}

export { REFRESH_DURATION };