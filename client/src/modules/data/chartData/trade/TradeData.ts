import {
  fetchTrades,
  fetchLastChangeTimestamp,
  saveTrade,
  deleteTrade,
} from "./tradeApi";
import TradeTagData from "./tag/TradeTagData";
import TradeStyleData from "./style/TradeStyleData";

export interface Trade {
  id?: number;
  type: "long" | "short";
  symbol: string;
  strategyId: number;
  tagIds: number[];

  data: {
    openTimestamp: number;
    closeTimestamp: number;
    openPrice: number;
    closePrice: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    volume: number;
  };
}

const REFRESH_DURATION = 500; // ms

export default class TradeData {
  private isInitialized = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private symbol: string | null = null;
  private strategyId: number | null = null;
  private fromTs: number | null = null;
  private toTs: number | null = null;

  private lastCachedTimestamp = 0;
  private tradesMap: Map<number, Trade> = new Map();
  private listeners: Map<string, () => void> = new Map();

  // Nested tag and style data instances
  private _tag = new TradeTagData();
  private _style = new TradeStyleData();

  /**
   * Access the tag data controller
   * e.g. tradeData.tag.getAll()
   */
  public get tag(): TradeTagData {
    return this._tag;
  }

  /**
   * Access the style data controller
   * e.g. tradeData.style.get()
   */
  public get style(): TradeStyleData {
    return this._style;
  }

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Initialize child data modules
    this._tag.init();
    this._style.init();

    this.checkAndFetchData();
    this.intervalId = setInterval(() => {
      this.checkAndFetchData();
    }, REFRESH_DURATION);
  }

  public destroy(): void {
    // Destroy child data modules
    this._tag.destroy();
    this._style.destroy();

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isInitialized = false;
    this.tradesMap.clear();
    this.lastCachedTimestamp = 0;
  }

  private checkInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("TradeData is not initialized. Call init() first.");
    }
  }

  public setSource(symbol: string | null, strategyId: number | null): void {
    let changed = false;
    if (symbol && symbol != this.symbol) {
      this.symbol = symbol;
      changed = true;
    }
    if (strategyId && strategyId != this.strategyId) {
      this.strategyId = strategyId;
      changed = true;
    }
    if (changed) {
      this.onConfigChanged();
    }
  }

  public setView(fromTs: number, toTs: number): void {
    this.fromTs = fromTs;
    this.toTs = toTs;
    this.onConfigChanged();
  }

  private onConfigChanged(): void {
    if (!this.hasFullConfig()) {
      // Retain existing cached trades until a valid full config is provided
      return;
    }
    // Force reload on fresh config parameters
    this.lastCachedTimestamp = 0;
    this.checkAndFetchData();
  }

  private hasFullConfig(): boolean {
    return (
      this.symbol !== null &&
      this.strategyId !== null &&
      this.fromTs !== null &&
      this.toTs !== null
    );
  }

  public get(id: number): Trade | null {
    this.checkInitialized();
    return this.tradesMap.get(id) ?? null;
  }

  public getAll(): Trade[] {
    this.checkInitialized();
    return Array.from(this.tradesMap.values());
  }

  public async set(trade: Trade): Promise<void> {
    await saveTrade(trade);
    // Server updates lastChange; the 500ms loop will pick up and trigger listeners
  }

  public async remove(id: number): Promise<void> {
    await deleteTrade(id);
    // Server updates lastChange; the 500ms loop will pick up and trigger listeners
  }

  public addOnTradeDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  public removeOnTradeDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async checkAndFetchData(): Promise<void> {
    if (!this.hasFullConfig()) {
      return;
    }

    try {
      const lastChange = await fetchLastChangeTimestamp();
      if (lastChange > this.lastCachedTimestamp) {
        const trades = await fetchTrades(
          this.strategyId!,
          this.symbol!,
          this.fromTs!,
          this.toTs!
        );

        this.tradesMap.clear();
        for (const trade of trades) {
          if (trade.id !== undefined) {
            this.tradesMap.set(trade.id, trade);
          }
        }

        this.lastCachedTimestamp = lastChange;
        this.notifyListeners();
      }
    } catch (error) {
      console.error("Failed to refresh TradeData:", error);
    }
  }

  private notifyListeners(): void {
    for (const callback of this.listeners.values()) {
      callback();
    }
  }
}