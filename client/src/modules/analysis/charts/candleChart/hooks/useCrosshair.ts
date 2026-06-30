import { useRef } from "react";
import { Container, Graphics } from "pixi.js";
import type { Application } from "pixi.js";
import type { CandleData } from "./rawCandle/useCandleData";
import type { Viewport } from "./viewport/useViewport";
import type { Ohlc } from "../shared/types";
import { throwAppError } from "../../../../../shared/appError";

//======================================================================================================
// TYPES
//======================================================================================================

export type Crosshair = {
  // Init / Cleanup
  init        (app: Application)                    : void;
  destroy     ()                                    : void;

  // Set
  setVisible  (visible?: boolean)                   : void;
  setStyle    (style: CrosshairStyles)                 : void;
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

export type CrosshairStyles = {
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

function rgbToHex(color: [number, number, number]): number {
  const r = Math.max(0, Math.min(255, Math.round(color[0])));
  const g = Math.max(0, Math.min(255, Math.round(color[1])));
  const b = Math.max(0, Math.min(255, Math.round(color[2])));

  return (r << 16) | (g << 8) | b;
}

function validateCrosshairStyle(style: CrosshairStyles): void {
  if (style.type !== "solid" && style.type !== "dash") {
    throw new Error(`Invalid Crosshair style type: ${String(style.type)}`);
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
export default function useCrosshair(
  candleData: CandleData,
  viewport: Viewport,
): Crosshair {
  const onScreenRef = useRef<boolean>(false);
  const CrosshairPosRef = useRef<Point>({ x: 0, y: 0 });
  const alignRef = useRef<boolean>(false);
  const startAlignPosRef = useRef<Point>({ x: 0, y: 0 });
  const magnetRef = useRef<boolean>(true);
  const magnetDistancePixelRef = useRef<number>(30);
  const visibleRef = useRef<boolean>(true);

  const appRef = useRef<Application | null>(null);
  const containerRef = useRef<Container | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);

  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const calculatedCrosshairPos = useRef<Point>({ x: 0, y: 0 });

  const CrosshairStyle = useRef<CrosshairStyles>({
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

    const considerOhlc = (ohlc: Ohlc | null): void => {
      if (!ohlc) return;

      let candleX: number;
      try {
        candleX = viewport.timestampToPixel(ohlc.t);
      } catch {
        return;
      }

      try { consider(candleX, viewport.priceToPixel(ohlc.o)); } catch {}
      try { consider(candleX, viewport.priceToPixel(ohlc.h)); } catch {}
      try { consider(candleX, viewport.priceToPixel(ohlc.l)); } catch {}
      try { consider(candleX, viewport.priceToPixel(ohlc.c)); } catch {}
    };

    const view = viewport.getTransformedView();

    let fromId = candleData.findBack(view.fromTs);
    let toId   = candleData.findBack(view.toTs);
    if (fromId === null) fromId = candleData.findFront(view.fromTs)
    if (toId === null) toId = candleData.findFront(view.toTs)

    if (fromId == null || toId == null) {
      throwAppError("NO_OHLC_DATA", "no OHLC data found in the target range");
    }

    const data = candleData.getBinRange(fromId, toId - fromId + 1);

    if (!data) {
      throwAppError("NO_OHLC_DATA", "no OHLC data found in the target range");
    }

    for (let i = 0; i < data.t.length; i++) {
      let candleX: number;

      try {
        candleX = viewport.timestampToPixel(Number(data.t[i]));
      } catch {
        continue;
      }

      try { consider(candleX, viewport.priceToPixel(Number(data.o[i]))); } catch {}
      try { consider(candleX, viewport.priceToPixel(Number(data.h[i]))); } catch {}
      try { consider(candleX, viewport.priceToPixel(Number(data.l[i]))); } catch {}
      try { consider(candleX, viewport.priceToPixel(Number(data.c[i]))); } catch {}
    }

    considerOhlc(candleData.getLast());

    return bestPoint;
  };

  const getPixel = (): Point => {
    const x = CrosshairPosRef.current.x;
    const y = CrosshairPosRef.current.y;

    if (alignRef.current) {
      const start = startAlignPosRef.current;
      const dx = Math.abs(x - start.x);
      const dy = Math.abs(y - start.y);

      // Mặc định ban đầu nếu chưa di chuyển
      if (dx === 0 && dy === 0) {
        return { x: start.x, y: start.y };
      }

      if (dx >= dy) {
        // Di chuyển theo trục X chủ đạo -> Khóa trục Y theo start.y
        let targetX = x;
        if (magnetRef.current) {
          // Tìm magnet dựa trên vị trí chuột hiện tại (x, y)
          const magnetPoint = getMagnetPixel(x, y);
          if (magnetPoint) {
            targetX = magnetPoint.x;
          }
        }
        return { x: targetX, y: start.y };
      } else {
        // Di chuyển theo trục Y chủ đạo -> Khóa trục X theo start.x
        let targetY = y;
        if (magnetRef.current) {
          // Tìm magnet dựa trên vị trí chuột hiện tại (x, y)
          const magnetPoint = getMagnetPixel(x, y);
          if (magnetPoint) {
            targetY = magnetPoint.y;
          }
        }
        return { x: start.x, y: targetY };
      }
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

    const { x, y } = calculatedCrosshairPos.current;
    const { w, h } = canvasSize.current;

    const style = CrosshairStyle.current;
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

  const refreshCrosshair = (): void => {
    calculatedCrosshairPos.current = getPixel();
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

    refreshCrosshair();
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
    calculatedCrosshairPos.current = { x: 0, y: 0 };
  };

  const setStyle = (style: CrosshairStyles): void => {
    validateCrosshairStyle(style);

    CrosshairStyle.current = {
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
    refreshCrosshair();
  };

  const onMouseLeave = (): void => {
    onScreenRef.current = false;
    alignRef.current = false;
    redrawGraphics();
  };

  const onMouseMove = (x: number, y: number): void => {
    if (isValidNumber(x)) CrosshairPosRef.current.x = x;
    if (isValidNumber(y)) CrosshairPosRef.current.y = y;

    refreshCrosshair();
  };

  const onKeyDown = (key: string): void => {
    if (key === "Shift" && !alignRef.current && onScreenRef.current) {
      const currentSnappedPos = getPixel();
      startAlignPosRef.current.x = currentSnappedPos.x;
      startAlignPosRef.current.y = currentSnappedPos.y;
      
      alignRef.current = true;
      refreshCrosshair();
    }
  };

  const onKeyUp = (key: string): void => {
    if (key === "Shift" && alignRef.current) {
      alignRef.current = false;
      refreshCrosshair();
    }
  };

  const setMagnet = (enable: boolean = true, distance: number = 50): void => {
    magnetRef.current = enable;
    magnetDistancePixelRef.current = isValidNumber(distance) && distance >= 0 ? distance : 50;
    refreshCrosshair();
  };

  const get = (): { timestamp: number; price: number } => {
    const { x, y } = calculatedCrosshairPos.current;

    return {
      timestamp: viewport.pixelToTimestamp(x),
      price: viewport.pixelToPrice(y),
    };
  };

  const apiRef = useRef<Crosshair | null>(null);

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