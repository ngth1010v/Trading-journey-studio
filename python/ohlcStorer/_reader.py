
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterable

import duckdb
import pandas as pd

import _logger as logger
import config
from _type import Ohlc

_SECTION = "storer/_reader.py"

_HOT_DB_FIRST = "first-ohlc-batch.db"
_HOT_DB_LAST = "last-ohlc-batch.db"
_PARQUET_SUFFIX = ".parquet"
_PARQUET_TMP_SUFFIX = ".parquet.tmp"


def _ohlc_dir(symbol: str, timeframe: str) -> Path:
    return config.DATABASE_PATH / "markets" / str(symbol).strip() / str(timeframe).strip()


def _hot_db_path(symbol: str, timeframe: str, name: str) -> Path:
    return _ohlc_dir(symbol, timeframe) / name


def _cold_dir(symbol: str, timeframe: str) -> Path:
    return _ohlc_dir(symbol, timeframe)


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30.0, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ohlcs (
            timestamp INTEGER NOT NULL PRIMARY KEY,
            open INTEGER NOT NULL,
            high INTEGER NOT NULL,
            low INTEGER NOT NULL,
            close INTEGER NOT NULL,
            volume INTEGER NOT NULL
        ) WITHOUT ROWID
        """
    )


def _row_to_ohlc(row) -> Ohlc:
    return Ohlc(
        t=int(row[0]),
        o=int(row[1]),
        h=int(row[2]),
        l=int(row[3]),
        c=int(row[4]),
        v=int(row[5]),
    )


def _clean_parquet_temp_files(symbol: str, timeframe: str) -> None:
    directory = _cold_dir(symbol, timeframe)
    if not directory.exists():
        return

    for temp_path in directory.glob(f"*{_PARQUET_TMP_SUFFIX}"):
        final_path = temp_path.with_suffix("")
        try:
            if final_path.exists():
                temp_path.unlink(missing_ok=True)
            else:
                os.replace(temp_path, final_path)
        except Exception as exc:
            logger.warning(_SECTION, f"Failed to finalize {temp_path.name}: {exc}")


def _cold_files(symbol: str, timeframe: str) -> list[Path]:
    directory = _cold_dir(symbol, timeframe)
    if not directory.exists():
        return []

    _clean_parquet_temp_files(symbol, timeframe)

    files = [p for p in directory.glob(f"*{_PARQUET_SUFFIX}") if p.is_file()]
    files.sort(key=lambda p: int(p.stem) if p.stem.isdigit() else p.name)
    return files


def _sql_quote_path(path: Path) -> str:
    return str(path).replace("'", "''")


def _query_single_ohlc(path: Path, order: str) -> Ohlc | None:
    if not path.exists():
        return None

    conn = _connect(path)
    try:
        _ensure_table(conn)
        row = conn.execute(
            f"""
            SELECT timestamp, open, high, low, close, volume
            FROM ohlcs
            ORDER BY timestamp {order}
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            return None
        return _row_to_ohlc(row)
    finally:
        conn.close()


def _query_extreme_from_cold(files: list[Path], order: str) -> Ohlc | None:
    if not files:
        return None

    file_sql = ", ".join(f"'{_sql_quote_path(path)}'" for path in files)
    sql = f"""
        SELECT timestamp, open, high, low, close, volume
        FROM read_parquet([{file_sql}])
        ORDER BY timestamp {order}
        LIMIT 1
    """

    conn = duckdb.connect(database=":memory:")
    try:
        row = conn.execute(sql).fetchone()
        if row is None:
            return None
        return _row_to_ohlc(row)
    finally:
        conn.close()


def _get_extreme_ohlc(symbol: str, timeframe: str, order: str) -> Ohlc | None:
    candidates: list[Ohlc] = []

    first_hot = _query_single_ohlc(_hot_db_path(symbol, timeframe, _HOT_DB_FIRST), order)
    if first_hot is not None:
        candidates.append(first_hot)

    last_hot = _query_single_ohlc(_hot_db_path(symbol, timeframe, _HOT_DB_LAST), order)
    if last_hot is not None:
        candidates.append(last_hot)

    cold = _query_extreme_from_cold(_cold_files(symbol, timeframe), order)
    if cold is not None:
        candidates.append(cold)

    if not candidates:
        return None

    if order.upper() == "ASC":
        return min(candidates, key=lambda o: o.t)
    return max(candidates, key=lambda o: o.t)


def _read_hot_range(path: Path, from_ts: int, to_ts: int) -> list[Ohlc]:
    if not path.exists():
        return []

    conn = _connect(path)
    try:
        _ensure_table(conn)
        rows = conn.execute(
            """
            SELECT timestamp, open, high, low, close, volume
            FROM ohlcs
            WHERE timestamp >= ? AND timestamp < ?
            ORDER BY timestamp ASC
            """,
            (int(from_ts), int(to_ts)),
        ).fetchall()
        return [_row_to_ohlc(row) for row in rows]
    finally:
        conn.close()


def _read_cold_range(files: list[Path], from_ts: int, to_ts: int) -> list[Ohlc]:
    if not files:
        return []

    file_sql = ", ".join(f"'{_sql_quote_path(path)}'" for path in files)
    sql = f"""
        SELECT timestamp, open, high, low, close, volume
        FROM read_parquet([{file_sql}])
        WHERE timestamp >= ? AND timestamp < ?
        ORDER BY timestamp ASC
    """

    conn = duckdb.connect(database=":memory:")
    try:
        rows = conn.execute(sql, [int(from_ts), int(to_ts)]).fetchall()
        return [_row_to_ohlc(row) for row in rows]
    finally:
        conn.close()


def _dedupe_sorted_ohlcs(ohlcs: Iterable[Ohlc]) -> list[Ohlc]:
    unique: list[Ohlc] = []
    last_ts: int | None = None
    for ohlc in sorted(ohlcs, key=lambda o: o.t):
        if last_ts == ohlc.t:
            continue
        unique.append(ohlc)
        last_ts = ohlc.t
    return unique


def getLastOhlc(symbol, timeframe):
    try:
        ohlc = _get_extreme_ohlc(symbol, timeframe, "DESC")
        return ohlc if ohlc is not None else False
    except Exception as exc:
        logger.error(_SECTION, f"getLastOhlc({symbol!r}, {timeframe!r}) failed: {exc}")
        return False


def getFirstOhlc(symbol, timeframe):
    try:
        ohlc = _get_extreme_ohlc(symbol, timeframe, "ASC")
        return ohlc if ohlc is not None else False
    except Exception as exc:
        logger.error(_SECTION, f"getFirstOhlc({symbol!r}, {timeframe!r}) failed: {exc}")
        return False


def getOhlcs(symbol, timeframe, fromTs, toTs):
    try:
        from_ts = int(fromTs)
        to_ts = int(toTs)
        if from_ts > to_ts:
            from_ts, to_ts = to_ts, from_ts

        hot_rows: list[Ohlc] = []
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, timeframe, _HOT_DB_FIRST), from_ts, to_ts))
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, timeframe, _HOT_DB_LAST), from_ts, to_ts))
        cold_rows = _read_cold_range(_cold_files(symbol, timeframe), from_ts, to_ts)

        ohlcs = _dedupe_sorted_ohlcs([*hot_rows, *cold_rows])
        if not ohlcs:
            logger.warning(_SECTION, f"No ohlcs found for {symbol!r}/{timeframe!r} in range {from_ts}..{to_ts}.")
            return []

        logger.info(_SECTION, f"getOhlcs({symbol!r}, {timeframe!r}, {fromTs}, {toTs}) done: {len(ohlcs)} rows")
        return ohlcs
    except Exception as exc:
        logger.error(_SECTION, f"getOhlcs({symbol!r}, {timeframe!r}, {fromTs}, {toTs}) failed: {exc}")
        return False


def IsEmpty(symbol, timeframe):
    try:
        result = getFirstOhlc(symbol, timeframe) is False
        return result
    except Exception as exc:
        logger.error(_SECTION, f"IsEmpty({symbol!r}, {timeframe!r}) failed: {exc}")
        return True


def getOhlc(symbol, timeframe, fromTs, toTs):
    try:
        from_ts = int(fromTs)
        to_ts = int(toTs)
        if from_ts > to_ts:
            from_ts, to_ts = to_ts, from_ts

        # Half-open range: fromTs <= timestamp < toTs
        if to_ts <= from_ts:
            return {
                "open": None,
                "close": None,
                "high": None,
                "low": None,
                "volume": None,
            }

        hot_rows: list[Ohlc] = []
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, timeframe, _HOT_DB_FIRST), from_ts, to_ts))
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, timeframe, _HOT_DB_LAST), from_ts, to_ts))
        cold_rows = _read_cold_range(_cold_files(symbol, timeframe), from_ts, to_ts)

        ohlcs = _dedupe_sorted_ohlcs([*hot_rows, *cold_rows])
        if not ohlcs:
            return {
                "open": None,
                "close": None,
                "high": None,
                "low": None,
                "volume": None,
            }

        df = pd.DataFrame(
            [(o.t, o.o, o.h, o.l, o.c, o.v) for o in ohlcs],
            columns=["timestamp", "open", "high", "low", "close", "volume"],
        )

        conn = duckdb.connect(database=":memory:")
        try:
            conn.register("ohlcs_df", df)
            row = conn.execute(
                """
                SELECT
                    arg_min(open, timestamp) AS open,
                    arg_max(close, timestamp) AS close,
                    max(high) AS high,
                    min(low) AS low,
                    sum(volume) AS volume
                FROM ohlcs_df
                """
            ).fetchone()
        finally:
            conn.close()

        if row is None:
            return {
                "open": None,
                "close": None,
                "high": None,
                "low": None,
                "volume": None,
            }

        result = {
            "open": None if row[0] is None else int(row[0]),
            "close": None if row[1] is None else int(row[1]),
            "high": None if row[2] is None else int(row[2]),
            "low": None if row[3] is None else int(row[3]),
            "volume": None if row[4] is None else int(row[4]),
        }
        return result
    except Exception as exc:
        logger.error(_SECTION, f"getOhlc({symbol!r}, {timeframe!r}, {fromTs}, {toTs}) failed: {exc}")
        return False
