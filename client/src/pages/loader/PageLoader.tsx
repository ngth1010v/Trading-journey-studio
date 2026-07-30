import { useState, useEffect, useId } from "react";
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
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);

  const themeListenerId = useId();
  const pageListenerId = useId();

  // Handle ThemeData lifecycle and live updates
  useEffect(() => {
    let isMounted = true;
    const themeData = new ThemeData();

    themeData.init()

    themeData.addOnSelectedThemeDataChange(themeListenerId, () => {
      if (isMounted) setTheme(themeData.getSelected());
    });

    return () => {
      isMounted = false;
      themeData.removeOnSelectedThemeDataChange(themeListenerId);
      themeData.destroy();
    };
  }, [themeListenerId]);

  // Handle PageData lifecycle and refresh callbacks
  useEffect(() => {
    let isMounted = true;
    const pageDataInstance = new PageData();

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

    return () => {
      isMounted = false;
      pageDataInstance.removeOnPageDataChange(pageListenerId);
      pageDataInstance.destroy();
    };
  }, [pageId, pageListenerId]);

  // Style objects derived from Theme
  const containerStyle = {
    background: toRgba(theme.background),
    border: `1px solid ${toRgba(theme.panel.normal1.border)}`,
    color: `rgb(${theme.panel.normal1.font.join(",")})`,
  };

  const buttonStyle = {
    background: toRgba(theme.button.normal1.background),
    border: `1px solid ${toRgba(theme.button.normal1.border)}`,
    color: `rgb(${theme.button.normal1.font.join(",")})`,
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
                <Component elementId={element.id} pageId={pageId}/>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}