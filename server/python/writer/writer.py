from __future__ import annotations

from typing import Any

from .runtime import writer as _writer


class _WriterAPI:

    #=================================================================================
    # GENERAL
    #=================================================================================
    async def init(self) -> None:
        """Open or create the DuckDB file and prepare the SymbolData table."""
        await _writer.init()

    async def destroy(self) -> None:
        """Close the DuckDB connection."""
        await _writer.destroy()


    #=================================================================================
    # TICK
    #=================================================================================
    async def resetTick(self, symbol: str) -> None:
        """Delete the tick parquet file for one symbol."""
        await _writer.reset_tick(symbol)

    async def resetAll(self, symbol: str) -> None:
        """Delete the tick file and every available OHLC timeframe file for one symbol."""
        await _writer.reset_all(symbol)

    async def appendTicks(self, symbol: str, ticks: list[Any]) -> None:
        """Append multiple Tick dataclass rows into one symbol parquet file."""
        await _writer.append_ticks(symbol, ticks)

    #=================================================================================
    # OHLC
    #=================================================================================
    async def resetOhlc(self, symbol: str, timeframe: int) -> None:
        """Delete one OHLC parquet file for one symbol and timeframe."""
        await _writer.reset_ohlc(symbol, timeframe)

    async def appendOhlcs(self, symbol: str, timeframe: int, ohlcs: list[Any]) -> None:
        """Append multiple Ohlc dataclass rows into one symbol/timeframe parquet file."""
        await _writer.append_ohlcs(symbol, timeframe, ohlcs)

    async def setSymbolData(self, row: Any) -> None:
        """Insert or replace one SymbolData dataclass row."""
        await _writer.set_symbol_data(row)

    # Backward-compatible aliases.
    Init = init
    Destroy = destroy
    ResetTick = resetTick
    ResetAll = resetAll
    AppendTicks = appendTicks
    ResetOhlc = resetOhlc
    AppendOhlcs = appendOhlcs
    SetSymbolData = setSymbolData


writer = _WriterAPI()
