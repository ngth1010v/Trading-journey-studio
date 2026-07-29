import type { RGB, RGBA } from "../../../shared/type";
import StrategyTagData from "./tag/StrategyTagData";
import {
  fetchAllStrategies,
  saveStrategy,
  deleteStrategyApi,
} from "./strategyApi";

export interface Strategy {
  id?: number;
  name: string;
  desc: string;
  tagIds: string[];
  status: "live" | "end" | "backtest";
  createdTimestamp: number;

  favorite: {
    symbols: string[];
    timeframes: string[];
  };
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

const DEFAULT_STRATEGY = {
  name: "Default", // add prefix " 1", " 2" if duplicate
  desc: "",
  tagIds: [],
  status: "live",
  createdTimestamp: 0, // = auto set when create

  favorite: {
    symbols: [],
    timeframes: [],
  },
  color: {
    font: [255,255,255] as RGB,
    background: [120, 90, 150, 1] as RGBA,
    border: [145, 118, 175, 1] as RGBA,
  }
} as Strategy

const REFRESH_DURATION = 500; // ms

export default class StrategyData {
  public tag: StrategyTagData;

  private cache: Map<number, Strategy> = new Map();
  private initialized: boolean = false;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private callbacks: Map<string, () => void> = new Map();

  constructor() {
    this.tag = new StrategyTagData();
  }

  /**
   * Start refresh loop for loading strategies + auto-init internal StrategyTagData.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;

    // Initialize tags along with strategies
    await Promise.all([this.tag.init(), this.poll()]);

    this.timerId = setInterval(() => {
      this.poll();
    }, REFRESH_DURATION);
  }

  /**
   * Stop the refresh loop and clean up tags as well.
   */
  public destroy(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.tag.destroy();
    this.cache.clear();
    this.callbacks.clear();
    this.initialized = false;
  }

  /**
   * Return specific strategy, or null if not found.
   * Throws an error if init was not called.
   */
  public get(id: number): Strategy | null {
    this.ensureInitialized();
    return this.cache.get(id) ?? null;
  }

  public getDefault(): Strategy {
    this.ensureInitialized();

    const strategy: Strategy = structuredClone(DEFAULT_STRATEGY);
    strategy.createdTimestamp = Date.now();

    const existingNames = new Set(
      this.getAll().map((s) => s.name)
    );

    const baseName = DEFAULT_STRATEGY.name;
    let name = baseName;
    let index = 1;

    while (existingNames.has(name)) {
      name = `${baseName} ${index++}`;
    }

    strategy.name = name;

    return strategy;
  }

  /**
   * Return all strategies, or [] if empty.
   * Throws an error if init was not called.
   */
  public getAll(): Strategy[] {
    this.ensureInitialized();
    return Array.from(this.cache.values());
  }

  /**
   * Set/save strategy (updates server directly; polling loop handles cache synchronization).
   */
  public async set(strategy: Strategy): Promise<{ id: number }> {
    return await saveStrategy(strategy);
  }

  /**
   * Remove strategy (updates server directly; polling loop handles cache synchronization).
   */
  public async remove(id: number): Promise<void> {
    await deleteStrategyApi(id);
  }

  public addOnStrateryDataChange(id: string, cb: () => void): void {
    this.callbacks.set(id, cb);
  }

  public removeOnStrateryDataChange(id: string): void {
    this.callbacks.delete(id);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("StrategyData has not been initialized. Call init() first.");
    }
  }

  private async poll(): Promise<void> {
    try {
      const strategies = await fetchAllStrategies();
      const newCache = new Map<number, Strategy>();

      for (const item of strategies) {
        if (item.id !== undefined) {
          newCache.set(item.id, item);
        }
      }

      if (this.hasDataChanged(newCache)) {
        this.cache = newCache;
        this.notifySubscribers();
      }
    } catch (err) {
      // Silently swallow fetch/network errors during polling cycles
    }
  }

  private hasDataChanged(newCache: Map<number, Strategy>): boolean {
    if (this.cache.size !== newCache.size) return true;

    for (const [id, newItem] of newCache.entries()) {
      const oldItem = this.cache.get(id);
      if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
        return true;
      }
    }

    return false;
  }

  private notifySubscribers(): void {
    this.callbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategyData subscriber callback:", err);
      }
    });
  }
}