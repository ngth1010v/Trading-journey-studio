from __future__ import annotations

from typing import Any, Iterable
import numpy as np
import struct

import _logger as logger
import ohlcStorer

from ._timeframe import (
    align_timestamp_to_timeframe,
    build_target_periods,
    get_base_timeframe,
    is_valid_timeframe,
    normalize_timeframe,
    start_of_month_utc,
    start_of_week_utc,
    start_of_year_utc,
)

_SECTION = "ohlc/_controller.py"


def _parse_timestamp(raw_value: Any) -> int | None:
    try:
        if raw_value is None:
            return None
        if isinstance(raw_value, bool):
            return None
        return int(str(raw_value).strip())
    except Exception:
        return None


def _np_row_to_dict(row: np.ndarray) -> dict[str, Any]:
    if row is None or len(row) < 6:
        return {}
    return {
        "t": int(row[0]),
        "o": float(row[1]) if isinstance(row[1], float) else int(row[1]),
        "h": float(row[2]) if isinstance(row[2], float) else int(row[2]),
        "l": float(row[3]) if isinstance(row[3], float) else int(row[3]),
        "c": float(row[4]) if isinstance(row[4], float) else int(row[4]),
        "v": float(row[5]) if isinstance(row[5], float) else int(row[5]),
    }


def _list_row_to_dict(row: list[int | float]) -> dict[str, Any]:
    if not row or len(row) < 6:
        return {}
    return {
        "t": int(row[0]),
        "o": int(row[1]),
        "h": int(row[2]),
        "l": int(row[3]),
        "c": int(row[4]),
        "v": int(row[5]),
    }


def _is_empty_result(result: Any) -> bool:
    if result is None:
        return True
    if isinstance(result, np.ndarray):
        return result.size == 0
    if isinstance(result, (list, tuple, set, dict)) and len(result) == 0:
        return True
    return False


def _error(message: str, code: int = 400):
    logger.warning(_SECTION, message)
    return {"status": "error", "msg": message, "code": code}, code


def _ok(data: Any, code: int = 200):
    return data, code


def _resolve_last_open_timestamp(target_timeframe: str, last_ts: int) -> int | None:
    tf = normalize_timeframe(target_timeframe)
    if not is_valid_timeframe(tf):
        return None

    unit = tf[-1] if tf[-2:] != "MN" else "MN"
    if tf.endswith("MN"):
        unit = "MN"
    elif tf.endswith("W"):
        unit = "W"
    elif tf.endswith("Y"):
        unit = "Y"

    if unit in {"S", "M", "H", "D"}:
        return align_timestamp_to_timeframe(last_ts, tf)
    if unit == "W":
        return start_of_week_utc(last_ts)
    if unit == "MN":
        return start_of_month_utc(last_ts)
    if unit == "Y":
        return start_of_year_utc(last_ts)
    return None


def _build_bin_from_numpy(data: np.ndarray) -> bytes:
    """
    Tối ưu hóa hiệu suất bằng Vectorized Numpy (.tobytes()) thay thế cho vòng lặp thuần.
    Cấu trúc layout nhị phân:
    - int64 count (8 bytes)
    - int64[count] t, o, h, l, c, v (mỗi mảng liên tục trong bộ nhớ)
    """
    count = data.shape[0] if data.size > 0 else 0
    
    # 1. Khởi tạo header 8 bytes chứa độ dài count (Little-endian int64)
    header = struct.pack("<q", count)
    
    if count == 0:
        return header

    # 2. Đảm bảo dữ liệu chắc chắn là kiểu int64 với thứ tự lưu trữ liên tục (C-order)
    # và ép định dạng Byte-order sang Little-endian (<i8) để tương thích chính xác với Client
    data_fixed = np.asarray(data, dtype="<i8", order="C")
    
    # 3. Sử dụng tính năng cắt mảng nâng cao (Slicing) kết hợp .tobytes() 
    # Thao tác này chạy ở tầng C-level của Numpy, cực kỳ nhanh.
    t_bytes = data_fixed[:, 0].tobytes()
    o_bytes = data_fixed[:, 1].tobytes()
    h_bytes = data_fixed[:, 2].tobytes()
    l_bytes = data_fixed[:, 3].tobytes()
    c_bytes = data_fixed[:, 4].tobytes()
    v_bytes = data_fixed[:, 5].tobytes()
    
    # 4. Gộp toàn bộ các phân vùng bytes lại thành một chuỗi duy nhất
    return header + t_bytes + o_bytes + h_bytes + l_bytes + c_bytes + v_bytes


#=======================================================================================================================
# PUBLIC
#=======================================================================================================================
def get_ohlcs(symbol: str, timeframe: str, from_ts_raw: Any, to_ts_raw: Any):
    timeframe = normalize_timeframe(timeframe)
    if not is_valid_timeframe(timeframe):
        return _error(f"Invalid timeframe: {timeframe}")

    from_ts = _parse_timestamp(from_ts_raw)
    to_ts = _parse_timestamp(to_ts_raw)
    if from_ts is None or to_ts is None:
        return _error("fromTs and toTs are required integer timestamps.")
    if from_ts < 0 or to_ts < 0:
        return _error("fromTs and toTs must be non-negative.")
    if to_ts <= from_ts:
        return _error("toTs must be greater than fromTs.")

    base_timeframe = get_base_timeframe(timeframe)
    if base_timeframe is None:
        return _error(f"Unsupported timeframe: {timeframe}")

    try:
        if base_timeframe == timeframe:
            result = ohlcStorer.getRange(symbol, timeframe, from_ts, to_ts)
            if _is_empty_result(result):
                return _ok([])
            return _ok([_np_row_to_dict(row) for row in result])
        else:
            periods = build_target_periods(from_ts, to_ts, timeframe)
            if not periods:
                return _ok([])
            logger.debug(_SECTION, f"GET aggregate for {symbol}/{timeframe} from {symbol}/{base_timeframe}")
            # aggregate returns list[list[int]] as per ohlcStorer definition
            result = ohlcStorer.aggregate(symbol, base_timeframe, periods)
            if _is_empty_result(result):
                return _ok([])
            return _ok([_list_row_to_dict(row) for row in result])

    except Exception as exc:
        logger.error(_SECTION, f"Failed to get OHLCs for {symbol}/{timeframe}: {exc}")
        return _error("Internal error while loading OHLC data.", 500)
    

def get_ohlcs_bin(symbol: str, timeframe: str, from_ts_raw: Any, to_ts_raw: Any):
    timeframe = normalize_timeframe(timeframe)

    if not is_valid_timeframe(timeframe):
        return _error(f"Invalid timeframe: {timeframe}")

    from_ts = _parse_timestamp(from_ts_raw)
    to_ts = _parse_timestamp(to_ts_raw)

    if from_ts is None or to_ts is None:
        return _error("fromTs and toTs are required integer timestamps.")

    if from_ts < 0 or to_ts < 0:
        return _error("fromTs and toTs must be non-negative.")

    if to_ts <= from_ts:
        return _error("toTs must be greater than fromTs.")

    base_timeframe = get_base_timeframe(timeframe)

    if base_timeframe is None:
        return _error(f"Unsupported timeframe: {timeframe}")

    try:
        if base_timeframe != timeframe:
            return _error("Binary API currently supports only base timeframes.")

        result = ohlcStorer.getRange(
            symbol,
            timeframe,
            from_ts,
            to_ts,
        )

        if _is_empty_result(result):
            return _ok(_build_bin_from_numpy(np.empty((0, 6), dtype=np.int64)))
        
        # Nếu result trả về không phải là numpy array trực tiếp (ví dụ list), ép kiểu về numpy array
        if not isinstance(result, np.ndarray):
            result = np.array(result, dtype=np.int64)

        bin_data = _build_bin_from_numpy(result)
        return _ok(bin_data)

    except Exception as exc:
        logger.error(
            _SECTION,
            f"Failed to get binary OHLCs for {symbol}/{timeframe}: {exc}",
        )
        return _error("Internal error while loading OHLC data.", 500)


def get_last_ohlc(symbol: str, timeframe: str):
    timeframe = normalize_timeframe(timeframe)
    if not is_valid_timeframe(timeframe):
        return _error(f"Invalid timeframe: {timeframe}")

    try:
        last_s1 = ohlcStorer.getLast(symbol, "1S")
        if _is_empty_result(last_s1):
            return _ok([])

        # last_s1 is an [N, 6] array; grab the first matching newest bar
        last_row = last_s1[0]
        last_ts = int(last_row[0])

        open_ts = _resolve_last_open_timestamp(timeframe, last_ts)
        if open_ts is None:
            return _error(f"Unable to resolve open timestamp for timeframe: {timeframe}")

        periods = [(open_ts, last_ts + 1000)]
        result = ohlcStorer.aggregate(symbol, "1S", periods)

        if not _is_empty_result(result):
            result = _list_row_to_dict(result[0])
            return _ok(result)
        


        # Fallback handling using elements from the extracted array row indices [1]=O, [2]=H, [3]=L, [4]=C
        price = last_row[4]  # default fallback to Close price
        fallback = {
            "t": open_ts,
            "o": price,
            "h": price,
            "l": price,
            "c": price,
            "v": 0,
        }
        return _ok(fallback)
    except Exception as exc:
        logger.error(_SECTION, f"Failed to get last OHLC for {symbol}/{timeframe}: {exc}")
        return _error("Internal error while loading last OHLC.", 500)
    