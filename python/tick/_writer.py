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
from ._type import Tick

_SECTION = "tick/_writer.py"
_LOCK = threading.Lock()
_ACTIVE_SYMBOL: str = ""

_HOT_DB_FIRST = "first-tick-batch.db"
_HOT_DB_LAST = "last-tick-batch.db"
_PARQUET_SUFFIX = ".parquet"
_PARQUET_TMP_SUFFIX = ".parquet.tmp"


def set_active_symbol(symbol: str) -> None:
    global _ACTIVE_SYMBOL
    _ACTIVE_SYMBOL = (symbol or "").strip()


def _require_symbol(symbol: str | None = None) -> str:
    actual = (symbol or _ACTIVE_SYMBOL or "").strip()
    if not actual:
        raise ValueError("symbol is empty; call set_active_symbol(symbol) first.")
    return actual


def _ticks_dir(symbol: str) -> Path:
    return config.DATABASE_PATH / "markets" / symbol / "ticks"


def _hot_db_path(symbol: str, name: str) -> Path:
    return _ticks_dir(symbol) / name


def _cold_dir(symbol: str) -> Path:
    return _ticks_dir(symbol)


def _cold_file_path(symbol: str, first_ts: int) -> Path:
    return _cold_dir(symbol) / f"{int(first_ts)}{_PARQUET_SUFFIX}"


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
        CREATE TABLE IF NOT EXISTS ticks (
            timestamp INTEGER NOT NULL PRIMARY KEY,
            bid INTEGER NOT NULL,
            ask INTEGER NOT NULL,
            volume INTEGER NOT NULL
        ) WITHOUT ROWID
        """
    )


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


def _read_first_hot_tick(symbol: str) -> Tick | None:
    path = _hot_db_path(symbol, _HOT_DB_FIRST)
    if not path.exists():
        return None

    conn = _connect(path)
    try:
        _ensure_table(conn)
        row = conn.execute(
            """
            SELECT timestamp, bid, ask, volume
            FROM ticks
            ORDER BY timestamp ASC
            LIMIT 1
            """
        ).fetchone()
        return None if row is None else Tick(int(row[0]), int(row[1]), int(row[2]), int(row[3]))
    finally:
        conn.close()


def _read_last_hot_tick(symbol: str) -> Tick | None:
    path = _hot_db_path(symbol, _HOT_DB_LAST)
    if not path.exists():
        return None

    conn = _connect(path)
    try:
        _ensure_table(conn)
        row = conn.execute(
            """
            SELECT timestamp, bid, ask, volume
            FROM ticks
            ORDER BY timestamp DESC
            LIMIT 1
            """
        ).fetchone()
        return None if row is None else Tick(int(row[0]), int(row[1]), int(row[2]), int(row[3]))
    finally:
        conn.close()


def _read_cold_extreme(symbol: str, order: str) -> Tick | None:
    files = _cold_files(symbol)
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
        return Tick(int(row[0]), int(row[1]), int(row[2]), int(row[3]))
    finally:
        conn.close()


def _get_extreme_timestamp(symbol: str, order: str) -> int | None:
    candidates: list[Tick] = []

    first_hot = _read_first_hot_tick(symbol)
    if first_hot is not None:
        candidates.append(first_hot)

    last_hot = _read_last_hot_tick(symbol)
    if last_hot is not None:
        candidates.append(last_hot)

    cold = _read_cold_extreme(symbol, order)
    if cold is not None:
        candidates.append(cold)

    if not candidates:
        return None

    if order.upper() == "ASC":
        return min(candidates, key=lambda t: t.timestamp).timestamp
    return max(candidates, key=lambda t: t.timestamp).timestamp


def _count_rows(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) FROM ticks").fetchone()
    return int(row[0]) if row else 0


def _select_oldest_rows(conn: sqlite3.Connection, limit: int) -> list[Tick]:
    rows = conn.execute(
        """
        SELECT timestamp, bid, ask, volume
        FROM ticks
        ORDER BY timestamp ASC
        LIMIT ?
        """,
        (int(limit),),
    ).fetchall()
    return [Tick(int(r[0]), int(r[1]), int(r[2]), int(r[3])) for r in rows]


def _write_parquet(rows: list[Tick], final_path: Path) -> Path:
    if not rows:
        raise ValueError("cannot write empty parquet batch")

    _ensure_parent(final_path)
    temp_path = final_path.with_suffix(final_path.suffix + ".tmp")

    df = pd.DataFrame(
        [(t.timestamp, t.bid, t.ask, t.volume) for t in rows],
        columns=["timestamp", "bid", "ask", "volume"],
    )

    conn = duckdb.connect(database=":memory:")
    try:
        conn.register("ticks_df", df)
        conn.execute(
            f"""
            COPY (
                SELECT timestamp, bid, ask, volume
                FROM ticks_df
                ORDER BY timestamp ASC
            )
            TO '{_sql_quote_path(temp_path)}'
            (FORMAT PARQUET)
            """
        )
    finally:
        conn.close()

    return temp_path


def _delete_rows_by_timestamp(conn: sqlite3.Connection, rows: list[Tick]) -> None:
    timestamps = [int(t.timestamp) for t in rows]
    if not timestamps:
        return

    placeholders = ",".join("?" for _ in timestamps)
    conn.execute(
        f"DELETE FROM ticks WHERE timestamp IN ({placeholders})",
        timestamps,
    )


def _flush_hot_to_cold(conn: sqlite3.Connection, symbol: str) -> None:
    limit = int(getattr(config, "TICK_FILE_LIMIT", 0))
    if limit <= 0:
        raise ValueError("config.TICK_FILE_LIMIT must be greater than zero")

    while True:
        count = _count_rows(conn)
        if count < limit:
            return

        chunk = _select_oldest_rows(conn, limit)
        if not chunk:
            return

        final_path = _cold_file_path(symbol, chunk[0].timestamp)
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
        except Exception as exc:
            logger.error(_SECTION, f"Failed to finalize parquet file {final_path.name}: {exc}")
            # The rows are already removed from hot storage. Keep the temp file
            # so a later cleanup pass can finalize it.
            return


def _insert_ticks(conn: sqlite3.Connection, ticks: list[Tick]) -> None:
    if not ticks:
        return

    conn.executemany(
        """
        INSERT OR IGNORE INTO ticks(timestamp, bid, ask, volume)
        VALUES (?, ?, ?, ?)
        """,
        [(t.timestamp, t.bid, t.ask, t.volume) for t in ticks],
    )


def _write_ticks(ticks: list[Tick], mode: str) -> bool:
    if not ticks:
        return True

    try:
        with _LOCK:
            symbol = _require_symbol()
            _clean_parquet_temp_files(symbol)

            ticks = _sorted_ticks(ticks)
            if not ticks:
                return True

            boundary = _get_extreme_timestamp(symbol, "DESC" if mode == "append" else "ASC")
            if boundary is not None:
                if mode == "append":
                    ticks = [t for t in ticks if t.timestamp > boundary]
                elif mode == "prepend":
                    ticks = [t for t in ticks if t.timestamp < boundary]

            if not ticks:
                return True

            path = _hot_db_path(symbol, _HOT_DB_LAST if mode == "append" else _HOT_DB_FIRST)
            _ensure_parent(path)

            conn = _connect(path)
            try:
                _ensure_table(conn)
                conn.execute("BEGIN IMMEDIATE")
                try:
                    _insert_ticks(conn, ticks)
                    conn.execute("COMMIT")
                except Exception:
                    try:
                        conn.execute("ROLLBACK")
                    except Exception:
                        pass
                    raise

                _flush_hot_to_cold(conn, symbol)
                return True
            finally:
                conn.close()
    except Exception as exc:
        logger.error(_SECTION, f"{mode}Ticks failed: {exc}")
        return False


def appendTicks(list_of_ticks: list[Tick]) -> bool:
    return _write_ticks(list_of_ticks, "append")


def prependTicks(list_of_ticks: list[Tick]) -> bool:
    return _write_ticks(list_of_ticks, "prepend")