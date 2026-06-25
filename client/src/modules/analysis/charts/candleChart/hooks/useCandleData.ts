import { useRef } from "react";
import { throwAppError } from "../../../../../shared/appError";
import { marketApi } from "../api/marketsApi";
import { CONFIG } from "../shared/config";
import type { Ohlc } from "../shared/types";

//======================================================================================================
// PUBLIC
//======================================================================================================
export type CandleData = {
  // Set
  set                       (args: SetCandleDataArgs)                   : Promise<void>;
  cleanup                   ()                                          : Promise<void>;
  update                    (fromTs: number, toTs: number)              : Promise<void>;

  // Get
  get                     (fromTs: number, toTs: number)                : Ohlc[];
  getAll                  ()                                            : Ohlc[]; 
  getFirst                ()                                            : Ohlc;
  getLast                 ()                                            : Ohlc;
  getPoint                ()                                            : number;
  getTimeframe            ()                                            : string;
  getRemainTime           ()                                            : string;

  // Event
  addOnDataChange         (id: string, callback: (data: Ohlc[]) => void): void;
  removeOnDataChange      (id: string)                                  : void;
  addOnLastDataChange     (id: string, callback: (data: Ohlc) => void)  : void;
  removeOnLastDataChange  (id: string)                                  : void;
  addOnDataPolling        (id: string, callback: () => void)            : void;
  removeOnDataPolling     (id: string)                                  : void;
};

export type SetCandleDataArgs = {
  symbol?: string;
  timeframe?: string;
  realtime?: boolean;
  fromTs?: number;
  toTs?: number;
};

//======================================================================================================
// TYPE
//======================================================================================================
type AutoExtendRegisterResult = { key?: number } | null;

//======================================================================================================
// HELPERS
//======================================================================================================
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function lowerBoundByTime(items: Ohlc[], targetTs: number): number {
  let left = 0;
  let right = items.length;

  while (left < right) {
    const mid = (left + right) >> 1;

    if (items[mid].t < targetTs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

function upperBoundByTime(items: Ohlc[], targetTs: number): number {
  let left = 0;
  let right = items.length;

  while (left < right) {
    const mid = (left + right) >> 1;

    if (items[mid].t <= targetTs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

function sliceOhlcRange(
  items: Ohlc[],
  fromTs: number,
  toTs: number,
): Ohlc[] {
  if (items.length === 0) {
    return [];
  }

  const start = lowerBoundByTime(items, fromTs);
  const endExclusive = upperBoundByTime(items, toTs);

  if (start >= endExclusive) {
    return [];
  }

  return items.slice(start, endExclusive);
}

function normalizeListenerId(id: string): string {
  return String(id ?? "").trim();
}

//======================================================================================================
// HOOK
//======================================================================================================
export default function useCandleData(): CandleData {
  const symbolRef     = useRef("");
  const timeframeRef  = useRef("");
  const lastRef       = useRef<boolean | null>(null);
  const fromTsRef     = useRef<number | null>(null);
  const toTsRef       = useRef<number | null>(null);

  const pointRef      = useRef<number>(1)

  const reloadFromTsRef = useRef<number>(0);
  const reloadToTsRef   = useRef<number>(0);

  const ohlcsRef        = useRef<Ohlc[]>([]);
  const lastOhlcRef     = useRef<Ohlc | null>(null);
  const realtimeKeyRef  = useRef<number | null>(null);

  const loopTokenRef = useRef(0);
  const keySeedRef = useRef(1);

  const listenersRef = useRef<Map<string, (data: Ohlc[]) => void>>(new Map());
  const lastDataListenersRef = useRef<Map<string, (data: Ohlc) => void>>(new Map());
  const dataPollingListenersRef = useRef<Map<string, () => void>>(new Map());

  const triggerDataPolling = async (): Promise<void> => {
    const callbacks = Array.from(dataPollingListenersRef.current.values());
    for (const callback of callbacks) {
      try {
        callback();
      } catch (err) {
        console.error("Error in onDataPolling callback:", err);
      }
    }
  };

  const triggerDataChange = async (): Promise<void> => {
    listenersRef.current.forEach((callback: (data: Ohlc[]) => void) => {
      try {
        callback(ohlcsRef.current);
      } catch (err) {
        console.error("Error in onDataChange callback:", err);
      }
    });
  };

  const triggerLastDataChange = async (lastOhlc: Ohlc): Promise<void> => {
    lastDataListenersRef.current.forEach((callback: (data: Ohlc) => void) => {
      try {
        callback(lastOhlc);
      } catch (err) {
        console.error("Error in onLastDataChange callback:", err);
      }
    });
  };

  const stopLastLoop = (): void => {
    loopTokenRef.current += 1;
  };

  const cleanup = async (): Promise<void> => {
    stopLastLoop();

    const currentKey = realtimeKeyRef.current;
    const currentSymbol = symbolRef.current;

    realtimeKeyRef.current = null;
    lastOhlcRef.current = null;

    if (currentKey == null || !currentSymbol) {
      return;
    }

    await marketApi.unregisterAutoExtend(currentSymbol, currentKey);
  };

  const startLastLoop = (
    symbol: string,
    loopToken: number,
  ): void => {
    void (async () => {
      while (loopTokenRef.current === loopToken) {
        
        triggerDataPolling();

        if (loopTokenRef.current !== loopToken) {
          break;
        }

        let lastOhlc: Ohlc;
        try {
          lastOhlc = await marketApi.getLastOhlc(symbol, timeframeRef.current);
        } catch (err) {
          console.warn("getLastOhlc failed:", err);
          continue;
        }

        const currentLast = lastOhlcRef.current;

        if (currentLast && currentLast.t < lastOhlc.t) {
          
          if (currentLast.t <= reloadToTsRef.current)
            if (fromTsRef.current && toTsRef.current)
              await set({ fromTs: fromTsRef.current, toTs: toTsRef.current });
            
          lastOhlcRef.current = lastOhlc;
          triggerLastDataChange(lastOhlc);
        } else {
          const isChanged = !currentLast || 
            currentLast.o !== lastOhlc.o ||
            currentLast.h !== lastOhlc.h ||
            currentLast.l !== lastOhlc.l ||
            currentLast.c !== lastOhlc.c ||
            currentLast.v !== lastOhlc.v ||
            currentLast.t !== lastOhlc.t;

          lastOhlcRef.current = lastOhlc;
          if (isChanged) {
            triggerLastDataChange(lastOhlc);
          }
        }

        await sleep(1000);
      }
    })();
  };

  const set = async (args: SetCandleDataArgs): Promise<void> => {
    // 1. fallback symbol
    const nextSymbol = args.symbol !== undefined
      ? String(args.symbol ?? "").trim()
      : symbolRef.current;

    if (!nextSymbol) {
      throwAppError("INVALID_SYMBOL", "symbol is required");
    }
    pointRef.current = (await marketApi.getSymbolData(nextSymbol)).point

    // 2. fallback timeframe
    const nextTimeframe = args.timeframe !== undefined
      ? String(args.timeframe ?? "").trim()
      : timeframeRef.current;

    if (!nextTimeframe) {
      throwAppError("INVALID_TIMEFRAME", "timeframe is required");
    }

    // 3. fallback last
    const nextLast = args.realtime !== undefined ? Boolean(args.realtime) : lastRef.current;
    if (nextLast === null) {
      throwAppError("INVALID_REALTIME", "realtime is required");
    }

    // 4. fallback range
    let nextFromTs = args.fromTs !== undefined ? args.fromTs : fromTsRef.current;
    let nextToTs = args.toTs !== undefined ? args.toTs : toTsRef.current;

    if (
      nextFromTs === null ||
      nextToTs === null ||
      !isValidNumber(nextFromTs) ||
      !isValidNumber(nextToTs)
    ) {
      throwAppError("INVALID_RANGE", "fromTs and toTs must be valid numbers");
    }

    if (nextToTs < nextFromTs) {
      throwAppError("INVALID_RANGE", "toTs must be greater than or equal to fromTs");
    }

    cleanup()

    const tsDelta = nextToTs - nextFromTs;
    const cacheRatio = CONFIG.CANDLE_DATA.CACHE_RATIO;

    const finalFromTs = nextFromTs - tsDelta * cacheRatio;
    const finalToTs = nextToTs + tsDelta * cacheRatio;

    const reloadRatio = Math.min(CONFIG.CANDLE_DATA.CACHE_RATIO, CONFIG.CANDLE_DATA.RELOAD_RATIO);
    reloadFromTsRef.current = nextFromTs - tsDelta * reloadRatio;
    reloadToTsRef.current = nextToTs + tsDelta * reloadRatio;

    const fetched = await marketApi.getOhlcs(
      nextSymbol,
      nextTimeframe,
      finalFromTs,
      finalToTs,
    );

    ohlcsRef.current = [...fetched];
    symbolRef.current = nextSymbol;
    timeframeRef.current = nextTimeframe;
    lastRef.current = nextLast;
    fromTsRef.current = nextFromTs;
    toTsRef.current = nextToTs;

    if (nextLast) {
      const registerResult: AutoExtendRegisterResult = await marketApi.registerAutoExtend(nextSymbol);

      const returnedKey =
        registerResult && typeof registerResult === "object" && "key" in registerResult
          ? registerResult.key
          : undefined;

      realtimeKeyRef.current =
        typeof returnedKey === "number"
          ? returnedKey
          : keySeedRef.current++;

      lastOhlcRef.current = ohlcsRef.current.length > 0 
        ? ohlcsRef.current[ohlcsRef.current.length - 1] 
        : null;

      const loopToken = ++loopTokenRef.current;
      startLastLoop(nextSymbol, loopToken);
    }

    triggerDataChange();
  };



  const update = async (fromTs: number, toTs: number): Promise<void> => {
    // if (firstOhlcRef.current) fromTs = Math.max(fromTs, firstOhlcRef.current.t)
    // if (lastOhlcRef.current) toTs = Math.min(toTs, lastOhlcRef.current.t)

    if (fromTs < reloadFromTsRef.current || reloadToTsRef.current < toTs) {
      await set({ fromTs, toTs });
    }
  };



  const get = (fromTs: number, toTs: number): Ohlc[] => {
    if (
      !isValidNumber(fromTs) ||
      !isValidNumber(toTs) ||
      toTs < fromTs
    ) {
      throwAppError(
        "INVALID_RANGE",
        "fromTs and toTs must be valid numbers, and toTs must be >= fromTs",
      );
    }

    const base = sliceOhlcRange(
      ohlcsRef.current,
      fromTs,
      toTs,
    );

    if (realtimeKeyRef.current != null && lastOhlcRef.current) {
      return [...base, lastOhlcRef.current];
    }

    return base;
  };

  const getAll = (): Ohlc[] => {
    return ohlcsRef.current;
  };

  const getFirst = (): Ohlc => {
    const allData = getAll();

    if (allData.length === 0) {
      throwAppError("NO_DATA", "No ohlc data available");
    }

    return allData[0];
  };

  const getLast = (): Ohlc => {
    if (lastOhlcRef.current) return lastOhlcRef.current

    const allData = getAll();
    if (allData.length === 0) {
      throwAppError("NO_DATA", "No ohlc data available");
    }
    return allData[allData.length - 1];
  };

  const getPoint = (): number => {
    if (pointRef.current) return pointRef.current
    return 1
  };

  const getTimeframe = (): string => {
    if (timeframeRef.current) return timeframeRef.current
    return "1M"
  };

  const addOnDataChange = (id: string, callback: (data: Ohlc[]) => void): void => {
    const key = normalizeListenerId(id);

    if (!key) {
      throwAppError("INVALID_ID", "Listener id is required");
    }

    if (listenersRef.current.has(key)) {
      throwAppError("DUPLICATE_ID", `Listener with id "${key}" already exists.`);
    }

    listenersRef.current.set(key, callback);
  };

  const removeOnDataChange = (id: string): void => {
    const key = normalizeListenerId(id);

    if (!listenersRef.current.has(key)) {
      throwAppError("NOT_FOUND", `Listener with id "${key}" does not exist.`);
    }

    listenersRef.current.delete(key);
  };

  const addOnLastDataChange = (id: string, callback: (data: Ohlc) => void): void => {
    const key = normalizeListenerId(id);

    if (!key) {
      throwAppError("INVALID_ID", "Listener id is required");
    }

    if (lastDataListenersRef.current.has(key)) {
      throwAppError("DUPLICATE_ID", `Listener with id "${key}" already exists.`);
    }

    lastDataListenersRef.current.set(key, callback);
  };

  const removeOnLastDataChange = (id: string): void => {
    const key = normalizeListenerId(id);

    if (!lastDataListenersRef.current.has(key)) {
      throwAppError("NOT_FOUND", `Listener with id "${key}" does not exist.`);
    }

    lastDataListenersRef.current.delete(key);
  };

  const addOnDataPolling = (id: string, callback: () => void): void => {
    const key = normalizeListenerId(id);
    if (!key) throwAppError("INVALID_ID", "Listener id is required");
    if (dataPollingListenersRef.current.has(key)) {
      throwAppError("DUPLICATE_ID", `Listener with id "${key}" already exists.`);
    }
    dataPollingListenersRef.current.set(key, callback);
  };

  const removeOnDataPolling = (id: string): void => {
    const key = normalizeListenerId(id);
    if (!dataPollingListenersRef.current.has(key)) {
      throwAppError("NOT_FOUND", `Listener with id "${key}" does not exist.`);
    }
    dataPollingListenersRef.current.delete(key);
  };

  const getRemainTime = (): string => {
    const tf = timeframeRef.current;
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
      diff = step - (now % step);
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
  };

  const apiRef = useRef<CandleData | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      set,
      get,
      update,
      getAll,
      getFirst,
      getLast,
      getPoint,
      getTimeframe,
      cleanup,
      addOnDataChange,
      removeOnDataChange,
      addOnLastDataChange,
      removeOnLastDataChange,
      getRemainTime,
      addOnDataPolling,
      removeOnDataPolling,
    };
  }

  return apiRef.current;
}