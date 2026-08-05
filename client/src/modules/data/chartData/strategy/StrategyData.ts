import type { RGB, RGBA } from "../../../shared/type";
import StrategyTagData, { initStrategyTag, destroyStrategyTag } from "./tag/StrategyTagData";
import StrategySeasonData, { initStrategySeason, destroyStrategySeason } from "./season/StrategySeasonData";
import {
  fetchAllStrategies,
  saveStrategy,
  deleteStrategyApi,
} from "./strategyApi";

export interface Strategy {
  id?: number;
  name: string;
  desc: string;
  tagIds: number[];
  seasonIds: number[];
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
  name: "Default",
  desc: "",
  tagIds: [],
  seasonIds: [],
  status: "live",
  createdTimestamp: 0,

  favorite: {
    symbols: [],
    timeframes: [],
  },
  color: {
    font: [255, 255, 255] as RGB,
    background: [120, 90, 150, 1] as RGBA,
    border: [145, 118, 175, 1] as RGBA,
  },
} as Strategy;

export const REFRESH_DURATION = 500; // ms

// ============================================================================
// GLOBAL STATE & LOOP
// ============================================================================

interface StrategyMainTrigger {
  triggerStrategyDataChange: () => void;
}

let isStrategyInitialized = false;
let globalStrategyIntervalId: ReturnType<typeof setInterval> | null = null;
let strategyCacheMap: Map<number, Strategy> = new Map();
let previousStrategyJson = "";

const strategyDataCallbackMap = new Map<string, StrategyMainTrigger>();

async function executeGlobalStrategyRefresh(): Promise<void> {
  try {
    const freshStrategies = await fetchAllStrategies();
    const freshJson = JSON.stringify(freshStrategies);
    const hasDataChanged = freshJson !== previousStrategyJson;

    const newMap = new Map<number, Strategy>();
    for (const item of freshStrategies) {
      if (item.id !== undefined) {
        newMap.set(item.id, item);
      }
    }

    strategyCacheMap = newMap;
    previousStrategyJson = freshJson;

    if (hasDataChanged) {
      for (const { triggerStrategyDataChange } of strategyDataCallbackMap.values()) {
        triggerStrategyDataChange();
      }
    }
  } catch (err) {
    // Silently swallow fetch/network errors during polling cycles
  }
}

export function initStrategy(): void {
  if (isStrategyInitialized) {
    return;
  }
  isStrategyInitialized = true;

  // Initialize tags and seasons alongside strategy
  initStrategyTag();
  initStrategySeason();

  executeGlobalStrategyRefresh();
  globalStrategyIntervalId = setInterval(executeGlobalStrategyRefresh, REFRESH_DURATION);
}

export function destroyStrategy(): void {
  if (!isStrategyInitialized) {
    return;
  }

  if (globalStrategyIntervalId !== null) {
    clearInterval(globalStrategyIntervalId);
    globalStrategyIntervalId = null;
  }

  // Destroy strategy tag and season loops as well
  destroyStrategyTag();
  destroyStrategySeason();

  strategyDataCallbackMap.clear();
  strategyCacheMap.clear();
  previousStrategyJson = "";
  isStrategyInitialized = false;
}

// ============================================================================
// STRATEGYDATA CLASS
// ============================================================================

export default class StrategyData {
  public id: string | null = null;
  public tag: StrategyTagData;
  public season: StrategySeasonData;

  private callbacks = new Map<string, () => void>();

  constructor() {
    this.tag = new StrategyTagData();
    this.season = new StrategySeasonData();
  }

  public init(): void {
    if (this.id !== null) {
      return; // Prevent duplicate initialization
    }

    this.id = `strategy_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

    // Initialize internal StrategyTagData & StrategySeasonData instances
    this.tag.init();
    this.season.init();

    strategyDataCallbackMap.set(this.id, {
      triggerStrategyDataChange: () => this.notifyDataChange(),
    });
  }

  public destroy(): void {
    if (this.id !== null) {
      strategyDataCallbackMap.delete(this.id);
      this.id = null;
    }
    this.tag.destroy();
    this.season.destroy();
    this.callbacks.clear();
  }

  /**
   * Return specific strategy, or null if not found.
   */
  public get(id: number): Strategy | null {
    return strategyCacheMap.get(id) ?? null;
  }

  public getDefault(): Strategy {
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
   */
  public getAll(): Strategy[] {
    return Array.from(strategyCacheMap.values());
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
    if (!this.callbacks.has(id)) {
      console.warn(`[StrategyData] Listener ID '${id}' not found.`);
      return;
    }
    this.callbacks.delete(id);
  }

  private notifyDataChange(): void {
    for (const cb of this.callbacks.values()) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategyData subscriber callback:", err);
      }
    }
  }
}