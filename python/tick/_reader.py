from __future__ import annotations

from pathlib import Path

import duckdb

import _logger as logger
import config

from ._type import Tick

_SECTION = "tick/_reader.py"


def _db_path(symbol: str) -> Path:
    return config.DATABASE_PATH / "markets" / symbol / "ticks.duckdb"


def _query_one(symbol: str, order: str) -> Tick | bool:
    try:
        if not symbol or not symbol.strip():
            logger.error(_SECTION, "symbol is empty.")
            return False

        path = _db_path(symbol)
        if not path.exists():
            logger.warning(_SECTION, f"database does not exist for '{symbol}': {path}")
            return False

        con = duckdb.connect(str(path))
        try:
            con.execute(
                f"""
                SELECT timestamp, bid, ask, volume
                FROM ticks
                ORDER BY timestamp {order}, bid {order}, ask {order}, volume {order}
                LIMIT 1
                """
            )
            row = con.fetchone()
        finally:
            con.close()

        if row is None:
            logger.warning(_SECTION, f"database is empty for '{symbol}'.")
            return False

        return Tick(
            timestamp=int(row[0]),
            bid=int(row[1]),
            ask=int(row[2]),
            volume=int(row[3]),
        )

    except Exception as exc:
        logger.error(_SECTION, f"failed to read tick for '{symbol}': {exc}")
        return False


def getLastTick(symbol: str):
    """
    Blocking.
    """
    return _query_one(symbol, "DESC")


def getFirstTick(symbol: str):
    """
    Blocking.
    """
    return _query_one(symbol, "ASC")


def IsEmpty(symbol: str) -> bool:
    """
    Return True if empty or database did not exist.
    """
    try:
        if not symbol or not symbol.strip():
            return True

        path = _db_path(symbol)
        if not path.exists():
            return True

        con = duckdb.connect(str(path))
        try:
            con.execute("SELECT 1 FROM ticks LIMIT 1")
            row = con.fetchone()
        finally:
            con.close()

        return row is None

    except Exception:
        return True
