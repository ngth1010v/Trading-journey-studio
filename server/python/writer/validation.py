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


def _require_datetime(value: Any, field_name: str, kind: str) -> datetime:
    if not isinstance(value, datetime):
        raise ValidationError(f"{kind}.{field_name} must be a datetime instance")
    if value.tzinfo is None:
        return value
    if value.utcoffset() == timezone.utc.utcoffset(value):
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    raise ValidationError(f"{kind}.{field_name} must be naive or UTC datetime")


def ensure_non_empty_rows(rows: list[Any], kind: str) -> list[Any]:
    if not rows:
        raise ValidationError(f"{kind} rows cannot be empty")
    return rows


def normalize_tick_row(row: Any) -> Tick:
    row = _require_dataclass(row, Tick, "Tick")
    return Tick(
        timestamp=_require_datetime(row.timestamp, "timestamp", "Tick"),
        bid=int(row.bid),
        ask=int(row.ask),
        volume=int(row.volume),
    )


def normalize_ohlc_row(row: Any) -> Ohlc:
    row = _require_dataclass(row, Ohlc, "Ohlc")
    return Ohlc(
        openTimestamp=_require_datetime(row.openTimestamp, "openTimestamp", "Ohlc"),
        open=int(row.open),
        high=int(row.high),
        low=int(row.low),
        close=int(row.close),
        volume=int(row.volume),
    )


def normalize_symbol_data_row(row: Any) -> SymbolData:
    row = _require_dataclass(row, SymbolData, "SymbolData")
    return SymbolData(symbol=str(row.symbol), point=int(row.point))
