from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb

from type import Ohlc, SymbolData, Tick

from .config import DATABASE_DIR, MARKET_DB_PATH, MARKET_DATA_DIR, logMode
from .logger import error, info, set_mode, warning
from .storage import ohlc_path, symbol_dir, ticks_path
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

            try:
                DATABASE_DIR.mkdir(parents=True, exist_ok=True)
                MARKET_DATA_DIR.mkdir(parents=True, exist_ok=True)
                self._conn = duckdb.connect(str(MARKET_DB_PATH))
                self._conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS SymbolData (
                        symbol TEXT PRIMARY KEY,
                        point INTEGER NOT NULL
                    )
                    """
                )
                info(f"DuckDB opened: {MARKET_DB_PATH}")
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

    async def reset_tick(self, symbol: str) -> None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return
            try:
                self._delete_file(ticks_path(symbol))
            except Exception as exc:
                warning(f"reset tick failed: {exc}")

    async def append_ticks(self, symbol: str, ticks: list[Any]) -> None:
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

            target = ticks_path(symbol)
            if not self._validate_tick_batch(conn, target, normalized):
                return

            payload = [
                (
                    self._to_duckdb_timestamp(row.timestamp),
                    row.bid,
                    row.ask,
                    row.volume,
                )
                for row in normalized
            ]

            try:
                self._append_parquet_rows(
                    conn=conn,
                    target=target,
                    temp_table_name="temp_ticks",
                    create_table_sql="""
                        CREATE TEMP TABLE temp_ticks (
                            timestamp TIMESTAMP,
                            bid UBIGINT,
                            ask UBIGINT,
                            volume UBIGINT
                        )
                    """,
                    insert_sql="INSERT INTO temp_ticks VALUES (?, ?, ?, ?)",
                    payload=payload,
                    select_sql="SELECT timestamp, bid, ask, volume FROM temp_ticks",
                )
            except Exception as exc:
                warning(f"append ticks failed: {exc}")
            finally:
                self._drop_temp_table(conn, "temp_ticks")

    async def reset_ohlc(self, symbol: str, timeframe: int) -> None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return
            try:
                self._delete_file(ohlc_path(symbol, timeframe))
            except Exception as exc:
                warning(f"reset ohlc failed: {exc}")

    async def append_ohlcs(self, symbol: str, timeframe: int, ohlcs: list[Any]) -> None:
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

            target = ohlc_path(symbol, timeframe)
            if not self._validate_ohlc_batch(conn, target, normalized):
                return

            payload = [
                (
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
                self._append_parquet_rows(
                    conn=conn,
                    target=target,
                    temp_table_name="temp_ohlc",
                    create_table_sql="""
                        CREATE TEMP TABLE temp_ohlc (
                            openTimestamp TIMESTAMP,
                            open UBIGINT,
                            high UBIGINT,
                            low UBIGINT,
                            close UBIGINT,
                            volume UBIGINT
                        )
                    """,
                    insert_sql="INSERT INTO temp_ohlc VALUES (?, ?, ?, ?, ?, ?)",
                    payload=payload,
                    select_sql="SELECT openTimestamp, open, high, low, close, volume FROM temp_ohlc",
                )
            except Exception as exc:
                warning(f"append ohlcs failed: {exc}")
            finally:
                self._drop_temp_table(conn, "temp_ohlc")

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

    def _delete_file(self, file_path: Path) -> None:
        if file_path.exists():
            file_path.unlink()

    def _drop_temp_table(self, conn: duckdb.DuckDBPyConnection, table_name: str) -> None:
        try:
            conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        except Exception:
            pass

    def _sql_literal(self, value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    def _max_timestamp_from_parquet(
        self,
        conn: duckdb.DuckDBPyConnection,
        file_path: Path,
        timestamp_column: str,
    ) -> datetime | None:
        if not file_path.exists():
            return None
        row = conn.execute(
            f"SELECT MAX({timestamp_column}) FROM read_parquet({self._sql_literal(str(file_path))})"
        ).fetchone()
        return row[0] if row and row[0] is not None else None

    def _validate_tick_batch(
        self,
        conn: duckdb.DuckDBPyConnection,
        file_path: Path,
        rows: list[Tick],
    ) -> bool:
        last = self._max_timestamp_from_parquet(conn, file_path, "timestamp")
        for row in rows:
            if last is not None and row.timestamp < last:
                warning(
                    f"append ticks skipped: symbol={file_path.parent.name}, timestamp={row.timestamp} < lastTimestamp={last}"
                )
                return False
            last = row.timestamp
        return True

    def _validate_ohlc_batch(
        self,
        conn: duckdb.DuckDBPyConnection,
        file_path: Path,
        rows: list[Ohlc],
    ) -> bool:
        last = self._max_timestamp_from_parquet(conn, file_path, "openTimestamp")
        for row in rows:
            if last is not None and row.openTimestamp < last:
                warning(
                    f"append ohlcs skipped: symbol={file_path.parent.name}, openTimestamp={row.openTimestamp} < lastTimestamp={last}"
                )
                return False
            last = row.openTimestamp
        return True

    def _append_parquet_rows(
        self,
        *,
        conn: duckdb.DuckDBPyConnection,
        target: Path,
        temp_table_name: str,
        create_table_sql: str,
        insert_sql: str,
        payload: list[tuple[Any, ...]],
        select_sql: str,
    ) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        self._drop_temp_table(conn, temp_table_name)
        conn.execute(create_table_sql)
        conn.executemany(insert_sql, payload)

        if not target.exists():
            conn.execute(
                f"COPY ({select_sql}) TO {self._sql_literal(str(target))} (FORMAT PARQUET)"
            )
            return

        temp_target = target.with_suffix(target.suffix + ".tmp")
        if temp_target.exists():
            temp_target.unlink()

        existing_query = f"SELECT * FROM read_parquet({self._sql_literal(str(target))})"
        merged_query = f"{existing_query} UNION ALL {select_sql}"
        conn.execute(
            f"COPY ({merged_query}) TO {self._sql_literal(str(temp_target))} (FORMAT PARQUET)"
        )
        os.replace(temp_target, target)


writer = DuckDBWriter()
