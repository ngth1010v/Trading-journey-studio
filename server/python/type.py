from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class Tick:
    symbol: str
    timestamp: datetime
    bid: int
    ask: int
    volume: int


@dataclass(slots=True)
class Ohlc:
    symbol: str
    timeframe: int
    openTimestamp: datetime
    open: int
    high: int
    low: int
    close: int
    volume: int


@dataclass(slots=True)
class SymbolData:
    symbol: str
    point: int
