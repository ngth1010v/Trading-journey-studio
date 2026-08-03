from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Symbol:
    symbol       : str
    point        : int
    contractSize : float
    currency     : str
    watching     : bool = False

    ask          : int = None
    bid          : int = None