from __future__ import annotations

import asyncio
from dataclasses import dataclass
from threading import RLock


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
            ok = await asyncio.to_thread(mt5.initialize)
            if not ok:
                raise RuntimeError(f"mt5.initialize() failed: {mt5.last_error()}")
            self._set_initialized(True)

    async def shutdown(self, mt5) -> None:
        async with self._lock:
            if not self._state.initialized:
                return
            await asyncio.to_thread(mt5.shutdown)
            self._set_initialized(False)

    def sync_lock(self) -> RLock:
        return self._sync_lock
