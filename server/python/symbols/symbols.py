from __future__ import annotations

from dataclasses import asdict

from flask import Blueprint, jsonify, request

import _logger as logger
from base import base

from . import _writer
from ._collector import getSymbolsFromMt5
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

    # Auto-register symbols that have watching set to True
    all_symbols = getSymbols()
    for item in all_symbols:
        if item.watching:
            base.registryWatchingSymbol(item.symbol)

    logger.info(
        _SECTION,
        f"Initialized symbols module with {len(all_symbols)} symbols.",
    )


@bp.route(f"{BASE}", methods=["GET"])
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


@bp.route(f"{BASE}", methods=["POST"])
def update_symbol():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"status": "error", "msg": "Invalid JSON body"}), 400

    symbol_name = body.get("symbol")
    if not symbol_name or not isinstance(symbol_name, str):
        return jsonify({"status": "error", "msg": "Field 'symbol' (str) is required"}), 400

    symbol_name = symbol_name.strip()
    symbol_obj = getSymbol(symbol_name)
    if not symbol_obj:
        return jsonify({"status": "error", "msg": f"Symbol '{symbol_name}' not found"}), 404

    if "watching" in body:
        watching = bool(body["watching"])
        _writer.updateSymbolWatching(symbol_name, watching)

        if watching:
            base.registryWatchingSymbol(symbol_name)
        else:
            base.unregistryWatchingSymbol(symbol_name)

    return jsonify({"status": "ok", "msg": f"Symbol '{symbol_name}' updated successfully"}), 200


@bp.route("/symbols/SHUTDOWN")
def shutdown():
    logger.info(_SECTION, "Symbols shutdown requested.")

    return jsonify({
        "status": "ok",
        "msg": "symbols shutdown"
    }), 200