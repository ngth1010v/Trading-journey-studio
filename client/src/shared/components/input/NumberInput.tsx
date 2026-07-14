import React, { useState, useEffect, useId } from "react";
import { useThemeData } from "../../../modules/theme/useThemeData";
import type { Theme, RGB, RGBA } from "../../../modules/theme/type";
import styles from "./Input.module.css";

const toRGBString = (color: RGB): string => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
const toRGBAString = (color: RGBA): string => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
const toRGBAFromRGB = (color: RGB, alpha: number): string => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;

export interface NumberInputProps {
  label: string;
  data: number;
  setData: (val: number) => void;
  onTempDataChange?: (tempData: string, setTempData: React.Dispatch<React.SetStateAction<string>>) => void;
  newLine?: boolean;
  unit?: string;
  labelWidth?: string;
}

export default function NumberInput({
  label,
  data,
  setData,
  onTempDataChange,
  newLine = false,
  unit = "",
  labelWidth = "30%",
}: NumberInputProps) {
  const themeContext = useThemeData();
  const instanceId = useId();

  const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() => themeContext.get(themeContext.getSelectedName()));
  useEffect(() => {
    themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
    return () => themeContext.removeOnSelectedThemeChange(instanceId);
  }, [themeContext, instanceId]);

  const [tempValue, setTempValue] = useState<string>(String(data));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => setTempValue(String(data)), [data]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitizedValue = e.target.value.replace(/[^0-9.-]/g, "");
    setTempValue(sanitizedValue);
    if (onTempDataChange) onTempDataChange(sanitizedValue, setTempValue);
  };

  const commitValue = () => {
    const parsed = parseFloat(tempValue);
    if (!isNaN(parsed) && isFinite(parsed)) {
      setData(parsed);
      setTempValue(String(parsed));
    } else {
      setTempValue(String(data));
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