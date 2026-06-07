from __future__ import annotations

import asyncio

from reader import reader


async def main() -> None:
    await reader.Init()
    print(await reader.GetSymbolData("EURUSD"))
    print(await reader.GetLastTick("EURUSD"))
    print(await reader.GetLastOhlc("EURUSD", 60))
    await reader.Destroy()


if __name__ == "__main__":
    asyncio.run(main())
