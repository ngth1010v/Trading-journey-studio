from __future__ import annotations

import os

from .config import DB_PATH, MARKET_DIR
from .validation import normalize_symbol, normalize_timeframe


def db_path() -> str:
    return os.path.abspath(DB_PATH)


def market_root() -> str:
    return os.path.abspath(MARKET_DIR)


def symbol_dir(symbol: str) -> str:
    safe_symbol = normalize_symbol(symbol)
    return os.path.join(market_root(), safe_symbol)


def symbol_db_exists() -> bool:
    return os.path.exists(db_path())


def tick_file(symbol: str) -> str:
    return os.path.join(symbol_dir(symbol), "ticks.parquet")


def ohlc_file(symbol: str, timeframe: int) -> str:
    safe_timeframe = normalize_timeframe(timeframe)
    return os.path.join(symbol_dir(symbol), f"{safe_timeframe}.parquet")


def list_existing_ohlc_files(symbol: str, from_timeframe: int, to_timeframe: int) -> list[tuple[int, str]]:
    start = normalize_timeframe(from_timeframe)
    end = normalize_timeframe(to_timeframe)
    if start > end:
        start, end = end, start

    root = symbol_dir(symbol)
    result: list[tuple[int, str]] = []
    for timeframe in range(start, end + 1):
        file_path = os.path.join(root, f"{timeframe}.parquet")
        if os.path.exists(file_path):
            result.append((timeframe, file_path))
    return result


def ensure_parent_dir(file_path: str) -> None:
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
