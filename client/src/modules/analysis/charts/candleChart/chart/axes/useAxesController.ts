import { useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { CONFIG } from "../../shared/config";
import type { CandleData } from "../../market/hooks/useCandleData";
import type { Viewport } from "../viewport/useViewport";
import type { ViewController } from "../viewport/useViewController";
import type { Crosshair } from "../crosshair/useCrosshair";
import type { GridAxes, GridAxisRect } from "./useGridAxes";
import type { Axes } from "./useAxes";

//======================================================================================================
// TYPES
//======================================================================================================
export type AxesController = {
  init        : ( app: Application, setBrowserCursor: (cursor: string) => void )  => void;
  destroy     : ()                                                                => void;
  setStyle    : ( style: AxesControllerStyles )                                   => void;
  onMouseDown : ( x: number, y: number, button: number )                          => void;
  onMouseUp   : ()                                                                => void;
  onMouseLeave: ()                                                                => void;
  onMouseMove : ( x: number, y: number )                                          => void;
  onMouseEnter: ()                                                                => void;
  draw        : ()                                                                => void;
};

export type AxesControllerStyles = {
  priceAsix                 ?: boolean;
  timestampAsix             ?: boolean;

  crosshairFontSize         ?: number;
  crosshairFontColor        ?: [number, number, number];
  crosshairColor            ?: [number, number, number, number]; // argb
  crosshiarTimestampPadding ?: number;
  crosshiarTimestampOffset  ?: number;
  crosshiarPricePadding     ?: number;
  crosshiarPriceOffset      ?: number;

  lastPriceFontSize         ?: number;
  lastPriceFontColor        ?: [number, number, number];
  lastPriceColor            ?: [number, number, number, number]; // argb
  lastPricePadding          ?: number;
  lastPriceOffset           ?: number;

  lastPriceLineType         ?: "solid" | "dash";
  lastPriceLineThickness    ?: number;
  lastPriceLineDashWidth    ?: number;
  lastPriceLineDashSpace    ?: number;
};

//======================================================================================================
// DEFAULTS
//======================================================================================================

const DEFAULT_STYLES: Required<AxesControllerStyles> = {
  priceAsix: true,
  timestampAsix: true,

  crosshairFontSize: 10,
  crosshairFontColor: [255, 255, 255],
  crosshairColor: [255, 50, 50, 50],
  crosshiarTimestampPadding: 10,
  crosshiarTimestampOffset: 2,
  crosshiarPricePadding: 7,
  crosshiarPriceOffset: 2,

  lastPriceFontSize: 10,
  lastPriceFontColor: [255, 255, 255],
  lastPriceColor: [255, 100, 150, 255],
  lastPricePadding: 7,
  lastPriceOffset: 2,

  lastPriceLineType: "dash",
  lastPriceLineThickness: 1,
  lastPriceLineDashWidth: 10,
  lastPriceLineDashSpace: 5,
};

//======================================================================================================
// HELPERS
//======================================================================================================

function formatFullTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatPriceByPoint(price: number, point: number): string {
  function isValidNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  if (!isValidNumber(price)) return "0";
  if (!isValidNumber(point) || point === 0) return String(price);

  function insertDot(s: string, n: number): string {
    const padded = s.padStart(n + 1, '0');
    return padded.slice(0, -n) + '.' + padded.slice(-n);
  }

  function countDecimalsFromPoint(point: number): number {
    const s = String(point);
    return s.length - 1;
  }  

  const value = String(Math.round(price));
  return insertDot(value, countDecimalsFromPoint(point));
}

function argbToFill(argb: [number, number, number, number]) {
  return {
    color: (argb[1] << 16) | (argb[2] << 8) | argb[3],
    alpha: argb[0] / 255,
  };
}

function rgbToHex(rgb: [number, number, number]): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

function isInside(x: number, y: number, rect: GridAxisRect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function drawDashedLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dashWidth: number,
  dashSpace: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= 0) return;

  const dirX = dx / distance;
  const dirY = dy / distance;

  let pos = 0;

  while (pos < distance) {
    const dashEnd = Math.min(pos + dashWidth, distance);

    g.moveTo(
      x1 + dirX * pos,
      y1 + dirY * pos
    );

    g.lineTo(
      x1 + dirX * dashEnd,
      y1 + dirY * dashEnd
    );

    pos += dashWidth + dashSpace;
  }
}

//======================================================================================================
// HOOK
//======================================================================================================

export default function useAxesController(
  candleData: CandleData,
  viewport: Viewport,
  viewportController: ViewController,
  crosshair: Crosshair,
  gridAxes: GridAxes,
  axes: Axes
): AxesController {
  const appRef = useRef<Application | null>(null);
  const setBrowserCursorRef = useRef<(cursor: string) => void>(() => {});
  
  // Local state
  const styleRef = useRef<Required<AxesControllerStyles>>({ ...DEFAULT_STYLES });
  const timestampScalingRef = useRef<boolean>(false);
  const priceScalingRef = useRef<boolean>(false);
  const startScalePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cursorLabelVisibleRef = useRef<boolean>(false);

  // PIXI Containers & Graphics
  const rootRef = useRef<Container | null>(null);
  const crosshairTsBgRef = useRef<Graphics | null>(null);
  const crosshairTsTextRef = useRef<Text | null>(null);
  const crosshairPriceBgRef = useRef<Graphics | null>(null);
  const crosshairPriceTextRef = useRef<Text | null>(null);
  
  const lastPriceLineRef = useRef<Graphics | null>(null);
  const lastPriceBgRef = useRef<Graphics | null>(null);
  const lastPriceTextRef = useRef<Text | null>(null);

  const init = (app: Application, setBrowserCursor: (cursor: string) => void) => {
    appRef.current = app;
    setBrowserCursorRef.current = setBrowserCursor;

    const root = new Container();
    root.label = "axes-controller-root";

    // --- Crosshair Elements ---
    const crosshairTsBg = new Graphics();
    const crosshairTsText = new Text({ text: "", style: { fontFamily: "Arial", align: "center" } as any });
    crosshairTsText.anchor.set(0.5, 0.5);
    
    const crosshairPriceBg = new Graphics();
    const crosshairPriceText = new Text({ text: "", style: { fontFamily: "Arial", align: "center" } as any });
    crosshairPriceText.anchor.set(0.5, 0.5);

    // --- Last Price Elements ---
    const lastPriceLine = new Graphics();
    const lastPriceBg = new Graphics();
    const lastPriceText = new Text({ text: "", style: { fontFamily: "Arial", align: "center" } as any });
    lastPriceText.anchor.set(0.5, 0.5);

    root.addChild(crosshairTsBg, crosshairTsText);
    root.addChild(crosshairPriceBg, crosshairPriceText);
    root.addChild(lastPriceLine, lastPriceBg, lastPriceText);

    rootRef.current = root;
    crosshairTsBgRef.current = crosshairTsBg;
    crosshairTsTextRef.current = crosshairTsText;
    crosshairPriceBgRef.current = crosshairPriceBg;
    crosshairPriceTextRef.current = crosshairPriceText;
    lastPriceLineRef.current = lastPriceLine;
    lastPriceBgRef.current = lastPriceBg;
    lastPriceTextRef.current = lastPriceText;

    if (app.stage) {
      app.stage.addChild(root);
    }

    candleData.addOnLastDataChange("axesController/init", draw)
    candleData.addOnDataPolling("axesController/init", draw)
    viewport.addOnViewportChange("axesController/init", draw)
  };
  
  const destroy = () => {
    if (rootRef.current) {
      rootRef.current.destroy({ children: true });
      rootRef.current = null;
    }
    
    candleData.removeOnLastDataChange("axesController/init")
    candleData.removeOnDataPolling("axesController/init")
    viewport.removeOnViewportChange("axesController/init")

    appRef.current = null;
    setBrowserCursorRef.current = () => {};
  };

  const setStyle = (style: AxesControllerStyles) => {
    const currentStyle = styleRef.current;
    
    if (style.priceAsix !== undefined && style.priceAsix !== null) {
      currentStyle.priceAsix = style.priceAsix;
    }
    if (style.timestampAsix !== undefined && style.timestampAsix !== null) {
      currentStyle.timestampAsix = style.timestampAsix;
    }
    
    // Copy other properties
    Object.assign(currentStyle, style);

    gridAxes.setEnable(currentStyle.timestampAsix, currentStyle.priceAsix);
    axes.setEnable(currentStyle.timestampAsix, currentStyle.priceAsix);
    
    draw();
  };

  const onMouseDown = (x: number, y: number, button: number) => {
    if (button !== 0) return;

    const area = gridAxes.getVisibleArea();
    const style = styleRef.current;

    if (style.timestampAsix && isInside(x, y, area.timestampAxis)) {
      timestampScalingRef.current = true;
      startScalePosRef.current = { x, y };
    } 
    else if (style.priceAsix && isInside(x, y, area.priceAxis)) {
      priceScalingRef.current = true;
      startScalePosRef.current = { x, y };
      viewportController.setEnable({ scaleTimestamp: false, scalePrice: true, panTimestamp: false, panPrice: false });
    }
    else if (isInside(x, y, area.settingPanel)) {
      const zone = area.settingPanel;
      if (x > zone.x && x < zone.x + zone.w / 2) {
        setStyle({ timestampAsix: !style.timestampAsix });
      } else {
        setStyle({ priceAsix: !style.priceAsix });
      }
    }
  };

  const onMouseUp = () => {
    if (timestampScalingRef.current || priceScalingRef.current) {
      viewport.flush();
    }
    timestampScalingRef.current = false;
    priceScalingRef.current = false;
  };

  const onMouseLeave = () => {
    if (timestampScalingRef.current || priceScalingRef.current) {
      viewport.flush();
    }
    timestampScalingRef.current = false;
    priceScalingRef.current = false;
    cursorLabelVisibleRef.current = false;
    draw();
  };

  const onMouseEnter = () => {
    cursorLabelVisibleRef.current = true;
    draw();
  };

  const onMouseMove = (x: number, y: number) => {
    const area = gridAxes.getVisibleArea();
    const style = styleRef.current;
    const app = appRef.current;
    const setCursor = setBrowserCursorRef.current;

    if (!app) return;

    if (style.timestampAsix && isInside(x, y, area.timestampAxis)) {
      crosshair.setVisible(false);
      setCursor("ew-resize");
      cursorLabelVisibleRef.current = false
      viewportController.setEnable({ scaleTimestamp: true, scalePrice: false, panTimestamp: false, panPrice: false });
    } 
    else if (style.priceAsix && isInside(x, y, area.priceAxis)) {
      crosshair.setVisible(false);
      setCursor("ns-resize");
      cursorLabelVisibleRef.current = false
      viewportController.setEnable({ scaleTimestamp: false, scalePrice: true, panTimestamp: false, panPrice: false });
    }
    else if (isInside(x, y, area.settingPanel)) {
      crosshair.setVisible(false);
      viewportController.setEnable({ scaleTimestamp: false, scalePrice: false, panTimestamp: false, panPrice: false });
      cursorLabelVisibleRef.current = false
      setCursor("pointer");
    }
    else {
      crosshair.setVisible(true);
      viewportController.setEnable({ scaleTimestamp: true, scalePrice: true, panTimestamp: true, panPrice: true });
      cursorLabelVisibleRef.current = true
      setCursor("crosshair");
    }

    if (timestampScalingRef.current) {
      const view = viewport.getTransformedView();
      const dx = x - startScalePosRef.current.x;

      const anchorPixelX = viewport.timestampToPixel(view.toTs);

      const scale = Math.exp(
        dx * CONFIG.AXES_CONTROLLER.SCALE_RATIO / app.screen.width
      );

      viewport.setScaleTimestamp(scale, anchorPixelX, false);
    }

    if (priceScalingRef.current) {
      const view = viewport.getTransformedView();
      const dy = y - startScalePosRef.current.y;

      const avgPrice = (view.fromPrice + view.toPrice) / 2;
      const anchorPixelY = viewport.priceToPixel(avgPrice);

      const scale = Math.exp(
        dy * CONFIG.AXES_CONTROLLER.SCALE_RATIO / app.screen.height
      );

      viewport.setScalePrice(scale, anchorPixelY, false);
    }

    draw()
  };

  const draw = () => {
    if (!rootRef.current || !appRef.current) return;

    const style = styleRef.current;
    const area = gridAxes.getVisibleArea();
    const point = candleData.getPoint ? candleData.getPoint() : 0;
    
    const crosshairVals = crosshair.get();
    const lastCandle = candleData.getLast();

    // -------------------------------------------------------------------------
    // 1. Crosshair Labels
    // -------------------------------------------------------------------------
    if (
      crosshairTsBgRef.current &&
      crosshairTsTextRef.current &&
      style.timestampAsix &&
      cursorLabelVisibleRef.current
    ) {
      const x = viewport.timestampToPixel(crosshairVals.timestamp);
      const y = area.timestampAxis.y;
      const axisH = area.timestampAxis.h;
      
      const timeStr = formatFullTime(crosshairVals.timestamp);
      crosshairTsTextRef.current.text = timeStr;
      crosshairTsTextRef.current.style.fontSize = style.crosshairFontSize;
      crosshairTsTextRef.current.style.fill = rgbToHex(style.crosshairFontColor);
      
      const w = (style.crosshiarTimestampPadding * 2) + crosshairTsTextRef.current.width;
      const h = axisH + (style.crosshiarTimestampOffset * 2);

      const fillStyle = argbToFill(style.crosshairColor);
      crosshairTsBgRef.current.clear();
      crosshairTsBgRef.current.rect(-w / 2, -style.crosshiarTimestampOffset, w, h).fill({ color: fillStyle.color, alpha: fillStyle.alpha } as any);
      
      crosshairTsTextRef.current.position.set(0, h / 2 - style.crosshiarTimestampOffset);
      crosshairTsBgRef.current.position.set(x, y);
      crosshairTsTextRef.current.position.set(x, y + h / 2 - style.crosshiarTimestampOffset);
      
      crosshairTsBgRef.current.visible = true;
      crosshairTsTextRef.current.visible = true;
    } else if (crosshairTsBgRef.current && crosshairTsTextRef.current) {
      crosshairTsBgRef.current.visible = false;
      crosshairTsTextRef.current.visible = false;
    }

    if (
      crosshairPriceBgRef.current &&
      crosshairPriceTextRef.current &&
      style.priceAsix &&
      cursorLabelVisibleRef.current
    ) {
      const y = viewport.priceToPixel(crosshairVals.price);
      const x = area.priceAxis.x;
      const axisW = area.priceAxis.w;
      
      const priceStr = formatPriceByPoint(crosshairVals.price, point);
      crosshairPriceTextRef.current.text = priceStr;
      crosshairPriceTextRef.current.style.fontSize = style.crosshairFontSize;
      crosshairPriceTextRef.current.style.fill = rgbToHex(style.crosshairFontColor);
      
      const w = axisW + (style.crosshiarPriceOffset * 2);
      const h = (style.crosshiarPricePadding * 2) + style.crosshairFontSize;

      const fillStyle = argbToFill(style.crosshairColor);
      crosshairPriceBgRef.current.clear();
      crosshairPriceBgRef.current.rect(-style.crosshiarPriceOffset, -h / 2, w, h).fill({ color: fillStyle.color, alpha: fillStyle.alpha } as any);
      
      crosshairPriceBgRef.current.position.set(x, y);
      crosshairPriceTextRef.current.position.set(x + w / 2 - style.crosshiarPriceOffset, y);
      
      crosshairPriceBgRef.current.visible = true;
      crosshairPriceTextRef.current.visible = true;
    } else if (crosshairPriceBgRef.current && crosshairPriceTextRef.current) {
      crosshairPriceBgRef.current.visible = false;
      crosshairPriceTextRef.current.visible = false;
    }

    // -------------------------------------------------------------------------
    // 2. Last Price Label & Line
    // -------------------------------------------------------------------------
    if (lastCandle && lastPriceLineRef.current && lastPriceBgRef.current && lastPriceTextRef.current && style.priceAsix) {
      const priceY = viewport.priceToPixel(lastCandle.c);
      const labelX = area.priceAxis.x;
      const axisW = area.priceAxis.w;

      // Label Part
      const remainTimeStr = candleData.getRemainTime ? candleData.getRemainTime() : "";
      const textContent = `${formatPriceByPoint(lastCandle.c, point)}\n${remainTimeStr}`.trim();
      
      lastPriceTextRef.current.text = textContent;
      lastPriceTextRef.current.style.fontSize = style.lastPriceFontSize;
      lastPriceTextRef.current.style.fill = rgbToHex(style.lastPriceFontColor);
      
      const textHeight = lastPriceTextRef.current.height;
      const w = axisW + (style.lastPriceOffset * 2);
      const h = (style.lastPricePadding * 2) + textHeight;

      const fillStyle = argbToFill(style.lastPriceColor);
      lastPriceBgRef.current.clear();
      lastPriceBgRef.current.rect(-style.lastPriceOffset, -h / 2, w, h).fill({ color: fillStyle.color, alpha: fillStyle.alpha } as any);
      
      lastPriceBgRef.current.position.set(labelX, priceY);
      lastPriceTextRef.current.position.set(labelX + w / 2 - style.lastPriceOffset, priceY);

      // Line Part
      lastPriceLineRef.current.clear();
      const candlePixelX = viewport.timestampToPixel(lastCandle.t);
      
      if (candlePixelX < labelX) {
        lastPriceLineRef.current.clear();

        if (style.lastPriceLineType === "solid") {
          lastPriceLineRef.current.moveTo(candlePixelX, priceY);
          lastPriceLineRef.current.lineTo(labelX, priceY);
        } else {
          drawDashedLine(
            lastPriceLineRef.current,
            candlePixelX,
            priceY,
            labelX,
            priceY,
            style.lastPriceLineDashWidth,
            style.lastPriceLineDashSpace
          );
        }

        lastPriceLineRef.current.stroke({
          color: rgbToHex([
            style.lastPriceColor[1],
            style.lastPriceColor[2],
            style.lastPriceColor[3]
          ]),
          alpha: style.lastPriceColor[0] / 255,
          width: style.lastPriceLineThickness
        });
      }

      lastPriceBgRef.current.visible = true;
      lastPriceTextRef.current.visible = true;
      lastPriceLineRef.current.visible = true;
    } else if (lastPriceLineRef.current && lastPriceBgRef.current && lastPriceTextRef.current) {
      lastPriceBgRef.current.visible = false;
      lastPriceTextRef.current.visible = false;
      lastPriceLineRef.current.visible = false;
    }
  };

  const apiRef = useRef({
    init,
    destroy,
    setStyle,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onMouseEnter,
    onMouseMove,
    draw
  });

  return apiRef.current;
}