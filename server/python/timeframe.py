from __future__ import annotations

import re
from dataclasses import dataclass

_TIMEFRAME_RE = re.compile(r"^([1-9][0-9]*)(S|M|H|D|W|MN|Y)$")


@dataclass(slots=True)
class TimeframeRule:
    raw: str
    value: int
    suffix: str
    seconds: int


class TimeframeError(ValueError):
    pass


def parse_timeframe(value: str) -> TimeframeRule:
    if not value or value.strip() != value:
        raise TimeframeError("timeframe must be a trimmed uppercase string")
    if value != value.upper():
        raise TimeframeError("timeframe must be uppercase")

    match = _TIMEFRAME_RE.fullmatch(value)
    if not match:
        raise TimeframeError("invalid timeframe format")

    amount = int(match.group(1))
    suffix = match.group(2)
    if amount <= 0:
        raise TimeframeError("timeframe must be positive")

    if suffix == "S":
        seconds = amount
    elif suffix == "M":
        seconds = amount * 60
    elif suffix == "H":
        seconds = amount * 3600
    elif suffix == "D":
        seconds = amount * 86400
    elif suffix == "W":
        seconds = amount * 7 * 86400
    elif suffix == "MN":
        seconds = amount * 30 * 86400
    elif suffix == "Y":
        seconds = amount * 365 * 86400
    else:
        raise TimeframeError("unsupported timeframe suffix")

    return TimeframeRule(raw=value, value=amount, suffix=suffix, seconds=seconds)


def align_floor(timestamp: int, step_seconds: int) -> int:
    if step_seconds <= 0:
        raise TimeframeError("step_seconds must be positive")
    return (timestamp // step_seconds) * step_seconds


def build_range(
    *,
    timeframe_seconds: int,
    from_ts: int | None,
    to_ts: int | None,
    limit: int | None,
) -> tuple[int, int]:
    if (from_ts is not None and from_ts < 0) or (to_ts is not None and to_ts < 0):
        raise TimeframeError("timestamps must be non-negative")
    if limit is not None and limit <= 0:
        raise TimeframeError("limit must be positive")

    has_from = from_ts is not None
    has_to = to_ts is not None
    has_limit = limit is not None

    if has_from and has_to:
        if from_ts >= to_ts:
            raise TimeframeError("from must be lower than to")
        start = align_floor(from_ts, timeframe_seconds)
        end = align_floor(to_ts, timeframe_seconds)
    elif has_from and has_limit:
        start = align_floor(from_ts, timeframe_seconds)
        end = start + (timeframe_seconds * limit)
    elif has_to and has_limit:
        end = align_floor(to_ts, timeframe_seconds)
        start = end - (timeframe_seconds * limit)
        if start < 0:
            start = 0
    else:
        raise TimeframeError("use from+to, from+limit, or to+limit")

    if end <= start:
        raise TimeframeError("requested range is empty")

    return start, end
