import os
import time
import queue
import threading
import numpy as np

import config
import _logger
from ohlcStorer import _coldStorer
from ohlcStorer._utils import get_directory

# Global Cache
# cache[symbol][timeframe] = { openTimestamp, data, head, lock, write_queue }
cache = {}

_manager_alive = False
_manager_thread = None
_global_lock = threading.Lock()


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def _start(symbol: str, timeframe: str) -> None:
    """Loads the hot numpy array from first.bin into the cache."""
    directory = get_directory(symbol, timeframe)
    filepath = directory / "first.bin"
    
    limit = config.OHLC_STORER_HOT_PREVENTION_LIMIT
    data = np.zeros((limit, 6), dtype=np.int64)
    head = None
    
    if filepath.exists():
        try:
            # Load raw binary data and reshape it
            loaded_data = np.fromfile(str(filepath), dtype=np.int64).reshape(-1, 6)
            loaded_len = loaded_data.shape[0]
            
            if loaded_len > 0:
                # Place data at the end (filling right to left)
                head = limit - loaded_len
                data[head:] = loaded_data
        except Exception as e:
            _logger.error("ohlcStorer", f"Failed to load first.bin for {symbol} {timeframe}: {e}")

    with _global_lock:
        if symbol not in cache:
            cache[symbol] = {}
            
        cache[symbol][timeframe] = {
            "openTimestamp": int(time.time() * 1000),
            "data": data,
            "head": head,
            "lock": 0,
            "write_queue": queue.Queue()
        }


def _end(symbol: str, timeframe: str) -> None:
    """Saves valid hot data to first.bin and releases RAM."""
    with _global_lock:
        c = cache.get(symbol, {}).get(timeframe)
        if not c:
            return
        
        # Wait for any active operations to finish
        while c['lock'] != 0:
            time.sleep(0.1)
            
        c['lock'] = 2  # Block all read/write
        
        directory = get_directory(symbol, timeframe)
        filepath = directory / "first.bin"
        
        if c['head'] is not None:
            valid_data = c['data'][c['head']:]
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
    with _global_lock:
        if symbol not in cache or timeframe not in cache.get(symbol, {}):
            _start(symbol, timeframe)
            
    c = cache[symbol][timeframe]
    c['openTimestamp'] = int(time.time() * 1000)
    return c


def _checkCapacity(symbol: str, timeframe: str) -> None:
    """Checks if the array is full. If so, flushes the oldest data to cold storage."""
    c = cache.get(symbol, {}).get(timeframe)
    if not c or c['head'] is None:
        return
        
    limit = config.OHLC_STORER_HOT_LIMIT
    prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT
    
    if (prevention - c['head'] >= limit):
        def _flush_thread():
            # Flush the oldest <limit> bars (which are at the tail of the array)
            cold_data = c['data'][-limit:].copy()
            _coldStorer.write(symbol, timeframe, cold_data)
            
            while c['lock'] != 0:
                time.sleep(0.5)
            c['lock'] = 2
            
            # Shift the remaining active data to the end of the array to free up space at head
            remaining_count = (prevention - c['head']) - limit
            if remaining_count > 0:
                new_head = prevention - remaining_count
                c['data'][new_head:] = c['data'][c['head'] : -limit]
                c['head'] = new_head
            else:
                c['head'] = None
                
            c['lock'] = 0

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
            now_ms = int(time.time() * 1000)
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
        
    if c['head'] is None:
        return []
    return c['data'][c['head']].copy()


def getLast(symbol: str, timeframe: str) -> np.ndarray | list:
    """Returns the single newest active candle row."""
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2:
        time.sleep(0.1)
        
    if c['head'] is None:
        return []
    return c['data'][-1].copy()


def getRange(symbol: str, timeframe: str, fromTs: int, toTs: int) -> np.ndarray | list:
    """Returns an array of candles within the specified timeframe."""
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2:
        time.sleep(0.1)
        
    if c['head'] is None:
        return []
        
    valid_data = c['data'][c['head']:]
    timestamps = valid_data[:, 0]
    
    mask = (timestamps >= fromTs) & (timestamps < toTs)
    result = valid_data[mask]
    
    if result.shape[0] == 0:
        return []
    return result.copy()


def prepend(symbol: str, timeframe: str, data: np.ndarray) -> None:
    """Appends new data to the head (right to left) utilizing a FIFO queue system."""
    c = _refresh(symbol, timeframe)
    
    # Enqueue data to guarantee writers are processed First-Come-First-Served
    c['write_queue'].put(data)
    
    def _writer_thread():
        # Pop the next payload from the queue
        write_data = c['write_queue'].get()
        num_new = write_data.shape[0]
        
        while c['lock'] != 0:
            time.sleep(0.1)
            
        c['lock'] = 1
        
        try:
            prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT
            
            # Wait for flush if we overflow (edge case defense)
            while c['head'] is not None and (c['head'] - num_new < 0):
                c['lock'] = 0
                time.sleep(0.5) 
                c['lock'] = 1

            if c['head'] is None:
                c['head'] = prevention - num_new
                c['data'][c['head']:] = write_data
            else:
                new_head = c['head'] - num_new
                c['data'][new_head : c['head']] = write_data
                c['head'] = new_head
                
        finally:
            c['lock'] = 0
            c['write_queue'].task_done()
            _checkCapacity(symbol, timeframe)
            
    threading.Thread(target=_writer_thread, daemon=True).start()