from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5

import _logger as logger

from ._type import Tick

_SECTION = "tick/_collector.py"


def _to_utc_datetime(timestamp_ms: int) -> datetime:
    return datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc)


def _symbol_point(symbol: str) -> float:
    info = mt5.symbol_info(symbol)
    if info is None:
        raise RuntimeError(f"symbol info not found: {symbol}")

    point = float(getattr(info, "point", 0.0) or 0.0)
    if point <= 0.0:
        point = 1.0
    return point


def _read_tick_time_ms(raw: Any) -> int:
    time_msc = getattr(raw, "time_msc", None)
    if time_msc is not None:
        return int(time_msc)

    time_sec = getattr(raw, "time", None)
    if time_sec is not None:
        return int(time_sec) * 1000

    return 0


def _read_volume(raw: Any) -> int:
    volume_real = getattr(raw, "volume_real", None)
    if volume_real is not None:
        try:
            return int(round(float(volume_real)))
        except Exception:
            pass

    try:
        return int(getattr(raw, "volume", 0) or 0)
    except Exception:
        return 0


def _convert_mt5_ticks(symbol: str, ticks: Any) -> list[Tick]:
    point = _symbol_point(symbol)

    result: list[Tick] = []
    for raw in ticks:
        bid = int(round(float(getattr(raw, "bid", 0.0) or 0.0) * point))
        ask = int(round(float(getattr(raw, "ask", 0.0) or 0.0) * point))
        result.append(
            Tick(
                timestamp=_read_tick_time_ms(raw),
                bid=bid,
                ask=ask,
                volume=_read_volume(raw),
            )
        )

    result.sort(key=lambda tick: (tick.timestamp, tick.bid, tick.ask, tick.volume))
    return result


def getTicksFromMt5(symbol: str, fromTs: int, toTs: int):
    """
    Blocking MT5 tick loader.

    Returns:
        list[Tick] on success/no data
        False on error
    """
    section = _SECTION

    try:
        if not symbol or not symbol.strip():
            logger.error(section, "getTicksFromMt5: symbol is empty.")
            return False

        if fromTs > toTs:
            logger.error(section, f"getTicksFromMt5: invalid time range: fromTs={fromTs}, toTs={toTs}")
            return False

        try:
            point = _symbol_point(symbol)
        except Exception as exc:
            logger.error(section, f"getTicksFromMt5: cannot resolve symbol point for '{symbol}': {exc}")
            return False

        date_from = _to_utc_datetime(fromTs)
        date_to = _to_utc_datetime(toTs)

        raw_ticks = mt5.copy_ticks_range(symbol, date_from, date_to, mt5.COPY_TICKS_ALL)
        if raw_ticks is None:
            logger.warning(section, f"getTicksFromMt5: MT5 returned None for '{symbol}' ({fromTs} -> {toTs}).")
            return []

        if len(raw_ticks) == 0:
            return []

        result: list[Tick] = []
        for raw in raw_ticks:
            result.append(
                Tick(
                    timestamp=_read_tick_time_ms(raw),
                    bid=int(round(float(getattr(raw, "bid", 0.0) or 0.0) * point)),
                    ask=int(round(float(getattr(raw, "ask", 0.0) or 0.0) * point)),
                    volume=_read_volume(raw),
                )
            )

        result.sort(key=lambda tick: (tick.timestamp, tick.bid, tick.ask, tick.volume))
        return result

    except Exception as exc:
        logger.error(section, f"getTicksFromMt5 failed: {exc}")
        return False
