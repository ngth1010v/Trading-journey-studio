import { useRef } from "react";
import type { Result } from "../../../../../shared/result";
import { marketApi } from "../api/marketsApi";
import { CONFIG } from "../shared/config";
import type { Ohlc } from "../shared/types";



//======================================================================================================
// PUBLIC
//======================================================================================================
export type CandleData = {
  set     (args: SetArgs)               : Promise<Result<null>>;
  get     (fromTs: number, toTs: number): Result<Ohlc[]>;
  getAll  ()                            : Result<Ohlc[]>;
  getFirst()                            : Result<Ohlc>;
  getLast ()                            : Result<Ohlc>;
  cleanup ()                            : Promise<Result<null>>;
};

export type SetArgs = {
  symbol    ?: string;
  timeframe ?: string;
  realtime  ?: boolean;
  fromTs    ?: number;
  toTs      ?: number;
};


//======================================================================================================
// TYPE
//======================================================================================================


type AutoExtendRegisterResult = Result<{ key: number }>;




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

  const stopRealtimeLoop = (): void => {
    loopTokenRef.current += 1;
  };

  const cleanup = async (): Promise<Result<null>> => {
    stopRealtimeLoop();

    const currentKey = realtimeKeyRef.current;
    const currentSymbol = symbolRef.current;

    realtimeKeyRef.current = null;
    realtimeOhlcsRef.current = [];

    if (currentKey == null || !currentSymbol) {
      return {
        success: true,
        data: null,
        error: null,
      };
    }

    const unregisterResult = await marketApi.unregisterAutoExtend(
      currentSymbol,
      currentKey,
    );

    if (!unregisterResult.success) {
      return unregisterResult;
    }

    return {
      success: true,
      data: null,
      error: null,
    };
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

        const lastResult = await marketApi.getLastOhlc(symbol);

        if (!lastResult.success) {
          continue;
        }

        const lastOhlc = lastResult.data;
        const realtimeItems = realtimeOhlcsRef.current;

        if (
          realtimeItems.length === 0 ||
          realtimeItems[realtimeItems.length - 1].t < lastOhlc.t
        ) {
          realtimeItems.push(lastOhlc);
        } else {
          realtimeItems[realtimeItems.length - 1] = lastOhlc;
        }
      }
    })();
  };

  const set = async (
    args: SetArgs,
  ): Promise<Result<null>> => {
    // 1. Xử lý fallback cho symbol
    let symbol = args.symbol !== undefined ? String(args.symbol ?? "").trim() : symbolRef.current;
    if (!symbol) {
      return {
        success: false,
        data: null,
        error: { code: "INVALID_SYMBOL", msg: "symbol is required" },
      };
    }

    // 2. Xử lý fallback cho timeframe
    let timeframe = args.timeframe !== undefined ? String(args.timeframe ?? "").trim() : timeframeRef.current;
    if (!timeframe) {
      return {
        success: false,
        data: null,
        error: { code: "INVALID_TIMEFRAME", msg: "timeframe is required" },
      };
    }

    // 3. Xử lý fallback cho realtime
    let realtime = args.realtime !== undefined ? Boolean(args.realtime) : realtimeRef.current;
    if (realtime === null) {
      return {
        success: false,
        data: null,
        error: { code: "INVALID_REALTIME", msg: "realtime is required" },
      };
    }

    // 4. Xử lý fallback cho fromTs và toTs
    let fromTs = args.fromTs !== undefined ? args.fromTs : fromTsRef.current;
    let toTs = args.toTs !== undefined ? args.toTs : toTsRef.current;

    if (fromTs === null || toTs === null || !isValidNumber(fromTs) || !isValidNumber(toTs)) {
      return {
        success: false,
        data: null,
        error: { code: "INVALID_RANGE", msg: "fromTs and toTs must be valid numbers" },
      };
    }

    if (toTs < fromTs) {
      return {
        success: false,
        data: null,
        error: { code: "INVALID_RANGE", msg: "toTs must be greater than or equal to fromTs" },
      };
    }

    await cleanup();

    // Tính toán dựa trên giá trị cuối cùng (đã gộp cũ/mới)
    const tsDelta = toTs - fromTs;
    const cacheRatio = CONFIG.CANDLE_DATA.CACHE_RATIO;

    const finalFromTs = fromTs - tsDelta * cacheRatio;
    const finalToTs = toTs + tsDelta * cacheRatio;

    const ohlcResult = await marketApi.getOhlcs(
      symbol,
      timeframe,
      finalFromTs,
      finalToTs,
    );

    if (!ohlcResult.success) {
      return ohlcResult;
    }
    
    // Lưu lại giá trị thành công vào các Ref cho lần gọi sau
    ohlcsRef.current = [...ohlcResult.data];
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
    realtimeRef.current = realtime;
    fromTsRef.current = fromTs;
    toTsRef.current = toTs;

    if (realtime) {
      const registerResult =
        (await marketApi.registerAutoExtend(
          symbol,
        )) as AutoExtendRegisterResult;

      if (registerResult.success) {
        const returnedKey =
          registerResult.data?.key;

        realtimeKeyRef.current =
          typeof returnedKey === "number"
            ? returnedKey
            : keySeedRef.current++;

        realtimeOhlcsRef.current = [];

        const loopToken = ++loopTokenRef.current;

        startRealtimeLoop(symbol, loopToken);
      }
    }

    return {
      success: true,
      data: null,
      error: null,
    };
  };

  const get = (
    fromTs: number,
    toTs: number,
  ): Result<Ohlc[]> => {
    if (
      !isValidNumber(fromTs) ||
      !isValidNumber(toTs) ||
      toTs < fromTs
    ) {
      return {
        success: false,
        data: null,
        error: {
          code: "INVALID_RANGE",
          msg: "fromTs and toTs must be valid numbers, and toTs must be >= fromTs",
        },
      };
    }

    const base = sliceOhlcRange(
      ohlcsRef.current,
      fromTs,
      toTs,
    );

    if (realtimeKeyRef.current != null) {
      return {
        success: true,
        data: [...base, ...realtimeOhlcsRef.current],
        error: null,
      };
    }

    return {
      success: true,
      data: base,
      error: null,
    };
  };

  const getAll = (): Result<Ohlc[]> => {
    return {
      success: true,
      data: [
        ...ohlcsRef.current,
        ...realtimeOhlcsRef.current,
      ],
      error: null,
    };
  };

const getFirst = (): Result<Ohlc> => {
    const allData = getAll();
    if (!allData.success) return allData as any;

    if (allData.data.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "NO_DATA",
          msg: "No ohlc data available",
        },
      };
    }
    
    return {
      success: true,
      data: allData.data[0],
      error: null,
    };
  };

  const getLast = (): Result<Ohlc> => {
    const allData = getAll();
    if (!allData.success) return allData as any;

    if (allData.data.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "NO_DATA",
          msg: "No ohlc data available",
        },
      };
    }
    
    return {
      success: true,
      data: allData.data[allData.data.length - 1],
      error: null,
    };
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
    };
  }

  return apiRef.current;
}