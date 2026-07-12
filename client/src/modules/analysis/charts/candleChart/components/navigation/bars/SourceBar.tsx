import styles from './SourceBar.module.css';
import { useState, useEffect } from 'react';

import { type CandleData } from "../../../hooks/rawCandle/useCandleData";
import { type StrateryData } from '../../../hooks/useStrateryData';
import { strategiesApi } from '../../../../../../../shared/api/strategiesApi';
import { type Strategy } from '../../../../../../../shared/types/strategies.type';
import ButtonWithPopover from '../../../../../../../shared/components/ButtonWithPopover';

export default function SourceBar(
    {
        candleData,
        strateryData
    }: {
        candleData: CandleData,
        strateryData: StrateryData
    }
) {
    const [strategies, setStrategies] = useState<Strategy[]>([]);

    // Fetch and sort strategy list on component mount
    useEffect(() => {
        strategiesApi.getAllStrategies()
            .then((data) => {
                // Priority ranking map for sorting status: live > backtest > end
                const statusOrder: Record<"live" | "backtest" | "end", number> = {
                    "live": 1,
                    "backtest": 2,
                    "end": 3
                };

                const sortedData = [...data].sort((a, b) => {
                    return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
                });

                setStrategies(sortedData);
            })
            .catch((err) => console.error("Failed to load strategies:", err));
    }, []);

    // Helper to get active strategy information safely
    let currentStrategy: Strategy | null = null;
    try {
        currentStrategy = strateryData.get();
    } catch (e) {
        // Fallback if strategy is not set or not loaded yet
    }

    // Safely extract favorite options from current strategy
    const favoriteSymbols = currentStrategy?.favoriteSymbols || [];
    const favoriteTimeframes = currentStrategy?.favoriteTimeframes || [];

    // Helper to get corresponding dot style class matching the status
    const getStatusDotClass = (status: "live" | "backtest" | "end") => {
        if (status === "live") return styles.dotLive;
        if (status === "backtest") return styles.dotBacktest;
        return styles.dotEnd;
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
                            {candleData.getSymbol()}
                        </div>
                    }
                    popup={
                        <div className={styles.popupPanel}>
                            {favoriteSymbols.map((symbol) => (
                                <div 
                                    key={symbol} 
                                    className={styles.popupItem} 
                                    onClick={() => candleData.setSrc(symbol, candleData.getTimeframe())}
                                >
                                    {symbol}
                                </div>
                            ))}
                        </div>
                    }
                />
            )}

            <div className={styles.spliter}/>

            {/* TIMEFRAME */}
            {favoriteTimeframes.length > 0 && (
                <ButtonWithPopover
                    type="hover"
                    position="bottom"
                    align="start"
                    button={
                        <div className={styles.button}>
                            {candleData.getTimeframe()}
                        </div>
                    }
                    popup={
                        <div className={styles.popupPanel}>
                            {favoriteTimeframes.map((tf) => (
                                <div 
                                    key={tf} 
                                    className={styles.popupItem} 
                                    onClick={() => candleData.setSrc(candleData.getSymbol(), tf)}
                                >
                                    {tf}
                                </div>
                            ))}
                        </div>
                    }
                />
            )}

            <div className={styles.spliter}/>

            {/* STRATEGY */}
            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                button={
                    <div 
                        className={styles.button} 
                        title={currentStrategy ? `[${currentStrategy.status.toUpperCase()}] ${currentStrategy.desc}` : undefined}
                    >
                        {currentStrategy && (
                            <span className={`${styles.statusDot} ${getStatusDotClass(currentStrategy.status)}`} />
                        )}
                        {currentStrategy ? currentStrategy.name : "Stratery"}
                    </div>
                }
                popup={
                    <div className={styles.popupPanel}>
                        {strategies.map((strat) => (
                            <div 
                                key={strat.name} 
                                className={styles.popupItemStratery}
                                onClick={() => strateryData.set(strat.name)}
                                title={`[${strat.status.toUpperCase()}] ${strat.desc}`}
                                style={{ opacity: strat.status === "end" ? 0.7 : 1 }}
                            >
                                <span className={`${styles.statusDot} ${getStatusDotClass(strat.status)}`} />
                                <span>{strat.name}</span>
                            </div>
                        ))}
                    </div>
                }
            />

        </div>
    );
}