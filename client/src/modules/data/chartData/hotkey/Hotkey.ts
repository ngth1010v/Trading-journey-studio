import { fetchHotkeysByChart, saveHotkey, deleteHotkey } from "./hotkeyApi";

export interface Hotkey {
  id?: number;
  chartType: string;
  keys: string[]; // Stored as a JSON string in SQLite
  actions: string[]; // Stored as a JSON string in SQLite
}

const REFRESH_DURATION = 500; // ms

export default class HotkeyData {
  private cache: Hotkey[] = [];
  private listeners: Map<string, () => void> = new Map();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private isFetching = false;
  private chartType: string = "";

  /**
   * Starts the automatic refresh loop for a specific chart type.
   */
  public init(chartType: string): void {
    this.chartType = chartType;

    if (this.timerId !== null) {
      this.destroy();
    }

    // Initial fetch
    void this.refresh();

    // Start background poll interval
    this.timerId = setInterval(() => {
      void this.refresh();
    }, REFRESH_DURATION);
  }

  /**
   * Stops the refresh loop and cleans up state.
   */
  public destroy(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isFetching = false;
  }

  /**
   * Returns a copy of all hotkeys currently stored in the local cache.
   */
  public getAll(): Hotkey[] {
    return [...this.cache];
  }

  /**
   * Returns a specific hotkey by ID from the local cache.
   * Throws an error if not found.
   */
  public get(id: number): Hotkey {
    const hotkey = this.cache.find((h) => h.id === id);
    if (!hotkey) {
      throw new Error(`Hotkey with id ${id} not found`);
    }
    return { ...hotkey };
  }

  /**
   * Saves a hotkey to the server.
   * Updates are processed on the server; local cache is updated on the next refresh loop.
   */
  public async set(hotkey: Hotkey): Promise<Hotkey> {
    return saveHotkey(hotkey);
  }

  /**
   * Deletes a hotkey by ID from the server.
   * Updates are processed on the server; local cache is updated on the next refresh loop.
   */
  public async remove(id: number): Promise<void> {
    return deleteHotkey(id);
  }

  /**
   * Registers a callback listener to be triggered when data changes during the refresh loop.
   */
  public addOnHotkeyDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  /**
   * Removes a callback listener by ID.
   */
  public removeOnHotkeyDataChange(id: string): void {
    this.listeners.delete(id);
  }

  /**
   * Internal method executed periodically to poll server updates.
   */
  private async refresh(): Promise<void> {
    if (this.isFetching || !this.chartType) {
      return;
    }

    this.isFetching = true;

    try {
      const freshData = await fetchHotkeysByChart(this.chartType);

      if (this.hasChanged(freshData)) {
        this.cache = freshData;
        this.notifyListeners();
      }
    } catch {
      // Intentionally suppress polling errors to avoid interrupting the loop
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Checks whether incoming server data differs from local cache.
   */
  private hasChanged(newData: Hotkey[]): boolean {
    if (newData.length !== this.cache.length) {
      return true;
    }

    return JSON.stringify(newData) !== JSON.stringify(this.cache);
  }

  /**
   * Invokes all registered change listeners.
   */
  private notifyListeners(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error executing HotkeyData change listener:", err);
      }
    });
  }
}