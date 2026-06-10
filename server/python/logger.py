from __future__ import annotations

from datetime import datetime
from pathlib import Path
from threading import Lock

_LOG_FILE = Path("python.log")
_LOCK = Lock()

#=====================================================================================
# HELPER
#=====================================================================================
def _write(level: str, section: str, message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{timestamp} [{level}][{section}] {message}\n"

    with _LOCK:
        with _LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line)



#=====================================================================================
# PUBLIC API
#=====================================================================================
def reset() -> None:
    with _LOCK:
        _LOG_FILE.write_text("", encoding="utf-8")


def debug(section: str, message: str) -> None:
    _write("DEBUG", section, message)


def info(section: str, message: str) -> None:
    _write("INFO", section, message)


def warning(section: str, message: str) -> None:
    _write("WARNING", section, message)


def error(section: str, message: str) -> None:
    _write("ERROR", section, message)