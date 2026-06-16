from flask import Blueprint, jsonify

bp = Blueprint("tick", __name__, url_prefix="/tick")


@bp.route("/")
def index():
    return jsonify({
        "status": "ok",
        "msg": "This is tick"
    }), 200


@bp.route("/SHUTDOWN")
def shutdown():
    return jsonify({
        "status": "ok",
        "msg": "tick shutdown"
    }), 200