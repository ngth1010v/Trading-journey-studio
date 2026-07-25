from __future__ import annotations

from dataclasses import asdict

from flask import Blueprint, jsonify

import _logger as logger

from ._collector import getSymbolsFromMt5, getSymbolFromMt5
from ._reader import getSymbol, getSymbols
from ._writer import writeSymbols

bp = Blueprint(
    "symbols",
    __name__,
)

_SECTION = "symbols/symbols.py"
BASE = "/api/chartData/symbols"


def init() -> None:
    logger.info(_SECTION, "Initializing symbols module...")

    symbols = getSymbolsFromMt5()
    writeSymbols(symbols)

    logger.info(
        _SECTION,
        f"Initialized symbols module with {len(symbols)} symbols.",
    )


@bp.route(f"{BASE}")
def symbols():
    try:
        symbols = getSymbols()

        if len(symbols) == 0:
            return jsonify({
                "status": "error",
                "msg": "No symbols found in database."
            }), 500

        return jsonify([
            asdict(item)
            for item in symbols
        ]), 200

    except Exception as e:
        logger.error(_SECTION, f"/symbols failed: {e}")

        return jsonify({
            "status": "error",
            "msg": str(e),
        }), 500

@bp.route("/symbols/SHUTDOWN")
def shutdown():
    logger.info(_SECTION, "Symbols shutdown requested.")

    return jsonify({
        "status": "ok",
        "msg": "symbols shutdown"
    }), 200