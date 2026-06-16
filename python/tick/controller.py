from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5
import requests

import _logger as logger
import config

from . import _reader, _writer
from ._collector import _convert_mt5_ticks
from ._type import TickRequest

_SECTION = "tick/controller.py"


@dataclass(slots=True)
class Task:
    symbol: str
    fromTs: int
    toTs: int


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _point_from_symbols(symbol: str) -> float | None:
    """
    Try the app's symbol registry first, then MT5 directly.
    """
    try:
        import symbols  # type: ignore

        # Preferred path mentioned by the user.
        try:
            reader = getattr(symbols, "_reader", None)
            if reader is not None:
                info = reader.getSymbol(symbol)
                point = float(getattr(info, "point", 0.0) or 0.0)
                if point > 0.0:
                    return point
        except Exception:
            pass

        try:
            symbols_mod = getattr(symbols, "symbols", None)
            if symbols_mod is not None:
                reader = getattr(symbols_mod, "_reader", None)
                if reader is not None:
                    info = reader.getSymbol(symbol)
                    point = float(getattr(info, "point", 0.0) or 0.0)
                    if point > 0.0:
                        return point
        except Exception:
            pass

    except Exception:
        pass

    try:
        info = mt5.symbol_info(symbol)
        if info is None:
            return None
        point = float(getattr(info, "point", 0.0) or 0.0)
        return point if point > 0.0 else None
    except Exception:
        return None


def _validate_request(request: Any) -> bool:
    if not isinstance(request, TickRequest):
        logger.warning(_SECTION, f"invalid request type: {type(request)!r}")
        return False

    if not request.symbol or not request.symbol.strip():
        logger.warning(_SECTION, "request.symbol is empty.")
        return False

    if request.extendType not in {"back", "front"}:
        logger.warning(_SECTION, f"invalid extendType: {request.extendType!r}")
        return False

    if request.extendType == "back" and int(request.fromTs) == 0:
        logger.warning(_SECTION, "back request requires a valid fromTs.")
        return False

    symbol = request.symbol.strip()
    try:
        if mt5.symbol_info(symbol) is None:
            logger.warning(_SECTION, f"symbol not found in MT5: {symbol}")
            return False
    except Exception as exc:
        logger.warning(_SECTION, f"cannot validate symbol '{symbol}': {exc}")
        return False

    return True


def _notify_done(caller: str, payload: dict[str, int | str]) -> None:
    if not caller:
        return

    def _send() -> None:
        try:
            requests.post(caller, json=payload, timeout=1)
        except Exception as exc:
            logger.debug(_SECTION, f"notify failed for '{caller}': {exc}")

    threading.Thread(target=_send, daemon=True).start()


def _fetch_back(symbol: str, caller: str, from_ts: int, point: float) -> None:
    available_from_ts = _reader.getFirstTick(symbol)
    if available_from_ts is False:
        available_from_ms = _now_ms()
    else:
        available_from_ms = int(available_from_ts.timestamp)

    request_limit = int(getattr(config, "TICK_BATCH_LIMIT", 1000))

    while from_ts < available_from_ms:
        try:
            fetch_from = datetime.fromtimestamp((available_from_ms / 1000.0) - 1.0, tz=timezone.utc)
            raw_ticks = mt5.copy_ticks_from(symbol, fetch_from, request_limit, mt5.COPY_TICKS_ALL)
        except Exception as exc:
            logger.error(_SECTION, f"copy_ticks_from failed for '{symbol}': {exc}")
            break

        if raw_ticks is None or len(raw_ticks) == 0:
            logger.warning(_SECTION, f"no more back ticks for '{symbol}'.")
            break

        ticks = _convert_mt5_ticks(symbol, raw_ticks)
        if not ticks:
            logger.warning(_SECTION, f"conversion produced no ticks for '{symbol}'.")
            break

        if ticks[0].timestamp >= available_from_ms:
            logger.warning(_SECTION, f"backfill made no progress for '{symbol}'.")
            break

        _writer.set_active_symbol(symbol)
        try:
            if not _writer.prependTicks(ticks):
                break
        finally:
            _writer.set_active_symbol(None)

        _notify_done(
            caller,
            {
                "type": "done-load-tick",
                "fromTs": int(ticks[0].timestamp),
                "toTs": int(available_from_ms),
            },
        )

        available_from_ms = int(ticks[0].timestamp)


def _fetch_front(symbol: str, caller: str, point: float) -> None:
    current_ts = _now_ms()
    available_to_ms = _reader.getLastTick(symbol)
    if available_to_ms is False:
        available_to_ms = _now_ms()
    else:
        available_to_ms = int(available_to_ms.timestamp)

    request_limit_ms = int(getattr(config, "TICK_DURATION_LIMIT", 2000000))
    batch_limit = int(getattr(config, "TICK_BATCH_LIMIT", 1000))

    while available_to_ms < current_ts:
        try:
            fetch_from = datetime.fromtimestamp(available_to_ms / 1000.0, tz=timezone.utc)
            fetch_to = datetime.fromtimestamp((available_to_ms + request_limit_ms) / 1000.0, tz=timezone.utc)
            raw_ticks = mt5.copy_ticks_range(symbol, fetch_from, fetch_to, mt5.COPY_TICKS_ALL)
        except Exception as exc:
            logger.error(_SECTION, f"copy_ticks_range failed for '{symbol}': {exc}")
            break

        if raw_ticks is None or len(raw_ticks) == 0:
            break

        ticks = _convert_mt5_ticks(symbol, raw_ticks)
        if not ticks:
            break

        if ticks[-1].timestamp <= available_to_ms:
            logger.warning(_SECTION, f"frontfill made no progress for '{symbol}'.")
            break

        _writer.set_active_symbol(symbol)
        try:
            if not _writer.appendTicks(ticks):
                break
        finally:
            _writer.set_active_symbol(None)

        _notify_done(
            caller,
            {
                "type": "done-load-tick",
                "fromTs": int(available_to_ms),
                "toTs": int(ticks[-1].timestamp),
            },
        )

        available_to_ms = int(ticks[-1].timestamp)

        if len(ticks) < batch_limit:
            # The MT5 range has likely reached the latest available tick in this window.
            # Keep looping until we catch up to real time or MT5 stops producing new data.
            pass


def controller(requestQueue):
    """
    Independent worker thread.
    """
    logger.info(_SECTION, "tick controller started.")

    while True:
        try:
            request = requestQueue.get()
        except Exception as exc:
            logger.error(_SECTION, f"requestQueue.get failed: {exc}")
            continue

        if request == "SHUTDOWN":
            logger.info(_SECTION, "tick controller received SHUTDOWN.")
            break

        if not _validate_request(request):
            continue

        symbol = request.symbol.strip()
        point = _point_from_symbols(symbol)
        if point is None:
            logger.warning(_SECTION, f"cannot resolve point for '{symbol}'.")
            continue

        try:
            if request.extendType == "back":
                _fetch_back(symbol, caller=request.caller, from_ts=int(request.fromTs), point=point)
            elif request.extendType == "front":
                _fetch_front(symbol, caller=request.caller, point=point)
        except Exception as exc:
            logger.error(_SECTION, f"controller failed for '{symbol}': {exc}")

    logger.info(_SECTION, "tick controller stopped.")
