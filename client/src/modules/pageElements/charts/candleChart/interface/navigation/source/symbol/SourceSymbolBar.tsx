import { useEffect, useState, useId } from "react";
import style from "./SourceSymbolBar.module.css";

import type StateData       from "../../../../state/StateData";
import SymbolData           from "../../../../../../../data/chartData/symbol/SymbolData";
import ButtonWithPopover    from "../../../../../../../shared/components/ButtonWithPopover";
import ListWithTheme        from "../../../../../../../shared/components/ListWithTheme";

interface SourceSymbolBarProps {
    state: StateData;
}

export default function SourceSymbolBar({ state }: SourceSymbolBarProps) {
    const [, forceUpdate] = useState(0);
    const listenerId = useId();

    // Instantiate SymbolData internally per component instance
    const [symbolData] = useState(() => new SymbolData());

    useEffect(() => {
        const handleSymbolDataChange = () => {
            forceUpdate((v) => v + 1);
        };

        symbolData.addOnSymbolDataChange(listenerId, handleSymbolDataChange);
        symbolData.init()

        return () => {
            symbolData.removeOnSymbolDataChange(listenerId);
            symbolData.destroy();
        };
    }, [symbolData, listenerId]);

    // Extract current symbol and favorite symbols from state
    let configData;
    try {
        configData = state.config.get();
    } catch {
        configData = undefined;
    }

    const currentSymbol = configData?.symbol ?? null;
    const strategyId = configData?.strategyId ?? null;

    const currentStrategy =
        strategyId !== null && strategyId !== undefined
            ? state.source.strategy.get(strategyId)
            : null;

    const favoriteSymbols = currentStrategy?.favorite?.symbols ?? [];

    // Safely retrieve all symbols from SymbolData if initialized
    let allSymbols: string[] = [];
    try {
        allSymbols = symbolData.getAll().map((s) => s.symbol);
    } catch {
        allSymbols = [];
    }

    const handleSelectSymbol = (symbol: string) => {
        state.config.set( { symbol });
    };

    // Case 1: No Strategy or Favorite Symbols list is empty -> Fallback to allSymbols list
    if (!currentStrategy || favoriteSymbols.length === 0) {
        return (
            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                bufferSize="10px"
                button={<div className={style.Button}>{currentSymbol ?? "---"}</div>}
                popup={
                    <ListWithTheme
                        selectedList={allSymbols.map((v) => v === currentSymbol)}
                        maxHeight="40vh"
                        overflowY="auto"
                    >
                        {allSymbols.map((item) => (
                            <div
                                key={item}
                                className={style.PopupButton}
                                style={{ width: "100%" }}
                                onClick={() => handleSelectSymbol(item)}
                            >
                                {item}
                            </div>
                        ))}
                    </ListWithTheme>
                }
            />
        );
    }

    // Case 2: Favorite symbols exist -> Render Favorites + Nested Popup for "..."
    const allSymbolsListPopup = (
        <ListWithTheme
            selectedList={allSymbols.map((v) => v === currentSymbol)}
            maxHeight="40vh"
        >
            {allSymbols.map((item) => (
                <div
                    key={item}
                    className={style.PopupButton}
                    style={{ width: "100%" }}
                    onClick={() => handleSelectSymbol(item)}
                >
                    {item}
                </div>
            ))}
        </ListWithTheme>
    );

    return (
        <ButtonWithPopover
            type="hover"
            position="bottom"
            align="start"
            bufferSize="10px"
            button={<div className={style.Button}>{currentSymbol ?? "---"}</div>}
            popup={
                <ListWithTheme
                    selectedList={[
                        ...favoriteSymbols.map((v) => v === currentSymbol),
                        false, // Extra row for "..."
                    ]}
                    maxHeight="40vh"
                    overflowY="auto"
                >
                    {favoriteSymbols.map((item) => (
                        <div
                            key={item}
                            className={style.PopupButton}
                            style={{ width: "100%" }}
                            onClick={() => handleSelectSymbol(item)}
                        >
                            {item}
                        </div>
                    ))}

                    {/* Additional custom symbol row with sub-popover */}
                    <ButtonWithPopover
                        type="hover"
                        position="right"
                        align="start"
                        bufferSize="5px"
                        button={
                            <div
                                className={style.PopupButton}
                                style={{ width: "100%", justifyContent: "center" }}
                            >
                                ...
                            </div>
                        }
                        popup={allSymbolsListPopup}
                    />
                </ListWithTheme>
            }
        />
    );
}