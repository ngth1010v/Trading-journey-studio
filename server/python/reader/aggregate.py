from __future__ import annotations

from datetime import datetime
from typing import Any

from type import Ohlc

from .logger import error
from .validation import ValidationError


def _rows_to_ohlc(
    symbol: str,
    timeframe: int,
    rows: list[tuple[Any, ...]],
) -> Ohlc | None:
    if not rows:
        error("no rows found")
        return None

    first = rows[0]
    last = rows[-1]

    open_ts = first[0]
    open_value = int(first[1])
    high_value = max(int(row[2]) for row in rows)
    low_value = min(int(row[3]) for row in rows)
    close_value = int(last[4])
    volume_value = sum(int(row[5]) for row in rows)

    if not isinstance(open_ts, datetime):
        raise ValidationError("unexpected timestamp value returned from database")

    return Ohlc(
        symbol=symbol,
        timeframe=int(timeframe),
        openTimestamp=open_ts,
        open=open_value,
        high=high_value,
        low=low_value,
        close=close_value,
        volume=volume_value,
    )


def aggregate_ticks_to_ohlc(symbol: str, rows: list[tuple[Any, ...]]) -> Ohlc | None:
    if not rows:
        error("no ticks found")
        return None

    first = rows[0]
    last = rows[-1]

    open_ts = first[0]
    open_value = int(first[1])
    high_value = max(int(row[1]) for row in rows)
    low_value = min(int(row[1]) for row in rows)
    close_value = int(last[1])
    volume_value = sum(int(row[3]) for row in rows)

    if not isinstance(open_ts, datetime):
        raise ValidationError("unexpected tick timestamp value returned from database")

    return Ohlc(
        symbol=symbol,
        timeframe=0,
        openTimestamp=open_ts,
        open=open_value,
        high=high_value,
        low=low_value,
        close=close_value,
        volume=volume_value,
    )


def aggregate_ohlc_rows(symbol: str, timeframe: int, rows: list[tuple[Any, ...]]) -> Ohlc | None:
    if not rows:
        error("no ohlc rows found")
        return None
    return _rows_to_ohlc(symbol, timeframe, rows)
