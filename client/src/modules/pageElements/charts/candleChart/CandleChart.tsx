import { useEffect, useRef, useState } from "react";
import PageData, { type Page } from "../../../data/page/PageData";
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
  const pageDataRef = useRef<PageData | null>(null);
  const themeDataRef = useRef<ThemeData | null>(null);

  if (!stateRef.current) {
    stateRef.current = new StateData();
  }
  if (!chartRef.current) {
    chartRef.current = new ChartController();
  }
  if (!pageDataRef.current) {
    pageDataRef.current = new PageData();
  }
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const state = stateRef.current;
  const chart = chartRef.current;
  const pageData = pageDataRef.current;
  const themeData = themeDataRef.current;

  useEffect(() => {
    let disposed = false;
    let initialized = false;

    const listenerId = `CandleChart_${pageId}_${elementId}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    // Flag to prevent infinite loops during state <-> page sync
    let isSyncingFromPage = false;

    const initAll = async () => {
      try {
        //====================================================================================================
        // ThemeData
        //====================================================================================================
        await themeData.init();

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
        await state.init();

        if (disposed) {
          themeData.destroy();
          pageData.destroy();
          chart.destroy();
          state.destroy();
          return;
        }

        chart.init(state);

        //====================================================================================================
        // PageData
        //====================================================================================================
        pageData.init();

        const syncPageToState = () => {
          try {
            const currentPage: Page = pageData.get(pageId);
            const element = currentPage.data.find((el) => el.id === elementId);

            if (element) {
              isSyncingFromPage = true;

              state.config.set({
                pageId,
                elementId,
                data: element.data || {},
              });

              isSyncingFromPage = false;
            }
          } catch (err) {
            console.error(
              `CandleChart: Failed to sync page ${pageId} element ${elementId}`,
              err
            );
          }
        };

        // Initial sync
        syncPageToState();

        // Listen for PageData changes
        pageData.addOnPageDataChange(listenerId, syncPageToState);

        // Sync StateData -> PageData
        state.config.addOnConfigDataChange(listenerId, [], async () => {
          if (disposed || isSyncingFromPage) return;

          try {
            const latestConfig = state.config.get();
            const currentPage = pageData.get(pageId);

            const updatedElements = currentPage.data.map((el) =>
              el.id === elementId
                ? {
                    ...el,
                    data: latestConfig.data,
                  }
                : el
            );

            await pageData.set({
              ...currentPage,
              data: updatedElements,
            });
          } catch (err) {
            console.error(
              "CandleChart: Failed to sync state config back to PageData:",
              err
            );
          }
        });

        initialized = true;
      } catch (err) {
        console.error("Failed to initialize CandleChart:", err);
      }
    };

    initAll();

    return () => {
      disposed = true;

      themeData.removeOnSelectedThemeDataChange(listenerId);
      pageData.removeOnPageDataChange(listenerId);
      state.config.removeOnConfigDataChange(listenerId);

      if (initialized) {
        themeData.destroy();
        pageData.destroy();
        chart.destroy();
        state.destroy();
      }
    };
  }, [pageId, elementId, state, chart, pageData, themeData]);

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