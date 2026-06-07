# writer/test.py

import asyncio
from datetime import datetime

from type import Tick, Ohlc, SymbolData
from writer.writer import writer


async def main() -> None:
    print("=== INIT ===")
    await writer.Init()

    print("=== RESET ===")
    await writer.ResetTick()
    await writer.ResetOhlc()

    print("=== SYMBOL DATA ===")
    await writer.SetSymbolData(
        SymbolData(
            symbol="EURUSD",
            point=10000,
        ),
    )

    print("=== APPEND TICKS ===")
    ticks = [
        Tick(
            symbol="EURUSD",
            timestamp=datetime(2024, 3, 9, 0, 0, 0),
            bid=108765,
            ask=108775,
            volume=100,
        ),
        Tick(
            symbol="EURUSD",
            timestamp=datetime(2024, 3, 9, 0, 0, 1),
            bid=108766,
            ask=108776,
            volume=101,
        ),
        Tick(
            symbol="EURUSD",
            timestamp=datetime(2024, 3, 9, 0, 0, 2),
            bid=108767,
            ask=108777,
            volume=102,
        ),
    ]

    await writer.AppendTicks(ticks)

    print("=== APPEND OLD TICK (SHOULD FAIL) ===")
    await writer.AppendTicks(
        [
            Tick(
                symbol="EURUSD",
                timestamp=datetime(2024, 3, 8, 23, 59, 59),
                bid=1,
                ask=1,
                volume=1,
            )
        ]
    )

    print("=== APPEND OHLC ===")
    ohlcs = [
        Ohlc(
            symbol="EURUSD",
            timeframe=60,
            openTimestamp=datetime(2024, 3, 9, 0, 0, 0),
            open=108700,
            high=108900,
            low=108600,
            close=108800,
            volume=500,
        ),
        Ohlc(
            symbol="EURUSD",
            timeframe=60,
            openTimestamp=datetime(2024, 3, 9, 0, 1, 0),
            open=108800,
            high=108950,
            low=108700,
            close=108850,
            volume=600,
        ),
    ]

    await writer.AppendOhlcs(ohlcs)

    print("=== APPEND OLD OHLC (SHOULD FAIL) ===")
    await writer.AppendOhlcs(
        [
            Ohlc(
                symbol="EURUSD",
                timeframe=60,
                openTimestamp=datetime(2024, 3, 8, 22, 13, 20),
                open=1,
                high=1,
                low=1,
                close=1,
                volume=1,
            )
        ]
    )

    print("=== DESTROY ===")
    await writer.Destroy()

    print("=== DONE ===")


if __name__ == "__main__":
    asyncio.run(main())
