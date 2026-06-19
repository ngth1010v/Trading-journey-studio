from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Iterable

from _type import Ohlc
import _logger as logger
import ohlcStorer

from ._timeframe import (
    align_timestamp_to_timeframe,
    build_target_periods,
    get_base_timeframe,
    is_valid_timeframe,
    normalize_timeframe,
    start_of_month_utc,
    start_of_week_utc,
    start_of_year_utc,
)

_SECTION = "ohlc/_controller.py"


def _parse_timestamp(raw_value: Any) -> int | None:
    try:
        if raw_value is None:
            return None
        if isinstance(raw_value, bool):
            return None
        return int(str(raw_value).strip())
    except Exception:
        return None


def _ohlc_to_dict(item: Any) -> dict[str, Any]:
    if item is None:
        return {}

    if isinstance(item, dict):
        return dict(item)

    if is_dataclass(item):
        return asdict(item)

    result: dict[str, Any] = {}
    for key in ("t", "o", "h", "l", "c", "v"):
        if hasattr(item, key):
            result[key] = getattr(item, key)
    return result


def _items_to_json(items: Iterable[Any]) -> list[dict[str, Any]]:
    return [_ohlc_to_dict(item) for item in items]


def _pick_price(item: Any) -> int | float | None:
    for key in ("bid", "c", "o", "h", "l"):
        if hasattr(item, key):
            value = getattr(item, key)
            if value is not None:
                return value
    if isinstance(item, dict):
        for key in ("bid", "c", "o", "h", "l"):
            value = item.get(key)
            if value is not None:
                return value
    return None


def _is_empty_result(result: Any) -> bool:
    if result is None:
        return True
    if isinstance(result, (list, tuple, set, dict)) and len(result) == 0:
        return True
    return False


def _error(message: str, code: int = 400):
    logger.warning(_SECTION, message)
    return {"status": "error", "msg": message, "code": code}, code


def _ok(data: Any, code: int = 200):
    return data, code


def _resolve_last_open_timestamp(target_timeframe: str, last_ts: int) -> int | None:
    tf = normalize_timeframe(target_timeframe)
    if not is_valid_timeframe(tf):
        return None

    unit = tf[-1] if tf[-2:] != "MN" else "MN"
    if tf.endswith("MN"):
        unit = "MN"
    elif tf.endswith("W"):
        unit = "W"
    elif tf.endswith("Y"):
        unit = "Y"

    if unit in {"S", "M", "H", "D"}:
        return align_timestamp_to_timeframe(last_ts, tf)
    if unit == "W":
        return start_of_week_utc(last_ts)
    if unit == "MN":
        return start_of_month_utc(last_ts)
    if unit == "Y":
        return start_of_year_utc(last_ts)
    return None


def get_ohlcs(symbol: str, timeframe: str, from_ts_raw: Any, to_ts_raw: Any):
    timeframe = normalize_timeframe(timeframe)
    if not is_valid_timeframe(timeframe):
        return _error(f"Invalid timeframe: {timeframe}")

    from_ts = _parse_timestamp(from_ts_raw)
    to_ts = _parse_timestamp(to_ts_raw)
    if from_ts is None or to_ts is None:
        return _error("fromTs and toTs are required integer timestamps.")
    if from_ts < 0 or to_ts < 0:
        return _error("fromTs and toTs must be non-negative.")
    if to_ts <= from_ts:
        return _error("toTs must be greater than fromTs.")

    base_timeframe = get_base_timeframe(timeframe)
    if base_timeframe is None:
        return _error(f"Unsupported timeframe: {timeframe}")

    try:
        if base_timeframe == timeframe:
            result = ohlcStorer.getOhlcs(symbol, timeframe, from_ts, to_ts)
        else:
            periods = build_target_periods(from_ts, to_ts, timeframe)
            if not periods:
                return _ok([])
            result = ohlcStorer.aggregateOhlcs(symbol, base_timeframe, periods)

        if _is_empty_result(result):
            return _ok([])

        return _ok(_items_to_json(result))
    except Exception as exc:
        logger.error(_SECTION, f"Failed to get OHLCs for {symbol}/{timeframe}: {exc}")
        return _error("Internal error while loading OHLC data.", 500)


def get_last_ohlc(symbol: str, timeframe: str):
    timeframe = normalize_timeframe(timeframe)
    if not is_valid_timeframe(timeframe):
        return _error(f"Invalid timeframe: {timeframe}")

    try:
        last_s1 = ohlcStorer.getLastOhlc(symbol, "1S")
        if last_s1 is None:
            return _ok([])

        last_ts = getattr(last_s1, "t", None)
        if last_ts is None:
            return _error("Invalid last 1S OHLC payload.")

        open_ts = _resolve_last_open_timestamp(timeframe, int(last_ts))
        if open_ts is None:
            return _error(f"Unable to resolve open timestamp for timeframe: {timeframe}")

        periods = [(open_ts, int(last_ts))]
        result = ohlcStorer.aggregateOhlcs(symbol, "1S", periods)

        if not _is_empty_result(result):
            first = result[0]
            payload = _ohlc_to_dict(first)
            if payload:
                return _ok(payload)

        price = _pick_price(last_s1)
        if price is None:
            return _ok([])

        fallback = Ohlc(t=open_ts, o=price, h=price, l=price, c=price, v=0)
        return _ok(_ohlc_to_dict(fallback))
    except Exception as exc:
        logger.error(_SECTION, f"Failed to get last OHLC for {symbol}/{timeframe}: {exc}")
        return _error("Internal error while loading last OHLC.", 500)


def shutdown_server():
    logger.info(_SECTION, "Shutdown requested.")
    try:
        logger.reset()
    except Exception:
        pass
    return True
