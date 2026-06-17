from __future__ import annotations

import sqlite3
from pathlib import Path

import _logger as logger
import config
from ._type import Tick

_SECTION = "tick/_reader.py"


def _db_path(symbol: str) -> Path:
    return config.DATABASE_PATH / "markets" / symbol / "ticks.db"


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30.0, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ticks (
            timestamp INTEGER NOT NULL,
            bid INTEGER NOT NULL,
            ask INTEGER NOT NULL,
            volume INTEGER NOT NULL
        )
        """
    )


def _row_to_tick(row) -> Tick:
    return Tick(
        timestamp=int(row[0]),
        bid=int(row[1]),
        ask=int(row[2]),
        volume=int(row[3]),
    )


def _read_one(symbol: str, order: str) -> Tick | bool:
    try:
        path = _db_path(symbol)
        if not path.exists():
            return False

        conn = _connect(path)
        try:
            _ensure_table(conn)
            row = conn.execute(
                f"SELECT timestamp, bid, ask, volume FROM ticks ORDER BY timestamp {order} LIMIT 1"
            ).fetchone()
            if row is None:
                return False
            return _row_to_tick(row)
        finally:
            conn.close()
    except Exception as exc:
        logger.error(_SECTION, f"_read_one({symbol!r}, {order}) failed: {exc}")
        return False


def getLastTick(symbol):
    return _read_one(symbol, "DESC")


def getFirstTick(symbol):
    return _read_one(symbol, "ASC")


def getTicks(symbol, fromTs, toTs):
    try:
        if fromTs > toTs:
            fromTs, toTs = toTs, fromTs

        path = _db_path(symbol)
        if not path.exists():
            logger.warning(_SECTION, f"Database does not exist for {symbol}.")
            return []

        conn = _connect(path)
        try:
            _ensure_table(conn)
            rows = conn.execute(
                """
                SELECT timestamp, bid, ask, volume
                FROM ticks
                WHERE timestamp BETWEEN ? AND ?
                ORDER BY timestamp ASC
                """,
                (int(fromTs), int(toTs)),
            ).fetchall()

            if not rows:
                return []

            return [_row_to_tick(row) for row in rows]
        finally:
            conn.close()
    except Exception as exc:
        logger.error(_SECTION, f"getTicks({symbol!r}, {fromTs}, {toTs}) failed: {exc}")
        return False


def IsEmpty(symbol):
    try:
        path = _db_path(symbol)
        if not path.exists():
            return True

        conn = _connect(path)
        try:
            _ensure_table(conn)
            row = conn.execute("SELECT 1 FROM ticks LIMIT 1").fetchone()
            return row is None
        finally:
            conn.close()
    except Exception as exc:
        logger.error(_SECTION, f"IsEmpty({symbol!r}) failed: {exc}")
        return True
