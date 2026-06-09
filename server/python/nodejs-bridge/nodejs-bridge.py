from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable


CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent

if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from runtime import runtime  # noqa: E402


class NodejsBridge:
    def main(self) -> None:
        runtime.main()

    def shutdown(self) -> None:
        runtime.shutdown()

    def send(self, event: str, data: Any = None) -> None:
        runtime.send(event, data)

    def addListenCallback(self, cbName: str, cb: Callable[[str, Any, dict[str, Any]], None]) -> None:
        runtime.addListenCallback(cbName, cb)

    def removeListenCallback(self, cbName: str) -> None:
        runtime.removeListenCallback(cbName)


nodejsBridge = NodejsBridge()

main = nodejsBridge.main
send = nodejsBridge.send
addListenCallback = nodejsBridge.addListenCallback
removeListenCallback = nodejsBridge.removeListenCallback


if __name__ == "__main__":
    main()
