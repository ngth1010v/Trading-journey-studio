from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
from typing import Any, Callable


Callback = Callable[[str, Any, dict[str, Any]], None]


@dataclass(slots=True)
class CallbackItem:
    name: str
    callback: Callback


class MessageDispatcher:
    def __init__(self) -> None:
        self._lock = RLock()
        self._callbacks: dict[str, CallbackItem] = {}

    def add(self, name: str, callback: Callback) -> None:
        with self._lock:
            self._callbacks[name] = CallbackItem(name=name, callback=callback)

    def remove(self, name: str) -> None:
        with self._lock:
            self._callbacks.pop(name, None)

    def dispatch(self, event: str, data: Any, raw: dict[str, Any]) -> None:
        with self._lock:
            callbacks = list(self._callbacks.values())

        for item in callbacks:
            try:
                item.callback(event, data, raw)
            except Exception:
                pass
