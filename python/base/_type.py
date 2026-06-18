from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Tick:
    t: int  # timestamp in UTC milliseconds
    b: int  # bid (scaled integer)
    a: int  # ask (scaled integer)
    v: int  # volume


@dataclass(slots=True)
class OhlcRequest:
    caller: str = ""
    symbol: str = ""
    timeframe: str = "1S"
    extendType: str = "back"  # "back" | "front"
    fromTs: int = 0
