from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterable

from ._type import AggregatePeriod

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


def _timeframe_delta_ms(timeframe: str) -> int:
    tf = str(timeframe).strip().upper()
    mapping = {
        "1S": 1000,
        "1M": 1000 * 60,
        "1H": 1000 * 60 * 60,
        "1D": 1000 * 60 * 60 * 24,
    }

    if tf not in mapping:
        logger.error(_SECTION, f"aggregateOhlcs() unsupported timeframe: {timeframe!r}")
        raise RuntimeError(f"Unsupported timeframe: {timeframe!r}")

    return mapping[tf]


def _read_ohlcs_for_periods(symbol: str, timeframe: str, periods) -> list[Ohlc]:
    rows: list[Ohlc] = []

    for period in periods:
        chunk = getOhlcs(symbol, timeframe, int(period.fromTs), int(period.toTs))
        if chunk is False:
            raise RuntimeError(
                f"getOhlcs({symbol!r}, {timeframe!r}, {period.fromTs}, {period.toTs}) failed"
            )
        rows.extend(chunk)

    return _dedupe_sorted_ohlcs(rows)


def _aggregate_rows_with_duckdb(rows: list[Ohlc], bucket_ms: int) -> list[Ohlc]:
    if not rows:
        return []

    df = pd.DataFrame(
        [(o.t, o.o, o.h, o.l, o.c, o.v) for o in rows],
        columns=["timestamp", "open", "high", "low", "close", "volume"],
    )
    df["bucket"] = (df["timestamp"] // int(bucket_ms)) * int(bucket_ms)

    conn = duckdb.connect(database=":memory:")
    try:
        conn.register("ohlcs_df", df)
        out_rows = conn.execute(
            """
            SELECT
                bucket AS timestamp,
                arg_min(open, timestamp) AS open,
                max(high) AS high,
                min(low) AS low,
                arg_max(close, timestamp) AS close,
                sum(volume) AS volume
            FROM ohlcs_df
            GROUP BY bucket
            ORDER BY bucket ASC
            """
        ).fetchall()
    finally:
        conn.close()

    result: list[Ohlc] = []
    for row in out_rows:
        result.append(
            Ohlc(
                t=int(row[0]),
                o=int(row[1]),
                h=int(row[2]),
                l=int(row[3]),
                c=int(row[4]),
                v=int(row[5]),
            )
        )
    return result


def _aggregate_one_period(rows: list[Ohlc], bucket_ts: int) -> Ohlc | None:
    if not rows:
        return None

    rows = sorted(rows, key=lambda o: o.t)
    return Ohlc(
        t=int(bucket_ts),
        o=int(rows[0].o),
        h=int(max(row.h for row in rows)),
        l=int(min(row.l for row in rows)),
        c=int(rows[-1].c),
        v=int(sum(row.v for row in rows)),
    )


# =====================================================================================================================
# PUBLIC API
# =====================================================================================================================
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


def aggregateOhlcs(symbol: str, timeframe: str, srcPeriods: list[AggregatePeriod]):
    """
    Aggregate stored OHLC rows from `timeframe` into the period buckets described by `srcPeriods`.

    Important:
    - `timeframe` is treated as the SOURCE timeframe.
    - The target bar size is inferred from each period's [fromTs, toTs).
    - A period is only aggregated when it is fully covered by source data.
    - Missing source data inside a period causes that period to be skipped.
    """
    try:
        source_delta_ms = _timeframe_delta_ms(timeframe)

        periods = sorted(
            (
                p
                for p in (srcPeriods or [])
                if int(p.toTs) > int(p.fromTs)
            ),
            key=lambda p: (int(p.fromTs), int(p.toTs)),
        )
        if not periods:
            return []

        source_first = getFirstOhlc(symbol, timeframe)
        source_last = getLastOhlc(symbol, timeframe)
        if source_first is False or source_last is False:
            return []

        source_first_ts = int(source_first.t)
        source_last_end_ts = int(source_last.t) + source_delta_ms

        result: list[Ohlc] = []

        for period in periods:
            period_from = int(period.fromTs)
            period_to = int(period.toTs)
            span_ms = period_to - period_from

            if span_ms <= 0:
                continue

            # Only build when the whole bucket is covered by source storage.
            if period_from < source_first_ts:
                continue
            if period_to > source_last_end_ts:
                continue

            # The source timeframe must fit evenly into the requested bucket.
            if span_ms % source_delta_ms != 0:
                continue

            chunk = getOhlcs(symbol, timeframe, period_from, period_to)
            if chunk is False:
                raise RuntimeError(
                    f"getOhlcs({symbol!r}, {timeframe!r}, {period_from}, {period_to}) failed"
                )
            if not chunk:
                continue

            expected_count = span_ms // source_delta_ms
            if expected_count <= 0:
                continue

            # Require a complete bucket. This keeps 1M/1H/1D strict and avoids partial bars.
            if len(chunk) != expected_count:
                continue

            agg = _aggregate_one_period(chunk, period_from)
            if agg is None:
                continue

            result.append(agg)

        result = _dedupe_sorted_ohlcs(result)
        if not result:
            return []

        logger.info(
            _SECTION,
            f"aggregateOhlcs({symbol!r}, {timeframe!r}, periods={len(srcPeriods)}) done: {len(result)} rows",
        )
        return result

    except Exception as exc:
        logger.error(_SECTION, f"aggregateOhlcs({symbol!r}, {timeframe!r}, periods={len(srcPeriods)}) failed: {exc}")
        return False