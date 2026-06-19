from __future__ import annotations

from flask import Blueprint, jsonify, request

import _logger as logger

_SECTION = "ohlc/ohlc.py"

bp = Blueprint("ohlc", __name__)



@bp.route("/ohlc/SHUTDOWN", methods=["GET"])
def shutdown():
    logger.info(_SECTION, "Ohlc shutdown requested.")
    return jsonify({"status": "ok", "msg": "shutdown"}), 200


@bp.route("/<symbol>/extend/", methods=["GET"])
def getData(symbol: str):

    return jsonify({"status": "ok", "type": "queued"}), 200
