import React, { useState, useEffect, useId } from "react";
import { useThemeData } from "../../theme/useThemeData";
import type { Theme } from "../../theme/type";
import type { RGB, RGBA } from "../../../shared/types/color.type";
import styles from "./Input.module.css";

const toRGBString = (color: RGB): string => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
const toRGBAString = (color: RGBA): string => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
const toRGBAFromRGB = (color: RGB, alpha: number): string => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;

export default function PriceInput({
  label,
  points,
  data,
  setData,
  onTempDataChange,
  newLine = false,
  labelWidth = "30%",
  unit = "",
}: {
  label: string;
  points: number;
  data: number;
  setData: (val: number) => void;
  onTempDataChange?: (tempData: string, setTempData: React.Dispatch<React.SetStateAction<string>>) => void;
  newLine?: boolean;
  labelWidth?: string;
  unit?: string;
}) {
  const themeContext = useThemeData();
  const instanceId = useId();
  const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() => themeContext.get(themeContext.getSelectedName()));

  useEffect(() => {
    themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
    return () => themeContext.removeOnSelectedThemeChange(instanceId);
  }, [themeContext, instanceId]);

  const intToDisplayString = (dataInt: number, pts: number): string => {
    if (!pts || pts <= 1) return dataInt.toString();
    const decimals = Math.round(Math.log10(pts));
    let str = Math.abs(dataInt).toString().padStart(decimals + 1, '0');
    const intPart = str.slice(0, -decimals) || '0';
    const decPart = str.slice(-decimals);
    return (dataInt < 0 ? '-' : '') + intPart + '.' + decPart;
  };

  const displayStringToInt = (displayStr: string, pts: number): number => {
    if (!pts || pts <= 1) return parseInt(displayStr || '0', 10);
    const decimals = Math.round(Math.log10(pts));
    const isNegative = displayStr.startsWith('-');
    const cleanStr = displayStr.replace('-', '');
    let [intPart, decPart = ''] = cleanStr.split('.');
    decPart = decPart.padEnd(decimals, '0').slice(0, decimals);
    return parseInt(intPart + decPart, 10) * (isNegative ? -1 : 1);
  };

  const [tempValue, setTempValue] = useState<string>(intToDisplayString(data, points));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => setTempValue(intToDisplayString(data, points)), [data, points]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitizedValue = e.target.value.replace(/[^0-9.-]/g, "");
    setTempValue(sanitizedValue);
    if (onTempDataChange) onTempDataChange(sanitizedValue, setTempValue);
  };

  const commitValue = () => {
    if (tempValue === "" || tempValue === "-") {
      setTempValue(intToDisplayString(data, points));
      return;
    }
    const finalInt = displayStringToInt(tempValue, points);
    if (!isNaN(finalInt)) {
      setData(finalInt);
      setTempValue(intToDisplayString(finalInt, points));
    } else {
      setTempValue(intToDisplayString(data, points));
    }
  };

  const activeTheme = isFocused && currentTheme?.button?.primary2 ? currentTheme.button.primary2 : currentTheme?.button?.normal1;
  const inlineStyles: React.CSSProperties & { [key: string]: string } = activeTheme
    ? { "--font-color": toRGBString(activeTheme.font), "--bg-color": toRGBAString(activeTheme.background), "--border-color": toRGBAString(activeTheme.border) }
    : { "--font-color": "#000000", "--bg-color": "#ffffff", "--border-color": "#cccccc" };

  return (
    <div className={`${styles.InputContainer} ${newLine ? styles.newLineLayout : styles.rowLayout}`} style={inlineStyles}>
      <div className={styles.label} style={{ width: newLine ? "100%" : labelWidth, color: "var(--font-color)" }}>{label}</div>
      <div className={styles.dataBox} style={{ backgroundColor: "var(--bg-color)", border: `1px solid var(--border-color)`, color: "var(--font-color)" }}>
        <input
          type="text"
          className={styles.inputBox}
          value={tempValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => { setIsFocused(false); commitValue(); }}
          onKeyDown={(e) => e.key === "Enter" && (commitValue(), e.currentTarget.blur())}
        />
        {unit && (
          <div 
            className={styles.unitBox} 
            style={{ 
              color: toRGBString(activeTheme?.font || [0,0,0]), 
              backgroundColor: toRGBAFromRGB(activeTheme?.font || [0,0,0], 0.15) 
            }}
          >
            {unit}
          </div>
        )}
      </div>
    </div>
  );
}