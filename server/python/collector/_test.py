from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from collector.collector import collector


async def main() -> None:
    await collector.init()
    try:
        symbols = await collector.getSymbolDatas()
        print(f"symbols={len(symbols)}")
        if symbols:
            s = symbols[0]
            print("first_symbol", s)
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            ticks1 = await collector.getTicksByDatetime(s.symbol, s.point, now, 10)
            print(f"ticks_by_datetime={len(ticks1)}")
            ts = int(datetime.now(timezone.utc).timestamp())
            ticks2 = await collector.getTicksByTimestamp(s.symbol, s.point, ts, 10)
            print(f"ticks_by_timestamp={len(ticks2)}")
            ticks3 = await collector.getTicksRangeByDatetime(s.symbol, s.point, now, now)
            print(f"ticks_range_by_datetime={len(ticks3)}")
            ticks4 = await collector.getTicksRangeByTimestamp(s.symbol, s.point, ts, ts)
            print(f"ticks_range_by_timestamp={len(ticks4)}")
    finally:
        await collector.destroy()


if __name__ == "__main__":
    asyncio.run(main())