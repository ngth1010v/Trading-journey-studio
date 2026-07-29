import { useEffect, useState, useId } from "react";
import style from "./SourceStrategyBar.module.css";

import type StateData from "../../../../state/StateData";
import ThemeData from "../../../../../../../data/theme/ThemeData";
import type { Strategy } from "../../../../../../../data/chartData/strategy/StrategyData";

import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import ListWithTheme from "../../../../../../../shared/components/ListWithTheme";

export default function SourceStrategyBar({ state }: { state: StateData }) {
    const [, forceUpdate] = useState(0);
    const listenerId = useId();

    // Independent ThemeData instance per component requirement
    const [themeData] = useState(() => new ThemeData());
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        themeData.init();

        const handleThemeChange = () => {
            forceUpdate((v) => v + 1);
        };

        const handleConfigChange = () => {
            forceUpdate((v) => v + 1);
        };

        const handleStrategyChange = () => {
            setIsCreating(false);
            forceUpdate((v) => v + 1);
        };

        // Polling theme data changes via listener
        themeData.addOnSelectedThemeDataChange(listenerId, handleThemeChange);
        state.config.addOnConfigDataChange(listenerId, ["data"], handleConfigChange);
        state.source.strategy.addOnStrateryDataChange(listenerId, handleStrategyChange);

        return () => {
            themeData.removeOnSelectedThemeDataChange(listenerId);
            state.config.removeOnConfigDataChange(listenerId);
            state.source.strategy.removeOnStrateryDataChange(listenerId);
            themeData.destroy();
        };
    }, [state, themeData, listenerId]);

    // Extract strategy configuration from state.config
    let configData;
    try {
        configData = state.config.get().data;
    } catch {
        configData = undefined;
    }

    const strategyId = configData?.strategyId ?? null;

    const strategies = state.source.strategy.getAll().sort((a, b) => {
        const order = { live: 1, backtest: 2, end: 3 };
        return (order[a.status] ?? 99) - (order[b.status] ?? 99);
    });

    const currentStrategy: Strategy | null =
        strategyId !== null && strategyId !== undefined
            ? state.source.strategy.get(strategyId)
            : null;

    const getStatusDotClass = (status: "live" | "backtest" | "end") => {
        switch (status) {
            case "live":
                return style.dotLive;
            case "backtest":
                return style.dotBacktest;
            default:
                return style.dotEnd;
        }
    };

    const handleCreateNewStrategy = async () => {
        setIsCreating(true);
        try {
            const defaultStrategy = state.source.strategy.getDefault();
            await state.source.strategy.set(defaultStrategy);
        } catch (err) {
            console.error("SourceStrategyBar: Failed to create default strategy", err);
            setIsCreating(false);
        }
    };

    return (
        <ButtonWithPopover
            type="hover"
            position="bottom"
            align="start"
            bufferSize="10px"
            button={
                <div
                    className={style.Button}
                    title={
                        currentStrategy
                            ? `[${currentStrategy.status.toUpperCase()}] ${currentStrategy.desc}`
                            : undefined
                    }
                >
                    <span
                        className={`${style.statusDot} ${getStatusDotClass(
                            currentStrategy?.status ?? "end"
                        )}`}
                    />
                    {currentStrategy?.name ?? "Strategy not found"}
                </div>
            }
            popup={
                <ListWithTheme
                    selectedList={[
                        ...strategies.map((v) => v.id === currentStrategy?.id),
                        ...(isCreating ? [false] : []),
                        false, // '+' button item is never selected
                    ]}
                    maxHeight="40vh"
                >
                    {/* Strategy list */}
                    {strategies.map((strat) => (
                        <div
                            key={strat.id ?? strat.name}
                            className={style.PopupButton}
                            title={`[${strat.status.toUpperCase()}] ${strat.desc}`}
                            style={{
                                width: "100%",
                                opacity: strat.status === "end" ? 0.7 : 1,
                            }}
                            onClick={() => {
                                if (strat.id !== undefined) {
                                    state.config.set({ data: { strategyId: strat.id } });
                                }
                            }}
                        >
                            <span
                                className={`${style.statusDot} ${getStatusDotClass(
                                    strat.status
                                )}`}
                            />
                            <span>{strat.name}</span>
                        </div>
                    ))}

                    {/* Placeholder when creating new strategy */}
                    {isCreating && (
                        <div
                            className={style.PopupButton}
                            style={{ width: "100%", opacity: 0.5 }}
                        >
                            <span className={`${style.statusDot} ${style.dotEnd}`} />
                            <span>---</span>
                        </div>
                    )}

                    {/* Create New Strategy Row */}
                    <div
                        className={`${style.PopupButton} ${style.AddButton}`}
                        style={{ width: "100%" }}
                        onClick={handleCreateNewStrategy}
                    >
                        <span>+</span>
                    </div>
                </ListWithTheme>
            }
        />
    );
}