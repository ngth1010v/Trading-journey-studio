from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5

import _logger as logger
from ._type import Tick

_SECTION = "base/_collector.py"

_MT5_SERVER_OFFSET_MS: int | None = None


def _ms_to_dt(ts_ms: int) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def init() -> int:
    """
    Cache the server-vs-UTC offset in milliseconds.

    The result is best-effort. If it cannot be determined, 0 is used.
    """
    global _MT5_SERVER_OFFSET_MS

    if _MT5_SERVER_OFFSET_MS is not None:
        return _MT5_SERVER_OFFSET_MS

    try:
        candidates = mt5.symbols_get() or []
        probe_symbol = ""
        for item in candidates:
            name = getattr(item, "name", "")
            if name:
                probe_symbol = str(name)
                break

        if not probe_symbol:
            _MT5_SERVER_OFFSET_MS = 0
            logger.warning(_SECTION, "No probe symbol found while initializing server offset. Using 0 ms.")
            return 0

        tick = mt5.symbol_info_tick(probe_symbol)
        if tick is None:
            _MT5_SERVER_OFFSET_MS = 0
            logger.warning(_SECTION, f"Could not read MT5 tick for {probe_symbol!r}. Using 0 ms.")
            return 0

        utc_now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        server_now_ms = _safe_int(getattr(tick, "time_msc", 0))
        _MT5_SERVER_OFFSET_MS = server_now_ms - utc_now_ms

        return _MT5_SERVER_OFFSET_MS
    except Exception as exc:
        _MT5_SERVER_OFFSET_MS = 0
        logger.warning(_SECTION, f"Failed to initialize server offset: {exc}. Using 0 ms.")
        return 0


def _ensure_offset() -> int:
    return init()


def _utc_ms_to_mt5_ms(utc_ms: int) -> int:
    return int(utc_ms + _ensure_offset())


def _mt5_ms_to_utc_ms(mt5_ms: Any) -> int:
    return int(_safe_int(mt5_ms)) - _ensure_offset()


def _raw_tick_to_tick(raw_tick: Any, point: int) -> Tick | None:
    try:
        if hasattr(raw_tick, "dtype") and getattr(raw_tick.dtype, "names", None):
            names = raw_tick.dtype.names or ()
            timestamp = raw_tick["time_msc"] if "time_msc" in names else None
            if timestamp is None:
                timestamp = _safe_int(raw_tick["time"]) * 1000

            bid = raw_tick["bid"] if "bid" in names else None
            ask = raw_tick["ask"] if "ask" in names else None
            if bid is None or ask is None:
                return None

            volume = 0
            if "real_volume" in names:
                volume = raw_tick["real_volume"]
            elif "volume" in names:
                volume = raw_tick["volume"]
        elif isinstance(raw_tick, dict):
            timestamp = raw_tick.get("time_msc")
            if timestamp is None:
                timestamp = _safe_int(raw_tick.get("time", 0)) * 1000

            bid = raw_tick.get("bid")
            ask = raw_tick.get("ask")
            if bid is None or ask is None:
                return None

            volume = raw_tick.get("real_volume", raw_tick.get("volume", 0))
        else:
            timestamp = getattr(raw_tick, "time_msc", None)
            if timestamp is None:
                timestamp = _safe_int(getattr(raw_tick, "time", 0)) * 1000

            bid = getattr(raw_tick, "bid", None)
            ask = getattr(raw_tick, "ask", None)
            if bid is None or ask is None:
                return None

            volume = getattr(raw_tick, "real_volume", getattr(raw_tick, "volume", 0))

        timestamp = _mt5_ms_to_utc_ms(timestamp)

        return Tick(
            t=int(timestamp),
            b=int(round(float(bid) * point)),
            a=int(round(float(ask) * point)),
            v=_safe_int(volume),
        )
    except Exception as exc:
        logger.error(_SECTION, f"Failed to convert raw tick: {exc}")
        return None


def fetchTicksFromMt5(symbol: str, point: int, fromTs: int, toTs: int) -> list[Tick]:
    """
    Return a list of UTC ticks that satisfy fromTs <= tick.t < toTs.
    """
    try:
        symbol = (symbol or "").strip()
        if not symbol:
            logger.warning(_SECTION, "Empty symbol passed to fetchTicksFromMt5().")
            return []

        if fromTs <= 0 or toTs <= 0:
            logger.warning(_SECTION, f"Invalid range for {symbol!r}: fromTs={fromTs}, toTs={toTs}")
            return []

        if fromTs > toTs:
            fromTs, toTs = toTs, fromTs

        raw = mt5.copy_ticks_range(
            symbol,
            _ms_to_dt(_utc_ms_to_mt5_ms(fromTs)),
            _ms_to_dt(_utc_ms_to_mt5_ms(toTs)),
            mt5.COPY_TICKS_ALL,
        )
        if raw is None or len(raw) == 0:
            return []

        out: list[Tick] = []
        for item in raw:
            tick = _raw_tick_to_tick(item, point)
            if tick is None:
                continue
            if fromTs <= tick.t < toTs:
                out.append(tick)

        out.sort(key=lambda t: t.t)
        return out
    except Exception as exc:
        logger.error(_SECTION, f"fetchTicksFromMt5({symbol!r}, {point}, {fromTs}, {toTs}) failed: {exc}")
        return []
