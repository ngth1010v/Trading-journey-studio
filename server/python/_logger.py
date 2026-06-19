from __future__ import annotations

import threading
from datetime import datetime, timezone

_LOCK = threading.Lock()

_RESET = "\033[0m"
_COLORS = {
    "DEBUG": "\033[90m",    # Gray
    "INFO": "\033[92m",     # Green
    "WARNING": "\033[93m",  # Yellow
    "ERROR": "\033[91m",    # Red
}


def reset() -> None:
    pass


def _write(level: str, section: str, message: str) -> None:
    try:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        color = _COLORS.get(level.upper(), "")
        line = f"{ts} [{level.upper()}][{section}] {message}"

        with _LOCK:
            print(f"{color}{line}{_RESET}", flush=True)

    except Exception:
        # Logging must never crash the application.
        pass


def debug(section: str, message: str) -> None:
    _write("DEBUG", section, message)


def info(section: str, message: str) -> None:
    _write("INFO", section, message)


def warning(section: str, message: str) -> None:
    _write("WARNING", section, message)


def error(section: str, message: str) -> None:
    _write("ERROR", section, message)