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
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
  style: {
    border: {
      enable: boolean;
      thickness: number;
    };
    text: {
      startText: {
        enable: boolean;
        size: number;
        align: {
          x: "left" | "right";
          y: "top" | "center" | "bottom";
        };
      };
      endText: {
        enable: boolean;
        size: number;
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

export const STRATEGY_SEASON_INPUT_LAYOUT = {
  name: "string",
  color: {
    font: "rgb",
    background: "rgba",
    border: "rgba",
  },
  type: "seasonType",
  fromTime: {
    second: "number",
    minute: "number",
    hour: "number",
    day: "number",
    month: "number",
  },
  toTime: {
    second: "number",
    minute: "number",
    hour: "number",
    day: "number",
    month: "number",
  },
  style: {
    border: {
      enable: "boolean",
      thickness: "uNumber",
    },
    text: {
      startText: {
        enable: "boolean",
        size: "uNumber",
        align: {
          x: "positionXlr",
          y: "positionY",
        },
      },
      endText: {
        enable: "boolean",
        size: "uNumber",
        align: {
          x: "positionXlr",
          y: "positionY",
        },
      },
    },
  },
  desc: "text",
};

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

  public getDefault(): StrategySeason {
    const season: StrategySeason = {
      name: "Default New york season",
      desc: "",
      color: {
        font: [255, 200, 100],
        background: [120, 90, 150, 0.2],
        border: [145, 118, 175, 1],
      },
      style: {
        border: {
          enable: true,
          thickness: 1,
        },
        text: {
          startText: {
            enable: true,
            size: 12,
            align: {
              x: "left",
              y: "bottom",
            },
          },
          endText: {
            enable: false,
            size: 12,
            align: {
              x: "right",
              y: "bottom",
            },
          },
        },
      },
      type: "daily",
      fromTime: {
        second: 0,
        minute: 30,
        hour: 13,
        day:0,
        month:0,
      },
      toTime: {
        second: 0,
        minute: 30,
        hour: 15,
        day:0,
        month:0,
      },
    };

    const existingNames = new Set(this.getAll().map((s) => s.name));

    const baseName = season.name;
    let index = 1;

    while (existingNames.has(season.name)) {
      season.name = `${baseName} ${index++}`;
    }

    return season;
  }

  public addOnStrategySeasonDataChange(id: string, cb: () => void): void {
    this.callbacks.set(id, cb);

    // If data exists, invoke callback immediately
    if (strategySeasonCacheMap.size > 0) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategyData subscriber callback:", err);
      }
    }
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