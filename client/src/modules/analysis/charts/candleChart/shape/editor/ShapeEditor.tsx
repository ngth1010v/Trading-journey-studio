import React, { useRef, useState, useEffect, useId } from "react";
import style from "./ShapeEditor.module.css";

import type { ShapeEditorController } from "./useShapeEditorController";
import type { ShapeData } from "../data/useShapeData";
import { SHAPE_MAP } from "../shapeMap";

import ButtonWithPopover from "../../../../../../shared/components/ButtonWithPopover";
import PanelInput from "../../../../../input/panel/PanelInput";

import type { CandleData } from "../../market/hooks/useCandleData";

import { useThemeData } from "../../../../../theme/useThemeData";
import type { Theme } from "../../../../../theme/type";
import type { RGB, RGBA } from "../../../../../../shared/types/color.type";

import DragIcon from "../../../../../../assets/icons/dots-six-vertical.svg?react";
import DataIcon from "../../../../../../assets/icons/database.svg?react";
import StyleIcon from "../../../../../../assets/icons/paint-brush-broad.svg?react";
import RemoveIcon from "../../../../../../assets/icons/trash.svg?react";

const toRGBString = (color: RGB) =>
    `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
    `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

export default function ShapeEditor({
    shapeEditorController,
    shapeData,
    candleData,
}: {
    shapeEditorController: ShapeEditorController;
    shapeData: ShapeData;
    candleData: CandleData;
}) {
    const { isOpen, shapeId, position, setPosition, handleChange } =
        shapeEditorController;

    const panelRef = useRef<HTMLDivElement>(null);

    // Track active rendering state and exit animations
    const [shouldRender, setShouldRender] = useState(isOpen);
    const [isExiting, setIsExiting] = useState(false);
    const [activeShapeId, setActiveShapeId] = useState<number | null>(shapeId);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            setIsExiting(false);
            if (shapeId !== null) {
                setActiveShapeId(shapeId);
            }
        } else if (shouldRender) {
            setIsExiting(true);
        }
    }, [isOpen, shapeId]);

    const handleAnimationEnd = (e: React.AnimationEvent) => {
        if (e.target !== panelRef.current) return;

        if (isExiting) {
            setShouldRender(false);
            setIsExiting(false);
            setActiveShapeId(null);
        }
    };

    //---------------------------------------
    // Theme
    //---------------------------------------

    const themeContext = useThemeData();
    const instanceId = useId();

    const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() =>
        themeContext.get(themeContext.getSelectedName())
    );

    useEffect(() => {
        themeContext.addOnSelectedThemeChange(instanceId, setCurrentTheme);
        return () =>
            themeContext.removeOnSelectedThemeChange(instanceId);
    }, [themeContext, instanceId]);

    const buttonTheme = currentTheme?.button?.normal1;

    const inlineStyles: React.CSSProperties & {
        [key: string]: string;
    } = buttonTheme
        ? {
              "--bg-color": toRGBAString(buttonTheme.background),
              "--border-color": toRGBAString(buttonTheme.border),
              "--font-color": toRGBString(buttonTheme.font),
              "--danger-font-color": toRGBString(
                  currentTheme?.button?.danger?.font ?? buttonTheme.font
              ),
              "--hover-bg": toRGBAString(
                  currentTheme?.button?.primary2?.background ??
                      buttonTheme.background
              ),
              "--hover-font": toRGBString(
                  currentTheme?.button?.primary2?.font ??
                      buttonTheme.font
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

    if (!shouldRender || activeShapeId === null) return null;

    const shape = shapeData.getShapes().find((s) => s.id === activeShapeId);
    if (!shape) return null;

    const shapeDef = (SHAPE_MAP as any)[shape.type];
    if (!shapeDef) return null;

    const ShapeIcon = shapeDef.icon;

    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;

        const startPosX = position.x;
        const startPosY = position.y;

        const onMouseMove = (moveEvent: MouseEvent) => {
            let newX = startPosX + (moveEvent.clientX - startX);
            let newY = startPosY + (moveEvent.clientY - startY);

            if (panelRef.current?.parentElement) {
                const parentRect =
                    panelRef.current.parentElement.getBoundingClientRect();

                const panelRect =
                    panelRef.current.getBoundingClientRect();

                newX = Math.max(
                    0,
                    Math.min(newX, parentRect.width - panelRect.width)
                );

                newY = Math.max(
                    0,
                    Math.min(newY, parentRect.height - panelRect.height)
                );
            }

            setPosition({
                x: newX,
                y: newY,
            });
        };

        const onMouseUp = () => {
            document.removeEventListener(
                "mousemove",
                onMouseMove
            );
            document.removeEventListener(
                "mouseup",
                onMouseUp
            );
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };

    return (
        <div
            ref={panelRef}
            data-shape-editor="true"
            className={`${style.Panel} ${isExiting ? style.PanelExiting : ""}`}
            onAnimationEnd={handleAnimationEnd}
            style={{
                left: position.x,
                top: position.y,
                ...inlineStyles,
            }}
        >
            <div
                className={style.DragZone}
                onMouseDown={handleDragStart}
            >
                <DragIcon className={style.Icon} />
            </div>

            <div className={style.Divider} />

            <div className={style.ShapeInfo}>
                {ShapeIcon && <ShapeIcon className={style.Icon} />}
                <span>{shapeDef.name}</span>
            </div>

            <div className={style.Divider} />

            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                button={
                    <div className={style.IconButton}>
                        <DataIcon className={style.Icon} />
                    </div>
                }
                popup={
                    <PanelInput
                        layout={shapeDef.data}
                        data={shape.data}
                        points={candleData.getPoint()}
                        minWidth="300px"
                        onDataChange={(newData: any) =>
                            handleChange(
                                newData,
                                "data",
                                shapeData
                            )
                        }
                    />
                }
            />

            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                button={
                    <div className={style.IconButton}>
                        <StyleIcon className={style.Icon} />
                    </div>
                }
                popup={
                    <PanelInput
                        layout={shapeDef.styles}
                        minWidth="300px"
                        data={shape.styles}
                        points={candleData.getPoint()}
                        onDataChange={(newStyles: any) =>
                            handleChange(
                                newStyles,
                                "styles",
                                shapeData
                            )
                        }
                    />
                }
            />

            <div className={style.Divider} />

            <div className={style.IconButton} onClick={shapeEditorController.removeShape}>
                <RemoveIcon className={`${style.Icon} ${style.DangerIcon}`}/>
            </div>
        </div>
    );
}