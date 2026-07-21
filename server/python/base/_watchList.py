import json
import os
import queue
import threading

import _logger as logger
from config import DATABASE_PATH

DB_PATH = DATABASE_PATH / "chartData" / "candles" / "watchList.json"

_LOG_SECTION = "_watchList"
_cache = []
_is_initialized = False

# Queue & Sync mechanisms
_task_queue = queue.Queue()
_lock = threading.Lock()
_worker_thread = None


def init():
    """Load watch list from JSON file into local cache."""
    global _cache, _is_initialized
    with _lock:
        if not DB_PATH.parent.exists():
            os.makedirs(DB_PATH.parent, exist_ok=True)

        if DB_PATH.exists():
            try:
                with open(DB_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        _cache = data
                    else:
                        logger.warning(_LOG_SECTION, "Invalid JSON structure. Resetting cache.")
                        _cache = []
            except Exception as e:
                logger.error(_LOG_SECTION, f"Failed to read watch list JSON: {e}")
                _cache = []
        else:
            _cache = []
            _save_to_json()

        _is_initialized = True
        logger.info(_LOG_SECTION, f"WatchList initialized with {len(_cache)} items.")


def getWatchList() -> list[str]:
    """Return all _cache items by order.

    Throws RuntimeError if init() was not called first.
    """
    _check_initialized()
    with _lock:
        return list(_cache)


def setWatchList(symbol: str, order: int = 0):
    """Add or re-order a symbol into _cache."""
    _check_initialized()
    _task_queue.put(("SET", symbol, order))
    _ensure_worker_running()


def removeWatchList(symbol: str):
    """Remove a symbol from _cache. Throws ValueError if symbol not found."""
    _check_initialized()
    _task_queue.put(("REMOVE", symbol, None))
    _ensure_worker_running()


# Internal Helper Functions

def _check_initialized():
    if not _is_initialized:
        logger.error(_LOG_SECTION, "Attempted to access watchList before init()")
        raise RuntimeError("watchList is not initialized. Please call init() first.")


def _save_to_json():
    """Flush memory cache to file system."""
    try:
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(_cache, f, indent=4)
        logger.debug(_LOG_SECTION, "Saved watch list to file.")
    except Exception as e:
        logger.error(_LOG_SECTION, f"Failed to save watch list to file: {e}")


def _process_queue():
    """Worker thread loop to process mutations and save when empty."""
    global _worker_thread

    while True:
        try:
            action, symbol, order = _task_queue.get(timeout=0.1)
        except queue.Empty:
            with _lock:
                if _task_queue.empty():
                    _worker_thread = None
                    break
            continue

        with _lock:
            if action == "SET":
                # Bounds clamping
                if order < 0:
                    order = 0
                elif order > len(_cache):
                    order = len(_cache)

                if symbol in _cache:
                    _cache.remove(symbol)

                _cache.insert(order, symbol)
                logger.debug(_LOG_SECTION, f"Set symbol '{symbol}' at position {order}.")

            elif action == "REMOVE":
                if symbol in _cache:
                    _cache.remove(symbol)
                    logger.debug(_LOG_SECTION, f"Removed symbol '{symbol}'.")
                else:
                    logger.error(_LOG_SECTION, f"Cannot remove '{symbol}': symbol not found in cache.")

        _task_queue.task_done()

        # Save state when all current queue items are processed
        if _task_queue.empty():
            with _lock:
                _save_to_json()


def _ensure_worker_running():
    """Spawns background task execution thread if non-existent."""
    global _worker_thread
    with _lock:
        if _worker_thread is None or not _worker_thread.is_alive():
            _worker_thread = threading.Thread(target=_process_queue, daemon=True)
            _worker_thread.start()