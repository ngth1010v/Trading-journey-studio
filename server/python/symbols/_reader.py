from __future__ import annotations

import sqlite3

from config import DATABASE_PATH
from ._type import Symbol
import _logger as logger

_SECTION = "symbols/_reader.py"

_DB_PATH = DATABASE_PATH / "chartData" / "symbol.db"


def getSymbols() -> list[Symbol]:
    conn = None

    try:
        conn = sqlite3.connect(_DB_PATH)

        rows = conn.execute(
            """
            SELECT symbol, point, contract_size, currency, watching
            FROM symbols
            ORDER BY symbol
            """
        ).fetchall()

        return [
            Symbol(
                symbol=row[0],
                point=row[1],
                contractSize=row[2],
                currency=row[3],
                watching=bool(row[4]),
            )
            for row in rows
        ]

    except Exception as e:
        logger.error(_SECTION, f"Failed to read symbols: {e}")
        raise

    finally:
        if conn is not None:
            conn.close()


def getSymbol(symbol: str) -> Symbol | None:
    conn = None

    try:
        conn = sqlite3.connect(_DB_PATH)

        row = conn.execute(
            """
            SELECT symbol, point, contract_size, currency, watching
            FROM symbols
            WHERE symbol = ?
            LIMIT 1
            """,
            (symbol,),
        ).fetchone()

        if row is None:
            return None

        return Symbol(
            symbol=row[0],
            point=row[1],
            contractSize=row[2],
            currency=row[3],
            watching=bool(row[4]),
        )

    except Exception as e:
        logger.error(_SECTION, f"Failed to read symbol '{symbol}': {e}")
        raise

    finally:
        if conn is not None:
            conn.close()