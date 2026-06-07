from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import duckdb

from type import Ohlc, SymbolData, Tick

from .config import DB_PATH, logMode
from .logger import error, info, set_mode, warning
from .validation import (
    ValidationError,
    ensure_non_empty_rows,
    normalize_ohlc_row,
    normalize_symbol_data_row,
    normalize_tick_row,
)


class DuckDBWriter:
    def __init__(self) -> None:
        self._conn: duckdb.DuckDBPyConnection | None = None
        self._lock = asyncio.Lock()

    @property
    def is_ready(self) -> bool:
        return self._conn is not None

    async def init(self) -> None:
        set_mode(logMode)

        async with self._lock:
            if self._conn is not None:
                info("DuckDB writer already initialized")
                return

            if not os.path.exists(DB_PATH):
                warning(f"database file not found: {DB_PATH}")
                return

            try:
                self._conn = duckdb.connect(DB_PATH)
                info(f"DuckDB opened: {DB_PATH}")
            except Exception as exc:  # pragma: no cover - defensive logging
                self._conn = None
                error(f"init failed: {exc}")

    async def destroy(self) -> None:
        async with self._lock:
            if self._conn is None:
                return
            try:
                self._conn.close()
            except Exception as exc:  # pragma: no cover - defensive logging
                warning(f"destroy close failed: {exc}")
            finally:
                self._conn = None

    async def reset_tick(self) -> None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return
            try:
                conn.execute("DELETE FROM Tick")
            except Exception as exc:
                warning(f"reset tick failed: {exc}")

    async def reset_ohlc(self) -> None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return
            try:
                conn.execute("DELETE FROM Ohlc")
            except Exception as exc:
                warning(f"reset ohlc failed: {exc}")

    async def append_ticks(self, ticks: list[Any]) -> None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return

            try:
                ensure_non_empty_rows(ticks, "Tick")
                normalized = [normalize_tick_row(tick) for tick in ticks]
            except ValidationError as exc:
                warning(f"append ticks rejected: {exc}")
                return

            if not self._validate_tick_batch(conn, normalized):
                return

            payload = [
                (
                    row.symbol,
                    self._to_duckdb_timestamp(row.timestamp),
                    row.bid,
                    row.ask,
                    row.volume,
                )
                for row in normalized
            ]
            try:
                conn.executemany(
                    "INSERT INTO Tick (symbol, timestamp, bid, ask, volume) VALUES (?, ?, ?, ?, ?)",
                    payload,
                )
            except Exception as exc:
                warning(f"append ticks failed: {exc}")

    async def append_ohlcs(self, ohlcs: list[Any]) -> None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return

            try:
                ensure_non_empty_rows(ohlcs, "Ohlc")
                normalized = [normalize_ohlc_row(ohlc) for ohlc in ohlcs]
            except ValidationError as exc:
                warning(f"append ohlcs rejected: {exc}")
                return

            if not self._validate_ohlc_batch(conn, normalized):
                return

            payload = [
                (
                    row.symbol,
                    row.timeframe,
                    self._to_duckdb_timestamp(row.openTimestamp),
                    row.open,
                    row.high,
                    row.low,
                    row.close,
                    row.volume,
                )
                for row in normalized
            ]
            try:
                conn.executemany(
                    """
                    INSERT INTO Ohlc
                        (symbol, timeframe, openTimestamp, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    payload,
                )
            except Exception as exc:
                warning(f"append ohlcs failed: {exc}")

    async def set_symbol_data(self, row: Any) -> None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return

            try:
                normalized = normalize_symbol_data_row(row)
            except ValidationError as exc:
                warning(f"set symbol data rejected: {exc}")
                return

            try:
                conn.execute(
                    """
                    INSERT INTO SymbolData (symbol, point)
                    VALUES (?, ?)
                    ON CONFLICT(symbol) DO UPDATE SET
                        point = excluded.point
                    """,
                    [normalized.symbol, normalized.point],
                )
            except Exception as exc:
                warning(f"set symbol data failed: {exc}")

    def _require_conn(self) -> duckdb.DuckDBPyConnection | None:
        if self._conn is None:
            warning("DuckDB writer is not initialized")
            return None
        return self._conn

    def _to_duckdb_timestamp(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def _last_tick_timestamp(self, conn: duckdb.DuckDBPyConnection, symbol: str) -> datetime | None:
        row = conn.execute(
            "SELECT MAX(timestamp) FROM Tick WHERE symbol = ?",
            [symbol],
        ).fetchone()
        return row[0] if row and row[0] is not None else None

    def _last_ohlc_timestamp(
        self,
        conn: duckdb.DuckDBPyConnection,
        symbol: str,
        timeframe: int,
    ) -> datetime | None:
        row = conn.execute(
            "SELECT MAX(openTimestamp) FROM Ohlc WHERE symbol = ? AND timeframe = ?",
            [symbol, timeframe],
        ).fetchone()
        return row[0] if row and row[0] is not None else None

    def _validate_tick_batch(self, conn: duckdb.DuckDBPyConnection, rows: list[Tick]) -> bool:
        last_seen: dict[str, datetime | None] = {}
        for row in rows:
            if row.symbol not in last_seen:
                last_seen[row.symbol] = self._last_tick_timestamp(conn, row.symbol)
            last = last_seen[row.symbol]
            if last is not None and row.timestamp < last:
                warning(
                    f"append ticks skipped: symbol={row.symbol}, timestamp={row.timestamp} < lastTimestamp={last}"
                )
                return False
            last_seen[row.symbol] = row.timestamp
        return True

    def _validate_ohlc_batch(self, conn: duckdb.DuckDBPyConnection, rows: list[Ohlc]) -> bool:
        last_seen: dict[tuple[str, int], datetime | None] = {}
        for row in rows:
            key = (row.symbol, row.timeframe)
            if key not in last_seen:
                last_seen[key] = self._last_ohlc_timestamp(conn, row.symbol, row.timeframe)
            last = last_seen[key]
            if last is not None and row.openTimestamp < last:
                warning(
                    "append ohlcs skipped: "
                    f"symbol={row.symbol}, timeframe={row.timeframe}, "
                    f"openTimestamp={row.openTimestamp} < lastTimestamp={last}"
                )
                return False
            last_seen[key] = row.openTimestamp
        return True


writer = DuckDBWriter()
