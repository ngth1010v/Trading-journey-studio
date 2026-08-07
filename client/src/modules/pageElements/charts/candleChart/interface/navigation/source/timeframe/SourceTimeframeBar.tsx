import { useEffect, useState, useId, useRef } from "react";
import style from "./SourceTimeframeBar.module.css";

import type StateData from "../../../../state/StateData";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import ScrollVerticalList from "../../../../../../../shared/components/list/ScrollVerticalList";
import NumberInput from "../../../../../../../input/single/NumberInput";
import RatioInput from "../../../../../../../input/single/RatioInput";

const DEFAULT_TIMEFRAMES = ["1S", "5S", "15S", "1M", "5M", "15M", "1H", "4H", "1D", "1W", "1MN"];
const RATIO_OPTIONS = ["S", "M", "H", "D", "W", "MN", "Y"];

const UNIT_IN_SECONDS: Record<string, number> = {
    S: 1,
    M: 60,
    H: 3600,
    D: 86400,
    W: 604800,
    MN: 2592000, // 30 days
    Y: 31536000, // 365 days
};

function formatSimplifiedTimeframe(amount: number, unit: string): string {
    if (!amount || amount <= 0) return `${amount || 0}${unit}`;

    const totalSeconds = amount * (UNIT_IN_SECONDS[unit] ?? 1);

    if (totalSeconds % UNIT_IN_SECONDS.Y === 0) {
        return `${totalSeconds / UNIT_IN_SECONDS.Y}Y`;
    }
    if (totalSeconds % UNIT_IN_SECONDS.MN === 0) {
        return `${totalSeconds / UNIT_IN_SECONDS.MN}MN`;
    }
    if (totalSeconds % UNIT_IN_SECONDS.W === 0) {
        return `${totalSeconds / UNIT_IN_SECONDS.W}W`;
    }
    if (totalSeconds % UNIT_IN_SECONDS.D === 0) {
        return `${totalSeconds / UNIT_IN_SECONDS.D}D`;
    }
    if (totalSeconds % UNIT_IN_SECONDS.H === 0) {
        return `${totalSeconds / UNIT_IN_SECONDS.H}H`;
    }
    if (totalSeconds % UNIT_IN_SECONDS.M === 0) {
        return `${totalSeconds / UNIT_IN_SECONDS.M}M`;
    }

    return `${totalSeconds}S`;
}

const toRGBString = (color: [number, number, number]): string =>
    `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: [number, number, number, number]): string =>
    `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

export default function SourceTimeframeBar({ state }: { state: StateData }) {
    const [, forceUpdate] = useState(0);
    const listenerId = useId();

    // Independent ThemeData instance initialized without useState wrapper
    const themeDataRef = useRef<ThemeData | null>(null);
    if (!themeDataRef.current) {
        themeDataRef.current = new ThemeData();
    }
    const themeData = themeDataRef.current;

    // Custom Timeframe popup state
    const [numValue, setNumValue] = useState<number>(1);
    const [unitValue, setUnitValue] = useState<string>("M");
    const [isHoveredSave, setIsHoveredSave] = useState<boolean>(false);

    useEffect(() => {
        themeData.init();

        const handleThemeChange = () => {
            forceUpdate((v) => v + 1);
        };

        const handleConfigChange = () => {
            forceUpdate((v) => v + 1);
        };

        const handleStrategyChange = () => {
            forceUpdate((v) => v + 1);
        };

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

    let configData;
    try {
        configData = state.config.get();
    } catch {
        configData = undefined;
    }

    const currentTimeframe = configData?.timeframe ?? null;
    const strategyId = configData?.strategyId ?? null;

    const currentStrategy =
        strategyId !== null && strategyId !== undefined
            ? state.source.strategy.get(strategyId)
            : null;

    const favoriteTimeframes = currentStrategy?.favorite?.timeframes ?? [];
    const baseTimeframes =
        favoriteTimeframes.length > 0 ? favoriteTimeframes : DEFAULT_TIMEFRAMES;

    const currentTheme: Theme = themeData.getSelected();

    const primary1 = currentTheme.button.primary1;
    const primary2 = currentTheme.button.primary2;
    const normal2 = currentTheme.button.normal2;
    const activeSaveTheme = isHoveredSave ? primary1 : primary2;

    const reviewText = formatSimplifiedTimeframe(numValue, unitValue);

    const handleSelectTimeframe = (tf: string) => {
        state.config.set({ timeframe: tf });
    };

    const handleSaveCustomTimeframe = (closePopover?: () => void) => {
        handleSelectTimeframe(reviewText);
        if (closePopover) {
            closePopover();
        }
    };

    const renderCustomTimeframePopup = (closePopover?: () => void) => (
        <div
            className={style.CustomPopupContainer}
            style={{
                backgroundColor: toRGBAString(normal2.background),
                border: `1px solid ${toRGBAString(normal2.border)}`,
            }}
        >
            {/* Top Row: NumberInput and RatioInput */}
            <div className={style.InputTopRow}>
                <NumberInput
                    label=""
                    data={numValue}
                    setData={setNumValue}
                    labelWidth="0%"
                    hideLabel={true}
                    
                />
                <RatioInput
                    label=""
                    options={RATIO_OPTIONS}
                    data={unitValue}
                    setData={setUnitValue}
                    labelWidth="0%"
                    hideLabel={true}
                />
                <button
                    className={style.SaveButton}
                    style={{
                        backgroundColor: toRGBAString(activeSaveTheme.background),
                        borderColor: toRGBAString(activeSaveTheme.border),
                        color: toRGBString(activeSaveTheme.font),
                    }}
                    onMouseEnter={() => setIsHoveredSave(true)}
                    onMouseLeave={() => setIsHoveredSave(false)}
                    onClick={() => handleSaveCustomTimeframe(closePopover)}
                >
                    Save
                </button>
            </div>
        </div>
    );

    return (
        <ButtonWithPopover
            type="hover"
            position="bottom"
            align="start"
            bufferSize="7px"
            button={<div className={style.Button}>{currentTimeframe ?? "---"}</div>}
            popup={
                <ScrollVerticalList
                    selectedList={[
                        ...baseTimeframes.map((v) => v === currentTimeframe),
                        false, // Custom row is not selected as a list item directly
                    ]}
                >
                    {/* List of Timeframes */}
                    {baseTimeframes.map((tf) => (
                        <div
                            key={tf}
                            className={style.PopupButton}
                            style={{ width: "100%" }}
                            onClick={() => handleSelectTimeframe(tf)}
                        >
                            {tf}
                        </div>
                    ))}

                    {/* Custom Timeframe Row ("...") */}
                    <ButtonWithPopover
                        type="hover"
                        position="bottom"
                        align="start"
                        bufferSize="7px"
                        buttonWidth="100%"
                        button={
                            <div className={style.PopupButton} style={{ width: "100%" }}>
                                ...
                            </div>
                        }
                        popup={renderCustomTimeframePopup()}
                    />
                </ScrollVerticalList>
            }
        />
    );
}