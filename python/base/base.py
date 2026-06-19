from __future__ import annotations

from dataclasses import asdict

from flask import Blueprint, jsonify, request

import _logger as logger

from . import _controller as controller
from ._type import OhlcRequest

_SECTION = "base/base.py"

bp = Blueprint("base", __name__)


def init() -> None:
    controller.start()
    logger.info(_SECTION, "Base module initialized.")


@bp.route("/base/SHUTDOWN", methods=["GET"])
def shutdown():
    controller.stop()
    logger.info(_SECTION, "1S shutdown requested.")
    return jsonify({"status": "ok", "msg": "1S shutdown"}), 200


@bp.route("/1S/extend/", methods=["GET"])
def extend():
    extend_type = (request.args.get("type", "") or "").strip().lower()
    caller = (request.args.get("caller", "") or "").strip()
    symbol = (request.args.get("symbol", "") or "").strip()
    from_ts = request.args.get("fromTs", default=0, type=int)
    timeframe = "1S"

    if extend_type not in {"back", "front"}:
        return jsonify({"status": "error", "msg": "type must be 'back' or 'front'"}), 400
    if not symbol:
        return jsonify({"status": "error", "msg": "symbol is required"}), 400
    if extend_type == "back" and from_ts <= 0:
        return jsonify({"status": "error", "msg": "fromTs is required for back extend"}), 400

    controller.enqueue(
        OhlcRequest(
            caller=caller,
            symbol=symbol,
            timeframe=timeframe,
            extendType=extend_type,
            fromTs=from_ts,
        )
    )
    return jsonify({"status": "ok", "type": "queued", "timeframe": timeframe}), 200


@bp.route("/1S/", methods=["GET"])
def query_ohlcs():
    symbol = (request.args.get("symbol", "") or "").strip()
    from_ts = request.args.get("fromTs", default=None, type=int)
    to_ts = request.args.get("toTs", default=None, type=int)

    if not symbol:
        return jsonify({"status": "error", "msg": "symbol is required"}), 400
    if from_ts is None or to_ts is None:
        return jsonify({"status": "error", "msg": "fromTs and toTs are required"}), 400
    if from_ts > to_ts:
        from_ts, to_ts = to_ts, from_ts

    import ohlcStorer.storer as ohlcStorer

    if ohlcStorer.IsEmpty(symbol, "1S"):
        return jsonify([]), 200

    data = ohlcStorer.getOhlcs(symbol, "1S", from_ts, to_ts)
    if data is False:
        return jsonify({"status": "error", "msg": "Failed to read ohlc database"}), 500

    return jsonify([asdict(t) for t in data]), 200
