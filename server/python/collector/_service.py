from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Optional

import logger

from ._converter import convert_ticks, convert_symbol_info
from ._datetime_utils import ts_range_to_utc, utc_datetime_to_mt5
from ._mt5_client import MT5Client
from ._state import CollectorState
from ._types import Tick, SymbolData


class CollectorService:
    def __init__(self) -> None:
        self._state = CollectorState()
        self._client: MT5Client | None = None

    @property
    def client(self) -> MT5Client:
        if self._client is None:
            self._client = MT5Client.load()
        return self._client

    async def init(self) -> None:
        logger.info("collector.service", "init")
        await self._state.ensure_initialized(self.client.mt5)

    async def destroy(self) -> None:
        logger.info("collector.service", "destroy")

        if self._client is None:
            return

        await self._state.shutdown(self.client.mt5)

    async def get_symbol_datas(self) -> list[SymbolData]:
        await self.init()

        mt5 = self.client.mt5
        items = await asyncio.to_thread(mt5.symbols_get)

        if not items:
            logger.info("collector.service", "get_symbol_datas -> 0 symbols")
            return []

        result: list[SymbolData] = []

        for info in items:
            visible = bool(getattr(info, "visible", False))
            name = getattr(info, "name", None)

            if not name:
                continue

            if not visible:
                continue

            converted = convert_symbol_info(info)

            if converted is not None:
                result.append(converted)

        logger.info(
            "collector.service",
            f"get_symbol_datas -> {len(result)} symbols",
        )

        return result

    async def get_ticks_range_by_datetime(
        self,
        symbol: str,
        point: int,
        from_dt: datetime,
        to_dt: datetime,
    ) -> list[Tick]:
        if not symbol:
            return []

        await self.init()

        mt5 = self.client.mt5
        from_mt5 = utc_datetime_to_mt5(from_dt)
        to_mt5 = utc_datetime_to_mt5(to_dt)

        def _call():
            return mt5.copy_ticks_range(symbol, from_mt5, to_mt5, mt5.COPY_TICKS_ALL)

        rows = await asyncio.to_thread(_call)
        ticks = convert_ticks(rows, point)

        logger.info(
            "collector.service",
            f"get_ticks_range_by_datetime symbol={symbol} count={len(ticks)}",
        )

        return ticks

    async def get_ticks_by_datetime(
        self,
        symbol: str,
        point: int,
        from_dt: datetime,
        count: int,
    ) -> list[Tick]:
        if not symbol or count <= 0:
            return []

        await self.init()

        mt5 = self.client.mt5
        from_mt5 = utc_datetime_to_mt5(from_dt)

        def _call():
            return mt5.copy_ticks_from(symbol, from_mt5, count, mt5.COPY_TICKS_ALL)

        rows = await asyncio.to_thread(_call)
        ticks = convert_ticks(rows, point)

        logger.info(
            "collector.service",
            f"get_ticks_by_datetime symbol={symbol} count={len(ticks)}",
        )

        return ticks

    async def get_ticks_range_by_timestamp(
        self,
        symbol: str,
        point: int,
        from_ts: int,
        to_ts: int,
    ) -> list[Tick]:
        from_dt, to_dt = ts_range_to_utc(from_ts, to_ts)
        return await self.get_ticks_range_by_datetime(symbol, point, from_dt, to_dt)

    async def get_ticks_by_timestamp(
        self,
        symbol: str,
        point: int,
        from_ts: int,
        count: int,
    ) -> list[Tick]:
        from_dt = ts_range_to_utc(from_ts, from_ts)[0]
        return await self.get_ticks_by_datetime(symbol, point, from_dt, count)


SERVICE = CollectorService()