# server/python/base/base.py
from __future__ import annotations

import uuid

from flask import Blueprint, jsonify, request

import _logger as logger
from symbols._reader import getSymbols

from . import _ohlcWorker
from . import _baseWorker
from . import _stager

_SECTION = "base/base.py"

bp = Blueprint("base", __name__)


def init() -> None:

    _baseWorker.init()
    _ohlcWorker.init("1M")
    _ohlcWorker.init("1H")
    _ohlcWorker.init("1D")
    logger.info(_SECTION, "Base module initialized.")


@bp.route("/base/SHUTDOWN", methods=["GET"])
def shutdown():

    _stager.putQueue("1S", {"cmd": "SHUTDOWN"})
    _stager.putQueue("1M", {"cmd": "SHUTDOWN"})
    _stager.putQueue("1H", {"cmd": "SHUTDOWN"})
    _stager.putQueue("1D", {"cmd": "SHUTDOWN"})
    logger.info(_SECTION, "Base shutdown requested.")
    return jsonify({"status": "ok", "msg": "shutdown"}), 200


@bp.route("/<symbol>/extend/<timestamp>", methods=["GET"])
def extend(symbol: str, timestamp: int):
    symbol = (symbol or "").strip()

    if not symbol or symbol not in [item.symbol for item in getSymbols()]:
        return jsonify({"status": "error", "msg": "Invalid or missing symbol"}), 400
    if not timestamp:
        return jsonify({"status": "error", "msg": "Invalid or missing symbol"}), 400

    _stager.putQueue("1S", {"symbol": symbol, "timestamp": int(timestamp)})

    return jsonify({"status": "ok", "type": "queued"}), 200

@bp.route("/<symbol>/stage", methods=["GET"])
def getState(symbol: str):
    symbol = (symbol or "").strip()

    if not symbol or symbol not in [item.symbol for item in getSymbols()]:
        return jsonify({"status": "error", "msg": "Invalid or missing symbol"}), 400

    return jsonify({
        "1S": {
            "fromTs": _stager.getFrom("1S", symbol),
            "toTs": _stager.getTo("1S", symbol)
        },
        "1M": {
            "fromTs": _stager.getFrom("1M", symbol),
            "toTs": _stager.getTo("1M", symbol)
        },
        "1H": {
            "fromTs": _stager.getFrom("1H", symbol),
            "toTs": _stager.getTo("1H", symbol)
        },
        "1D": {
            "fromTs": _stager.getFrom("1D", symbol),
            "toTs": _stager.getTo("1D", symbol)
        },
    }), 200