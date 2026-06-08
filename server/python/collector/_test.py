from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from collector.collector import (
    Init,
    Destroy,
    GetSymbolDatas,
    GetTicksRangeByTimestamp,
    GetTicksRangeByDatetime,
    GetTicksByTimestamp,
    GetTicksByDatetime,
)


async def main() -> None:
    await Init()
    try:
        symbols = await GetSymbolDatas()
        print(f"symbols={len(symbols)}")
        if symbols:
            s = symbols[0]
            print("first_symbol", s)
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            ticks1 = await GetTicksByDatetime(s.symbol, s.point, now, 10)
            print(f"ticks_by_datetime={len(ticks1)}")
            ts = int(datetime.now(timezone.utc).timestamp())
            ticks2 = await GetTicksByTimestamp(s.symbol, s.point, ts, 10)
            print(f"ticks_by_timestamp={len(ticks2)}")
            ticks3 = await GetTicksRangeByDatetime(s.symbol, s.point, now, now)
            print(f"ticks_range_by_datetime={len(ticks3)}")
            ticks4 = await GetTicksRangeByTimestamp(s.symbol, s.point, ts, ts)
            print(f"ticks_range_by_timestamp={len(ticks4)}")
    finally:
        await Destroy()


if __name__ == "__main__":
    asyncio.run(main())
