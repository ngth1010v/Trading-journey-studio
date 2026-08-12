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
    borderThickness: number;
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

export interface StrategySeasonRange {
  seasonId: number;
  fromTs: number;
  toTs: number;
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
    borderThickness: "uNumber",
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

  strategySeasonCacheMap.clear();
  previousStrategySeasonJson = "";
  isStrategySeasonInitialized = false;
}

// ============================================================================
// HELPER FUNCTIONS FOR SEASON RANGE GENERATION
// ============================================================================

const SEC_MS = 1000;
const MIN_MS = 60 * SEC_MS;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

function generateSeasonRanges(
  season: StrategySeason,
  searchFromTs: number,
  searchToTs: number
): StrategySeasonRange[] {
  if (season.id === undefined) return [];
  const seasonId = season.id;
  const result: StrategySeasonRange[] = [];

  const fromSec = season.fromTime.second || 0;
  const fromMin = season.fromTime.minute || 0;
  const fromHr = season.fromTime.hour || 0;
  const fromTimeMs = fromHr * HOUR_MS + fromMin * MIN_MS + fromSec * SEC_MS;

  const toSec = season.toTime.second || 0;
  const toMin = season.toTime.minute || 0;
  const toHr = season.toTime.hour || 0;
  const toTimeMs = toHr * HOUR_MS + toMin * MIN_MS + toSec * SEC_MS;

  if (season.type === "daily") {
    const isOvernight = fromTimeMs >= toTimeMs;
    const durationMs = isOvernight ? DAY_MS - fromTimeMs + toTimeMs : toTimeMs - fromTimeMs;

    const startDayIndex = Math.floor((searchFromTs - durationMs) / DAY_MS);
    const endDayIndex = Math.floor(searchToTs / DAY_MS);

    for (let dayIdx = startDayIndex; dayIdx <= endDayIndex; dayIdx++) {
      const fromTs = dayIdx * DAY_MS + fromTimeMs;
      const toTs = fromTs + durationMs;

      if (fromTs <= searchToTs && toTs >= searchFromTs) {
        result.push({ seasonId, fromTs, toTs });
      }
    }
  } else if (season.type === "monthly") {
    const fromDay = (season.fromTime.day ?? 1) - 1;
    const toDay = (season.toTime.day ?? 1) - 1;

    const startDate = new Date(searchFromTs - 32 * DAY_MS);
    const endDate = new Date(searchToTs + 32 * DAY_MS);

    let currYear = startDate.getUTCFullYear();
    let currMonth = startDate.getUTCMonth();

    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth();

    while (currYear < endYear || (currYear === endYear && currMonth <= endMonth)) {
      const monthStartTs = Date.UTC(currYear, currMonth, 1);
      const daysInMonth = new Date(Date.UTC(currYear, currMonth + 1, 0)).getUTCDate();

      const clampedFromDay = Math.min(fromDay, daysInMonth - 1);
      const fromTs = monthStartTs + clampedFromDay * DAY_MS + fromTimeMs;

      let toTs: number;
      if (
        toDay < fromDay ||
        (toDay === fromDay && toTimeMs < fromTimeMs)
      ) {
        // Rollover to next month
        const nextMonthStartTs = Date.UTC(currYear, currMonth + 1, 1);
        const daysInNextMonth = new Date(Date.UTC(currYear, currMonth + 2, 0)).getUTCDate();
        const clampedToDay = Math.min(toDay, daysInNextMonth - 1);
        toTs = nextMonthStartTs + clampedToDay * DAY_MS + toTimeMs;
      } else {
        const clampedToDay = Math.min(toDay, daysInMonth - 1);
        toTs = monthStartTs + clampedToDay * DAY_MS + toTimeMs;
      }

      if (fromTs <= searchToTs && toTs >= searchFromTs) {
        result.push({ seasonId, fromTs, toTs });
      }

      currMonth++;
      if (currMonth > 11) {
        currMonth = 0;
        currYear++;
      }
    }
  } else if (season.type === "yearly") {
    const fromMonth = (season.fromTime.month ?? 1) - 1;
    const fromDay = (season.fromTime.day ?? 1) - 1;
    const toMonth = (season.toTime.month ?? 1) - 1;
    const toDay = (season.toTime.day ?? 1) - 1;

    const startYear = new Date(searchFromTs).getUTCFullYear() - 2;
    const endYear = new Date(searchToTs).getUTCFullYear() + 2;

    for (let yr = startYear; yr <= endYear; yr++) {
      const daysInFromMonth = new Date(Date.UTC(yr, fromMonth + 1, 0)).getUTCDate();
      const clampedFromDay = Math.min(fromDay, daysInFromMonth - 1);
      const fromTs = Date.UTC(yr, fromMonth, clampedFromDay + 1) + fromTimeMs;

      let toTs: number;
      const isRollover =
        toMonth < fromMonth ||
        (toMonth === fromMonth && toDay < fromDay) ||
        (toMonth === fromMonth && toDay === fromDay && toTimeMs < fromTimeMs);

      const targetYr = isRollover ? yr + 1 : yr;
      const daysInToMonth = new Date(Date.UTC(targetYr, toMonth + 1, 0)).getUTCDate();
      const clampedToDay = Math.min(toDay, daysInToMonth - 1);
      toTs = Date.UTC(targetYr, toMonth, clampedToDay + 1) + toTimeMs;

      if (fromTs <= searchToTs && toTs >= searchFromTs) {
        result.push({ seasonId, fromTs, toTs });
      }
    }
  }

  return result;
}

// ============================================================================
// STRATEGYSEASONDATA CLASS
// ============================================================================

export default class StrategySeasonData {
  public id: string | null = null;

  private currentRange: StrategySeasonRange | null = null;
  private callbacks = new Map<string, () => void>();
  private selectedSeasonRangeCallbacks = new Map<string, () => void>();

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
        background: [120, 90, 150, 80],
        border: [145, 118, 175, 100],
      },
      style: {
        borderThickness: 1,
      },
      type: "daily",
      fromTime: {
        second: 0,
        minute: 30,
        hour: 13,
        day: 0,
        month: 0,
      },
      toTime: {
        second: 0,
        minute: 30,
        hour: 15,
        day: 0,
        month: 0,
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

  public addOnSelectedSeasonRangeDataChange(id: string, cb: () => void): void {
    this.selectedSeasonRangeCallbacks.set(id, cb);

    // Notify immediately with current state (including null)
    try {
      cb();
    } catch (err) {
      console.error("Error executing StrategySeasonRange subscriber callback:", err);
    }
  }

  public removeOnSelectedSeasonRangeDataChange(id: string): void {
    if (!this.selectedSeasonRangeCallbacks.has(id)) {
      console.warn(`[StrategySeasonData] SelectedSeasonRange listener ID '${id}' not found.`);
      return;
    }

    this.selectedSeasonRangeCallbacks.delete(id);
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

  private notifySelectedSeasonRangeDataChange(): void {
    for (const cb of this.selectedSeasonRangeCallbacks.values()) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategySeasonRange subscriber callback:", err);
      }
    }
  }

  

  // ============================================================================
  // SEASON RANGE METHODS
  // ============================================================================

  /**
   * Return all ranges that have an edge inside [searchFromTs, searchToTs] or completely wrap [searchFromTs, searchToTs]
   */
  public getAllVisibleSeasonRange(
    searchFromTs: number,
    searchToTs: number,
    filterSeasonIds: number[] | null = null
  ): StrategySeasonRange[] {
    const visibleRanges: StrategySeasonRange[] = [];
    const filterSet = filterSeasonIds !== null ? new Set(filterSeasonIds) : null;
    const allSeasons = this.getAll();

    for (const season of allSeasons) {
      if (filterSet !== null && (season.id === undefined || !filterSet.has(season.id))) {
        continue;
      }

      const ranges = generateSeasonRanges(season, searchFromTs, searchToTs);
      for (const range of ranges) {
        const hasEdgeInside =
          (range.fromTs >= searchFromTs && range.fromTs <= searchToTs) ||
          (range.toTs >= searchFromTs && range.toTs <= searchToTs);

        const wraps = range.fromTs <= searchFromTs && range.toTs >= searchToTs;

        if (hasEdgeInside || wraps) {
          visibleRanges.push(range);
        }
      }
    }

    return visibleRanges;
  }

  /**
   * Get current selected range.
   */
  public getSelectedSeasonRange(): StrategySeasonRange | null {
    return this.currentRange;
  }

  /**
   * Move selected range to the range that has an edge closest to `timestamp`.
   */
  public setSelectedSeasonRangeToClosestRange(
    timestamp: number,
    searchFromTs: number,
    searchToTs: number,
    filterSeasonIds: number[] | null = null
  ): void {
    const allSeasons = this.getAll();
    const filterSet = filterSeasonIds !== null ? new Set(filterSeasonIds) : null;
    let closestRange: StrategySeasonRange | null = null;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const season of allSeasons) {
      if (filterSet !== null && (season.id === undefined || !filterSet.has(season.id))) {
        continue;
      }

      const ranges = generateSeasonRanges(season, searchFromTs, searchToTs);
      for (const range of ranges) {
        const distFrom = Math.abs(range.fromTs - timestamp);
        const distTo = Math.abs(range.toTs - timestamp);
        const distance = Math.min(distFrom, distTo);

        if (distance < minDistance) {
          minDistance = distance;
          closestRange = range;
        }
      }
    }

    if (this.currentRange !== closestRange) {
      this.currentRange = closestRange;
      this.notifySelectedSeasonRangeDataChange();
    }
  }

  /**
   * Find forward range and set as selected range.
   */
  public setSelectedSeasonRangeToNextRange(
    searchFromTs: number,
    searchToTs: number,
    filterSeasonIds: number[] | null = null
  ): void {
    if (this.currentRange === null) {
      return;
    }

    const cur = this.currentRange;
    const allSeasons = this.getAll();
    const filterSet = filterSeasonIds !== null ? new Set(filterSeasonIds) : null;
    let bestCandidate: StrategySeasonRange | null = null;
    let bestDeltaFromTs = Number.POSITIVE_INFINITY;
    let bestDeltaToTs = Number.POSITIVE_INFINITY;

    for (const season of allSeasons) {
      if (filterSet !== null && (season.id === undefined || !filterSet.has(season.id))) {
        continue;
      }

      const ranges = generateSeasonRanges(season, searchFromTs, searchToTs);
      for (const r of ranges) {
        const isValid =
          r.fromTs > cur.fromTs ||
          (r.fromTs === cur.fromTs && r.toTs > cur.toTs) ||
          (r.fromTs === cur.fromTs && r.toTs === cur.toTs && r.seasonId > cur.seasonId);

        if (!isValid) continue;

        const deltaFromTs = r.fromTs - cur.fromTs;
        const deltaToTs = r.toTs - cur.toTs;

        let isBetter = false;

        if (bestCandidate === null) {
          isBetter = true;
        } else if (deltaFromTs < bestDeltaFromTs) {
          isBetter = true;
        } else if (deltaFromTs === bestDeltaFromTs) {
          if (deltaToTs < bestDeltaToTs) {
            isBetter = true;
          } else if (deltaToTs === bestDeltaToTs) {
            if (r.seasonId < bestCandidate.seasonId) {
              isBetter = true;
            }
          }
        }

        if (isBetter) {
          bestCandidate = r;
          bestDeltaFromTs = deltaFromTs;
          bestDeltaToTs = deltaToTs;
        }
      }
    }

    if (bestCandidate !== null && this.currentRange !== bestCandidate) {
      this.currentRange = bestCandidate;
      this.notifySelectedSeasonRangeDataChange();
    }
  }

  /**
   * Find backward range and set as selected range.
   */
  public setSelectedSeasonRangeToPreviousRange(
    searchFromTs: number,
    searchToTs: number,
    filterSeasonIds: number[] | null = null
  ): void {
    if (this.currentRange === null) {
      return;
    }

    const cur = this.currentRange;
    const allSeasons = this.getAll();
    const filterSet = filterSeasonIds !== null ? new Set(filterSeasonIds) : null;
    let bestCandidate: StrategySeasonRange | null = null;
    let bestDeltaFromTs = Number.POSITIVE_INFINITY;
    let bestDeltaToTs = Number.POSITIVE_INFINITY;

    for (const season of allSeasons) {
      if (filterSet !== null && (season.id === undefined || !filterSet.has(season.id))) {
        continue;
      }

      const ranges = generateSeasonRanges(season, searchFromTs, searchToTs);
      for (const r of ranges) {
        const isValid =
          r.fromTs < cur.fromTs ||
          (r.fromTs === cur.fromTs && r.toTs < cur.toTs) ||
          (r.fromTs === cur.fromTs && r.toTs === cur.toTs && r.seasonId < cur.seasonId);

        if (!isValid) continue;

        const deltaFromTs = cur.fromTs - r.fromTs;
        const deltaToTs = cur.toTs - r.toTs;

        let isBetter = false;

        if (bestCandidate === null) {
          isBetter = true;
        } else if (deltaFromTs < bestDeltaFromTs) {
          isBetter = true;
        } else if (deltaFromTs === bestDeltaFromTs) {
          if (deltaToTs < bestDeltaToTs) {
            isBetter = true;
          } else if (deltaToTs === bestDeltaToTs) {
            if (r.seasonId > bestCandidate.seasonId) {
              isBetter = true;
            }
          }
        }

        if (isBetter) {
          bestCandidate = r;
          bestDeltaFromTs = deltaFromTs;
          bestDeltaToTs = deltaToTs;
        }
      }
    }

    if (bestCandidate !== null && this.currentRange !== bestCandidate) {
      this.currentRange = bestCandidate;
      this.notifySelectedSeasonRangeDataChange();
    }
  }

  /**
   * Reset currentRange to null.
   */
  public setSelectedSeasonRangeToNull(): void {
    if (this.currentRange !== null) {
      this.currentRange = null;
      this.notifySelectedSeasonRangeDataChange();
    }
  }
}