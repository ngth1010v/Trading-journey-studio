import { useRef } from "react";
import type { Result } from "../../../../../shared/result";
import { CONFIG } from "../shared/config";
import type { CandleData } from "./useCandleData";


//======================================================================================================
// PUBLIC
//======================================================================================================
export type Viewport = {
  clean                     ()                                                            : Result<null>;
  setCanvasSize             (args: ViewportSetCanvasSizeArgs)                             : Result<null>;

  // View
  setView                   (args: ViewportSetViewArgs)                                   : Result<null>;
  getView                   ()                                                            : Result<View>;
  getTransformedView        ()                                                            : Result<View>;

  // Transform
  setAutoPrice              ()                                                            : Result<null>;
  setOffsetTimestamp        (offsetPixelX: number, cumulative?: boolean)                  : Result<null>;
  setScaleTimestamp         (scaleX: number, scaleAtPixelX: number, cumulative?: boolean) : Result<null>;
  setOffsetPrice            (offsetPixelY: number, cumulative?: boolean)                  : Result<null>;
  setScalePrice             (scaleY: number, scaleAtPixelY: number, cumulative?: boolean) : Result<null>;
  flush                     ()                                                            : Result<null>;
  
  // Converter
  timestampToPixel          (timestamp: number)                                           : Result<number>;
  pixelToTimestamp          (pixel: number)                                               : Result<number>;
  priceToPixel              (price: number)                                               : Result<number>;
  pixelToPrice              (pixel: number)                                               : Result<number>;
  getTimestampToPixelWeights()                                                            : Result<ShaderWeights>;
  getPriceToPixelWeights    ()                                                            : Result<ShaderWeights>;
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
  offset        : number;
  multiplication: number;
  addition      : number;
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
function ok<T>(data: T): Result<T> {
  return {
    success: true,
    data,
    error: null,
  };
}

function err(code: string, msg: string): Result<null> {
  return {
    success: false,
    data: null,
    error: {
      code,
      msg,
    },
  };
}
function errn(code: string, msg: string): Result<number> {
  return {
    success: false,
    data: null,
    error: {
      code,
      msg,
    },
  };
}

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

  const clean = (): Result<null> => {
    transformRef.current.offsetTs = 0;
    transformRef.current.offsetPrice = 0;
    transformRef.current.scaleTs = 1;
    transformRef.current.scalePrice = 1;

    return ok(null);
  };

  const setCanvasSize = (args: ViewportSetCanvasSizeArgs): Result<null> => {
    if (!isPositiveNumber(args?.width) || !isPositiveNumber(args?.height)) {
      return err("INVALID_CANVAS_SIZE", "width and height must be valid positive numbers");
    }

    canvasSizeRef.current.w = args.width;
    canvasSizeRef.current.h = args.height;

    return ok(null);
  };

  const setView = (args: ViewportSetViewArgs): Result<null> => {
    if (
      !isValidNumber(args?.fromTs) ||
      !isValidNumber(args?.toTs) ||
      !isValidNumber(args?.fromPrice) ||
      !isValidNumber(args?.toPrice)
    ) {
      return err("INVALID_VIEW", "fromTs, toTs, fromPrice and toPrice must be valid numbers");
    }

    if (args.toTs <= args.fromTs || args.toPrice <= args.fromPrice) {
      return err("INVALID_VIEW", "fromTs < toTs and fromPrice < toPrice are required");
    }

    viewRef.current = {
      fromTs: args.fromTs,
      toTs: args.toTs,
      fromPrice: args.fromPrice,
      toPrice: args.toPrice,
    };

    clean();

    return ok(null);
  };

  const getView = (): Result<View> => {
    return ok({ ...viewRef.current });
  };

  const getTransformedView = (): Result<View> => {
    const view = viewRef.current;
    const transform = transformRef.current;

    const res : View = {
      fromTs   : view.fromTs * transform.scaleTs + transform.offsetTs,
      toTs     : view.toTs * transform.scaleTs + transform.offsetTs,
      fromPrice: view.fromPrice * transform.scalePrice + transform.offsetPrice,
      toPrice  : view.toPrice * transform.scalePrice + transform.offsetPrice,
    }

    return ok(res);
  };

  const flush = (): Result<null> => {
    const view = viewRef.current;
    const transform = transformRef.current;

    view.fromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
    view.toTs = view.toTs * transform.scaleTs + transform.offsetTs;
    view.fromPrice = view.fromPrice * transform.scalePrice + transform.offsetPrice;
    view.toPrice = view.toPrice * transform.scalePrice + transform.offsetPrice;

    transform.offsetTs = 0;
    transform.offsetPrice = 0;
    transform.scaleTs = 1;
    transform.scalePrice = 1;

    return ok(null);
  };

  const setAutoPrice = (): Result<null> => {
    const view = viewRef.current;
    const transform = transformRef.current;

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
    const realToTs = view.toTs * transform.scaleTs + transform.offsetTs;

    const ohlcResult = candleData.get(realFromTs, realToTs);
    if (!ohlcResult.success) {
      return ohlcResult;
    }

    const ohlcs = ohlcResult.data;
    if (!ohlcs.length) {
      return err("NO_OHLC_DATA", "no OHLC data found in the target range");
    }

    let maxPrice = ohlcs[0].h;
    let minPrice = ohlcs[0].l;

    for (let i = 1; i < ohlcs.length; i += 1) {
      const item = ohlcs[i];
      if (item.h > maxPrice) maxPrice = item.h;
      if (item.l < minPrice) minPrice = item.l;
    }

    const priceRange = maxPrice - minPrice;
    if (priceRange <= 0) {
      return err("INVALID_AUTO_PRICE", "price range from OHLC data must be greater than zero");
    }

    const currentDeltaPrice = view.toPrice - view.fromPrice;
    if (currentDeltaPrice === 0) {
      return err("INVALID_VIEW", "current price range must not be zero");
    }

    const ratio = CONFIG.VIEWPORT.AUTO_TRANSFORM_PRICE_RATIO; // Giả sử ratio < 1 (vd: 0.8)
    
    const targetDeltaPrice = priceRange / ratio;

    const padding = (targetDeltaPrice - priceRange) / 2;
    const targetFromPrice = minPrice - padding;

    transform.scalePrice = targetDeltaPrice / currentDeltaPrice;
    transform.offsetPrice = targetFromPrice - view.fromPrice * transform.scalePrice;

    return ok(null);
  };

  const timestampToPixel = (timestamp: number): Result<number> => {
    if (!isValidNumber(timestamp)) {
      return errn("INVALID_TIMESTAMP", "timestamp must be a valid number");
    }

    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) {
      return errn("INVALID_CANVAS_SIZE", "canvas width must be set before timestampToPixel()");
    }

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      return errn("INVALID_VIEW", "timestamp range must not be zero");
    }

    const halfDeltaTs = timestamp - (view.fromTs * transform.scaleTs + transform.offsetTs);
    return ok((halfDeltaTs / fullDeltaTs) * w);
  };

  const pixelToTimestamp = (pixel: number): Result<number> => {
    if (!isValidNumber(pixel)) {
      return errn("INVALID_PIXEL", "pixel must be a valid number");
    }

    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) {
      return errn("INVALID_CANVAS_SIZE", "canvas width must be set before pixelToTimestamp()");
    }

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      return errn("INVALID_VIEW", "timestamp range must not be zero");
    }

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
    return ok(realFromTs + (pixel / w) * fullDeltaTs);
  };

  const priceToPixel = (price: number): Result<number> => {
    if (!isValidNumber(price)) {
      return errn("INVALID_PRICE", "price must be a valid number");
    }

    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) {
      return errn("INVALID_CANVAS_SIZE", "canvas height must be set before priceToPixel()");
    }

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      return errn("INVALID_VIEW", "price range must not be zero");
    }

    const halfDeltaPrice = price - (view.fromPrice * transform.scalePrice + transform.offsetPrice);
    return ok(h - (halfDeltaPrice / fullDeltaPrice) * h);
  };

  const pixelToPrice = (pixel: number): Result<number> => {
    if (!isValidNumber(pixel)) {
      return errn("INVALID_PIXEL", "pixel must be a valid number");
    }

    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) {
      return errn("INVALID_CANVAS_SIZE", "canvas height must be set before pixelToPrice()");
    }

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      return errn("INVALID_VIEW", "price range must not be zero");
    }

    const realFromPrice = view.fromPrice * transform.scalePrice + transform.offsetPrice;
    return ok(realFromPrice + ((h - pixel) / h) * fullDeltaPrice);
  };

  const getTimestampToPixelWeights = (): Result<ShaderWeights> => {
    function ok (data: ShaderWeights): Result<ShaderWeights> {
      return {
        success: true,
        data,
        error: null,
      };
    }
    function err(code: string, msg: string): Result<ShaderWeights> {
      return {
        success: false,
        data: null,
        error: {
          code,
          msg,
        },
      };
    }

    const ohlcResult = candleData.getFirst();
    const offset = ohlcResult.success ? ohlcResult.data.t : 1764547200000;

    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) {
      return err("INVALID_CANVAS_SIZE", "canvas width must be set before timestampToPixel()");
    }

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      return err("INVALID_VIEW", "timestamp range must not be zero");
    }

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;

    // flatTimestamp = rawTimestamp - offset
    // pixel = flatTimestamp * (w / fullDeltaTs) + ((offset - realFromTs) * w / fullDeltaTs)
    const multiplication = w / fullDeltaTs;
    const addition = (offset - realFromTs) * multiplication;

    const res: ShaderWeights = {
      offset,
      addition,
      multiplication
    };

    return ok(res);
  };

  const getPriceToPixelWeights = (): Result<ShaderWeights> => {
    function ok(data: ShaderWeights): Result<ShaderWeights> {
      return {
        success: true,
        data,
        error: null,
      };
    }
    function err(code: string, msg: string): Result<ShaderWeights> {
      return {
        success: false,
        data: null,
        error: {
          code,
          msg,
        },
      };
    }

    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) {
      return err("INVALID_CANVAS_SIZE", "canvas height must be set before priceToPixel()");
    }

    // Lấy giá trị thấp nhất hoặc giá trị đầu tiên làm gốc offset cho Price (tương tự timestamp)
    const ohlcResult = candleData.getFirst();
    const offset = ohlcResult.success ? ohlcResult.data.l : 0; 

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      return err("INVALID_VIEW", "price range must not be zero");
    }

    const realFromPrice = view.fromPrice * transform.scalePrice + transform.offsetPrice;

    // flatPrice = rawPrice - offset
    // pixel = h - ((flatPrice + offset - realFromPrice) * h / fullDeltaPrice)
    const multiplication = -h / fullDeltaPrice;
    const addition = h - ((offset - realFromPrice) * h) / fullDeltaPrice;

    const res: ShaderWeights = {
      offset,
      addition,
      multiplication,
    };
    
    return ok(res);
  };

  const setOffsetTimestamp = (offsetPixelX: number, cumulative: boolean = false): Result<null> => {
    const { w } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (w <= 0) return err("INVALID_CANVAS_SIZE", "canvas width must be set");
    if (!isValidNumber(offsetPixelX)) return err("INVALID_OFFSET", "offsetPixelX must be a number");

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    const offsetTs = (offsetPixelX / w) * fullDeltaTs;

    if (cumulative) {
      transform.offsetTs += offsetTs;
    } else {
      transform.offsetTs = offsetTs;
    }

    return ok(null);
  };

  const setOffsetPrice = (offsetPixelY: number, cumulative: boolean = false): Result<null> => {
    const { h } = canvasSizeRef.current;
    const view = viewRef.current;
    const transform = transformRef.current;

    if (h <= 0) return err("INVALID_CANVAS_SIZE", "canvas height must be set");
    if (!isValidNumber(offsetPixelY)) return err("INVALID_OFFSET", "offsetPixelY must be a number");

    // Đồ thị Y chạy ngược từ trên xuống dưới pixel (h - ...)
    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    const offsetPrice = (-offsetPixelY / h) * fullDeltaPrice;

    if (cumulative) {
      transform.offsetPrice += offsetPrice;
    } else {
      transform.offsetPrice = offsetPrice;
    }

    return ok(null);
  };

  const setScaleTimestamp = (scaleX: number, scaleAtPixelX: number, cumulative: boolean = false): Result<null> => {
    if (!isValidNumber(scaleX) || scaleX <= 0) return err("INVALID_SCALE", "scaleX must be positive");
    
    // 1. Đổi scaleAtPixelX -> scaleAtTimestamp trước khi đổi scaleTs
    const tsResult = pixelToTimestamp(scaleAtPixelX);
    if (!tsResult.success) return err("INVALID_PIXEL", "cannot convert pixel to timestamp");
    const scaleAtTimestamp = tsResult.data;

    const transform = transformRef.current;
    
    // 2. Cập nhật scaleTs
    if (cumulative) {
      transform.scaleTs *= scaleX;
    } else {
      transform.scaleTs = scaleX;
    }
    if (transform.scaleTs <= 0) return err("INVALID_SCALE", "resulting scaleTs must be positive");

    // 3. Điều chỉnh transform.offsetTs để cố định điểm pivot tại scaleAtPixelX
    // Công thức gốc: pixelX = ((ts - (fromTs * scaleTs + offsetTs)) / fullDeltaTs) * w
    // Giải phương trình tìm offsetTs theo pixelX mong muốn:
    const view = viewRef.current;
    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    const { w } = canvasSizeRef.current;

    transform.offsetTs = scaleAtTimestamp - (view.fromTs * transform.scaleTs) - (scaleAtPixelX / w) * fullDeltaTs;

    return ok(null);
  };

  const setScalePrice = (scaleY: number, scaleAtPixelY: number, cumulative: boolean = false): Result<null> => {
    if (!isValidNumber(scaleY) || scaleY <= 0) return err("INVALID_SCALE", "scaleY must be positive");

    // 1. Đổi scaleAtPixelY -> scaleAtPrice trước khi đổi scalePrice
    const priceResult = pixelToPrice(scaleAtPixelY);
    if (!priceResult.success) return err("INVALID_PIXEL", "cannot convert pixel to price");
    const scaleAtPrice = priceResult.data;

    const transform = transformRef.current;

    // 2. Cập nhật scalePrice
    if (cumulative) {
      transform.scalePrice *= scaleY;
    } else {
      transform.scalePrice = scaleY;
    }
    if (transform.scalePrice <= 0) return err("INVALID_SCALE", "resulting scalePrice must be positive");

    // 3. Điều chỉnh transform.offsetPrice để cố định điểm pivot tại scaleAtPixelY
    // Công thức gốc: pixelY = h - ((price - (fromPrice * scalePrice + offsetPrice)) / fullDeltaPrice) * h
    // Giải phương trình tìm offsetPrice theo pixelY mong muốn:
    const view = viewRef.current;
    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    const { h } = canvasSizeRef.current;

    transform.offsetPrice = scaleAtPrice - (view.fromPrice * transform.scalePrice) - ((h - scaleAtPixelY) / h) * fullDeltaPrice;

    return ok(null);
  };

  const apiRef = useRef<Viewport | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
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
      setScalePrice
    };
  }

  return apiRef.current;
}

export default useViewport;