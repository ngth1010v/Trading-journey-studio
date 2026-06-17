from __future__ import annotations

from dataclasses import asdict

from flask import Blueprint, jsonify, request

import _logger as logger
import config

from . import controller
from ._reader import IsEmpty, getFirstTick, getLastTick, getTicks
from ._type import TickRequest

_SECTION = "tick/tick.py"

bp = Blueprint("tick", __name__)


def init() -> None:
    controller.start()
    logger.info(_SECTION, "Tick module initialized.")


@bp.route("/tick/SHUTDOWN", methods=["GET"])
def shutdown():
    controller.stop()
    logger.info(_SECTION, "Tick shutdown requested.")
    return jsonify({"status": "ok", "msg": "tick shutdown"}), 200


@bp.route("/tick/extend", methods=["GET"])
def extend():
    extend_type = (request.args.get("type", "") or "").strip().lower()
    caller = (request.args.get("caller", "") or "").strip()
    symbol = (request.args.get("symbol", "") or "").strip()
    from_ts = request.args.get("fromTs", default=0, type=int)

    if extend_type not in {"back", "front"}:
        return jsonify({"status": "error", "msg": "type must be 'back' or 'front'"}), 400
    if not symbol:
        return jsonify({"status": "error", "msg": "symbol is required"}), 400
    if extend_type == "back" and from_ts <= 0:
        return jsonify({"status": "error", "msg": "fromTs is required for back extend"}), 400

    controller.enqueue(
        TickRequest(
            caller=caller,
            symbol=symbol,
            extendType=extend_type,
            fromTs=from_ts,
        )
    )
    return jsonify({"status": "ok", "type": "queued"}), 200


@bp.route("/tick", methods=["GET"])
def query_ticks():
    caller = (request.args.get("caller", "") or "").strip()
    symbol = (request.args.get("symbol", "") or "").strip()
    from_ts = request.args.get("fromTs", default=None, type=int)
    to_ts = request.args.get("toTs", default=None, type=int)

    if not symbol:
        return jsonify({"status": "error", "msg": "symbol is required"}), 400
    if from_ts is None or to_ts is None:
        return jsonify({"status": "error", "msg": "fromTs and toTs are required"}), 400
    if from_ts > to_ts:
        from_ts, to_ts = to_ts, from_ts

    if IsEmpty(symbol):
        return jsonify({"status": "error", "msg": "The database has not been initialized"}), 500

    last_tick = getLastTick(symbol)
    first_tick = getFirstTick(symbol)
    if last_tick is False or first_tick is False:
        return jsonify({"status": "error", "msg": "Failed to read tick database"}), 500

    data = getTicks(symbol, from_ts, to_ts)
    if data is False:
        return jsonify({"status": "error", "msg": "Failed to read tick database"}), 500

    return jsonify([asdict(t) for t in data]), 200
