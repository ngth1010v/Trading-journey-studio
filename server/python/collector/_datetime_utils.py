from __future__ import annotations

from datetime import datetime, timezone

UTC = timezone.utc


def ts_to_utc_datetime(ts: int) -> datetime:
    return datetime.fromtimestamp(int(ts), tz=UTC).replace(tzinfo=None)


def utc_datetime_to_mt5(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def ts_range_to_utc(from_ts: int, to_ts: int) -> tuple[datetime, datetime]:
    return ts_to_utc_datetime(from_ts), ts_to_utc_datetime(to_ts)
