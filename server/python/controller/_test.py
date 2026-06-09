from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

import controller.controller as controller_module
from controller.controller import Controller

try:
    from type import Ohlc, SymbolData, Tick
except Exception:  # pragma: no cover - standalone smoke test
    @dataclass(slots=True)
    class Tick:
        timestamp: datetime
        bid: int
        ask: int
        volume: int

    @dataclass(slots=True)
    class Ohlc:
        openTimestamp: datetime
        open: int
        high: int
        low: int
        close: int
        volume: int

    @dataclass(slots=True)
    class SymbolData:
        symbol: str
        point: int


@dataclass
class _FakeCollector:
    symbol_data: list[SymbolData]
    ticks: list[Tick]
    inited: bool = False
    destroyed: bool = False

    async def init(self) -> None:
        self.inited = True

    async def destroy(self) -> None:
        self.destroyed = True

    async def getSymbolDatas(self) -> list[SymbolData]:
        return self.symbol_data

    async def getTicksByTimestamp(self, symbol: str, point: int, fromTs: int, count: int) -> list[Tick]:
        del point
        out: list[Tick] = []
        for tick in self.ticks:
            ts = int(tick.timestamp.replace(tzinfo=timezone.utc).timestamp())
            if symbol and fromTs <= ts < fromTs + count:
                out.append(tick)
        return out


@dataclass
class _FakeReader:
    symbol_data: SymbolData | None
    ticks: list[Tick]
    ohlcs: dict[int, list[Ohlc]]

    async def init(self) -> None:
        return None

    async def destroy(self) -> None:
        return None

    async def getSymbolData(self, symbol: str) -> SymbolData | None:
        return self.symbol_data if self.symbol_data and self.symbol_data.symbol == symbol else None

    async def getLastTick(self, symbol: str | None = None) -> Tick | None:
        del symbol
        return self.ticks[-1] if self.ticks else None

    async def getFirstTick(self, symbol: str | None = None) -> Tick | None:
        del symbol
        return self.ticks[0] if self.ticks else None

    async def getLastOhlc(self, symbol: str | None, timeframe: int) -> Ohlc | None:
        del symbol
        arr = self.ohlcs.get(timeframe, [])
        return arr[-1] if arr else None

    async def getTicksRangeByTimestamp(self, symbol: str, point: int, fromTs: int, toTs: int) -> list[Tick]:
        del point
        out: list[Tick] = []
        for tick in self.ticks:
            ts = int(tick.timestamp.replace(tzinfo=timezone.utc).timestamp())
            if symbol and fromTs <= ts <= toTs:
                out.append(tick)
        return out


@dataclass
class _FakeWriter:
    symbol_datas: list[SymbolData]
    appended_ticks: list[tuple[str, list[Tick]]]
    appended_ohlcs: list[tuple[str, int, list[Ohlc]]]
    reset_all_calls: list[str]
    reset_ohlc_calls: list[tuple[str, int]]

    async def init(self) -> None:
        return None

    async def destroy(self) -> None:
        return None

    async def setSymbolData(self, row: SymbolData) -> None:
        self.symbol_datas.append(row)

    async def resetAll(self, symbol: str) -> None:
        self.reset_all_calls.append(symbol)

    async def resetOhlc(self, symbol: str, timeframe: int) -> None:
        self.reset_ohlc_calls.append((symbol, timeframe))

    async def appendTicks(self, symbol: str, ticks: list[Tick]) -> None:
        self.appended_ticks.append((symbol, list(ticks)))

    async def appendOhlcs(self, symbol: str, timeframe: int, ohlcs: list[Ohlc]) -> None:
        self.appended_ohlcs.append((symbol, timeframe, list(ohlcs)))


async def main() -> None:
    symbol = "EURUSD"
    point = 100000

    ticks = [
        Tick(timestamp=datetime(2026, 6, 9, 0, 0, 5), bid=100, ask=101, volume=1),
        Tick(timestamp=datetime(2026, 6, 9, 0, 0, 35), bid=103, ask=104, volume=2),
        Tick(timestamp=datetime(2026, 6, 9, 0, 1, 5), bid=101, ask=102, volume=3),
        Tick(timestamp=datetime(2026, 6, 9, 0, 1, 35), bid=110, ask=111, volume=4),
    ]
    symbol_data = SymbolData(symbol=symbol, point=point)

    fake_collector = _FakeCollector([symbol_data], ticks)
    fake_reader = _FakeReader(symbol_data, ticks, {})
    fake_writer = _FakeWriter([], [], [], [], [])

    controller_module.collector = fake_collector
    controller_module.reader = fake_reader
    controller_module.writer = fake_writer

    c = Controller()
    c.init(symbol)
    c.updateTickByTimestamp(0)
    c.updateOhlc(1)
    c.startCrawlOhlc(1)
    c.endCrawlOhlc(1)
    c.resetOhlc(1)
    c.reset()
    c.destroy()

    print("ok")
    print("collector.init:", fake_collector.inited)
    print("writer.appendTicks calls:", len(fake_writer.appended_ticks))
    print("writer.appendOhlcs calls:", len(fake_writer.appended_ohlcs))
    print("writer.resetAll calls:", fake_writer.reset_all_calls)


if __name__ == "__main__":
    asyncio.run(main())
