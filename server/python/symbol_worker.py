from __future__ import annotations

import time
from dataclasses import dataclass, field

from config import BATCH_FLUSH_SECONDS, WORKER_IDLE_TIMEOUT_SECONDS
from logger import debug, info, warning
from mt5_adapter import Mt5Adapter
from storage import StorageAdapter
from synthetic import synthetic_ticks, base_price_for
from timeframe import align_floor, build_range, parse_timeframe
from type import Ohlc, SymbolData, Tick


@dataclass(slots=True)
class SymbolWorker:
    symbol: str
    point: int
    storage: StorageAdapter
    mt5: Mt5Adapter
    loaded_min_ts: int | None = None
    loaded_max_ts: int | None = None
    last_access_ts: int = field(default_factory=lambda: int(time.time()))
    last_flush_ts: int = field(default_factory=lambda: 0)
    last_candle_cache: dict[str, Ohlc] = field(default_factory=dict)

    def touch(self) -> None:
        self.last_access_ts = int(time.time())

    def is_idle(self, now_ts: int | None = None) -> bool:
        now = int(time.time()) if now_ts is None else int(now_ts)
        return (now - self.last_access_ts) >= WORKER_IDLE_TIMEOUT_SECONDS

    def _base_seed_price(self) -> int:
        return base_price_for(self.symbol, self.point)

    def _ensure_tick_coverage(self, start_ts: int, end_ts: int, step_seconds: int) -> None:
        request_start = max(0, start_ts - step_seconds)
        request_end = end_ts + step_seconds

        if self.loaded_min_ts is None or self.loaded_max_ts is None:
            ticks = synthetic_ticks(self.symbol, self.point, request_start, request_end, step_seconds)
            self.storage.append_ticks(self.symbol, ticks)
            self.loaded_min_ts = request_start
            self.loaded_max_ts = request_end
            debug("worker", f"{self.symbol} bootstrap ticks {request_start}-{request_end}")
            return

        if request_start < self.loaded_min_ts:
            ticks = synthetic_ticks(self.symbol, self.point, request_start, self.loaded_min_ts, step_seconds)
            self.storage.append_ticks(self.symbol, ticks)
            self.loaded_min_ts = request_start
            debug("worker", f"{self.symbol} extended ticks left to {request_start}")

        if request_end > self.loaded_max_ts:
            ticks = synthetic_ticks(self.symbol, self.point, self.loaded_max_ts, request_end, step_seconds)
            self.storage.append_ticks(self.symbol, ticks)
            self.loaded_max_ts = request_end
            debug("worker", f"{self.symbol} extended ticks right to {request_end}")

    def _seed_price_before(self, ticks: list[Tick], start_ts: int) -> int:
        previous = [tick for tick in ticks if tick.timestamp < start_ts]
        if previous:
            return previous[-1].bid
        if ticks:
            return ticks[0].bid
        return self._base_seed_price()

    def _build_candles(self, ticks: list[Tick], start_ts: int, end_ts: int, step_seconds: int) -> list[Ohlc]:
        candles: list[Ohlc] = []
        if start_ts >= end_ts:
            return candles

        index = 0
        last_close = self._seed_price_before(ticks, start_ts)
        open_ts = align_floor(start_ts, step_seconds)
        if open_ts < start_ts:
            open_ts += step_seconds

        while open_ts < end_ts:
            window_end = open_ts + step_seconds
            window_ticks: list[Tick] = []
            while index < len(ticks) and ticks[index].timestamp < window_end:
                if ticks[index].timestamp >= open_ts:
                    window_ticks.append(ticks[index])
                index += 1

            if window_ticks:
                prices = [tick.bid for tick in window_ticks]
                open_price = prices[0]
                high_price = max(prices)
                low_price = min(prices)
                close_price = prices[-1]
                volume = sum(tick.volume for tick in window_ticks)
                last_close = close_price
            else:
                open_price = high_price = low_price = close_price = last_close
                volume = 0

            candles.append(
                Ohlc(
                    openTimestamp=open_ts,
                    open=open_price,
                    high=high_price,
                    low=low_price,
                    close=close_price,
                    volume=volume,
                )
            )
            open_ts += step_seconds

        return candles

    def _get_range(self, timeframe: str, from_ts: int | None, to_ts: int | None, limit: int | None) -> tuple[int, int, int]:
        rule = parse_timeframe(timeframe)
        start_ts, end_ts = build_range(
            timeframe_seconds=rule.seconds,
            from_ts=from_ts,
            to_ts=to_ts,
            limit=limit,
        )
        return rule.seconds, start_ts, end_ts

    def get_symbol_data(self) -> SymbolData:
        self.touch()
        return SymbolData(symbol=self.symbol, point=self.point)

    def get_ohlc_range(
        self,
        timeframe: str,
        from_ts: int | None,
        to_ts: int | None,
        limit: int | None,
    ) -> list[Ohlc]:
        self.touch()
        step_seconds, start_ts, end_ts = self._get_range(timeframe, from_ts, to_ts, limit)
        now_ts = int(time.time())
        closed_end_ts = min(end_ts, align_floor(now_ts, step_seconds))
        if closed_end_ts <= start_ts:
            return []

        self._ensure_tick_coverage(start_ts, closed_end_ts, step_seconds)
        ticks = self.storage.read_ticks(self.symbol, max(0, start_ts - step_seconds), closed_end_ts)
        candles = self._build_candles(ticks, start_ts, closed_end_ts, step_seconds)
        if candles:
            self.storage.append_ohlc(self.symbol, timeframe, candles)
            self.storage.flush_symbol(self.symbol, force=True)
            self.last_candle_cache[timeframe] = candles[-1]
        return candles

    def get_last_ohlc(self, timeframe: str) -> Ohlc:
        self.touch()
        rule = parse_timeframe(timeframe)
        now_ts = int(time.time())
        current_open = align_floor(now_ts, rule.seconds)

        cache = self.last_candle_cache.get(timeframe)
        if cache is not None and cache.openTimestamp == current_open:
            return cache

        self._ensure_tick_coverage(current_open, now_ts + 1, rule.seconds)
        ticks = self.storage.read_ticks(self.symbol, max(0, current_open - rule.seconds), now_ts + 1)
        candles = self._build_candles(ticks, current_open, current_open + rule.seconds, rule.seconds)
        candle = candles[0] if candles else Ohlc(
            openTimestamp=current_open,
            open=self._base_seed_price(),
            high=self._base_seed_price(),
            low=self._base_seed_price(),
            close=self._base_seed_price(),
            volume=0,
        )
        self.last_candle_cache[timeframe] = candle
        return candle

    def maybe_flush(self) -> None:
        now_ts = int(time.time())
        if (now_ts - self.last_flush_ts) >= BATCH_FLUSH_SECONDS:
            self.storage.flush_symbol(self.symbol, force=True)
            self.last_flush_ts = now_ts

    def shutdown(self) -> None:
        info("worker", f"stopping {self.symbol}")
        self.storage.flush_symbol(self.symbol, force=True)
