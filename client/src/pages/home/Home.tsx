import { useEffect, useState, useId, useRef } from "react";
import styles from "./Home.module.css";
import ThemeData, { DEFAULT_THEME, type Theme } from "../../modules/data/theme/ThemeData";
import PageData, { type Page, DEFAULT_PAGE } from "../../modules/data/page/PageData";

import OpenIcon     from "../../assets/icons/export.svg?react";
import TjsIcon      from "../../assets/icons/tjs.svg?react";
import SettingIcon  from "../../assets/icons/wrench.svg?react";
import RemoveIcon   from "../../assets/icons/x.svg?react";

interface HomeProps {
  onSelectPage: (id: number) => void;
  onSelectEditPage: (id: number) => void;
}

interface RowItem {
  key: string;
  id?: number;
  name: string;
  isPlaceholder?: boolean;
  isExiting?: boolean;
  isNew?: boolean;
  pageDataRef?: Page;
}

const formatRgba = (color: [number, number, number, number]) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

const formatRgb = (color: [number, number, number]) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

export default function Home({ onSelectPage, onSelectEditPage }: HomeProps) {
  const listenerId = useId();

  // 1. Initialize useRef instances (lazy instantiation on first render)
  const themeDataRef = useRef<ThemeData | null>(null);
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const pageDataRef = useRef<PageData | null>(null);
  if (!pageDataRef.current) {
    pageDataRef.current = new PageData();
  }

  // 3. Initialize state directly from ref methods on first render
  const [theme, setTheme] = useState<Theme>(() => themeDataRef.current!.getSelected());
  const [pages, setPages] = useState<Page[]>(() => pageDataRef.current!.getAll());

  const [exitingIds, setExitingIds] = useState<Set<number>>(new Set());
  const [placeholders, setPlaceholders] = useState<{ tempId: string; name: string }[]>([]);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [isAddHovered, setIsAddHovered] = useState(false);

  // 2. Lifecycle management for instances and change listeners
  useEffect(() => {
    const themeData = themeDataRef.current!;
    const pageData = pageDataRef.current!;

    // Initialize instances
    themeData.init();
    pageData.init();

    // Register listeners
    themeData.addOnSelectedThemeDataChange(listenerId, () => {
      setTheme(themeData.getSelected());
    });

    pageData.addOnPageDataChange(listenerId, () => {
      setPages(pageData.getAll());
      // Clean up placeholders once real data synchronizes
      setPlaceholders([]);
    });

    // Initial sync in case data updated right at init
    setTheme(themeData.getSelected());
    setPages(pageData.getAll());

    return () => {
      themeData.removeOnSelectedThemeDataChange(listenerId);
      themeData.destroy();

      pageData.removeOnPageDataChange(listenerId);
      pageData.destroy();
    };
  }, [listenerId]);

  const activeTheme = theme || DEFAULT_THEME;

  const handleAddPage = async () => {
    const tempId = `temp-${Date.now()}`;
    // Add placeholder with slide-in state
    setPlaceholders((prev) => [...prev, { tempId, name: DEFAULT_PAGE.name }]);

    if (pageDataRef.current) {
      try {
        await pageDataRef.current.set(DEFAULT_PAGE);
      } catch (error) {
        console.error("Failed to add new page:", error);
        setPlaceholders((prev) => prev.filter((p) => p.tempId !== tempId));
      }
    }
  };

  const handleRemovePage = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();

    // Mark page as exiting to trigger slide-out animation
    setExitingIds((prev) => new Set(prev).add(id));

    // Wait for animation duration (300ms) before sending remove API call
    setTimeout(async () => {
      if (pageDataRef.current) {
        try {
          pageDataRef.current.remove(id);
        } catch (error) {
          console.error("Failed to remove page:", error);
          // Restore row on failure
          setExitingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    }, 300);
  };

  const addButtonStyle = isAddHovered
    ? activeTheme.button.primary2
    : activeTheme.button.normal1;

  // Render combined list of real pages & optimistic placeholders
  const displayRows: RowItem[] = [
    ...pages.map((p) => ({
      key: `page-${p.id}`,
      id: p.id,
      name: p.name,
      isExiting: p.id !== undefined && exitingIds.has(p.id),
      pageDataRef: p,
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
                      onSelectPage(row.id);
                    }
                  }}
                >
                  <span className={styles.pageName}>{row.name}</span>

                  <div className={styles.actionContainer}>
                    {isHovered && !row.isPlaceholder && !row.isExiting && (
                      <>
                        <button
                          type="button"
                          className={styles.settingButton}
                          title="Remove Page"
                          onClick={(e) => {
                            if (row.id !== undefined) {
                              handleRemovePage(e, row.id);
                            }
                          }}
                        >
                          <RemoveIcon />
                        </button>

                        <button
                          type="button"
                          className={styles.settingButton}
                          title="Edit Page"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (row.id !== undefined) {
                              onSelectEditPage(row.id);
                            }
                          }}
                        >
                          <SettingIcon />
                        </button>
                      </>
                    )}
                    <div className={styles.openIcon}>
                      <OpenIcon />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add New Page Row */}
          <div
            className={styles.addPageRow}
            style={{
              backgroundColor: formatRgba(addButtonStyle.background),
              borderColor: formatRgba(addButtonStyle.border),
              color: formatRgb(addButtonStyle.font),
            }}
            onMouseEnter={() => setIsAddHovered(true)}
            onMouseLeave={() => setIsAddHovered(false)}
            onClick={handleAddPage}
          >
            +
          </div>
        </div>
      </div>
    </div>
  );
}