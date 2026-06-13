from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

from config import DEMO_MODE, DEMO_RESET_ON_STARTUP, DEMO_SYMBOLS, MARKET_DB_PATH, MARKET_DIR
from logger import info
from type import Ohlc, SymbolData, Tick


class StorageError(RuntimeError):
    pass


class StorageAdapter:
    def __init__(self) -> None:
        self._db_path = MARKET_DB_PATH
        self._market_dir = MARKET_DIR
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._market_dir.mkdir(parents=True, exist_ok=True)
        self._con = duckdb.connect(str(self._db_path))
        self._buffers: dict[str, dict[str, Any]] = {}

    def _reset_demo_storage(self) -> None:
        import shutil

        try:
            self._con.close()
        except Exception:
            pass

        for suffix in ("", ".wal", ".shm"):
            path = self._db_path.with_suffix(self._db_path.suffix + suffix) if suffix else self._db_path
            try:
                path.unlink()
            except FileNotFoundError:
                pass

        if self._market_dir.exists():
            shutil.rmtree(self._market_dir, ignore_errors=True)
        self._market_dir.mkdir(parents=True, exist_ok=True)
        self._con = duckdb.connect(str(self._db_path))

    def initialize(self) -> None:
        if DEMO_MODE and DEMO_RESET_ON_STARTUP:
            self._reset_demo_storage()

        self._con.execute(
            """
            CREATE TABLE IF NOT EXISTS symbols (
                symbol VARCHAR PRIMARY KEY,
                point INTEGER NOT NULL,
                source VARCHAR NOT NULL,
                last_update_ts BIGINT NOT NULL,
                created_ts BIGINT NOT NULL,
                updated_ts BIGINT NOT NULL
            )
            """
        )

        if DEMO_MODE:
            self._con.execute("DELETE FROM symbols")
            for symbol, point in DEMO_SYMBOLS.items():
                self.upsert_symbol(SymbolData(symbol=symbol, point=point), source="demo")

        info("storage", f"initialized at {self._db_path}")

    def _symbol_dir(self, symbol: str) -> Path:
        path = self._market_dir / symbol.upper()
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _tick_path(self, symbol: str) -> Path:
        return self._symbol_dir(symbol) / "tick.parquet"

    def _ohlc_path(self, symbol: str, timeframe: str) -> Path:
        return self._symbol_dir(symbol) / f"{timeframe}.parquet"

    def _buffer(self, symbol: str) -> dict[str, Any]:
        key = symbol.upper()
        if key not in self._buffers:
            self._buffers[key] = {
                "tick_rows": [],
                "ohlc_rows": {},
                "last_flush_ts": 0,
            }
        return self._buffers[key]

    def upsert_symbol(self, symbol_data: SymbolData, source: str = "local") -> None:
        import time

        now = int(time.time())
        self._con.execute(
            """
            INSERT INTO symbols(symbol, point, source, last_update_ts, created_ts, updated_ts)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                point=excluded.point,
                source=excluded.source,
                last_update_ts=excluded.last_update_ts,
                updated_ts=excluded.updated_ts
            """,
            [symbol_data.symbol.upper(), int(symbol_data.point), source, now, now, now],
        )

    def list_symbols(self) -> list[str]:
        rows = self._con.execute("SELECT symbol FROM symbols ORDER BY symbol").fetchall()
        return [row[0] for row in rows]

    def get_symbol(self, symbol: str) -> SymbolData | None:
        row = self._con.execute(
            "SELECT symbol, point FROM symbols WHERE symbol = ?",
            [symbol.upper()],
        ).fetchone()
        if row is None:
            return None
        return SymbolData(symbol=row[0], point=int(row[1]))

    def append_ticks(self, symbol: str, ticks: list[Tick]) -> None:
        if not ticks:
            return
        buffer = self._buffer(symbol)
        buffer["tick_rows"].extend(asdict(item) for item in ticks)

    def append_ohlc(self, symbol: str, timeframe: str, rows: list[Ohlc]) -> None:
        if not rows:
            return
        buffer = self._buffer(symbol)
        ohlc_map: dict[str, list[dict[str, Any]]] = buffer["ohlc_rows"]
        ohlc_map.setdefault(timeframe, []).extend(asdict(item) for item in rows)

    def _read_parquet_df(self, path: Path) -> pd.DataFrame:
        if not path.exists() or path.stat().st_size <= 0:
            return pd.DataFrame()
        con = duckdb.connect()
        df = con.execute("SELECT * FROM read_parquet(?)", [str(path)]).fetchdf()
        con.close()
        return df

    def _write_parquet(self, path: Path, rows: list[dict[str, Any]], order_key: str) -> None:
        if not rows:
            return
        new_df = pd.DataFrame(rows)
        old_df = self._read_parquet_df(path)
        if not old_df.empty:
            combined = pd.concat([old_df, new_df], ignore_index=True)
        else:
            combined = new_df
        if order_key in combined.columns:
            combined = combined.sort_values(by=[order_key]).reset_index(drop=True)
        con = duckdb.connect()
        con.register("combined_df", combined)
        tmp_path = str(path).replace("'", "''")
        con.execute(f"COPY combined_df TO '{tmp_path}' (FORMAT PARQUET)")
        con.close()

    def flush_symbol(self, symbol: str, force: bool = False) -> None:
        import time

        key = symbol.upper()
        buffer = self._buffer(key)
        tick_rows: list[dict[str, Any]] = buffer["tick_rows"]
        ohlc_rows: dict[str, list[dict[str, Any]]] = buffer["ohlc_rows"]

        if not force:
            total_rows = len(tick_rows) + sum(len(items) for items in ohlc_rows.values())
            age = int(time.time()) - int(buffer["last_flush_ts"] or 0)
            if total_rows < 1 and age < 60:
                return
            if total_rows < 100_000 and age < 60:
                return

        if tick_rows:
            self._write_parquet(self._tick_path(key), tick_rows, "timestamp")
            tick_rows.clear()

        for timeframe, rows in list(ohlc_rows.items()):
            if rows:
                self._write_parquet(self._ohlc_path(key, timeframe), rows, "openTimestamp")
                rows.clear()

        buffer["last_flush_ts"] = int(time.time())

    def read_ticks(self, symbol: str, start_ts: int, end_ts: int) -> list[Tick]:
        key = symbol.upper()
        frames: list[pd.DataFrame] = []
        path = self._tick_path(key)
        if path.exists() and path.stat().st_size > 0:
            con = duckdb.connect()
            df = con.execute(
                "SELECT * FROM read_parquet(?) WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp",
                [str(path), int(start_ts), int(end_ts)],
            ).fetchdf()
            con.close()
            if not df.empty:
                frames.append(df)

        buffer = self._buffer(key)["tick_rows"]
        if buffer:
            df = pd.DataFrame(buffer)
            df = df[(df["timestamp"] >= start_ts) & (df["timestamp"] < end_ts)]
            if not df.empty:
                frames.append(df)

        if not frames:
            return []
        merged = pd.concat(frames, ignore_index=True)
        merged = merged.sort_values(by=["timestamp"]).drop_duplicates(subset=["timestamp"], keep="last")
        return [Tick(**row) for row in merged.to_dict(orient="records")]

    def read_ohlc(self, symbol: str, timeframe: str, start_ts: int, end_ts: int) -> list[Ohlc]:
        key = symbol.upper()
        frames: list[pd.DataFrame] = []
        path = self._ohlc_path(key, timeframe)
        if path.exists() and path.stat().st_size > 0:
            con = duckdb.connect()
            df = con.execute(
                "SELECT * FROM read_parquet(?) WHERE openTimestamp >= ? AND openTimestamp < ? ORDER BY openTimestamp",
                [str(path), int(start_ts), int(end_ts)],
            ).fetchdf()
            con.close()
            if not df.empty:
                frames.append(df)

        buffer = self._buffer(key)["ohlc_rows"].get(timeframe, [])
        if buffer:
            df = pd.DataFrame(buffer)
            df = df[(df["openTimestamp"] >= start_ts) & (df["openTimestamp"] < end_ts)]
            if not df.empty:
                frames.append(df)

        if not frames:
            return []
        merged = pd.concat(frames, ignore_index=True)
        merged = merged.sort_values(by=["openTimestamp"]).drop_duplicates(subset=["openTimestamp"], keep="last")
        return [Ohlc(**row) for row in merged.to_dict(orient="records")]

    def read_last_ohlc_from_storage(self, symbol: str, timeframe: str) -> Ohlc | None:
        key = symbol.upper()
        path = self._ohlc_path(key, timeframe)
        if path.exists() and path.stat().st_size > 0:
            con = duckdb.connect()
            row = con.execute(
                "SELECT * FROM read_parquet(?) ORDER BY openTimestamp DESC LIMIT 1",
                [str(path)],
            ).fetchone()
            con.close()
            if row is not None:
                return Ohlc(*row)

        buffer = self._buffer(key)["ohlc_rows"].get(timeframe, [])
        if buffer:
            item = sorted(buffer, key=lambda row: row["openTimestamp"])[-1]
            return Ohlc(**item)
        return None
