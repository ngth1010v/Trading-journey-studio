import React, { useState, useEffect, useRef, useId, Children } from "react";
import style from "./ListWithTheme.module.css";

import { useThemeData } from "../../modules/theme/useThemeData";
import type { Theme } from "../../modules/theme/type";
import type { RGB, RGBA } from "../types/color.type";

const toRGBString = (color: RGB) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

interface ListWithThemeProps {
  type ?: "vertical" | "horizontal";
  children : any;

  selectedList ?: boolean[];
  autoShrink ?: boolean;
  dividerList ?: boolean[];

  padding ?: string;
  gap ?: string;
  maxWidth ?: string;
  maxHeight ?: string;
}

export default function ListWithTheme({
  children,
  selectedList = [],
  type = "vertical",
  autoShrink = false,
  dividerList = [],

  padding = "4px",
  gap = "5px",
  maxWidth,
  maxHeight,
}: ListWithThemeProps) {
  //---------------------------------------
  // Theme setup (Matches SourceBar pattern)
  //---------------------------------------
  const themeContext = useThemeData();
  const instanceId = useId();

  const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() =>
    themeContext.get(themeContext.getSelectedName())
  );

  useEffect(() => {
    themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
    return () => themeContext.removeOnSelectedThemeChange(instanceId);
  }, [themeContext, instanceId]);

  //---------------------------------------
  // Animation state locking for autoShrink
  //---------------------------------------
  const [isExtended, setIsExtended] = useState(false);
  const isAnimatingRef = useRef(false);
  const isHoveredRef = useRef(false);
  
  // Track current mouse coordinates to re-verify on transitionend
  const mousePosRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseEnter = () => {
    if (!autoShrink) return;
    isHoveredRef.current = true;

    // Trigger extend only if not currently mid-animation
    if (!isAnimatingRef.current && !isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(true);
    }
    console.log("START")
  };

  const handleMouseLeave = () => {
    if (!autoShrink) return;
    isHoveredRef.current = false;

    // Trigger shrink only if not currently mid-animation
    if (!isAnimatingRef.current && isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(false);
    }
    console.log("END")
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    // Only respond to transitions on the container itself
    if (e.target !== e.currentTarget) return;

    // Re-check: verify if current mouse pointer is actually inside the container's final bounds
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = mousePosRef.current;
    
    const isStillInside = 
      x >= rect.left && 
      x <= rect.right && 
      y >= rect.top && 
      y <= rect.bottom;

    // Correct the hover state if pointer left during transition
    isHoveredRef.current = isStillInside;

    isAnimatingRef.current = false;

    // Check if state needs to catch up after animation completes
    if (isHoveredRef.current && !isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(true);
    } else if (!isHoveredRef.current && isExtended) {
      isAnimatingRef.current = true;
      setIsExtended(false);
    }
  };

  const normalTheme = currentTheme?.button?.normal1;
  const primaryTheme = currentTheme?.button?.primary1;

  const inlineThemeStyle: React.CSSProperties & { [key: string]: string } = normalTheme
    ? {
        "--padding": padding,
        "--gap": gap,
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
        "--bg-color": "#1e1e1e",
        "--border-color": "#333333",
        "--font-color": "#ffffff",
        "--hover-bg": "#2a2a2a",
        "--hover-font": "#ffffff",
        "--selected-bg": "#2563eb",
        "--selected-font": "#ffffff",
        "--selected-border": "#3b82f6",
      };

  const combinedContainerStyle: React.CSSProperties = {
    ...inlineThemeStyle,
    maxWidth,
    maxHeight,
  };

  const childrenArray = Children.toArray(children);

  const containerClasses = [
    style.ListWithTheme,
    type === "horizontal" ? style.horizontal : style.vertical,
    autoShrink ? style.autoShrink : "",
    autoShrink && isExtended ? style.extended : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={containerClasses}
      style={combinedContainerStyle}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTransitionEnd={handleTransitionEnd}
    >
      {childrenArray.map((child, index) => {
        const isSelected = Boolean(selectedList[index]);
        return (
          <React.Fragment key={index}>
            <div
              className={`${style.rowWrapper} ${
                isSelected ? style.selectedRow : ""
              }`}
            >
              {child}
            </div>
            {dividerList[index] && <div className={style.divider} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}