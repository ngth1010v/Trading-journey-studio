from __future__ import annotations

import sqlite3
from pathlib import Path

import _logger as logger

from config import DATABASE_PATH

from ._type import Symbol

_SECTION = "symbols/_writer.py"
_DB_PATH = Path(DATABASE_PATH) / "markets.db"
_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS symbols (
    symbol TEXT PRIMARY KEY,
    point INTEGER NOT NULL,
    contract_size REAL NOT NULL,
    currency TEXT NOT NULL
)
"""


def _ensure_parent() -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def writeSymbols(symbols: list[Symbol]) -> None:
    """
    Clean the symbols table and write the new list into SQLite.
    Blocking function.
    """
    _ensure_parent()

    logger.info(_SECTION, f"Writing {len(symbols)} symbols to database: {_DB_PATH}")

    try:
        with sqlite3.connect(_DB_PATH) as conn:
            conn.execute(_TABLE_SQL)
            conn.execute("DELETE FROM symbols")
            if symbols:
                conn.executemany(
                    "INSERT INTO symbols(symbol, point, contract_size, currency) VALUES (?, ?, ?, ?)",
                    [(item.symbol, int(item.point), float(item.contractSize), str(item.currency)) for item in symbols],
                )
            conn.commit()

        logger.info(_SECTION, f"Write completed successfully: {len(symbols)} rows.")
    except Exception as exc:
        logger.error(_SECTION, f"Failed to write symbols: {exc}")
        raise