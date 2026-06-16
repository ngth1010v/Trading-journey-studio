from __future__ import annotations

from threading import Thread

import requests
from flask import Flask, jsonify
from werkzeug.serving import make_server

from config import PORT
from ohlc import bp as ohlc_bp
from symbols import bp as symbols_bp
from tick import bp as tick_bp

app = Flask(__name__)

app.register_blueprint(ohlc_bp)
app.register_blueprint(tick_bp)
app.register_blueprint(symbols_bp)

_server = None


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
        global _server

        if _server is not None:
            _server.shutdown()

    Thread(
        target=stop_server,
        daemon=True,
    ).start()

    return jsonify({
        "status": "ok",
        "msg": "server shutdown"
    }), 200


def main() -> None:
    global _server

    _server = make_server(
        host="127.0.0.1",
        port=PORT,
        app=app,
        threaded=True,
    )

    _server.serve_forever()


if __name__ == "__main__":
    main()