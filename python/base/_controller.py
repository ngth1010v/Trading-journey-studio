from __future__ import annotations

import queue
import threading
from dataclasses import asdict
from typing import Any

import _logger as logger

from . import _baseBuilder, _ohlcBuilder
from ._type import ExtendRequest
from _type import Ohlc

_SECTION = "base/_controller.py"

requestQueue: queue.Queue[Any] = queue.Queue()
_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _handle_request(item: Any) -> None:
    if item == "SHUTDOWN":
        _stop_event.set()
        return

    if not isinstance(item, ExtendRequest):
        logger.warning(_SECTION, f"Ignoring invalid queue item: {type(item)!r}")
        return

    req = item
    req.caller = (req.caller or "").strip()
    req.symbol = (req.symbol or "").strip()
    req.extendType = (req.extendType or "").strip().lower()

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

    source_bounds = _baseBuilder.extend(req)
    _ohlcBuilder.extend_all(req.symbol, req.extendType, source_bounds=source_bounds)


def _worker() -> None:
    logger.info(_SECTION, "Controller thread started.")
    while not _stop_event.is_set():
        try:
            item = requestQueue.get()
            try:
                _handle_request(item)
            finally:
                requestQueue.task_done()
            if item == "SHUTDOWN":
                break
        except Exception as exc:
            logger.error(_SECTION, f"Controller loop error: {exc}")
    logger.info(_SECTION, "Controller thread stopped.")


def start() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return

    _stop_event.clear()
    _baseBuilder.init()
    _thread = threading.Thread(target=_worker, daemon=True)
    _thread.start()


def stop() -> None:
    _stop_event.set()
    requestQueue.put("SHUTDOWN")


def enqueue(request: ExtendRequest) -> None:
    requestQueue.put(request)


def serialize_ohlc(ohlc: Ohlc) -> dict[str, Any]:
    return asdict(ohlc)
