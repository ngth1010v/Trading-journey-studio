import React, { useState, useEffect, useId } from "react";
import ButtonWithPopover from "../../shared/components/ButtonWithPopover";
import { useThemeData } from "../theme/useThemeData";
import type { Theme } from "../theme/type";
import type { RGB, RGBA } from "../../shared/types/color.type";
import styles from "./Input.module.css";

const toRGBString = (color: RGB) =>
    `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
    `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

const isLightColor = (color: RGBA) => {
    const [r, g, b] = color;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance >= 128;
};

export default function RatioInput({
    label,
    data,
    options,
    setData,
    onTempDataChange,
    newLine = false,
    labelWidth = "30%",
}: {
    label: string;
    options: string[];
    data: string;
    setData: (val: string) => void;
    onTempDataChange?: (
        tempData: string,
        setTempData: React.Dispatch<React.SetStateAction<string>>
    ) => void;
    newLine?: boolean;
    labelWidth?: string;
}) {
    if (new Set(options).size !== options.length) {
        throw new Error("Duplicate options are not allowed in RatioInput.");
    }

    const themeContext = useThemeData();
    const instanceId = useId();

    const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() =>
        themeContext.get(themeContext.getSelectedName())
    );

    useEffect(() => {
        themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
        return () => themeContext.removeOnSelectedThemeChange(instanceId);
    }, [themeContext, instanceId]);

    const [tempValue, setTempValue] = useState(data);
    const [hoverItem, setHoverItem] = useState<string | null>(null);

    useEffect(() => {
        setTempValue(data);
    }, [data]);

    const commitValue = (val: string) => {
        setData(val);
        setTempValue(val);
        onTempDataChange?.(val, setTempValue);
    };

    const normalTheme = currentTheme?.button.normal1;
    const activeTheme = currentTheme?.button.primary2;

    const bg = normalTheme?.background;
    const light = bg ? isLightColor(bg) : true;

    const containerStyle: React.CSSProperties & Record<string, string> =
        normalTheme
            ? {
                  "--font-color": toRGBString(normalTheme.font),
                  "--bg-color": toRGBAString(normalTheme.background),
                  "--border-color": toRGBAString(normalTheme.border),

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

    const getItemStyle = (active: boolean): React.CSSProperties => {
        const theme =
            active && activeTheme ? activeTheme : normalTheme;

        if (!theme) return {};

        return {
            background: toRGBAString(theme.background),
            borderColor: toRGBAString(theme.border),
            color: toRGBString(theme.font),
        };
    };

    const DataBoxButton = (
        <div
            className={styles.dataBox}
            style={{
                width: "100%",
                cursor: "pointer",
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
                color: "var(--font-color)",
            }}
        >
            <div
                className={styles.inputBox}
                style={{ cursor: "pointer" }}
            >
                {tempValue}
            </div>

            <div className={styles.ratioIcon}>▼</div>
        </div>
    );

    const PopoverMenu = (
        <div className={styles.dropdownMenu}>
            {options.map((opt) => (
                <div
                    key={opt}
                    className={styles.dropdownItem}
                    style={getItemStyle(hoverItem === opt)}
                    onMouseEnter={() => setHoverItem(opt)}
                    onMouseLeave={() => setHoverItem(null)}
                    onClick={() => commitValue(opt)}
                >
                    {opt}
                </div>
            ))}
        </div>
    );

    return (
        <div
            className={`${styles.InputContainer} ${
                newLine ? styles.newLineLayout : styles.rowLayout
            }`}
            style={containerStyle}
        >
            <div
                className={styles.label}
                style={{
                    width: newLine ? "100%" : labelWidth,
                    color: "var(--font-color)",
                }}
            >
                {label}
            </div>

            <div style={{ flex: 1, display: "flex" }}>
                <ButtonWithPopover
                    type="hover"
                    position="bottom"
                    align="end"
                    buttonWidth="100%"
                    popupWidth="100%"
                    button={DataBoxButton}
                    popup={PopoverMenu}
                />
            </div>
        </div>
    );
}