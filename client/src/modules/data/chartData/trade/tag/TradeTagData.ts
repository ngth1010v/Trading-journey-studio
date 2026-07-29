import type { RGB, RGBA } from "../../../../shared/type";
import {
  fetchAllTradeTags,
  saveTradeTag,
  deleteTradeTag,
} from "./tradeTagApi";

export interface TradeTag {
  id?: number;
  name: string;
  desc: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

const REFRESH_DURATION = 500; // ms

export default class TradeTagData {
  private isInitialized = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tagsMap: Map<number, TradeTag> = new Map();
  private listeners: Map<string, () => void> = new Map();

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.refreshData();
    this.intervalId = setInterval(() => {
      this.refreshData();
    }, REFRESH_DURATION);
  }

  public destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isInitialized = false;
    this.tagsMap.clear();
  }

  private checkInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("TradeTagData is not initialized. Call init() first.");
    }
  }

  public get(id: number): TradeTag | null {
    this.checkInitialized();
    return this.tagsMap.get(id) ?? null;
  }

  public getAll(): TradeTag[] {
    this.checkInitialized();
    return Array.from(this.tagsMap.values());
  }

  public async set(tradeTag: TradeTag): Promise<void> {
    await saveTradeTag(tradeTag);
    // Refresh loop will automatically pull updated data from the server
  }

  public async remove(id: number): Promise<void> {
    await deleteTradeTag(id);
    // Refresh loop will automatically pull updated data from the server
  }

  public addOnTradeTagDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  public removeOnTradeTagDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async refreshData(): Promise<void> {
    try {
      const tags = await fetchAllTradeTags();
      this.tagsMap.clear();
      for (const tag of tags) {
        if (tag.id !== undefined) {
          this.tagsMap.set(tag.id, tag);
        }
      }
      this.notifyListeners();
    } catch (error) {
      console.error("Failed to refresh TradeTagData:", error);
    }
  }

  private notifyListeners(): void {
    for (const callback of this.listeners.values()) {
      callback();
    }
  }
}