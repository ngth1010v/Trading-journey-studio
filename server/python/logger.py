from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from config import PYTHON_LOG_PATH

_LOG_LOCK = Lock()


def reset() -> None:
    PYTHON_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOG_LOCK:
        PYTHON_LOG_PATH.write_text("", encoding="utf-8")


def _write(level: str, section: str, message: str) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    line = f"{timestamp} [{level.upper()}][{section}] {message}\n"
    PYTHON_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOG_LOCK:
        with PYTHON_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(line)


def debug(section: str, message: str) -> None:
    _write("DEBUG", section, message)


def info(section: str, message: str) -> None:
    _write("INFO", section, message)


def warning(section: str, message: str) -> None:
    _write("WARNING", section, message)


def error(section: str, message: str) -> None:
    _write("ERROR", section, message)
