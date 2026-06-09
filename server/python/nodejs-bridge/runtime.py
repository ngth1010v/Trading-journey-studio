from __future__ import annotations

import threading
from typing import Any

from config import BridgeConfig
from controllers import ControllerRegistry
from dispatcher import MessageDispatcher
from protocol import makeEvent, makeStatus
from transport import SocketBridgeTransport


class BridgeRuntime:
    def __init__(self) -> None:
        self._config = BridgeConfig.fromEnv()
        self._callbacks = MessageDispatcher()
        self._controllers = ControllerRegistry()
        self._transport = SocketBridgeTransport(
            host=self._config.host,
            port=self._config.port,
            onMessage=self._handleIncoming,
        )
        self._started = threading.Event()
        self._stopped = threading.Event()
        self._lock = threading.RLock()

    def main(self) -> None:
        with self._lock:
            if self._started.is_set():
                return
            self._started.set()

        self._transport.start()
        self._transport.waitUntilReady()
        self.send("STATUS", {"state": "READY", "port": self._config.port})
        self._stopped.wait()

    def shutdown(self) -> None:
        if self._stopped.is_set():
            return
        self._controllers.destroyAll()
        self._transport.stop()
        self._stopped.set()

    def addListenCallback(self, cbName: str, cb) -> None:
        self._callbacks.add(cbName, cb)

    def removeListenCallback(self, cbName: str) -> None:
        self._callbacks.remove(cbName)

    def send(self, event: str, data: Any = None) -> None:
        self._transport.send(makeEvent(event, data))

    def _handleIncoming(self, message: dict[str, Any]) -> None:
        event = str(message.get("event", ""))
        data = message.get("data")
        self._callbacks.dispatch(event, data, message)

        if event == "SHUTDOWN":
            self._transport.send(makeStatus(event, True, {"state": "STOPPING"}))
            self.shutdown()
            return

        try:
            self._handleCommand(event, data)
        except Exception as exc:
            self._transport.send(makeStatus(event, False, data, str(exc)))
            return

        self._transport.send(makeStatus(event, True, data))

    def _handleCommand(self, event: str, data: Any) -> None:
        if not isinstance(data, dict):
            data = {}

        symbol = str(data.get("symbol", "")).strip()
        timeframe = data.get("timeframe")
        timestamp = data.get("timestamp", data.get("fromTs"))

        if event == "RESET":
            self._requireSymbol(symbol)
            self._controllers.resetSymbol(symbol)
            return

        if event == "UPDATE_TICK":
            self._requireSymbol(symbol)
            self._controllers.updateTick(symbol, int(timestamp))
            return

        if event == "RESET_OHLC":
            self._requireSymbol(symbol)
            self._controllers.resetOhlc(symbol, int(timeframe))
            return

        if event == "UPDATE_OHLC":
            self._requireSymbol(symbol)
            self._controllers.updateOhlc(symbol, int(timeframe))
            return

        if event == "START_CRAWL_OHLC":
            self._requireSymbol(symbol)
            self._controllers.startCrawlOhlc(symbol, int(timeframe))
            return

        if event == "END_CRAWL_OHLC":
            self._requireSymbol(symbol)
            self._controllers.endCrawlOhlc(symbol, int(timeframe))
            return

        raise ValueError(f"unknown bridge event: {event}")

    @staticmethod
    def _requireSymbol(symbol: str) -> None:
        if not symbol:
            raise ValueError("data.symbol is required")


runtime = BridgeRuntime()
