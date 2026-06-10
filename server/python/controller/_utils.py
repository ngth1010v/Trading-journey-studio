from __future__ import annotations

from dataclasses import is_dataclass
from datetime import datetime, timezone
from typing import Any, Iterable


def utc_now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def datetime_to_utc_ts(value: datetime) -> int:
    if value.tzinfo is None:
        return int(value.replace(tzinfo=timezone.utc).timestamp())
    return int(value.astimezone(timezone.utc).timestamp())


def ts_to_utc_naive_datetime(value: int) -> datetime:
    return datetime.fromtimestamp(int(value), tz=timezone.utc).replace(tzinfo=None)


def timeframe_to_seconds(timeframe: int) -> int:
    tf = int(timeframe)
    if tf <= 0:
        raise ValueError("timeframe must be > 0")
    return tf * 60


def floor_ts_to_timeframe(ts: int, timeframe: int) -> int:
    sec = timeframe_to_seconds(timeframe)
    return (int(ts) // sec) * sec


def maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return value
    return value


async def call_first_async(obj: Any, names: Iterable[str], *args: Any, **kwargs: Any) -> Any:
    last_type_error: TypeError | None = None
    for name in names:
        fn = getattr(obj, name, None)
        if fn is None:
            continue
        try:
            result = fn(*args, **kwargs)
            if hasattr(result, "__await__"):
                return await result
            return result
        except TypeError as exc:
            last_type_error = exc
            continue
    if last_type_error is not None:
        raise last_type_error
    raise AttributeError(f"None of these callables exist on {obj!r}: {', '.join(names)}")


def tick_signature(tick: Any) -> tuple[Any, Any, Any, Any]:
    return (
        getattr(tick, "timestamp", None),
        getattr(tick, "bid", None),
        getattr(tick, "ask", None),
        getattr(tick, "volume", None),
    )


def is_dataclass_instance(value: Any) -> bool:
    return is_dataclass(value) and not isinstance(value, type)