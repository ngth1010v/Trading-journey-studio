import React, { useState, useEffect, useRef, useId } from "react";
import { useThemeData } from "../theme/useThemeData";
import type { Theme, RGB, RGBA } from "../theme/type";
import styles from "./Input.module.css";

const toRGBString = (color: RGB): string => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
const toRGBAString = (color: RGBA): string => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

export default function TimeInput({
  label,
  data,
  setData,
  newLine = false,
  labelWidth = "30%",
  editMode = "time",
}: {
  label: string;
  data: number; // ms timestamp
  setData: (val: number) => void;
  newLine?: boolean;
  labelWidth?: string;
  editMode?: "date" | "time" | "millis";
}) {
  const themeContext = useThemeData();
  const instanceId = useId();
  const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() => themeContext.get(themeContext.getSelectedName()));

  useEffect(() => {
    themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
    return () => themeContext.removeOnSelectedThemeChange(instanceId);
  }, [themeContext, instanceId]);

  const fieldsOrder = editMode === "date" ? ["day", "month", "year"] :
                      editMode === "time" ? ["day", "month", "year", "hour", "minute", "second"] :
                      ["day", "month", "year", "hour", "minute", "second", "milli"];

  const [vals, setVals] = useState({ day: "", month: "", year: "", hour: "", minute: "", second: "", milli: "" });
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const refs: Record<string, React.RefObject<HTMLInputElement | null>> = {
    day: useRef(null), month: useRef(null), year: useRef(null),
    hour: useRef(null), minute: useRef(null), second: useRef(null), milli: useRef(null)
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const blurReasonRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusedField !== null || selectedField !== null) return;
    const d = new Date(data || Date.now());
    setVals({
      day: String(d.getUTCDate()).padStart(2, "0"),
      month: String(d.getUTCMonth() + 1).padStart(2, "0"),
      year: String(d.getUTCFullYear()).padStart(4, "0"),
      hour: String(d.getUTCHours()).padStart(2, "0"),
      minute: String(d.getUTCMinutes()).padStart(2, "0"),
      second: String(d.getUTCSeconds()).padStart(2, "0"),
      milli: String(d.getUTCMilliseconds()).padStart(3, "0")
    });
  }, [data, focusedField, selectedField]);

  const commitDate = () => {
    const sanitize = (v: string, max: number) => String(v || "").replace(/\D/g, "").slice(0, max);
    let nY = parseInt(sanitize(vals.year, 4)) || new Date().getUTCFullYear();
    let nM = parseInt(sanitize(vals.month, 2)) || new Date().getUTCMonth() + 1;
    if (nM < 1 || nM > 12) nM = 1;
    const maxDay = new Date(Date.UTC(nY, nM, 0)).getUTCDate();
    let nD = parseInt(sanitize(vals.day, 2)) || new Date().getUTCDate();
    if (nD < 1 || nD > maxDay) nD = 1;
    let nH = parseInt(sanitize(vals.hour, 2)) || 0; if (nH > 23) nH = 0;
    let nMin = parseInt(sanitize(vals.minute, 2)) || 0; if (nMin > 59) nMin = 0;
    let nS = parseInt(sanitize(vals.second, 2)) || 0; if (nS > 59) nS = 0;
    let nMs = parseInt(sanitize(vals.milli, 3)) || 0;

    setVals({
      day: String(nD).padStart(2, "0"), month: String(nM).padStart(2, "0"), year: String(nY).padStart(4, "0"),
      hour: String(nH).padStart(2, "0"), minute: String(nMin).padStart(2, "0"), second: String(nS).padStart(2, "0"), milli: String(nMs).padStart(3, "0")
    });
    setData(Date.UTC(nY, nM - 1, nD, nH, nMin, nS, nMs));
  };

  useEffect(() => {
    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (focusedField !== null) {
          blurReasonRef.current = "outside";
          refs[focusedField]?.current?.blur();
        } else if (selectedField !== null) {
          setSelectedField(null);
        }
      }
    };
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (focusedField !== null || selectedField === null || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const next = fieldsOrder[fieldsOrder.indexOf(selectedField) + 1];
        if (next) setSelectedField(next); else setSelectedField(null);
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setVals(p => ({ ...p, [selectedField]: e.key }));
        refs[selectedField]?.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleDocumentMouseDown, true);
    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => { document.removeEventListener("mousedown", handleDocumentMouseDown, true); window.removeEventListener("keydown", handleWindowKeyDown, true); };
  }, [focusedField, selectedField, fieldsOrder, refs]);

  // Main Label theme based on if ANY field is currently being interacted with
  const isAnyFocused = focusedField !== null || selectedField !== null;
  const labelTheme = isAnyFocused && currentTheme?.button?.primary2 ? currentTheme.button.primary2 : currentTheme?.button?.normal1;
  
  // Default font color for un-focused separators
  const baseFontColor = currentTheme?.button?.normal1?.font ? toRGBString(currentTheme.button.normal1.font) : "#000000";

  const renderInput = (field: string, maxLen: number, placeholder: string, sep: string = "") => {
    // Determine specific active theme for THIS specific databox
    const isFieldFocused = focusedField === field || selectedField === field;
    const fieldTheme = isFieldFocused && currentTheme?.button?.primary2 ? currentTheme.button.primary2 : currentTheme?.button?.normal1;
    const fieldStyles = fieldTheme ? {
        "--bg-color": toRGBAString(fieldTheme.background),
        "--border-color": toRGBAString(fieldTheme.border),
        "--font-color": toRGBString(fieldTheme.font)
    } : { "--bg-color": "#fff", "--border-color": "#ccc", "--font-color": "#000" };

    return (
      <React.Fragment key={field}>
        <div 
            className={styles.dataBox} 
            style={{ 
                backgroundColor: "var(--bg-color)", 
                border: `1px solid var(--border-color)`, 
                color: "var(--font-color)",
                flex: "1",
                ...fieldStyles as React.CSSProperties
            }}
        >
          <input
            ref={refs[field]}
            className={`${styles.timeSegment} ${field === 'year' ? styles.year : field === 'milli' ? styles.millis : ''} ${selectedField === field ? styles.selected : ''}`}
            value={vals[field as keyof typeof vals]}
            placeholder={placeholder}
            onMouseDown={(e) => {
              e.preventDefault();
              if (focusedField && focusedField !== field) { blurReasonRef.current = "switch"; refs[focusedField]?.current?.blur(); }
              setSelectedField(field);
            }}
            onFocus={() => { setFocusedField(field); setSelectedField(field); }}
            onBlur={() => {
              setFocusedField(p => p === field ? null : p);
              const reason = blurReasonRef.current; blurReasonRef.current = null;
              commitDate();
              if (reason === "enter") {
                const next = fieldsOrder[fieldsOrder.indexOf(field) + 1];
                if (next) setSelectedField(next); else setSelectedField(null);
              } else if (reason !== "switch") setSelectedField(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); blurReasonRef.current = "enter"; refs[field]?.current?.blur(); return; }
              if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
            }}
            onChange={(e) => setVals({ ...vals, [field]: e.target.value.replace(/\D/g, "").slice(0, maxLen) })}
          />
        </div>
        {sep && (
          <span 
            className={sep === '-' ? styles.timeDivider : styles.timeSeparator} 
            style={{ color: baseFontColor }}
          >
            {sep} 
          </span>
        )}
      </React.Fragment>
    );
  };

  return (
    <div ref={rootRef} className={`${styles.InputContainer} ${newLine ? styles.newLineLayout : styles.rowLayout}`}>
      <div 
        className={styles.label} 
        style={{ 
            width: newLine ? "100%" : labelWidth, 
            color: labelTheme ? toRGBString(labelTheme.font) : "#000000" 
        }}
      >
        {label}
      </div>
      <div className={styles.timeGroup}>
        {renderInput("day", 2, "DD", "/")}
        {renderInput("month", 2, "MM", "/")}
        {renderInput("year", 4, "YYYY", editMode !== "date" ? "-" : "")}
        {editMode !== "date" && <>
          {renderInput("hour", 2, "hh", ":")}
          {renderInput("minute", 2, "mm", ":")}
          {renderInput("second", 2, "ss", editMode === "millis" ? ":" : "")}
        </>}
        {editMode === "millis" && renderInput("milli", 3, "ms")}
      </div>
    </div>
  );
}