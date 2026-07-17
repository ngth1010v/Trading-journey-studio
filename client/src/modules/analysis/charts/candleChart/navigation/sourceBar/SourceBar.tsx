/* client/src/modules/analysis/charts/candleChart/navigation/sourceBar/SourceBar.tsx */

import { useEffect, useState } from "react";
import style from "./SourceBar.module.css";

import type { CandleData } from "../../market/hooks/useCandleData";
import type { StrateryData } from "../../market/hooks/useStrateryData";
import { strategiesApi } from "../../../../../../shared/api/strategiesApi";
import type { Strategy } from "../../../../../../shared/types/strategies.type";

import ButtonWithPopover from "../../../../../../shared/components/ButtonWithPopover";
import ListWithTheme from "../../../../../../shared/components/ListWithTheme";

export default function SourceBar({
    candleData,
    strateryData,
}: {
    candleData: CandleData;
    strateryData: StrateryData;
}) {
    const [, forceUpdate] = useState(0);

    const [strategies, setStrategies] = useState<Strategy[]>([]);

    const symbol = candleData.getSymbol();
    const timeframe = candleData.getTimeframe();

    let currentStrategy: Strategy | null = null;
    try {
        currentStrategy = strateryData.get();
    } catch {}

    useEffect(() => {
        strategiesApi
            .getAllStrategies()
            .then((data) => {
                const order = {
                    live: 1,
                    backtest: 2,
                    end: 3,
                };

                setStrategies(
                    [...data].sort(
                        (a, b) =>
                            (order[a.status] ?? 99) -
                            (order[b.status] ?? 99)
                    )
                );
            })
            .catch(console.error);
    }, []);

    const favoriteSymbols = currentStrategy?.favoriteSymbols ?? [];
    const favoriteTimeframes = currentStrategy?.favoriteTimeframes ?? [];

    const refresh = () => forceUpdate((v) => v + 1);

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

    return (
        <ListWithTheme
            autoShrink
            type="horizontal"
            dividerList={[true, true, false]}
        >
            {/* SYMBOL */}
            {favoriteSymbols.length > 0 && (
                <ButtonWithPopover
                    type="hover"
                    position="bottom"
                    align="start"
                    bufferSize="10px"
                    button={<div className={style.Button}>{symbol}</div>}
                    popup={
                        <ListWithTheme
                            selectedList={favoriteSymbols.map((v) => v === symbol)}
                            maxHeight="40vh"
                        >
                            {favoriteSymbols.map((item) => (
                                <div
                                    key={item}
                                    className={style.PopupButton}
                                    style={{ width: "100%" }}
                                    onClick={() => {
                                        candleData.setSrc(item, timeframe);
                                        refresh();
                                    }}
                                >
                                    {item}
                                </div>
                            ))}
                        </ListWithTheme>
                    }
                />
            )}

            {/* TIMEFRAME */}
            {favoriteTimeframes.length > 0 && (
                <ButtonWithPopover
                    type="hover"
                    position="bottom"
                    align="start"
                    bufferSize="10px"
                    button={<div className={style.Button}>{timeframe}</div>}
                    popup={
                        <ListWithTheme
                            selectedList={favoriteTimeframes.map(
                                (v) => v === timeframe
                            )}
                            maxHeight="40vh"
                        >
                            {favoriteTimeframes.map((tf) => (
                                <div
                                    key={tf}
                                    className={style.PopupButton}
                                    style={{ width: "100%" }}
                                    onClick={() => {
                                        candleData.setSrc(symbol, tf);
                                        refresh();
                                    }}
                                >
                                    {tf}
                                </div>
                            ))}
                        </ListWithTheme>
                    }
                />
            )}

            {/* STRATEGY */}
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
                        {currentStrategy && (
                            <span
                                className={`${style.statusDot} ${getStatusDotClass(
                                    currentStrategy.status
                                )}`}
                            />
                        )}

                        {currentStrategy?.name ?? "Strategy"}
                    </div>
                }
                popup={
                    <ListWithTheme
                        selectedList={strategies.map(
                            (v) => v.name === currentStrategy?.name
                        )}
                        maxHeight="40vh"
                    >
                        {strategies.map((strat) => (
                            <div
                                key={strat.name}
                                className={style.PopupButton}
                                title={`[${strat.status.toUpperCase()}] ${strat.desc}`}
                                style={{
                                    width: "100%",
                                    opacity: strat.status === "end" ? 0.7 : 1,
                                }}
                                onClick={async () => {
                                    await strateryData.set(strat.name);
                                    refresh();
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
                    </ListWithTheme>
                }
            />
        </ListWithTheme>
    );
}