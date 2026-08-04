from __future__ import annotations

import MetaTrader5 as mt5
import time
from datetime import datetime, timedelta
from threading import Thread

import requests
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.serving import make_server

from config import PORT, MT5_INIT_RETRY
from symbols import bp as symbols_bp
from base import bp as base_bp
from ohlc import bp as ohlc_bp

import base
import _logger as logger
import symbols
import ohlcStorer 

app = Flask(__name__)
CORS(app)

app.register_blueprint(symbols_bp)
app.register_blueprint(base_bp)
app.register_blueprint(ohlc_bp)

_server = None


def initMt5(retries: int = MT5_INIT_RETRY) -> bool:
    """
    Khởi tạo MetaTrader5 và kiểm tra khả năng lấy tick data.
    Tự động lấy một symbol bất kỳ có sẵn trên server để test thay vì hardcode.
    Nếu lỗi copy_ticks_range sẽ tự động thử lại tối đa `retries` lần.
    """
    SECTION = "initMt5"
    
    for attempt in range(1, retries + 1):
        logger.info(SECTION, f"Attempting to initialize MT5 (Try {attempt}/{retries})...")
        
        if not mt5.initialize():
            logger.error(SECTION, f"MT5 initialization failed. Error code: {mt5.last_error()}")
            time.sleep(1)
            continue
            
        # Lấy danh sách các symbol có sẵn trên server MT5 hiện tại
        all_symbols = mt5.symbols_get()
        if not all_symbols or len(all_symbols) == 0:
            logger.warning(SECTION, "No symbols found on this MT5 server. Re-initializing...")
            mt5.shutdown()
            time.sleep(1)
            continue
            
        # Chọn symbol đầu tiên có trong danh sách để chạy test tick data
        test_symbol = all_symbols[0].name
        logger.debug(SECTION, f"Using symbol '{test_symbol}' for tick data synchronization check.")
        
        # Thử nghiệm lấy tick data trong khoảng 1 phút gần nhất
        now = datetime.now()
        utc_from = now - timedelta(minutes=1)
        
        ticks = mt5.copy_ticks_range(test_symbol, utc_from, now, mt5.COPY_TICKS_ALL)
        
        if ticks is None:
            last_err = mt5.last_error()
            logger.warning(
                SECTION, 
                f"Tick data check failed for '{test_symbol}'. Error code: {last_err}. Re-initializing..."
            )
            mt5.shutdown()
            time.sleep(1)
            continue
        
        # Nếu chạy đến đây tức là copy_ticks_range không bị lỗi argument invalid
        logger.info(SECTION, f"MT5 initialized and tick data check passed successfully with symbol '{test_symbol}'.")
        return True

    logger.error(SECTION, f"Critical: MT5 failed to initialize properly after {retries} attempts.")
    return False


@app.route("/SHUTDOWN")
def shutdown():
    logger.info("main.py", "Received shutdown request.")
    base_url = f"http://127.0.0.1:{PORT}"

    # 1. Gửi request thông báo shutdown tới các blueprint khác nếu cần
    for route in (
        "/symbols/SHUTDOWN",
        "/base/SHUTDOWN",
        "/ohlc/SHUTDOWN",
    ):
        try:
            requests.get(base_url + route, timeout=1)
        except Exception as e:
            logger.debug("main.py", f"Failed to notify {route}: {e}")

    # 2. Hàm xử lý dọn dẹp và đóng server chạy ngầm
    def background_shutdown():
        global _server
        
        # Chờ 1 chút để Flask kịp trả về response HTTP 200 cho client
        time.sleep(0.5) 
        
        # Chạy dọn dẹp dữ liệu trước khi kill server
        logger.info("main.py", "Start ohlc shutdown")
        try:
            ohlcStorer.shutdown()
        except Exception as e:
            logger.error("main.py", f"Error during ohlcStorer shutdown: {e}")
        
        logger.info("main.py", "Closing MT5 connection...")
        try:
            mt5.shutdown()
        except Exception as e:
            logger.error("main.py", f"Error during MT5 shutdown: {e}")
        logger.info("main.py", "MT5 connection closed.")

        # Lệnh cuối cùng: Dừng Flask Server và kết thúc process
        if _server is not None:
            logger.info("main.py", "Stopping Flask server...")
            _server.shutdown()
            logger.info("main.py", "Flask server stopped.")

    # Kích hoạt thread ngầm xử lý các bước trên
    Thread(
        target=background_shutdown,
        daemon=True,
    ).start()

    # 3. Trả về Response ngay lập tức cho client
    return jsonify({
        "status": "ok",
        "msg": "server is shutting down properly"
    }), 200

def main() -> None:
    global _server

    # Sử dụng hàm kiểm tra initMt5 linh hoạt theo symbol sàn
    if not initMt5():
        logger.error("main.py", "Shutting down server startup due to MT5 initialization failure.")
        return

    symbols.symbols.init()
    ohlcStorer.init()
    base.base.init()

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