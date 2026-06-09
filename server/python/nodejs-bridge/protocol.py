from __future__ import annotations

import json
from typing import Any


def makeMessage(kind: str, event: str, data: Any = None, **extra: Any) -> dict[str, Any]:
    message: dict[str, Any] = {
        "kind": kind,
        "event": event,
        "data": data,
    }
    if extra:
        message.update(extra)
    return message


def makeEvent(event: str, data: Any = None) -> dict[str, Any]:
    return makeMessage("event", event, data, source="python")


def makeStatus(
    event: str,
    ok: bool,
    data: Any = None,
    error: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    message = makeMessage("status", event, data, ok=ok, source="python", **extra)
    if error is not None:
        message["error"] = error
    return message


def dumpsMessage(message: dict[str, Any]) -> str:
    return json.dumps(message, ensure_ascii=False, separators=(",", ":"))


def loadsMessage(text: str) -> dict[str, Any]:
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("bridge message must be a JSON object")
    return value
