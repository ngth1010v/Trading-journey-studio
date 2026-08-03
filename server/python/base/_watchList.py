from __future__ import annotations

import threading

import _logger as logger

_LOG_SECTION = "_watchList"
_cache: list[str] = []
_is_initialized = False
_lock = threading.Lock()


def init() -> None:
    """Initialize in-memory watchList tracking."""
    global _cache, _is_initialized
    with _lock:
        _cache = []
        _is_initialized = True
        logger.info(_LOG_SECTION, "WatchList initialized in memory.")


def getWatchList() -> list[str]:
    """Return all currently watched symbols in memory."""
    _check_initialized()
    with _lock:
        return list(_cache)


def registry(symbol: str) -> None:
    """Register a symbol into the active watchList."""
    _check_initialized()
    with _lock:
        if symbol not in _cache:
            _cache.append(symbol)
            logger.debug(_LOG_SECTION, f"Registered watching symbol '{symbol}'.")


def unregistry(symbol: str) -> None:
    """Unregister a symbol from the active watchList."""
    _check_initialized()
    with _lock:
        if symbol in _cache:
            _cache.remove(symbol)
            logger.debug(_LOG_SECTION, f"Unregistered watching symbol '{symbol}'.")
        else:
            logger.warning(_LOG_SECTION, f"Symbol '{symbol}' was not registered in watchList.")


def _check_initialized() -> None:
    if not _is_initialized:
        logger.error(_LOG_SECTION, "Attempted to access watchList before init()")
        raise RuntimeError("watchList is not initialized. Please call init() first.")