import { useState, useEffect, useRef } from "react";
import style from "./SeasonBar.module.css";
import FixedHorizontalList from "../../../../../../shared/components/list/FixedHorizontalList";
import ThemeData, { type Theme } from "../../../../../../data/theme/ThemeData";

import SeasonIcon from              "../../../../../../../assets/icons/hourglass-fill.svg?react";
import NextSeasonRangeIcon from     "../../../../../../../assets/icons/caret-right-fill.svg?react";
import PrevSeasonRangeIcon from     "../../../../../../../assets/icons/caret-left-fill.svg?react";
import ClosestSeasonRangeIcon from  "../../../../../../../assets/icons/arrows-in-line-horizontal-fill.svg?react";
import UnselectSeasonRangeIcon from "../../../../../../../assets/icons/x.svg?react";
import type StateData from "../../../state/StateData";
import type ChartController from "../../../chart/ChartController";

export interface StrategySeasonRange {
  seasonId: number;
  fromTs: number;
  toTs: number;
}

export const PRELOAD_RATIO = 2;

type RGB = [number, number, number];
const ID_BASE = "[candleChart][interface][floatingBar][season][SeasonBar.tsx]";

const rgbCss = (color: RGB): string => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

export default function SeasonBar({
  state,
  chart,
  dragButton
}: {
  state: StateData;
  chart: ChartController;
  dragButton: React.ReactNode
}) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [selectedSeasonRange, setSelectedSeasonRange] =
    useState<StrategySeasonRange | null>(null);
  const [selectedSeasonStyle, setSelectedSeasonStyle] = useState<{
    name: string;
    color: RGB;
  }>({ color: [120, 124, 132], name: "No season" });

  // Theme Loader
  const themeDataRef = useRef<ThemeData>(new ThemeData());

  useEffect(() => {
    themeDataRef.current.addOnSelectedThemeDataChange(
      `${ID_BASE} theme loader`,
      () => {
        setTheme(themeDataRef.current.getSelected());
      }
    );
    themeDataRef.current.init();

    return () => {
      themeDataRef.current.removeOnSelectedThemeDataChange(
        `${ID_BASE} theme loader`
      );
      themeDataRef.current.destroy();
    };
  }, []);

  // SelectedSeasonRange Loader
  useEffect(() => {
    const updateSeasonRange = () => {
      setSelectedSeasonRange(
        state.source.strategy.season.getSelectedSeasonRange()
      );
    };

    updateSeasonRange();
    state.source.strategy.season.addOnSelectedSeasonRangeDataChange(
      `${ID_BASE} selectedSeasonRange loader`,
      updateSeasonRange
    );

    return () => {
      state.source.strategy.season.removeOnSelectedSeasonRangeDataChange(
        `${ID_BASE} selectedSeasonRange loader`
      );
    };
  }, [state]);

  // SelectedSeasonStyle Loader
  useEffect(() => {
    const updateStyle = () => {
      const currentRange =
        state.source.strategy.season.getSelectedSeasonRange();
      const disableColor: RGB = theme?.button?.disable?.font ?? [120, 124, 132];

      if (!currentRange || currentRange.seasonId == null) {
        setSelectedSeasonStyle({
          color: disableColor,
          name: "No season",
        });
        return;
      }

      const season = state.source.strategy.season.get(currentRange.seasonId);
      if (!season) {
        setSelectedSeasonStyle({
          color: disableColor,
          name: "No season",
        });
        return;
      }

      setSelectedSeasonStyle({
        color: season.color?.font ?? disableColor,
        name: season.name ?? "No season",
      });
    };

    updateStyle();

    state.source.strategy.season.addOnSelectedSeasonRangeDataChange(
      `${ID_BASE} selectedSeasonStyle loader`,
      updateStyle
    );

    return () => {
      state.source.strategy.season.removeOnSelectedSeasonRangeDataChange(
        `${ID_BASE} selectedSeasonStyle loader`
      );
    };
  }, [state, theme, selectedSeasonRange]);

  // Navigation Click Handlers
  const moveViewportToSeasonRange = () => {
    const range = state.source.strategy.season.getSelectedSeasonRange()
    const view = state.config.get()?.viewport
    if (range && view) {
      const rangeCenter = (range.fromTs + range.toTs) / 2
      const viewCenter = (view.fromTs + view.toTs) / 2
      const delta = rangeCenter - viewCenter
      state.config.set({viewport: {fromTs: view.fromTs + delta, toTs: view.toTs + delta, toPrice: view.toPrice, fromPrice: view.fromPrice}})
      chart.viewport.aligner.autoViewport()
    }
  }

  const handlePrevRange = () => {
    const view = state.config.get()?.viewport;
    if (!view) return;
    const currentStrategyId = state.config.get()?.strategyId;
    if (!currentStrategyId) return;
    const filterSeasonIds =
      state.source.strategy.get(currentStrategyId)?.seasonIds;
    if (!filterSeasonIds || filterSeasonIds.length === 0) return;

    const perLoadFromTs = view.fromTs - (view.toTs - view.fromTs) * PRELOAD_RATIO;
    const perLoadToTs = view.toTs + (view.toTs - view.fromTs) * PRELOAD_RATIO;

    if (selectedSeasonRange == null) {
      state.source.strategy.season.setSelectedSeasonRangeToClosestRange(
        (view.fromTs + view.toTs) / 2,
        perLoadFromTs,
        perLoadToTs,
        filterSeasonIds
      );
    } else {
      state.source.strategy.season.setSelectedSeasonRangeToPreviousRange(
        perLoadFromTs,
        perLoadToTs,
        filterSeasonIds
      );
    }

    moveViewportToSeasonRange()
  };

  const handleClosestRange = () => {
    const view = state.config.get()?.viewport;
    if (!view) return;
    const currentStrategyId = state.config.get()?.strategyId;
    if (!currentStrategyId) return;
    const filterSeasonIds =
      state.source.strategy.get(currentStrategyId)?.seasonIds;
    if (!filterSeasonIds || filterSeasonIds.length === 0) return;

    const perLoadFromTs = view.fromTs - (view.toTs - view.fromTs) * PRELOAD_RATIO;
    const perLoadToTs = view.toTs + (view.toTs - view.fromTs) * PRELOAD_RATIO;

    state.source.strategy.season.setSelectedSeasonRangeToClosestRange(
      (view.fromTs + view.toTs) / 2,
      perLoadFromTs,
      perLoadToTs,
      filterSeasonIds
    );

    moveViewportToSeasonRange()
  };

  const handleUnselectRange = () => {
    state.source.strategy.season.setSelectedSeasonRangeToNull();
  };

  const handleNextRange = () => {
    const view = state.config.get()?.viewport;
    if (!view) return;
    const currentStrategyId = state.config.get()?.strategyId;
    if (!currentStrategyId) return;
    const filterSeasonIds =
      state.source.strategy.get(currentStrategyId)?.seasonIds;
    if (!filterSeasonIds || filterSeasonIds.length === 0) return;

    const perLoadFromTs = view.fromTs - (view.toTs - view.fromTs) * PRELOAD_RATIO;
    const perLoadToTs = view.toTs + (view.toTs - view.fromTs) * PRELOAD_RATIO;

    if (selectedSeasonRange == null) {
      state.source.strategy.season.setSelectedSeasonRangeToClosestRange(
        (view.fromTs + view.toTs) / 2,
        perLoadFromTs,
        perLoadToTs,
        filterSeasonIds
      );
    } else {
      state.source.strategy.season.setSelectedSeasonRangeToNextRange(
        perLoadFromTs,
        perLoadToTs,
        filterSeasonIds
      );
    }

    moveViewportToSeasonRange()
  };

  const buttonIconFill = theme?.button?.normal1?.font
    ? rgbCss(theme.button.normal1.font)
    : "rgb(120, 124, 132)";

  return (
    <FixedHorizontalList>
        {dragButton}

        {/* Set previous range button */}
        <button
          type="button"
          className={style.actionButton}
          onClick={handlePrevRange}
          title="Previous season range"
        >
          <PrevSeasonRangeIcon
            className={style.icon}
            style={{ fill: buttonIconFill, width: "12px", height: "12px" }}
          />
        </button>

        {/* Set closest range button */}
        <button
          type="button"
          className={style.actionButton}
          onClick={handleClosestRange}
          title="Closest season range"
        >
          <ClosestSeasonRangeIcon
            className={style.icon}
            style={{ fill: buttonIconFill, width: "13px", height: "13px" }}
          />
        </button>

        {/* Unselect range button */}
        <button
          type="button"
          className={style.actionButton}
          onClick={handleUnselectRange}
          title="Unselect season range"
        >
          <UnselectSeasonRangeIcon
            className={style.icon}
            style={{ color: buttonIconFill, width: "12px", height: "12px" }}
          />
        </button>

        {/* Set next range button */}
        <button
          type="button"
          className={style.actionButton}
          onClick={handleNextRange}
          title="Next season range"
        >
          <NextSeasonRangeIcon
            className={style.icon}
            style={{ fill: buttonIconFill, width: "12px", height: "12px" }}
          />
        </button>

        {/* Selected season display */}
        <div className={style.selectedSeasonPart}>
          <SeasonIcon
            className={style.icon}
            style={{ fill: rgbCss(selectedSeasonStyle.color) }}
          />
          <span
            className={style.seasonName}
            style={{ color: rgbCss(selectedSeasonStyle.color) }}
          >
            {selectedSeasonStyle.name}
          </span>
        </div>
    </FixedHorizontalList>
  );
}