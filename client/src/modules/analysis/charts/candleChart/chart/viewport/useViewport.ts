import { useRef } from "react";
import { throwAppError } from "../../../../../../shared/appError";
import { CONFIG } from "../../shared/config";
import type { CandleData } from "../../market/hooks/useCandleData";


//======================================================================================================
// PUBLIC
//======================================================================================================
export type Viewport = {
  init                        ()                                                            : void;
  destroy                     ()                                                            : void;
  clean                       ()                                                            : void;
  setCanvasSize               (args: ViewportSetCanvasSizeArgs)                             : void;

  // View
  setView                     (args: ViewportSetViewArgs)                                   : void;
  getView                     ()                                                            : View;
  getTransformedView          ()                                                            : View;

  // Transform
  setAutoPrice                ()                                                            : void;
  setOffsetTimestamp          (offsetPixelX: number, cumulative?: boolean)                  : void;
  setScaleTimestamp           (scaleX: number, scaleAtPixelX: number, cumulative?: boolean) : void;
  setOffsetPrice              (offsetPixelY: number, cumulative?: boolean)                  : void;
  setScalePrice               (scaleY: number, scaleAtPixelY: number, cumulative?: boolean) : void;
  flush                       ()                                                            : Promise<void>;

  // Converter
  timestampToPixel            (timestamp: number)                                           : number;
  pixelToTimestamp            (pixel: number)                                               : number;
  priceToPixel                (price: number)                                               : number;
  pixelToPrice                (pixel: number)                                               : number;
  getTimestampToPixelWeights  ()                                                            : ShaderWeights;
  getPriceToPixelWeights      ()                                                            : ShaderWeights;

  // Event
  addOnViewportChange(id: string, callback: (view: View) => void): void;
  removeOnViewportChange(id: string): void;
  addOnViewportFlush(id: string, callback: () => void): void;
  removeOnViewportFlush(id: string): void;
};

export type CanvasSize = {
  w: number;
  h: number;
};

export type ViewportSetCanvasSizeArgs = {
  width: number;
  height: number;
};

export type ShaderWeights = {
  offset: number;
  multiplication: number;
  addition: number;
};

export type ViewportSetViewArgs = {
  fromTs: number;
  toTs: number;
  fromPrice: number;
  toPrice: number;
};

//======================================================================================================
// TYPE
//======================================================================================================
type View = {
  fromTs: number;
  toTs: number;
  fromPrice: number;
  toPrice: number;
};

type Transform = {
  offsetTs: number;
  offsetPrice: number;
  scaleTs: number;
  scalePrice: number;
};

//======================================================================================================
// HELPER
//======================================================================================================
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value > 0;
}

//======================================================================================================
// LOGIC
//======================================================================================================
function useViewport(candleData: CandleData): Viewport {
  const oldSymbol = useRef<string>("")
  const canvasSizeRef = useRef<CanvasSize>({
    w: 0,
    h: 0,
  });

  const viewRef = useRef<View>({
    fromTs: 0,
    toTs: 0,
    fromPrice: 0,
    toPrice: 0,
  });

  const transformRef = useRef<Transform>({
    offsetTs: 0,
    offsetPrice: 0,
    scaleTs: 1,
    scalePrice: 1,
  });

  const listenersRef = useRef<Map<string, (view: View) => void>>(new Map());
  const flushListenersRef = useRef<Map<string, () => void>>(new Map());

  const triggerViewportChange = (): void => {
    const view = viewRef.current;
    const transform = transformRef.current;

    const currentView: View = {
      fromTs: view.fromTs * transform.scaleTs + transform.offsetTs,
      toTs: view.toTs * transform.scaleTs + transform.offsetTs,
      fromPrice: view.fromPrice * transform.scalePrice + transform.offsetPrice,
      toPrice: view.toPrice * transform.scalePrice + transform.offsetPrice,
    };

    listenersRef.current.forEach((callback: (view: View) => void) => {
      try {
        callback(currentView);
      } catch (err) {
        console.error("Error in onViewportChange callback:", err);
      }
    });
  };

  const init = (): void => {
    candleData.addOnDataChange("viewport/init", ()=>{
      const newSymbol = candleData.getSymbol()

      if (oldSymbol.current != newSymbol){
        oldSymbol.current = newSymbol
        setAutoPrice()
      }
    })
  };

  const destroy = (): void => {
    candleData.removeOnDataChange("viewport/init")
    };



  const clean = (): void => {
    transformRef.current.offsetTs = 0;
    transformRef.current.offsetPrice = 0;
    transformRef.current.scaleTs = 1;
    transformRef.current.scalePrice = 1;
  };

  const setCanvasSize = (args: ViewportSetCanvasSizeArgs): void => {
    if (!isPositiveNumber(args?.width) || !isPositiveNumber(args?.height)) {
      throwAppError("INVALID_CANVAS_SIZE", "width and height must be valid positive numbers");
    }

    canvasSizeRef.current.w = args.width;
    canvasSizeRef.current.h = args.height;

    triggerViewportChange();
  };

  const setView = (args: ViewportSetViewArgs): void => {
    if (
      !isValidNumber(args?.fromTs) ||
      !isValidNumber(args?.toTs) ||
      !isValidNumber(args?.fromPrice) ||
      !isValidNumber(args?.toPrice)
    ) {
      throwAppError("INVALID_VIEW", "fromTs, toTs, fromPrice and toPrice must be valid numbers");
    }

    if (args.toTs <= args.fromTs || args.toPrice <= args.fromPrice) {
      throwAppError("INVALID_VIEW", "fromTs < toTs and fromPrice < toPrice are required");
    }

    viewRef.current = {
      fromTs: args.fromTs,
      toTs: args.toTs,
      fromPrice: args.fromPrice,
      toPrice: args.toPrice,
    };

    clean();
    triggerViewportChange();
  };

  const getView = (): View => {
    return { ...viewRef.current };
  };

  const getTransformedView = (): View => {
    const view = viewRef.current;
    const transform = transformRef.current;

    return {
      fromTs: view.fromTs * transform.scaleTs + transform.offsetTs,
      toTs: view.toTs * transform.scaleTs + transform.offsetTs,
      fromPrice: view.fromPrice * transform.scalePrice + transform.offsetPrice,
      toPrice: view.toPrice * transform.scalePrice + transform.offsetPrice,
    };
  };

  const flush = async (): Promise<void> => {
    const view = viewRef.current;
    const transform = transformRef.current;

    view.fromTs     = view.fromTs * transform.scaleTs + transform.offsetTs;
    view.toTs       = view.toTs * transform.scaleTs + transform.offsetTs;
    view.fromPrice  = view.fromPrice * transform.scalePrice + transform.offsetPrice;
    view.toPrice    = view.toPrice * transform.scalePrice + transform.offsetPrice;

    transform.offsetTs = 0;
    transform.offsetPrice = 0;
    transform.scaleTs = 1;
    transform.scalePrice = 1;

    await candleData.setRange(
      Math.round(view.fromTs),
      Math.round(view.toTs),
    );

    triggerViewportChange();
    flushListenersRef.current.forEach((callback) => {
      try { callback(); } catch (err) { console.error(err); }
    });
  };

  const setAutoPrice = (): void => {
    const view = viewRef.current;
    const transform = transformRef.current;

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
    const realToTs   = view.toTs * transform.scaleTs + transform.offsetTs;
    let realFromId   = candleData.findBack(realFromTs)
    let realToId     = candleData.findBack(realToTs)
    if (realFromId === null) realFromId = candleData.findFront(realFromTs)
    if (realToId === null) realToId = candleData.findFront(realToTs)

    if (realFromId === null || realToId === null) {
      throwAppError("NO_OHLC_DATA", "no OHLC data found in the target range");
    }

    if (realToId - realFromId === 0) {
      throwAppError("NO_OHLC_DATA", "no OHLC data found in the target range");
    }
    
    const binCount = realToId - realFromId + 1
    if (binCount < 0) {
      throwAppError("INVALID_BIN_COUNT", "binCount must be greater than zero");
    }

    const binOhlcs = candleData.getBinRange(realFromId, binCount);
    if (!binOhlcs) {
      throwAppError("NO_OHLC_DATA", "no OHLC data found in the target range");
    }

    let maxPrice = binOhlcs.h[0];
    let minPrice = binOhlcs.l[0];

    for (let i = 1; i < binCount; i += 1) {
      if (binOhlcs.h[i] != 0 && binOhlcs.h[i]> maxPrice) maxPrice = binOhlcs.h[i];
      if (binOhlcs.l[i] != 0 && binOhlcs.l[i] < minPrice) minPrice = binOhlcs.l[i];
    }

    const priceRange = Number(maxPrice - minPrice);
    if (priceRange <= 0) {
      throwAppError("INVALID_AUTO_PRICE", "price range from OHLC data must be greater than zero");
    }

    const currentDeltaPrice = view.toPrice - view.fromPrice;
    if (currentDeltaPrice === 0) {
      throwAppError("INVALID_VIEW", "current price range must not be zero");
    }

    const ratio            = CONFIG.VIEWPORT.AUTO_TRANSFORM_PRICE_RATIO;
    const targetDeltaPrice = priceRange / ratio;
    const padding          = (targetDeltaPrice - priceRange) / 2;
    const targetFromPrice  = Number(minPrice) - padding;

    transform.scalePrice = targetDeltaPrice / currentDeltaPrice;
    transform.offsetPrice = targetFromPrice - view.fromPrice * transform.scalePrice;

    triggerViewportChange();
  };

  const timestampToPixel = (timestamp: number): number => {
    if (!isValidNumber(timestamp)) {
      throwAppError("INVALID_TIMESTAMP", "timestamp must be a valid number");
    }

    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas width must be set before timestampToPixel()");
    }

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      throwAppError("INVALID_VIEW", "timestamp range must not be zero");
    }

    const halfDeltaTs = timestamp - (view.fromTs * transform.scaleTs + transform.offsetTs);
    return (halfDeltaTs / fullDeltaTs) * w;
  };

  const pixelToTimestamp = (pixel: number): number => {
    if (!isValidNumber(pixel)) {
      throwAppError("INVALID_PIXEL", "pixel must be a valid number");
    }

    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas width must be set before pixelToTimestamp()");
    }

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      throwAppError("INVALID_VIEW", "timestamp range must not be zero");
    }

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
    return realFromTs + (pixel / w) * fullDeltaTs;
  };

  const priceToPixel = (price: number): number => {
    if (!isValidNumber(price)) {
      throwAppError("INVALID_PRICE", "price must be a valid number");
    }

    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas height must be set before priceToPixel()");
    }

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      throwAppError("INVALID_VIEW", "price range must not be zero");
    }

    const halfDeltaPrice = price - (view.fromPrice * transform.scalePrice + transform.offsetPrice);
    return h - (halfDeltaPrice / fullDeltaPrice) * h;
  };

  const pixelToPrice = (pixel: number): number => {
    if (!isValidNumber(pixel)) {
      throwAppError("INVALID_PIXEL", "pixel must be a valid number");
    }

    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas height must be set before pixelToPrice()");
    }

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      throwAppError("INVALID_VIEW", "price range must not be zero");
    }

    const realFromPrice = view.fromPrice * transform.scalePrice + transform.offsetPrice;
    return realFromPrice + ((h - pixel) / h) * fullDeltaPrice;
  };

  const getTimestampToPixelWeights = (): ShaderWeights => {
    const ohlc = candleData.get(0);
    const offset = ohlc ? ohlc.t : 0;

    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas width must be set before timestampToPixel()");
    }

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      throwAppError("INVALID_VIEW", "timestamp range must not be zero");
    }

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
    const multiplication = w / fullDeltaTs;
    const addition = (offset - realFromTs) * multiplication;

    return {
      offset,
      addition,
      multiplication,
    };
  };

  const getPriceToPixelWeights = (): ShaderWeights => {
    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas height must be set before priceToPixel()");
    }

    const ohlc = candleData.get(0);
    const offset = ohlc ? ohlc.l : 0;

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      throwAppError("INVALID_VIEW", "price range must not be zero");
    }

    const realFromPrice = view.fromPrice * transform.scalePrice + transform.offsetPrice;
    const multiplication = -h / fullDeltaPrice;
    const addition = h - ((offset - realFromPrice) * h) / fullDeltaPrice;

    return {
      offset,
      addition,
      multiplication,
    };
  };

  const setOffsetTimestamp = (offsetPixelX: number, cumulative: boolean = false): void => {
    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas width must be set");
    }
    if (!isValidNumber(offsetPixelX)) {
      throwAppError("INVALID_OFFSET", "offsetPixelX must be a number");
    }

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    const offsetTs = (offsetPixelX / w) * fullDeltaTs;

    if (cumulative) {
      transform.offsetTs += offsetTs;
    } else {
      transform.offsetTs = offsetTs;
    }

    triggerViewportChange();
  };

  const setOffsetPrice = (offsetPixelY: number, cumulative: boolean = false): void => {
    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas height must be set");
    }
    if (!isValidNumber(offsetPixelY)) {
      throwAppError("INVALID_OFFSET", "offsetPixelY must be a number");
    }

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    const offsetPrice = (-offsetPixelY / h) * fullDeltaPrice;

    if (cumulative) {
      transform.offsetPrice += offsetPrice;
    } else {
      transform.offsetPrice = offsetPrice;
    }

    triggerViewportChange();
  };

  const setScaleTimestamp = (scaleX: number, scaleAtPixelX: number, cumulative: boolean = false): void => {
    if (!isValidNumber(scaleX) || scaleX <= 0) {
      throwAppError("INVALID_SCALE", "scaleX must be positive");
    }

    const scaleAtTimestamp = pixelToTimestamp(scaleAtPixelX);

    const transform = transformRef.current;
    if (cumulative) {
      transform.scaleTs *= scaleX;
    } else {
      transform.scaleTs = scaleX;
    }

    if (transform.scaleTs <= 0) {
      throwAppError("INVALID_SCALE", "resulting scaleTs must be positive");
    }

    const view = viewRef.current;
    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    const { w } = canvasSizeRef.current;

    transform.offsetTs =
      scaleAtTimestamp - (view.fromTs * transform.scaleTs) - (scaleAtPixelX / w) * fullDeltaTs;

    triggerViewportChange();
  };

  const setScalePrice = (scaleY: number, scaleAtPixelY: number, cumulative: boolean = false): void => {
    if (!isValidNumber(scaleY) || scaleY <= 0) {
      throwAppError("INVALID_SCALE", "scaleY must be positive");
    }

    const scaleAtPrice = pixelToPrice(scaleAtPixelY);

    const transform = transformRef.current;
    if (cumulative) {
      transform.scalePrice *= scaleY;
    } else {
      transform.scalePrice = scaleY;
    }

    if (transform.scalePrice <= 0) {
      throwAppError("INVALID_SCALE", "resulting scalePrice must be positive");
    }

    const view = viewRef.current;
    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    const { h } = canvasSizeRef.current;

    transform.offsetPrice =
      scaleAtPrice - (view.fromPrice * transform.scalePrice) - ((h - scaleAtPixelY) / h) * fullDeltaPrice;

    triggerViewportChange();
  };

  const addOnViewportChange = (id: string, callback: (view: View) => void): void => {
    if (listenersRef.current.has(id)) {
      throwAppError("DUPLICATE_ID", `Listener with id "${id}" already exists.`);
    }
    listenersRef.current.set(id, callback);
  };

  const removeOnViewportChange = (id: string): void => {
    if (!listenersRef.current.has(id)) {
      throwAppError("NOT_FOUND", `Listener with id "${id}" does not exist.`);
    }
    listenersRef.current.delete(id);
  };

  const addOnViewportFlush = (id: string, callback: () => void): void => {
    if (flushListenersRef.current.has(id)) {
      throwAppError("DUPLICATE_ID", `Flush listener with id "${id}" already exists.`);
    }
    flushListenersRef.current.set(id, callback);
  };

  const removeOnViewportFlush = (id: string): void => {
    if (!flushListenersRef.current.has(id)) {
      throwAppError("NOT_FOUND", `Flush listener with id "${id}" does not exist.`);
    }
    flushListenersRef.current.delete(id);
  };

  const apiRef = useRef<Viewport | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      init,
      destroy,
      clean,
      setCanvasSize,
      setView,
      getView,
      getTransformedView,
      flush,
      setAutoPrice,
      timestampToPixel,
      pixelToTimestamp,
      priceToPixel,
      pixelToPrice,
      getTimestampToPixelWeights,
      getPriceToPixelWeights,
      setOffsetTimestamp,
      setOffsetPrice,
      setScaleTimestamp,
      setScalePrice,
      addOnViewportChange,
      removeOnViewportChange,
      addOnViewportFlush,
      removeOnViewportFlush,
    };
  }

  return apiRef.current;
}

export default useViewport;
