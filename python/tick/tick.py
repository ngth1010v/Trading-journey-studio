from __future__ import annotations

import queue
import threading
from dataclasses import dataclass
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import _logger as logger
import config

from . import _reader
from .controller import controller
from ._type import TickRequest

bp = Blueprint("tick", __name__, url_prefix="/tick")

_SECTION = "tick/tick.py"

_REQUEST_QUEUE: queue.Queue | None = None
_CONTROLLER_THREAD: threading.Thread | None = None
_START_LOCK = threading.Lock()
_STARTED = False


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _request_queue() -> queue.Queue:
    global _REQUEST_QUEUE
    if _REQUEST_QUEUE is None:
        _REQUEST_QUEUE = queue.Queue()
    return _REQUEST_QUEUE


def init() -> None:
    global _STARTED, _CONTROLLER_THREAD

    with _START_LOCK:
        if _STARTED:
            return

        rq = _request_queue()
        _CONTROLLER_THREAD = threading.Thread(
            target=controller,
            args=(rq,),
            daemon=True,
            name="tick-controller",
        )
        _CONTROLLER_THREAD.start()
        _STARTED = True
        logger.info(_SECTION, "tick controller thread started.")


def _parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except Exception:
        return None


def _error(msg: str, code: int = 400):
    return jsonify({
        "status": "error",
        "msg": msg,
    }), code


@bp.route("/")
def index():
    return jsonify({
        "status": "ok",
        "msg": "This is tick"
    }), 200


@bp.route("/SHUTDOWN")
def shutdown():
    try:
        _request_queue().put("SHUTDOWN")
    except Exception as exc:
        logger.error(_SECTION, f"failed to queue SHUTDOWN: {exc}")

    return jsonify({
        "status": "ok",
        "msg": "tick shutdown"
    }), 200


@bp.route("")
def tick_route():
    caller = (request.args.get("caller") or "").strip()
    symbol = (request.args.get("symbol") or "").strip()

    from_ts = _parse_int(request.args.get("fromTs"))
    to_ts = _parse_int(request.args.get("toTs"))

    has_from = from_ts is not None
    has_to = to_ts is not None

    if has_from == has_to:
        return _error('provide exactly one of "fromTs" or "toTs"')

    if not symbol:
        return _error("symbol is required")

    if not caller:
        return _error("caller is required")

    if has_from and from_ts == 0:
        return _error("fromTs must be a valid ms timestamp")

    rq = _request_queue()

    if has_from:
        rq.put(TickRequest(
            caller=caller,
            symbol=symbol,
            extendType="back",
            fromTs=int(from_ts),
        ))
        return jsonify({
            "status": "ok",
            "msg": "queued back tick request",
        }), 200

    # has_to
    if _reader.IsEmpty(symbol):
        default_offset = int(getattr(config, "TICK_DEFAULT_DURATION_OFFSET", getattr(config, "TICK_DURATION_LIMIT", 2000000)))
        rq.put(TickRequest(
            caller=caller,
            symbol=symbol,
            extendType="back",
            fromTs=_now_ms() - default_offset,
        ))

    rq.put(TickRequest(
        caller=caller,
        symbol=symbol,
        extendType="front",
    ))

    return jsonify({
        "status": "ok",
        "msg": "queued front tick request",
    }), 200


init()
