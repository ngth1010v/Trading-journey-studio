from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class AggregatePeriod:
    fromTs: int
    toTs  : int
