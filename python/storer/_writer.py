
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path
from typing import Iterable

import duckdb
import pandas as pd

import _logger as logger
import config
from _type import Ohlc

_SECTION = "storer/_writer.py"
_LOCK = threading.Lock()

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


def _cold_file_path(symbol: str, timeframe: str, first_ts: int) -> Path:
    return _cold_dir(symbol, timeframe) / f"{int(first_ts)}{_PARQUET_SUFFIX}"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


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


def _sorted_ohlcs(ohlcs: Iterable[Ohlc]) -> list[Ohlc]:
    cleaned = [
        Ohlc(
            t=int(o.t),
            o=int(o.o),
            h=int(o.h),
            l=int(o.l),
            c=int(o.c),
            v=int(o.v),
        )
        for o in ohlcs
    ]
    cleaned.sort(key=lambda o: o.t)
    return cleaned


def _sql_quote_path(path: Path) -> str:
    return str(path).replace("'", "''")


def _read_first_hot_ohlc(symbol: str, timeframe: str) -> Ohlc | None:
    path = _hot_db_path(symbol, timeframe, _HOT_DB_FIRST)
    if not path.exists():
        return None

    conn = _connect(path)
    try:
        _ensure_table(conn)
        row = conn.execute(
            """
            SELECT timestamp, open, high, low, close, volume
            FROM ohlcs
            ORDER BY timestamp ASC
            LIMIT 1
            """
        ).fetchone()
        return None if row is None else Ohlc(int(row[0]), int(row[1]), int(row[2]), int(row[3]), int(row[4]), int(row[5]))
    finally:
        conn.close()


def _read_last_hot_ohlc(symbol: str, timeframe: str) -> Ohlc | None:
    path = _hot_db_path(symbol, timeframe, _HOT_DB_LAST)
    if not path.exists():
        return None

    conn = _connect(path)
    try:
        _ensure_table(conn)
        row = conn.execute(
            """
            SELECT timestamp, open, high, low, close, volume
            FROM ohlcs
            ORDER BY timestamp DESC
            LIMIT 1
            """
        ).fetchone()
        return None if row is None else Ohlc(int(row[0]), int(row[1]), int(row[2]), int(row[3]), int(row[4]), int(row[5]))
    finally:
        conn.close()


def _read_cold_extreme(symbol: str, timeframe: str, order: str) -> Ohlc | None:
    directory = _cold_dir(symbol, timeframe)
    if not directory.exists():
        return None

    _clean_parquet_temp_files(symbol, timeframe)
    files = [p for p in directory.glob(f"*{_PARQUET_SUFFIX}") if p.is_file()]
    if not files:
        return None

    files.sort(key=lambda p: int(p.stem) if p.stem.isdigit() else p.name)
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
        return Ohlc(int(row[0]), int(row[1]), int(row[2]), int(row[3]), int(row[4]), int(row[5]))
    finally:
        conn.close()


def _get_extreme_timestamp(symbol: str, timeframe: str, order: str) -> int | None:
    candidates: list[Ohlc] = []

    first_hot = _read_first_hot_ohlc(symbol, timeframe)
    if first_hot is not None:
        candidates.append(first_hot)

    last_hot = _read_last_hot_ohlc(symbol, timeframe)
    if last_hot is not None:
        candidates.append(last_hot)

    cold = _read_cold_extreme(symbol, timeframe, order)
    if cold is not None:
        candidates.append(cold)

    if not candidates:
        return None

    if order.upper() == "ASC":
        return min(candidates, key=lambda o: o.t).t
    return max(candidates, key=lambda o: o.t).t


def _count_rows(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) FROM ohlcs").fetchone()
    return int(row[0]) if row else 0


def _select_oldest_rows(conn: sqlite3.Connection, limit: int) -> list[Ohlc]:
    rows = conn.execute(
        """
        SELECT timestamp, open, high, low, close, volume
        FROM ohlcs
        ORDER BY timestamp ASC
        LIMIT ?
        """,
        (int(limit),),
    ).fetchall()
    return [Ohlc(int(r[0]), int(r[1]), int(r[2]), int(r[3]), int(r[4]), int(r[5])) for r in rows]


def _write_parquet(rows: list[Ohlc], final_path: Path) -> Path:
    if not rows:
        raise ValueError("cannot write empty parquet batch")

    _ensure_parent(final_path)
    temp_path = final_path.with_suffix(final_path.suffix + ".tmp")

    df = pd.DataFrame(
        [(o.t, o.o, o.h, o.l, o.c, o.v) for o in rows],
        columns=["timestamp", "open", "high", "low", "close", "volume"],
    )

    conn = duckdb.connect(database=":memory:")
    try:
        conn.register("ohlcs_df", df)
        conn.execute(
            f"""
            COPY (
                SELECT timestamp, open, high, low, close, volume
                FROM ohlcs_df
                ORDER BY timestamp ASC
            )
            TO '{_sql_quote_path(temp_path)}'
            (FORMAT PARQUET)
            """
        )
    finally:
        conn.close()

    return temp_path


def _delete_rows_by_timestamp(conn: sqlite3.Connection, rows: list[Ohlc]) -> None:
    timestamps = [int(o.t) for o in rows]
    if not timestamps:
        return

    placeholders = ",".join("?" for _ in timestamps)
    conn.execute(
        f"DELETE FROM ohlcs WHERE timestamp IN ({placeholders})",
        timestamps,
    )


def _flush_hot_to_cold(conn: sqlite3.Connection, symbol: str, timeframe: str) -> None:
    limit = int(getattr(config, "OHLC_FILE_LIMIT", 0))
    if limit <= 0:
        raise ValueError("config.OHLC_FILE_LIMIT must be greater than zero")

    while True:
        count = _count_rows(conn)
        if count < limit:
            logger.info(_SECTION, f"_flush_hot_to_cold({symbol!r}, {timeframe!r}) no flush needed (count={count})")
            return

        chunk = _select_oldest_rows(conn, limit)
        if not chunk:
            logger.info(_SECTION, f"_flush_hot_to_cold({symbol!r}, {timeframe!r}) no chunk to flush")
            return

        final_path = _cold_file_path(symbol, timeframe, chunk[0].t)
        logger.info(_SECTION, f"Flushing {len(chunk)} OHLC rows to {final_path.name}")
        temp_path = _write_parquet(chunk, final_path)

        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                _delete_rows_by_timestamp(conn, chunk)
                conn.execute("COMMIT")
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise
        except Exception:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass
            raise

        try:
            if final_path.exists():
                temp_path.unlink(missing_ok=True)
            else:
                os.replace(temp_path, final_path)
                logger.info(_SECTION, f"Finalized parquet file {final_path.name}")
        except Exception as exc:
            logger.error(_SECTION, f"Failed to finalize parquet file {final_path.name}: {exc}")
            return


def _insert_ohlcs(conn: sqlite3.Connection, ohlcs: list[Ohlc]) -> None:
    if not ohlcs:
        return

    conn.executemany(
        """
        INSERT OR IGNORE INTO ohlcs(timestamp, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [(o.t, o.o, o.h, o.l, o.c, o.v) for o in ohlcs],
    )


def _write_ohlcs(symbol: str, timeframe: str, ohlcs: list[Ohlc], mode: str) -> bool:
    if not ohlcs:
        return True

    try:
        logger.info(_SECTION, f"{mode}Ohlcs({symbol!r}, {timeframe!r}, {len(ohlcs)} rows) started")
        with _LOCK:
            _clean_parquet_temp_files(symbol, timeframe)

            ohlcs = _sorted_ohlcs(ohlcs)
            if not ohlcs:
                return True

            boundary = _get_extreme_timestamp(symbol, timeframe, "DESC" if mode == "append" else "ASC")
            if boundary is not None:
                if mode == "append":
                    ohlcs = [o for o in ohlcs if o.t > boundary]
                elif mode == "prepend":
                    ohlcs = [o for o in ohlcs if o.t < boundary]

            if not ohlcs:
                logger.info(_SECTION, f"{mode}Ohlcs({symbol!r}, {timeframe!r}) nothing new to write")
                return True

            path = _hot_db_path(symbol, timeframe, _HOT_DB_LAST if mode == "append" else _HOT_DB_FIRST)
            _ensure_parent(path)

            conn = _connect(path)
            try:
                _ensure_table(conn)
                conn.execute("BEGIN IMMEDIATE")
                try:
                    _insert_ohlcs(conn, ohlcs)
                    conn.execute("COMMIT")
                except Exception:
                    try:
                        conn.execute("ROLLBACK")
                    except Exception:
                        pass
                    raise

                _flush_hot_to_cold(conn, symbol, timeframe)
                logger.info(_SECTION, f"{mode}Ohlcs({symbol!r}, {timeframe!r}) done")
                return True
            finally:
                conn.close()
    except Exception as exc:
        logger.error(_SECTION, f"{mode}Ohlcs failed for {symbol!r}/{timeframe!r}: {exc}")
        return False


def appendOhlcs(symbol: str, timeframe: str, list_of_ohlcs: list[Ohlc]) -> bool:
    return _write_ohlcs(symbol, timeframe, list_of_ohlcs, "append")


def prependOhlcs(symbol: str, timeframe: str, list_of_ohlcs: list[Ohlc]) -> bool:
    return _write_ohlcs(symbol, timeframe, list_of_ohlcs, "prepend")
