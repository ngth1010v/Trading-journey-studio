from __future__ import annotations

from threading import RLock
from typing import Any


try:
    from controller.controller import Controller
except Exception:  # pragma: no cover
    Controller = None  # type: ignore[assignment]


class NullController:
    def init(self, symbol: str) -> None:
        return None

    def destroy(self) -> None:
        return None

    def reset(self) -> None:
        return None

    def updateTickByTimestamp(self, fromTs: int) -> None:
        return None

    def resetOhlc(self, timeframe: int) -> None:
        return None

    def updateOhlc(self, timeframe: int) -> None:
        return None

    def startCrawlOhlc(self, timeframe: int) -> None:
        return None

    def endCrawlOhlc(self, timeframe: int) -> None:
        return None


class ControllerRegistry:
    def __init__(self) -> None:
        self._lock = RLock()
        self._controllers: dict[str, Any] = {}

    def _createController(self) -> Any:
        if Controller is None:
            return NullController()
        return Controller()

    def _get(self, symbol: str) -> Any:
        with self._lock:
            controller = self._controllers.get(symbol)
            if controller is None:
                controller = self._createController()
                try:
                    controller.init(symbol)
                except Exception:
                    pass
                self._controllers[symbol] = controller
            return controller

    def resetSymbol(self, symbol: str) -> None:
        self._get(symbol).reset()

    def updateTick(self, symbol: str, timestamp: int) -> None:
        self._get(symbol).updateTickByTimestamp(int(timestamp))

    def resetOhlc(self, symbol: str, timeframe: int) -> None:
        self._get(symbol).resetOhlc(int(timeframe))

    def updateOhlc(self, symbol: str, timeframe: int) -> None:
        self._get(symbol).updateOhlc(int(timeframe))

    def startCrawlOhlc(self, symbol: str, timeframe: int) -> None:
        self._get(symbol).startCrawlOhlc(int(timeframe))

    def endCrawlOhlc(self, symbol: str, timeframe: int) -> None:
        self._get(symbol).endCrawlOhlc(int(timeframe))

    def destroyAll(self) -> None:
        with self._lock:
            controllers = list(self._controllers.values())
            self._controllers.clear()

        for controller in controllers:
            try:
                controller.destroy()
            except Exception:
                pass
