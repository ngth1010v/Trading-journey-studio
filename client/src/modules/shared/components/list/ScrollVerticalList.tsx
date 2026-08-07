import React, { useState, useEffect, useRef, useId, Children } from "react";
import style from "./css/ScrollVerticalList.module.css";

import ThemeData, { DEFAULT_THEME, type Theme } from "../../../data/theme/ThemeData.js";
import type { RGB, RGBA } from "../../type.js";

const toRGBString = (color: RGB) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

interface ScrollVerticalList {
  children: React.ReactNode;
  childrenHeight?: string;
  selectedList?: boolean[];
  maxVisibleChildrenCount?: number;
  dividerList?: boolean[];
}

export default function ScrollVerticalList({
  children,
  childrenHeight = "19px",
  selectedList = [],
  maxVisibleChildrenCount = 10,
  dividerList = [],
}: ScrollVerticalList) {
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

  return (
    <div
      className={style.ScrollVerticalList}
      style={inlineThemeStyle}
      onWheel={handleWheel}
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