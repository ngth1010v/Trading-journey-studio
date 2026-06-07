from __future__ import annotations

import asyncio
import os
from typing import Any

import duckdb

from type import Ohlc, SymbolData, Tick

from .aggregate import aggregate_ticks_to_ohlc
from .config import logMode
from .logger import error, info, set_mode, warning
from .paths import db_path
from .storage import (
    get_last_ohlc_row,
    get_last_ohlc_row_across_timeframes,
    get_last_tick_row,
    get_ohlc_row_by_timestamp,
    get_ohlc_rows_across_timeframes_in_range,
    get_ohlc_rows_by_timestamp,
    get_symbol_data_row,
    get_tick_row_by_timestamp,
    get_tick_rows_in_range,
)
from .validation import (
    ValidationError,
    normalize_datetime,
    normalize_range_datetimes,
    normalize_range_timestamps,
    normalize_symbol,
    normalize_timeframe,
    timestamp_to_datetime,
)


class DuckDBReader:
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
                info("DuckDB reader already initialized")
                return

            path = db_path()
            if not os.path.exists(path):
                warning(f"database file not found: {path}")
                return

            try:
                self._conn = duckdb.connect(path, read_only=True)
                info(f"DuckDB opened read-only: {path}")
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

    def _require_conn(self) -> duckdb.DuckDBPyConnection | None:
        if self._conn is None:
            error("DuckDB reader is not initialized")
            return None
        return self._conn

    async def get_symbol_data(self, symbol: Any) -> SymbolData | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
            except ValidationError as exc:
                error(f"get symbol data rejected: {exc}")
                return None

            row = get_symbol_data_row(conn, safe_symbol)
            if row is None:
                error(f"symbol data not found: {safe_symbol}")
                return None
            return SymbolData(symbol=row[0], point=int(row[1]))

    async def get_last_tick(self, symbol: Any) -> Tick | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
            except ValidationError as exc:
                error(f"get last tick rejected: {exc}")
                return None

            row = get_last_tick_row(conn, safe_symbol)
            if row is None:
                error(f"last tick not found: {safe_symbol}")
                return None

            return Tick(
                timestamp=row[0],
                bid=int(row[1]),
                ask=int(row[2]),
                volume=int(row[3]),
            )

    async def get_tick_by_timestamp(self, symbol: Any, ts: Any) -> Tick | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                dt = timestamp_to_datetime(ts)
            except ValidationError as exc:
                error(f"get tick by timestamp rejected: {exc}")
                return None

            row = get_tick_row_by_timestamp(conn, safe_symbol, dt)
            if row is None:
                error(f"tick not found: symbol={safe_symbol}, ts={ts}")
                return None

            return Tick(
                timestamp=row[0],
                bid=int(row[1]),
                ask=int(row[2]),
                volume=int(row[3]),
            )

    async def get_tick_by_datetime(self, symbol: Any, dt: Any) -> Tick | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                safe_dt = normalize_datetime(dt, "dt", "Tick")
            except ValidationError as exc:
                error(f"get tick by datetime rejected: {exc}")
                return None

            row = get_tick_row_by_timestamp(conn, safe_symbol, safe_dt)
            if row is None:
                error(f"tick not found: symbol={safe_symbol}, dt={safe_dt}")
                return None

            return Tick(
                timestamp=row[0],
                bid=int(row[1]),
                ask=int(row[2]),
                volume=int(row[3]),
            )

    async def get_ohlc_from_tick_by_timestamp(self, symbol: Any, from_ts: Any, to_ts: Any) -> Ohlc | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                from_dt, to_dt = normalize_range_timestamps(from_ts, to_ts, "tick")
            except ValidationError as exc:
                error(f"get ohlc from tick rejected: {exc}")
                return None

            rows = get_tick_rows_in_range(conn, safe_symbol, from_dt, to_dt)
            if not rows:
                error(f"tick range not found: symbol={safe_symbol}, from={from_ts}, to={to_ts}")
                return None

            return aggregate_ticks_to_ohlc(safe_symbol, rows)

    async def get_ohlc_from_tick_by_datetime(self, symbol: Any, from_dt: Any, to_dt: Any) -> Ohlc | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                start_dt, end_dt = normalize_range_datetimes(from_dt, to_dt, "tick")
            except ValidationError as exc:
                error(f"get ohlc from tick rejected: {exc}")
                return None

            rows = get_tick_rows_in_range(conn, safe_symbol, start_dt, end_dt)
            if not rows:
                error(f"tick range not found: symbol={safe_symbol}, from={start_dt}, to={end_dt}")
                return None

            return aggregate_ticks_to_ohlc(safe_symbol, rows)

    async def get_last_ohlc(self, symbol: Any, timeframe: Any) -> Ohlc | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                safe_timeframe = normalize_timeframe(timeframe)
            except ValidationError as exc:
                error(f"get last ohlc rejected: {exc}")
                return None

            row = get_last_ohlc_row(conn, safe_symbol, safe_timeframe)
            if row is None:
                error(f"last ohlc not found: symbol={safe_symbol}, timeframe={safe_timeframe}")
                return None

            return Ohlc(
                openTimestamp=row[0],
                open=int(row[1]),
                high=int(row[2]),
                low=int(row[3]),
                close=int(row[4]),
                volume=int(row[5]),
            )

    async def get_ohlcs_by_timestamp(self, symbol: Any, timeframe: Any, ts: Any) -> list[Ohlc] | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                safe_timeframe = normalize_timeframe(timeframe)
                from_dt = timestamp_to_datetime(ts)
            except ValidationError as exc:
                error(f"get ohlcs by timestamp rejected: {exc}")
                return None

            rows = get_ohlc_rows_by_timestamp(conn, safe_symbol, safe_timeframe, from_dt)
            if not rows:
                error(f"ohlcs not found: symbol={safe_symbol}, timeframe={safe_timeframe}, ts={ts}")
                return None

            return [
                Ohlc(
                    openTimestamp=row[0],
                    open=int(row[1]),
                    high=int(row[2]),
                    low=int(row[3]),
                    close=int(row[4]),
                    volume=int(row[5]),
                )
                for row in rows
            ]

    async def get_ohlcs_by_datetime(self, symbol: Any, timeframe: Any, dt: Any) -> list[Ohlc] | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                safe_timeframe = normalize_timeframe(timeframe)
                from_dt = normalize_datetime(dt, "dt", "Ohlc")
            except ValidationError as exc:
                error(f"get ohlcs by datetime rejected: {exc}")
                return None

            rows = get_ohlc_rows_by_timestamp(conn, safe_symbol, safe_timeframe, from_dt)
            if not rows:
                error(f"ohlcs not found: symbol={safe_symbol}, timeframe={safe_timeframe}, dt={from_dt}")
                return None

            return [
                Ohlc(
                    openTimestamp=row[0],
                    open=int(row[1]),
                    high=int(row[2]),
                    low=int(row[3]),
                    close=int(row[4]),
                    volume=int(row[5]),
                )
                for row in rows
            ]

    async def get_ohlc_from_ohlc_by_timestamp(
        self,
        symbol: Any,
        from_timeframe: Any,
        to_timeframe: Any,
        from_ts: Any,
        to_ts: Any,
    ) -> Ohlc | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                start_tf = normalize_timeframe(from_timeframe)
                end_tf = normalize_timeframe(to_timeframe)
                from_dt, to_dt = normalize_range_timestamps(from_ts, to_ts, "ohlc")
            except ValidationError as exc:
                error(f"get ohlc from ohlc rejected: {exc}")
                return None

            rows = get_ohlc_rows_across_timeframes_in_range(
                conn,
                safe_symbol,
                start_tf,
                end_tf,
                from_dt,
                to_dt,
            )
            if not rows:
                error(
                    "ohlc range not found: "
                    f"symbol={safe_symbol}, from_timeframe={start_tf}, to_timeframe={end_tf}, "
                    f"from={from_ts}, to={to_ts}"
                )
                return None

            rows.sort(key=lambda item: (item[1], item[0]))
            first = rows[0]
            last = rows[-1]
            return Ohlc(
                openTimestamp=first[1],
                open=int(first[2]),
                high=max(int(row[3]) for row in rows),
                low=min(int(row[4]) for row in rows),
                close=int(last[5]),
                volume=sum(int(row[6]) for row in rows),
            )

    async def get_ohlc_from_ohlc_by_datetime(
        self,
        symbol: Any,
        from_timeframe: Any,
        to_timeframe: Any,
        from_dt: Any,
        to_dt: Any,
    ) -> Ohlc | None:
        async with self._lock:
            conn = self._require_conn()
            if conn is None:
                return None

            try:
                safe_symbol = normalize_symbol(symbol)
                start_tf = normalize_timeframe(from_timeframe)
                end_tf = normalize_timeframe(to_timeframe)
                start_dt, end_dt = normalize_range_datetimes(from_dt, to_dt, "ohlc")
            except ValidationError as exc:
                error(f"get ohlc from ohlc rejected: {exc}")
                return None

            rows = get_ohlc_rows_across_timeframes_in_range(
                conn,
                safe_symbol,
                start_tf,
                end_tf,
                start_dt,
                end_dt,
            )
            if not rows:
                error(
                    "ohlc range not found: "
                    f"symbol={safe_symbol}, from_timeframe={start_tf}, to_timeframe={end_tf}, "
                    f"from={start_dt}, to={end_dt}"
                )
                return None

            rows.sort(key=lambda item: (item[1], item[0]))
            first = rows[0]
            last = rows[-1]
            return Ohlc(
                openTimestamp=first[1],
                open=int(first[2]),
                high=max(int(row[3]) for row in rows),
                low=min(int(row[4]) for row in rows),
                close=int(last[5]),
                volume=sum(int(row[6]) for row in rows),
            )


reader = DuckDBReader()
