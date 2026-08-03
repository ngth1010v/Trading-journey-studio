# server/python/base/base.py
from __future__ import annotations

import threading
import time

from flask import Blueprint, jsonify

import _logger as logger
from symbols._reader import getSymbols

from . import _baseWorker, _ohlcWorker, _stager, _watchList

_SECTION = "base/base.py"
BASE = "/api/chartData/candles/watchList"

bp = Blueprint("base", __name__)

_running = False
_watchlist_thread: threading.Thread | None = None


def registryWatchingSymbol(symbol: str) -> None:
    """Public API for symbol module to register a symbol to watchlist."""
    _watchList.registry(symbol)


def unregistryWatchingSymbol(symbol: str) -> None:
    """Public API for symbol module to unregister a symbol from watchlist."""
    _watchList.unregistry(symbol)


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