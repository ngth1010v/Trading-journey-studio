from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType


def loadBridgeEntry() -> ModuleType:
    bridgePath = Path(__file__).resolve().parent / "nodejs-bridge" / "nodejs-bridge.py"
    spec = importlib.util.spec_from_file_location("nodejs_bridge_entry", bridgePath)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load bridge entry: {bridgePath}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    bridge = loadBridgeEntry()
    bridge.main()


if __name__ == "__main__":
    main()
