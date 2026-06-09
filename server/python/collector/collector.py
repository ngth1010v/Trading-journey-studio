from __future__ import annotations

"""Public API for MT5 tick collection.

How to use:

    import asyncio
    from collector.collector import collector

    async def main():
        await collector.init()
        ticks = await collector.getTicksByTimestamp("EURUSD", 100000, 1710000000, 100)
        await collector.destroy()

    asyncio.run(main())
"""

from datetime import datetime

from ._service import SERVICE
from ._types import Tick, SymbolData


class _CollectorAPI:

    #=================================================================================
    # GENERAL
    #=================================================================================
    async def init(self) -> None:
        await SERVICE.init()

    async def destroy(self) -> None:
        await SERVICE.destroy()

    async def getSymbolDatas(self) -> list[SymbolData]:
        return await SERVICE.get_symbol_datas()

    #=================================================================================
    # TICK
    #=================================================================================
    async def getTicksRangeByTimestamp(self, symbol: str, point: int, fromTs: int, toTs: int) -> list[Tick]:
        return await SERVICE.get_ticks_range_by_timestamp(symbol, point, fromTs, toTs)

    async def getTicksRangeByDatetime(self, symbol: str, point: int, fromDt: datetime, toDt: datetime) -> list[Tick]:
        return await SERVICE.get_ticks_range_by_datetime(symbol, point, fromDt, toDt)

    async def getTicksByTimestamp(self, symbol: str, point: int, fromTs: int, count: int) -> list[Tick]:
        return await SERVICE.get_ticks_by_timestamp(symbol, point, fromTs, count)

    async def getTicksByDatetime(self, symbol: str, point: int, fromDt: datetime, count: int) -> list[Tick]:
        return await SERVICE.get_ticks_by_datetime(symbol, point, fromDt, count)


collector = _CollectorAPI()