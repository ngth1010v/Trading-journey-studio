import os
from pathlib import Path
import numpy as np

import config
import _logger
from . import _hotLastStorer, _coldStorer, _hotFirstStorer

_SECTION = "ohlcStorer"

# ==============================================================================
# LIFECYCLE MANAGEMENT
# ==============================================================================

def init() -> None:
    """Initializes background management loops for hot storers."""
    _hotFirstStorer.init()
    _hotLastStorer.init()


def shutdown() -> None:
    """Flushes active in-memory caches to disk cleanly."""
    _hotFirstStorer.shutdown()
    _hotLastStorer.shutdown()


# ==============================================================================
# READ QUERIES
# ==============================================================================

def getLast(symbol: str, timeframe: str) -> np.ndarray:
    """
    Returns the single newest active candle row by falling back through
    hot last, cold storage, and hot first storage levels sequentially.
    """
    # 1. Try Hot Last
    last = _hotLastStorer.getLast(symbol, timeframe)
    if last is not None and len(last) > 0:
        return np.atleast_2d(last)

    # 2. Try Cold Storage
    last = _coldStorer.getLast(symbol, timeframe)
    if last is not None and len(last) > 0:
        return np.atleast_2d(last)

    # 3. Try Hot First
    last = _hotFirstStorer.getLast(symbol, timeframe)
    if last is not None and len(last) > 0:
        return np.atleast_2d(last)

    return np.empty((0, 6), dtype=np.float64)


def getFirst(symbol: str, timeframe: str) -> np.ndarray:
    """
    Returns the single oldest active candle row by checking through
    hot first, cold storage, and hot last storage levels sequentially.
    """
    # 1. Try Hot First
    first = _hotFirstStorer.getFirst(symbol, timeframe)
    if first is not None and len(first) > 0:
        return np.atleast_2d(first)

    # 2. Try Cold Storage
    first = _coldStorer.getFirst(symbol, timeframe)
    if first is not None and len(first) > 0:
        return np.atleast_2d(first)

    # 3. Try Hot Last
    first = _hotLastStorer.getFirst(symbol, timeframe)
    if first is not None and len(first) > 0:
        return np.atleast_2d(first)

    return np.empty((0, 6), dtype=np.float64)


def getRange(symbol: str, timeframe: str, fromTs: float, toTs: float) -> np.ndarray:
    """
    Queries across all tiers and builds a single consolidated chronologically 
    sorted array containing metrics bounding [fromTs, toTs).
    """
    firstRange = _hotFirstStorer.getRange(symbol, timeframe, fromTs, toTs)
    midRange   = _coldStorer   .getRange(symbol, timeframe, fromTs, toTs)
    lastRange  = _hotLastStorer .getRange(symbol, timeframe, fromTs, toTs)

    results = []
    if firstRange is not None and len(firstRange) > 0:
        results.append(np.atleast_2d(firstRange))
    if midRange is not None and len(midRange) > 0:
        results.append(np.atleast_2d(midRange))
    if lastRange is not None and len(lastRange) > 0:
        results.append(np.atleast_2d(lastRange))

    if not results:
        return np.empty((0, 6), dtype=np.float64)

    # Concatenate all matching partitions together seamlessly
    return np.concatenate(results, axis=0)


def getAvailableSymbols() -> list[str]:
    """Scans and lists out unique asset names tracked under the candle database folder."""
    base_dir = (
        Path(config.DATABASE_PATH)
        / "chartData"
        / "candleChart"
        / "candles"
        if hasattr(config, "DATABASE_PATH")
        else Path("chartData/candleChart/candles")
    )
    if not base_dir.exists() or not base_dir.is_dir():
        return []

    return [d.name for d in base_dir.iterdir() if d.is_dir()]



# ==============================================================================
# AGGREGATE COMMANDS
# ==============================================================================
def aggregate(symbol: str, srcTimeframe: str, targetPeriods: list[tuple[float, float]]) -> list[list[float]]:
    """
    Aggregate source OHLC numpy array rows from `srcTimeframe` into requested target periods.
    Returns a nested list structure: [[t, o, h, l, c, v], ...] or [] if empty/invalid.
    """
    _SECTION = "ohlcStorer.py/aggregate"
    try:
        # 1. Calculate timeframe step delta in ms
        tf = str(srcTimeframe).strip().upper()
        mapping = {
            "1S": 1000,
            "1M": 1000 * 60,
            "1H": 1000 * 60 * 60,
            "1D": 1000 * 60 * 60 * 24,
        }
        if tf not in mapping:
            _logger.error(_SECTION, f"Unsupported timeframe: {srcTimeframe!r}")
            return []
        src_step_ms = mapping[tf]

        # 2. Validate and clean period inputs
        periods: list[tuple[float, float]] = []
        for period in targetPeriods or []:
            try:
                p_from, p_to = float(period[0]), float(period[1])
                if p_to > p_from:
                    periods.append((p_from, p_to))
            except (ValueError, TypeError, IndexError):
                continue

        if not periods:
            return []

        periods.sort(key=lambda item: (item[0], item[1]))

        # 3. Validate period boundary alignment with existing source data
        first_src = getFirst(symbol, srcTimeframe)
        last_src  = getLast(symbol, srcTimeframe)
        if first_src.size == 0 or last_src.size == 0:
            return []

        first_src_ts = float(first_src[0, 0])
        last_src_ts  = float(last_src[0, 0])
        
        source_first_boundary = first_src_ts
        source_last_boundary  = last_src_ts + src_step_ms

        # [FIX]: Only exclude periods that are COMPLETELY outside the bounds of the existing data.
        # This keeps the partially overlapping forming/recent candle so it doesn't get incorrectly omitted.
        valid_periods = []
        for p_from, p_to in periods:
            if p_from < source_last_boundary and p_to > source_first_boundary:
                valid_periods.append((p_from, p_to))
        
        periods = valid_periods

        if not periods:
            return []
        
        # 4. Extract target data segment using public range queries
        min_from = periods[0][0]
        max_to   = periods[-1][1]
        source_rows = getRange(symbol, srcTimeframe, min_from, max_to)

        if source_rows.size == 0:
            _logger.warning(_SECTION, f"Source rows missing in range {min_from}..{max_to}")
            return []

        # 5. Process continuous sequential aggregation
        result: list[list[float]] = []
        j = 0
        src_count = source_rows.shape[0]

        for period_from, period_to in periods:
            span_ms = period_to - period_from

            if span_ms % src_step_ms != 0:
                _logger.error(
                    _SECTION,
                    f"Period [{period_from}, {period_to}) unaligned to step {src_step_ms}ms",
                )
                continue  # Skip unaligned instead of crashing entire fetch

            valid_count = 0

            # [t, o, h, l, c, v]
            bar = [period_from, 0.0, 0.0, 0.0, 0.0, 0.0]

            while j < src_count and source_rows[j, 0] < period_from:
                j += 1

            while j < src_count and period_from <= source_rows[j, 0] < period_to:
                _, o, h, l, c, v = source_rows[j]

                # Ignore empty source bar
                if o == h == l == c == v == 0:
                    j += 1
                    continue

                if valid_count == 0:
                    bar[1] = float(o)
                    bar[2] = float(h)
                    bar[3] = float(l)
                    bar[4] = float(c)
                    bar[5] = float(v)
                else:
                    if float(h) > bar[2]:
                        bar[2] = float(h)
                    if float(l) < bar[3]:
                        bar[3] = float(l)
                    bar[4] = float(c)
                    bar[5] += float(v)

                valid_count += 1
                j += 1

            # [FIX]: Allow gaps! Don't crash out if matched_count != expected_count. 
            # If the period has valid trades inside it, we append it. Otherwise, we omit it 
            # so the chart doesn't plunge to 0.
            if valid_count > 0:
                result.append(bar)

        # 6. Perform simple chronological deduplication filter pass
        unique_result: list[list[float]] = []
        last_ts: float | None = None
        for ohlc in result:
            if last_ts == ohlc[0]:
                continue
            unique_result.append(ohlc)
            last_ts = ohlc[0]

        return unique_result

    except Exception as exc:
        _logger.error(_SECTION, f"Aggregation failed: {exc}")
        return []


# ==============================================================================
# WRITE COMMANDS
# ==============================================================================

def append(symbol: str, timeframe: str, data: np.ndarray) -> None:
    """
    Validates dimensional schema and pushes updates onward onto 
    the trailing right boundary hot-cache block safely.
    """
    # Force alignment into 2D structural numpy components safely
    np_data = np.atleast_2d(data).astype(np.float64)
    if np_data.shape[1] != 6:
        raise ValueError("Invalid OHLC block shape. Expected [N, 6] array framework layout.")

    _hotLastStorer.append(symbol, timeframe, np_data)


def prepend(symbol: str, timeframe: str, data: np.ndarray) -> None:

    """
    Validates dimensional schema and pushes updates backward onto 
    the leading left boundary hot-cache block safely.
    """
    # Force alignment into 2D structural numpy components safely
    np_data = np.atleast_2d(data).astype(np.float64)
    if np_data.shape[1] != 6:
        raise ValueError("Invalid OHLC block shape. Expected [N, 6] array framework layout.")

    _hotFirstStorer.prepend(symbol, timeframe, np_data)