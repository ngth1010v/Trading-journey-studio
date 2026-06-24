import { useRef } from "react";
import { Container, Graphics } from "pixi.js";
import type { Application } from "pixi.js";
import type { CandleData } from "./useCandleData";
import type { Viewport } from "./useViewport";
import type { Ohlc } from "../shared/types";

//======================================================================================================
// TYPES
//======================================================================================================

export type Cursor = {
  // Init / Cleanup
  init        (app: Application)                    : void;
  destroy     ()                                    : void;

  // Set
  setVisible  (visible?: boolean)                   : void;
  setStyle    (style: CursorStyles)                 : void;
  setMagnet   (enable?: boolean, distance?: number) : void;

  // Event
  onMouseEnter()                                    : void;
  onMouseLeave()                                    : void;
  onMouseMove (x: number, y: number)                : void;
  onKeyDown   (key: string)                         : void;
  onKeyUp     (key: string)                         : void;

  // Pos
  getPixel    ()                                    : Point;
  get         ()                                    : { timestamp: number; price: number };
};

export type Point = {
  x: number;
  y: number;
};

export type CursorStyles = {
  type: "solid" | "dash";
  thickness: number;
  color: [number, number, number];

  dashWidth: number;
  dashSpace: number;
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

function rgbToHex(color: [number, number, number]): number {
  const r = Math.max(0, Math.min(255, Math.round(color[0])));
  const g = Math.max(0, Math.min(255, Math.round(color[1])));
  const b = Math.max(0, Math.min(255, Math.round(color[2])));

  return (r << 16) | (g << 8) | b;
}

function validateCursorStyle(style: CursorStyles): void {
  if (style.type !== "solid" && style.type !== "dash") {
    throw new Error(`Invalid cursor style type: ${String(style.type)}`);
  }
}

function sanitizeDashSize(value: number): number {
  if (!isValidNumber(value) || value <= 0) return 1;
  return Math.max(1, Math.floor(value));
}

function sanitizeGapSize(value: number): number {
  if (!isValidNumber(value) || value < 0) return 0;
  return Math.floor(value);
}

//======================================================================================================
// HOOK
//======================================================================================================
export default function useCursor(
  candleData: CandleData,
  viewport: Viewport,
): Cursor {
  const onScreenRef = useRef<boolean>(false);
  const cursorPosRef = useRef<Point>({ x: 0, y: 0 });
  const alignRef = useRef<boolean>(false);
  const startAlignPosRef = useRef<Point>({ x: 0, y: 0 });
  const magnetRef = useRef<boolean>(true);
  const magnetDistancePixelRef = useRef<number>(30);
  const visibleRef = useRef<boolean>(true);

  const appRef = useRef<Application | null>(null);
  const containerRef = useRef<Container | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);

  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const calculatedCursorPos = useRef<Point>({ x: 0, y: 0 });

  const cursorStyle = useRef<CursorStyles>({
    type: "solid",
    thickness: 2,
    color: [200, 200, 200],
    dashWidth: 10,
    dashSpace: 5,
  });

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

  const redrawGraphics = (): void => {
    const app = appRef.current;
    const graphics = graphicsRef.current;
    const container = containerRef.current;

    if (!app || !graphics || !container) return;

    canvasSize.current.w = app.screen.width;
    canvasSize.current.h = app.screen.height;

    graphics.clear();

    const visible = onScreenRef.current && visibleRef.current;
    container.visible = visible;
    graphics.visible = visible;

    if (!visible) return;

    const { x, y } = calculatedCursorPos.current;
    const { w, h } = canvasSize.current;

    const style = cursorStyle.current;
    const thickness = Math.max(1, style.thickness);
    const color = rgbToHex(style.color);

    const drawStroke = (x1: number, y1: number, x2: number, y2: number): void => {
      graphics
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          color,
          width: thickness,
        });
    };

    const drawDashedHorizontal = (yPos: number): void => {
      const dashWidth = sanitizeDashSize(style.dashWidth);
      const dashSpace = sanitizeGapSize(style.dashSpace);

      let current = 0;
      while (current < w) {
        const end = Math.min(current + dashWidth, w);
        drawStroke(current, yPos, end, yPos);
        current += dashWidth + dashSpace;
      }
    };

    const drawDashedVertical = (xPos: number): void => {
      const dashWidth = sanitizeDashSize(style.dashWidth);
      const dashSpace = sanitizeGapSize(style.dashSpace);

      let current = 0;
      while (current < h) {
        const end = Math.min(current + dashWidth, h);
        drawStroke(xPos, current, xPos, end);
        current += dashWidth + dashSpace;
      }
    };

    if (style.type === "dash") {
      drawDashedVertical(x);
      drawDashedHorizontal(y);
      return;
    }

    drawStroke(x, 0, x, h);
    drawStroke(0, y, w, y);
  };

  const refreshCursor = (): void => {
    calculatedCursorPos.current = getPixel();
    redrawGraphics();
  };

  const init = (app: Application): void => {
    if (appRef.current) return;

    appRef.current = app;

    const container = new Container();
    const graphics = new Graphics();

    container.addChild(graphics);
    app.stage.addChild(container);

    containerRef.current = container;
    graphicsRef.current = graphics;

    refreshCursor();
  };

  const destroy = (): void => {
    const app = appRef.current;
    const container = containerRef.current;
    const graphics = graphicsRef.current;

    if (app && container && container.parent) {
      container.parent.removeChild(container);
    }

    if (container) {
      container.removeChildren();
    }

    if (graphics) {
      graphics.destroy();
    }

    if (container) {
      container.destroy();
    }

    appRef.current = null;
    containerRef.current = null;
    graphicsRef.current = null;
    canvasSize.current = { w: 0, h: 0 };
    calculatedCursorPos.current = { x: 0, y: 0 };
  };

  const setStyle = (style: CursorStyles): void => {
    validateCursorStyle(style);

    cursorStyle.current = {
      type: style.type,
      thickness: style.thickness,
      color: [style.color[0], style.color[1], style.color[2]],
      dashWidth: style.dashWidth,
      dashSpace: style.dashSpace,
    };

    redrawGraphics();
  };

  const setVisible = (visible: boolean = true): void => {
    visibleRef.current = visible;
    redrawGraphics();
  };

  const onMouseEnter = (): void => {
    onScreenRef.current = true;
    refreshCursor();
  };

  const onMouseLeave = (): void => {
    onScreenRef.current = false;
    alignRef.current = false;
    redrawGraphics();
  };

  const onMouseMove = (x: number, y: number): void => {
    if (isValidNumber(x)) cursorPosRef.current.x = x;
    if (isValidNumber(y)) cursorPosRef.current.y = y;

    refreshCursor();
  };

  const onKeyDown = (key: string): void => {
    if (key === "Shift" && !alignRef.current && onScreenRef.current) {
      alignRef.current = true;
      startAlignPosRef.current.x = cursorPosRef.current.x;
      startAlignPosRef.current.y = cursorPosRef.current.y;
      refreshCursor();
    }
  };

  const onKeyUp = (key: string): void => {
    if (key === "Shift" && alignRef.current) {
      alignRef.current = false;
      refreshCursor();
    }
  };

  const setMagnet = (enable: boolean = true, distance: number = 50): void => {
    magnetRef.current = enable;
    magnetDistancePixelRef.current = isValidNumber(distance) && distance >= 0 ? distance : 50;
    refreshCursor();
  };

  const get = (): { timestamp: number; price: number } => {
    const { x, y } = calculatedCursorPos.current;

    return {
      timestamp: viewport.pixelToTimestamp(x),
      price: viewport.pixelToPrice(y),
    };
  };

  const apiRef = useRef<Cursor | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      init,
      destroy,
      setStyle,
      setVisible,
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