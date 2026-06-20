# server/python/base/base.py
from __future__ import annotations

import uuid

from flask import Blueprint, jsonify, request

import _logger as logger
from symbols._reader import getSymbols

from . import _controller as controller
from ._type import ExtendRequest

_SECTION = "base/base.py"

bp = Blueprint("base", __name__)


def init() -> None:
    controller.start()
    logger.info(_SECTION, "Base module initialized.")


@bp.route("/base/SHUTDOWN", methods=["GET"])
def shutdown():
    controller.stop()
    logger.info(_SECTION, "Base shutdown requested.")
    return jsonify({"status": "ok", "msg": "shutdown"}), 200


@bp.route("/<symbol>/extend/registerAuto", methods=["GET"])
def register_auto(symbol: str):
    symbol = (symbol or "").strip()

    if not symbol or symbol not in [item.symbol for item in getSymbols()]:
        return jsonify({"status": "error", "msg": "Invalid or missing symbol"}), 400

    key = controller.register_auto(symbol)
    return jsonify(
        {
            "status": "ok",
            "msg": "auto extend registered",
            "key": key,
        }
    ), 200


@bp.route("/<symbol>/extend/unregisterAuto", methods=["GET"])
def unregister_auto(symbol: str):
    symbol = (symbol or "").strip()
    key = (request.args.get("key", "") or "").strip()

    if not symbol or symbol not in [item.symbol for item in getSymbols()]:
        return jsonify({"status": "error", "msg": "Invalid or missing symbol"}), 400
    if not key:
        return jsonify({"status": "error", "msg": "key is required"}), 400

    ok = controller.unregister_auto(symbol, key)
    if not ok:
        return jsonify({"status": "error", "msg": "auto register key not found"}), 400

    return jsonify({"status": "ok", "msg": "auto extend unregistered"}), 200


@bp.route("/<symbol>/extend/", methods=["GET"])
def extend(symbol: str):
    extend_type = (request.args.get("type", "") or "").strip().lower()
    caller = (request.args.get("caller", "") or "").strip()
    symbol = (symbol or "").strip()
    from_ts = request.args.get("fromTs", default=0, type=int)

    if extend_type not in {"back", "front"}:
        return jsonify({"status": "error", "msg": "type must be 'back' or 'front'"}), 400
    if not symbol or symbol not in [item.symbol for item in getSymbols()]:
        return jsonify({"status": "error", "msg": "Invalid or missing symbol"}), 400

    if controller.has_pending_request(symbol) or controller.has_auto_registered(symbol):
        return jsonify({"status": "ok", "msg": "request already queued or auto extend active"}), 200

    if extend_type == "back" and from_ts <= 0:
        return jsonify({"status": "error", "msg": "fromTs is required for back extend"}), 400

    controller.enqueue(
        ExtendRequest(
            caller=caller,
            symbol=symbol,
            extendType=extend_type,
            fromTs=from_ts,
        )
    )
    return jsonify({"status": "ok", "type": "queued"}), 200