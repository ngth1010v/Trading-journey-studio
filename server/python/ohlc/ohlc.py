from __future__ import annotations

from flask import Blueprint, jsonify, request

import _logger as logger

from ._controller import get_first_ohlc, get_last_ohlc, get_ohlcs, shutdown_server

_SECTION = "ohlc/ohlc.py"

bp = Blueprint("ohlc", __name__)


@bp.route("/ohlc/SHUTDOWN", methods=["GET"])
def shutdown():
    logger.info(_SECTION, "Ohlc shutdown requested.")
    return jsonify({"status": "ok", "msg": "shutdown"}), 200


@bp.route("/<symbol>/<timeframe>", methods=["GET"])
def getData(symbol: str, timeframe: str):
    from_ts = request.args.get("fromTs")
    to_ts = request.args.get("toTs")
    payload, code = get_ohlcs(symbol, timeframe, from_ts, to_ts)
    return jsonify(payload), code


@bp.route("/<symbol>/<timeframe>/last", methods=["GET"])
def getLast(symbol: str, timeframe: str):
    payload, code = get_last_ohlc(symbol, timeframe)
    return jsonify(payload), code

@bp.route("/<symbol>/<timeframe>/first", methods=["GET"])
def getFirst(symbol: str, timeframe: str):
    payload, code = get_first_ohlc(symbol, timeframe)
    return jsonify(payload), code