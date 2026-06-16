from flask import Blueprint, jsonify

bp = Blueprint("symbols", __name__, url_prefix="/symbols")


@bp.route("/")
def index():
    return jsonify({
        "status": "ok",
        "msg": "This is symbols"
    }), 200


@bp.route("/SHUTDOWN")
def shutdown():
    return jsonify({
        "status": "ok",
        "msg": "symbols shutdown"
    }), 200