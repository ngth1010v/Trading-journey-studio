import React, { useState, useEffect, useId, Children } from "react";
import style from "./ListWithTheme.module.css";

import { useThemeData }     from "../../modules/theme/useThemeData";
import type { Theme }       from "../../modules/theme/type";
import type { RGB, RGBA }   from "../types/color.type";

const toRGBString = (color: RGB) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

interface ListWithThemeProps {
  children?: React.ReactNode;
  selectedList?: boolean[];
  type?: "vertical" | "horizontal";
  autoShrink?: boolean;

  width?: string;
  minWidth?: string;
  maxWidth?: string;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
}

export default function ListWithTheme({
  children,
  selectedList = [],
  type = "vertical",
  autoShrink = false,

  width,
  minWidth,
  maxWidth = "200px",
  height,
  minHeight,
  maxHeight = "10rem",
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

  const normalTheme = currentTheme?.button?.normal1;
  const primaryTheme = currentTheme?.button?.primary1;

  const inlineThemeStyle: React.CSSProperties & { [key: string]: string } = normalTheme
    ? {
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
        "--bg-color": "#1e1e1e",
        "--border-color": "#333333",
        "--font-color": "#ffffff",
        "--hover-bg": "#2a2a2a",
        "--hover-font": "#ffffff",
        "--selected-bg": "#2563eb",
        "--selected-font": "#ffffff",
        "--selected-border": "#3b82f6",
      };

  // Combine theme custom CSS variables with container layout dimension properties
  const combinedContainerStyle: React.CSSProperties = {
    ...inlineThemeStyle,
    width,
    minWidth,
    maxWidth,
    height,
    minHeight,
    maxHeight,
  };

  const childrenArray = Children.toArray(children);

  return (
    <div
      className={`${style.ListWithTheme} ${
        type === "horizontal" ? style.horizontal : style.vertical
      } ${autoShrink ? style.autoShrink : ""}`}
      style={combinedContainerStyle}
    >
      {childrenArray.map((child, index) => {
        const isSelected = Boolean(selectedList[index]);
        return (
          <div
            key={index}
            className={`${style.rowWrapper} ${
              isSelected ? style.selectedRow : ""
            }`}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}