from __future__ import annotations

import asyncio

from reader import reader


async def main() -> None:
    await reader.init()
    print(await reader.getSymbolData("EURUSD"))
    print(await reader.getLastTick("EURUSD"))
    print(await reader.getLastOhlc("EURUSD", 60))
    await reader.destroy()


if __name__ == "__main__":
    asyncio.run(main())