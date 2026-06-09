from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(slots=True)
class BridgeConfig:
    host: str
    port: int

    @classmethod
    def fromEnv(cls) -> "BridgeConfig":
        host = os.getenv("PYTHON_BRIDGE_HOST") or "127.0.0.1"
        portText = (
            os.getenv("PYTHON_BRIDGE_PORT")
            or os.getenv("PYTHON_POST")
            or os.getenv("PORT")
            or "5000"
        )
        return cls(host=host, port=int(portText))
