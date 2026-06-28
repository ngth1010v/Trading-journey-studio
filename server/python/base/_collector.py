from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import MetaTrader5 as mt5
import numpy as np

import _logger as logger
import config
from ._type import Tick

_SECTION = "base/_collector.py"

# Lưu offset theo giờ, mặc định ban đầu là 0
_MT5_SERVER_OFFSET_HOURS: int = 0
_IS_INITIALIZED: bool = False


def _ms_to_dt(ts_ms: int) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def init() -> bool:
    """
    Initialize and cache the server-vs-UTC offset in hours.
    
    Returns:
        bool: True if initialization was successful (or fallback file read succeeded),
              False if market is closed and no setup file exists.
    """
    global _MT5_SERVER_OFFSET_HOURS, _IS_INITIALIZED

    if _IS_INITIALIZED:
        return True

    # Xác định đường dẫn file serverInfo.json
    db_path = Path(config.DATABASE_PATH)
    file_path = db_path / "serverInfo.json"

    try:
        candidates = mt5.symbols_get() or []
        probe_symbol = ""
        for item in candidates:
            name = getattr(item, "name", "")
            if name:
                probe_symbol = str(name)
                break

        if not probe_symbol:
            logger.warning(_SECTION, "No probe symbol found while initializing server offset.")
            tick = None
        else:
            tick = mt5.symbol_info_tick(probe_symbol)

        if tick is None:
            logger.warning(_SECTION, f"Could not read MT5 tick for {probe_symbol!r}. Market might be closed.")
            # Coi như market đang close -> Chuyển sang nhánh xử lý abs(delta) > 20 phút
            return _handle_market_closed(file_path)

        # Lấy timestamp giờ UTC và server (ms)
        utc_now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        server_now_ms = _safe_int(getattr(tick, "time_msc", 0))
        
        delta_ms = server_now_ms - utc_now_ms
        abs_delta_minutes = abs(delta_ms) / (1000 * 60)

        # NẾU ABS(DELTA) <= 20 PHÚT
        if abs_delta_minutes <= 20:
            # Round delta theo giờ
            offset_hours = int(round(delta_ms / (1000 * 60 * 60)))
            _MT5_SERVER_OFFSET_HOURS = offset_hours
            
            # Ghi offset xuống file json
            db_path.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump({"serverUtc": offset_hours}, f, indent=4)
                
            _IS_INITIALIZED = True
            return True
            
        # NẾU ABS(DELTA) > 20 PHÚT -> Market đang close
        else:
            return _handle_market_closed(file_path)

    except Exception as exc:
        logger.error(_SECTION, f"Exception during init(): {exc}. Forcing market-closed fallback logic.")
        return _handle_market_closed(file_path)


def _handle_market_closed(file_path: Path) -> bool:
    """Xử lý nhánh logic khi Market Close hoặc không lấy được Tick realtime"""
    global _MT5_SERVER_OFFSET_HOURS, _IS_INITIALIZED

    if file_path.exists():
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                _MT5_SERVER_OFFSET_HOURS = int(data.get("serverUtc", 0))
            logger.warning(_SECTION, f"Market closed. Loaded existing offset from file: {_MT5_SERVER_OFFSET_HOURS} hours.")
            _IS_INITIALIZED = True
            return True
        except Exception as exc:
            logger.error(_SECTION, f"Failed to read existing config file: {exc}")

    # Nếu không có file (hoặc file lỗi nát không đọc được)
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump({"serverUtc": 0}, f, indent=4)
    except Exception as exc:
        logger.error(_SECTION, f"Could not create default file: {exc}")

    _MT5_SERVER_OFFSET_HOURS = 0  # Coi offset mặc định là 0h để chạy tiếp khi fetch
    logger.error(_SECTION, "Market closed and no valid serverInfo.json found. Created default file with serverUtc: 0.")
    
    # Đánh dấu đã init (dù thất bại) để không bị lặp lại logic ghi/đọc file này ở các vòng gọi sau
    _IS_INITIALIZED = True 
    return False


def _get_offset_ms() -> int:
    """Helper chuyển đổi offset giờ hiện tại sang mili giây dùng cho fetch"""
    # Đảm bảo đã chạy qua logic init ít nhất 1 lần
    if not _IS_INITIALIZED:
        init()
    return _MT5_SERVER_OFFSET_HOURS * 60 * 60 * 1000


def _utc_ms_to_mt5_ms(utc_ms: int) -> int:
    return int(utc_ms + _get_offset_ms())


def fetchTicksFromMt5(symbol: str, point: int, fromTs: int, toTs: int) -> np.ndarray:
    """
    Return numpy array:
        [
            [t:int64, b:int64, v:int64],
            ...
        ]

    where:
        t = UTC timestamp (ms)
        b = bid * point
        v = real volume
    """
    empty = np.empty((0, 3), dtype=np.int64)

    try:
        symbol = (symbol or "").strip()
        if not symbol:
            logger.warning(_SECTION, "Empty symbol passed to fetchTicksFromMt5().")
            return empty

        if fromTs <= 0 or toTs <= 0:
            logger.warning(
                _SECTION,
                f"Invalid range for {symbol!r}: fromTs={fromTs}, toTs={toTs}",
            )
            return empty

        if fromTs > toTs:
            fromTs, toTs = toTs, fromTs

        offset_ms = _get_offset_ms()

        raw = mt5.copy_ticks_range(
            symbol,
            _ms_to_dt(fromTs + offset_ms),
            _ms_to_dt(toTs + offset_ms),
            mt5.COPY_TICKS_ALL,
        )

        if raw is None or len(raw) == 0:
            return empty

        names = raw.dtype.names or ()

        # timestamp
        if "time_msc" in names:
            t = raw["time_msc"].astype(np.int64)
        else:
            t = raw["time"].astype(np.int64) * 1000

        t -= offset_ms

        # bid
        b = np.rint(raw["bid"].astype(np.float64) * point).astype(np.int64)

        # volume
        if "real_volume" in names:
            v = raw["real_volume"].astype(np.int64)
        elif "volume" in names:
            v = raw["volume"].astype(np.int64)
        else:
            v = np.zeros(len(raw), dtype=np.int64)

        # filter: fromTs <= t < toTs
        mask = (t >= fromTs) & (t < toTs)

        if not np.any(mask):
            return empty

        out = np.empty((mask.sum(), 3), dtype=np.int64)
        out[:, 0] = t[mask]
        out[:, 1] = b[mask]
        out[:, 2] = v[mask]

        # MT5 thường đã trả theo thời gian, nhưng đảm bảo chắc chắn
        if len(out) > 1:
            order = np.argsort(out[:, 0], kind="stable")
            out = out[order]

        return out

    except Exception as exc:
        logger.error(
            _SECTION,
            f"fetchTicksFromMt5({symbol!r}, {point}, {fromTs}, {toTs}) failed: {exc}",
        )
        return empty