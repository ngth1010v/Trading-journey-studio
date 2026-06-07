from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from .config import MARKET_DATA_DIR


def _safe_symbol_name(symbol: str) -> str:
    return quote(symbol, safe="._-")


def symbol_dir(symbol: str) -> Path:
    return MARKET_DATA_DIR / _safe_symbol_name(symbol)


def ticks_path(symbol: str) -> Path:
    return symbol_dir(symbol) / "ticks.parquet"


def ohlc_path(symbol: str, timeframe: int) -> Path:
    return symbol_dir(symbol) / f"{int(timeframe)}.parquet"
