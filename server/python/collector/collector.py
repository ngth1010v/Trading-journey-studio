from __future__ import annotations

"""Public API for MT5 tick collection.

How to use:

    import asyncio
    from collector.collector import Init, Destroy, GetTicksByTimestamp

    async def main():
        await Init()
        ticks = await GetTicksByTimestamp("EURUSD", 100000, 1710000000, 100)
        await Destroy()

    asyncio.run(main())
"""

from datetime import datetime

from ._service import SERVICE
from ._types import Tick, SymbolData


async def Init():
    await SERVICE.init()


async def Destroy():
    await SERVICE.destroy()


async def GetSymbolDatas() -> list[SymbolData]:
    return await SERVICE.get_symbol_datas()


async def GetTicksRangeByTimestamp(symbol: str, point: int, fromTs: int, toTs: int) -> list[Tick]:
    return await SERVICE.get_ticks_range_by_timestamp(symbol, point, fromTs, toTs)


async def GetTicksRangeByDatetime(symbol: str, point: int, fromDt: datetime, toDt: datetime) -> list[Tick]:
    return await SERVICE.get_ticks_range_by_datetime(symbol, point, fromDt, toDt)


async def GetTicksByTimestamp(symbol: str, point: int, fromTs: int, count: int) -> list[Tick]:
    return await SERVICE.get_ticks_by_timestamp(symbol, point, fromTs, count)


async def GetTicksByDatetime(symbol: str, point: int, fromDt: datetime, count: int) -> list[Tick]:
    return await SERVICE.get_ticks_by_datetime(symbol, point, fromDt, count)
