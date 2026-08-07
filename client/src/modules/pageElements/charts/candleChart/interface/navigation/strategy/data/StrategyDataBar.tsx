import React, { useEffect, useState, useRef } from "react";
import style from "./StrategyDataBar.module.css";

import type StateData from "../../../../state/StateData";
import StrategyData, { type Strategy, STRATEGY_INPUT_LAYOUT } from "../../../../../../../data/chartData/strategy/StrategyData";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import StrategyIcon from "../../../../../../../../assets/icons/book-fill.svg?react";
import ScrollVerticalList from "../../../../../../../shared/components/list/ScrollVerticalList";
import PanelInput from "../../../../../../../input/panel/PanelInput";

interface StrategyDataBarProps {
    state: StateData;
}

const toCssColor = (color?: number[]) => {
    if (!color) return undefined;
    if (color.length === 4) return `rgba(${color.join(",")})`;
    return `rgb(${color.join(",")})`;
};

interface StrategyPanelFormProps {
    initialData: Strategy;
    theme: Theme | null;
    onSave: (data: Strategy) => Promise<void>;
}

function StrategyPanelForm({ initialData, theme, onSave }: StrategyPanelFormProps) {
    const [formData, setFormData] = useState<Strategy>(initialData);

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
            layout={STRATEGY_INPUT_LAYOUT}
            data={formData}
            onDataChange={(updatedData) => setFormData(updatedData as Strategy)}
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

export default function StrategyDataBar({ state }: StrategyDataBarProps) {
    const listenerIds = {
        theme: "[candleChart][interface][navigation][strategy][data][StrategyDataBar] Theme-listener",
        strategy: "[candleChart][interface][navigation][strategy][data][StrategyDataBar] Strategy-listener",
        currentStrategyId: "[candleChart][interface][navigation][strategy][data][StrategyDataBar] CurrentStrategyId-listener",
    };

    const themeDataRef = useRef<ThemeData>(new ThemeData());
    const strategyDataRef = useRef<StrategyData>(new StrategyData());

    const [theme, setTheme] = useState<Theme | null>(null);
    const [strategyList, setStrategyList] = useState<Strategy[] | null>(null);
    const [currentStrategyId, setCurrentStrategyId] = useState<number | null>(null);

    // Controlled open states for main popover and inner sub-popovers
    const [isMainOpen, setIsMainOpen] = useState<boolean>(false);
    const [openPopoverId, setOpenPopoverId] = useState<number | "create" | null>(null);

    useEffect(() => {
        themeDataRef.current.init();
        strategyDataRef.current.init();

        themeDataRef.current.addOnSelectedThemeDataChange(listenerIds.theme, () =>
            setTheme(themeDataRef.current.getSelected())
        );

        strategyDataRef.current.addOnStrateryDataChange(listenerIds.strategy, () => {
            setStrategyList(strategyDataRef.current.getAll());
        });

        state.config.addOnConfigDataChange(listenerIds.currentStrategyId, ["strategyId"], () => {
            setCurrentStrategyId(state.config.get()?.strategyId ?? null);
        });

        return () => {
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerIds.theme);
            themeDataRef.current.destroy();

            strategyDataRef.current.removeOnStrateryDataChange(listenerIds.strategy);
            strategyDataRef.current.destroy();

            state.config.removeOnConfigDataChange(listenerIds.currentStrategyId);
        };
    }, [state]);

    const getStatusColor = (status: Strategy["status"]) => {
        if (!theme) return "transparent";
        if (status === "live") return `rgb(${theme.button.success.font.join(",")})`;
        if (status === "backtest") return `rgb(${theme.button.warning.font.join(",")})`;
        return `rgb(${theme.button.disable.font.join(",")})`;
    };

    const handleSelectStrategy = (id: number | undefined) => {
        if (id === undefined) return;
        const newId = currentStrategyId === id ? null : id;
        state.config.set({ strategyId: newId ?? undefined });
    };

    const handleSaveStrategy = async (strategyData: Strategy) => {
        await state.source.strategy.set(strategyData);
        // Force close all popovers
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

    const currentStrategy = strategyList?.find((s) => s.id === currentStrategyId);

    const buttonContent = (
        <div className={style.Button}>
            {!currentStrategy || currentStrategyId === null ? (
                <span style={{ color: theme ? `rgb(${theme.button.disable.font.join(",")})` : undefined }}>
                    No strategy
                </span>
            ) : (
                <>
                    <div className={style.LeftContent}>
                        <StrategyIcon style={{ fill: `rgb(${currentStrategy.color.font.join(",")})`, width: 12, height: 12 }} />
                        <span>{currentStrategy.name}</span>
                    </div>
                    <span
                        className={style.StatusDot}
                        style={{ backgroundColor: getStatusColor(currentStrategy.status) }}
                    />
                </>
            )}
        </div>
    );

    const popoverContent = (
        <ScrollVerticalList>
            {(strategyList || []).map((strat) => {
                const isSelected = currentStrategyId === strat.id;
                const rowBg = isSelected
                    ? `rgba(${strat.color.background.join(",")})`
                    : undefined;

                return (
                    <ButtonWithPopover
                        key={strat.id}
                        type="hover"
                        position="right"
                        align="start"
                        bufferSize="7px"
                        buttonWidth="100%"
                        open={openPopoverId === strat.id}
                        setOpen={(isOpen: any) => setOpenPopoverId(isOpen ? (strat.id ?? null) : null)}
                        button={
                            <div
                                className={style.PopupButton}
                                style={{ backgroundColor: rowBg }}
                                onClick={() => handleSelectStrategy(strat.id)}
                            >
                                <div className={style.LeftContent}>
                                    <StrategyIcon style={{ fill: `rgb(${strat.color.font.join(",")})`, width: 12, height: 12 }} />
                                    <span>{strat.name}</span>
                                </div>
                                <span
                                    className={style.StatusDot}
                                    style={{ backgroundColor: getStatusColor(strat.status) }}
                                />
                            </div>
                        }
                        popup={
                            <StrategyPanelForm
                                initialData={strat}
                                theme={theme}
                                onSave={handleSaveStrategy}
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
                    <StrategyPanelForm
                        initialData={state.source.strategy.getDefault()}
                        theme={theme}
                        onSave={handleSaveStrategy}
                    />
                }
            />
        </ScrollVerticalList>
    );

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