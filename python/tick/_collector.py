from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5

import _logger as logger
from ._type import Tick

_SECTION = "tick/_collector.py"


def _ms_to_dt(ts_ms: int) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _ticks_to_list(raw_ticks: Any) -> list[Tick]:
    result: list[Tick] = []
    if raw_ticks is None:
        return result

    try:
        for item in raw_ticks:
            timestamp = getattr(item, "time_msc", None)
            if timestamp is None:
                timestamp = _safe_int(getattr(item, "time", 0)) * 1000

            result.append(
                Tick(
                    timestamp=_safe_int(timestamp),
                    bid=_safe_int(getattr(item, "bid", 0)),
                    ask=_safe_int(getattr(item, "ask", 0)),
                    volume=_safe_int(getattr(item, "volume", 0)),
                )
            )
    except Exception as exc:
        logger.error(_SECTION, f"Failed to convert MT5 ticks: {exc}")
        return []

    return result


def getTicksFromMt5(symbol: str, fromTs: int, toTs: int):
    """
    Blocking MT5 fetch helper.

    Returns a list of Tick-like objects ordered by timestamp ascending.
    The function is intentionally tolerant and returns [] on no-data / error.
    """
    try:
        if not symbol:
            logger.warning(_SECTION, "Empty symbol passed to getTicksFromMt5().")
            return []

        if fromTs <= 0 or toTs <= 0:
            logger.warning(_SECTION, f"Invalid time range for {symbol}: fromTs={fromTs}, toTs={toTs}")
            return []

        if fromTs > toTs:
            fromTs, toTs = toTs, fromTs

        raw = mt5.copy_ticks_range(symbol, _ms_to_dt(fromTs), _ms_to_dt(toTs), mt5.COPY_TICKS_ALL)
        if raw is None or len(raw) == 0:
            return []

        ticks = _ticks_to_list(raw)
        ticks.sort(key=lambda t: t.timestamp)
        return ticks
    except Exception as exc:
        logger.error(_SECTION, f"getTicksFromMt5({symbol!r}, {fromTs}, {toTs}) failed: {exc}")
        return []
