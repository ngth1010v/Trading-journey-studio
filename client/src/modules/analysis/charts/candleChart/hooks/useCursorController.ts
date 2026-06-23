import { useRef } from "react";
import type { CandleData } from "./useCandleData";
import type { Viewport } from "./useViewport";
import type { Ohlc } from "../shared/types";

//======================================================================================================
// TYPES
//======================================================================================================
type Point = {
  x: number;
  y: number;
};

type CursorController = {
  onMouseEnter(): void;
  onMouseLeave(): void;
  onMouseMove(x: number, y: number): void;
  onKeyDown(key: string): void;
  onKeyUp(key: string): void;
  setMagnet(enable?: boolean, distance?: number): void;
  getPixel(): Point;
  get(): { timestamp: number; price: number };
};

//======================================================================================================
// HELPERS
//======================================================================================================
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function projectToLine45(start: Point, current: Point): Point {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const t = (dx + dy) / 2;

  return {
    x: start.x + t,
    y: start.y + t,
  };
}

function projectToLineNeg45(start: Point, current: Point): Point {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const t = (dx - dy) / 2;

  return {
    x: start.x + t,
    y: start.y - t,
  };
}

//======================================================================================================
// HOOK
//======================================================================================================
export default function useCursorController(
  candleData: CandleData,
  viewport: Viewport,
): CursorController {
  const onScreenRef = useRef<boolean>(false);
  const cursorPosRef = useRef<Point>({ x: 0, y: 0 });
  const alignRef = useRef<boolean>(false);
  const startAlignPosRef = useRef<Point>({ x: 0, y: 0 });
  const magnetRef = useRef<boolean>(true);
  const magnetDistancePixelRef = useRef<number>(50);

  const onMouseEnter = (): void => {
    onScreenRef.current = true;
  };

  const onMouseLeave = (): void => {
    onScreenRef.current = false;
    alignRef.current = false;
  };

  const onMouseMove = (x: number, y: number): void => {
    if (isValidNumber(x)) cursorPosRef.current.x = x;
    if (isValidNumber(y)) cursorPosRef.current.y = y;
  };

  const onKeyDown = (key: string): void => {
    if (key === "Shift" && !alignRef.current && onScreenRef.current) {
      alignRef.current = true;
      startAlignPosRef.current.x = cursorPosRef.current.x;
      startAlignPosRef.current.y = cursorPosRef.current.y;
    }
  };

  const onKeyUp = (key: string): void => {
    if (key === "Shift" && alignRef.current) {
      alignRef.current = false;
    }
  };

  const setMagnet = (enable: boolean = true, distance: number = 50): void => {
    magnetRef.current = enable;
    magnetDistancePixelRef.current = isValidNumber(distance) && distance >= 0 ? distance : 50;
  };

  const getMagnetPixel = (x: number, y: number): Point | null => {
    const maxDistance = magnetDistancePixelRef.current;
    const maxDistanceSquared = maxDistance * maxDistance;

    let bestPoint: Point | null = null;
    let bestDistanceSquared = maxDistanceSquared;

    const consider = (px: number, py: number): void => {
      if (!isValidNumber(px) || !isValidNumber(py)) return;

      const d2 = distanceSquared(x, y, px, py);
      if (d2 <= bestDistanceSquared) {
        bestDistanceSquared = d2;
        bestPoint = { x: px, y: py };
      }
    };

    const considerOhlc = (ohlc: Ohlc): void => {
      let candleX: number;
      try {
        candleX = viewport.timestampToPixel(ohlc.t);
      } catch {
        return;
      }

      const prices = [ohlc.o, ohlc.h, ohlc.l, ohlc.c];
      for (let i = 0; i < prices.length; i += 1) {
        let candleY: number;
        try {
          candleY = viewport.priceToPixel(prices[i]);
        } catch {
          continue;
        }

        consider(candleX, candleY);
      }
    };

    const all = candleData.getAll();
    for (let i = 0; i < all.length; i += 1) {
      considerOhlc(all[i]);
    }

    try {
      considerOhlc(candleData.getLast());
    } catch {
      // ignore when no last candle is available
    }

    return bestPoint;
  };

  const getPixel = (): Point => {
    const x = cursorPosRef.current.x;
    const y = cursorPosRef.current.y;

    if (alignRef.current) {
      const start = startAlignPosRef.current;
      const dx = Math.abs(x - start.x);
      const dy = Math.abs(y - start.y);

      if (dx === 0 && dy === 0) {
        return { x: start.x, y: start.y };
      }

      if (dx === 0) {
        return { x: start.x, y };
      }

      if (dy === 0) {
        return { x, y: start.y };
      }

      if (dy / dx > 2.5) {
        return { x: start.x, y };
      }

      if (dx / dy > 2.5) {
        return { x, y: start.y };
      }

      const p45 = projectToLine45(start, { x, y });
      const pn45 = projectToLineNeg45(start, { x, y });

      const d45 = distanceSquared(x, y, p45.x, p45.y);
      const dn45 = distanceSquared(x, y, pn45.x, pn45.y);

      return d45 <= dn45 ? p45 : pn45;
    }

    if (magnetRef.current) {
      const magnetPoint = getMagnetPixel(x, y);
      if (magnetPoint) {
        return magnetPoint;
      }
    }

    return { x, y };
  };

  const get = (): { timestamp: number; price: number } => {
    const { x, y } = getPixel();

    return {
      timestamp: viewport.pixelToTimestamp(x),
      price: viewport.pixelToPrice(y),
    };
  };

  const apiRef = useRef<CursorController | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      onMouseEnter,
      onMouseLeave,
      onMouseMove,
      onKeyDown,
      onKeyUp,
      setMagnet,
      getPixel,
      get,
    };
  }

  return apiRef.current;
}