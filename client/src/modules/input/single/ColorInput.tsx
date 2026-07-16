import React, { useState, useEffect, useId, useMemo } from "react";
import ButtonWithPopover from "../../../shared/components/ButtonWithPopover";
import { useThemeData } from "../../theme/useThemeData";
import type { Theme } from "../../theme/type";
import type { RGB, RGBA } from "../../../shared/types/color.type";
import { colorApi, type DbColor } from "../api/ColorApi";
import styles from "./Input.module.css";

// --- Helpers ---
const toRGBString = (color: RGB | RGBA) => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
const toRGBAString = (color: RGBA | RGB) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] ?? 1})`;
const toHexString = (color: RGBA | RGB) => {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}`.toUpperCase();
};
const hexToRGBA = (hex: string, alpha: number = 1): RGBA => {
    const clean = hex.replace("#", "");
    if (clean.length !== 6) return [0, 0, 0, alpha];
    return [
        parseInt(clean.substring(0, 2), 16),
        parseInt(clean.substring(2, 4), 16),
        parseInt(clean.substring(4, 6), 16),
        alpha,
    ];
};

const DUPLICATE_LIMIT = 10;
function isDuplicate(a: RGBA, b: RGBA) {
    if (Math.abs(a[0] - b[0]) > DUPLICATE_LIMIT) return false;
    if (Math.abs(a[1] - b[1]) > DUPLICATE_LIMIT) return false;
    if (Math.abs(a[2] - b[2]) > DUPLICATE_LIMIT) return false;
    if (Math.abs(a[3] - b[3]) > DUPLICATE_LIMIT) return false;
    return true;
}

function getLuminance([r, g, b]: RGBA | RGB): number {
    const toLinear = (v: number) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function extractThemeColors(theme: Theme): RGBA[] {
    const colors: RGBA[] = [];
    const traverse = (obj: any, depth = 0) => {
        if (depth > 10 || !obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
            if ((obj.length === 3 || obj.length === 4) && obj.every((n) => typeof n === "number")) {
                colors.push([obj[0], obj[1], obj[2], obj[3] ?? 1]);
                return;
            }
        }
        for (const key in obj) traverse(obj[key], depth + 1);
    };
    traverse(theme);

    const unique: RGBA[] = [];
    for (const c of colors) {
        if (!unique.some((u) => isDuplicate(c, u))) unique.push(c);
    }
    unique.sort((a, b) => getLuminance(b) - getLuminance(a));
    return unique;
}

const generateBaseColors = (): { group1: RGBA[]; group2: RGBA[] } => {
    const hues: RGB[] = [
        [255,255,255], [255,82,82], [255,138,101], [255,213,79], [129,199,132],
        [77,182,172], [79,195,247], [100,181,246], [149,117,205], [240,98,146]
    ];
    const group1: RGBA[] = [];
    const group2: RGBA[] = [];

    for (let row = 0; row < 8; row++) {
        const factor = row === 0 ? 1 : row === 1 ? 0.8 : 1 - (row - 1) * 0.12;
        for (let col = 0; col < 10; col++) {
            const base = hues[col];
            let r = Math.max(0, Math.min(255, Math.round(base[0] * factor)));
            let g = Math.max(0, Math.min(255, Math.round(base[1] * factor)));
            let b = Math.max(0, Math.min(255, Math.round(base[2] * factor)));
            
            if (col === 0) {
                const gray = Math.round(255 - (row * 32));
                r = g = b = Math.max(0, Math.min(255, gray));
            }

            const color: RGBA = [r, g, b, 1];
            if (row < 1) group1.push(color);
            else group2.push(color);
        }
    }
    return { group1, group2 };
};

const { group1: BASE_G1, group2: BASE_G2 } = generateBaseColors();

export default function ColorInput({
    label,
    data,
    setData,
    onTempDataChange,
    newLine = false,
    labelWidth = "30%",
    alpha = true
}: {
    label: string;
    data: RGBA | RGB;
    setData: (val: RGBA | RGB) => void;
    onTempDataChange?: (tempData: RGBA | RGB, setTempData: React.Dispatch<React.SetStateAction<RGBA | RGB>>) => void;
    newLine?: boolean;
    labelWidth?: string;
    alpha?: boolean;
}) {
    const themeContext = useThemeData();
    const instanceId = useId();

    const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() => themeContext.get(themeContext.getSelectedName()));
    const [tempValue, setTempValue] = useState<RGBA | RGB>(data);
    const [customColors, setCustomColors] = useState<DbColor[]>([]);
    const [remountKey, setRemountKey] = useState<number>(0);

    useEffect(() => {
        themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
        colorApi.getAll().then((colors) => setCustomColors(colors)).catch(console.error);
        return () => themeContext.removeOnSelectedThemeChange(instanceId);
    }, [themeContext, instanceId]);

    useEffect(() => {
        setTempValue(data);
    }, [data]);

    const themeColors = useMemo(() => currentTheme ? extractThemeColors(currentTheme) : [], [currentTheme]);
    const normalTheme = currentTheme?.button.normal1;
    const saveTheme = currentTheme?.button.primary1; 

    const commitValue = (val: RGBA) => {
        const finalValue = alpha ? val : [val[0], val[1], val[2]] as RGB;
        setData(finalValue);
        setTempValue(finalValue);
        onTempDataChange?.(finalValue, setTempValue as any);
    };

    const handleOpacityChange = (opacityVal: number, isFinal: boolean = false) => {
        if (!alpha) return;
        const newColor: RGBA = [tempValue[0], tempValue[1], tempValue[2], opacityVal];
        setTempValue(newColor);
        if (isFinal) {
            commitValue(newColor);
        }
    };

    const containerStyle: React.CSSProperties & Record<string, string> = normalTheme
        ? {
              "--font-color": toRGBString(normalTheme.font),
              "--bg-color": toRGBAString(normalTheme.background),
              "--border-color": toRGBAString(normalTheme.border),
          }
        : {
              "--font-color": "#000",
              "--bg-color": "#fff",
              "--border-color": "#ccc",
          };

    // --- Sub-component: Edit Popup ---
    const EditColorPopover = ({ dbColor, isNew = false }: { dbColor?: DbColor; isNew?: boolean }) => {
        const initialColor = dbColor ? dbColor.color : [255, 255, 255, 1] as RGBA;
        const [editRgb, setEditRgb] = useState<RGB>([initialColor[0], initialColor[1], initialColor[2]]);
        const [editHex, setEditHex] = useState(toHexString(initialColor));

        const handleRgbChange = (idx: 0|1|2, val: string) => {
            const num = Math.max(0, Math.min(255, Number(val) || 0));
            const newRgb = [...editRgb] as RGB;
            newRgb[idx] = num;
            setEditRgb(newRgb);
            setEditHex(toHexString([...newRgb, 1] as RGBA));
        };

        const handleHexChange = (val: string) => {
            setEditHex(val);
            if (val.length === 6 || val.length === 7) {
                const rgba = hexToRGBA(val.startsWith("#") ? val : `#${val}`);
                setEditRgb([rgba[0], rgba[1], rgba[2]]);
            }
        };

        const handleSave = async () => {
            const finalColor: RGBA = [editRgb[0], editRgb[1], editRgb[2], 1];
            try {
                const res = await colorApi.save(finalColor, dbColor?.id);
                if (res.id != null && res.id != undefined) {
                    let updatedList: DbColor[] = [];
                    if (isNew) {
                        updatedList = [...customColors, { id: res.id, color: finalColor }];
                    } else {
                        updatedList = customColors.map(c => c.id === dbColor?.id ? { id: res.id, color: finalColor } : c);
                    }
                    
                    setCustomColors(updatedList);
                    commitValue([finalColor[0], finalColor[1], finalColor[2], tempValue[3] ?? 1]);
                    setRemountKey(prev => prev + 1); // Auto remount on changes
                    document.body.click(); 
                }
            } catch (err) {
                console.error("Save failed", err);
            }
        };

        const popupContent = (
            <div className={styles.editPopup} onClick={e => e.stopPropagation()}>
                <div className={styles.editLeft} style={{ backgroundColor: toRGBString(editRgb) }} />
                <div className={styles.editRight}>
                    <div className={styles.editRow}>
                        <input className={styles.editInput} value={editRgb[0]} onChange={(e) => handleRgbChange(0, e.target.value)} />
                        <input className={styles.editInput} value={editRgb[1]} onChange={(e) => handleRgbChange(1, e.target.value)} />
                        <input className={styles.editInput} value={editRgb[2]} onChange={(e) => handleRgbChange(2, e.target.value)} />
                    </div>
                    <div className={styles.editRow}>
                        <input className={styles.editInput} value={editHex} onChange={(e) => handleHexChange(e.target.value)} />
                    </div>
                    <button 
                        className={styles.editSaveBtn} 
                        style={{ 
                            background: saveTheme ? toRGBAString(saveTheme.background) : "#2196f3", 
                            color: saveTheme ? toRGBString(saveTheme.font) : "#fff" 
                        }}
                        onClick={handleSave}
                    >
                        Save
                    </button>
                </div>
            </div>
        );

        const triggerBtn = isNew ? (
            <div className={`${styles.colorSquare} ${styles.colorAddBtn}`}>+</div>
        ) : (
            <div 
                className={styles.colorSquare} 
                style={{ backgroundColor: toRGBString(dbColor!.color) }} 
                onClick={() => commitValue([dbColor!.color[0], dbColor!.color[1], dbColor!.color[2], tempValue[3] ?? 1])} 
            />
        );

        return (
            <ButtonWithPopover 
                type="hover" 
                position="bottom" 
                align="center" 
                button={triggerBtn} 
                popup={popupContent} 
            />
        );
    };

    const MainPopover = (
        <div className={styles.colorMainPopup} key={remountKey}>
            <div className={styles.colorSection}>
                <div className={styles.colorGrid}>
                    {BASE_G1.map((c, i) => (
                        <div key={`g1-${i}`} className={styles.colorSquare} style={{ backgroundColor: toRGBString(c) }} onClick={() => commitValue([c[0], c[1], c[2], tempValue[3] ?? 1])} />
                    ))}
                </div>
                <div className={styles.colorGrid}>
                    {BASE_G2.map((c, i) => (
                        <div key={`g2-${i}`} className={styles.colorSquare} style={{ backgroundColor: toRGBString(c) }} onClick={() => commitValue([c[0], c[1], c[2], tempValue[3] ?? 1])} />
                    ))}
                </div>
            </div>

            <div className={styles.colorDiviver}/>

            <div className={styles.colorSection}>
                <div className={styles.colorGrid}>
                    {themeColors.slice(0, 30).map((c, i) => (
                        <div key={`thm-${i}`} className={styles.colorSquare} style={{ backgroundColor: toRGBString(c) }} onClick={() => commitValue([c[0], c[1], c[2], tempValue[3] ?? 1])} />
                    ))}
                </div>
            </div>

            <div className={styles.colorDiviver}/>

            <div className={styles.colorSection}>
                <div className={styles.colorGrid}>
                    {customColors.map((dbC) => (
                        <div key={`cust-${dbC.id}`} className={styles.colorSquareContainer}>
                            <EditColorPopover dbColor={dbC} />
                        </div>
                    ))}
                    <div className={styles.colorSquareContainer}>
                        <div className={styles.colorSquareContainer}>
                        <EditColorPopover isNew={true} />
                    </div>
                    </div>
                </div>
            </div>

            {alpha && (
                <div className={styles.opacitySection}>
                    <div style={{ fontSize: "11px", opacity: 0.8 }}>Opacity</div>
                    <input 
                        type="range" 
                        min="0" max="100" 
                        value={Math.round((tempValue[3] ?? 1) * 100)} 
                        onChange={(e) => handleOpacityChange(Number(e.target.value) / 100, false)}
                        onMouseUp={(e) => handleOpacityChange(Number((e.target as HTMLInputElement).value) / 100, true)}
                        className={styles.opacitySlider}
                    />
                    <input 
                        type="text" 
                        value={`${Math.round((tempValue[3] ?? 1) * 100)}%`}
                        onChange={(e) => handleOpacityChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) / 100, true)}
                        className={styles.opacityNumber}
                    />
                </div>
            )}
        </div>
    );

    const DataBoxButton = (
        <div className={styles.dataBox} style={{ width: "100%", cursor: "pointer", background: "var(--bg-color)", border: "1px solid var(--border-color)", color: "var(--font-color)" }}>
            <div className={styles.inputBox} style={{ display: "flex", alignItems: "center" }}>
                <div className={styles.colorPreviewBox} style={{ backgroundColor: toRGBAString(tempValue) }} />
                <span>{toHexString(tempValue)}</span>
            </div>
            <div className={styles.ratioIcon}>▼</div>
        </div>
    );

    return (
        <div className={`${styles.InputContainer} ${newLine ? styles.newLineLayout : styles.rowLayout}`} style={containerStyle}>
            <div className={styles.label} style={{ width: newLine ? "100%" : labelWidth, color: "var(--font-color)" }}>
                {label}
            </div>
            <div style={{ flex: 1, display: "flex" }}>
                <ButtonWithPopover
                    type="hover"
                    position="bottom"
                    align="end"
                    buttonWidth="100%"
                    button={DataBoxButton}
                    popup={MainPopover}
                />
            </div>
        </div>
    );
}