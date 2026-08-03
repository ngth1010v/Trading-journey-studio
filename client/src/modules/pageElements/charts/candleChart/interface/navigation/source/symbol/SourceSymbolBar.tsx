import { useEffect, useState, useId, useRef } from "react";
import style from "./SourceSymbolBar.module.css";

import type StateData from "../../../../state/StateData";
import SymbolData, { type Symbol } from "../../../../../../../data/chartData/symbol/SymbolData";
import ThemeData from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import VerticalScrollList from "../../../../../../../shared/components/VerticalScrollList";
import ListWithTheme from "../../../../../../../shared/components/ListWithTheme";

interface SourceSymbolBarProps {
    state: StateData;
}

export default function SourceSymbolBar({ state }: SourceSymbolBarProps) {
    const [, forceUpdate] = useState(0);
    const listenerId = useId();

    // Instantiate SymbolData and ThemeData internally per component instance
    const [symbolData] = useState(() => new SymbolData());
    const themeDataRef = useRef<ThemeData>(new ThemeData());

    useEffect(() => {
        const currentThemeData = themeDataRef.current;

        const handleDataChange = () => {
            forceUpdate((v) => v + 1);
        };

        symbolData.addOnSymbolDataChange(listenerId, handleDataChange);
        symbolData.init();

        currentThemeData.addOnSelectedThemeDataChange(listenerId, handleDataChange);
        currentThemeData.init();

        // Also subscribe to strategy changes to reactively update favorite states
        state.source.strategy.addOnStrateryDataChange(listenerId, handleDataChange);

        return () => {
            symbolData.removeOnSymbolDataChange(listenerId);
            symbolData.destroy();

            currentThemeData.removeOnSelectedThemeDataChange(listenerId);
            currentThemeData.destroy();

            state.source.strategy.removeOnStrateryDataChange(listenerId);
        };
    }, [symbolData, listenerId, state]);

    // Get current theme details
    const activeTheme = themeDataRef.current.getSelected();
    const successFontRgb = activeTheme.button.success.font.join(",");
    const disableFontRgb = activeTheme.button.disable.font.join(",");

    const normalBtnBg = `rgba(${activeTheme.button.normal1.background.join(",")})`;
    const normalBtnBorder = `rgba(${activeTheme.button.normal1.border.join(",")})`;
    const normalBtnFont = `rgb(${activeTheme.button.normal1.font.join(",")})`;

    const successBtnFont = `rgb(${activeTheme.button.success.font.join(",")})`;
    const successBtnBg = `rgba(${activeTheme.button.success.background.join(",")})`;

    const dangerBtnFont = `rgb(${activeTheme.button.danger.font.join(",")})`;
    const dangerBtnBg = `rgba(${activeTheme.button.danger.background.join(",")})`;

    // Extract current symbol and strategy from state
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

    // Safely retrieve symbol map & all symbols list
    let symbolMap = new Map<string, Symbol>();
    let allSymbols: string[] = [];
    try {
        const all = symbolData.getAll();
        for (const item of all) {
            symbolMap.set(item.symbol, item);
        }
        allSymbols = all.map((s) => s.symbol);
    } catch {
        symbolMap = new Map();
        allSymbols = [];
    }

    const handleSelectSymbol = (symbol: string) => {
        state.config.set({ symbol });
    };

    const handleToggleWatching = async (e: React.MouseEvent, symbol: string, currentWatching: boolean) => {
        e.stopPropagation();
        await symbolData.setWatching(symbol, !currentWatching);
    };

    const handleToggleFavorite = async (e: React.MouseEvent, symbolName: string) => {
        e.stopPropagation();
        if (!currentStrategy) return;

        const currentFavorites = currentStrategy.favorite?.symbols ?? [];
        const isFav = currentFavorites.includes(symbolName);

        const updatedFavorites = isFav
            ? currentFavorites.filter((s) => s !== symbolName)
            : [...currentFavorites, symbolName];

        const updatedStrategy = {
            ...currentStrategy,
            favorite: {
                ...currentStrategy.favorite,
                symbols: updatedFavorites,
            },
        };

        console.log(updatedStrategy)
        console.log(currentStrategy)

        await state.source.strategy.set(updatedStrategy);
    };

    const renderSymbolRow = (symbolName: string) => {
        const symbolInfo = symbolMap.get(symbolName);
        const isWatching = symbolInfo?.watching ?? false;
        const isFavorite = favoriteSymbols.includes(symbolName);

        const dotColor = isWatching
            ? `rgb(${successFontRgb})`
            : `rgb(${disableFontRgb})`;
        const rowOpacity = isWatching ? 1 : 0.6;

        // Watch list button styles according to change specs
        const watchText = isWatching ? "Remove from Watch-list" : "Add to Watch-list";
        const watchStyle = isWatching
            ? {
                  "--btn-font": dangerBtnFont,
                  "--btn-bg": normalBtnBg,
                  "--btn-border": normalBtnBorder,
                  "--btn-hover-font": dangerBtnFont,
                  "--btn-hover-bg": dangerBtnBg,
                  "--btn-hover-border": dangerBtnBg,
              }
            : {
                  "--btn-font": successBtnFont,
                  "--btn-bg": normalBtnBg,
                  "--btn-border": normalBtnBorder,
                  "--btn-hover-font": successBtnFont,
                  "--btn-hover-bg": successBtnBg,
                  "--btn-hover-border": successBtnBg,
              };

        // Favorite button styles
        const favoriteText = isFavorite ? "Remove from Favorite" : "Add to Favorite";
        const favoriteStyle = {
            "--btn-font": normalBtnFont,
            "--btn-bg": normalBtnBg,
            "--btn-border": normalBtnBorder,
            "--btn-hover-font": normalBtnFont,
            "--btn-hover-bg": normalBtnBg,
            "--btn-hover-border": normalBtnBorder,
        };

        const popoverContent = (
            <ListWithTheme
                selectedList={[isWatching, isFavorite]}
            >
                <div
                    className={style.WatchButton}
                    style={watchStyle as React.CSSProperties}
                    onClick={(e) => handleToggleWatching(e, symbolName, isWatching)}
                >
                    {watchText}
                </div>
                {currentStrategy && (
                    <div
                        className={style.WatchButton}
                        style={favoriteStyle as React.CSSProperties}
                        onClick={(e) => handleToggleFavorite(e, symbolName)}
                    >
                        {favoriteText}
                    </div>
                )}
            </ListWithTheme>
        );

        const rowButton = (
            <div
                className={style.PopupButton}
                style={{ opacity: rowOpacity }}
                onClick={() => handleSelectSymbol(symbolName)}
            >
                <span>{symbolName}</span>
                <span
                    className={style.Dot}
                    style={{ backgroundColor: dotColor }}
                />
            </div>
        );

        return (
            <ButtonWithPopover
                key={symbolName}
                type="hover"
                position="right"
                align="start"
                bufferSize="15px"
                buttonWidth="100%"
                button={rowButton}
                popup={popoverContent}
            />
        );
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
                    <VerticalScrollList
                        selectedList={allSymbols.map((v) => v === currentSymbol)}
                    >
                        {allSymbols.map((item) => renderSymbolRow(item))}
                    </VerticalScrollList>
                }
            />
        );
    }

    // Case 2: Favorite symbols exist -> Render Favorites + Nested Popup for "..."
    const allSymbolsListPopup = (
        <VerticalScrollList
            selectedList={allSymbols.map((v) => v === currentSymbol)}
        >
            {allSymbols.map((item) => renderSymbolRow(item))}
        </VerticalScrollList>
    );

    return (
        <ButtonWithPopover
            type="hover"
            position="bottom"
            align="start"
            bufferSize="10px"
            button={<div className={style.Button}>{currentSymbol ?? "---"}</div>}
            popup={
                <VerticalScrollList
                    selectedList={[
                        ...favoriteSymbols.map((v) => v === currentSymbol),
                        false, // Extra row for "..."
                    ]}
                >
                    {favoriteSymbols.map((item) => renderSymbolRow(item))}

                    {/* Additional custom symbol row with sub-popover */}
                    <ButtonWithPopover
                        type="hover"
                        position="right"
                        align="start"
                        bufferSize="15px"
                        buttonWidth="100%"
                        button={
                            <div
                                className={style.PopupButton}
                                style={{ justifyContent: "center" }}
                            >
                                ...
                            </div>
                        }
                        popup={allSymbolsListPopup}
                    />
                </VerticalScrollList>
            }
        />
    );
}