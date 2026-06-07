from __future__ import annotations


_LOG_MODE = "debug"


def set_mode(mode: str | None) -> None:
    global _LOG_MODE
    _LOG_MODE = mode or ""


def _should_emit(level: str) -> bool:
    if _LOG_MODE == "hide":
        return False
    if _LOG_MODE == "debug":
        return True
    return level == "INFO"


def _emit(level: str, message: str) -> None:
    if _should_emit(level):
        print(f"[{level}]<{message}>")


def debug(message: str) -> None:
    _emit("DEBUG", message)


def info(message: str) -> None:
    _emit("INFO", message)


def warning(message: str) -> None:
    _emit("WARNING", message)


def error(message: str) -> None:
    _emit("ERROR", message)
