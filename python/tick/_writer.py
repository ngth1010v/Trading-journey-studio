from __future__ import annotations

import contextvars
import threading
from pathlib import Path

import duckdb

import _logger as logger
import config

from ._type import Tick

_SECTION = "tick/_writer.py"

_CURRENT_SYMBOL: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "tick_current_symbol",
    default=None,
)

_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def set_active_symbol(symbol: str | None) -> None:
    _CURRENT_SYMBOL.set(symbol)


def _get_active_symbol() -> str | None:
    symbol = _CURRENT_SYMBOL.get()
    if symbol is None:
        return None
    symbol = symbol.strip()
    return symbol or None


def _symbol_lock(symbol: str) -> threading.Lock:
    with _LOCKS_GUARD:
        lock = _LOCKS.get(symbol)
        if lock is None:
            lock = threading.Lock()
            _LOCKS[symbol] = lock
        return lock


def _db_path(symbol: str) -> Path:
    return config.DATABASE_PATH / "markets" / symbol / "ticks.duckdb"


def _ensure_parent(symbol: str) -> Path:
    path = _db_path(symbol)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _open_db(symbol: str) -> duckdb.DuckDBPyConnection:
    path = _ensure_parent(symbol)
    return duckdb.connect(str(path))


def _ensure_table(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS ticks (
            timestamp BIGINT NOT NULL,
            bid       BIGINT NOT NULL,
            ask       BIGINT NOT NULL,
            volume    BIGINT NOT NULL
        )
        """
    )


def _normalize_ticks(ticks: list[Tick]) -> list[tuple[int, int, int, int]]:
    result: list[tuple[int, int, int, int]] = []
    for tick in ticks:
        if not isinstance(tick, Tick):
            raise TypeError(f"expected Tick, got {type(tick)!r}")
        result.append((int(tick.timestamp), int(tick.bid), int(tick.ask), int(tick.volume)))

    result.sort(key=lambda row: (row[0], row[1], row[2], row[3]))
    return result


def _write_ticks(ticks: list[Tick], *, mode: str) -> bool:
    symbol = _get_active_symbol()
    if symbol is None:
        logger.error(_SECTION, f"{mode}Ticks: active symbol is missing. Call set_active_symbol(symbol) first.")
        return False

    if ticks is None:
        logger.warning(_SECTION, f"{mode}Ticks: nothing to write for '{symbol}'.")
        return True

    if len(ticks) == 0:
        return True

    try:
        rows = _normalize_ticks(ticks)
    except Exception as exc:
        logger.error(_SECTION, f"{mode}Ticks: invalid tick payload for '{symbol}': {exc}")
        return False

    lock = _symbol_lock(symbol)
    path = _ensure_parent(symbol)

    try:
        with lock:
            con = duckdb.connect(str(path))
            try:
                _ensure_table(con)
                con.executemany(
                    "INSERT INTO ticks VALUES (?, ?, ?, ?)",
                    rows,
                )
                con.commit()
            finally:
                con.close()

        logger.info(_SECTION, f"{mode}Ticks: wrote {len(rows)} rows into '{path}'.")
        return True

    except Exception as exc:
        logger.error(_SECTION, f"{mode}Ticks failed for '{symbol}': {exc}")
        return False


def appendTicks(ticks: list[Tick]) -> bool:
    """
    Blocking append.
    """
    return _write_ticks(ticks, mode="append")


def prependTicks(ticks: list[Tick]) -> bool:
    """
    Blocking prepend.

    The database is queried in timestamp order, so prepend and append share the
    same physical insert path while keeping the logical result sorted.
    """
    return _write_ticks(ticks, mode="prepend")
