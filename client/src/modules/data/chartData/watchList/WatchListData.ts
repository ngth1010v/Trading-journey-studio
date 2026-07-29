import {
  fetchWatchList,
  fetchWatchListStage,
  removeWatchListItem,
  setWatchListItem,
  extendWatchList,
} from "./watchListApi";

export interface TimeframeStage {
  fromTs: number;
  toTs: number;
}

export type WatchListStage = Record<"1S" | "1M" | "1H" | "1D", TimeframeStage>;


const REFRESH_DURATION = 500; // ms

export default class WatchListData {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private watchListCache: string[] = [];
  private stageCache: Map<string, WatchListStage> = new Map();
  private callbacks: Map<string, () => void> = new Map();
  private isFetching: boolean = false;

  public init(): void {
    if (this.timerId !== null) return;

    // Run initial fetch immediately
    void this.poll();

    this.timerId = setInterval(() => {
      void this.poll();
    }, REFRESH_DURATION);
  }

  public destroy(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.callbacks.clear();
    this.stageCache.clear();
  }

  public getAll(): string[] {
    return [...this.watchListCache];
  }

  public getStage(symbol: string): WatchListStage | undefined {
    return this.stageCache.get(symbol);
  }

  public async set(symbol: string, order: number = 0): Promise<void> {
    await setWatchListItem(symbol, order);
    await this.poll();
  }

  public async remove(symbol: string): Promise<void> {
    await removeWatchListItem(symbol);
    this.stageCache.delete(symbol);
    await this.poll();
  }

  public async extend(symbol: string, timestamp: number): Promise<void> {
    await extendWatchList(symbol, timestamp);
    // Optionally fetch updated stage for this symbol
    try {
      const stage = await fetchWatchListStage(symbol);
      this.stageCache.set(symbol, stage);
    } catch {
      // Ignore errors for stage fetch on extend
    }
  }

  public addOnWatchListDataChange(id: string, cb: () => void): void {
    this.callbacks.set(id, cb);
  }

  public removeOnWatchListDataChange(id: string): void {
    this.callbacks.delete(id);
  }

  private async poll(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const newList = await fetchWatchList();
      const isDifferent = this.hasListChanged(this.watchListCache, newList);

      if (isDifferent) {
        this.watchListCache = newList;
        this.notifyChange();
      }
    } catch (error) {
      // Handles network errors silently in loop
    } finally {
      this.isFetching = false;
    }
  }

  private hasListChanged(oldList: string[], newList: string[]): boolean {
    if (oldList.length !== newList.length) return true;
    for (let i = 0; i < oldList.length; i++) {
      if (oldList[i] !== newList[i]) return true;
    }
    return false;
  }

  private notifyChange(): void {
    this.callbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error in WatchListData listener callback:", err);
      }
    });
  }
}