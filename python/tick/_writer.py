from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Iterable

import _logger as logger
import config
from ._type import Tick

_SECTION = "tick/_writer.py"
_LOCK = threading.Lock()
_ACTIVE_SYMBOL: str = ""


def set_active_symbol(symbol: str) -> None:
    global _ACTIVE_SYMBOL
    _ACTIVE_SYMBOL = (symbol or "").strip()


def _db_path(symbol: str | None = None) -> Path:
    actual_symbol = (symbol or _ACTIVE_SYMBOL or "").strip()
    if not actual_symbol:
        raise ValueError("symbol is empty; call set_active_symbol(symbol) first.")
    return config.DATABASE_PATH / "markets" / actual_symbol / "ticks.db"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _open(path: Path) -> sqlite3.Connection:
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
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ticks_timestamp ON ticks(timestamp)")


def _sorted_ticks(ticks: Iterable[Tick]) -> list[Tick]:
    cleaned = [
        Tick(
            timestamp=int(t.timestamp),
            bid=int(t.bid),
            ask=int(t.ask),
            volume=int(t.volume),
        )
        for t in ticks
    ]
    cleaned.sort(key=lambda t: t.timestamp)
    return cleaned


def _insert_ticks(conn: sqlite3.Connection, ticks: list[Tick]) -> None:
    if not ticks:
        return
    conn.executemany(
        "INSERT INTO ticks(timestamp, bid, ask, volume) VALUES (?, ?, ?, ?)",
        [(t.timestamp, t.bid, t.ask, t.volume) for t in ticks],
    )


def _get_boundary(conn: sqlite3.Connection) -> tuple[int | None, int | None]:
    row = conn.execute("SELECT MIN(timestamp), MAX(timestamp) FROM ticks").fetchone()
    if not row:
        return None, None
    return row[0], row[1]


def _write_ticks(ticks: list[Tick], mode: str) -> bool:
    if not ticks:
        return True

    try:
        with _LOCK:
            path = _db_path()
            _ensure_parent(path)

            conn = _open(path)
            try:
                _ensure_table(conn)

                ticks = _sorted_ticks(ticks)
                first_ts, last_ts = _get_boundary(conn)

                if first_ts is not None and last_ts is not None:
                    if mode == "append":
                        ticks = [t for t in ticks if t.timestamp > last_ts]
                    elif mode == "prepend":
                        ticks = [t for t in ticks if t.timestamp < first_ts]

                if not ticks:
                    return True

                conn.execute("BEGIN")
                _insert_ticks(conn, ticks)
                conn.execute("COMMIT")
                return True
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise
            finally:
                conn.close()
    except Exception as exc:
        logger.error(_SECTION, f"{mode}Ticks failed: {exc}")
        return False


def appendTicks(list_of_ticks: list[Tick]) -> bool:
    return _write_ticks(list_of_ticks, "append")


def prependTicks(list_of_ticks: list[Tick]) -> bool:
    return _write_ticks(list_of_ticks, "prepend")
