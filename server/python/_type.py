
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
