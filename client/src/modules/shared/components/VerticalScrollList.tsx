import React, { useState, useEffect, useRef, useId, Children } from "react";
import style from "./VerticalScrollList.module.css";

import ThemeData, { DEFAULT_THEME, type Theme } from "../../data/theme/ThemeData.js";
import type { RGB, RGBA } from "../type.js";

const toRGBString = (color: RGB) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

interface VerticalScrollListProps {
  children: React.ReactNode;
  childrenHeight?: string;
  selectedList?: boolean[];
  maxVisibleChildrenCount?: number;
  autoShrink?: boolean;
  dividerList?: boolean[];
  padding?: string;
  gap?: string;
}

export default function VerticalScrollList({
  children,
  childrenHeight = "14px",
  selectedList = [],
  maxVisibleChildrenCount = 10,
  autoShrink = false,
  dividerList = [],
  padding = "4px",
  gap = "5px",
}: VerticalScrollListProps) {
  //---------------------------------------
  // Theme Data Setup
  //---------------------------------------
  const instanceId = useId();
  const themeDataRef = useRef<ThemeData | null>(null);

  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const [currentTheme, setCurrentTheme] = useState<Theme>(() =>
    themeDataRef.current ? themeDataRef.current.getSelected() : DEFAULT_THEME
  );

  useEffect(() => {
    const themeData = themeDataRef.current;
    if (!themeData) return;

    const handleThemeChange = () => {
      setCurrentTheme(themeData.getSelected());
    };

    themeData.addOnSelectedThemeDataChange(instanceId, handleThemeChange);
    themeData.init();

    return () => {
      themeData.removeOnSelectedThemeDataChange(instanceId);
      themeData.destroy();
    };
  }, [instanceId]);

  //---------------------------------------
  // Animation state locking for autoShrink
  //---------------------------------------
  const [isExtended, setIsExtended] = useState(false);
  const isAnimatingRef = useRef(false);
  const isHoveredRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseEnter = () => {
    if (!autoShrink) return;
    isHoveredRef.current = true;

    if (!isAnimatingRef.current && !isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(true);
    }
  };

  const handleMouseLeave = () => {
    if (!autoShrink) return;
    isHoveredRef.current = false;

    if (!isAnimatingRef.current && isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(false);
    }
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = mousePosRef.current;

    const isStillInside =
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom;

    isHoveredRef.current = isStillInside;
    isAnimatingRef.current = false;

    if (isHoveredRef.current && !isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(true);
    } else if (!isHoveredRef.current && isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(false);
    }
  };

  //---------------------------------------
  // Dynamic Unmounting / Virtual Scroll
  //---------------------------------------
  const childrenArray = Children.toArray(children);
  const totalCount = childrenArray.length;

  const [startIndex, setStartIndex] = useState(0);

  // Reset/clamp scroll offset when total children count or max visible changes
  useEffect(() => {
    const maxStartIndex = Math.max(0, totalCount - maxVisibleChildrenCount);
    if (startIndex > maxStartIndex) {
      setStartIndex(maxStartIndex);
    }
  }, [totalCount, maxVisibleChildrenCount, startIndex]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (totalCount <= maxVisibleChildrenCount) return;

    // Proportional scroll step based on wheel deltaY magnitude
    const step = Math.sign(e.deltaY) * Math.max(1, Math.floor(Math.abs(e.deltaY) / 100));
    const maxStartIndex = Math.max(0, totalCount - maxVisibleChildrenCount);

    setStartIndex((prevIndex) => {
      const newIndex = prevIndex + step;
      return Math.max(0, Math.min(newIndex, maxStartIndex));
    });
  };

  const scrollUp = () => {
    setStartIndex((prev) => Math.max(0, prev - 1));
  };

  const scrollDown = () => {
    const maxStartIndex = Math.max(0, totalCount - maxVisibleChildrenCount);
    setStartIndex((prev) => Math.min(maxStartIndex, prev + 1));
  };

  // Calculate visible range taking top and bottom indicators into account
  const isOverflowing = totalCount > maxVisibleChildrenCount;
  const hasTopEllipsis = isOverflowing && startIndex > 0;
  const hasBottomEllipsis = isOverflowing && maxVisibleChildrenCount - (hasTopEllipsis ? 1 : 0) <= (totalCount - startIndex - 2);
  const maxContentCount = isOverflowing
    ? maxVisibleChildrenCount - (hasTopEllipsis ? 1 : 0) - (hasBottomEllipsis ? 1 : 0)
    : totalCount;

  const visibleChildren = childrenArray.slice(startIndex, startIndex + maxContentCount);

  //---------------------------------------
  // Theme & Style Construction
  //---------------------------------------
  const normalTheme = currentTheme?.button?.normal1;
  const primaryTheme = currentTheme?.button?.primary1;

  const inlineThemeStyle: React.CSSProperties & { [key: string]: string } = normalTheme
    ? {
        "--padding": padding,
        "--gap": gap,
        "--children-height": childrenHeight,
        "--bg-color": toRGBAString(normalTheme.background),
        "--border-color": toRGBAString(normalTheme.border),
        "--font-color": toRGBString(normalTheme.font),

        "--hover-bg": toRGBAString(
          currentTheme?.button?.primary2?.background ?? normalTheme.background
        ),
        "--hover-font": toRGBString(
          currentTheme?.button?.primary2?.font ?? normalTheme.font
        ),

        "--selected-bg": primaryTheme
          ? toRGBAString(primaryTheme.background)
          : toRGBAString(normalTheme.background),
        "--selected-font": primaryTheme
          ? toRGBString(primaryTheme.font)
          : toRGBString(normalTheme.font),
        "--selected-border": primaryTheme
          ? toRGBAString(primaryTheme.border)
          : toRGBAString(normalTheme.border),
      }
    : {
        "--padding": padding,
        "--gap": gap,
        "--children-height": childrenHeight,
        "--bg-color": "#1e1e1e",
        "--border-color": "#333333",
        "--font-color": "#ffffff",
        "--hover-bg": "#2a2a2a",
        "--hover-font": "#ffffff",
        "--selected-bg": "#2563eb",
        "--selected-font": "#ffffff",
        "--selected-border": "#3b82f6",
      };

  const containerClasses = [
    style.VerticalScrollList,
    autoShrink ? style.autoShrink : "",
    autoShrink && isExtended ? style.extended : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={containerClasses}
      style={inlineThemeStyle}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTransitionEnd={handleTransitionEnd}
    >
      {hasTopEllipsis && (
        <div className={style.ellipsisRow} onClick={scrollUp}>
          ...
        </div>
      )}

      {visibleChildren.map((child, idx) => {
        const originalIndex = startIndex + idx;
        const isSelected = Boolean(selectedList[originalIndex]);

        return (
          <React.Fragment key={originalIndex}>
            <div
              className={`${style.rowWrapper} ${
                isSelected ? style.selectedRow : ""
              }`}
            >
              {child}
            </div>
            {dividerList[originalIndex] && <div className={style.divider} />}
          </React.Fragment>
        );
      })}

      {hasBottomEllipsis && (
        <div className={style.ellipsisRow} onClick={scrollDown}>
          ...
        </div>
      )}
    </div>
  );
}