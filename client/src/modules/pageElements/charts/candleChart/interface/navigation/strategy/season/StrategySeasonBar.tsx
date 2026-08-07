import React, { useEffect, useState, useRef } from "react";
import style from "./StrategySeasonBar.module.css";

import type StateData from "../../../../state/StateData";
import StrategyData, { type Strategy } from "../../../../../../../data/chartData/strategy/StrategyData";
import { type StrategySeason, STRATEGY_SEASON_INPUT_LAYOUT } from "../../../../../../../data/chartData/strategy/season/StrategySeasonData";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import ScrollVerticalList from "../../../../../../../shared/components/list/ScrollVerticalList";
import PanelInput from "../../../../../../../input/panel/PanelInput";
import SeasonIcon from "../../../../../../../../assets/icons/hourglass-fill.svg?react";

interface StrategySeasonBarProps {
    state: StateData;
}

const toCssColor = (color?: number[]) => {
    if (!color) return undefined;
    if (color.length === 4) return `rgba(${color.join(",")})`;
    return `rgb(${color.join(",")})`;
};

interface SeasonPanelFormProps {
    initialData: StrategySeason;
    theme: Theme | null;
    onSave: (data: StrategySeason) => Promise<void>;
}

function SeasonPanelForm({ initialData, theme, onSave }: SeasonPanelFormProps) {
    const [formData, setFormData] = useState<StrategySeason>(initialData);

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
            layout={STRATEGY_SEASON_INPUT_LAYOUT}
            data={formData}
            onDataChange={(updatedData) => setFormData(updatedData as StrategySeason)}
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

export default function StrategySeasonBar({ state }: StrategySeasonBarProps) {
    const listenerIds = {
        theme: "[candleChart][interface][navigation][strategy][season][StrategySeasonBar] Theme-listener",
        strategy: "[candleChart][interface][navigation][strategy][season][StrategySeasonBar] Strategy-listener",
        strategySeason: "[candleChart][interface][navigation][strategy][season][StrategySeasonBar] StrategySeason-listener",
        currentStrategyId: "[candleChart][interface][navigation][strategy][season][StrategySeasonBar] CurrentStrategyId-listener",
    };

    const themeDataRef = useRef<ThemeData>(new ThemeData());
    const strategyDataRef = useRef<StrategyData>(new StrategyData());

    const [theme, setTheme] = useState<Theme | null>(null);
    const [strategyList, setStrategyList] = useState<Strategy[] | null>(null);
    const [strategySeasonList, setStrategySeasonList] = useState<StrategySeason[] | null>(null);
    const [currentStrategyId, setCurrentStrategyId] = useState<number | null>(null);

    // Optimistic local state for immediate UI feedback
    const [localSelectedSeasonIds, setLocalSelectedSeasonIds] = useState<number[]>([]);

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

        strategyDataRef.current.season.addOnStrategySeasonDataChange(listenerIds.strategySeason, () =>
            setStrategySeasonList(strategyDataRef.current.season.getAll())
        );

        state.config.addOnConfigDataChange(listenerIds.currentStrategyId, ["strategyId"], () =>
            setCurrentStrategyId(state.config.get()?.strategyId ?? null)
        );

        return () => {
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerIds.theme);
            themeDataRef.current.destroy();

            strategyDataRef.current.removeOnStrateryDataChange(listenerIds.strategy);
            strategyDataRef.current.season.removeOnStrategySeasonDataChange(listenerIds.strategySeason);
            strategyDataRef.current.destroy();

            state.config.removeOnConfigDataChange(listenerIds.currentStrategyId);
        };
    }, [state]);

    const currentStrategy = strategyList?.find((s) => s.id === currentStrategyId);

    // Synchronize local state whenever source-of-truth strategy data updates
    useEffect(() => {
        setLocalSelectedSeasonIds(currentStrategy?.seasonIds ?? []);
    }, [currentStrategy]);

    const assignedSeasonIds = localSelectedSeasonIds;
    const assignedSeasons = (strategySeasonList || []).filter((s) => s.id !== undefined && assignedSeasonIds.includes(s.id));

    const handleToggleSeason = async (seasonId: number | undefined) => {
        if (!currentStrategy || seasonId === undefined) return;
        const exists = localSelectedSeasonIds.includes(seasonId);
        const newSeasonIds = exists
            ? localSelectedSeasonIds.filter((id) => id !== seasonId)
            : [...localSelectedSeasonIds, seasonId];

        // 1. Immediately update optimistic local state
        setLocalSelectedSeasonIds(newSeasonIds);

        // 2. Persist to source-of-truth
        state.source.strategy.set({
            ...currentStrategy,
            seasonIds: newSeasonIds,
        });
    };

    const handleSaveSeason = async (seasonData: StrategySeason) => {
        state.source.strategy.season.set(seasonData);
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
            {!currentStrategy || assignedSeasons.length === 0 ? (
                <SeasonIcon style={{ fill: theme ? `rgb(${theme.button.disable.font.join(",")})` : undefined, width: 12, height: 12 }} />
            ) : (
                assignedSeasons.map((season) => (
                    <SeasonIcon
                        key={season.id}
                        style={{ fill: `rgb(${season.color.font.join(",")})`, width: 12, height: 12 }}
                    />
                ))
            )}
        </div>
    );

    const popoverContent = (
        <ScrollVerticalList>
            {(strategySeasonList || []).map((season) => {
                const hasSeason = season.id !== undefined && assignedSeasonIds.includes(season.id);
                const rowBg = hasSeason ? `rgba(${season.color.background.join(",")})` : undefined;
                const fontColor = `rgb(${season.color.font.join(",")})`;

                return (
                    <ButtonWithPopover
                        key={season.id}
                        type="hover"
                        position="right"
                        align="start"
                        bufferSize="7px"
                        open={openPopoverId === season.id}
                        setOpen={(isOpen: any) => setOpenPopoverId(isOpen ? (season.id ?? null) : null)}
                        button={
                            <div
                                className={style.PopupButton}
                                style={{ backgroundColor: rowBg }}
                                onClick={() => handleToggleSeason(season.id)}
                            >
                                <div className={style.LeftContent}>
                                    <SeasonIcon style={{ fill: fontColor, width: 12, height: 12 }} />
                                    <span>{season.name}</span>
                                </div>
                                <div className={style.RightContent}>
                                    {hasSeason && (
                                        <span
                                            className={style.SeasonDot}
                                            style={{ backgroundColor: fontColor }}
                                        />
                                    )}
                                </div>
                            </div>
                        }
                        popup={
                            <SeasonPanelForm
                                initialData={season}
                                theme={theme}
                                onSave={handleSaveSeason}
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
                    <SeasonPanelForm
                        initialData={strategyDataRef.current.season.getDefault()}
                        theme={theme}
                        onSave={handleSaveSeason}
                    />
                }
            />
        </ScrollVerticalList>
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