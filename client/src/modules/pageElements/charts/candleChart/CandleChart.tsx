import { useEffect, useRef, useState } from "react";
import ThemeData, { type Theme, DEFAULT_THEME } from "../../../data/theme/ThemeData";
import StateData from "./state/StateData";
import ChartController from "./chart/ChartController";
import ChartLayer from "./chart/ChartLayer";
import Navigation from "./interface/navigation/Navigation";
import styles from "./CandleChart.module.css";

export default function CandleChart({
  elementId,
  pageId
}: {
  elementId: number;
  pageId: number;
}) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  
  // Keep persistent instances across renders using refs
  const stateRef = useRef<StateData | null>(null);
  const chartRef = useRef<ChartController | null>(null);
  const themeDataRef = useRef<ThemeData | null>(null);

  if (!stateRef.current) {
    stateRef.current = new StateData();
  }
  if (!chartRef.current) {
    chartRef.current = new ChartController();
  }
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const state = stateRef.current;
  const chart = chartRef.current;
  const themeData = themeDataRef.current;

  useEffect(() => {
    let disposed = false;
    let initialized = false;

    const listenerId = `CandleChart_${pageId}_${elementId}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    const initAll = async () => {
      try {
        //====================================================================================================
        // ThemeData
        //====================================================================================================
        themeData.init();

        if (disposed) return;

        setTheme(themeData.getSelected());

        themeData.addOnSelectedThemeDataChange(listenerId, () => {
          if (!disposed) {
            setTheme(themeData.getSelected());
          }
        });

        //====================================================================================================
        // StateData & ChartController
        //====================================================================================================
        await state.init(pageId, elementId);

        chart.init(state);

        initialized = true;
      } catch (err) {
        console.error("Failed to initialize CandleChart:", err);
      }
    };

    initAll();

    return () => {
      disposed = true;

      themeData.removeOnSelectedThemeDataChange(listenerId);

      if (initialized) {
        themeData.destroy();
        chart.destroy();
        state.destroy();
      }
    };
  }, [pageId, elementId, state, chart, themeData]);

  const toRgba = (rgba: [number, number, number, number]) =>
    `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;

  return (
    <div
      className={styles.container}
      style={{
        background: toRgba(theme.background)
      }}
    >
      <Navigation state={state}/>
      <ChartLayer chart={chart}/>
    </div>
  );
}