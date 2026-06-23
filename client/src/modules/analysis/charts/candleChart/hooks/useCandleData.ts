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
  set               (args: SetCandleDataArgs)                               : Promise<void>;
  cleanup           ()                                                      : Promise<void>;
  update            (fromTs: number, toTs: number)                          : Promise<void>;

  // Get
  get               (fromTs: number, toTs: number)                          : Ohlc[];
  getAll            ()                                                      : Ohlc[]; 
  getFirst          ()                                                      : Ohlc;
  getLast           ()                                                      : Ohlc;

  // Event
  addOnDataChange   (id: string, callback: (data: Ohlc[]) => void): void;
  removeOnDataChange(id: string)                                  : void;
  addOnLastDataChange(id: string, callback: (data: Ohlc) => void) : void;
  removeOnLastDataChange(id: string)                              : void;
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
  const toTsRef         = useRef<number | null>(null);

  const reloadFromTsRef = useRef<number>(0);
  const reloadToTsRef   = useRef<number>(0);

  const ohlcsRef        = useRef<Ohlc[]>([]);
  const lastOhlcRef     = useRef<Ohlc | null>(null);
  const realtimeKeyRef  = useRef<number | null>(null);

  const loopTokenRef = useRef(0);
  const keySeedRef = useRef(1);

  const listenersRef = useRef<Map<string, (data: Ohlc[]) => void>>(new Map());
  const lastDataListenersRef = useRef<Map<string, (data: Ohlc) => void>>(new Map());

  const triggerDataChange = (): void => {
    listenersRef.current.forEach((callback: (data: Ohlc[]) => void) => {
      try {
        callback(ohlcsRef.current);
      } catch (err) {
        console.error("Error in onDataChange callback:", err);
      }
    });
  };

  const triggerLastDataChange = (lastOhlc: Ohlc): void => {
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
      triggerDataChange();
      return;
    }

    await marketApi.unregisterAutoExtend(currentSymbol, currentKey);
    triggerDataChange();
  };

  const startLastLoop = (
    symbol: string,
    loopToken: number,
  ): void => {
    void (async () => {
      while (loopTokenRef.current === loopToken) {
        await sleep(1000);

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

    // firstOhlcRef.current = await marketApi.getFirstOhlc(nextSymbol, nextTimeframe)
    // if (firstOhlcRef.current) nextFromTs = Math.max(nextFromTs, firstOhlcRef.current.t)
    // lastOhlcRef.current = await marketApi.getLastOhlc(nextSymbol, nextTimeframe)
    // if (lastOhlcRef.current) nextToTs = Math.min(nextToTs, lastOhlcRef.current.t)

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

  const apiRef = useRef<CandleData | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      set,
      get,
      update,
      getAll,
      getFirst,
      getLast,
      cleanup,
      addOnDataChange,
      removeOnDataChange,
      addOnLastDataChange,
      removeOnLastDataChange,
    };
  }

  return apiRef.current;
}