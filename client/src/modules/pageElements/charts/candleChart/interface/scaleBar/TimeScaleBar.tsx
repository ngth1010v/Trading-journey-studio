import { useEffect, useState, useRef, useCallback } from "react";
import type StateData from "../../state/StateData";
import type ChartController from "../../chart/ChartController";
import ThemeData from "../../../../../data/theme/ThemeData";
import styles from "./modules/TimeScaleBar.module.css";
import type { Theme } from "../../../../../data/theme/ThemeData";
import type { Viewport, ViewportTransform } from "../../state/viewport/ViewportData";
import type { RGB, RGBA } from "../../../../../shared/type";

const CHART_GAP = 5;
const MIN_TIME_LABEL_GAP = 40; // px
const ESTIMATED_LABEL_WIDTH = 250; // px for dd:mm:yyyy hh:mm:ss
const MIN_TIME_BAR_HEIGHT = 20;
const MAX_TIME_BAR_HEIGHT = 60;
const VERTICAL_PADDING = 2;
const SCALE_SENSITIVITY = 0.002;
const WHEEL_DEBOUNCE_MS = 100;

const TIME_STEPS = [
  { name: "1S", ms: 1000 },
  { name: "2S", ms: 2000 },
  { name: "5S", ms: 5000 },
  { name: "10S", ms: 10000 },
  { name: "15S", ms: 15000 },
  { name: "30S", ms: 30000 },
  { name: "1M", ms: 60000 },
  { name: "2M", ms: 120000 },
  { name: "5M", ms: 300000 },
  { name: "10M", ms: 600000 },
  { name: "15M", ms: 900000 },
  { name: "30M", ms: 1800000 },
  { name: "1H", ms: 3600000 },
  { name: "2H", ms: 7200000 },
  { name: "4H", ms: 14400000 },
  { name: "6H", ms: 21600000 },
  { name: "12H", ms: 43200000 },
  { name: "1D", ms: 86400000 },
  { name: "2D", ms: 172800000 },
  { name: "4D", ms: 345600000 },
  { name: "6D", ms: 518400000 },
  { name: "15D", ms: 1296000000 },
  { name: "1MN", ms: 2592000000 },
  { name: "2MN", ms: 5184000000 },
  { name: "4MN", ms: 10368000000 },
  { name: "6MN", ms: 15552000000 },
  { name: "12MN", ms: 31104000000 },
  { name: "1Y", ms: 31536000000 },
  { name: "2Y", ms: 63072000000 },
  { name: "5Y", ms: 157680000000 },
  { name: "10Y", ms: 315360000000 },
  { name: "20Y", ms: 630720000000 },
  { name: "50Y", ms: 1576800000000 },
  { name: "100Y", ms: 3153600000000 },
  { name: "200Y", ms: 6307200000000 },
  { name: "500Y", ms: 15768000000000 },
  { name: "1000Y", ms: 31536000000000 },
  { name: "2000Y", ms: 63072000000000 },
  { name: "5000Y", ms: 157680000000000 }
];

const MS_1M = 60000;
const MS_1H = 3600000;
const MS_1D = 86400000;
const MS_1MN = 2592000000;
const MS_1Y = 31536000000;

interface TimeScaleBarProps {
  state: StateData;
  chart: ChartController;
  visible: boolean;
  themeData?: ThemeData;
  onHeightChange: (height: number) => void;
}

interface CrosshairStyle {
  background: string;
  font: string;
}

const DEFAULT_CROSSHAIR_BG: RGBA = [255, 255, 255, 255];
const DEFAULT_CROSSHAIR_FONT: RGB = [0, 0, 0];

const DEFAULT_ALT_CROSSHAIR_BG: RGBA = [255, 255, 200, 100];
const DEFAULT_ALT_CROSSHAIR_FONT: RGB = [0, 0, 0];

const toRgba = (c: RGBA | undefined | null) => {
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] ?? 1})` : "transparent";
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

const formatTimestamp = (ts: number, stepMs: number): string => {
  const date = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");

  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  if (stepMs < MS_1M) {
    return `${hh}:${min}:${ss}`;
  } else if (stepMs < MS_1H) {
    return `${hh}:${min}`;
  } else if (stepMs < MS_1D) {
    return `${hh}:00`;
  } else if (stepMs < MS_1MN) {
    return `${dd}/${mm}/${yyyy}`;
  } else if (stepMs < MS_1Y) {
    return `${mm}/${yyyy}`;
  } else {
    return `${yyyy}`;
  }
};

const formatCrosshairTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");

  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "short" });
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return `${dayOfWeek} ${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
};

const BASE_ID = "[CandleChart][interface][scaleBar][TimeScaleBar.tsx]"

export default function TimeScaleBar({
  state,
  chart,
  visible,
  onHeightChange,
}: TimeScaleBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const themeData = useRef<ThemeData>(new ThemeData());
  const [theme, setTheme] = useState<Theme | null>(null);
  const [view, setView] = useState<Viewport | null>(null);
  const [transform, setTransform] = useState<ViewportTransform | null>(null);
  const [height, setHeight] = useState(MIN_TIME_BAR_HEIGHT);

  // Crosshair state
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  const [crosshairTimeText, setCrosshairTimeText] = useState<string | null>(null);
  const [crosshairStyle, setCrosshairStyle] = useState<CrosshairStyle>({
    background: toRgba(DEFAULT_CROSSHAIR_BG),
    font: toRgb(DEFAULT_CROSSHAIR_FONT),
  });

  // AltCrosshair state
  const [altCrosshairX, setAltCrosshairX] = useState<number | null>(null);
  const [altCrosshairTimeText, setAltCrosshairTimeText] = useState<string | null>(null);
  const [altCrosshairStyle, setAltCrosshairStyle] = useState<CrosshairStyle>({
    background: toRgba(DEFAULT_ALT_CROSSHAIR_BG),
    font: toRgb(DEFAULT_ALT_CROSSHAIR_FONT),
  });

  // Step index state & ref
  const [stepIndex, _] = useState<number | null>(null);
  const stepIndexRef = useRef<number | null>(stepIndex);
  stepIndexRef.current = stepIndex;

  // Dragging interaction state (X-axis)
  const isDraggingRef = useRef<boolean>(false);
  const lastMouseXRef = useRef<number>(0);

  // Wheel debounce timer ref
  const wheelFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store last reported height to break infinite callback loop
  const lastReportedHeightRef = useRef<number>(MIN_TIME_BAR_HEIGHT);

  // Stable listener IDs stored in refs
  const listenerId = useRef({
    theme       : `${BASE_ID} theme-${Math.random().toString(36).substring(2, 9)}`,
    viewport    : `${BASE_ID} viewport-${Math.random().toString(36).substring(2, 9)}`,
    transform   : `${BASE_ID} transform-${Math.random().toString(36).substring(2, 9)}`,
    crosshair   : `${BASE_ID} crosshair-${Math.random().toString(36).substring(2, 9)}`,
    altCrosshair: `${BASE_ID} alt-crosshair-${Math.random().toString(36).substring(2, 9)}`,
    configStyle : `${BASE_ID} config-style-${Math.random().toString(36).substring(2, 9)}`,
  });

  // Helper callback to recalculate AltCrosshair timestamp & position
  const updateAltCrosshair = useCallback(() => {
    const altPos = state.crosshair.getAlt();
    if (altPos && chart?.viewport?.converter) {
      const timestamp = chart.viewport.converter.pixelToTimestamp(altPos.x);
      if (timestamp !== null && !isNaN(timestamp)) {
        setAltCrosshairX(altPos.x - CHART_GAP);
        setAltCrosshairTimeText(formatCrosshairTimestamp(timestamp));
        return;
      }
    }
    setAltCrosshairX(null);
    setAltCrosshairTimeText(null);
  }, [state.crosshair, chart]);

  // THEME
  useEffect(() => {
    themeData.current.init();
    setTheme(themeData.current.getSelected());

    themeData.current.addOnSelectedThemeDataChange(listenerId.current.theme, () =>
      setTheme(themeData.current.getSelected())
    );

    return () => {
      themeData.current.destroy();
    };
  }, []);

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
      updateAltCrosshair();
    });
    return () => state.viewport.removeOnViewportTransformDataChange(listenerId.current.transform);
  }, [state.viewport, updateAltCrosshair]);

  // CROSSHAIR DATA LISTENER
  useEffect(() => {
    state.crosshair.addOnCrosshairDataChange(listenerId.current.crosshair, () => {
      const isInside = state.crosshair.getIsInside();
      const pixel = state.crosshair.getPixel();
      const world = state.crosshair.get();

      if (isInside && pixel && world) {
        setCrosshairX(pixel.x - CHART_GAP);
        setCrosshairTimeText(formatCrosshairTimestamp(world.timestamp));
      } else {
        setCrosshairX(null);
        setCrosshairTimeText(null);
      }
    });

    return () => state.crosshair.removeOnCrosshairDataChange(listenerId.current.crosshair);
  }, [state.crosshair]);

  // ALT CROSSHAIR DATA LISTENER
  useEffect(() => {
    state.crosshair.addOnAltCrosshairDataChange(
      listenerId.current.altCrosshair,
      updateAltCrosshair
    );

    return () =>
      state.crosshair.removeOnAltCrosshairDataChange(
        listenerId.current.altCrosshair
      );
  }, [state.crosshair, updateAltCrosshair]);

  // CONFIG STYLE LISTENER (CROSSHAIR & ALT CROSSHAIR COLOR)
  useEffect(() => {
    state.config.addOnConfigDataChange(listenerId.current.configStyle, ["style"], () => {
      const config = state.config.get();
      const crosshairColor = config?.style?.crosshair?.color;
      const altCrosshairColor = config?.style?.altCrosshair?.color;

      const bg = crosshairColor?.background ?? DEFAULT_CROSSHAIR_BG;
      const font = crosshairColor?.font ?? DEFAULT_CROSSHAIR_FONT;

      setCrosshairStyle({
        background: toRgba(bg),
        font: toRgb(font),
      });

      const altBg = altCrosshairColor?.background ?? DEFAULT_ALT_CROSSHAIR_BG;
      const altFont = altCrosshairColor?.font ?? DEFAULT_ALT_CROSSHAIR_FONT;

      setAltCrosshairStyle({
        background: toRgba(altBg),
        font: toRgb(altFont),
      });
    });

    return () => state.config.removeOnConfigDataChange(listenerId.current.configStyle);
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
    if (!canvasSize || canvasSize.w <= 0) return;

    const rawFromTs = view.fromTs;
    const rawToTs = view.toTs;

    if (
      typeof rawFromTs !== "number" ||
      typeof rawToTs !== "number" ||
      isNaN(rawFromTs) ||
      isNaN(rawToTs)
    ) {
      return;
    }

    const baseMinTs = Math.min(rawFromTs, rawToTs);
    const baseMaxTs = Math.max(rawFromTs, rawToTs);

    if (baseMaxTs <= baseMinTs) return;

    // Use current bounding client rect for display width/height
    const rect = container.getBoundingClientRect();
    const cssWidth = rect.width || canvasSize.w;
    const cssHeight = Math.min(
      MAX_TIME_BAR_HEIGHT,
      Math.max(MIN_TIME_BAR_HEIGHT, rect.height || MIN_TIME_BAR_HEIGHT)
    );

    // High-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Dynamic Step index calculation
    let currentStepIdx = stepIndexRef.current ?? 6; // Default to 1M step if step is null
    if (currentStepIdx < 0 || currentStepIdx >= TIME_STEPS.length) {
      currentStepIdx = 0;
    }

    let activeStepObj = TIME_STEPS[currentStepIdx];

    const getScreenGap = (stepMs: number) => {
      const t1 = baseMinTs;
      const t2 = baseMinTs + stepMs;
      const x1 = chart.viewport.converter.timestampToPixel(t1);
      const x2 = chart.viewport.converter.timestampToPixel(t2);
      if (x1 === null || x2 === null) return 0;
      return Math.abs(x2 - x1);
    };

    let pxGap = getScreenGap(activeStepObj.ms);

    if (pxGap < MIN_TIME_LABEL_GAP && currentStepIdx < TIME_STEPS.length - 1) {
      while (pxGap < MIN_TIME_LABEL_GAP && currentStepIdx < TIME_STEPS.length - 1) {
        currentStepIdx++;
        activeStepObj = TIME_STEPS[currentStepIdx];
        pxGap = getScreenGap(activeStepObj.ms);
      }
    } else {
      const maxGapAllowed = MIN_TIME_LABEL_GAP * 2 + ESTIMATED_LABEL_WIDTH;
      if (pxGap > maxGapAllowed && currentStepIdx > 0) {
        while (pxGap > maxGapAllowed && currentStepIdx > 0) {
          currentStepIdx--;
          activeStepObj = TIME_STEPS[currentStepIdx];
          pxGap = getScreenGap(activeStepObj.ms);
        }
      }
    }

    const stepMs = activeStepObj.ms;
    const scaleX = transform.scaleX ?? 1;
    const offsetX = transform.offsetX ?? 0;

    // Convert pixel boundaries back to timestamp using transform offsets
    const leftPixel = (0 - offsetX) / scaleX + CHART_GAP;
    const rightPixel = (cssWidth - offsetX) / scaleX + CHART_GAP;

    const leftTs = chart.viewport.converter.pixelToTimestamp(leftPixel);
    const rightTs = chart.viewport.converter.pixelToTimestamp(rightPixel);

    if (leftTs === null || rightTs === null) {
      ctx.restore();
      return;
    }

    const minTs = Math.min(leftTs, rightTs);
    const maxTs = Math.max(leftTs, rightTs);

    const startTs = Math.ceil(minTs / stepMs) * stepMs;

    ctx.font = "10px monospace";
    ctx.fillStyle = helperColors(theme).font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let maxTextHeight = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 500;

    for (
      let t = startTs;
      t <= maxTs && iterations < MAX_ITERATIONS;
      t += stepMs, iterations++
    ) {
      const rawX = chart.viewport.converter.timestampToPixel(t);
      if (rawX === null || rawX === undefined) continue;

      const labelPosX = rawX * scaleX + offsetX - CHART_GAP;

      if (labelPosX >= -50 && labelPosX <= cssWidth + 50) {
        const textStr = formatTimestamp(t, stepMs);
        const metrics = ctx.measureText(textStr);
        const textHeight =
          metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 11;

        if (textHeight > maxTextHeight) {
          maxTextHeight = textHeight;
        }

        ctx.fillText(textStr, labelPosX, cssHeight / 2 + 1);
      }
    }

    ctx.restore();

    // Safely update height ONLY if there is a meaningful size change (> 2px difference)
    const calculatedHeight = Math.min(
      MAX_TIME_BAR_HEIGHT,
      Math.max(MIN_TIME_BAR_HEIGHT, Math.ceil(maxTextHeight + VERTICAL_PADDING * 2))
    );

    if (Math.abs(calculatedHeight - lastReportedHeightRef.current) > 2) {
      lastReportedHeightRef.current = calculatedHeight;

      setHeight(calculatedHeight);
      onHeightChange?.(calculatedHeight);
    }
  }, [visible, view, transform, chart, theme, onHeightChange]);

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
  }, [visible, view, transform, renderCanvas]);

  //======================================================================================================
  // GLOBAL WINDOW EVENT HANDLERS FOR X-AXIS SCALE
  //======================================================================================================
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent): void => {
      if (!isDraggingRef.current || !view || !chart?.viewport?.converter) return;

      const currentMouseX = e.clientX;
      const dx = currentMouseX - lastMouseXRef.current;
      lastMouseXRef.current = currentMouseX;

      if (dx === 0) return;

      const currentTransform = state.viewport.getTransform();

      // Get X-pixel center aligned with middle timestamp in viewport space
      const centerTs = (view.fromTs + view.toTs) / 2;
      const anchorX = chart.viewport.converter.timestampToPixel(centerTs);

      if (anchorX === null || anchorX === undefined) return;

      // Drag RIGHT (positive dx) -> Scale IN (>1)
      // Drag LEFT (negative dx) -> Scale OUT (<1)
      const factor = Math.exp(dx * SCALE_SENSITIVITY);

      const oldScaleX = currentTransform.scaleX ?? 1;
      const oldOffsetX = currentTransform.offsetX ?? 0;

      const newScaleX = oldScaleX * factor;
      const newOffsetX = anchorX - (anchorX - oldOffsetX) * factor;

      state.viewport.setTransform({
        ...currentTransform,
        scaleX: newScaleX,
        offsetX: newOffsetX,
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
    lastMouseXRef.current = e.clientX;
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

  // WHEEL EVENT HANDLER (X-AXIS SCALE)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (!view || !chart?.viewport?.converter) return;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const currentTransform = state.viewport.getTransform();

    // Center anchor around middle timestamp in viewport space
    const centerTs = (view.fromTs + view.toTs) / 2;
    const anchorX = chart.viewport.converter.timestampToPixel(centerTs);

    if (anchorX === null || anchorX === undefined) return;

    const oldScaleX = currentTransform.scaleX ?? 1;
    const oldOffsetX = currentTransform.offsetX ?? 0;

    const newScaleX = oldScaleX * zoomFactor;
    const newOffsetX = anchorX - (anchorX - oldOffsetX) * zoomFactor;

    state.viewport.setTransform({
      ...currentTransform,
      scaleX: newScaleX,
      offsetX: newOffsetX,
    });

    debounceWheelFlush();
  };

  const isCrosshairVisible = crosshairX !== null && crosshairTimeText !== null;
  const isAltCrosshairVisible = altCrosshairX !== null && altCrosshairTimeText !== null;

  return (
    <div
      ref={containerRef}
      className={`${styles.timeScaleBar} ${visible ? styles.visible : styles.hidden}`}
      style={{
        height,
        backgroundColor: toRgba(theme?.button.disable.background),
        borderColor: toRgba(theme?.button.disable.border),
        cursor: "ew-resize",
        userSelect: "none",
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      {isCrosshairVisible && (
        <span
          className={`${styles.crosshairLabel} ${styles.labelVisible}`}
          style={{
            left: `${crosshairX}px`,
            backgroundColor: crosshairStyle.background,
            color: crosshairStyle.font,
          }}
        >
          {crosshairTimeText}
        </span>
      )}
      {isAltCrosshairVisible && (
        <span
          className={`${styles.crosshairLabel} ${styles.labelVisible}`}
          style={{
            left: `${altCrosshairX}px`,
            backgroundColor: altCrosshairStyle.background,
            color: altCrosshairStyle.font,
          }}
        >
          {altCrosshairTimeText}
        </span>
      )}
    </div>
  );
}