from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterable

import duckdb
import pandas as pd

import _logger as logger
import config
from ._type import Tick

_SECTION = "tick/_reader.py"

_HOT_DB_FIRST = "first-tick-batch.db"
_HOT_DB_LAST = "last-tick-batch.db"
_PARQUET_SUFFIX = ".parquet"
_PARQUET_TMP_SUFFIX = ".parquet.tmp"


def _ticks_dir(symbol: str) -> Path:
    return config.DATABASE_PATH / "markets" / symbol / "ticks"


def _hot_db_path(symbol: str, name: str) -> Path:
    return _ticks_dir(symbol) / name


def _cold_dir(symbol: str) -> Path:
    return _ticks_dir(symbol)


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30.0, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ticks (
            timestamp INTEGER NOT NULL PRIMARY KEY,
            bid INTEGER NOT NULL,
            ask INTEGER NOT NULL,
            volume INTEGER NOT NULL
        ) WITHOUT ROWID
        """
    )


def _row_to_tick(row) -> Tick:
    return Tick(
        timestamp=int(row[0]),
        bid=int(row[1]),
        ask=int(row[2]),
        volume=int(row[3]),
    )


def _clean_parquet_temp_files(symbol: str) -> None:
    directory = _cold_dir(symbol)
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


def _cold_files(symbol: str) -> list[Path]:
    directory = _cold_dir(symbol)
    if not directory.exists():
        return []

    _clean_parquet_temp_files(symbol)

    files = [p for p in directory.glob(f"*{_PARQUET_SUFFIX}") if p.is_file()]
    files.sort(key=lambda p: int(p.stem) if p.stem.isdigit() else p.name)
    return files


def _sql_quote_path(path: Path) -> str:
    return str(path).replace("'", "''")


def _query_single_tick(path: Path, order: str) -> Tick | None:
    if not path.exists():
        return None

    conn = _connect(path)
    try:
        _ensure_table(conn)
        row = conn.execute(
            f"""
            SELECT timestamp, bid, ask, volume
            FROM ticks
            ORDER BY timestamp {order}
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            return None
        return _row_to_tick(row)
    finally:
        conn.close()


def _query_extreme_from_cold(files: list[Path], order: str) -> Tick | None:
    if not files:
        return None

    file_sql = ", ".join(f"'{_sql_quote_path(path)}'" for path in files)
    sql = f"""
        SELECT timestamp, bid, ask, volume
        FROM read_parquet([{file_sql}])
        ORDER BY timestamp {order}
        LIMIT 1
    """

    conn = duckdb.connect(database=":memory:")
    try:
        row = conn.execute(sql).fetchone()
        if row is None:
            return None
        return _row_to_tick(row)
    finally:
        conn.close()


def _get_extreme_tick(symbol: str, order: str) -> Tick | None:
    candidates: list[Tick] = []

    first_hot = _query_single_tick(_hot_db_path(symbol, _HOT_DB_FIRST), order)
    if first_hot is not None:
        candidates.append(first_hot)

    last_hot = _query_single_tick(_hot_db_path(symbol, _HOT_DB_LAST), order)
    if last_hot is not None:
        candidates.append(last_hot)

    cold = _query_extreme_from_cold(_cold_files(symbol), order)
    if cold is not None:
        candidates.append(cold)

    if not candidates:
        return None

    if order.upper() == "ASC":
        return min(candidates, key=lambda t: t.timestamp)
    return max(candidates, key=lambda t: t.timestamp)


def _read_hot_range(path: Path, from_ts: int, to_ts: int) -> list[Tick]:
    if not path.exists():
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
            (int(from_ts), int(to_ts)),
        ).fetchall()
        return [_row_to_tick(row) for row in rows]
    finally:
        conn.close()


def _read_cold_range(files: list[Path], from_ts: int, to_ts: int) -> list[Tick]:
    if not files:
        return []

    file_sql = ", ".join(f"'{_sql_quote_path(path)}'" for path in files)
    sql = f"""
        SELECT timestamp, bid, ask, volume
        FROM read_parquet([{file_sql}])
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
    """

    conn = duckdb.connect(database=":memory:")
    try:
        rows = conn.execute(sql, [int(from_ts), int(to_ts)]).fetchall()
        return [_row_to_tick(row) for row in rows]
    finally:
        conn.close()


def _dedupe_sorted_ticks(ticks: Iterable[Tick]) -> list[Tick]:
    unique: list[Tick] = []
    last_ts: int | None = None
    for tick in sorted(ticks, key=lambda t: t.timestamp):
        if last_ts == tick.timestamp:
            continue
        unique.append(tick)
        last_ts = tick.timestamp
    return unique


def getLastTick(symbol):
    try:
        tick = _get_extreme_tick(symbol, "DESC")
        return tick if tick is not None else False
    except Exception as exc:
        logger.error(_SECTION, f"getLastTick({symbol!r}) failed: {exc}")
        return False


def getFirstTick(symbol):
    try:
        tick = _get_extreme_tick(symbol, "ASC")
        return tick if tick is not None else False
    except Exception as exc:
        logger.error(_SECTION, f"getFirstTick({symbol!r}) failed: {exc}")
        return False


def getTicks(symbol, fromTs, toTs):
    try:
        from_ts = int(fromTs)
        to_ts = int(toTs)
        if from_ts > to_ts:
            from_ts, to_ts = to_ts, from_ts

        hot_rows: list[Tick] = []
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, _HOT_DB_FIRST), from_ts, to_ts))
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, _HOT_DB_LAST), from_ts, to_ts))
        cold_rows = _read_cold_range(_cold_files(symbol), from_ts, to_ts)

        ticks = _dedupe_sorted_ticks([*hot_rows, *cold_rows])
        if not ticks:
            logger.warning(_SECTION, f"No ticks found for {symbol!r} in range {from_ts}..{to_ts}.")
            return []

        return ticks
    except Exception as exc:
        logger.error(_SECTION, f"getTicks({symbol!r}, {fromTs}, {toTs}) failed: {exc}")
        return False


def IsEmpty(symbol):
    try:
        return getFirstTick(symbol) is False
    except Exception as exc:
        logger.error(_SECTION, f"IsEmpty({symbol!r}) failed: {exc}")
        return True


def getOhlc(symbol, fromTs, toTs):
    try:
        from_ts = int(fromTs)
        to_ts = int(toTs)
        if from_ts > to_ts:
            from_ts, to_ts = to_ts, from_ts

        # Half-open range: fromTs <= timestamp < toTs
        upper_ts = to_ts - 1
        if upper_ts < from_ts:
            return {
                "open": None,
                "close": None,
                "high": None,
                "low": None,
                "volume": None,
            }

        hot_rows: list[Tick] = []
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, _HOT_DB_FIRST), from_ts, upper_ts))
        hot_rows.extend(_read_hot_range(_hot_db_path(symbol, _HOT_DB_LAST), from_ts, upper_ts))
        cold_rows = _read_cold_range(_cold_files(symbol), from_ts, upper_ts)

        ticks = _dedupe_sorted_ticks([*hot_rows, *cold_rows])
        if not ticks:
            return {
                "open": None,
                "close": None,
                "high": None,
                "low": None,
                "volume": None,
            }

        df = pd.DataFrame(
            [(t.timestamp, t.bid, t.ask, t.volume) for t in ticks],
            columns=["timestamp", "bid", "ask", "volume"],
        )

        conn = duckdb.connect(database=":memory:")
        try:
            conn.register("ticks_df", df)
            row = conn.execute(
                """
                SELECT
                    arg_min(bid, timestamp) AS open,
                    arg_max(bid, timestamp) AS close,
                    max(bid) AS high,
                    min(bid) AS low,
                    sum(volume) AS volume
                FROM ticks_df
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

        return {
            "open": None if row[0] is None else int(row[0]),
            "close": None if row[1] is None else int(row[1]),
            "high": None if row[2] is None else int(row[2]),
            "low": None if row[3] is None else int(row[3]),
            "volume": None if row[4] is None else int(row[4]),
        }
    except Exception as exc:
        logger.error(_SECTION, f"getOhlc({symbol!r}, {fromTs}, {toTs}) failed: {exc}")
        return False