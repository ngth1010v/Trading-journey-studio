from __future__ import annotations

from typing import Any

from .runtime import reader as _reader


class _ReaderAPI:

    #=================================================================================
    # GENERAL
    #=================================================================================
    async def init(self) -> None:
        await _reader.init()

    async def destroy(self) -> None:
        await _reader.destroy()

    async def getSymbolData(self, symbol: Any):
        return await _reader.get_symbol_data(symbol)


    #=================================================================================
    # TICK
    #=================================================================================
    async def getLastTick(self, symbol: Any):
        return await _reader.get_last_tick(symbol)
    
    async def getFirstTick(self, symbol: Any):
        return await _reader.get_first_tick(symbol)

    async def getTickByTimestamp(self, symbol: Any, ts: Any):
        return await _reader.get_tick_by_timestamp(symbol, ts)

    async def getTickByDatetime(self, symbol: Any, dt: Any):
        return await _reader.get_tick_by_datetime(symbol, dt)


    #=================================================================================
    # OHLC
    #=================================================================================
    async def getLastOhlc(self, symbol: Any, timeframe: Any):
        return await _reader.get_last_ohlc(symbol, timeframe)
    
    async def getFirstOhlc(self, symbol: Any, timeframe: Any):
        return await _reader.get_first_ohlc(symbol, timeframe)

    async def getOhlcsByTimestamp(self, symbol: Any, timeframe: Any, ts: Any):
        return await _reader.get_ohlcs_by_timestamp(symbol, timeframe, ts)

    async def getOhlcsByDatetime(self, symbol: Any, timeframe: Any, dt: Any):
        return await _reader.get_ohlcs_by_datetime(symbol, timeframe, dt)
    

    #=================================================================================
    # OHLC BUILD
    #=================================================================================
    async def getOhlcFromTickByTimestamp(self, symbol: Any, fromTs: Any, toTs: Any):
        return await _reader.get_ohlc_from_tick_by_timestamp(symbol, fromTs, toTs)

    async def getOhlcFromTickByDatetime(self, symbol: Any, fromDt: Any, toDt: Any):
        return await _reader.get_ohlc_from_tick_by_datetime(symbol, fromDt, toDt)

    async def getOhlcFromOhlcByTimestamp(
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

    async def getOhlcFromOhlcByDatetime(
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