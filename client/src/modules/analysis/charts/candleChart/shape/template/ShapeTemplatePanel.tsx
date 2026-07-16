import React, { useState, useEffect, useId, useCallback } from "react";
import style from "./ShapeTemplatePanel.module.css";

import type { ShapeData } from "../data/useShapeData";
import type { ShapeTemplate } from "../data/type";
import { SHAPE_MAP } from "../shapeMap";

import ButtonWithPopover from "../../../../../../shared/components/ButtonWithPopover";
import PanelInput from "../../../../../input/panel/PanelInput";
import TextInput from "../../../../../input/single/TextInput";

import { useThemeData } from "../../../../../theme/useThemeData";
import type { Theme } from "../../../../../theme/type";
import type { RGB, RGBA } from "../../../../../../shared/types/color.type";

import RemoveIcon from "../../../../../../assets/icons/x.svg?react";

const toRGBString = (color: RGB) =>
    `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
    `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

export default function ShapeTemplatePanel({
    shapeType,
    shapeData,
    onSelected,
}: {
    shapeData: ShapeData;
    shapeType?: string;
    onSelected?: (templateId: number) => void;
}) {
    const instanceId = useId();
    
    //---------------------------------------
    // State & Data Subscriptions
    //---------------------------------------
    const [templates, setTemplates] = useState(() => shapeData.getTemplates());
    const [newTemplateName, setNewTemplateName] = useState("");
    const [isSavePopoverOpen, setIsSavePopoverOpen] = useState(false);

    useEffect(() => {
        const handleTemplateChange = () => {
            setTemplates([...shapeData.getTemplates()]);
        };

        shapeData.addOnShapeTemplateChange(instanceId, handleTemplateChange);
        return () => shapeData.removeOnShapeTemplateChange(instanceId);
    }, [shapeData, instanceId]);

    //---------------------------------------
    // Handlers
    //---------------------------------------
    const handleStyleChange = useCallback((templateId: number | undefined, newStyles: any) => {
        if (templateId === undefined) return;

        const targetTemplate = shapeData.getTemplates().find(t => t.id === templateId);
        if (!targetTemplate) return;

        const updatedTemplate: ShapeTemplate = {
            ...targetTemplate,
            styles: newStyles
        };

        shapeData.setTemplate(updatedTemplate);
    }, [shapeData]);

    const handleRemoveTemplate = useCallback(async (e: React.MouseEvent, templateId: number | undefined) => {
        e.stopPropagation();
        if (templateId === undefined) return;

        await shapeData.removeTemplate(templateId);
    }, [shapeData]);

    const handleSaveNewTemplate = useCallback(() => {
        const trimmedName = newTemplateName.trim();
        if (!trimmedName) return;

        const allTemplates = shapeData.getTemplates();

        // Find default template to copy
        const defaultTemplate = allTemplates.find(
            t => t.name === "<<<DEFAULT>>>" && (!shapeType || t.type === shapeType)
        ) || allTemplates.find(t => t.name === "<<<DEFAULT>>>");

        if (!defaultTemplate) {
            console.error("Default template not found.");
            return;
        }

        // Deep copy default template
        const clonedTemplate: ShapeTemplate = {
            ...structuredClone(defaultTemplate),
            id: undefined,
            name: trimmedName,
            ...(shapeType ? { type: shapeType } : {}),
        };

        // Save single template through shapeData
        shapeData.setTemplate(clonedTemplate);

        // Reset state and force close popover
        setNewTemplateName("");
        setIsSavePopoverOpen(false);
    }, [newTemplateName, shapeData, shapeType]);

    //---------------------------------------
    // Theme
    //---------------------------------------
    const themeContext = useThemeData();
    const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() =>
        themeContext.get(themeContext.getSelectedName())
    );

    useEffect(() => {
        themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
        return () => themeContext.removeOnSelectedThemeChange(instanceId);
    }, [themeContext, instanceId]);

    const normal1 = currentTheme?.button?.normal1;
    const primary1 = currentTheme?.button?.primary1;
    const danger = currentTheme?.button?.danger;

    const inlineStyles: React.CSSProperties & { [key: string]: string } = normal1
        ? {
              "--bg-color": toRGBAString(normal1.background),
              "--border-color": toRGBAString(normal1.border),
              "--font-color": toRGBString(normal1.font),
              "--hover-bg": toRGBAString(
                  currentTheme?.button?.primary2?.background ?? normal1.background
              ),
              "--hover-font": toRGBString(
                  currentTheme?.button?.primary2?.font ?? normal1.font
              ),
              "--danger-bg": danger ? toRGBAString(danger.background) : "transparent",
              "--danger-border": danger ? toRGBAString(danger.border) : "transparent",
              "--danger-font": danger ? toRGBString(danger.font) : "#ff4d4f",
              "--danger-hover-bg": danger ? toRGBAString(danger.background) : "#ff4d4f20",
              "--danger-hover-font": danger ? toRGBString(danger.font) : "#ff4d4f",
              "--primary-bg": primary1 ? toRGBAString(primary1.background) : "#1890ff",
              "--primary-border": primary1 ? toRGBAString(primary1.border) : "#1890ff",
              "--primary-font": primary1 ? toRGBString(primary1.font) : "#ffffff",
          }
        : {
              "--bg-color": "#1e1e1e",
              "--border-color": "#333",
              "--font-color": "#ffffff",
              "--hover-bg": "#2a2a2a",
              "--hover-font": "#ffffff",
              "--danger-bg": "transparent",
              "--danger-border": "transparent",
              "--danger-font": "#ff4d4f",
              "--danger-hover-bg": "#ff4d4f20",
              "--danger-hover-font": "#ff4d4f",
              "--primary-bg": "#1890ff",
              "--primary-border": "#1890ff",
              "--primary-font": "#ffffff",
          };

    //---------------------------------------
    // Render
    //---------------------------------------
    const filteredTemplates = templates.filter(
        (t) => t.name !== "<<<DEFAULT>>>" && (!shapeType || t.type === shapeType)
    );

    return (
        <div className={style.Panel} style={inlineStyles}>
            {filteredTemplates.map((template, index) => {
                const shapeDef = (SHAPE_MAP as any)[template.type];
                const layout = shapeDef?.styles;
                return (
                    <ButtonWithPopover
                        key={index}
                        type="hover"
                        position="right"
                        align="start"
                        buttonWidth="100%"
                        button={
                            <div 
                                className={style.TemplateRow}
                                onClick={() => template.id !== undefined && onSelected?.(template.id)}
                            >
                                <div className={style.TemplateName} title={template.name}>
                                    {template.name}
                                </div>
                                <div 
                                    className={style.RemoveBtn} 
                                    onClick={(e) => handleRemoveTemplate(e, template.id)}
                                    title="Remove Template"
                                >
                                    <RemoveIcon className={style.Icon} />
                                </div>
                            </div>
                        }
                        popup={
                            layout ? (
                                <PanelInput
                                    layout={layout}
                                    data={template.styles}
                                    minWidth="250px"
                                    onDataChange={(newStyles: any) =>
                                        handleStyleChange(template.id, newStyles)
                                    }
                                />
                            ) : (
                                <div style={{ padding: "8px", color: "var(--font-color)" }}>
                                    No styles available.
                                </div>
                            )
                        }
                    />
                );
            })}

            <div className={style.Divider}/>

            {/* Save current style as ... Row */}
            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                buttonWidth="100%"
                open={isSavePopoverOpen}
                setOpen={setIsSavePopoverOpen}
                button={
                    <div className={`${style.TemplateRow} ${style.SaveAsRow}`}>
                        <div className={style.TemplateName}>
                            Save current style as ...
                        </div>
                    </div>
                }
                popup={
                    <div className={style.SavePopoverContainer}>
                        <div className={style.SaveInputGroup}>
                            <TextInput
                                label="Save current style as ..."
                                data={newTemplateName}
                                setData={setNewTemplateName}
                                dataheight="2.2rem"
                            />
                        </div>
                        <button
                            type="button"
                            className={style.SaveButton}
                            onClick={handleSaveNewTemplate}
                            disabled={!newTemplateName.trim()}
                        >
                            Save
                        </button>
                    </div>
                }
            />
        </div>
    );
}