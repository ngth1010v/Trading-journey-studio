from __future__ import annotations

import asyncio

from config import IPC_HOST, IPC_PORT
from controller import MarketController
from ipc import IpcServer
from logger import info, reset


async def main() -> None:
    reset()
    info("startup", "python controller starting")
    controller = MarketController()
    await controller.start()
    server = IpcServer(controller, IPC_HOST, IPC_PORT)
    await server.start()
    try:
        await server.serve_forever()
    finally:
        await server.close()
        await controller.stop()


if __name__ == "__main__":
    asyncio.run(main())
