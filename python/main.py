from threading import Thread

import requests
from flask import Flask, jsonify, request

from config import PORT
from ohlc import bp as ohlc_bp
from tick import bp as tick_bp
from symbols import bp as symbols_bp

app = Flask(__name__)

app.register_blueprint(ohlc_bp)
app.register_blueprint(tick_bp)
app.register_blueprint(symbols_bp)


@app.route("/SHUTDOWN")
def shutdown():
    base = f"http://127.0.0.1:{PORT}"

    for route in (
        "/ohlc/SHUTDOWN",
        "/tick/SHUTDOWN",
        "/symbols/SHUTDOWN",
    ):
        try:
            requests.get(base + route, timeout=1)
        except Exception:
            pass

    def stop_server():
        func = request.environ.get("werkzeug.server.shutdown")
        if func:
            func()

    Thread(target=stop_server).start()

    return jsonify({
        "status": "ok",
        "msg": "server shutdown"
    }), 200


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=PORT,
        debug=False
    )