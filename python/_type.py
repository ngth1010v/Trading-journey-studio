
from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Ohlc:
    t: int
    o: int
    h: int
    l: int
    c: int
    v: int


@dataclass(slots=True)
class OhlcRequest:
    caller: str = ""
    symbol: str = ""
    timeframe: str = ""
    extendType: str = "back"  # "back" | "front"
    fromTs: int = 0
