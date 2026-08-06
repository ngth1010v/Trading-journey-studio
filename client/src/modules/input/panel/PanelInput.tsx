import React, { useState, useEffect, useRef, useId } from "react";
import ThemeData from "../../data/theme/ThemeData";
import { INPUT_MAP } from "./InputMap";
import { formatLabel, getValueAtPath, toRGBString, toRGBAString } from "./panelUtil";
import styles from "./PanelInput.module.css";

interface PanelInputProps {
  layout: any;
  data: any;

  points?: number;

  onDataChange?: (data: any) => void;

  header?: React.ReactNode;
  footer?: React.ReactNode;

  width?: string;
  height?: string;
  maxWidth?: string;
  maxHeight?: string;
  minWidth?: string;
  minHeight?: string;
}

// Sub-component to manage its own animation transition states smoothly
function CollapsibleGroup({
  collapsed,
  headerBgColor,
  contentBgColor,
  contentBorderColor,
  groupLabel,
  onToggle,
  children,
}: {
  collapsed: boolean;
  headerBgColor?: string;
  contentBgColor?: string;
  contentBorderColor?: string;
  groupLabel: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [prevCollapsed, setPrevCollapsed] = useState(collapsed);

  // Synchronously catch prop changes during render to prevent height flash glitches
  if (collapsed !== prevCollapsed) {
    setPrevCollapsed(collapsed);
    setIsTransitioning(true);
  }

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName === "grid-template-rows") {
      setIsTransitioning(false);
    }
  };

  const isFullyOpen = !collapsed && !isTransitioning;

  return (
    <div 
      className={styles.groupContainer} 
      style={{ borderColor: contentBorderColor }}
    >
      <button
        type="button"
        className={styles.groupHeader}
        style={{ backgroundColor: headerBgColor }}
        onClick={onToggle}
      >
        <span className={styles.groupTitle}>{groupLabel}</span>
        <span className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ""}`}>
          ▼
        </span>
      </button>

      <div
        className={`${styles.collapseWrapper} ${
          collapsed ? styles.collapseWrapperCollapsed : ""
        }`}
        onTransitionEnd={handleTransitionEnd}
      >
        <div
          className={`${styles.collapseContent} ${
            isFullyOpen ? styles.uncollapsedFinished : ""
          }`}
        >
          <div
            className={styles.groupContent}
            style={{
              backgroundColor: contentBgColor,
              borderTopColor: contentBorderColor,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PanelInput({
  layout,
  data,
  points = 0,
  onDataChange,
  header,
  footer,
  width = "fit-content",
  height = "fit-content",
  maxWidth,
  maxHeight,
  minWidth,
  minHeight,
}: PanelInputProps) {
  // 1. Maintain ThemeData instance on component ref without putting it in useState
  const themeDataRef = useRef<ThemeData | null>(null);
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }
  const themeData = themeDataRef.current;

  // Unique listener ID for this component instance
  const listenerId = useId();

  // Local state for force re-rendering on internal updates or theme polling changes
  const [, forceUpdate] = useState(0);

  // 2. Initialize ThemeData, subscribe to polling changes, and handle teardown
  useEffect(() => {
    let isMounted = true;

    themeData.init()

    themeData.addOnSelectedThemeDataChange(listenerId, () => {
      if (isMounted) {
        forceUpdate((prev) => prev + 1);
      }
    });

    return () => {
      isMounted = false;
      themeData.removeOnSelectedThemeDataChange(listenerId);
      themeData.destroy();
    };
  }, [themeData, listenerId]);

  // 3. Extract active theme via getSelected()
  const activeTheme = themeData.getSelected();

  // Local state to track collapse nodes by dot-separated path keys
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>({});

  const toggleCollapse = (path: string[]) => {
    const pathKey = path.join(".");
    const currentlyCollapsed = collapsedPaths[pathKey] ?? true;
    setCollapsedPaths((prev) => ({
      ...prev,
      [pathKey]: !currentlyCollapsed,
    }));
  };

  const isCollapsed = (path: string[]) => {
    const pathKey = path.join(".");
    return collapsedPaths[pathKey] ?? true;
  };

  // Perform in-place modification of the raw object
  const updateField = (path: string[], value: any) => {
    let current = data;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[path[path.length - 1]] = value;
    
    forceUpdate((prev) => prev + 1);
    if (onDataChange) {
      onDataChange(data);
    }
  };

  // Build the inline styling dynamically using activeTheme.panel.normal1
  const containerStyle: React.CSSProperties = {
    width,
    height,
    maxWidth,
    maxHeight,
    minWidth,
    minHeight,
    backgroundColor: activeTheme ? toRGBAString(activeTheme.panel.normal1.background) : undefined,
    borderColor: activeTheme ? toRGBAString(activeTheme.panel.normal1.border) : undefined,
    color: activeTheme ? toRGBString(activeTheme.panel.normal1.font) : undefined,
  };

  // Precompute dynamic values from the active theme
  const groupHeaderBg = activeTheme
    ? toRGBAString([
        activeTheme.panel.normal1.font[0],
        activeTheme.panel.normal1.font[1],
        activeTheme.panel.normal1.font[2],
        0.10, // Overwrite font alpha to 0.10 for header container
      ])
    : undefined;

  const groupContentBg = activeTheme
    ? toRGBAString(activeTheme.panel.normal1.background)
    : undefined;

  const groupContentBorder = activeTheme
    ? toRGBAString(activeTheme.panel.normal1.border)
    : undefined;

  // Recursive parser
  const renderNode = (node: any, path: string[]) => {
    // LEAF NODE (Renders basic single inputs matched from INPUT_MAP)
    if (typeof node === "string") {
      const config = INPUT_MAP[node as keyof typeof INPUT_MAP];
      if (!config) return null;

      const value = getValueAtPath(data, path);
      const isMissing = value === undefined || value === null;
      const label = formatLabel(path[path.length - 1]);
      
      const InputComponent = config.component as React.ComponentType<any>;

      const mergedProps = {
        label,
        data: value,
        setData: (val: any) => updateField(path, val),
        ...config.props,

        ...(config.component?.name === "PriceInput" && {
          points,
        }),
      };

      return (
        <div
          key={path.join(".")}
          className={`${styles.inputRow} ${isMissing ? styles.disabledInputWrapper : ""}`}
        >
          <InputComponent {...mergedProps}/>
        </div>
      );
    }

    // NESTED NODE (Renders collapsible box group containers)
    if (typeof node === "object" && node !== null) {
      const pathStr = path.join(".");
      const collapsed = isCollapsed(path);
      const groupLabel = formatLabel(path[path.length - 1] || "Settings");

      return (
        <CollapsibleGroup
          key={pathStr}
          collapsed={collapsed}
          headerBgColor={groupHeaderBg}
          contentBgColor={groupContentBg}
          contentBorderColor={groupContentBorder}
          groupLabel={groupLabel}
          onToggle={() => toggleCollapse(path)}
        >
          {Object.entries(node).map(([childKey, childLayout]) =>
            renderNode(childLayout, [...path, childKey])
          )}
        </CollapsibleGroup>
      );
    }

    return null;
  };

  return (
    <div className={styles.panel} style={containerStyle}>
      {header && <div className={styles.headerContainer}>{header}</div>}
      
      <div className={styles.contentContainer}>
        {Object.entries(layout).map(([key, childLayout]) =>
          renderNode(childLayout, [key])
        )}
      </div>

      {footer && <div className={styles.footerContainer}>{footer}</div>}
    </div>
  );
}