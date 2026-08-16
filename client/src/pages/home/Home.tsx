import { useEffect, useState, useId, useRef } from "react";
import styles from "./Home.module.css";
import ThemeData, { DEFAULT_THEME, type Theme } from "../../modules/data/theme/ThemeData";
import PageElementData, { type PageElement } from "../../modules/data/pageElement/PageElementData";

import OpenIcon from "../../assets/icons/export.svg?react";
import TjsIcon from "../../assets/icons/tjs.svg?react";
import RemoveIcon from "../../assets/icons/x.svg?react";

interface HomeProps {
  onSelectPageElement: (id: number) => void;
}

interface RowItem {
  key: string;
  id?: number;
  name: string;
  isPlaceholder?: boolean;
  isExiting?: boolean;
  isNew?: boolean;
  pageElementDataRef?: PageElement;
}

const formatRgba = (color: [number, number, number, number]) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

const formatRgb = (color: [number, number, number]) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

export default function Home({ onSelectPageElement }: HomeProps) {
  const listenerId = useId();

  // 1. Initialize useRef instances (lazy instantiation on first render)
  const themeDataRef = useRef<ThemeData | null>(null);
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const pageElementDataRef = useRef<PageElementData | null>(null);
  if (!pageElementDataRef.current) {
    pageElementDataRef.current = new PageElementData();
  }

  // 2. Initialize state directly from ref methods on first render
  const [theme, setTheme] = useState<Theme>(() => themeDataRef.current!.getSelected());
  const [pageElements, setPageElements] = useState<PageElement[]>(() =>
    pageElementDataRef.current!.getAll()
  );

  const [exitingIds, setExitingIds] = useState<Set<number>>(new Set());
  const [placeholders, setPlaceholders] = useState<{ tempId: string; name: string }[]>([]);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [isAddHovered, setIsAddHovered] = useState(false);

  // 3. Lifecycle management for instances and change listeners
  useEffect(() => {
    const themeData = themeDataRef.current!;
    const pageElementData = pageElementDataRef.current!;

    // Initialize instances
    themeData.init();
    pageElementData.init();

    // Register listeners
    themeData.addOnSelectedThemeDataChange(listenerId, () => {
      setTheme(themeData.getSelected());
    });

    pageElementData.addOnPageElementDataChange(listenerId, () => {
      setPageElements(pageElementData.getAll());
      // Clean up placeholders once real data synchronizes
      setPlaceholders([]);
    });

    // Initial sync in case data updated right at init
    setTheme(themeData.getSelected());
    setPageElements(pageElementData.getAll());

    return () => {
      themeData.removeOnSelectedThemeDataChange(listenerId);
      themeData.destroy();

      pageElementData.removeOnPageElementDataChange(listenerId);
      pageElementData.destroy();
    };
  }, [listenerId]);

  const activeTheme = theme || DEFAULT_THEME;

  const handleAddPageElement = async () => {
    const tempId = `temp-${Date.now()}`;
    if (pageElementDataRef.current) {
      const defaultElement = pageElementDataRef.current.getDefault();
      const defaultName = defaultElement.entryName || "Unnamed Element";

      // Add placeholder with slide-in state
      setPlaceholders((prev) => [...prev, { tempId, name: defaultName }]);

      try {
        await pageElementDataRef.current.set(defaultElement);
      } catch (error) {
        console.error("Failed to add new page element:", error);
        setPlaceholders((prev) => prev.filter((p) => p.tempId !== tempId));
      }
    }
  };

  const handleRemovePageElement = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();

    // Mark page element as exiting to trigger slide-out animation (placeholder action)
    setExitingIds((prev) => new Set(prev).add(id));

    setTimeout(() => {
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300);
  };

  const addButtonStyle = isAddHovered
    ? activeTheme.button.primary2
    : activeTheme.button.normal1;

  // Filter page elements to only display entries (entry === true)
  const entryElements = pageElements.filter((el) => el.entry === true);

  // Render combined list of real page elements & optimistic placeholders
  const displayRows: RowItem[] = [
    ...entryElements.map((p) => ({
      key: `page-element-${p.id}`,
      id: p.id,
      name: p.entryName || "Unnamed Element",
      isExiting: p.id !== undefined && exitingIds.has(p.id),
      pageElementDataRef: p,
    })),
    ...placeholders.map((ph) => ({
      key: ph.tempId,
      name: ph.name,
      isPlaceholder: true,
      isNew: true,
    })),
  ];

  return (
    <div
      className={styles.container}
      style={{
        backgroundColor: formatRgba(activeTheme.background),
        color: formatRgb(activeTheme.panel.normal1.font),
      }}
    >
      {/* Left Section */}
      <div className={styles.leftSection}>
        <div className={styles.icon}>
          <TjsIcon width="100%" height="100%" />
        </div>
        <h1 className={styles.title}>Welcome</h1>
        <h2 className={styles.subtitle}>to Trading journey studio</h2>
      </div>

      {/* Right Section */}
      <div className={styles.rightSection}>
        <div className={styles.pageRowContainer}>
          {displayRows.map((row) => {
            const isHovered = hoveredRowKey === row.key;
            const buttonStyle = isHovered
              ? activeTheme.button.primary2
              : activeTheme.button.normal1;

            let animationClass = "";
            if (row.isExiting) {
              animationClass = styles.slideOut;
            } else if (row.isNew) {
              animationClass = styles.slideIn;
            }

            return (
              <div
                key={row.key}
                className={`${styles.rowWrapper} ${animationClass}`}
              >
                <div
                  className={`${styles.pageRow} ${
                    row.isPlaceholder ? styles.placeholderRow : ""
                  }`}
                  style={{
                    backgroundColor: formatRgba(buttonStyle.background),
                    borderColor: formatRgba(buttonStyle.border),
                    color: formatRgb(buttonStyle.font),
                  }}
                  onMouseEnter={() => setHoveredRowKey(row.key)}
                  onMouseLeave={() => setHoveredRowKey(null)}
                  onClick={() => {
                    if (!row.isPlaceholder && row.id !== undefined && !row.isExiting) {
                      onSelectPageElement(row.id);
                    }
                  }}
                >
                  <span className={styles.pageName}>{row.name}</span>

                  <div className={styles.actionContainer}>
                    {isHovered && !row.isPlaceholder && !row.isExiting && (
                      <button
                        type="button"
                        className={styles.settingButton}
                        title="Remove Element"
                        onClick={(e) => {
                          if (row.id !== undefined) {
                            handleRemovePageElement(e, row.id);
                          }
                        }}
                      >
                        <RemoveIcon />
                      </button>
                    )}
                    <div className={styles.openIcon}>
                      <OpenIcon />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add New Page Element Row */}
          <div
            className={styles.addPageRow}
            style={{
              backgroundColor: formatRgba(addButtonStyle.background),
              borderColor: formatRgba(addButtonStyle.border),
              color: formatRgb(addButtonStyle.font),
            }}
            onMouseEnter={() => setIsAddHovered(true)}
            onMouseLeave={() => setIsAddHovered(false)}
            onClick={handleAddPageElement}
          >
            +
          </div>
        </div>
      </div>
    </div>
  );
}