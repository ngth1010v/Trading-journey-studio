import type { RGB, RGBA } from "../../../../shared/type";
import {
  fetchAllStrategySeasons,
  saveStrategySeason,
  deleteStrategySeasonApi,
} from "./strategySeasonApi";

export interface StrategySeason {
  id?: number;
  name: string;
  desc: string;
  style: {
    background: RGBA;
    border: {
      enable: boolean;
      thickness: number;
      color: RGBA;
    };
    text: {
      startText: {
        enable: boolean;
        size: number;
        color: RGB;
        align: {
          x: "left" | "right";
          y: "top" | "center" | "bottom";
        };
      };
      endText: {
        enable: boolean;
        size: number;
        color: RGB;
        align: {
          x: "left" | "right";
          y: "top" | "center" | "bottom";
        };
      };
    };
  };
  type: "daily" | "monthly" | "yearly";
  fromTime: {
    second: number;
    minute: number;
    hour: number;
    day?: number;
    month?: number;
  };
  toTime: {
    second: number;
    minute: number;
    hour: number;
    day?: number;
    month?: number;
  };
}

export const REFRESH_DURATION = 500; // ms

// ============================================================================
// GLOBAL STATE & LOOP
// ============================================================================

interface StrategySeasonMainTrigger {
  triggerStrategySeasonDataChange: () => void;
}

let isStrategySeasonInitialized = false;
let globalStrategySeasonIntervalId: ReturnType<typeof setInterval> | null = null;
let strategySeasonCacheMap: Map<number, StrategySeason> = new Map();
let previousStrategySeasonJson = "";

const strategySeasonDataCallbackMap = new Map<string, StrategySeasonMainTrigger>();

async function executeGlobalStrategySeasonRefresh(): Promise<void> {
  try {
    const freshSeasons = await fetchAllStrategySeasons();
    const freshJson = JSON.stringify(freshSeasons);

    const hasDataChanged = freshJson !== previousStrategySeasonJson;

    const newMap = new Map<number, StrategySeason>();
    for (const item of freshSeasons) {
      if (item.id !== undefined) {
        newMap.set(item.id, item);
      }
    }

    strategySeasonCacheMap = newMap;
    previousStrategySeasonJson = freshJson;

    if (hasDataChanged) {
      for (const { triggerStrategySeasonDataChange } of strategySeasonDataCallbackMap.values()) {
        triggerStrategySeasonDataChange();
      }
    }
  } catch (err) {
    // Silently swallow fetch/network errors during polling cycles
  }
}

export function initStrategySeason(): void {
  if (isStrategySeasonInitialized) {
    return;
  }
  isStrategySeasonInitialized = true;

  executeGlobalStrategySeasonRefresh();
  globalStrategySeasonIntervalId = setInterval(executeGlobalStrategySeasonRefresh, REFRESH_DURATION);
}

export function destroyStrategySeason(): void {
  if (!isStrategySeasonInitialized) {
    return;
  }

  if (globalStrategySeasonIntervalId !== null) {
    clearInterval(globalStrategySeasonIntervalId);
    globalStrategySeasonIntervalId = null;
  }

  strategySeasonDataCallbackMap.clear();
  strategySeasonCacheMap.clear();
  previousStrategySeasonJson = "";
  isStrategySeasonInitialized = false;
}

// ============================================================================
// STRATEGYSEASONDATA CLASS
// ============================================================================

export default class StrategySeasonData {
  public id: string | null = null;

  private callbacks = new Map<string, () => void>();

  public init(): void {
    if (this.id !== null) {
      return; // Prevent duplicate initialization
    }

    this.id = `strategy_season_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

    strategySeasonDataCallbackMap.set(this.id, {
      triggerStrategySeasonDataChange: () => this.notifyDataChange(),
    });
  }

  public destroy(): void {
    if (this.id !== null) {
      strategySeasonDataCallbackMap.delete(this.id);
      this.id = null;
    }
    this.callbacks.clear();
  }

  /**
   * Return specific season.
   * Throws an error if season is not found.
   */
  public get(id: number): StrategySeason {
    const season = strategySeasonCacheMap.get(id);
    if (!season) {
      throw new Error(`StrategySeason with id ${id} not found.`);
    }
    return season;
  }

  /**
   * Return all seasons, or [] if empty.
   */
  public getAll(): StrategySeason[] {
    return Array.from(strategySeasonCacheMap.values());
  }

  /**
   * Set/save season (updates server directly; polling loop handles cache synchronization).
   */
  public async set(season: StrategySeason): Promise<{ id: number }> {
    return await saveStrategySeason(season);
  }

  /**
   * Remove season (updates server directly; polling loop handles cache synchronization).
   */
  public async remove(id: number): Promise<void> {
    await deleteStrategySeasonApi(id);
  }

  public addOnStrategySeasonDataChange(id: string, cb: () => void): void {
    this.callbacks.set(id, cb);
  }

  public removeOnStrategySeasonDataChange(id: string): void {
    if (!this.callbacks.has(id)) {
      console.warn(`[StrategySeasonData] Listener ID '${id}' not found.`);
      return;
    }
    this.callbacks.delete(id);
  }

  private notifyDataChange(): void {
    for (const cb of this.callbacks.values()) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategySeasonData subscriber callback:", err);
      }
    }
  }
}