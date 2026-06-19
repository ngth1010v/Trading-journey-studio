from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Tick:
    t: int  # timestamp in UTC milliseconds
    b: int  # bid (scaled integer)
    a: int  # ask (scaled integer)
    v: int  # volume


@dataclass(slots=True)
class ExtendRequest:
    caller: str = ""
    symbol: str = ""
    extendType: str = "back"  # "back" | "front"
    fromTs: int = 0


# Backward-compatible alias for older imports.
OhlcRequest = ExtendRequest
