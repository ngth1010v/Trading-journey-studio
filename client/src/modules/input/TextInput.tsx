import React, { useState, useEffect, useId } from "react";
import { useThemeData } from "../theme/useThemeData";
import type { Theme, RGB, RGBA } from "../theme/type";
import styles from "./Input.module.css";

const toRGBString = (color: RGB): string => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
const toRGBAString = (color: RGBA): string => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
const isLightColor = (color: RGBA) => {
    const [r, g, b] = color;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance >= 128;
};

export default function TextInput({
  label,
  data,
  setData,
  onTempDataChange,
  newLine = true,
  labelWidth = "30%",
  dataheight = "5rem",
}: {
  label: string;
  data: string;
  setData: (val: string) => void;
  onTempDataChange?: (tempData: string, setTempData: React.Dispatch<React.SetStateAction<string>>) => void;
  newLine?: boolean;
  labelWidth?: string;
  dataheight?: string;
}) {
  const themeContext = useThemeData();
  const instanceId = useId();
  const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() => themeContext.get(themeContext.getSelectedName()));

  useEffect(() => {
    themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
    return () => themeContext.removeOnSelectedThemeChange(instanceId);
  }, [themeContext, instanceId]);

  const [tempValue, setTempValue] = useState<string>(data);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => setTempValue(data), [data]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTempValue(e.target.value);
    if (onTempDataChange) onTempDataChange(e.target.value, setTempValue);
  };

  const commitValue = () => {
    setData(tempValue);
  };

  const activeTheme = isFocused && currentTheme?.button?.primary2 ? currentTheme.button.primary2 : currentTheme?.button?.normal1;
  const bg = activeTheme?.background;
  const light = bg ? isLightColor(bg) : true;

  const inlineStyles: React.CSSProperties & { [key: string]: string } =
    activeTheme
      ? {
          "--font-color": toRGBString(activeTheme.font),
          "--bg-color": toRGBAString(activeTheme.background),
          "--border-color": toRGBAString(activeTheme.border),

          "--scrollbar-track": light
              ? "rgba(0,0,0,0.05)"
              : "rgba(255,255,255,0.06)",

          "--scrollbar-thumb": light
              ? "rgba(0,0,0,0.25)"
              : "rgba(255,255,255,0.25)",

          "--scrollbar-thumb-hover": light
              ? "rgba(0,0,0,0.4)"
              : "rgba(255,255,255,0.45)",
        }
      : {
          "--font-color": "#000",
          "--bg-color": "#fff",
          "--border-color": "#ccc",

          "--scrollbar-track": "rgba(0,0,0,0.05)",
          "--scrollbar-thumb": "rgba(0,0,0,0.25)",
          "--scrollbar-thumb-hover": "rgba(0,0,0,0.4)",
        };

  return (
    <div className={`${styles.InputContainer} ${newLine ? styles.newLineLayout : styles.rowLayout}`} style={inlineStyles}>
      <div className={styles.label} style={{ width: newLine ? "100%" : labelWidth, color: "var(--font-color)" }}>{label}</div>
      <div className={styles.dataBox} style={{ backgroundColor: "var(--bg-color)", border: `1px solid var(--border-color)`, color: "var(--font-color)" }}>
        <textarea
          className={`${styles.inputBox} ${styles.textareaBox}`}
          style={{ height: dataheight }}
          value={tempValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => { setIsFocused(false); commitValue(); }}
        />
      </div>
    </div>
  );
}