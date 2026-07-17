import { useState } from "react";
import style from "./ShapeBar.module.css";

import type { ShapeController } from "../useShapeController";
import type { ShapeData } from "../data/useShapeData";
import { SHAPE_MAP, SHAPE_GROUPS } from "../shapeMap";

import ButtonWithPopover from "../../../../../../shared/components/ButtonWithPopover";
import ListWithTheme from "../../../../../../shared/components/ListWithTheme";
import ShapeTemplatePanel from "../template/ShapeTemplatePanel";

import TemplateIcon from "../../../../../../assets/icons/bookmark-simple.svg?react";

export default function ShapeBar({
    shapeData,
    shapeController,
}: {
    shapeData: ShapeData;
    shapeController: ShapeController;
}) {
    const [lastShapeType, setLastShapeType] = useState("trendline");

    const [popoverKey, setPopoverKey] = useState(0);
    const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);
    const [openTemplateShapeType, setOpenTemplateShapeType] = useState<string | null>(null);

    const closeAllPopovers = () => {
        setOpenGroupIndex(null);
        setOpenTemplateShapeType(null);
        setPopoverKey((v) => v + 1);
    };

    const handleSelectShape = (shapeType: string) => {
        setLastShapeType(shapeType);
        closeAllPopovers();
        shapeController.create(shapeType);
    };

    const handleSelectTemplate = (shapeType: string, templateId: number) => {
        closeAllPopovers();

        const templates = shapeData.getTemplates();

        const selected = templates.find((t) => t.id === templateId);
        const defaultTemplate = templates.find(
            (t) => t.type === shapeType && t.name === "<<<DEFAULT>>>"
        );

        if (selected?.style && defaultTemplate) {
            shapeData.setTemplate({
                ...defaultTemplate,
                style: selected.style,
            });
        }

        setLastShapeType(shapeType);
        shapeController.create(shapeType);
    };

    const lastShapeDef = (SHAPE_MAP as any)[lastShapeType];
    const LastShapeIcon = lastShapeDef?.icon;

    return (
        <ListWithTheme
            type="horizontal"
            autoShrink
            dividerList={[true, false, false]}
            key={popoverKey}
        >
            {/* Last shape */}
            <div
                className={style.LastShapeButton}
                onClick={() => shapeController.create(lastShapeType)}
            >
                {LastShapeIcon && <LastShapeIcon className={style.Icon} />}
                <span>{lastShapeDef?.name ?? lastShapeType}</span>
            </div>

            {/* Shape groups */}
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
                        setOpen={(open: any) =>
                            setOpenGroupIndex(open ? groupIdx : null)
                        }
                        button={
                            <div className={style.Button}>
                                <GroupIcon className={style.Icon} />
                            </div>
                        }
                        popup={
                            <ListWithTheme>
                                {group.shapes.map((shapeType) => {
                                    const shapeDef = (SHAPE_MAP as any)[shapeType];
                                    if (!shapeDef) return null;

                                    const RowIcon = shapeDef.icon;

                                    return (
                                        <div
                                            key={shapeType}
                                            className={style.ShapeRow}
                                        >
                                            <button
                                                type="button"
                                                className={style.ShapeRowButton}
                                                onClick={() =>
                                                    handleSelectShape(shapeType)
                                                }
                                            >
                                                {RowIcon && (
                                                    <RowIcon
                                                        className={style.Icon}
                                                    />
                                                )}
                                                <span>{shapeDef.name}</span>
                                            </button>

                                            <ButtonWithPopover
                                                type="hover"
                                                position="right"
                                                align="start"
                                                bufferSize="10px"
                                                open={
                                                    openTemplateShapeType ===
                                                    shapeType
                                                }
                                                setOpen={(open: any) =>
                                                    setOpenTemplateShapeType(
                                                        open ? shapeType : null
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
                                                        onSelected={(id) =>
                                                            handleSelectTemplate(
                                                                shapeType,
                                                                id
                                                            )
                                                        }
                                                    />
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </ListWithTheme>
                        }
                    />
                );
            })}
        </ListWithTheme>
    );
}