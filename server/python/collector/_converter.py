from __future__ import annotations

from dataclasses import is_dataclass
from datetime import datetime
from typing import Iterable, Sequence

from ._datetime_utils import ts_to_utc_datetime
from ._price_utils import float_point_to_int_scale, real_price_to_int
from ._types import Tick, SymbolData


def convert_tick_row(row, point: int) -> Tick:
    ts = ts_to_utc_datetime(int(row["time"]))
    bid = real_price_to_int(float(row["bid"]), point)
    ask = real_price_to_int(float(row["ask"]), point)
    volume = int(row["volume"])
    return Tick(timestamp=ts, bid=bid, ask=ask, volume=volume)


def convert_ticks(rows, point: int) -> list[Tick]:
    if rows is None:
        return []
    return [convert_tick_row(row, point) for row in rows]


def symbol_point_to_int(point_value: float) -> int:
    return float_point_to_int_scale(float(point_value))


def convert_symbol_info(info) -> SymbolData | None:
    if info is None:
        return None
    symbol = getattr(info, "name", None)
    point = getattr(info, "point", None)
    if not symbol:
        return None
    if point is None:
        point = 1
    return SymbolData(symbol=str(symbol), point=symbol_point_to_int(point))
