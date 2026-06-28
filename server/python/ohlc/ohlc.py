from __future__ import annotations

from flask import Blueprint, jsonify, request, Response, make_response

import _logger as logger

from ._controller import get_last_ohlc, get_ohlcs, get_ohlcs_bin

_SECTION = "ohlc/ohlc.py"

bp = Blueprint("ohlc", __name__)

@bp.after_request
def remove_etag_for_bin(response):
    # Nếu là route binary, triệt tiêu tận gốc ETag ở tầng sâu nhất của Flask
    if request.path.endswith("/bin"):
        response.headers.set("Content-Type", "application/octet-stream")
        response.headers.pop("ETag", None)
        response.headers.pop("Last-Modified", None)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["X-No-Gzip"] = "1"
    return response


@bp.route("/ohlc/SHUTDOWN", methods=["GET"])
def shutdown():
    logger.info(_SECTION, "Ohlc shutdown requested.")
    return jsonify({"status": "ok", "msg": "shutdown"}), 200


@bp.route("/<symbol>/<timeframe>", methods=["GET"])
def getData(symbol: str, timeframe: str):
    from_ts = request.args.get("fromTs")
    to_ts = request.args.get("toTs")
    payload, code = get_ohlcs(symbol, timeframe, from_ts, to_ts)
    return jsonify(payload), code

@bp.route("/<symbol>/<timeframe>/bin", methods=["GET"])
def getDataBin(symbol: str, timeframe: str):
    from_ts = request.args.get("fromTs")
    to_ts = request.args.get("toTs")

    payload, code = get_ohlcs_bin(symbol, timeframe, from_ts, to_ts)

    if code != 200:
        return jsonify(payload), code

    response = make_response(payload)
    response.status_code = 200
    
    # Ép header chuẩn để chặn đứng hành vi tự động append charset của Proxy/Nginx
    response.headers["Content-Type"] = "application/octet-stream"
    response.headers["Content-Length"] = str(len(payload))
    
    # Mẹo cốt lõi: Ra lệnh cho Nginx/Reverse Proxy KHÔNG ĐƯỢC nén gzip dữ liệu này
    # Vì nén gzip dữ liệu nhị phân sẽ kích hoạt lỗi tự động chèn charset và đổi ETag.
    response.headers["X-No-Gzip"] = "1"
    response.headers["Content-Encoding"] = "identity" # Chỉ định rõ không mã hóa/nén thêm

    # Triệt tiêu tận gốc ETag ở mức tối đa
    response.headers.pop("ETag", None)
    response.headers.pop("Last-Modified", None)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0"
    response.headers["Pragma"] = "no-cache"

    return response


@bp.route("/<symbol>/<timeframe>/last", methods=["GET"])
def getLast(symbol: str, timeframe: str):
    payload, code = get_last_ohlc(symbol, timeframe)
    return jsonify(payload), code
