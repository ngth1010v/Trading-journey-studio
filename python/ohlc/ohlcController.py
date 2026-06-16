from flask import Blueprint, jsonify

bp = Blueprint("ohlc", __name__, url_prefix="/ohlc")


@bp.route("/")
def index():
    return jsonify({
        "status": "ok",
        "msg": "This is ohlc"
    }), 200


@bp.route("/SHUTDOWN")
def shutdown():
    return jsonify({
        "status": "ok",
        "msg": "ohlc shutdown"
    }), 200