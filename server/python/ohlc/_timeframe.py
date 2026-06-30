from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

TIMESTAMP_MAP = {
    "S": 1000,
    "M": 1000 * 60,
    "H": 1000 * 60 * 60,
    "D": 1000 * 60 * 60 * 24,
}

BASE_TIMEFRAMES = ("1S", "1M", "1H", "1D")

_TIMEFRAME_RE = re.compile(r"^(\d+)(S|M|H|D|W|MN|Y)$", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class TimeframeInfo:
    raw: str
    multiplier: int
    unit: str

    @property
    def normalized(self) -> str:
        return f"{self.multiplier}{self.unit}"


def normalize_timeframe(timeframe: str) -> str:
    return (timeframe or "").strip().upper()


def parse_timeframe(timeframe: str) -> TimeframeInfo | None:
    tf = normalize_timeframe(timeframe)
    match = _TIMEFRAME_RE.fullmatch(tf)
    if match is None:
        return None

    multiplier = int(match.group(1))
    unit = match.group(2).upper()
    if multiplier <= 0:
        return None
    return TimeframeInfo(raw=tf, multiplier=multiplier, unit=unit)


def is_valid_timeframe(timeframe: str) -> bool:
    return parse_timeframe(timeframe) is not None


def is_base_timeframe(timeframe: str) -> bool:
    return normalize_timeframe(timeframe) in BASE_TIMEFRAMES


def get_base_timeframe(timeframe: str) -> str | None:
    info = parse_timeframe(timeframe)
    if info is None:
        return None

    if info.unit == "S":
        return "1S"
    if info.unit == "M":
        return "1M"
    if info.unit == "H":
        return "1H"
    if info.unit == "D":
        return "1D"
    if info.unit in {"W", "MN", "Y"}:
        return "1D"
    return None


def timeframe_unit(timeframe: str) -> str | None:
    info = parse_timeframe(timeframe)
    return None if info is None else info.unit


def timeframe_milliseconds(timeframe: str) -> int | None:
    info = parse_timeframe(timeframe)
    if info is None:
        return None

    if info.unit not in TIMESTAMP_MAP:
        return None
    return info.multiplier * TIMESTAMP_MAP[info.unit]


def _floor_timestamp_by_ms(timestamp_ms: int, size_ms: int) -> int:
    return (timestamp_ms // size_ms) * size_ms


def _to_utc_datetime(timestamp_ms: int) -> datetime:
    return datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc)


def _to_timestamp_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def align_timestamp_to_timeframe(timestamp_ms: int, timeframe: str) -> int | None:
    info = parse_timeframe(timeframe)
    if info is None:
        return None

    if info.unit in TIMESTAMP_MAP:
        return _floor_timestamp_by_ms(timestamp_ms, info.multiplier * TIMESTAMP_MAP[info.unit])

    dt = _to_utc_datetime(timestamp_ms)

    if info.unit == "W":
        week_start = dt - timedelta(days=dt.weekday())
        aligned = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
        return _to_timestamp_ms(aligned)

    if info.unit == "MN":
        aligned = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
        return _to_timestamp_ms(aligned)

    if info.unit == "Y":
        aligned = datetime(dt.year, 1, 1, tzinfo=timezone.utc)
        return _to_timestamp_ms(aligned)

    return None


def get_next_period_open(open_timestamp_ms: int, timeframe: str) -> int | None:
    info = parse_timeframe(timeframe)
    if info is None:
        return None

    if info.unit in TIMESTAMP_MAP:
        return open_timestamp_ms + (info.multiplier * TIMESTAMP_MAP[info.unit])

    dt = _to_utc_datetime(open_timestamp_ms)
    if info.unit == "W":
        return _to_timestamp_ms(dt + timedelta(days=7 * info.multiplier))
    if info.unit == "MN":
        year = dt.year
        month = dt.month + info.multiplier
        year += (month - 1) // 12
        month = ((month - 1) % 12) + 1
        return _to_timestamp_ms(datetime(year, month, 1, tzinfo=timezone.utc))
    if info.unit == "Y":
        return _to_timestamp_ms(datetime(dt.year + info.multiplier, 1, 1, tzinfo=timezone.utc))
    return None


def build_target_periods(from_ts: int, to_ts: int, timeframe: str) -> list[tuple[int, int]]:
    """Build half-open periods [open, close) for a target timeframe in UTC."""
    periods: list[tuple[int, int]] = []
    aligned_open = align_timestamp_to_timeframe(from_ts, timeframe)
    if aligned_open is None:
        return periods

    current_open = aligned_open
    while current_open < to_ts:
        next_open = get_next_period_open(current_open, timeframe)
        print(next_open - current_open)
        if next_open is None:
            break
        periods.append((current_open, min(next_open, to_ts)))
        current_open = next_open
    return periods


def start_of_week_utc(timestamp_ms: int) -> int | None:
    return align_timestamp_to_timeframe(timestamp_ms, "1W")


def start_of_month_utc(timestamp_ms: int) -> int | None:
    return align_timestamp_to_timeframe(timestamp_ms, "1MN")


def start_of_year_utc(timestamp_ms: int) -> int | None:
    return align_timestamp_to_timeframe(timestamp_ms, "1Y")
