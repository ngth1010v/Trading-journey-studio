from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Symbol:
    symbol  : str
    point   : int

    ask     : int = None
    bid     : int = None
