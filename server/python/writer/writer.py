from __future__ import annotations

from typing import Any

from .runtime import writer as _writer


class _WriterAPI:
    async def Init(self) -> None:
        """Open the existing DuckDB file if it exists and apply logger mode from config."""
        await _writer.init()

    async def Destroy(self) -> None:
        """Close the DuckDB connection."""
        await _writer.destroy()

    async def ResetTick(self) -> None:
        """Clear all rows from Tick."""
        await _writer.reset_tick()

    async def AppendTicks(self, ticks: list[Any]) -> None:
        """Append multiple Tick dataclass rows."""
        await _writer.append_ticks(ticks)

    async def ResetOhlc(self) -> None:
        """Clear all rows from Ohlc."""
        await _writer.reset_ohlc()

    async def AppendOhlcs(self, ohlcs: list[Any]) -> None:
        """Append multiple Ohlc dataclass rows."""
        await _writer.append_ohlcs(ohlcs)

    async def SetSymbolData(self, row: Any) -> None:
        """Insert or replace one SymbolData dataclass row."""
        await _writer.set_symbol_data(row)


writer = _WriterAPI()
