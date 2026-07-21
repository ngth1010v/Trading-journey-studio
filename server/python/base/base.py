# server/python/base/base.py
from __future__ import annotations

import threading
import time

from flask import Blueprint, jsonify, request

import _logger as logger
from symbols._reader import getSymbols

from . import _baseWorker, _ohlcWorker, _stager, _watchList

_SECTION = "base/base.py"
BASE = "/api/chartData/candles/watchList"

bp = Blueprint("base", __name__)

_running = False
_watchlist_thread: threading.Thread | None = None


def _watchlist_loop() -> None:
    """Background thread loop that runs every 250ms to queue watchlist items to stager."""
    global _running
    logger.info(_SECTION, "Watchlist processing thread started.")

    while _running:
        try:
            symbols = _watchList.getWatchList()
            # Current time in milliseconds as float
            current_ts = time.time_ns() // 1_000_000

            for symbol in symbols:
                _stager.putQueue("1S", {"symbol": symbol, "timestamp": current_ts})

        except Exception as e:
            logger.error(_SECTION, f"Error in watchlist thread loop: {e}")

        # Sleep for 250ms
        time.sleep(0.250)

    logger.info(_SECTION, "Watchlist processing thread stopped.")


def init() -> None:
    global _running, _watchlist_thread

    _watchList.init()
    _baseWorker.init()
    _ohlcWorker.init("1M")
    _ohlcWorker.init("1H")
    _ohlcWorker.init("1D")

    # Start the watchlist background thread
    _running = True
    _watchlist_thread = threading.Thread(target=_watchlist_loop, daemon=True)
    _watchlist_thread.start()

    logger.info(_SECTION, "Base module initialized.")


@bp.route("/base/SHUTDOWN", methods=["GET"])
def shutdown():
    global _running
    _running = False

    _stager.putQueue("1S", {"cmd": "SHUTDOWN"})
    _stager.putQueue("1M", {"cmd": "SHUTDOWN"})
    _stager.putQueue("1H", {"cmd": "SHUTDOWN"})
    _stager.putQueue("1D", {"cmd": "SHUTDOWN"})
    logger.info(_SECTION, "Base shutdown requested.")
    return jsonify({"status": "ok", "msg": "shutdown"}), 200


@bp.route(f"{BASE}/", methods=["GET"])
def get_watchlist():
    try:
        data = _watchList.getWatchList()
        return jsonify({"status": "ok", "data": data}), 200
    except Exception as e:
        logger.error(_SECTION, f"Failed to fetch watchlist: {e}")
        return jsonify({"status": "error", "msg": str(e)}), 500


@bp.route(f"{BASE}/", methods=["POST"])
def set_watchlist():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"status": "error", "msg": "Invalid JSON body"}), 400

    symbol = body.get("symbol")
    order = body.get("order", 0)

    if not symbol or not isinstance(symbol, str):
        return jsonify({"status": "error", "msg": "Field 'symbol' (str) is required"}), 400

    if not isinstance(order, int):
        return jsonify({"status": "error", "msg": "Field 'order' must be an integer"}), 400

    symbol = symbol.strip()
    valid_symbols = [item.symbol for item in getSymbols()]
    if symbol not in valid_symbols:
        return jsonify({"status": "error", "msg": f"Symbol '{symbol}' not found in available symbols"}), 400

    try:
        _watchList.setWatchList(symbol, order)
        return jsonify({"status": "ok", "msg": "Symbol queued for addition/update"}), 200
    except Exception as e:
        logger.error(_SECTION, f"Failed to set watchlist item: {e}")
        return jsonify({"status": "error", "msg": str(e)}), 400


@bp.route(f"{BASE}/<symbol>", methods=["DELETE"])
def remove_watchlist(symbol: str):
    symbol = (symbol or "").strip()
    if not symbol:
        return jsonify({"status": "error", "msg": "Symbol parameter missing"}), 400

    try:
        _watchList.removeWatchList(symbol)
        return jsonify({"status": "ok", "msg": f"Symbol '{symbol}' queued for removal"}), 200
    except Exception as e:
        logger.error(_SECTION, f"Failed to remove symbol '{symbol}': {e}")
        return jsonify({"status": "error", "msg": str(e)}), 400


@bp.route(f"{BASE}/extend/<symbol>/<timestamp>", methods=["GET"])
def extend(symbol: str, timestamp: int):
    symbol = (symbol or "").strip()

    if not symbol or symbol not in [item.symbol for item in getSymbols()]:
        return jsonify({"status": "error", "msg": "Invalid or missing symbol"}), 400
    if not timestamp:
        return jsonify({"status": "error", "msg": "Invalid or missing timestamp"}), 400

    _stager.putQueue("1S", {"symbol": symbol, "timestamp": float(timestamp)})

    return jsonify({"status": "ok", "type": "queued"}), 200


@bp.route(f"{BASE}/stage/<symbol>", methods=["GET"])
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