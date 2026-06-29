import { useRef, useEffect } from "react";
import { marketApi } from "../api/marketsApi";
import { CONFIG } from "../shared/config";
import { throwAppError } from "../../../../../shared/appError";
import type { Ohlc } from "../shared/types";

// Type definitions for internal data cache structure
interface CacheData {
  t: BigInt64Array;
  o: BigInt64Array;
  h: BigInt64Array;
  l: BigInt64Array;
  c: BigInt64Array;
  v: BigInt64Array;
}

export interface CandleData {
  setSrc                (symbol: string, timeframe: string) : Promise<void>;
  setRealtime           (enable?: boolean)                  : void;
  setRange              (fromTs: number, toTs: number)      : Promise<void>;

  getTimeframe          ()                                  : string;
  getSymbol             ()                                  : string;
  getPoint              ()                                  : number;
  getRemainTime         ()                                  : string;

  findBack              (timestamp: number)                 : number | null;
  findFront             (timestamp: number)                 : number | null;

  getSize               ()                                  : number;
  get                   (id: number)                        : Ohlc | null;
  getRange              (fromId: number, count: number)     : Ohlc[] | null;
  getBinRange           (fromId: number, count: number)     : CacheData | null;
  getLast               ()                                  : Ohlc | null;

  addOnDataChange       (id: string, callback: () => void)  : void;
  removeOnDataChange    (id: string)                        : void;
  addOnLastDataChange   (id: string, callback: () => void)  : void;
  removeOnLastDataChange(id: string)                        : void;
  addOnDataPolling      (id: string, callback: () => void)  : void;
  removeOnDataPolling   (id: string)                        : void;
}

export default function useCandleData(): CandleData {
  // Use a mutable ref object to hold current data values stably across re-renders
  const state = useRef({
    _symbol: null as string | null,
    _timeframe: null as string | null,
    _point: null as number | null,
    _realtimeEnable: false,
    _fromTs: null as number | null,
    _toTs: null as number | null,
    _cache: null as CacheData | null,
    _lastOhlc: null as Ohlc | null,
    _loopTimeoutId: null as any | null,

    // Event listeners
    onDataChangeListeners: new Map<string, () => void>(),
    onLastDataChangeListeners: new Map<string, () => void>(),
    onDataPollingListeners: new Map<string, () => void>(),
  });

  // Ensure cleanup occurs if component unmounts
  useEffect(() => {
    return () => {
      if (state.current._loopTimeoutId) {
        clearTimeout(state.current._loopTimeoutId);
      }
    };
  }, []);

  // Helper routine to execute the background loop safely
  const runRealtimeLoop = async () => {
    if (!state.current._realtimeEnable) return;

    try {
      // Trigger data polling event
      state.current.onDataPollingListeners.forEach((cb) => cb());

      const symbol = state.current._symbol;
      const timeframe = state.current._timeframe;

      if (!symbol || !timeframe) {
        throw new Error("Missing active target configurations for realtime session loop.");
      }

      // Fetch latest update tick
      const newLast = await marketApi.getLast(symbol, timeframe);
      const currentLast = state.current._lastOhlc;
      const fromTs = state.current._fromTs;
      const toTs = state.current._toTs;

      // console.log(newLast)

      // Conditional range data sync check
      if (
        currentLast &&
        fromTs !== null &&
        toTs !== null &&
        newLast.t !== currentLast.t &&
        fromTs <= currentLast.t &&
        newLast.t <= toTs
      ) {
        await instance.setRange(fromTs, toTs);
      }

      state.current._lastOhlc = newLast;
      state.current.onLastDataChangeListeners.forEach((cb) => cb());

      if (state.current._symbol)
        marketApi.callExtend(state.current._symbol, Date.now())
    } catch (err) {
      console.error("Realtime interval operation processing exception caught:", err);
    } finally {
      // Enqueue next tick recursive interval
      if (state.current._realtimeEnable) {
        state.current._loopTimeoutId = setTimeout(runRealtimeLoop, 500);
        // state.current._loopTimeoutId = setTimeout(runRealtimeLoop, 1000);
      }
    }
  };

  const instance: CandleData = {
    async setSrc(symbol: string, timeframe: string): Promise<void> {
      try {
        state.current._symbol = symbol;
        state.current._timeframe = timeframe;

        const symData = await marketApi.getSymbol(symbol);
        state.current._point = symData.point;

        const fromTs = state.current._fromTs;
        const toTs = state.current._toTs;

        if (fromTs === null || toTs === null) {
          return 
          throw new Error("Active range boundaries (fromTs/toTs) must be initialized prior to calling setSrc.");
        }

        const deltaTs = (toTs - fromTs) * CONFIG.CANDLE_DATA.CACHE_EXTEND_RATIO;
        const predata = await marketApi.getRange(symbol, timeframe, fromTs - deltaTs, toTs + deltaTs);

        state.current._cache = predata;
        state.current.onDataChangeListeners.forEach((cb) => cb());
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
      }
    },

    setRealtime(enable: boolean = false): void {
      try {
        const currentlyEnabled = state.current._realtimeEnable;
        state.current._realtimeEnable = enable;

        if (enable && !currentlyEnabled) {
          // Fire recursive runtime sequence
          runRealtimeLoop();
        } else if (!enable && currentlyEnabled) {
          // Teardown step
          if (state.current._loopTimeoutId) {
            clearTimeout(state.current._loopTimeoutId);
            state.current._loopTimeoutId = null;
          }
        }
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
      }
    },

    async setRange(fromTs: number, toTs: number): Promise<void> {
      try {
        const symbol = state.current._symbol;
        const timeframe = state.current._timeframe;

        if (!symbol || !timeframe) {
          throw new Error("Target configuration criteria target unassigned. Invoke setSrc target sequence first.");
        }

        state.current._fromTs = fromTs;
        state.current._toTs = toTs;

        const deltaTs = (toTs - fromTs) * CONFIG.CANDLE_DATA.CACHE_EXTEND_RATIO;
        const predata = await marketApi.getRange(symbol, timeframe, fromTs - deltaTs, toTs + deltaTs);

        state.current._cache = predata;
        state.current.onDataChangeListeners.forEach((cb) => cb());

        
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
      }
    },

    getTimeframe(): string {
      if (state.current._timeframe === null) {
        throwAppError("CANDLE_DATA_ERROR", "Timeframe value requested before assignment mapping setup configuration.");
        return null as any;
      }
      return state.current._timeframe;
    },

    getSymbol(): string {
      if (state.current._symbol === null) {
        throwAppError("CANDLE_DATA_ERROR", "Symbol value requested before assignment mapping setup configuration.");
        return null as any;
      }
      return state.current._symbol;
    },

    getPoint(): number {
      if (state.current._point === null) {
        throwAppError("CANDLE_DATA_ERROR", "Point data context requested prior to active dataset acquisition.");
        return null as any;
      }
      return state.current._point;
    },

    getRemainTime(): string {
        const tf = state.current._timeframe;
        if (!tf) return "00:00:00";

        const match = tf.match(/^(\d+)([S|M|H|D|W|MN|Y])$/);
        if (!match) return "00:00:00";

        const value = parseInt(match[1], 10);
        const unit = match[2];
        const now = Date.now(); // UTC timestamp theo hệ thống (ms)

        let diff = 0; // ms remaining

        if (["S", "M", "H", "D"].includes(unit)) {
          let unitMs = 1000;
          if (unit === "M") unitMs *= 60;
          if (unit === "H") unitMs *= 60 * 60;
          if (unit === "D") unitMs *= 60 * 60 * 24;

          const step = value * unitMs;
          diff = step - (now % step) + 1000;
        } else {
          // Logic Calendar cho W, MN, Y dựa trên giờ UTC
          const date = new Date(now);
          if (unit === "W") {
            // Tuần tới bắt đầu từ Thứ 2 (Day 1) tuần sau hoặc tính theo Chu kỳ tuần của value
            const currentDay = date.getUTCDay();
            const daysToNextWeek = (((8 - currentDay) % 7) || 7) + (value - 1) * 7;
            const nextCandle = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysToNextWeek);
            diff = nextCandle - now;
          } else if (unit === "MN") {
            const nextCandle = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + value, 1);
            diff = nextCandle - now;
          } else if (unit === "Y") {
            const nextCandle = Date.UTC(date.getUTCFullYear() + value, 0, 1);
            diff = nextCandle - now;
          }
        }

        // Format kết quả đầu ra
        const totalSec = Math.floor(diff / 1000);
        const totalMin = Math.floor(totalSec / 60);
        const totalHour = Math.floor(totalMin / 60);
        const d = Math.floor(totalHour / 24);

        const ss = String(totalSec % 60).padStart(2, "0");
        const mm = String(totalMin % 60).padStart(2, "0");
        const hh = String(totalHour % 24).padStart(2, "0");

        if (unit === "S") return `00:00:${ss}s`;
        if (unit === "M") return `00:${mm}:${ss}s`;
        if (unit === "H") return `${String(totalHour).padStart(2, "0")}:${mm}:${ss}s`;
        
        // Đối với D, W, MN, Y format trả về dạng: `${d}d ${hh}:${mm}m`
        return `${d}d ${hh}:${mm}m`;
      },

    findBack(timestamp: number): number | null {
      try {
        const cache = state.current._cache;
        if (!cache || cache.t.length === 0) return null;

        let low = 0;
        let high = cache.t.length - 1;
        let result = -1;

        while (low <= high) {
          const mid = (low + high) >> 1;

          if (Number(cache.t[mid]) < timestamp) {
            result = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }

        return result === -1 ? null : result;
      } catch (err) {
        throwAppError(
          "CANDLE_DATA_ERROR",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      }
    },

    findFront(timestamp: number): number | null {
      try {
        const cache = state.current._cache;
        if (!cache || cache.t.length === 0) return null;

        let low = 0;
        let high = cache.t.length - 1;
        let result = -1;

        while (low <= high) {
          const mid = (low + high) >> 1;

          if (timestamp <= Number(cache.t[mid])) {
            result = mid;
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }

        return result === -1 ? null : result;
      } catch (err) {
        throwAppError(
          "CANDLE_DATA_ERROR",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      }
    },

    getSize(): number {
      try {
        return state.current._cache ? state.current._cache.t.length : 0;
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
        return null as any;
      }
    },

    get(id: number): Ohlc | null {
      try {
        const cache = state.current._cache;
        if (!cache || id < 0 || id >= cache.t.length) return null;

        return {
          t: Number(cache.t[id]),
          o: Number(cache.o[id]),
          h: Number(cache.h[id]),
          l: Number(cache.l[id]),
          c: Number(cache.c[id]),
          v: Number(cache.v[id]),
        };
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
        return null;
      }
    },

    getRange(fromId: number, count: number): Ohlc[] | null {
      try {
        const cache = state.current._cache;
        if (!cache) return null;

        const results: Ohlc[] = [];
        const endIdx = Math.min(fromId + count, cache.t.length);

        for (let i = fromId; i < endIdx; i++) {
          results.push({
            t: Number(cache.t[i]),
            o: Number(cache.o[i]),
            h: Number(cache.h[i]),
            l: Number(cache.l[i]),
            c: Number(cache.c[i]),
            v: Number(cache.v[i]),
          });
        }
        return results;
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
        return null;
      }
    },

    getBinRange(fromId: number, count: number): CacheData | null {
      try {
        const cache = state.current._cache;
        if (!cache) return null;

        const endId = fromId + count;
        
        // Zero-copy view generation via arrayBuffer subarray allocation
        return {
          t: cache.t.subarray(fromId, endId),
          o: cache.o.subarray(fromId, endId),
          h: cache.h.subarray(fromId, endId),
          l: cache.l.subarray(fromId, endId),
          c: cache.c.subarray(fromId, endId),
          v: cache.v.subarray(fromId, endId),
        };
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
        return null;
      }
    },

    getLast(): Ohlc | null {
      try {
        if (!state.current._realtimeEnable) return null;
        return state.current._lastOhlc;
      } catch (err) {
        throwAppError("CANDLE_DATA_ERROR", err instanceof Error ? err.message : String(err));
        return null;
      }
    },

    // ----------------------------------------------------
    // Event Handler Mappings
    // ----------------------------------------------------
    addOnDataChange(id: string, callback: () => void): void {
      state.current.onDataChangeListeners.set(id, callback);
    },

    removeOnDataChange(id: string): void {
      state.current.onDataChangeListeners.delete(id);
    },

    addOnLastDataChange(id: string, callback: () => void): void {
      state.current.onLastDataChangeListeners.set(id, callback);
    },

    removeOnLastDataChange(id: string): void {
      state.current.onLastDataChangeListeners.delete(id);
    },

    addOnDataPolling(id: string, callback: () => void): void {
      state.current.onDataPollingListeners.set(id, callback);
    },

    removeOnDataPolling(id: string): void {
      state.current.onDataPollingListeners.delete(id);
    },
  };

  return instance;
}