import { useEffect, useState, useRef, useCallback } from "react";
import type StateData from "../../state/StateData";
import type ChartController from "../../chart/ChartController";
import ThemeData from "../../../../../data/theme/ThemeData";
import styles from "./modules/PriceScaleBar.module.css";
import type { Theme } from "../../../../../data/theme/ThemeData";
import type { Viewport } from "../../state/viewport/ViewportData";
import type { ViewportTransform } from "../../state/viewport/ViewportData";
import type { RGB, RGBA } from "../../../../../shared/type";

const CHART_GAP = 10;
const MIN_PRICE_LABEL_GAP = 24; // px distance minimum between label centers
const HORIZONTAL_PADDING = 7; // px horizontal padding inside price bar
const MAX_PRICE_BAR_WIDTH = 120; // Hard max cap to prevent expanding across screen
const MIN_PRICE_BAR_WIDTH = 40;
const SCALE_SENSITIVITY = 0.002;
const WHEEL_DEBOUNCE_MS = 100;

interface PriceScaleBarProps {
  state: StateData;
  chart: ChartController;
  visible: boolean;
  onWidthChange: (width: number) => void;
}

interface CrosshairStyle {
  background: string;
  font: string;
}

/**
 * Dynamically calculates the optimal step size (1, 2, 5 * 10^k)
 * based on minimum required pixel spacing.
 */
function getDynamicStep(pricePerPixel: number, minPixelGap: number): number {
  const minPriceGap = Math.abs(pricePerPixel) * minPixelGap;
  if (minPriceGap <= 0 || !isFinite(minPriceGap) || isNaN(minPriceGap)) return 1;

  const exponent = Math.floor(Math.log10(minPriceGap));
  const basePower = Math.pow(10, exponent);

  const candidateSteps = [1 * basePower, 2 * basePower, 5 * basePower, 10 * basePower];

  for (const step of candidateSteps) {
    if (step >= minPriceGap) {
      return step;
    }
  }

  return 10 * basePower;
}

const formatPrice = (rawPrice: number, pointVal: number): string => {
  if (!isFinite(rawPrice) || isNaN(rawPrice)) return "0";
  const safePoint = pointVal > 0 ? pointVal : 1;
  const digits = Math.max(0, Math.round(Math.log10(safePoint)));
  const str = Math.round(rawPrice).toString();

  if (digits === 0) return str;

  if (str.length <= digits) {
    const padded = str.padStart(digits + 1, "0");
    const intPart = padded.slice(0, padded.length - digits);
    const fracPart = padded.slice(padded.length - digits);
    return `${intPart}.${fracPart}`;
  }

  const intPart = str.slice(0, str.length - digits);
  const fracPart = str.slice(str.length - digits);
  return `${intPart}.${fracPart}`;
};

const toRgba = (c: RGBA | undefined | null) => {
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] ?? 255)})` : "transparent";
};
const toRgb = (c: RGB | undefined | null) => (c ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : "#ffffff");

const helperColors = (theme: Theme | null) => {
  if (!theme || !theme.button || !theme.button.disable) {
    return { bg: "transparent", border: "transparent", font: "#ffffff" };
  }
  return {
    bg: toRgba(theme.button.disable.background),
    border: toRgba(theme.button.disable.border),
    font: toRgb(theme.button.disable.font),
  };
};

export default function PriceScaleBar({
  state,
  chart,
  visible,
  onWidthChange,
}: PriceScaleBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const themeData = useRef<ThemeData>(new ThemeData());
  const [theme, setTheme] = useState<Theme | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [point, setPoint] = useState<number>(1);
  const [view, setView] = useState<Viewport | null>(null);
  const [transform, setTransform] = useState<ViewportTransform | null>(null);
  const [width, setWidth] = useState(MIN_PRICE_BAR_WIDTH);

  // Crosshair state
  const [crosshairPos, setCrosshairPos] = useState<{ y: number; price: number } | null>(null);
  const [crosshairStyle, setCrosshairStyle] = useState<CrosshairStyle>({
    background: "rgba(255, 255, 255, 1)",
    font: "rgb(0, 0, 0)",
  });

  // Dragging interaction state
  const isDraggingRef = useRef<boolean>(false);
  const lastMouseYRef = useRef<number>(0);

  // Wheel debounce timer ref
  const wheelFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store last reported width to break infinite callback loop
  const lastReportedWidthRef = useRef<number>(MIN_PRICE_BAR_WIDTH);

  // Stable listener IDs stored in refs
  const listenerId = useRef({
    theme: `price_bar-theme-${Math.random().toString(36).substring(2, 9)}`,
    symbol: `price_bar-symbol-${Math.random().toString(36).substring(2, 9)}`,
    point: `price_bar-point-${Math.random().toString(36).substring(2, 9)}`,
    viewport: `price_bar-viewport-${Math.random().toString(36).substring(2, 9)}`,
    transform: `price_bar-transform-${Math.random().toString(36).substring(2, 9)}`,
    crosshairData: `price_bar-crosshair-data-${Math.random().toString(36).substring(2, 9)}`,
    crosshairConfig: `price_bar-crosshair-config-${Math.random().toString(36).substring(2, 9)}`,
  });

  // THEME
  useEffect(() => {
    themeData.current.init();
    themeData.current.addOnSelectedThemeDataChange(listenerId.current.theme, () =>
      setTheme(themeData.current.getSelected())
    );
    return () => {
      themeData.current.removeOnThemeDataChange(listenerId.current.theme);
      themeData.current.destroy();
    };
  }, []);

  // SYMBOL
  useEffect(() => {
    state.config.addOnConfigDataChange(listenerId.current.symbol, ["symbol"], () => {
      const newSymbol = state.config.get()?.symbol;
      setSymbol(newSymbol ? newSymbol : null);
    });
    return () => state.config.removeOnConfigDataChange(listenerId.current.symbol);
  }, [state.config]);

  // POINT
  useEffect(() => {
    state.source.symbol.addOnSymbolDataChange(listenerId.current.point, () => {
      if (!symbol) return;
      const newPoint = state.source.symbol.get(symbol)?.point;
      setPoint(newPoint ? newPoint : 1);
    });
    return () => state.source.symbol.removeOnSymbolDataChange(listenerId.current.point);
  }, [symbol, state.source.symbol]);

  // VIEWPORT
  useEffect(() => {
    state.config.addOnConfigDataChange(listenerId.current.viewport, ["viewport"], () => {
      const newViewport = state.config.get()?.viewport;
      setView(newViewport ? newViewport : null);
    });
    return () => state.config.removeOnConfigDataChange(listenerId.current.viewport);
  }, [state.config]);

  // TRANSFORM
  useEffect(() => {
    state.viewport.addOnViewportTransformDataChange(listenerId.current.transform, () => {
      const newTransform = state.viewport.getTransform();
      setTransform(newTransform);
    });
    return () => state.viewport.removeOnViewportTransformDataChange(listenerId.current.transform);
  }, [state.viewport]);

  // CROSSHAIR DATA
  useEffect(() => {
    state.crosshair.addOnCrosshairDataChange(listenerId.current.crosshairData, () => {
      const pixel = state.crosshair.getPixel();
      const world = state.crosshair.get();

      if (pixel && world) {
        setCrosshairPos({ y: pixel.y, price: world.price });
      } else {
        setCrosshairPos(null);
      }
    });

    return () => state.crosshair.removeOnCrosshairDataChange(listenerId.current.crosshairData);
  }, [state.crosshair]);

  // CROSSHAIR CONFIG (STYLE)
  useEffect(() => {
    state.config.addOnConfigDataChange(listenerId.current.crosshairConfig, ["style"], () => {
      const config = state.config.get();
      const color = config?.style?.crosshair?.color;

      setCrosshairStyle({
        background: color?.background ? toRgba(color.background) : "rgba(255, 255, 255, 1)",
        font: color?.font ? toRgb(color.font) : "rgb(0, 0, 0)",
      });
    });

    return () => state.config.removeOnConfigDataChange(listenerId.current.crosshairConfig);
  }, [state.config]);

  // Clean up wheel flush timer on unmount
  useEffect(() => {
    return () => {
      if (wheelFlushTimerRef.current) {
        clearTimeout(wheelFlushTimerRef.current);
        wheelFlushTimerRef.current = null;
      }
    };
  }, []);

  // Main canvas render pass
  const renderCanvas = useCallback(() => {
    if (!visible || !view || !transform) return;
    if (!chart || !chart.viewport || !chart.viewport.converter || !chart.event) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasSize = chart.event.getCanvasSize?.();
    if (!canvasSize || canvasSize.h <= 0) return;

    const rawFromPrice = view.fromPrice;
    const rawToPrice = view.toPrice;

    if (
      typeof rawFromPrice !== "number" ||
      typeof rawToPrice !== "number" ||
      isNaN(rawFromPrice) ||
      isNaN(rawToPrice)
    ) {
      return;
    }

    const baseMinPrice = Math.min(rawFromPrice, rawToPrice);
    const baseMaxPrice = Math.max(rawFromPrice, rawToPrice);

    if (baseMaxPrice <= baseMinPrice) return;

    // Use current bounding client rect for display height
    const rect = container.getBoundingClientRect();
    const cssWidth = Math.min(
      MAX_PRICE_BAR_WIDTH,
      Math.max(MIN_PRICE_BAR_WIDTH, rect.width || MIN_PRICE_BAR_WIDTH)
    );
    const cssHeight = rect.height || canvasSize.h;

    // High-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Dynamic Step calculation
    const priceRange = baseMaxPrice - baseMinPrice;
    const pricePerPixel = priceRange / cssHeight;
    const scaleY = transform.scaleY ?? 1;
    const offsetY = transform.offsetY ?? 0;

    const step = getDynamicStep(pricePerPixel / scaleY, MIN_PRICE_LABEL_GAP);

    if (step <= 0 || !isFinite(step)) {
      ctx.restore();
      return;
    }

    // Convert pixel boundaries back to price using transform offsets
    const topPixel = (0 - offsetY) / scaleY + CHART_GAP;
    const bottomPixel = (cssHeight - offsetY) / scaleY + CHART_GAP;

    const topPrice = chart.viewport.converter.pixelToPrice(topPixel);
    const bottomPrice = chart.viewport.converter.pixelToPrice(bottomPixel);

    if (topPrice === null || bottomPrice === null) {
      ctx.restore();
      return;
    }

    const minPrice = Math.min(topPrice, bottomPrice);
    const maxPrice = Math.max(topPrice, bottomPrice);

    const startPrice = Math.ceil(minPrice / step) * step;

    ctx.font = "11px monospace";
    ctx.fillStyle = helperColors(theme).font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let maxTextWidth = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 500;

    for (
      let p = startPrice;
      p <= maxPrice && iterations < MAX_ITERATIONS;
      p += step, iterations++
    ) {
      const rawY = chart.viewport.converter.priceToPixel(p);
      if (rawY === null || rawY === undefined) continue;

      const labelPosY = rawY * scaleY + offsetY - CHART_GAP;

      if (labelPosY >= -20 && labelPosY <= cssHeight + 20) {
        const textStr = formatPrice(p, point);
        const textWidth = ctx.measureText(textStr).width;
        if (textWidth > maxTextWidth) {
          maxTextWidth = textWidth;
        }

        ctx.fillText(textStr, cssWidth / 2, labelPosY);
      }
    }

    ctx.restore();

    // Safely update width ONLY if there is a meaningful size change (> 2px difference)
    const calculatedWidth = Math.min(
      MAX_PRICE_BAR_WIDTH,
      Math.max(MIN_PRICE_BAR_WIDTH, Math.ceil(maxTextWidth + HORIZONTAL_PADDING * 2))
    );

    if (Math.abs(calculatedWidth - lastReportedWidthRef.current) > 2) {
      lastReportedWidthRef.current = calculatedWidth;

      setWidth(calculatedWidth);
      onWidthChange?.(calculatedWidth);
    }
  }, [visible, view, transform, point, chart, theme, onWidthChange]);

  // Handle ResizeObserver safely without infinite triggers
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      renderCanvas();
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [renderCanvas]);

  useEffect(() => {
    renderCanvas();
  }, [visible, point, view, transform, renderCanvas]);

  //======================================================================================================
  // GLOBAL WINDOW EVENT HANDLERS FOR Y-AXIS SCALE
  //======================================================================================================
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent): void => {
      if (!isDraggingRef.current || !view || !chart?.viewport?.converter) return;

      const currentMouseY = e.clientY;
      const dy = currentMouseY - lastMouseYRef.current;
      lastMouseYRef.current = currentMouseY;

      if (dy === 0) return;

      const currentTransform = state.viewport.getTransform();

      // Get Y-pixel center aligned with middle price in viewport space
      const centerPrice = (view.fromPrice + view.toPrice) / 2;
      const anchorY = chart.viewport.converter.priceToPixel(centerPrice);

      if (anchorY === null || anchorY === undefined) return;

      // Moving UP (negative dy) -> Scale IN (>1)
      // Moving DOWN (positive dy) -> Scale OUT (<1)
      const factor = Math.exp(-dy * SCALE_SENSITIVITY);

      const oldScaleY = currentTransform.scaleY ?? 1;
      const oldOffsetY = currentTransform.offsetY ?? 0;

      const newScaleY = oldScaleY * factor;
      const newOffsetY = anchorY - (anchorY - oldOffsetY) * factor;

      state.viewport.setTransform({
        ...currentTransform,
        scaleY: newScaleY,
        offsetY: newOffsetY,
      });
    };

    const handleGlobalMouseUp = (): void => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      state.viewport.flushTransform();
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [state.viewport, view, chart]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;

    isDraggingRef.current = true;
    lastMouseYRef.current = e.clientY;
  };

  // Debounced flush for onWheel
  const debounceWheelFlush = useCallback(() => {
    if (wheelFlushTimerRef.current) {
      clearTimeout(wheelFlushTimerRef.current);
    }

    wheelFlushTimerRef.current = setTimeout(() => {
      state.viewport.flushTransform();
      wheelFlushTimerRef.current = null;
    }, WHEEL_DEBOUNCE_MS);
  }, [state.viewport]);

  // WHEEL EVENT HANDLER (Y-AXIS SCALE)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (!view || !chart?.viewport?.converter) return;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const currentTransform = state.viewport.getTransform();

    // Center anchor around middle price in viewport space
    const centerPrice = (view.fromPrice + view.toPrice) / 2;
    const anchorY = chart.viewport.converter.priceToPixel(centerPrice);

    if (anchorY === null || anchorY === undefined) return;

    const oldScaleY = currentTransform.scaleY ?? 1;
    const oldOffsetY = currentTransform.offsetY ?? 0;

    const newScaleY = oldScaleY * zoomFactor;
    const newOffsetY = anchorY - (anchorY - oldOffsetY) * zoomFactor;

    state.viewport.setTransform({
      ...currentTransform,
      scaleY: newScaleY,
      offsetY: newOffsetY,
    });

    debounceWheelFlush();
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.priceScaleBar} ${visible ? styles.visible : styles.hidden}`}
      style={{
        width,
        backgroundColor: toRgba(theme?.button.disable.background),
        borderColor: toRgba(theme?.button.disable.border),
        cursor: "ns-resize",
        userSelect: "none",
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      {crosshairPos !== null && (
        <span
          className={styles.crosshairLabel}
          style={{
            top: `${crosshairPos.y - CHART_GAP}px`,
            backgroundColor: crosshairStyle.background,
            color: crosshairStyle.font,
          }}
        >
          {formatPrice(crosshairPos.price, point)}
        </span>
      )}
    </div>
  );
}