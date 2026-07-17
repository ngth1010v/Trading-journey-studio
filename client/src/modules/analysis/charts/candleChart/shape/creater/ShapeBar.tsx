import React, { useState, useEffect, useId, useCallback } from "react";
import style from "./ShapeBar.module.css";

import type { ShapeController } from "../useShapeController";
import type { ShapeData } from "../data/useShapeData";
import { SHAPE_MAP, SHAPE_GROUPS } from "../shapeMap";

import ButtonWithPopover from "../../../../../../shared/components/ButtonWithPopover";
import ShapeTemplatePanel from "../template/ShapeTemplatePanel";

import { useThemeData } from "../../../../../theme/useThemeData";
import type { Theme } from "../../../../../theme/type";
import type { RGB, RGBA } from "../../../../../../shared/types/color.type";

import TemplateIcon from "../../../../../../assets/icons/bookmark-simple.svg?react";

const toRGBString = (color: RGB) =>
    `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
    `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

export default function ShapeBar({
    shapeData,
    shapeController,
}: {
    shapeData: ShapeData;
    shapeController: ShapeController;
}) {
    // Track the last created shape type (defaulting to "trendline")
    const [lastShapeType, setLastShapeType] = useState<string>("trendline");

    // Master popover key to force close all popovers across ShapeBar
    const [popoverKey, setPopoverKey] = useState<number>(0);

    // States for controlling main shape group popovers
    const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);

    // States for controlling nested template popovers
    const [openTemplateShapeType, setOpenTemplateShapeType] = useState<string | null>(null);

    const closeAllPopovers = useCallback(() => {
        setOpenGroupIndex(null);
        setOpenTemplateShapeType(null);
        setPopoverKey((prev) => prev + 1);
    }, []);

    //---------------------------------------
    // Theme setup
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

    const buttonTheme = currentTheme?.button?.normal1;

    const inlinestyle: React.CSSProperties & {
        [key: string]: string;
    } = buttonTheme
        ? {
              "--bg-color": toRGBAString(buttonTheme.background),
              "--border-color": toRGBAString(buttonTheme.border),
              "--font-color": toRGBString(buttonTheme.font),
              "--hover-bg": toRGBAString(
                  currentTheme?.button?.primary2?.background ??
                      buttonTheme.background
              ),
              "--hover-font": toRGBString(
                  currentTheme?.button?.primary2?.font ?? buttonTheme.font
              ),
          }
        : {
              "--bg-color": "#1e1e1e",
              "--border-color": "#333",
              "--font-color": "#ffffff",
              "--hover-bg": "#2a2a2a",
              "--hover-font": "#ffffff",
          };

    //---------------------------------------
    // Action Handlers
    //---------------------------------------

    // 1. Click on last shape display panel
    const handleCreateLastShape = () => {
        shapeController.create(lastShapeType);
    };

    // 2. Click on a specific shape row (*row1)
    const handleSelectShapeRow = (shapeType: string) => {
        setLastShapeType(shapeType);
        closeAllPopovers();
        shapeController.create(shapeType);
    };

    // 3. Select a template inside the nested template popover
    const handleSelectTemplate = (shapeType: string, templateId: number) => {
        closeAllPopovers();

        const templates = shapeData.getTemplates();
        const selectedTemplate = templates.find((t) => t.id === templateId);

        if (selectedTemplate && selectedTemplate.style) {
            // Find default template for this type
            const defaultTemplate = templates.find(
                (t) => t.type === shapeType && t.name === "<<<DEFAULT>>>"
            );

            if (defaultTemplate) {
                // Apply selected template style onto the default template
                shapeData.setTemplate({
                    ...defaultTemplate,
                    style: selectedTemplate.style,
                });
            }
        }

        setLastShapeType(shapeType);
        shapeController.create(shapeType);
    };

    const lastShapeDef = (SHAPE_MAP as any)[lastShapeType];
    const LastShapeIcon = lastShapeDef?.icon;

    return (
        <div
            key={popoverKey}
            className={style.Panel}
            style={inlinestyle}
        >
            {/* Last Created Shape Shortcut */}
            <div
                className={style.LastShapeButton}
                onClick={handleCreateLastShape}
            >
                {LastShapeIcon && <LastShapeIcon className={style.Icon} />}
                <span>{lastShapeDef?.name || lastShapeType}</span>
            </div>

            <div className={style.Divider} />

            {/* Shape Groups Panel */}
            <div className={style.GroupsContainer}>
                {SHAPE_GROUPS.map((group, groupIdx) => {
                    const GroupIcon = group.icon;

                    return (
                        <ButtonWithPopover
                            key={groupIdx}
                            type="hover"
                            position="bottom"
                            align="start"
                            bufferSize="10px"
                            open={openGroupIndex === groupIdx}
                            setOpen={(isOpen : any) =>
                                setOpenGroupIndex(isOpen ? groupIdx : null)
                            }
                            button={
                                <div className={style.IconButton}>
                                    <GroupIcon className={style.Icon} />
                                </div>
                            }
                            popup={
                                <div className={style.PopoverList}>
                                    {group.shapes.map((shapeType) => {
                                        const shapeDef = (SHAPE_MAP as any)[
                                            shapeType
                                        ];
                                        if (!shapeDef) return null;
                                        const RowIcon = shapeDef.icon;

                                        return (
                                            <div
                                                key={shapeType}
                                                className={style.ShapeRowContainer}
                                            >
                                                {/* Left/Row Button: Triggers shape creation */}
                                                <button
                                                    type="button"
                                                    className={style.ShapeRowButton}
                                                    onClick={() =>
                                                        handleSelectShapeRow(
                                                            shapeType
                                                        )
                                                    }
                                                >
                                                    {RowIcon && (
                                                        <RowIcon
                                                            className={style.Icon}
                                                        />
                                                    )}
                                                    <span>{shapeDef.name}</span>
                                                </button>

                                                {/* Right: Template Popover Button */}
                                                <ButtonWithPopover
                                                    type="hover"
                                                    position="right"
                                                    align="start"
                                                    bufferSize="10px"
                                                    open={
                                                        openTemplateShapeType ===
                                                        shapeType
                                                    }
                                                    setOpen={(isOpen: any) =>
                                                        setOpenTemplateShapeType(
                                                            isOpen
                                                                ? shapeType
                                                                : null
                                                        )
                                                    }
                                                    button={
                                                        <div
                                                            className={
                                                                style.TemplateButton
                                                            }
                                                        >
                                                            <TemplateIcon
                                                                className={
                                                                    style.Icon
                                                                }
                                                            />
                                                        </div>
                                                    }
                                                    popup={
                                                        <ShapeTemplatePanel
                                                            shapeType={shapeType}
                                                            shapeData={shapeData}
                                                            onSelected={(templateId) =>
                                                                handleSelectTemplate(
                                                                    shapeType,
                                                                    templateId
                                                                )
                                                            }
                                                        />
                                                    }
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            }
                        />
                    );
                })}
            </div>
        </div>
    );
}