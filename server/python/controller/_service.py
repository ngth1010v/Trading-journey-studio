from __future__ import annotations

import asyncio
import threading
import traceback
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import logger

try:
    from type import Ohlc, SymbolData, Tick
except Exception:  # pragma: no cover - test/runtime fallback
    @dataclass(slots=True)
    class Tick:
        timestamp: datetime
        bid: int
        ask: int
        volume: int

    @dataclass(slots=True)
    class Ohlc:
        openTimestamp: datetime
        open: int
        high: int
        low: int
        close: int
        volume: int

    @dataclass(slots=True)
    class SymbolData:
        symbol: str
        point: int

from ._utils import (
    call_first_async,
    datetime_to_utc_ts,
    floor_ts_to_timeframe,
    tick_signature,
    timeframe_to_seconds,
    ts_to_utc_naive_datetime,
    utc_now_ts,
)


class ControllerService:
    def __init__(self, collector: Any, reader: Any, writer: Any) -> None:
        self.collector = collector
        self.reader = reader
        self.writer = writer

        self._symbol: str | None = None
        self._symbol_data: SymbolData | None = None
        self._crawl_list: set[int] = set()
        self._crawl_lock = threading.Lock()

        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._monitor_task: asyncio.Task[None] | None = None
        self._stop_event = threading.Event()
        self._ready_event = threading.Event()
        self._init_error: BaseException | None = None
        self._started = False
        logger.info("controller", "ControllerService initialized")

    # -----------------------------
    # lifecycle
    # -----------------------------
    def init(self, symbol: str) -> None:
        if self._started:
            logger.warning("controller", f"Initialization attempted but Controller is already initialized for symbol: {self._symbol}")
            raise RuntimeError("Controller is already initialized")

        self._symbol = self._normalize_symbol(symbol)
        logger.info("controller", f"Initializing controller for symbol: {self._symbol}")
        self._stop_event.clear()
        self._ready_event.clear()
        self._init_error = None
        self._started = True

        self._thread = threading.Thread(
            target=self._thread_main,
            name=f"Controller[{self._symbol}]",
            daemon=True,
        )
        self._thread.start()

        self._ready_event.wait()
        if self._init_error is not None:
            self._started = False
            logger.error("controller", f"Controller initialization failed for {self._symbol}. Error: {self._init_error}")
            raise RuntimeError("Controller initialization failed") from self._init_error
        logger.info("controller", f"Controller initialized successfully for {self._symbol}")

    def destroy(self) -> None:
        if not self._started:
            logger.warning("controller", "Destroy attempted but Controller is not started")
            return

        logger.info("controller", f"Destroying controller for symbol: {self._symbol}")
        self._stop_event.set()
        if self._loop is not None and self._loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(self._destroy_async(), self._loop).result(timeout=30)
            except Exception as exc:  # pragma: no cover - defensive shutdown
                logger.error("controller", f"destroy failed: {exc}\n{traceback.format_exc()}")
            finally:
                self._loop.call_soon_threadsafe(self._loop.stop)

        if self._thread is not None:
            self._thread.join(timeout=30)

        self._thread = None
        self._loop = None
        self._monitor_task = None
        self._symbol_data = None
        logger.info("controller", f"Controller components cleared for symbol: {self._symbol}")
        self._symbol = None
        self._started = False
        with self._crawl_lock:
            self._crawl_list.clear()

    # -----------------------------
    # public operations
    # -----------------------------
    def reset(self) -> None:
        logger.info("controller", f"Resetting controller for symbol: {self._symbol}")
        self._run_sync(self._reset_async())

    def updateTickByTimestamp(self, fromTs: int) -> None:
        logger.info("controller", f"Updating tick by timestamp from: {fromTs} for symbol: {self._symbol}")
        self._run_sync(self._update_tick_async(int(fromTs)))

    def updateTickByDatetime(self, fromDt: datetime) -> None:
        logger.info("controller", f"Updating tick by datetime from: {fromDt} for symbol: {self._symbol}")
        self._run_sync(self._update_tick_async(datetime_to_utc_ts(fromDt)))

    def resetOhlc(self, timeframe: int) -> None:
        logger.info("controller", f"Resetting OHLC for timeframe: {timeframe} and symbol: {self._symbol}")
        self._run_sync(self._reset_ohlc_async(int(timeframe)))

    def updateOhlc(self, timeframe: int) -> None:
        logger.info("controller", f"Updating OHLC for timeframe: {timeframe} and symbol: {self._symbol}")
        self._run_sync(self._update_ohlc_async(int(timeframe)))

    def startCrawlOhlc(self, timeframe: int) -> None:
        logger.info("controller", f"Starting crawl OHLC for timeframe: {timeframe} and symbol: {self._symbol}")
        with self._crawl_lock:
            self._crawl_list.add(int(timeframe))

    def endCrawlOhlc(self, timeframe: int) -> None:
        logger.info("controller", f"Ending crawl OHLC for timeframe: {timeframe} and symbol: {self._symbol}")
        with self._crawl_lock:
            self._crawl_list.discard(int(timeframe))

    # -----------------------------
    # thread / bootstrap
    # -----------------------------
    def _thread_main(self) -> None:
        logger.info("controller", "Starting controller background thread")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop

        try:
            loop.run_until_complete(self._bootstrap_async())
            self._monitor_task = loop.create_task(self._monitor_loop())
            self._ready_event.set()
            loop.run_forever()
        except BaseException as exc:  # pragma: no cover - init failure propagation
            self._init_error = exc
            self._ready_event.set()
            logger.error("controller", f"Exception in background thread main: {exc}\n{traceback.format_exc()}")
            raise
        finally:
            try:
                if self._monitor_task is not None and not self._monitor_task.done():
                    self._monitor_task.cancel()
                    loop.run_until_complete(asyncio.gather(self._monitor_task, return_exceptions=True))
            except Exception as exc:
                logger.error("controller", f"Error canceling monitor task: {exc}")
            try:
                loop.run_until_complete(self._destroy_async())
            except Exception as exc:
                logger.error("controller", f"Error in loop destroy phase: {exc}")
            loop.close()
            logger.info("controller", "Controller background thread closed")

    async def _bootstrap_async(self) -> None:
        logger.info("controller", "Bootstrapping collector, reader, and writer components")
        await self._call(self.collector, ("init",))
        if hasattr(self.reader, "init"):
            await self._call(self.reader, ("init",))
        await self._call(self.writer, ("init",))

        self._symbol_data = await self._resolve_symbol_data()
        if self._symbol_data is not None:
            logger.info("controller", f"Symbol data resolved during bootstrap: {self._symbol_data}")
            await self._sync_symbol_data(self._symbol_data)
        else:
            logger.warning("controller", f"Symbol data could not be resolved during bootstrap for: {self._symbol}")

    async def _destroy_async(self) -> None:
        logger.info("controller", "Asynchronously destroying internal components")
        for obj in (self.collector, self.reader, self.writer):
            for name in ("destroy",):
                if hasattr(obj, name):
                    try:
                        await self._call(obj, (name,))
                    except Exception as exc:  # pragma: no cover - shutdown tolerance
                        logger.error("controller", f"{obj.__class__.__name__}.{name} failed during destroy: {exc}\n{traceback.format_exc()}")

    # -----------------------------
    # helpers: calls / data
    # -----------------------------
    async def _call(self, obj: Any, names: tuple[str, ...], *args: Any) -> Any:
        return await call_first_async(obj, names, *args)

    def _normalize_symbol(self, symbol: str) -> str:
        value = str(symbol).strip()
        if not value:
            logger.error("controller", "Normalization failed: symbol string is empty")
            raise ValueError("symbol cannot be empty")
        return value

    def _require_started(self) -> None:
        if not self._started or self._loop is None:
            logger.error("controller", "Operation rejected: Controller is not initialized")
            raise RuntimeError("Controller is not initialized")

    def _require_symbol(self) -> str:
        if self._symbol is None:
            logger.error("controller", "Operation rejected: Controller symbol is not set")
            raise RuntimeError("Controller symbol is not set")
        return self._symbol

    def _run_sync(self, coro: Any) -> Any:
        self._require_started()
        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return fut.result()

    async def _resolve_symbol_data(self) -> SymbolData | None:
        symbol = self._require_symbol()
        rows = await self._get_symbol_datas()
        for row in rows or []:
            if getattr(row, "symbol", None) == symbol:
                return row
        return None

    async def _get_symbol_datas(self) -> list[SymbolData]:
        for names in (("getSymbolDatas", "get_symbol_datas"),):
            try:
                rows = await self._call(self.collector, names)
                return list(rows or [])
            except Exception as exc:
                logger.debug("controller", f"Failed fetching symbol datas via {names}: {exc}")
                continue
        return []

    async def _get_reader_symbol_data(self) -> SymbolData | None:
        symbol = self._require_symbol()
        try:
            return await self._call(self.reader, ("getSymbolData", "get_symbol_data"), symbol)
        except Exception as exc:
            logger.debug("controller", f"Failed fetching symbol data from reader directly: {exc}")
        try:
            rows = await self._call(self.reader, ("getSymbolDatas", "get_symbol_datas"))
        except Exception as exc:
            logger.debug("controller", f"Failed fetching bulk symbol data from reader: {exc}")
            return None
        for row in rows or []:
            if getattr(row, "symbol", None) == symbol:
                return row
        return None

    async def _sync_symbol_data(self, new_symbol_data: SymbolData) -> None:
        old_symbol_data = await self._get_reader_symbol_data()
        if old_symbol_data is None:
            logger.info("controller", f"No existing layout in reader. Setting symbol data: {new_symbol_data}")
            await self._call(self.writer, ("setSymbolData", "set_symbol_data"), new_symbol_data)
            return

        if int(getattr(new_symbol_data, "point", 0)) != int(getattr(old_symbol_data, "point", 0)):
            logger.warning("controller", f"Symbol point configuration changed from {getattr(old_symbol_data, 'point', 0)} to {getattr(new_symbol_data, 'point', 0)}. Resetting stored records.")
            await self._call(self.writer, ("setSymbolData", "set_symbol_data"), new_symbol_data)
            await self._call(self.writer, ("resetAll", "reset_all"), self._require_symbol())

    async def _get_last_tick_from_reader(self) -> Tick | None:
        symbol = self._require_symbol()
        for names, args in (
            (("getLastTick", "get_last_tick"), (symbol,)),
            (("getLastTick", "get_last_tick"), tuple()),
        ):
            try:
                result = await self._call(self.reader, names, *args)
                if isinstance(result, list):
                    return result[-1] if result else None
                return result
            except Exception as exc:
                logger.debug("controller", f"Failed fetching last tick from reader using {names}: {exc}")
                continue
        return None

    async def _get_last_tick_from_collector(self) -> Tick | None:
        symbol = self._require_symbol()
        point = self._symbol_point()
        for names, args in (
            (("getLastTick", "get_last_tick"), (symbol,)),
            (("getTicksRangeByTimestamp", "get_ticks_range_by_timestamp"), (symbol, point, utc_now_ts(), utc_now_ts())),
            (("getTicksByTimestamp", "get_ticks_by_timestamp"), (symbol, point, utc_now_ts(), 1)),
        ):
            try:
                result = await self._call(self.collector, names, *args)
                if isinstance(result, list):
                    return result[-1] if result else None
                return result
            except Exception as exc:
                logger.debug("controller", f"Failed fetching last tick from collector using {names}: {exc}")
                continue
        return None

    async def _get_first_tick(self) -> Tick | None:
        symbol = self._require_symbol()
        for names, args in (
            (("getFirstTick", "get_first_tick"), (symbol,)),
            (("getFirstTick", "get_first_tick"), tuple()),
        ):
            try:
                result = await self._call(self.reader, names, *args)
                if isinstance(result, list):
                    return result[0] if result else None
                return result
            except Exception as exc:
                logger.debug("controller", f"Failed fetching first tick from reader using {names}: {exc}")
                continue
        return None

    def _symbol_point(self) -> int:
        if self._symbol_data is not None:
            return int(getattr(self._symbol_data, "point", 0))
        return 0

    async def _get_ticks_by_timestamp(self, from_ts: int, count: int) -> list[Tick]:
        symbol = self._require_symbol()
        point = self._symbol_point()
        from_ts = int(from_ts)
        count = int(count)
        attempts = (
            (("getTicksRangeByTimestamp", "get_ticks_range_by_timestamp"), (symbol, point, from_ts, from_ts + count - 1)),
            (("getTicksByTimestamp", "get_ticks_by_timestamp"), (symbol, point, from_ts, count)),
            (("getTicksByDatetime", "get_ticks_by_datetime"), (symbol, point, ts_to_utc_naive_datetime(from_ts), count)),
        )
        for names, args in attempts:
            try:
                rows = await self._call(self.collector, names, *args)
                return list(rows or [])
            except Exception as exc:
                logger.debug("controller", f"Failed fetching ticks sequence using {names}: {exc}")
                continue
        return []

    async def _get_ticks_range_for_reader(self, from_ts: int, to_ts: int) -> list[Tick]:
        symbol = self._require_symbol()
        point = self._symbol_point()
        attempts = (
            (("getTicksRangeByTimestamp", "get_ticks_range_by_timestamp"), (symbol, point, from_ts, to_ts)),
            (("getTicksByTimestamp", "get_ticks_by_timestamp"), (symbol, point, from_ts, max(1, to_ts - from_ts + 1))),
            (("getTicksRangeByDatetime", "get_ticks_range_by_datetime"), (symbol, point, ts_to_utc_naive_datetime(from_ts), ts_to_utc_naive_datetime(to_ts))),
        )
        for names, args in attempts:
            try:
                rows = await self._call(self.reader, names, *args)
                return list(rows or [])
            except Exception as exc:
                logger.debug("controller", f"Failed fetching ticks range from reader via {names}: {exc}")
                continue
        return []

    async def _get_last_ohlc(self, timeframe: int) -> Ohlc | None:
        symbol = self._require_symbol()
        for names, args in (
            (("getLastOhlc", "get_last_ohlc"), (symbol, timeframe)),
            (("getLastOhlc", "get_last_ohlc"), (timeframe,)),
            (("getLastOhlc", "get_last_ohlc"), tuple()),
        ):
            try:
                result = await self._call(self.reader, names, *args)
                if isinstance(result, list):
                    return result[-1] if result else None
                return result
            except Exception as exc:
                logger.debug("controller", f"Failed fetching last OHLC via {names}: {exc}")
                continue
        return None

    # -----------------------------
    # public ops implementation
    # -----------------------------
    async def _reset_async(self) -> None:
        logger.info("controller", f"Executing complete buffer wipe sequence for symbol: {self._require_symbol()}")
        await self._call(self.writer, ("resetAll", "reset_all"), self._require_symbol())

    async def _reset_ohlc_async(self, timeframe: int) -> None:
        logger.info("controller", f"Executing target timeline segment wipe sequence for timeframe: {timeframe}")
        await self._call(self.writer, ("resetOhlc", "reset_ohlc"), self._require_symbol(), int(timeframe))

    async def _update_tick_async(self, from_ts: int) -> None:
        await self._ensure_ready_for_work()
        symbol = self._require_symbol()

        last_tick = await self._get_last_tick_from_reader()
        last_ts = int(from_ts)
        if last_tick is not None:
            last_ts = max(last_ts, datetime_to_utc_ts(getattr(last_tick, "timestamp")))

        current_ts = utc_now_ts()
        batch_size = 1_000_000
        logger.info("controller", f"Beginning tick buffer verification loop from timestamp {last_ts} to current {current_ts}")
        while last_ts < current_ts:
            batch = await self._get_ticks_by_timestamp(last_ts + 1, batch_size)
            if not batch:
                break
            logger.info("controller", f"Appending batch of {len(batch)} ticks to writer for {symbol}")
            await self._call(self.writer, ("appendTicks", "append_ticks"), symbol, batch)
            if len(batch) < batch_size:
                break
            last_ts = datetime_to_utc_ts(getattr(batch[-1], "timestamp"))

    async def _update_ohlc_async(self, timeframe: int) -> None:
        await self._ensure_ready_for_work()
        symbol = self._require_symbol()
        tf = int(timeframe)
        tf_sec = timeframe_to_seconds(tf)
        closed_boundary = floor_ts_to_timeframe(utc_now_ts(), tf)

        last_ohlc = await self._get_last_ohlc(tf)
        if last_ohlc is None:
            first_tick = await self._get_first_tick()
            if first_tick is None:
                logger.warning("controller", f"No historical references found to establish candlestick alignment for timeframe {tf}")
                return
            start_open_ts = floor_ts_to_timeframe(datetime_to_utc_ts(getattr(first_tick, "timestamp")), tf)
        else:
            start_open_ts = datetime_to_utc_ts(getattr(last_ohlc, "openTimestamp")) + tf_sec

        if start_open_ts >= closed_boundary:
            return

        logger.info("controller", f"Compiling ticks range to rebuild missing OHLC bars from timestamp {start_open_ts} to {closed_boundary - 1}")
        rows = await self._get_ticks_range_for_reader(start_open_ts, closed_boundary - 1)
        candles = self._build_closed_ohlcs(rows, tf, closed_boundary)
        if candles:
            logger.info("controller", f"Appending {len(candles)} newly built closed candles to writer for timeframe {tf}")
            await self._call(self.writer, ("appendOhlcs", "append_ohlcs"), symbol, tf, candles)

    def _build_closed_ohlcs(self, ticks: list[Tick], timeframe: int, closed_boundary: int) -> list[Ohlc]:
        tf_sec = timeframe_to_seconds(timeframe)
        buckets: dict[int, list[Tick]] = {}
        for tick in ticks:
            ts = datetime_to_utc_ts(getattr(tick, "timestamp"))
            if ts >= closed_boundary:
                continue
            open_ts = floor_ts_to_timeframe(ts, timeframe)
            buckets.setdefault(open_ts, []).append(tick)

        out: list[Ohlc] = []
        for open_ts in sorted(buckets):
            if open_ts + tf_sec > closed_boundary:
                continue
            candle_ticks = sorted(buckets[open_ts], key=lambda t: datetime_to_utc_ts(getattr(t, "timestamp")))
            open_v = int(getattr(candle_ticks[0], "bid"))
            high_v = max(int(getattr(t, "bid")) for t in candle_ticks)
            low_v = min(int(getattr(t, "bid")) for t in candle_ticks)
            close_v = int(getattr(candle_ticks[-1], "bid"))
            volume_v = sum(int(getattr(t, "volume")) for t in candle_ticks)
            out.append(
                Ohlc(
                    openTimestamp=ts_to_utc_naive_datetime(open_ts),
                    open=open_v,
                    high=high_v,
                    low=low_v,
                    close=close_v,
                    volume=volume_v,
                )
            )
        return out

    async def _monitor_loop(self) -> None:
        logger.info("controller", "monitor loop started")
        while not self._stop_event.is_set():
            try:
                symbol_data = await self._resolve_symbol_data()
                if symbol_data is not None:
                    self._symbol_data = symbol_data
                live_latest = await self._get_last_tick_from_collector()
                saved_latest = await self._get_last_tick_from_reader()
                if live_latest is not None and tick_signature(live_latest) != tick_signature(saved_latest):
                    from_ts = 0
                    if saved_latest is not None:
                        from_ts = datetime_to_utc_ts(getattr(saved_latest, "timestamp"))
                    await self._update_tick_async(from_ts)
                    with self._crawl_lock:
                        crawl_list = list(self._crawl_list)
                    for tf in crawl_list:
                        await self._update_ohlc_async(tf)
            except asyncio.CancelledError:
                logger.info("controller", "Monitor task cancellation caught, exiting monitor loop loop.")
                break
            except Exception as exc:  # pragma: no cover - loop robustness
                logger.error("controller", f"monitor loop error: {exc}\n{traceback.format_exc()}")
            await asyncio.sleep(1)
        logger.info("controller", "monitor loop stopped")

    async def _ensure_ready_for_work(self) -> None:
        self._require_started()
        if self._symbol_data is None:
            self._symbol_data = await self._resolve_symbol_data()
        if self._symbol_data is None:
            logger.error("controller", f"Critical layout metadata resolution error: symbol data not found for {self._symbol!r}")
            raise RuntimeError(f"symbol data not found for {self._symbol!r}")