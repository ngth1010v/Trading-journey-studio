import { useState, useEffect, useId, useRef } from "react";
import styles from "./Workspace.module.css";
import Home from "./home/Home";
import PageLoader from "./loader/PageLoader";
import ThemeData, { DEFAULT_THEME, type Theme } from "../modules/data/theme/ThemeData";

type ViewState = "HOME" | "LOADER";

interface PendingTarget {
  view: ViewState;
  pageElementId?: number;
}

const formatRgba = (color: [number, number, number, number]): string =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

export default function Workspace() {
  const listenerId = useId();

  // Theme state managed internally
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  // Active page view state
  const [activeView, setActiveView] = useState<ViewState>("HOME");
  const [activePageElementId, setActivePageElementId] = useState<number | null>(null);

  // Animation states: 'idle' | 'covering' | 'uncovering'
  const [coverState, setCoverState] = useState<"idle" | "covering" | "uncovering">("idle");
  const pendingTargetRef = useRef<PendingTarget | null>(null);

  // 1. Initialize ThemeData & handle changes
  useEffect(() => {
    const themeData = new ThemeData();

    themeData.addOnSelectedThemeDataChange(listenerId, () => {
      setTheme(themeData.getSelected());
    });

    themeData.init();

    return () => {
      themeData.removeOnSelectedThemeDataChange(listenerId);
      themeData.destroy();
    };
  }, [listenerId]);

  // 2. Trigger view transition animation sequence
  const transitionTo = (view: ViewState, pageElementId?: number) => {
    if (coverState !== "idle") return; // Prevent overlapping transitions

    pendingTargetRef.current = { view, pageElementId };
    setCoverState("covering");
  };

  // 3. Handle Animation Timers (250ms cover -> swap view -> 250ms uncover)
  useEffect(() => {
    if (coverState === "covering") {
      const coverTimer = setTimeout(() => {
        // Swap component when screen is fully covered
        if (pendingTargetRef.current) {
          setActiveView(pendingTargetRef.current.view);
          if (pendingTargetRef.current.pageElementId !== undefined) {
            setActivePageElementId(pendingTargetRef.current.pageElementId);
          } else {
            setActivePageElementId(null);
          }
          pendingTargetRef.current = null;
        }

        // Start uncover phase
        setCoverState("uncovering");
      }, 250);

      return () => clearTimeout(coverTimer);
    }

    if (coverState === "uncovering") {
      const uncoverTimer = setTimeout(() => {
        setCoverState("idle");
      }, 250);

      return () => clearTimeout(uncoverTimer);
    }
  }, [coverState]);

  // Navigation handlers passed down to child views
  const goToLoader = (pageElementId: number) => transitionTo("LOADER", pageElementId);

  // Coverer color using theme.panel.normal1.background
  const coverBgColor = formatRgba(theme.panel.normal1.background);

  return (
    <div className={styles.workspaceContainer}>
      {/* Dynamic Page Rendering */}
      <div className={styles.pageContainer}>
        {activeView === "HOME" && (
          <Home onSelectPageElement={(id) => goToLoader(id)} />
        )}

        {activeView === "LOADER" && activePageElementId !== null && (
          <PageLoader pageElementId={activePageElementId} />
        )}
      </div>

      {/* Transition Overlay */}
      {coverState !== "idle" && (
        <div
          className={`${styles.coverer} ${
            coverState === "covering" ? styles.covererCovering : styles.covererUncovering
          }`}
          style={{ backgroundColor: coverBgColor }}
        />
      )}
    </div>
  );
}