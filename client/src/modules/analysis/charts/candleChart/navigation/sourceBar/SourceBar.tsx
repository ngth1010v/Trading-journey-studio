import styles from "./SourceBar.module.css";
import { useState, useEffect } from "react";

import { type CandleData }      from "../../market/hooks/useCandleData";
import { type StrateryData }    from "../../market/hooks/useStrateryData";
import { strategiesApi }        from "../../../../../../shared/api/strategiesApi";
import { type Strategy }        from "../../../../../../shared/types/strategies.type";
import ButtonWithPopover        from "../../../../../../shared/components/ButtonWithPopover";

export default function SourceBar({
    candleData,
    strateryData
}: {
    candleData: CandleData;
    strateryData: StrateryData;
}) {
    const [strategies, setStrategies] = useState<Strategy[]>([]);

    // Display state
    const [symbol, setSymbol] = useState(() => candleData.getSymbol());
    const [timeframe, setTimeframe] = useState(() => candleData.getTimeframe());
    const [currentStrategy, setCurrentStrategy] = useState<Strategy | null>(() => {
        try {
            return strateryData.get();
        } catch {
            return null;
        }
    });

    // Fetch strategy list
    useEffect(() => {
        strategiesApi
            .getAllStrategies()
            .then((data) => {
                const statusOrder: Record<"live" | "backtest" | "end", number> = {
                    live: 1,
                    backtest: 2,
                    end: 3
                };

                const sorted = [...data].sort(
                    (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
                );

                setStrategies(sorted);

                // Refresh current strategy after strategies are loaded
                try {
                    setCurrentStrategy(strateryData.get());
                } catch {}
            })
            .catch((err) => console.error("Failed to load strategies:", err));
    }, []);

    const favoriteSymbols = currentStrategy?.favoriteSymbols ?? [];
    const favoriteTimeframes = currentStrategy?.favoriteTimeframes ?? [];

    const getStatusDotClass = (status: "live" | "backtest" | "end") => {
        switch (status) {
            case "live":
                return styles.dotLive;
            case "backtest":
                return styles.dotBacktest;
            default:
                return styles.dotEnd;
        }
    };

    return (
        <div className={styles.navigation}>
            {/* SYMBOL */}
            {favoriteSymbols.length > 0 && (
                <ButtonWithPopover
                    type="hover"
                    position="bottom"
                    align="start"
                    button={
                        <div className={styles.button}>
                            {symbol}
                        </div>
                    }
                    popup={
                        <div className={styles.popupPanel}>
                            {favoriteSymbols.map((item) => (
                                <div
                                    key={item}
                                    className={styles.popupItem}
                                    onClick={() => {
                                        candleData.setSrc(item, candleData.getTimeframe());
                                        setSymbol(candleData.getSymbol());
                                        setTimeframe(candleData.getTimeframe());
                                    }}
                                >
                                    {item}
                                </div>
                            ))}
                        </div>
                    }
                />
            )}

            <div className={styles.spliter} />

            {/* TIMEFRAME */}
            {favoriteTimeframes.length > 0 && (
                <ButtonWithPopover
                    type="hover"
                    position="bottom"
                    align="start"
                    button={
                        <div className={styles.button}>
                            {timeframe}
                        </div>
                    }
                    popup={
                        <div className={styles.popupPanel}>
                            {favoriteTimeframes.map((tf) => (
                                <div
                                    key={tf}
                                    className={styles.popupItem}
                                    onClick={() => {
                                        candleData.setSrc(candleData.getSymbol(), tf);
                                        setSymbol(candleData.getSymbol());
                                        setTimeframe(candleData.getTimeframe());
                                    }}
                                >
                                    {tf}
                                </div>
                            ))}
                        </div>
                    }
                />
            )}

            <div className={styles.spliter} />

            {/* STRATEGY */}
            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                button={
                    <div
                        className={styles.button}
                        title={
                            currentStrategy
                                ? `[${currentStrategy.status.toUpperCase()}] ${currentStrategy.desc}`
                                : undefined
                        }
                    >
                        {currentStrategy && (
                            <span
                                className={`${styles.statusDot} ${getStatusDotClass(
                                    currentStrategy.status
                                )}`}
                            />
                        )}
                        {currentStrategy ? currentStrategy.name : "Strategy"}
                    </div>
                }
                popup={
                    <div className={styles.popupPanel}>
                        {strategies.map((strat) => (
                            <div
                                key={strat.name}
                                className={styles.popupItemStratery}
                                title={`[${strat.status.toUpperCase()}] ${strat.desc}`}
                                style={{
                                    opacity: strat.status === "end" ? 0.7 : 1
                                }}
                                onClick={() => {
                                    const setStrat = async () => {
                                        await strateryData.set(strat.name);
                                        try {
                                                setCurrentStrategy(strateryData.get());
                                        } catch {}                                            
                                    }
                                    setStrat()
                                }}
                            >
                                <span
                                    className={`${styles.statusDot} ${getStatusDotClass(
                                        strat.status
                                    )}`}
                                />
                                <span>{strat.name}</span>
                            </div>
                        ))}
                    </div>
                }
            />
        </div>
    );
}