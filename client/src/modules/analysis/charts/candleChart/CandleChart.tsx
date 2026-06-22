import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import useCandleData from "./hooks/useCandleData";
import useCandleLayer from "./hooks/useCandleLayer";
import useViewport from "./hooks/useViewport";

export default function CandleChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<Application | null>(null);

  // Initialize the three provided hooks
  const candleData = useCandleData();
  const candleLayer = useCandleLayer();
  const viewport = useViewport(candleData);

  // Test configuration parameters
  const TEST_SYMBOL = "NAS100";
  const TEST_TIMEFRAME = "1M";
  const FROM_TS = 1778220000000;
  const TO_TS   = 1778220330000;
  // const TO_TS = 1778255220000;
  const FROM_PRICE = 16000;
  const TO_PRICE = 18000;

  useEffect(() => {
    if (!containerRef.current) return;

    let isDestroyed = false;
    const app = new Application();

    const initChart = async () => {
      // 1. Initialize PixiJS Application matching the container sizes
      const width = containerRef.current?.clientWidth || window.innerWidth * 0.8;
      const height = containerRef.current?.clientHeight || window.innerHeight * 0.8;
      
      await app.init({
        width,
        height,
        background: "#aaaaaa", // Classic dark trading chart background
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (isDestroyed) {
        app.destroy(true);
        return;
      }

      pixiAppRef.current = app;
      containerRef.current?.appendChild(app.canvas);

      // 2. Setup Viewport boundaries & geometry weights
      viewport.setCanvasSize({ width, height });
      viewport.setView({
        fromTs: FROM_TS,
        toTs: TO_TS,
        fromPrice: FROM_PRICE,
        toPrice: TO_PRICE,
      });

      // 3. Request historical data using useCandleData
      const setRes = await candleData.set({
        symbol: TEST_SYMBOL,
        timeframe: TEST_TIMEFRAME,
        realtime: false, // Explicitly fixed snapshot testing
        fromTs: FROM_TS,
        toTs: TO_TS,
      });

      if (!setRes.success) {
        console.error("Failed to set candle data target configuration:", setRes);
        return;
      }

      // Automatically auto-fit vertical price scaling using the data bounds if supported
      if (typeof (viewport as any).setAutoPrice === "function") {
        try {
          (viewport as any).setAutoPrice(candleData);
        } catch (e) {
          console.warn("setAutoPrice fallback execution bypassed:", e);
        }
      }

      // 4. Initialize Candle Shader Mesh and Container Layer inside the app stage
      const initLayerRes = await candleLayer.init(app, candleData, viewport);
      if (!initLayerRes.success) {
        console.error("Failed to initialize Candle WebGL Graphics layer:", initLayerRes.error);
      }
    };

    initChart();

    // Cleanup resources cleanly when component updates or unmounts
    return () => {
      isDestroyed = true;
      
      candleLayer.cleanup();
      candleData.cleanup();
      
      if (typeof viewport.clean === "function") {
        viewport.clean();
      }

      if (pixiAppRef.current) {
        const currentApp = pixiAppRef.current;
        if (currentApp.canvas && currentApp.canvas.parentNode) {
          currentApp.canvas.parentNode.removeChild(currentApp.canvas);
        }
        currentApp.destroy(true, { children: true, texture: true });
        pixiAppRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "80vw",
        height: "80vh",
        margin: "0 auto",
        overflow: "hidden",
        position: "relative",
        border: "1px solid #aaaaaa",
        borderRadius: "4px",
      }}
    />
  );
}