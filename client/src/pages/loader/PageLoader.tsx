import { useState, useEffect, useId, useRef } from "react";
import PageData, { type Page } from "../../modules/data/page/PageData";
import ThemeData, { type Theme, DEFAULT_THEME } from "../../modules/data/theme/ThemeData";
import { ELEMENT_MAP } from "../../modules/pageElements/elementMap";

import HomeIcon from "../../assets/icons/house-simple.svg?react";
import EditIcon from "../../assets/icons/paint-brush-broad.svg?react";
import styles from "./PageLoader.module.css";

interface PageLoaderProps {
  pageId: number;
  goHome: () => void;
  goToEditor: (pageId: number) => void;
}

const toRgba = (rgba: [number, number, number, number]) =>
  `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;

export default function PageLoader({ pageId, goHome, goToEditor }: PageLoaderProps) {
  const themeListenerId = useId();
  const pageListenerId = useId();

  // 1. Initialize useRef instances
  const themeDataRef = useRef<ThemeData | null>(null);
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const pageDataRef = useRef<PageData | null>(null);
  if (!pageDataRef.current) {
    pageDataRef.current = new PageData();
  }

  // Helper to extract page state safely
  const getInitialPageState = () => {
    try {
      const page = pageDataRef.current!.get(pageId);
      return { page, notFound: false, loading: false };
    } catch {
      return { page: null, notFound: false, loading: true };
    }
  };

  const initialPageState = getInitialPageState();

  // 3. Initialize states directly from ref data on initial render
  const [theme, setTheme] = useState<Theme>(() => themeDataRef.current!.getSelected());
  const [currentPage, setCurrentPage] = useState<Page | null>(initialPageState.page);
  const [isLoading, setIsLoading] = useState<boolean>(initialPageState.loading);
  const [notFound, setNotFound] = useState<boolean>(initialPageState.notFound);

  // 2. ThemeData lifecycle & subscription
  useEffect(() => {
    let isMounted = true;
    const themeData = themeDataRef.current!;

    themeData.addOnSelectedThemeDataChange(themeListenerId, () => {
      if (isMounted) {
        setTheme(themeData.getSelected());
      }
    });

    themeData.init();
    setTheme(themeData.getSelected());

    return () => {
      isMounted = false;
      themeData.removeOnSelectedThemeDataChange(themeListenerId);
      themeData.destroy();
    };
  }, [themeListenerId]);

  // 2. PageData lifecycle & subscription
  useEffect(() => {
    let isMounted = true;
    const pageDataInstance = pageDataRef.current!;

    const syncPageData = () => {
      if (!isMounted) return;
      try {
        const page = pageDataInstance.get(pageId);
        setCurrentPage(page);
        setNotFound(false);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    pageDataInstance.addOnPageDataChange(pageListenerId, syncPageData);
    pageDataInstance.init();
    syncPageData();

    return () => {
      isMounted = false;
      pageDataInstance.removeOnPageDataChange(pageListenerId);
      pageDataInstance.destroy();
    };
  }, [pageId, pageListenerId]);

  // Style objects derived from Theme
  const activeTheme = theme || DEFAULT_THEME;
  const containerStyle = {
    background: toRgba(activeTheme.background),
    border: `1px solid ${toRgba(activeTheme.panel.normal1.border)}`,
    color: `rgb(${activeTheme.panel.normal1.font.join(",")})`,
  };

  const buttonStyle = {
    background: toRgba(activeTheme.button.normal1.background),
    border: `1px solid ${toRgba(activeTheme.button.normal1.border)}`,
    color: `rgb(${activeTheme.button.normal1.font.join(",")})`,
  };

  // Find root level elements (parentId === -1)
  const rootElements = currentPage?.data.filter((el) => el.parentId === -1) || [];

  return (
    <div className={styles.container} style={containerStyle}>
      {/* Top Left Navigation Buttons */}
      <div className={styles.actionOverlay}>
        <button
          type="button"
          className={styles.actionButton}
          style={buttonStyle}
          onClick={goHome}
          title="Go to Home"
        >
          <HomeIcon className={styles.icon} />
        </button>

        <button
          type="button"
          className={styles.actionButton}
          style={buttonStyle}
          onClick={() => goToEditor(pageId)}
          title="Go to Editor"
        >
          <EditIcon className={styles.icon} />
        </button>
      </div>

      {/* Main Container Content */}
      {isLoading ? (
        <div className={styles.fallbackState}>Loading page {pageId}...</div>
      ) : notFound || !currentPage ? (
        <div className={styles.fallbackState}>Page {pageId} not found.</div>
      ) : (
        <div className={styles.rootElementsWrapper}>
          {rootElements.map((element) => {
            const entry = ELEMENT_MAP[element.type as keyof typeof ELEMENT_MAP];
            if (!entry) return null;

            const Component = entry.component;
            return (
              <div key={element.id} className={styles.rootElementItem}>
                <Component elementId={element.id} pageId={pageId} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}