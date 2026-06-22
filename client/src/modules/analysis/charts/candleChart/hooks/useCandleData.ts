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




//======================================================================================================
// TYPE
//======================================================================================================
type SetArgs = {
  symbol    : string;
  timeframe : string;
  realtime  : boolean;
  fromTs    : number;
  toTs      : number;
};

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
    const symbol = String(args.symbol ?? "").trim();
    const timeframe = String(args.timeframe ?? "").trim();
    const realtime = Boolean(args.realtime);

    if (!symbol) {
      return {
        success: false,
        data: null,
        error: {
          code: "INVALID_SYMBOL",
          msg: "symbol is required",
        },
      };
    }

    if (!timeframe) {
      return {
        success: false,
        data: null,
        error: {
          code: "INVALID_TIMEFRAME",
          msg: "timeframe is required",
        },
      };
    }

    if (
      !isValidNumber(args.fromTs) ||
      !isValidNumber(args.toTs)
    ) {
      return {
        success: false,
        data: null,
        error: {
          code: "INVALID_RANGE",
          msg: "fromTs and toTs must be valid numbers",
        },
      };
    }

    if (args.toTs < args.fromTs) {
      return {
        success: false,
        data: null,
        error: {
          code: "INVALID_RANGE",
          msg: "toTs must be greater than or equal to fromTs",
        },
      };
    }

    await cleanup();

    const tsDelta = args.toTs - args.fromTs;
    const cacheRatio = CONFIG.CANDLE_DATA.CACHE_RATIO;

    const fromTs =
      args.fromTs - tsDelta * cacheRatio;

    const toTs =
      args.toTs + tsDelta * cacheRatio;

    const ohlcResult = await marketApi.getOhlcs(
      symbol,
      timeframe,
      fromTs,
      toTs,
    );

    if (!ohlcResult.success) {
      return ohlcResult;
    }
    
    ohlcsRef.current = [...ohlcResult.data];
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;

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