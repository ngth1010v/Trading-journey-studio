from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from type import Ohlc, SymbolData, Tick
from writer.writer import writer


async def main() -> None:
    print("=== INIT ===")
    await writer.Init()

    symbol = "EURUSD"
    timeframe = 60

    print("=== RESET SYMBOL FILES ===")
    await writer.ResetTick(symbol)
    await writer.ResetOhlc(symbol, timeframe)

    print("=== SYMBOL DATA ===")
    await writer.SetSymbolData(SymbolData(symbol=symbol, point=10000))

    print("=== APPEND TICKS ===")
    ticks = [
        Tick(timestamp=datetime(2024, 3, 9, 0, 0, 0, tzinfo=timezone.utc), bid=108765, ask=108775, volume=100),
        Tick(timestamp=datetime(2024, 3, 9, 0, 0, 1, tzinfo=timezone.utc), bid=108766, ask=108776, volume=101),
        Tick(timestamp=datetime(2024, 3, 9, 0, 0, 2, tzinfo=timezone.utc), bid=108767, ask=108777, volume=102),
    ]
    await writer.AppendTicks(symbol, ticks)

    print("=== APPEND OLD TICK (SHOULD FAIL) ===")
    await writer.AppendTicks(
        symbol,
        [Tick(timestamp=datetime(2024, 3, 8, 23, 59, 59, tzinfo=timezone.utc), bid=1, ask=1, volume=1)],
    )

    print("=== APPEND OHLC ===")
    ohlcs = [
        Ohlc(openTimestamp=datetime(2024, 3, 9, 0, 0, 0, tzinfo=timezone.utc), open=108700, high=108900, low=108600, close=108800, volume=500),
        Ohlc(openTimestamp=datetime(2024, 3, 9, 0, 1, 0, tzinfo=timezone.utc), open=108800, high=108950, low=108700, close=108850, volume=600),
    ]
    await writer.AppendOhlcs(symbol, timeframe, ohlcs)

    print("=== APPEND OLD OHLC (SHOULD FAIL) ===")
    await writer.AppendOhlcs(
        symbol,
        timeframe,
        [Ohlc(openTimestamp=datetime(2024, 3, 8, 22, 13, 20, tzinfo=timezone.utc), open=1, high=1, low=1, close=1, volume=1)],
    )

    print("=== DESTROY ===")
    await writer.Destroy()

    print("=== DONE ===")


if __name__ == "__main__":
    asyncio.run(main())
