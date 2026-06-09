from __future__ import annotations

from datetime import datetime
from typing import Any

try:
    from collector.collector import collector as _collector
except Exception:  # pragma: no cover - tests can monkeypatch these
    _collector = None

try:
    from reader.reader import reader as _reader
except Exception:  # pragma: no cover - tests can monkeypatch these
    _reader = None

try:
    from writer.writer import writer as _writer
except Exception:  # pragma: no cover - tests can monkeypatch these
    _writer = None

from ._service import ControllerService

collector: Any = _collector
reader: Any = _reader
writer: Any = _writer


class Controller:

    #=================================================================================
    # GENERAL
    #=================================================================================
    def __init__(self) -> None:
        self._service = ControllerService(collector, reader, writer)

    def init(self, symbol: str) -> None:
        self._service.init(symbol)

    def destroy(self) -> None:
        self._service.destroy()

    def reset(self) -> None:
        self._service.reset()


    #=================================================================================
    # TICK
    #=================================================================================
    def updateTickByTimestamp(self, fromTs: int) -> None:
        self._service.updateTickByTimestamp(fromTs)

    def updateTickByDatetime(self, fromDt: datetime) -> None:
        self._service.updateTickByDatetime(fromDt)


    #=================================================================================
    # OHLC
    #=================================================================================
    def resetOhlc(self, timeframe: int) -> None:
        self._service.resetOhlc(timeframe)

    def updateOhlc(self, timeframe: int) -> None:
        self._service.updateOhlc(timeframe)

    def startCrawlOhlc(self, timeframe: int) -> None:
        self._service.startCrawlOhlc(timeframe)

    def endCrawlOhlc(self, timeframe: int) -> None:
        self._service.endCrawlOhlc(timeframe)
