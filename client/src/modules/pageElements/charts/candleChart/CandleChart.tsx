import { useEffect, useRef, useState } from "react";
import PageData, { type Page } from "../../../data/page/PageData";
import ThemeData, { type Theme, DEFAULT_THEME } from "../../../data/theme/ThemeData";
import StateData from "./state/StateData";
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
  const pageDataRef = useRef<PageData | null>(null);
  const themeDataRef = useRef<ThemeData | null>(null);

  if (!stateRef.current) {
    stateRef.current = new StateData();
  }
  if (!pageDataRef.current) {
    pageDataRef.current = new PageData();
  }
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const state = stateRef.current;
  const pageData = pageDataRef.current;
  const themeData = themeDataRef.current;

  useEffect(() => {
    let isMounted = true;
    const listenerId = `CandleChart_${pageId}_${elementId}_${Math.random().toString(36).substring(2, 9)}`;

    // Flag to prevent infinite loops during state <-> page sync
    let isSyncingFromPage = false;

    // 1. Initialize StateData, PageData, ThemeData
    const initAll = async () => {
      // Init ThemeData & listen to theme changes
      try {
        await themeData.init();
        if (isMounted) {
          setTheme(themeData.getSelected());
        }
      } catch (err) {
        console.error("Failed to initialize ThemeData in CandleChart:", err);
      }

      themeData.addOnSelectedThemeDataChange(listenerId, () => {
        if (isMounted) {
          setTheme(themeData.getSelected());
        }
      });

      // Init StateData
      await state.init();

      // Init PageData & register polling update listener
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
              data: element.data || {}
            });
            isSyncingFromPage = false;
          }
        } catch (err) {
          console.error(`CandleChart: Failed to sync page ${pageId} element ${elementId}`, err);
        }
      };

      // Initial sync from pageData to state.config
      syncPageToState();

      // Listen for remote/polling PageData changes
      pageData.addOnPageDataChange(listenerId, syncPageToState);

      // Register listener on state.config to sync changes back to pageElement.data
      state.config.addOnConfigDataChange(listenerId, [], async () => {
        if (!isMounted || isSyncingFromPage) return;

        try {
          const latestConfig = state.config.get();
          const currentPage = pageData.get(pageId);

          const updatedElements = currentPage.data.map((el) => {
            if (el.id === elementId) {
              return {
                ...el,
                data: latestConfig.data
              };
            }
            return el;
          });

          await pageData.set({
            ...currentPage,
            data: updatedElements
          });
        } catch (err) {
          console.error("CandleChart: Failed to sync state config back to PageData:", err);
        }
      });
    };

    initAll();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      themeData.removeOnSelectedThemeDataChange(listenerId);
      themeData.destroy();

      pageData.removeOnPageDataChange(listenerId);
      pageData.destroy();

      state.config.removeOnConfigDataChange(listenerId);
      state.destroy();
    };
  }, [pageId, elementId, state, pageData, themeData]);

  const toRgba = (rgba: [number, number, number, number]) =>
    `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;

  return (
    <div
      className={styles.container}
      style={{
        background: toRgba(theme.background)
      }}
    >
      <Navigation state={state} />
    </div>
  );
}