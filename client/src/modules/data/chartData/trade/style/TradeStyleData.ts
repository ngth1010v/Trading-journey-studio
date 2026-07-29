import type { RGB, RGBA } from "../../../../shared/type";
import { fetchTradeStyle, saveTradeStyle } from "./tradeStyleApi";

export interface TradeStyle {
  profit: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
  loss: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
  text: {
    order: "Profit&loss - RR" | "RR - Profit&Loss";
    alwayShow: "RR" | "Profit&Loss" | "RR - Profit&Loss" | "None";
    profitLossSize: number;
    rrSize: number;
    alignX: "left" | "right";
    alignY: "top" | "bottom";
  };
}

export const DefaultTradeStyle: TradeStyle = {
  profit: {
    font: [100, 100, 255] as RGB,
    background: [100, 100, 255, 100] as RGBA,
    border: [100, 100, 255, 255] as RGBA,
  },
  loss: {
    font: [255, 100, 100] as RGB,
    background: [255, 100, 100, 100] as RGBA,
    border: [255, 100, 100, 255] as RGBA,
  },
  text: {
    order: "RR - Profit&Loss",
    alwayShow: "None",
    profitLossSize: 12,
    rrSize: 12,
    alignX: "left",
    alignY: "top",
  },
};

const REFRESH_DURATION = 500; // ms

export default class TradeStyleData {
  private isInitialized = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentStyle: TradeStyle = DefaultTradeStyle;
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
  }

  private checkInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("TradeStyleData is not initialized. Call init() first.");
    }
  }

  public get(): TradeStyle | null {
    this.checkInitialized();
    return this.currentStyle ?? DefaultTradeStyle;
  }

  public async set(tradeStyle: TradeStyle): Promise<void> {
    await saveTradeStyle(tradeStyle);
    // Refresh loop will automatically update local cache
  }

  public addOnTradeStyleDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  public removeOnTradeStyleDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async refreshData(): Promise<void> {
    try {
      const style = await fetchTradeStyle();
      this.currentStyle = style || DefaultTradeStyle;
      this.notifyListeners();
    } catch (error) {
      console.error("Failed to refresh TradeStyleData:", error);
    }
  }

  private notifyListeners(): void {
    for (const callback of this.listeners.values()) {
      callback();
    }
  }
}