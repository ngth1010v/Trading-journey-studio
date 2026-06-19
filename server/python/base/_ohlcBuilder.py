from __future__ import annotations

from typing import Iterable
from tqdm import tqdm

import _logger as logger
import config
import ohlcStorer
from _type import Ohlc
from datetime import datetime, timezone

#============================================================================================================
# CONSTANTS
#============================================================================================================

TIMEFRAME_MAP = ["1S", "1M", "1H", "1D"]

TIMESTAMP_MAP = {
    "1S": 1_000,
    "1M": 1_000 * 60,
    "1H": 1_000 * 60 * 60,
    "1D": 1_000 * 60 * 60 * 24,
}

_VALID_TARGET_TIMEFRAMES = {"1M", "1H", "1D"}
_SECTION = "base/_ohlcBuilder.py"


#============================================================================================================
# HELPERS
#============================================================================================================

def _timestamp_floor(timestamp: int, timeframe: str) -> int:
    return (timestamp // TIMESTAMP_MAP[timeframe]) * TIMESTAMP_MAP[timeframe]


def _validate_target_timeframe(targetTimeframe: str) -> bool:
    if targetTimeframe not in _VALID_TARGET_TIMEFRAMES:
        logger.error(_SECTION, f"Invalid target timeframe: {targetTimeframe!r}.")
        return False
    return True


def _get_src_timeframe(targetTimeframe: str) -> str:
    idx = TIMEFRAME_MAP.index(targetTimeframe)
    if idx <= 0:
        raise ValueError(f"Target timeframe has no lower source timeframe: {targetTimeframe!r}")
    return TIMEFRAME_MAP[idx - 1]


def _build_periods(startExtendTs: int, endExtendTs: int, targetTimeframe: str) -> list[tuple[int, int]]:
    periods: list[tuple[int, int]] = []
    step = TIMESTAMP_MAP[targetTimeframe]

    currentExtendTs = startExtendTs
    while currentExtendTs <= endExtendTs:
        periods.append((currentExtendTs, currentExtendTs + step))
        currentExtendTs += step

    # --- Đoạn code log periods ---
    # for p in periods:
    #     print(f"{datetime.fromtimestamp(p[0]/1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')} -> {datetime.fromtimestamp(p[1]/1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')}")
    # -----------------------------

    return periods


def _aggregate_periods(
    symbol: str,
    srcTimeframe: str,
    periods: list[tuple[int, int]],
) -> list[Ohlc] | None:
    if not periods:
        return []

    batch = ohlcStorer.aggregateOhlcs(symbol, srcTimeframe, periods)

    if batch is None:
        return None

    if not isinstance(batch, list):
        logger.error(
            _SECTION,
            f"aggregateOhlcs returned unexpected type for {symbol}/{srcTimeframe}: {type(batch).__name__}.",
        )
        return None

    return batch


def _log_noop(symbol: str, targetTimeframe: str, direction: str) -> None:
    logger.warning(_SECTION, f"No {direction} extension needed for {symbol}/{targetTimeframe}.")


def _has_overlap(existing_first_ts: int | None, existing_last_ts: int | None, start_ts: int, end_ts: int) -> bool:
    if existing_first_ts is None or existing_last_ts is None:
        return False
    return not (end_ts < existing_first_ts or start_ts > existing_last_ts)


#============================================================================================================
# PUBLIC API
#============================================================================================================

def extendFront(symbol: str, targetTimeframe: str) -> bool:
    """
    Extend OHLC data toward newer timestamps by aggregating from the lower timeframe.
    """
    if not _validate_target_timeframe(targetTimeframe):
        return False

    srcTimeframe = _get_src_timeframe(targetTimeframe)

    if ohlcStorer.IsEmpty(symbol, srcTimeframe):
        logger.error(_SECTION, f"Source timeframe is empty for {symbol}/{srcTimeframe}.")
        return False

    src_first = ohlcStorer.getFirstOhlc(symbol, srcTimeframe)
    src_last = ohlcStorer.getLastOhlc(symbol, srcTimeframe)

    if src_first is None or src_last is None:
        logger.error(_SECTION, f"Failed to read source OHLC bounds for {symbol}/{srcTimeframe}.")
        return False

    step = TIMESTAMP_MAP[targetTimeframe]

    endExtendTs = _timestamp_floor(src_last.t, targetTimeframe) - step

    if ohlcStorer.IsEmpty(symbol, targetTimeframe):
        startExtendTs = (
            src_first.t
            if (src_first.t // step == 0)
            else _timestamp_floor(src_first.t, targetTimeframe) + step
        )
    else:
        target_last = ohlcStorer.getLastOhlc(symbol, targetTimeframe)
        if target_last is None:
            logger.error(
                _SECTION,
                f"Failed to read target OHLC bounds for {symbol}/{targetTimeframe}.",
            )
            return False

        startExtendTs = _timestamp_floor(target_last.t, targetTimeframe) + step

        if _has_overlap(
            _timestamp_floor(
                ohlcStorer.getFirstOhlc(symbol, targetTimeframe).t,
                targetTimeframe,
            )
            if not ohlcStorer.IsEmpty(symbol, targetTimeframe)
            else None,
            _timestamp_floor(target_last.t, targetTimeframe),
            startExtendTs,
            endExtendTs,
        ):
            logger.error(
                _SECTION,
                f"Overlap detected while extending front for "
                f"{symbol}/{targetTimeframe}. "
                f"start={startExtendTs}, end={endExtendTs}.",
            )
            return False

    if endExtendTs < startExtendTs:
        _log_noop(symbol, targetTimeframe, "front")
        return True

    periods = _build_periods(
        startExtendTs,
        endExtendTs,
        targetTimeframe,
    )

    if not periods:
        _log_noop(symbol, targetTimeframe, "front")
        return True

    total_target_bars = len(periods)
    src_per_target = (
        TIMESTAMP_MAP[targetTimeframe]
        // TIMESTAMP_MAP[srcTimeframe]
    )

    total_src_bars = 0

    with tqdm(
        total=total_target_bars,
        desc=f"{symbol} {targetTimeframe} front",
        unit="bar",
        leave=False,
    ) as pbar:

        for batchStart in range(
            0,
            total_target_bars,
            config.OHLC_BATCH_LIMIT,
        ):
            batch_periods = periods[
                batchStart:
                min(
                    total_target_bars,
                    batchStart + config.OHLC_BATCH_LIMIT,
                )
            ]

            batch = _aggregate_periods(
                symbol,
                srcTimeframe,
                batch_periods,
            )

            if batch is None:
                logger.error(
                    _SECTION,
                    f"Failed to aggregate front batch for "
                    f"{symbol}/{targetTimeframe} "
                    f"from {batch_periods[0][0]} "
                    f"to {batch_periods[-1][1]}.",
                )
                return False

            if len(batch) != len(batch_periods):
                logger.error(
                    _SECTION,
                    f"Aggregate size mismatch for "
                    f"{symbol}/{targetTimeframe} front batch: "
                    f"expected={len(batch_periods)}, "
                    f"got={len(batch)}.",
                )
                return False

            if not ohlcStorer.appendOhlcs(
                symbol,
                targetTimeframe,
                batch,
            ):
                logger.error(
                    _SECTION,
                    f"Failed to append front batch for "
                    f"{symbol}/{targetTimeframe} "
                    f"from {batch_periods[0][0]} "
                    f"to {batch_periods[-1][1]}.",
                )
                return False

            total_src_bars += len(batch_periods) * src_per_target

            pbar.update(len(batch_periods))

    logger.info(
        _SECTION,
        f"Extended: "
        f"{datetime.fromtimestamp(startExtendTs / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')} "
        f"-> "
        f"{datetime.fromtimestamp(endExtendTs / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')}"
        f" | "
        f"{total_src_bars:,} {srcTimeframe}-bars -> "
        f"{total_target_bars:,} {targetTimeframe}-bars"
    )

    return True


def extendBack(symbol: str, targetTimeframe: str) -> bool:
    """
    Extend OHLC data toward older timestamps by aggregating from the lower timeframe.
    """
    if not _validate_target_timeframe(targetTimeframe):
        return False

    srcTimeframe = _get_src_timeframe(targetTimeframe)

    if ohlcStorer.IsEmpty(symbol, srcTimeframe):
        logger.error(_SECTION, f"Source timeframe is empty for {symbol}/{srcTimeframe}.")
        return False

    src_first = ohlcStorer.getFirstOhlc(symbol, srcTimeframe)
    src_last = ohlcStorer.getLastOhlc(symbol, srcTimeframe)

    if src_first is None or src_last is None:
        logger.error(
            _SECTION,
            f"Failed to read source OHLC bounds for {symbol}/{srcTimeframe}.",
        )
        return False

    step = TIMESTAMP_MAP[targetTimeframe]

    startExtendTs = (
        src_first.t
        if (src_first.t // step == 0)
        else _timestamp_floor(src_first.t, targetTimeframe) + step
    )

    if ohlcStorer.IsEmpty(symbol, targetTimeframe):
        endExtendTs = _timestamp_floor(src_last.t, targetTimeframe) - step
    else:
        target_first = ohlcStorer.getFirstOhlc(symbol, targetTimeframe)

        if target_first is None:
            logger.error(
                _SECTION,
                f"Failed to read target OHLC bounds for "
                f"{symbol}/{targetTimeframe}.",
            )
            return False

        endExtendTs = (
            _timestamp_floor(target_first.t, targetTimeframe)
            - step
        )

        if _has_overlap(
            _timestamp_floor(target_first.t, targetTimeframe),
            _timestamp_floor(
                ohlcStorer.getLastOhlc(symbol, targetTimeframe).t,
                targetTimeframe,
            )
            if not ohlcStorer.IsEmpty(symbol, targetTimeframe)
            else None,
            startExtendTs,
            endExtendTs,
        ):
            logger.error(
                _SECTION,
                f"Overlap detected while extending back for "
                f"{symbol}/{targetTimeframe}. "
                f"start={startExtendTs}, end={endExtendTs}.",
            )
            return False

    if endExtendTs < startExtendTs:
        _log_noop(symbol, targetTimeframe, "back")
        return True

    periods = _build_periods(
        startExtendTs,
        endExtendTs,
        targetTimeframe,
    )

    if not periods:
        _log_noop(symbol, targetTimeframe, "back")
        return True

    total_target_bars = len(periods)

    src_per_target = (
        TIMESTAMP_MAP[targetTimeframe]
        // TIMESTAMP_MAP[srcTimeframe]
    )

    total_src_bars = 0

    with tqdm(
        total=total_target_bars,
        desc=f"{symbol} {targetTimeframe} back",
        unit="bar",
        leave=False,
    ) as pbar:

        for batchEnd in range(
            total_target_bars,
            0,
            -config.OHLC_BATCH_LIMIT,
        ):
            batch_start = max(
                0,
                batchEnd - config.OHLC_BATCH_LIMIT,
            )

            batch_periods = periods[batch_start:batchEnd]

            batch = _aggregate_periods(
                symbol,
                srcTimeframe,
                batch_periods,
            )

            if batch is None:
                logger.error(
                    _SECTION,
                    f"Failed to aggregate back batch for "
                    f"{symbol}/{targetTimeframe} "
                    f"from {batch_periods[0][0]} "
                    f"to {batch_periods[-1][1]}.",
                )
                return False

            if len(batch) != len(batch_periods):
                logger.error(
                    _SECTION,
                    f"Aggregate size mismatch for "
                    f"{symbol}/{targetTimeframe} back batch: "
                    f"expected={len(batch_periods)}, "
                    f"got={len(batch)}.",
                )
                return False

            if not ohlcStorer.prependOhlcs(
                symbol,
                targetTimeframe,
                batch,
            ):
                logger.error(
                    _SECTION,
                    f"Failed to prepend back batch for "
                    f"{symbol}/{targetTimeframe} "
                    f"from {batch_periods[0][0]} "
                    f"to {batch_periods[-1][1]}.",
                )
                return False

            total_src_bars += len(batch_periods) * src_per_target

            pbar.update(len(batch_periods))

    logger.info(
        _SECTION,
        f"Extended: "
        f"{datetime.fromtimestamp(startExtendTs / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')} "
        f"-> "
        f"{datetime.fromtimestamp(endExtendTs / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')}"
        f" | "
        f"from {total_src_bars:,} {srcTimeframe}-bars -> "
        f"{total_target_bars:,} {targetTimeframe} bars"
    )

    return True



__all__ = [
    "TIMEFRAME_MAP",
    "TIMESTAMP_MAP",
    "extendFront",
    "extendBack",
]
