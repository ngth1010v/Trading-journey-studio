from __future__ import annotations

import MetaTrader5 as mt5
from threading import Thread

import requests
from flask import Flask, jsonify
from werkzeug.serving import make_server

from config import PORT
from ohlc import bp as ohlc_bp
from symbols import bp as symbols_bp
from tick import bp as tick_bp
import logger

app = Flask(__name__)

app.register_blueprint(ohlc_bp)
app.register_blueprint(tick_bp)
app.register_blueprint(symbols_bp)

_server = None


@app.route("/SHUTDOWN")
def shutdown():
    logger.info("main.py", "Received shutdown request.")
    base = f"http://127.0.0.1:{PORT}"

    for route in (
        "/ohlc/SHUTDOWN",
        "/tick/SHUTDOWN",
        "/symbols/SHUTDOWN",
    ):
        try:
            requests.get(base + route, timeout=1)
        except Exception as e:
            logger.debug("main.py", f"Failed to notify {route}: {e}")

    def stop_server():
        global _server

        if _server is not None:
            _server.shutdown()
            logger.info("main.py", "Flask server stopped.")

    Thread(
        target=stop_server,
        daemon=True,
    ).start()

    mt5.shutdown()
    logger.info("main.py", "MT5 connection closed and application shutting down.")

    return jsonify({
        "status": "ok",
        "msg": "server shutdown"
    }), 200


def main() -> None:
    global _server

    if not mt5.initialize():
        logger.error("main.py", f"Metatrader5 init fail, error code: {mt5.last_error()}")
        return
    else:
        logger.info("main.py", "Metatrader5 init successfully.")

    logger.info("main.py", f"Starting server on 'localhost:{PORT}'...")
    _server = make_server(
        host="127.0.0.1",
        port=PORT,
        app=app,
        threaded=True,
    )
    logger.info("main.py", f"Start server successfully on 'localhost:{PORT}'.")

    _server.serve_forever()


if __name__ == "__main__":
    main()