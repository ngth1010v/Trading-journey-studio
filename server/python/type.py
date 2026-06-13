from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Tick:
    timestamp: int
    bid: int
    ask: int
    volume: int


@dataclass(slots=True)
class Ohlc:
    openTimestamp: int
    open: int
    high: int
    low: int
    close: int
    volume: int


@dataclass(slots=True)
class SymbolData:
    symbol: str
    point: int
