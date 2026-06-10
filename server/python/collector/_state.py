from __future__ import annotations

import asyncio
from dataclasses import dataclass
from threading import RLock

import logger


@dataclass(slots=True)
class _SessionState:
    initialized: bool = False


class CollectorState:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sync_lock = RLock()
        self._state = _SessionState()

    @property
    def initialized(self) -> bool:
        return self._state.initialized

    def _set_initialized(self, value: bool) -> None:
        self._state.initialized = value

    async def ensure_initialized(self, mt5) -> None:
        async with self._lock:
            if self._state.initialized:
                return

            logger.info("collector.state", "initializing MT5")

            ok = await asyncio.to_thread(mt5.initialize)

            if not ok:
                error = mt5.last_error()
                logger.error(
                    "collector.state",
                    f"mt5.initialize() failed: {error}",
                )
                raise RuntimeError(f"mt5.initialize() failed: {error}")

            self._set_initialized(True)
            logger.info("collector.state", "MT5 initialized")

    async def shutdown(self, mt5) -> None:
        async with self._lock:
            if not self._state.initialized:
                return

            logger.info("collector.state", "shutting down MT5")

            await asyncio.to_thread(mt5.shutdown)

            self._set_initialized(False)

            logger.info("collector.state", "MT5 shutdown completed")

    def sync_lock(self) -> RLock:
        return self._sync_lock