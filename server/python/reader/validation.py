from __future__ import annotations

from dataclasses import is_dataclass
from datetime import datetime, timezone
from typing import Any

from type import Ohlc, SymbolData, Tick


class ValidationError(ValueError):
    pass


def _require_dataclass(row: Any, expected_type: type, kind: str) -> Any:
    if not is_dataclass(row) or not isinstance(row, expected_type):
        raise ValidationError(f"{kind} must be a {expected_type.__name__} dataclass instance")
    return row


def normalize_symbol(symbol: Any) -> str:
    value = str(symbol).strip()
    if not value:
        raise ValidationError("symbol cannot be empty")
    if any(ch in value for ch in ("\\", "/")):
        raise ValidationError("symbol contains invalid path characters")
    return value


def normalize_timeframe(value: Any) -> int:
    try:
        timeframe = int(value)
    except Exception as exc:  # pragma: no cover - defensive
        raise ValidationError("timeframe must be an integer") from exc
    if timeframe < 0:
        raise ValidationError("timeframe must be >= 0")
    return timeframe


def normalize_datetime(value: Any, field_name: str, kind: str) -> datetime:
    if not isinstance(value, datetime):
        raise ValidationError(f"{kind}.{field_name} must be a datetime instance")
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def timestamp_to_datetime(value: int) -> datetime:
    try:
        ts = int(value)
    except Exception as exc:  # pragma: no cover - defensive
        raise ValidationError("timestamp must be an integer") from exc

    if abs(ts) >= 10**12:
        seconds = ts / 1000.0
    else:
        seconds = float(ts)

    return datetime.fromtimestamp(seconds, tz=timezone.utc).replace(tzinfo=None)


def normalize_tick_row(row: Any) -> Tick:
    row = _require_dataclass(row, Tick, "Tick")
    return Tick(
        symbol=normalize_symbol(row.symbol),
        timestamp=normalize_datetime(row.timestamp, "timestamp", "Tick"),
        bid=int(row.bid),
        ask=int(row.ask),
        volume=int(row.volume),
    )


def normalize_ohlc_row(row: Any) -> Ohlc:
    row = _require_dataclass(row, Ohlc, "Ohlc")
    return Ohlc(
        symbol=normalize_symbol(row.symbol),
        timeframe=normalize_timeframe(row.timeframe),
        openTimestamp=normalize_datetime(row.openTimestamp, "openTimestamp", "Ohlc"),
        open=int(row.open),
        high=int(row.high),
        low=int(row.low),
        close=int(row.close),
        volume=int(row.volume),
    )


def normalize_symbol_data_row(row: Any) -> SymbolData:
    row = _require_dataclass(row, SymbolData, "SymbolData")
    return SymbolData(symbol=normalize_symbol(row.symbol), point=int(row.point))


def ensure_non_empty_rows(rows: list[Any], kind: str) -> list[Any]:
    if not rows:
        raise ValidationError(f"{kind} rows cannot be empty")
    return rows


def normalize_range_timestamps(from_value: Any, to_value: Any, kind: str) -> tuple[datetime, datetime]:
    from_dt = timestamp_to_datetime(from_value)
    to_dt = timestamp_to_datetime(to_value)
    if from_dt >= to_dt:
        raise ValidationError(f"{kind} range is empty: from must be smaller than to")
    return from_dt, to_dt


def normalize_range_datetimes(from_value: Any, to_value: Any, kind: str) -> tuple[datetime, datetime]:
    from_dt = normalize_datetime(from_value, "from", kind)
    to_dt = normalize_datetime(to_value, "to", kind)
    if from_dt >= to_dt:
        raise ValidationError(f"{kind} range is empty: from must be smaller than to")
    return from_dt, to_dt
