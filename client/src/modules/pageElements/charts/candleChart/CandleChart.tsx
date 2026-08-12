import { useEffect, useRef, useState } from "react";
import ThemeData, { type Theme, DEFAULT_THEME } from "../../../data/theme/ThemeData";
import StateData from "./state/StateData";
import ChartController from "./chart/ChartController";
import ChartLayer from "./chart/ChartLayer";
import Navigation from "./interface/navigation/Navigation";
import styles from "./CandleChart.module.css";
import ScaleBar from "./interface/scaleBar/ScaleBar";
import FloatingBar from "./interface/floatingBar/FloatingBar";

export default function CandleChart({
  elementId,
  pageId
}: {
  elementId: number;
  pageId: number;
}) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  
  // Keep persistent instances across renders using refs
  const stateRef      = useRef<StateData>(new StateData());
  const chartRef      = useRef<ChartController>(new ChartController());
  const themeDataRef  = useRef<ThemeData>(new ThemeData());

  const state = stateRef.current;
  const chart = chartRef.current;
  const themeData = themeDataRef.current;

  useEffect(() => {
    const listenerId = `[CandleChart_${pageId}_${elementId}_] ${Math.random().toString(36).substring(2, 9)}`;
    
    themeData.init();
    setTheme(themeData.getSelected());
    themeData.addOnSelectedThemeDataChange(listenerId, () => {
        setTheme(themeData.getSelected());
    });
    
    state.init(pageId, elementId, chart);
    chart.init(state);


    return () => {
      themeData.removeOnSelectedThemeDataChange(listenerId)
      themeData.destroy();
      chart.destroy();
      state.destroy();
    };
  }, [pageId, elementId]);

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
      <ScaleBar state={state} chart={chart}/>
      <FloatingBar state={state} chart={chart}/>
    </div>
  );
}