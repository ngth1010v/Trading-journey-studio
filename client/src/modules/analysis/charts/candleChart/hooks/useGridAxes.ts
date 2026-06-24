import { useRef } from "react";
import {
  Application,
  Assets,
  BitmapFont,
  BitmapText,
  Container,
  Graphics,
  Text,
} from "pixi.js";
import { throwAppError } from "../../../../../shared/appError";
import { CONFIG } from "../shared/config";
import type { CandleData } from "./useCandleData";
import type { Viewport } from "./useViewport";

//======================================================================================================
// PUBLIC
//======================================================================================================
export type GridAxes = {
  init            (app: Application)          : void;
  destroy         ()                          : void;
  setStyle        (style: GridGridAxesStyles) : void;
  draw            ()                          : void;
  getVisibleArea  ()                          : GridGridAxesVisibleArea;
};

export type GridGridAxesStyles = {
  priceAxis?: boolean;
  timestampAxis?: boolean;

  margin?: number;
  spacing?: number; // px, space between priceAxis - settingPanel and between timestampAxis - settingPanel
  padding?: number; // px
  borderThickness?: number;
  fontSize?: number; // px
  color?: [number, number, number, number]; // argb base on 255
  fontColor?: [number, number, number];
  borderColor?: [number, number, number, number]; // argb base on 255
};

export type GridAxisRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GridGridAxesVisibleArea = {
  timestampAxis: GridAxisRect;
  priceAxis: GridAxisRect;
};


//======================================================================================================
// CONSTANT
//======================================================================================================
const FONT_ASSET_URL = "assets/fonts/Datatype.fnt";

const DEFAULT_STYLE: Required<GridGridAxesStyles> = {
  priceAxis: true,
  timestampAxis: true,
  margin: 10,
  spacing: 5,
  padding: 5,
  borderThickness: 2,
  fontSize: 12,
  color: [200, 22, 22, 24], // [a, r, g, b] based on 255
  fontColor: [150, 150, 150],
  borderColor: [255, 50, 50, 50], // [a, r, g, b] based on 255
};

const EMPTY_RECT: GridAxisRect = { x: 0, y: 0, w: 0, h: 0 };

//======================================================================================================
// HELPER
//======================================================================================================
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbaToFillStyle(argb: [number, number, number, number]): { color: number; alpha: number } {
  return {
    color: (clampByte(argb[1]) << 16) | (clampByte(argb[2]) << 8) | clampByte(argb[3]),
    alpha: clampByte(argb[0]) / 255,
  };
}

function rgbToHex(rgb: [number, number, number]): number {
  return (clampByte(rgb[0]) << 16) | (clampByte(rgb[1]) << 8) | clampByte(rgb[2]);
}

function pad2(value: number): string {
  return String(Math.trunc(Math.abs(value))).padStart(2, "0");
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatTimeHHMMSS(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatTimeHHMM(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatTimeHH00(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:00`;
}

function formatTimestampByStep(ts: number, step: number): string {
  if (step < 60 * 1000) return formatTimeHHMMSS(ts);
  if (step < 60 * 60 * 1000) return formatTimeHHMM(ts);
  if (step < 24 * 60 * 60 * 1000) return formatTimeHH00(ts);
  return formatDate(ts);
}

function countDecimalsFromPoint(point: number): number {
  const s = String(point);
  return s.length - 1;
}

function formatPriceByPoint(price: number, point: number): string {
  if (!isValidNumber(price)) return "0";
  if (!isValidNumber(point) || point === 0) return String(price);

  function insertDot(s: string, n: number): string {
    const padded = s.padStart(n + 1, '0');
    return padded.slice(0, -n) + '.' + padded.slice(-n);
  }

  const value = String(price);
  return insertDot(value, countDecimalsFromPoint(point));
}

function approxTextWidth(text: string, fontSize: number): number {
  return Math.max(1, text.length) * fontSize * 0.62;
}

function makeNiceSteps(minStep: number, maxStep: number): number[] {
  const steps: number[] = [];
  const seen = new Set<number>();
  const safeMin = Math.max(1, Math.floor(minStep));
  const safeMax = Math.max(safeMin, Math.floor(maxStep));
  const multipliers = [1, 2, 5];

  for (let pow = 0; pow < 20; pow += 1) {
    const base = 10 ** pow;
    for (const m of multipliers) {
      const step = m * base;
      if (step < safeMin) continue;
      if (step > safeMax) {
        if (steps.length === 0) steps.push(safeMin);
        return steps;
      }
      if (!seen.has(step)) {
        seen.add(step);
        steps.push(step);
      }
    }
  }

  if (steps.length === 0) steps.push(safeMin);
  return steps;
}

function alignUp(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
}

function safeIterateRange(start: number, end: number, step: number): number[] {
  if (!isValidNumber(start) || !isValidNumber(end) || !isValidNumber(step) || step <= 0) {
    return [];
  }

  const result: number[] = [];
  const maxIter = 1000;
  let current = start;
  let iter = 0;

  while (current <= end + step * 0.5 && iter < maxIter) {
    result.push(current);
    current += step;
    iter += 1;
  }

  return result;
}

function destroyChildren(container: Container): void {
  const children = [...container.children];
  for (const child of children) child.destroy({ children: true });
  container.removeChildren();
}

function centerAnchor(node: any): void {
  if (node?.anchor?.set) node.anchor.set(0.5, 0.5);
}

function createLabel(args: {
  text: string;
  fontSize: number;
  color: number;
  useBitmapFont: boolean;
  bitmapFontFamily: string;
}): Container {
  const { text, fontSize, color, useBitmapFont, bitmapFontFamily } = args;

  if (useBitmapFont) {
    const label = new BitmapText({
      text,
      style: {
        fontFamily: bitmapFontFamily,
        fontSize,
        tint: color,
      } as any,
    }) as any;

    centerAnchor(label);
    return label;
  }

  const label = new Text({
    text,
    style: {
      fontFamily: "Arial",
      fontSize,
      fill: color,
      align: "center",
    } as any,
  }) as any;

  centerAnchor(label);
  return label;
}

//======================================================================================================
// HOOK
//======================================================================================================
export default function useGridAxes(viewport: Viewport, candleData: CandleData): GridAxes {
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef(viewport);
  const candleDataRef = useRef(candleData);

  const axesStyleRef = useRef<Required<GridGridAxesStyles>>({ ...DEFAULT_STYLE });

  const rootRef = useRef<Container | null>(null);

  const timestampPanelBgRef = useRef<Graphics | null>(null);
  const timestampTicksRef = useRef<Graphics | null>(null);
  const timestampLabelsRef = useRef<Container | null>(null);

  const pricePanelBgRef = useRef<Graphics | null>(null);
  const priceTicksRef = useRef<Graphics | null>(null);
  const priceLabelsRef = useRef<Container | null>(null);

  const settingPanelBgRef = useRef<Graphics | null>(null);
  const settingDividerRef = useRef<Graphics | null>(null);
  const timestampToggleBgRef = useRef<Graphics | null>(null);
  const priceToggleBgRef = useRef<Graphics | null>(null);
  const timestampIconRef = useRef<Text | null>(null);
  const priceIconRef = useRef<Text | null>(null);

  const visibleAreaRef = useRef<GridGridAxesVisibleArea>({
    timestampAxis: { ...EMPTY_RECT },
    priceAxis: { ...EMPTY_RECT },
  });

  const fontLoadedRef = useRef(false);
  const fontNameRef = useRef("Datatype");
  const assetsPromiseRef = useRef<Promise<void> | null>(null);
  const destroyedRef = useRef(false);

  const loadAssets = (): Promise<void> => {
    if (assetsPromiseRef.current) return assetsPromiseRef.current;

    assetsPromiseRef.current = (async () => {
      try {
        await Assets.load(FONT_ASSET_URL);

        const available = Object.keys((BitmapFont as any).available ?? {});
        if (available.includes("Datatype")) {
          fontNameRef.current = "Datatype";
          fontLoadedRef.current = true;
        } else if (available.length > 0) {
          fontNameRef.current = available[0];
          fontLoadedRef.current = true;
        } else {
          fontLoadedRef.current = false;
        }

        if (!destroyedRef.current) {
          draw();
        }
      } catch (err) {
        console.warn("GridAxes asset loading failed:", err);
        fontLoadedRef.current = false;
      }
    })();

    return assetsPromiseRef.current;
  };

  const ensureDisplayObjects = (): void => {
    if (rootRef.current) return;

    const root = new Container();
    root.label = "axes-root";

    const timestampPanelBg = new Graphics();
    const timestampTicks = new Graphics();
    const timestampLabels = new Container();

    const pricePanelBg = new Graphics();
    const priceTicks = new Graphics();
    const priceLabels = new Container();

    const settingPanelBg = new Graphics();
    const settingDivider = new Graphics();
    const timestampToggleBg = new Graphics();
    const priceToggleBg = new Graphics();

    const timestampIcon = new Text({ text: "T", style: { fontFamily: "Arial", align: "center" } as any }) as any;
    const priceIcon = new Text({ text: "P", style: { fontFamily: "Arial", align: "center" } as any }) as any;
    timestampIcon.visible = false;
    priceIcon.visible = false;
    centerAnchor(timestampIcon);
    centerAnchor(priceIcon);

    root.addChild(timestampPanelBg);
    root.addChild(timestampTicks);
    root.addChild(timestampLabels);

    root.addChild(pricePanelBg);
    root.addChild(priceTicks);
    root.addChild(priceLabels);

    root.addChild(settingPanelBg);
    root.addChild(settingDivider);
    root.addChild(timestampToggleBg);
    root.addChild(priceToggleBg);
    root.addChild(timestampIcon);
    root.addChild(priceIcon);

    rootRef.current = root;

    timestampPanelBgRef.current = timestampPanelBg;
    timestampTicksRef.current = timestampTicks;
    timestampLabelsRef.current = timestampLabels;

    pricePanelBgRef.current = pricePanelBg;
    priceTicksRef.current = priceTicks;
    priceLabelsRef.current = priceLabels;

    settingPanelBgRef.current = settingPanelBg;
    settingDividerRef.current = settingDivider;
    timestampToggleBgRef.current = timestampToggleBg;
    priceToggleBgRef.current = priceToggleBg;
    timestampIconRef.current = timestampIcon;
    priceIconRef.current = priceIcon;
  };

  const drawPanelBackground = (
    graphics: Graphics,
    rect: GridAxisRect,
    bgRgba: [number, number, number, number],
    borderRgba: [number, number, number, number],
    borderThickness: number,
  ): void => {
    graphics.clear();

    if (rect.w <= 0 || rect.h <= 0) return;

    const bg = rgbaToFillStyle(bgRgba);
    const border = rgbaToFillStyle(borderRgba);

    graphics.rect(rect.x, rect.y, rect.w, rect.h).fill(bg as any);
    if (borderThickness > 0) {
      graphics.rect(rect.x, rect.y, rect.w, rect.h).stroke({
        color: border.color,
        alpha: border.alpha,
        width: borderThickness,
      } as any);
    }
  };

  const getVisibleTimestamps = (panel: GridAxisRect): { fromTs: number; toTs: number } | null => {
    const vp = viewportRef.current;
    if (panel.w <= 0) return null;

    try {
      const a = vp.pixelToTimestamp(panel.x);
      const b = vp.pixelToTimestamp(panel.x + panel.w);
      return { fromTs: Math.min(a, b), toTs: Math.max(a, b) };
    } catch {
      return null;
    }
  };

  const getVisiblePrices = (panel: GridAxisRect): { fromPrice: number; toPrice: number } | null => {
    const vp = viewportRef.current;
    if (panel.h <= 0) return null;

    try {
      const a = vp.pixelToPrice(panel.y + panel.h);
      const b = vp.pixelToPrice(panel.y);
      return { fromPrice: Math.min(a, b), toPrice: Math.max(a, b) };
    } catch {
      return null;
    }
  };

  const selectTimestampStep = (panel: GridAxisRect): number => {
    const visible = getVisibleTimestamps(panel);
    if (!visible) return 1000;

    const vp = viewportRef.current;
    const style = axesStyleRef.current;
    const spacingRatio = CONFIG?.AXES?.TIME_SPACING_RATIO ?? 1;

    const range = Math.max(1000, visible.toTs - visible.fromTs);
    const candidates = makeNiceSteps(1000, range);

    let chosen = candidates[0] ?? 1000;
    const thresholdBase = style.fontSize * spacingRatio;

    for (const step of candidates) {
      const pxGap = Math.abs(vp.timestampToPixel(visible.fromTs + step) - vp.timestampToPixel(visible.fromTs));
      const sampleText = formatTimestampByStep(visible.fromTs, step);
      const sampleWidth = approxTextWidth(sampleText, style.fontSize);

      chosen = step;
      if (pxGap >= Math.max(thresholdBase, sampleWidth * spacingRatio)) {
        break;
      }
    }

    return chosen;
  };

  const selectPriceStep = (panel: GridAxisRect): number => {
    const visible = getVisiblePrices(panel);
    if (!visible) return 1;

    const vp = viewportRef.current;
    const style = axesStyleRef.current;
    const spacingRatio = CONFIG?.AXES?.PRICE_SPACING_RATIO ?? 1;

    const range = Math.max(1, visible.toPrice - visible.fromPrice);

    const scaleBase = 10 ** Math.max(0, Math.floor(Math.log10(range)));
    const candidates = makeNiceSteps(1, Math.max(scaleBase * 10, range * 2));

    let chosen = candidates[0] ?? 1;
    const thresholdBase = style.fontSize * spacingRatio;

    for (const step of candidates) {
      const pxGap = Math.abs(vp.priceToPixel(visible.fromPrice + step) - vp.priceToPixel(visible.fromPrice));
      const fontSize = axesStyleRef.current.fontSize;

      chosen = step;
      if (pxGap >= Math.max(thresholdBase, fontSize * spacingRatio)) {
        break;
      }
    }

    return chosen;
  };

  const buildTimestampAxisLayout = (
    screenW: number,
    screenH: number,
    render: boolean,
  ): { panel: GridAxisRect; step: number } => {
    const style = axesStyleRef.current;
    const margin = style.margin;
    const spacing = style.spacing;
    const padding = style.padding;
    const fontSize = style.fontSize;

    const priceWidth = (() => {
      try {
        const priceLayout = buildPriceAxisLayout(screenW, screenH, false);
        return priceLayout.panel.w;
      } catch {
        return padding + approxTextWidth("0", fontSize) + padding;
      }
    })();

    const panel: GridAxisRect = {
      x: margin,
      y: Math.max(0, screenH - margin - (padding + fontSize + padding)),
      w: Math.max(0, screenW - 2 * margin - priceWidth - spacing),
      h: padding + fontSize + padding,
    };

    const step = selectTimestampStep(panel);

    if (!render) return { panel, step };

    const tickGraphics = timestampTicksRef.current;
    const labelContainer = timestampLabelsRef.current;
    if (!tickGraphics || !labelContainer) return { panel, step };

    tickGraphics.clear();
    destroyChildren(labelContainer);

    if (panel.w <= 0 || panel.h <= 0) return { panel, step };

    const visible = getVisibleTimestamps(panel);
    if (!visible) return { panel, step };

    const fill = rgbaToFillStyle(style.color);
    const fontHex = rgbToHex(style.fontColor);
    const useBitmap = fontLoadedRef.current;

    const first = alignUp(visible.fromTs, step);
    const ticks = safeIterateRange(first, visible.toTs, step);

    for (const ts of ticks) {
      const x = viewportRef.current.timestampToPixel(ts);
      if (x < panel.x - 1 || x > panel.x + panel.w + 1) continue;

      const label = formatTimestampByStep(ts, step);
      const node = createLabel({
        text: label,
        fontSize,
        color: fontHex,
        useBitmapFont: useBitmap,
        bitmapFontFamily: fontNameRef.current,
      });

      const labelWidth = Math.max(1, (node as any).width ?? approxTextWidth(label, fontSize));
      const halfW = labelWidth * 0.5;
      const minX = panel.x + halfW + padding;
      const maxX = panel.x + panel.w - halfW - padding;

      if (x < minX || x > maxX) {
        node.destroy({ children: true });
        continue;
      }

      tickGraphics.moveTo(x, panel.y).lineTo(x, panel.y + 7).stroke({
        color: fill.color,
        alpha: fill.alpha,
        width: 1,
      } as any);

      node.position.set(x, panel.y + panel.h * 0.52);
      labelContainer.addChild(node);
    }

    tickGraphics.moveTo(panel.x, panel.y).lineTo(panel.x + panel.w, panel.y).stroke({
      color: fill.color,
      alpha: fill.alpha,
      width: 1,
    } as any);

    return { panel, step };
  };

  const buildPriceAxisLayout = (
    screenW: number,
    screenH: number,
    render: boolean,
  ): { panel: GridAxisRect; step: number } => {
    const style = axesStyleRef.current;
    const margin = style.margin;
    const spacing = style.spacing;
    const padding = style.padding;
    const fontSize = style.fontSize;
    const timestampH = padding + fontSize + padding;

    const panel: GridAxisRect = {
      x: 0,
      y: margin,
      w: padding + approxTextWidth("0", fontSize) + padding,
      h: Math.max(0, screenH - 2 * margin - timestampH - spacing),
    };

    const visible = getVisiblePrices(panel);
    if (visible) {
      const step = selectPriceStep(panel);
      const point = candleDataRef.current.getPoint();
      const first = alignUp(visible.fromPrice, step);
      const values = safeIterateRange(first, visible.toPrice, step);
      const labels = values.map((price) => formatPriceByPoint(price, point));
      const maxLabelWidth = labels.length > 0
        ? Math.max(...labels.map((s) => approxTextWidth(s, fontSize)))
        : approxTextWidth("0", fontSize);

      panel.w = Math.max(panel.w, padding + maxLabelWidth + padding);
    }

    panel.x = Math.max(0, screenW - margin - panel.w);

    const step = selectPriceStep(panel);

    if (!render) return { panel, step };

    const tickGraphics = priceTicksRef.current;
    const labelContainer = priceLabelsRef.current;
    if (!tickGraphics || !labelContainer) return { panel, step };

    tickGraphics.clear();
    destroyChildren(labelContainer);

    if (panel.w <= 0 || panel.h <= 0) return { panel, step };

    const visible2 = getVisiblePrices(panel);
    if (!visible2) return { panel, step };

    const fill = rgbaToFillStyle(style.color);
    const fontHex = rgbToHex(style.fontColor);
    const point = candleDataRef.current.getPoint();
    const useBitmap = fontLoadedRef.current;

    const first = alignUp(visible2.fromPrice, step);
    const ticks = safeIterateRange(first, visible2.toPrice, step);

    for (const price of ticks) {
      const y = viewportRef.current.priceToPixel(price);
      if (y < panel.y - 1 || y > panel.y + panel.h + 1) continue;

      const label = formatPriceByPoint(price, point);
      const node = createLabel({
        text: label,
        fontSize,
        color: fontHex,
        useBitmapFont: useBitmap,
        bitmapFontFamily: fontNameRef.current,
      });

      const labelHeight = Math.max(1, (node as any).height ?? fontSize);
      const halfH = labelHeight * 0.5;
      const minY = panel.y + halfH;
      const maxY = panel.y + panel.h - halfH;

      if (y < minY || y > maxY) {
        node.destroy({ children: true });
        continue;
      }

      tickGraphics.moveTo(panel.x + panel.w - 7, y).lineTo(panel.x + panel.w, y).stroke({
        color: fill.color,
        alpha: fill.alpha,
        width: 1,
      } as any);

      node.position.set(panel.x + panel.w * 0.5, y);
      labelContainer.addChild(node);
    }

    tickGraphics.moveTo(panel.x + panel.w, panel.y).lineTo(panel.x + panel.w, panel.y + panel.h).stroke({
      color: fill.color,
      alpha: fill.alpha,
      width: 1,
    } as any);

    return { panel, step };
  };

  const drawSettingPanel = (timestampRect: GridAxisRect, priceRect: GridAxisRect): void => {
    const style = axesStyleRef.current;
    const bg = settingPanelBgRef.current;
    const divider = settingDividerRef.current;
    const leftBg = timestampToggleBgRef.current;
    const rightBg = priceToggleBgRef.current;
    const leftIcon = timestampIconRef.current;
    const rightIcon = priceIconRef.current;

    if (!bg || !divider || !leftBg || !rightBg || !leftIcon || !rightIcon) return;

    const panel: GridAxisRect = {
      x: priceRect.x,
      y: timestampRect.y,
      w: priceRect.w,
      h: timestampRect.h,
    };

    const bgStyle = rgbaToFillStyle(style.color);
    const borderStyle = rgbaToFillStyle(style.borderColor);
    const borderThickness = style.borderThickness;
    const halfW = panel.w * 0.5;
    const iconSize = Math.max(0, Math.min(panel.h, panel.w / 2) - 2 * style.padding);

    bg.clear();
    bg.rect(panel.x, panel.y, panel.w, panel.h).fill({
      color: bgStyle.color,
      alpha: bgStyle.alpha,
    } as any);
    if (borderThickness > 0) {
      bg.rect(panel.x, panel.y, panel.w, panel.h).stroke({
        color: borderStyle.color,
        alpha: borderStyle.alpha,
        width: borderThickness,
      } as any);
    }

    divider.clear();
    divider.moveTo(panel.x + halfW, panel.y).lineTo(panel.x + halfW, panel.y + panel.h).stroke({
      color: borderStyle.color,
      alpha: borderStyle.alpha,
      width: borderThickness,
    } as any);

    leftBg.clear();
    leftBg.rect(panel.x, panel.y, halfW, panel.h).fill({
      color: bgStyle.color,
      alpha: 0.001,
    } as any);

    rightBg.clear();
    rightBg.rect(panel.x + halfW, panel.y, halfW, panel.h).fill({
      color: bgStyle.color,
      alpha: 0.001,
    } as any);

    const setIconSize = (icon: Text): void => {
      icon.visible = iconSize > 0;
      icon.style.fontSize = iconSize;
      icon.style.fill = 0xffffff;
      icon.alpha = 1;
    };

    setIconSize(leftIcon);
    setIconSize(rightIcon);

    leftIcon.alpha = style.timestampAxis ? 1 : 0.5;
    rightIcon.alpha = style.priceAxis ? 1 : 0.5;

    leftIcon.position.set(panel.x + halfW * 0.5, panel.y + panel.h * 0.5);
    rightIcon.position.set(panel.x + halfW + halfW * 0.5, panel.y + panel.h * 0.5);
  };

  const drawInternal = (): void => {
    const app = appRef.current;
    const root = rootRef.current;
    if (!app || !root) return;

    const style = axesStyleRef.current;
    const screenW = app.screen.width;
    const screenH = app.screen.height;

    const timestampLayout = buildTimestampAxisLayout(screenW, screenH, true);
    const priceLayout = buildPriceAxisLayout(screenW, screenH, true);

    const timestampRect = timestampLayout.panel;
    const priceRect = priceLayout.panel;

    visibleAreaRef.current = {
      timestampAxis: { ...timestampRect },
      priceAxis: { ...priceRect },
    };

    if (timestampPanelBgRef.current) {
      if (style.timestampAxis) {
        drawPanelBackground(
          timestampPanelBgRef.current,
          timestampRect,
          style.color,
          style.borderColor,
          style.borderThickness,
        );
      } else {
        timestampPanelBgRef.current.clear();
      }
    }

    if (pricePanelBgRef.current) {
      if (style.priceAxis) {
        drawPanelBackground(
          pricePanelBgRef.current,
          priceRect,
          style.color,
          style.borderColor,
          style.borderThickness,
        );
      } else {
        pricePanelBgRef.current.clear();
      }
    }

    if (style.timestampAxis) {
      if (timestampTicksRef.current) timestampTicksRef.current.visible = true;
      if (timestampLabelsRef.current) timestampLabelsRef.current.visible = true;
    } else {
      if (timestampTicksRef.current) {
        timestampTicksRef.current.clear();
        timestampTicksRef.current.visible = false;
      }
      if (timestampLabelsRef.current) {
        destroyChildren(timestampLabelsRef.current);
        timestampLabelsRef.current.visible = false;
      }
    }

    if (style.priceAxis) {
      if (priceTicksRef.current) priceTicksRef.current.visible = true;
      if (priceLabelsRef.current) priceLabelsRef.current.visible = true;
    } else {
      if (priceTicksRef.current) {
        priceTicksRef.current.clear();
        priceTicksRef.current.visible = false;
      }
      if (priceLabelsRef.current) {
        destroyChildren(priceLabelsRef.current);
        priceLabelsRef.current.visible = false;
      }
    }

    drawSettingPanel(timestampRect, priceRect);

    root.visible = true;
  };

  const draw = (): void => {
    if (destroyedRef.current) return;
    ensureDisplayObjects();
    drawInternal();
    void loadAssets();
  };

  const init = (app: Application): void => {
    if (!app) {
      throwAppError("INVALID_APP", "app is required");
    }

    if (appRef.current === app && rootRef.current) {
      draw();
      return;
    }

    destroy();

    destroyedRef.current = false;
    appRef.current = app;
    viewportRef.current = viewport;
    candleDataRef.current = candleData;

    ensureDisplayObjects();

    if (rootRef.current) {
      app.stage.addChild(rootRef.current);
    }

    viewportRef.current.addOnViewportChange("axes/init", draw);

    draw();
    void loadAssets();
  };

  const destroy = (): void => {
    destroyedRef.current = true;

    const root = rootRef.current;

    if (root && root.parent) {
      root.parent.removeChild(root);
    }

    if (root) {
      root.destroy({ children: true });
    }

    appRef.current = null;
    rootRef.current = null;

    timestampPanelBgRef.current = null;
    timestampTicksRef.current = null;
    timestampLabelsRef.current = null;

    pricePanelBgRef.current = null;
    priceTicksRef.current = null;
    priceLabelsRef.current = null;

    settingPanelBgRef.current = null;
    settingDividerRef.current = null;
    timestampToggleBgRef.current = null;
    priceToggleBgRef.current = null;
    timestampIconRef.current = null;
    priceIconRef.current = null;

    fontLoadedRef.current = false;
    assetsPromiseRef.current = null;
    fontNameRef.current = "Datatype";

    visibleAreaRef.current = {
      timestampAxis: { ...EMPTY_RECT },
      priceAxis: { ...EMPTY_RECT },
    };
  };

  const setStyle = (style: GridGridAxesStyles): void => {
    const current = axesStyleRef.current;

    const apply = <K extends keyof GridGridAxesStyles>(key: K): void => {
      const next = style[key];
      if (next !== undefined && next !== null) {
        (current as any)[key] = next;
        return;
      }

      if ((current as any)[key] === undefined || (current as any)[key] === null) {
        throwAppError("INVALID_AXES_STYLE", `axesStyle.${String(key)} is missing`);
      }
    };

    apply("priceAxis");
    apply("timestampAxis");
    apply("margin");
    apply("spacing");
    apply("padding");
    apply("borderThickness");
    apply("fontSize");
    apply("color");
    apply("fontColor");
    apply("borderColor");

    draw();
  };

  const getVisibleArea = (): GridGridAxesVisibleArea => {
    return {
      timestampAxis: { ...visibleAreaRef.current.timestampAxis },
      priceAxis: { ...visibleAreaRef.current.priceAxis },
    };
  };

  const apiRef = useRef<GridAxes | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      init,
      destroy,
      setStyle,
      draw,
      getVisibleArea,
    };
  }

  viewportRef.current = viewport;
  candleDataRef.current = candleData;

  return apiRef.current;
}