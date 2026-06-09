from __future__ import annotations

import queue
import socket
import threading
from typing import Any, Callable

from protocol import dumpsMessage, loadsMessage


IncomingHandler = Callable[[dict[str, Any]], None]


class SocketBridgeTransport:
    def __init__(self, host: str, port: int, onMessage: IncomingHandler) -> None:
        self._host = host
        self._port = port
        self._onMessage = onMessage
        self._server: socket.socket | None = None
        self._conn: socket.socket | None = None
        self._stop = threading.Event()
        self._ready = threading.Event()
        self._writerQueue: "queue.Queue[dict[str, Any] | None]" = queue.Queue()
        self._writerThread: threading.Thread | None = None
        self._readerThread: threading.Thread | None = None
        self._sendLock = threading.Lock()

    def start(self) -> None:
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind((self._host, self._port))
        self._server.listen(1)

        self._conn, _ = self._server.accept()
        self._conn.setblocking(True)
        self._ready.set()

        self._readerThread = threading.Thread(target=self._readerLoop, name="nodejs-bridge.reader", daemon=True)
        self._writerThread = threading.Thread(target=self._writerLoop, name="nodejs-bridge.writer", daemon=True)
        self._readerThread.start()
        self._writerThread.start()

    def waitUntilReady(self) -> None:
        self._ready.wait()

    def stop(self) -> None:
        self._stop.set()
        self._writerQueue.put(None)
        self._closeConnection()

    def send(self, message: dict[str, Any]) -> None:
        self._writerQueue.put(message)

    def _writerLoop(self) -> None:
        while not self._stop.is_set():
            message = self._writerQueue.get()
            if message is None:
                break
            try:
                self._sendRaw(message)
            except Exception:
                self._stop.set()
                break

    def _sendRaw(self, message: dict[str, Any]) -> None:
        if self._conn is None:
            raise RuntimeError("bridge is not connected")
        payload = (dumpsMessage(message) + "\n").encode("utf-8")
        with self._sendLock:
            self._conn.sendall(payload)

    def _readerLoop(self) -> None:
        if self._conn is None:
            return
        try:
            with self._conn.makefile("r", encoding="utf-8", newline="\n") as reader:
                while not self._stop.is_set():
                    line = reader.readline()
                    if not line:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        message = loadsMessage(line)
                    except Exception as exc:
                        self._onMessage({
                            "kind": "status",
                            "event": "STATUS",
                            "action": "PARSE_ERROR",
                            "ok": False,
                            "error": str(exc),
                            "source": "python",
                        })
                        continue
                    self._onMessage(message)
        finally:
            self._stop.set()
            self._writerQueue.put(None)
            self._closeConnection()

    def _closeConnection(self) -> None:
        conn = self._conn
        self._conn = None
        if conn is not None:
            try:
                conn.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass

        server = self._server
        self._server = None
        if server is not None:
            try:
                server.close()
            except Exception:
                pass
