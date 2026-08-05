import React, { useState, useEffect, useRef, useId, Children } from "react";
import style from "./ListWithTheme.module.css";

import ThemeData, { DEFAULT_THEME, type Theme } from "../../data/theme/ThemeData.js";
import type { RGB, RGBA } from "../type.js";

const toRGBString = (color: RGB) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

interface ListWithThemeProps {
  type?: "vertical" | "horizontal";
  children: React.ReactNode;

  selectedList?: boolean[];
  dividerList?: boolean[];

  maxWidth?: string;
  maxHeight?: string;
  overflowX?: React.CSSProperties["overflowX"];
  overflowY?: React.CSSProperties["overflowY"];
}

export default function ListWithTheme({
  children,
  selectedList = [],
  type = "vertical",
  dividerList = [],

  maxWidth,
  maxHeight,
  overflowX,
  overflowY,
}: ListWithThemeProps) {
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

  const combinedContainerStyle: React.CSSProperties = {
    ...inlineThemeStyle,
    maxWidth,
    maxHeight,
    overflowX,
    overflowY,
  };

  const childrenArray = Children.toArray(children);

  const containerClasses = [
    style.ListWithTheme,
    type === "horizontal" ? style.horizontal : style.vertical,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses} style={combinedContainerStyle}>
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