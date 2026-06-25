import { useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { SortedIndexedTimestampList, SortedIndexedPriceList } from "../shared/SortedIndexedList";
import type { CandleData } from "./useCandleData";
import type { Viewport } from "./useViewport";
import type { GridAxes } from "./useGridAxes";

//======================================================================================================
// PUBLIC
//======================================================================================================
export type Axes = {
  init                  : (app: Application)                     => void;
  draw                  : ()                                     => void;
  setStyle              : (style: AxesStyles)                    => void;

  setTimestampLabel     : (label: TimestampLabel)                => void;
  removeTimestampLabel  : (id: string)                           => void;
  setPriceLabel         : (label: PriceLabel)                    => void;
  removePriceLabel      : (id: string)                           => void;

  destroy               : ()                                     => void;
};

//======================================================================================================
// TYPES
//======================================================================================================

export type TimestampLabel = {
  id: string;
  timestamp: number;
  color: [number, number, number, number]; // argb, 255 base
  fontColor: [number, number, number];
};

export type PriceLabel = {
  id: string;
  price: number;
  color: [number, number, number, number]; // argb, 255 base
  fontColor: [number, number, number];
};

export type AxesStyles = {
  fontSize?: number;
  timestampPadding?: number;
  timestampOffset ?: number;
  pricePadding    ?: number;
  priceOffset     ?: number;
};

type CachedLabel = {
  container: Container;
  bg: Graphics;
  text: Text;
};

//======================================================================================================
// CONSTANTS & DEFAULTS
//======================================================================================================

const DEFAULT_STYLES: Required<AxesStyles> = {
  fontSize: 12,
  timestampPadding: 10,
  timestampOffset: 2,
  pricePadding: 7,
  priceOffset: 2,
};

//======================================================================================================
// HELPERS
//======================================================================================================

function formatFullTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

  const value = String(price);
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

//======================================================================================================
// HOOK
//======================================================================================================

export default function useAxes(
  candleData: CandleData,
  viewport: Viewport,
  gridAxes: GridAxes
): Axes {
  const appRef = useRef<Application | null>(null);
  const rootRef = useRef<Container | null>(null);
  const tsContainerRef = useRef<Container | null>(null);
  const priceContainerRef = useRef<Container | null>(null);

  const axesStyleRef = useRef<Required<AxesStyles>>({ ...DEFAULT_STYLES });
  const isEnabledTsRef = useRef<boolean>(true);
  const isEnabledPriceRef = useRef<boolean>(true);
  
  const timestampLabelsRef = useRef(new SortedIndexedTimestampList<TimestampLabel>());
  const priceLabelsRef     = useRef(new SortedIndexedPriceList<PriceLabel>());

  const tsCacheRef = useRef<Map<string, CachedLabel>>(new Map());
  const priceCacheRef = useRef<Map<string, CachedLabel>>(new Map());

  const ensureContainers = () => {
    if (rootRef.current) return;

    const root = new Container();
    root.label = "axes-hook-root";

    const tsContainer = new Container();
    tsContainer.label = "ts-labels-container";

    const priceContainer = new Container();
    priceContainer.label = "price-labels-container";

    root.addChild(tsContainer);
    root.addChild(priceContainer);

    rootRef.current = root;
    tsContainerRef.current = tsContainer;
    priceContainerRef.current = priceContainer;
  };

  const getOrCreateCachedLabel = (
    id: string,
    cache: Map<string, CachedLabel>,
    parent: Container
  ): CachedLabel => {
    if (cache.has(id)) {
      return cache.get(id)!;
    }

    const container = new Container();
    const bg = new Graphics();
    const text = new Text({
      text: "",
      style: { fontFamily: "Arial", align: "center" } as any,
    });
    
    text.anchor.set(0.5, 0.5);
    container.addChild(bg);
    container.addChild(text);
    parent.addChild(container);

    const cached: CachedLabel = { container, bg, text };
    cache.set(id, cached);
    return cached;
  };

  const cleanupUnusedLabels = (
    activeIds: Set<string>,
    cache: Map<string, CachedLabel>
  ) => {
    for (const [id, cached] of cache.entries()) {
      if (!activeIds.has(id)) {
        cached.container.destroy({ children: true });
        cache.delete(id);
      }
    }
  };

  const draw = () => {
    if (!rootRef.current || !tsContainerRef.current || !priceContainerRef.current) return;

    const style = axesStyleRef.current;
    const area = gridAxes.getVisibleArea();
    
    tsContainerRef.current.visible = isEnabledTsRef.current;
    priceContainerRef.current.visible = isEnabledPriceRef.current;

    // 1. Draw Timestamp Labels
    if (isEnabledTsRef.current) {
      const activeTsIds = new Set<string>();
      const tsItems = timestampLabelsRef.current.getAll();

      for (const item of tsItems) {
        const cached = getOrCreateCachedLabel(item.id, tsCacheRef.current, tsContainerRef.current);
        
        const x = viewport.timestampToPixel(item.timestamp);
        const y = area.timestampAxis.y;
        const axisH = area.timestampAxis.h;
        
        const timeText = formatFullTime(item.timestamp);
        cached.text.text = timeText;
        cached.text.style.fontSize = style.fontSize;
        cached.text.style.fill = rgbToHex(item.fontColor);
        
        const w = (style.timestampPadding * 2) + cached.text.width;
        const h = axisH + (style.timestampOffset * 2);

        // Edge checks: visibility constraints based on complete label frame dimensions
        const labelLeft = x - w / 2;
        const labelRight = x + w / 2;
        const axisLeft = area.timestampAxis.x;
        const axisRight = area.timestampAxis.x + area.timestampAxis.w;

        if (labelLeft < axisLeft || labelRight > axisRight) {
          cached.container.visible = false;
          continue;
        }

        activeTsIds.add(item.id);
        cached.container.visible = true;

        const fillStyle = argbToFill(item.color);

        cached.bg.clear();
        cached.bg.rect(-w / 2, -style.timestampOffset, w, h).fill({
            color: fillStyle.color,
            alpha: fillStyle.alpha
        } as any);

        cached.text.position.set(0, h / 2-style.timestampOffset);
        cached.container.position.set(x, y);
      }
      
      cleanupUnusedLabels(activeTsIds, tsCacheRef.current);
    }

    // 2. Draw Price Labels
    if (isEnabledPriceRef.current) {
      const activePriceIds = new Set<string>();
      const priceItems = priceLabelsRef.current.getAll();

      for (const item of priceItems) {
        const cached = getOrCreateCachedLabel(item.id, priceCacheRef.current, priceContainerRef.current);
        
        const y = viewport.priceToPixel(item.price);
        const x = area.priceAxis.x;
        const axisW = area.priceAxis.w;
        
        const w = axisW + (style.priceOffset * 2);
        const h = (style.pricePadding * 2) + style.fontSize;

        // Edge checks: visibility constraints based on complete label frame dimensions
        const labelTop = y - h / 2;
        const labelBottom = y + h / 2;
        const axisTop = area.priceAxis.y;
        const axisBottom = area.priceAxis.y + area.priceAxis.h;

        if (labelTop < axisTop || labelBottom > axisBottom) {
          cached.container.visible = false;
          continue;
        }

        activePriceIds.add(item.id);
        cached.container.visible = true;

        const point = candleData.getPoint ? candleData.getPoint() : 0;
        cached.text.text = formatPriceByPoint(item.price, point);
        cached.text.style.fontSize = style.fontSize;
        cached.text.style.fill = rgbToHex(item.fontColor);

        const fillStyle = argbToFill(item.color);

        cached.bg.clear();
        cached.bg.rect(-style.priceOffset, -h / 2, w, h).fill({
            color: fillStyle.color,
            alpha: fillStyle.alpha
        } as any);

        cached.text.position.set(w / 2 - style.priceOffset, 0);
        cached.container.position.set(x, y);
      }
      
      cleanupUnusedLabels(activePriceIds, priceCacheRef.current);
    }
  };

  const setStyle = (style: AxesStyles) => {
    if (style.fontSize !== undefined && style.fontSize !== null) {
      axesStyleRef.current.fontSize = style.fontSize;
    }
    if (style.timestampPadding !== undefined && style.timestampPadding !== null) {
      axesStyleRef.current.timestampPadding = style.timestampPadding;
    }
    if (style.timestampOffset !== undefined && style.timestampOffset !== null) {
      axesStyleRef.current.timestampOffset = style.timestampOffset;
    }
    if (style.pricePadding !== undefined && style.pricePadding !== null) {
      axesStyleRef.current.pricePadding = style.pricePadding;
    }
    if (style.priceOffset !== undefined && style.priceOffset !== null) {
      axesStyleRef.current.priceOffset = style.priceOffset;
    }

    draw();
  };

  const setEnable = (timestampAxis: boolean, priceAxis: boolean): void => {
    isEnabledTsRef.current = timestampAxis;
    isEnabledPriceRef.current = priceAxis;
    if (typeof gridAxes.setEnable === "function") {
      gridAxes.setEnable(timestampAxis, priceAxis);
    }
    draw();
  };

  const init = (app: Application) => {
    appRef.current = app;
    ensureContainers();
    
    if (rootRef.current && app.stage) {
      app.stage.addChild(rootRef.current);
    }

    viewport.addOnViewportChange("axes/init", draw);
    
    draw();
  };

  const setTimestampLabel = (label: TimestampLabel) => {
    timestampLabelsRef.current.insert(label);
    draw();
  };

  const removeTimestampLabel = (id: string) => {
    timestampLabelsRef.current.remove(id);
    draw();
  };

  const setPriceLabel = (label: PriceLabel) => {
    priceLabelsRef.current.insert(label);
    draw();
  };

  const removePriceLabel = (id: string) => {
    priceLabelsRef.current.remove(id);
    draw();
  };

  const destroy = () => {
    viewport.removeOnViewportChange ? viewport.removeOnViewportChange("axes/init") : null;

    for (const cached of tsCacheRef.current.values()) {
      cached.container.destroy({ children: true });
    }
    tsCacheRef.current.clear();

    for (const cached of priceCacheRef.current.values()) {
      cached.container.destroy({ children: true });
    }
    priceCacheRef.current.clear();

    if (rootRef.current) {
      rootRef.current.destroy({ children: true });
      rootRef.current = null;
    }
    tsContainerRef.current = null;
    priceContainerRef.current = null;
    appRef.current = null;
  };

  const apiRef = useRef({
    init,
    draw,
    setStyle,
    setTimestampLabel,
    removeTimestampLabel,
    setPriceLabel,
    removePriceLabel,
    destroy,
    setEnable
  });

  return apiRef.current;
}