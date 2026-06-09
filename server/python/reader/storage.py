from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import duckdb

from .logger import error
from .paths import list_existing_ohlc_files, ohlc_file, tick_file
from .validation import normalize_symbol


def _quote_sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _read_parquet_rows(
    conn: duckdb.DuckDBPyConnection,
    file_path: str,
    columns: str,
    where_sql: str = "",
    params: list[Any] | None = None,
    order_sql: str = "",
    limit_sql: str = "",
) -> list[tuple[Any, ...]]:
    sql = f"SELECT {columns} FROM read_parquet({_quote_sql_string(file_path)})"
    if where_sql:
        sql += f" WHERE {where_sql}"
    if order_sql:
        sql += f" ORDER BY {order_sql}"
    if limit_sql:
        sql += f" {limit_sql}"
    try:
        return conn.execute(sql, params or []).fetchall()
    except Exception as exc:
        error(f"query failed for {file_path}: {exc}")
        return []


def get_symbol_data_row(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
) -> tuple[Any, ...] | None:
    try:
        row = conn.execute(
            "SELECT symbol, point FROM SymbolData WHERE symbol = ? LIMIT 1",
            [normalize_symbol(symbol)],
        ).fetchone()
        return row
    except Exception as exc:
        error(f"get symbol data failed: {exc}")
        return None


def get_last_tick_row(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
) -> tuple[Any, ...] | None:
    file_path = tick_file(symbol)
    if not os.path.exists(file_path):
        error(f"tick file not found: {file_path}")
        return None
    rows = _read_parquet_rows(
        conn,
        file_path,
        "timestamp, bid, ask, volume",
        order_sql="timestamp DESC",
        limit_sql="LIMIT 1",
    )
    return rows[0] if rows else None

def get_first_tick_row(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
) -> tuple[Any, ...] | None:
    file_path = tick_file(symbol)
    if not os.path.exists(file_path):
        error(f"tick file not found: {file_path}")
        return None

    rows = _read_parquet_rows(
        conn,
        file_path,
        "timestamp, bid, ask, volume",
        order_sql="timestamp ASC",
        limit_sql="LIMIT 1",
    )
    return rows[0] if rows else None


def get_tick_row_by_timestamp(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    timestamp_value: datetime,
) -> tuple[Any, ...] | None:
    file_path = tick_file(symbol)
    if not os.path.exists(file_path):
        error(f"tick file not found: {file_path}")
        return None
    rows = _read_parquet_rows(
        conn,
        file_path,
        "timestamp, bid, ask, volume",
        where_sql="timestamp = ?",
        params=[timestamp_value],
        limit_sql="LIMIT 1",
    )
    return rows[0] if rows else None


def get_tick_rows_in_range(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    from_dt: datetime,
    to_dt: datetime,
) -> list[tuple[Any, ...]]:
    file_path = tick_file(symbol)
    if not os.path.exists(file_path):
        error(f"tick file not found: {file_path}")
        return []
    return _read_parquet_rows(
        conn,
        file_path,
        "timestamp, bid, ask, volume",
        where_sql="timestamp >= ? AND timestamp < ?",
        params=[from_dt, to_dt],
        order_sql="timestamp ASC",
    )


def get_last_ohlc_row(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    timeframe: int,
) -> tuple[Any, ...] | None:
    file_path = ohlc_file(symbol, timeframe)
    if not os.path.exists(file_path):
        error(f"ohlc file not found: {file_path}")
        return None
    rows = _read_parquet_rows(
        conn,
        file_path,
        "openTimestamp, open, high, low, close, volume",
        order_sql="openTimestamp DESC",
        limit_sql="LIMIT 1",
    )
    return rows[0] if rows else None

def get_first_ohlc_row(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    timeframe: int,
) -> tuple[Any, ...] | None:
    file_path = ohlc_file(symbol, timeframe)
    if not os.path.exists(file_path):
        error(f"ohlc file not found: {file_path}")
        return None

    rows = _read_parquet_rows(
        conn,
        file_path,
        "openTimestamp, open, high, low, close, volume",
        order_sql="openTimestamp ASC",
        limit_sql="LIMIT 1",
    )
    return rows[0] if rows else None


def get_ohlc_row_by_timestamp(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    timeframe: int,
    timestamp_value: datetime,
) -> tuple[Any, ...] | None:
    file_path = ohlc_file(symbol, timeframe)
    if not os.path.exists(file_path):
        error(f"ohlc file not found: {file_path}")
        return None
    rows = _read_parquet_rows(
        conn,
        file_path,
        "openTimestamp, open, high, low, close, volume",
        where_sql="openTimestamp = ?",
        params=[timestamp_value],
        limit_sql="LIMIT 1",
    )
    return rows[0] if rows else None


def get_ohlc_rows_by_timestamp(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    timeframe: int,
    from_dt: datetime,
) -> list[tuple[Any, ...]]:
    file_path = ohlc_file(symbol, timeframe)
    if not os.path.exists(file_path):
        error(f"ohlc file not found: {file_path}")
        return []
    return _read_parquet_rows(
        conn,
        file_path,
        "openTimestamp, open, high, low, close, volume",
        where_sql="openTimestamp >= ?",
        params=[from_dt],
        order_sql="openTimestamp ASC",
    )


def get_ohlc_rows_in_range(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    timeframe: int,
    from_dt: datetime,
    to_dt: datetime,
) -> list[tuple[Any, ...]]:
    file_path = ohlc_file(symbol, timeframe)
    if not os.path.exists(file_path):
        error(f"ohlc file not found: {file_path}")
        return []
    return _read_parquet_rows(
        conn,
        file_path,
        "openTimestamp, open, high, low, close, volume",
        where_sql="openTimestamp >= ? AND openTimestamp < ?",
        params=[from_dt, to_dt],
        order_sql="openTimestamp ASC",
    )


def get_ohlc_rows_across_timeframes_in_range(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    from_timeframe: int,
    to_timeframe: int,
    from_dt: datetime,
    to_dt: datetime,
) -> list[tuple[Any, ...]]:
    files = list_existing_ohlc_files(symbol, from_timeframe, to_timeframe)
    if not files:
        error("no ohlc files found in timeframe range")
        return []

    combined: list[tuple[Any, ...]] = []
    for timeframe, file_path in files:
        rows = _read_parquet_rows(
            conn,
            file_path,
            "openTimestamp, open, high, low, close, volume",
            where_sql="openTimestamp >= ? AND openTimestamp < ?",
            params=[from_dt, to_dt],
            order_sql="openTimestamp ASC",
        )
        for row in rows:
            combined.append((timeframe, *row))

    combined.sort(key=lambda item: (item[1], item[0]))
    return combined


def get_last_ohlc_row_across_timeframes(
    conn: duckdb.DuckDBPyConnection,
    symbol: str,
    from_timeframe: int,
    to_timeframe: int,
) -> tuple[Any, ...] | None:
    files = list_existing_ohlc_files(symbol, from_timeframe, to_timeframe)
    if not files:
        error("no ohlc files found in timeframe range")
        return None

    best: tuple[Any, ...] | None = None
    for timeframe, file_path in files:
        rows = _read_parquet_rows(
            conn,
            file_path,
            "openTimestamp, open, high, low, close, volume",
            order_sql="openTimestamp DESC",
            limit_sql="LIMIT 1",
        )
        if not rows:
            continue
        row = (timeframe, *rows[0])
        if best is None or row[1] > best[1] or (row[1] == best[1] and row[0] > best[0]):
            best = row

    if best is None:
        error("no ohlc rows found")
    return best
