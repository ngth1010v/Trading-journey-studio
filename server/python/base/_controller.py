# server/python/base/_controller.py
from __future__ import annotations

import queue
import threading
import uuid
from dataclasses import asdict
from typing import Any

import _logger as logger

from . import _baseBuilder, _ohlcBuilder
from ._type import ExtendRequest
from _type import Ohlc

_SECTION = "base/_controller.py"

requestQueue: queue.Queue[Any] = queue.Queue()
_request_thread: threading.Thread | None = None
_auto_thread: threading.Thread | None = None
_stop_event = threading.Event()

_state_lock = threading.RLock()
_pending_requests: set[tuple[str, str]] = set()
autoRegisted: dict[str, set[str]] = {}


def _normalize_symbol(value: str) -> str:
    return (value or "").strip()


def _normalize_extend_type(value: str) -> str:
    return (value or "").strip().lower()


def _pending_key(symbol: str, extend_type: str) -> tuple[str, str]:
    return (_normalize_symbol(symbol), _normalize_extend_type(extend_type))


def has_pending_request(symbol: str, extendType: str) -> bool:
    symbol = _normalize_symbol(symbol)
    with _state_lock:
        return any((item_symbol == symbol and item_extend_type == extendType) for item_symbol, item_extend_type in _pending_requests)


def has_auto_registered(symbol: str) -> bool:
    symbol = _normalize_symbol(symbol)
    with _state_lock:
        return bool(autoRegisted.get(symbol))


def register_auto(symbol: str) -> int:
    symbol = _normalize_symbol(symbol)

    with _state_lock:
        ids = autoRegisted.setdefault(symbol, set())

        key = 1
        while True:
            if key not in ids:
                ids.add(key)
                return key
            key += 1

def unregister_auto(symbol: str, key: int) -> bool:
    symbol = _normalize_symbol(symbol)

    with _state_lock:
        ids = autoRegisted.get(symbol)
        if not ids or key not in ids:
            return False

        ids.remove(key)
        if not ids:
            del autoRegisted[symbol]
        return True


def _mark_pending(request: ExtendRequest) -> None:
    symbol = _normalize_symbol(request.symbol)
    extend_type = _normalize_extend_type(request.extendType)
    with _state_lock:
        _pending_requests.add((symbol, extend_type))


def _mark_completed(item: Any) -> None:
    if not isinstance(item, ExtendRequest):
        return

    symbol = _normalize_symbol(item.symbol)
    extend_type = _normalize_extend_type(item.extendType)
    with _state_lock:
        _pending_requests.discard((symbol, extend_type))


def _handle_request(item: Any) -> None:
    if item == "SHUTDOWN":
        _stop_event.set()
        return

    if not isinstance(item, ExtendRequest):
        logger.warning(_SECTION, f"Ignoring invalid queue item: {type(item)!r}")
        return

    req = item
    req.caller = (req.caller or "").strip()
    req.symbol = _normalize_symbol(req.symbol)
    req.extendType = _normalize_extend_type(req.extendType)

    if not req.symbol:
        logger.warning(_SECTION, "Rejected request with empty symbol.")
        return

    if req.extendType == "back":
        if req.fromTs <= 0:
            logger.warning(_SECTION, f"Rejected back request with invalid fromTs for {req.symbol!r}.")
            return
    elif req.extendType != "front":
        logger.warning(_SECTION, f"Rejected request with invalid extendType={req.extendType!r}.")
        return
    

    if req.extendType == "back":
        if _baseBuilder.extendBack(req.symbol, req.fromTs):
            if _ohlcBuilder.extendBack(req.symbol, "1M"):
                if _ohlcBuilder.extendBack(req.symbol, "1H"):
                    _ohlcBuilder.extendBack(req.symbol, "1D")
    else:
        if _baseBuilder.extendFront(req.symbol):
            if _ohlcBuilder.extendFront(req.symbol, "1M"):
                if _ohlcBuilder.extendFront(req.symbol, "1H"):
                    _ohlcBuilder.extendFront(req.symbol, "1D")


def _worker() -> None:
    logger.info(_SECTION, "Controller thread started.")
    while not _stop_event.is_set():
        try:
            item = requestQueue.get()
            try:
                _handle_request(item)
            finally:
                _mark_completed(item)
                requestQueue.task_done()
            if item == "SHUTDOWN":
                break
        except Exception as exc:
            logger.error(_SECTION, f"Controller loop error: {exc}")
    logger.info(_SECTION, "Controller thread stopped.")


def _auto_worker() -> None:
    logger.info(_SECTION, "Auto-extend worker started.")
    while not _stop_event.wait(1.0):
        try:
            with _state_lock:
                symbols = [symbol for symbol, ids in autoRegisted.items() if ids]

            for symbol in symbols:
                if _stop_event.is_set():
                    break

                with _state_lock:
                    if not autoRegisted.get(symbol):
                        continue
                    pending_key = (symbol, "front")
                    if pending_key in _pending_requests:
                        continue

                    _pending_requests.add(pending_key)

                requestQueue.put(
                    ExtendRequest(
                        caller="auto",
                        symbol=symbol,
                        extendType="front",
                        fromTs=0,
                    )
                )
        except Exception as exc:
            logger.error(_SECTION, f"Auto-extend loop error: {exc}")
    logger.info(_SECTION, "Auto-extend worker stopped.")


def start() -> None:
    global _request_thread, _auto_thread

    if (
        _request_thread is not None
        and _request_thread.is_alive()
        and _auto_thread is not None
        and _auto_thread.is_alive()
    ):
        return

    _stop_event.clear()
    _baseBuilder.init()

    if _request_thread is None or not _request_thread.is_alive():
        _request_thread = threading.Thread(target=_worker, daemon=True)
        _request_thread.start()

    if _auto_thread is None or not _auto_thread.is_alive():
        _auto_thread = threading.Thread(target=_auto_worker, daemon=True)
        _auto_thread.start()


def stop() -> None:
    _stop_event.set()
    requestQueue.put("SHUTDOWN")


def enqueue(request: ExtendRequest) -> None:
    req = ExtendRequest(
        caller=(request.caller or "").strip(),
        symbol=_normalize_symbol(request.symbol),
        extendType=_normalize_extend_type(request.extendType),
        fromTs=request.fromTs,
    )
    _mark_pending(req)
    requestQueue.put(req)


def serialize_ohlc(ohlc: Ohlc) -> dict[str, Any]:
    return asdict(ohlc)