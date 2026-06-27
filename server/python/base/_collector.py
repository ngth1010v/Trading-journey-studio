from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5
import numpy as np

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


def fetchTicksFromMt5(symbol: str, point: int, fromTs: int, toTs: int) -> np.ndarray:
    """
    Return numpy array:
        [
            [t:int64, b:int64, v:int64],
            ...
        ]

    where:
        t = UTC timestamp (ms)
        b = bid * point
        v = real volume
    """
    empty = np.empty((0, 3), dtype=np.int64)

    try:
        symbol = (symbol or "").strip()
        if not symbol:
            logger.warning(_SECTION, "Empty symbol passed to fetchTicksFromMt5().")
            return empty

        if fromTs <= 0 or toTs <= 0:
            logger.warning(
                _SECTION,
                f"Invalid range for {symbol!r}: fromTs={fromTs}, toTs={toTs}",
            )
            return empty

        if fromTs > toTs:
            fromTs, toTs = toTs, fromTs

        raw = mt5.copy_ticks_range(
            symbol,
            _ms_to_dt(_utc_ms_to_mt5_ms(fromTs)),
            _ms_to_dt(_utc_ms_to_mt5_ms(toTs)),
            mt5.COPY_TICKS_ALL,
        )

        if raw is None or len(raw) == 0:
            return empty

        names = raw.dtype.names or ()

        # timestamp
        if "time_msc" in names:
            t = raw["time_msc"].astype(np.int64)
        else:
            t = raw["time"].astype(np.int64) * 1000

        t -= _ensure_offset()

        # bid
        b = np.rint(raw["bid"].astype(np.float64) * point).astype(np.int64)

        # volume
        if "real_volume" in names:
            v = raw["real_volume"].astype(np.int64)
        elif "volume" in names:
            v = raw["volume"].astype(np.int64)
        else:
            v = np.zeros(len(raw), dtype=np.int64)

        # filter: fromTs <= t < toTs
        mask = (t >= fromTs) & (t < toTs)

        if not np.any(mask):
            return empty

        out = np.empty((mask.sum(), 3), dtype=np.int64)
        out[:, 0] = t[mask]
        out[:, 1] = b[mask]
        out[:, 2] = v[mask]

        # MT5 thường đã trả theo thời gian, nhưng đảm bảo chắc chắn
        if len(out) > 1:
            order = np.argsort(out[:, 0], kind="stable")
            out = out[order]

        return out

    except Exception as exc:
        logger.error(
            _SECTION,
            f"fetchTicksFromMt5({symbol!r}, {point}, {fromTs}, {toTs}) failed: {exc}",
        )
        return empty