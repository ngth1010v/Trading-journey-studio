from __future__ import annotations

import asyncio
import time
from dataclasses import asdict, dataclass
from typing import Any

from config import MT5_RETRY_SECONDS
from logger import error, info, warning
from mt5_adapter import Mt5Adapter
from storage import StorageAdapter
from symbol_worker import SymbolWorker


@dataclass(slots=True)
class ControllerResponse:
    ok: bool
    data: Any | None = None
    error: str | None = None


class MarketController:
    def __init__(self) -> None:
        self.storage = StorageAdapter()
        self.mt5 = Mt5Adapter()
        self.workers: dict[str, SymbolWorker] = {}
        self._shutdown = False
        self._idle_task: asyncio.Task[None] | None = None
        self._mt5_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        info("controller", "starting")
        self.storage.initialize()
        status = self.mt5.initialize()
        if status.enabled and not status.ready:
            warning("controller", f"MT5 not ready: {status.message}")
        if self.mt5.enabled:
            self._mt5_task = asyncio.create_task(self._mt5_retry_loop())
        self._idle_task = asyncio.create_task(self._idle_sweeper())
        info("controller", "ready")

    async def stop(self) -> None:
        if self._shutdown:
            return
        self._shutdown = True
        info("controller", "shutdown begin")
        if self._idle_task is not None:
            self._idle_task.cancel()
        if self._mt5_task is not None:
            self._mt5_task.cancel()
        for worker in list(self.workers.values()):
            worker.shutdown()
        self.workers.clear()
        self.mt5.shutdown()
        info("controller", "shutdown finish")

    def _ensure_worker(self, symbol: str) -> SymbolWorker:
        key = symbol.upper()
        worker = self.workers.get(key)
        if worker is not None:
            return worker

        symbol_data = self.mt5.get_symbol(key) or self.storage.get_symbol(key)
        if symbol_data is None:
            raise FileNotFoundError(f"symbol not found: {symbol}")

        self.storage.upsert_symbol(symbol_data, source="mt5" if self.mt5.ready else "demo")
        worker = SymbolWorker(symbol=symbol_data.symbol, point=symbol_data.point, storage=self.storage, mt5=self.mt5)
        self.workers[key] = worker
        info("worker", f"started {key}")
        return worker

    async def _mt5_retry_loop(self) -> None:
        while not self._shutdown:
            if self.mt5.ready:
                await asyncio.sleep(MT5_RETRY_SECONDS)
                continue
            status = self.mt5.initialize()
            if status.enabled and status.ready:
                info("mt5", "MT5 became ready")
            elif status.enabled:
                warning("mt5", "MT5 still not ready")
            await asyncio.sleep(MT5_RETRY_SECONDS)

    async def _idle_sweeper(self) -> None:
        while not self._shutdown:
            now_ts = int(time.time())
            idle_keys: list[str] = []
            for key, worker in self.workers.items():
                worker.maybe_flush()
                if worker.is_idle(now_ts):
                    idle_keys.append(key)

            for key in idle_keys:
                worker = self.workers.pop(key, None)
                if worker is not None:
                    worker.shutdown()
                    info("worker", f"idle stop {key}")
            await asyncio.sleep(15)

    async def handle(self, request: dict[str, Any]) -> ControllerResponse:
        try:
            command = str(request.get("command") or "").upper()
            params = dict(request.get("params") or {})
        except Exception as exc:
            return ControllerResponse(ok=False, error=f"invalid request: {exc}")

        try:
            if command == "PING":
                return ControllerResponse(ok=True, data={"ready": True, "mt5Ready": self.mt5.ready})

            if command == "LIST_SYMBOLS":
                if self.mt5.ready:
                    symbols = self.mt5.list_symbols()
                else:
                    symbols = self.storage.list_symbols()
                return ControllerResponse(ok=True, data={"symbols": symbols})

            if command == "GET_SYMBOL":
                symbol = str(params.get("symbol") or "").upper()
                if not symbol:
                    raise ValueError("symbol is required")
                worker = self._ensure_worker(symbol)
                return ControllerResponse(ok=True, data=asdict(worker.get_symbol_data()))

            if command == "GET_OHLC":
                symbol = str(params.get("symbol") or "").upper()
                timeframe = str(params.get("timeframe") or "")
                from_ts = params.get("from")
                to_ts = params.get("to")
                limit = params.get("limit")
                if not symbol:
                    raise ValueError("symbol is required")
                worker = self._ensure_worker(symbol)
                candles = worker.get_ohlc_range(
                    timeframe=timeframe,
                    from_ts=int(from_ts) if from_ts is not None else None,
                    to_ts=int(to_ts) if to_ts is not None else None,
                    limit=int(limit) if limit is not None else None,
                )
                return ControllerResponse(ok=True, data={"ohlc": [asdict(item) for item in candles]})

            if command == "GET_LAST_OHLC":
                symbol = str(params.get("symbol") or "").upper()
                timeframe = str(params.get("timeframe") or "")
                if not symbol:
                    raise ValueError("symbol is required")
                worker = self._ensure_worker(symbol)
                candle = worker.get_last_ohlc(timeframe=timeframe)
                return ControllerResponse(ok=True, data={"ohlc": asdict(candle)})

            if command == "SHUTDOWN":
                await self.stop()
                return ControllerResponse(ok=True, data={"shutdown": True})

            raise ValueError(f"unknown command: {command}")
        except FileNotFoundError as exc:
            return ControllerResponse(ok=False, error=str(exc))
        except Exception as exc:
            error("controller", f"{command} failed: {exc}")
            return ControllerResponse(ok=False, error=str(exc))
