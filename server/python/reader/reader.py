from __future__ import annotations

from typing import Any

from .runtime import reader as _reader


class _ReaderAPI:
    async def Init(self) -> None:
        await _reader.init()

    async def Destroy(self) -> None:
        await _reader.destroy()

    async def GetSymbolData(self, symbol: Any):
        return await _reader.get_symbol_data(symbol)

    async def GetLastTick(self, symbol: Any):
        return await _reader.get_last_tick(symbol)

    async def GetTickByTimestamp(self, symbol: Any, ts: Any):
        return await _reader.get_tick_by_timestamp(symbol, ts)

    async def GetTickByDatetime(self, symbol: Any, dt: Any):
        return await _reader.get_tick_by_datetime(symbol, dt)

    async def GetOhlcFromTickByTimestamp(self, symbol: Any, fromTs: Any, toTs: Any):
        return await _reader.get_ohlc_from_tick_by_timestamp(symbol, fromTs, toTs)

    async def GetOhlcFromTickByDatetime(self, symbol: Any, fromDt: Any, toDt: Any):
        return await _reader.get_ohlc_from_tick_by_datetime(symbol, fromDt, toDt)

    async def GetLastOhlc(self, symbol: Any, timeframe: Any):
        return await _reader.get_last_ohlc(symbol, timeframe)

    async def GetOhlcsByTimestamp(self, symbol: Any, timeframe: Any, ts: Any):
        return await _reader.get_ohlcs_by_timestamp(symbol, timeframe, ts)

    async def GetOhlcsByDatetime(self, symbol: Any, timeframe: Any, dt: Any):
        return await _reader.get_ohlcs_by_datetime(symbol, timeframe, dt)

    async def GetOhlcFromOhlcByTimestamp(
        self,
        symbol: Any,
        fromTimeframe: Any,
        toTimeframe: Any,
        fromTs: Any,
        toTs: Any,
    ):
        return await _reader.get_ohlc_from_ohlc_by_timestamp(
            symbol,
            fromTimeframe,
            toTimeframe,
            fromTs,
            toTs,
        )

    async def GetOhlcFromOhlcByDatetime(
        self,
        symbol: Any,
        fromTimeframe: Any,
        toTimeframe: Any,
        fromDt: Any,
        toDt: Any,
    ):
        return await _reader.get_ohlc_from_ohlc_by_datetime(
            symbol,
            fromTimeframe,
            toTimeframe,
            fromDt,
            toDt,
        )


reader = _ReaderAPI()
