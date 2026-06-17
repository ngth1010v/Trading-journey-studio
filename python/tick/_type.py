from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Tick:
    timestamp: int
    bid: int
    ask: int
    volume: int


@dataclass(slots=True)
class TickRequest:
    caller: str = ""
    symbol: str = ""
    extendType: str = "back"  # "back" | "front"
    fromTs: int = 0
