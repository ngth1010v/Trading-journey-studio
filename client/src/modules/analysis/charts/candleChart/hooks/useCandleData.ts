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
  set(args: SetCandleDataArgs): Promise<void>;
  cleanup(): Promise<void>;

  // Get
  get(fromTs: number, toTs: number): Ohlc[];
  getAll(): Ohlc[];
  getFirst(): Ohlc;
  getLast(): Ohlc;

  // Event
  addOnDataChange(id: string, callback: (data: Ohlc[]) => void): void;
  removeOnDataChange(id: string): void;
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
  const symbolRef = useRef("");
  const timeframeRef = useRef("");
  const realtimeRef = useRef<boolean | null>(null);
  const fromTsRef = useRef<number | null>(null);
  const toTsRef = useRef<number | null>(null);

  const ohlcsRef = useRef<Ohlc[]>([]);
  const realtimeOhlcsRef = useRef<Ohlc[]>([]);
  const realtimeKeyRef = useRef<number | null>(null);

  const loopTokenRef = useRef(0);
  const keySeedRef = useRef(1);

  const listenersRef = useRef<Map<string, (data: Ohlc[]) => void>>(new Map());

  const triggerDataChange = (): void => {
    const allData = [
      ...ohlcsRef.current,
      ...realtimeOhlcsRef.current,
    ];

    listenersRef.current.forEach((callback: (data: Ohlc[]) => void) => {
      try {
        callback(allData);
      } catch (err) {
        console.error("Error in onDataChange callback:", err);
      }
    });
  };

  const stopRealtimeLoop = (): void => {
    loopTokenRef.current += 1;
  };

  const cleanup = async (): Promise<void> => {
    stopRealtimeLoop();

    const currentKey = realtimeKeyRef.current;
    const currentSymbol = symbolRef.current;

    realtimeKeyRef.current = null;
    realtimeOhlcsRef.current = [];

    if (currentKey == null || !currentSymbol) {
      triggerDataChange();
      return;
    }

    await marketApi.unregisterAutoExtend(currentSymbol, currentKey);
    triggerDataChange();
  };

  const startRealtimeLoop = (
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
          lastOhlc = await marketApi.getLastOhlc(symbol);
        } catch (err) {
          console.warn("getLastOhlc failed:", err);
          continue;
        }

        const realtimeItems = realtimeOhlcsRef.current;

        if (
          realtimeItems.length === 0 ||
          realtimeItems[realtimeItems.length - 1].t < lastOhlc.t
        ) {
          realtimeItems.push(lastOhlc);
        } else {
          realtimeItems[realtimeItems.length - 1] = lastOhlc;
        }

        triggerDataChange();
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

    // 3. fallback realtime
    const nextRealtime = args.realtime !== undefined ? Boolean(args.realtime) : realtimeRef.current;
    if (nextRealtime === null) {
      throwAppError("INVALID_REALTIME", "realtime is required");
    }

    // 4. fallback range
    const nextFromTs = args.fromTs !== undefined ? args.fromTs : fromTsRef.current;
    const nextToTs = args.toTs !== undefined ? args.toTs : toTsRef.current;

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

    await cleanup();

    const tsDelta = nextToTs - nextFromTs;
    const cacheRatio = CONFIG.CANDLE_DATA.CACHE_RATIO;

    const finalFromTs = nextFromTs - tsDelta * cacheRatio;
    const finalToTs = nextToTs + tsDelta * cacheRatio;

    const fetched = await marketApi.getOhlcs(
      nextSymbol,
      nextTimeframe,
      finalFromTs,
      finalToTs,
    );

    ohlcsRef.current = [...fetched];
    symbolRef.current = nextSymbol;
    timeframeRef.current = nextTimeframe;
    realtimeRef.current = nextRealtime;
    fromTsRef.current = nextFromTs;
    toTsRef.current = nextToTs;

    if (nextRealtime) {
      const registerResult: AutoExtendRegisterResult = await marketApi.registerAutoExtend(nextSymbol);

      const returnedKey =
        registerResult && typeof registerResult === "object" && "key" in registerResult
          ? registerResult.key
          : undefined;

      realtimeKeyRef.current =
        typeof returnedKey === "number"
          ? returnedKey
          : keySeedRef.current++;

      realtimeOhlcsRef.current = [];

      const loopToken = ++loopTokenRef.current;
      startRealtimeLoop(nextSymbol, loopToken);
    }

    triggerDataChange();
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

    if (realtimeKeyRef.current != null) {
      return [...base, ...realtimeOhlcsRef.current];
    }

    return base;
  };

  const getAll = (): Ohlc[] => {
    return [
      ...ohlcsRef.current,
      ...realtimeOhlcsRef.current,
    ];
  };

  const getFirst = (): Ohlc => {
    const allData = getAll();

    if (allData.length === 0) {
      throwAppError("NO_DATA", "No ohlc data available");
    }

    return allData[0];
  };

  const getLast = (): Ohlc => {
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

  const apiRef = useRef<CandleData | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      set,
      get,
      getAll,
      getFirst,
      getLast,
      cleanup,
      addOnDataChange,
      removeOnDataChange,
    };
  }

  return apiRef.current;
}
