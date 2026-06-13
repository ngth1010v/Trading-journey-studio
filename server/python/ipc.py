from __future__ import annotations

import asyncio
import json
from typing import Any

from controller import MarketController
from logger import error, info


class IpcServer:
    def __init__(self, controller: MarketController, host: str, port: int) -> None:
        self.controller = controller
        self.host = host
        self.port = port
        self._server: asyncio.base_events.Server | None = None

    async def start(self) -> None:
        self._server = await asyncio.start_server(self._handle_client, self.host, self.port)
        info("ipc", f"listening on {self.host}:{self.port}")

    async def serve_forever(self) -> None:
        if self._server is None:
            await self.start()
        assert self._server is not None
        async with self._server:
            await self._server.serve_forever()

    async def close(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            raw = await reader.readline()
            if not raw:
                writer.close()
                await writer.wait_closed()
                return

            try:
                request = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                response = {"ok": False, "error": f"invalid json: {exc}"}
            else:
                result = await self.controller.handle(request)
                response = {"ok": result.ok, "data": result.data, "error": result.error}

            writer.write((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8"))
            await writer.drain()
        except Exception as exc:
            error("ipc", f"client handler error: {exc}")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
