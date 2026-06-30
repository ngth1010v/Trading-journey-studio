import os
import time
import threading
import numpy as np

import config
import _logger
from . import _coldStorer
from ._utils import get_directory

# Global Cache
# cache[symbol][timeframe] = { openTimestamp, data, tail, lock, write_queue }
cache = {}

_manager_alive = False
_manager_thread = None
_global_lock = threading.Lock()


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def _start(symbol: str, timeframe: str) -> None:
    """Loads the hot numpy array from last.bin into the cache."""
    directory = get_directory(symbol, timeframe)
    filepath = directory / "last.bin"
    
    limit = config.OHLC_STORER_HOT_PREVENTION_LIMIT
    data = np.zeros((limit, 6), dtype=np.float64)
    tail = None
    
    if filepath.exists():
        try:
            # Load raw binary data and reshape it
            loaded_data = np.fromfile(str(filepath), dtype=np.float64).reshape(-1, 6)
            loaded_len = loaded_data.shape[0]
            
            if loaded_len > 0:
                # Place data starting from index 0
                tail = loaded_len
                data[:tail] = loaded_data
        except Exception as e:
            _logger.error("ohlcStorer", f"Failed to load last.bin for {symbol} {timeframe}: {e}")

    with _global_lock:
        if symbol not in cache:
            cache[symbol] = {}
            
        cache[symbol][timeframe] = {
            "openTimestamp": float(time.time() * 1000),
            "data": data,
            "tail": tail,
            "lock": 0,
            "flushing": False
        }


def _end(symbol: str, timeframe: str) -> None:
    """Saves valid hot data to last.bin and releases RAM."""
    with _global_lock:
        c = cache.get(symbol, {}).get(timeframe)
        if not c:
            return
        
        # Wait for any active operations to finish
        while c['lock'] != 0:
            time.sleep(0.1)
            
        c['lock'] = 2  # Block all read/write
        
        directory = get_directory(symbol, timeframe)
        filepath = directory / "last.bin"
        
        if c['tail'] is not None:
            valid_data = c['data'][:c['tail']]
            valid_data.tofile(str(filepath))
        else:
            if filepath.exists():
                filepath.unlink()
                
        # Release RAM
        del cache[symbol][timeframe]
        if not cache[symbol]:
            del cache[symbol]

def _refresh(symbol: str, timeframe: str) -> dict:
    """Ensures cache exists and updates the openTimestamp."""
    need_start = False

    with _global_lock:
        if symbol not in cache or timeframe not in cache.get(symbol, {}):
            need_start = True

    if need_start:
        _start(symbol, timeframe)

    c = cache[symbol][timeframe]
    c["openTimestamp"] = float(time.time() * 1000)
    return c


def _checkCapacity(symbol: str, timeframe: str) -> None:
    """Checks if the array is full. If so, flushes oldest data to cold storage."""
    c = cache.get(symbol, {}).get(timeframe)
    if not c or c['tail'] is None:
        return
    if c["flushing"]:
        return
        
    limit = config.OHLC_STORER_HOT_LIMIT
    
    if (c['tail'] >= limit):
        c["flushing"] = True
        def _flush_thread():
            try:
                # Flush the oldest <limit> bars (which are at the front of the array)
                cold_data = c['data'][:limit].copy()
                _coldStorer.write(symbol, timeframe, cold_data)

                while c['lock'] != 0:
                    time.sleep(0.5)
                c['lock'] = 2

                # Shift the remaining forward to index 0
                remaining_count = c['tail'] - limit
                if remaining_count > 0:
                    c['data'][:remaining_count] = c['data'][limit:c['tail']]
                    c['tail'] = remaining_count
                else:
                    c['tail'] = None

                c['lock'] = 0

            finally:
                c["flushing"] = False

        threading.Thread(target=_flush_thread, daemon=True).start()


# ==============================================================================
# PUBLIC API
# ==============================================================================

def init() -> None:
    """Starts the independent cache management thread."""
    global _manager_alive, _manager_thread
    _manager_alive = True
    
    def _manager():
        while _manager_alive:
            now_ms = float(time.time() * 1000)
            targets_to_end = []
            
            with _global_lock:
                for sym in list(cache.keys()):
                    for tf in list(cache[sym].keys()):
                        c = cache[sym][tf]
                        if now_ms - c['openTimestamp'] > config.OHLC_STORER_HOT_WAIT_DURATION:
                            targets_to_end.append((sym, tf))
                            
            for sym, tf in targets_to_end:
                _end(sym, tf)
                
            time.sleep(1)
            
    _manager_thread = threading.Thread(target=_manager, daemon=True)
    _manager_thread.start()


def shutdown() -> None:
    """Stops the cache manager and flushes all active caches to disk."""
    global _manager_alive
    _manager_alive = False
    
    if _manager_thread:
        _manager_thread.join(timeout=2.0)
        
    targets = []
    with _global_lock:
        for sym in list(cache.keys()):
            for tf in list(cache[sym].keys()):
                targets.append((sym, tf))
                
    for sym, tf in targets:
        _end(sym, tf)


def getFirst(symbol: str, timeframe: str) -> np.ndarray | list:
    """Returns the single oldest active candle row."""
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2:
        time.sleep(0.1)
        
    if c['tail'] is None:
        return []
    return c['data'][0].copy()


def getLast(symbol: str, timeframe: str) -> np.ndarray | list:
    """Returns the single newest active candle row."""
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2:
        time.sleep(0.1)
        
    if c['tail'] is None:
        return []
    return c['data'][c['tail'] - 1].copy()


def getRange(symbol: str, timeframe: str, fromTs: float, toTs: float) -> np.ndarray | list:
    """Returns an array of candles within the specified timeframe."""
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2:
        time.sleep(0.1)
        
    if c['tail'] is None:
        return []
        
    valid_data = c['data'][:c['tail']]
    timestamps = valid_data[:, 0]
    
    mask = (timestamps >= fromTs) & (timestamps < toTs)
    result = valid_data[mask]
    
    if result.shape[0] == 0:
        return []
    return result.copy()


def append(symbol: str, timeframe: str, data: np.ndarray) -> None:
    """Synchronously appends new data to the tail."""
    c = _refresh(symbol, timeframe)

    num_new = data.shape[0]

    while c["lock"] != 0:
        time.sleep(0.1)

    c["lock"] = 1

    try:
        prevention_limit = config.OHLC_STORER_HOT_PREVENTION_LIMIT

        while True:
            current_tail = 0 if c["tail"] is None else c["tail"]

            if current_tail + num_new <= prevention_limit:
                break

            c["lock"] = 0
            time.sleep(0.5)

            while c["lock"] != 0:
                time.sleep(0.1)

            c["lock"] = 1

        if c["tail"] is None:
            c["data"][:num_new] = data
            c["tail"] = num_new
        else:
            c["data"][c["tail"]:c["tail"] + num_new] = data
            c["tail"] += num_new

    finally:
        c["lock"] = 0

    _checkCapacity(symbol, timeframe)