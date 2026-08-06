import React, { useEffect, useState, useRef } from "react";
import style from "./StrategyTagBar.module.css";

import type StateData from "../../../../state/StateData";
import StrategyData, { type Strategy } from "../../../../../../../data/chartData/strategy/StrategyData";
import { type StrategyTag, STRATEGY_TAG_INPUT_LAYOUT } from "../../../../../../../data/chartData/strategy/tag/StrategyTagData";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import ListWithTheme from "../../../../../../../shared/components/ListWithTheme";
import PanelInput from "../../../../../../../input/panel/PanelInput";
import TagIcon from "../../../../../../../../assets/icons/bookmark-simple-fill.svg?react";

interface StrategyTagBarProps {
    state: StateData;
}

const toCssColor = (color?: number[]) => {
    if (!color) return undefined;
    if (color.length === 4) return `rgba(${color.join(",")})`;
    return `rgb(${color.join(",")})`;
};

interface TagPanelFormProps {
    initialData: StrategyTag;
    theme: Theme | null;
    onSave: (data: StrategyTag) => Promise<void>;
}

function TagPanelForm({ initialData, theme, onSave }: TagPanelFormProps) {
    const [formData, setFormData] = useState<StrategyTag>(initialData);

    useEffect(() => {
        setFormData(initialData);
    }, [initialData]);

    const saveStyle = {
        "--bg-default": toCssColor(theme?.button.primary2.background),
        "--color-default": toCssColor(theme?.button.primary2.font),
        "--bg-hover": toCssColor(theme?.button.primary1.background),
        "--color-hover": toCssColor(theme?.button.primary1.font),
    } as React.CSSProperties;

    return (
        <PanelInput
            layout={STRATEGY_TAG_INPUT_LAYOUT}
            data={formData}
            onDataChange={(updatedData) => setFormData(updatedData as StrategyTag)}
            footer={
                <div className={style.Footer}>
                    <div
                        className={style.SaveButton}
                        style={saveStyle}
                        onClick={() => onSave(formData)}
                    >
                        Save
                    </div>
                </div>
            }
        />
    );
}

export default function StrategyTagBar({ state }: StrategyTagBarProps) {
    const listenerIds = {
        theme: "[candleChart][interface][navigation][strategy][tag][StrategyTagBar] Theme-listener",
        strategy: "[candleChart][interface][navigation][strategy][tag][StrategyTagBar] Strategy-listener",
        strategyTag: "[candleChart][interface][navigation][strategy][tag][StrategyTagBar] StrategyTag-listener",
        currentStrategyId: "[candleChart][interface][navigation][strategy][tag][StrategyTagBar] CurrentStrategyId-listener",
    };

    const themeDataRef = useRef<ThemeData>(new ThemeData());
    const strategyDataRef = useRef<StrategyData>(new StrategyData());

    const [theme, setTheme] = useState<Theme | null>(null);
    const [strategyList, setStrategyList] = useState<Strategy[] | null>(null);
    const [strategyTagList, setStrategyTagList] = useState<StrategyTag[] | null>(null);
    const [currentStrategyId, setCurrentStrategyId] = useState<number | null>(null);

    // Optimistic local state for immediate UI feedback
    const [localSelectedTagIds, setLocalSelectedTagIds] = useState<number[]>([]);

    // Controlled open states for main popover and inner sub-popovers
    const [isMainOpen, setIsMainOpen] = useState<boolean>(false);
    const [openPopoverId, setOpenPopoverId] = useState<number | "create" | null>(null);

    useEffect(() => {
        themeDataRef.current.init();
        strategyDataRef.current.init();

        themeDataRef.current.addOnSelectedThemeDataChange(listenerIds.theme, () =>
            setTheme(themeDataRef.current.getSelected())
        );

        strategyDataRef.current.addOnStrateryDataChange(listenerIds.strategy, () =>
            setStrategyList(strategyDataRef.current.getAll())
        );

        strategyDataRef.current.tag.addOnStrateryTagDataChange(listenerIds.strategyTag, () =>
            setStrategyTagList(strategyDataRef.current.tag.getAll())
        );

        state.config.addOnConfigDataChange(listenerIds.currentStrategyId, ["strategyId"], () =>
            setCurrentStrategyId(state.config.get()?.strategyId ?? null)
        );

        return () => {
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerIds.theme);
            themeDataRef.current.destroy();

            strategyDataRef.current.removeOnStrateryDataChange(listenerIds.strategy);
            strategyDataRef.current.tag.removeOnStrateryTagDataChange(listenerIds.strategyTag);
            strategyDataRef.current.destroy();

            state.config.removeOnConfigDataChange(listenerIds.currentStrategyId);
        };
    }, [state]);

    const currentStrategy = strategyList?.find((s) => s.id === currentStrategyId);

    // Synchronize local state whenever source-of-truth strategy data updates
    useEffect(() => {
        setLocalSelectedTagIds(currentStrategy?.tagIds ?? []);
    }, [currentStrategy]);

    const assignedTagIds = localSelectedTagIds;
    const assignedTags = (strategyTagList || []).filter((tag) => tag.id !== undefined && assignedTagIds.includes(tag.id));

    const handleToggleTag = async (tagId: number | undefined) => {
        if (!currentStrategy || tagId === undefined) return;
        const exists = localSelectedTagIds.includes(tagId);
        const newTagIds = exists
            ? localSelectedTagIds.filter((id) => id !== tagId)
            : [...localSelectedTagIds, tagId];

        // 1. Immediately update optimistic local state
        setLocalSelectedTagIds(newTagIds);

        // 2. Persist to source-of-truth
        state.source.strategy.set({
            ...currentStrategy,
            tagIds: newTagIds,
        });
    };

    const handleSaveTag = async (tagData: StrategyTag) => {
        state.source.strategy.tag.set(tagData);
        setOpenPopoverId(null);
        setIsMainOpen(false);
    };

    const handleMainOpenChange = (open: boolean | ((prev: boolean) => boolean)) => {
        const nextOpen = typeof open === "function" ? open(isMainOpen) : open;
        setIsMainOpen(nextOpen);
        if (!nextOpen) {
            setOpenPopoverId(null);
        }
    };

    const buttonContent = (
        <div className={style.Button}>
            {!currentStrategy || assignedTags.length === 0 ? (
                <TagIcon style={{ fill: theme ? `rgb(${theme.button.disable.font.join(",")})` : undefined, width: 12, height: 12 }} />
            ) : (
                assignedTags.map((tag) => (
                    <TagIcon
                        key={tag.id}
                        style={{ fill: `rgb(${tag.color.font.join(",")})`, width: 12, height: 12 }}
                    />
                ))
            )}
        </div>
    );

    const popoverContent = (
        <ListWithTheme>
            {(strategyTagList || []).map((tag) => {
                const hasTag = tag.id !== undefined && assignedTagIds.includes(tag.id);
                const rowBg = hasTag ? `rgba(${tag.color.background.join(",")})` : undefined;

                return (
                    <ButtonWithPopover
                        key={tag.id}
                        type="hover"
                        position="right"
                        align="start"
                        bufferSize="7px"
                        buttonWidth="100%"
                        open={openPopoverId === tag.id}
                        setOpen={(isOpen: any) => setOpenPopoverId(isOpen ? (tag.id ?? null) : null)}
                        button={
                            <div
                                className={style.PopupButton}
                                style={{ backgroundColor: rowBg }}
                                onClick={() => handleToggleTag(tag.id)}
                            >
                                <div className={style.LeftContent}>
                                    <TagIcon style={{ fill: `rgb(${tag.color.font.join(",")})`, width: 12, height: 12 }} />
                                    <span>{tag.name}</span>
                                </div>
                                <div className={style.RightContent}>
                                    {hasTag && (
                                        <span
                                            className={style.TagDot}
                                            style={{ backgroundColor: `rgb(${tag.color.font.join(",")})` }}
                                        />
                                    )}
                                </div>
                            </div>
                        }
                        popup={
                            <TagPanelForm
                                initialData={tag}
                                theme={theme}
                                onSave={handleSaveTag}
                            />
                        }
                    />
                );
            })}
            <ButtonWithPopover
                type="hover"
                position="right"
                align="start"
                bufferSize="7px"
                buttonWidth="100%"
                open={openPopoverId === "create"}
                setOpen={(isOpen: any) => setOpenPopoverId(isOpen ? "create" : null)}
                button={<div className={style.CreateRow}>+</div>}
                popup={
                    <TagPanelForm
                        initialData={strategyDataRef.current.tag.getDefault()}
                        theme={theme}
                        onSave={handleSaveTag}
                    />
                }
            />
        </ListWithTheme>
    );

    if (!currentStrategy) {
        return buttonContent;
    }

    return (
        <ButtonWithPopover
            type="hover"
            position="bottom"
            align="start"
            bufferSize="7px"
            open={isMainOpen}
            setOpen={handleMainOpenChange}
            button={buttonContent}
            popup={popoverContent}
        />
    );
}