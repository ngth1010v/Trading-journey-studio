import React, { useState, useEffect, useRef, useMemo } from "react";
import type StateData from "../../state/StateData";
import type ChartController from "../../chart/ChartController";
import ThemeData from "../../../../../data/theme/ThemeData";
import PriceScaleBar from "./PriceScaleBar";
import TimeScaleBar from "./TimeScaleBar";
import styles from "./modules/ScaleBar.module.css";

const CHART_GAP = 5;
const TOGGLE_BUTTON_GAP = 5;

export default function ScaleBar({
  state,
  chart
}: {
  state: StateData;
  chart: ChartController;
}) {
  const [showTimeBar, setShowTimeBar] = useState<boolean>(true);
  const [showPriceBar, setShowPriceBar] = useState<boolean>(true);

  const [priceBarWidth, setPriceBarWidth] = useState<number>(50);
  const [timeBarHeight, setTimeBarHeight] = useState<number>(20);

  const themeDataRef = useRef<ThemeData>(new ThemeData());
  const [theme, setTheme] = useState(() => themeDataRef.current.getSelected());

  // Track Theme Data strictly via callback
  useEffect(() => {
    const td = themeDataRef.current;
    td.init();

    const listenerId = `scale_bar_parent_theme_${Math.random().toString(36).substring(2, 9)}`;
    
    td.addOnSelectedThemeDataChange(listenerId, () => {
      setTheme(td.getSelected());
    });

    return () => {
      td.removeOnSelectedThemeDataChange(listenerId);
      td.destroy();
    };
  }, []);

  const helperColors = useMemo(() => {
    const toRgba = (c: number[]) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] ?? 255)/255})`;
    const toRgb = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    return {
      bg: toRgba(theme.button.disable.background),
      border: toRgba(theme.button.disable.border),
      font: toRgb(theme.button.disable.font)
    };
  }, [theme]);

  const cssVariables = {
    "--chart-gap": `${CHART_GAP}px`,
    "--toggle-gap": `${TOGGLE_BUTTON_GAP}px`,
    "--price-bar-width": `${priceBarWidth}px`,
    "--time-bar-height": `${timeBarHeight}px`
  } as React.CSSProperties;

  return (
    <div className={styles.scaleBarContainer} style={cssVariables}>
      <TimeScaleBar
        state={state}
        chart={chart}
        visible={showTimeBar}
        onHeightChange={setTimeBarHeight}
      />

      <PriceScaleBar
        state={state}
        chart={chart}
        visible={showPriceBar}
        onWidthChange={setPriceBarWidth}
      />

      <div
        className={styles.toggleButton}
        style={{
          backgroundColor: helperColors.bg,
          borderColor: helperColors.border,
          color: helperColors.font
        }}
      >
        <div
          className={`${styles.togglePart} ${styles.togglePartLeft} ${
            showTimeBar ? styles.active : styles.inactive
          }`}
          onClick={() => setShowTimeBar((prev) => !prev)}
        >
          T
        </div>
        <div
          className={`${styles.togglePart} ${styles.togglePartRight} ${
            showPriceBar ? styles.active : styles.inactive
          }`}
          onClick={() => setShowPriceBar((prev) => !prev)}
        >
          P
        </div>
      </div>
    </div>
  );
}