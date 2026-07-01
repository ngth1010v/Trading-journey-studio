import os
import time
import threading
import numpy as np

import config
import _logger
from . import _coldStorer
from ._utils import get_directory

# Global Cache
# cache[symbol][timeframe] = { openTimestamp, data, head, tail, count, lock, flushing }
cache = {}

_manager_alive = False
_manager_thread = None
_global_lock = threading.Lock()


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def _start(symbol: str, timeframe: str) -> None:
    """Loads the hot numpy array from last.bin into the cache using Ring Buffer state."""
    directory = get_directory(symbol, timeframe)
    filepath = directory / "last.bin"
    
    prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT
    data = np.zeros((prevention, 6), dtype=np.float64)
    head = 0
    tail = 0
    count = 0
    
    if filepath.exists():
        try:
            loaded_data = np.fromfile(str(filepath), dtype=np.float64).reshape(-1, 6)
            loaded_len = loaded_data.shape[0]
            
            if loaded_len > 0:
                count = min(loaded_len, prevention)
                valid_loaded = loaded_data[-count:] # Keep only the newest if overflow
                data[:count] = valid_loaded
                tail = count % prevention
        except Exception as e:
            _logger.error("ohlcStorer/_hotLast", f"Failed to load last.bin for {symbol} {timeframe}: {e}")

    with _global_lock:
        if symbol not in cache:
            cache[symbol] = {}
            
        cache[symbol][timeframe] = {
            "openTimestamp": float(time.time() * 1000),
            "data": data,
            "head": head,   # Start of valid data (oldest)
            "tail": tail,   # Next write position (newest)
            "count": count, # Total valid rows
            "lock": 0,
            "flushing": False
        }


def _end(symbol: str, timeframe: str) -> None:
    """Saves valid hot data chronologically to last.bin and releases RAM."""
    with _global_lock:
        c = cache.get(symbol, {}).get(timeframe)
        if not c:
            return
        
        # Wait for any active ops and background flushes to completely finish
        while c['lock'] != 0 or c['flushing']:
            time.sleep(0.01)
            
        c['lock'] = 2  # Block all read/write
        
        directory = get_directory(symbol, timeframe)
        filepath = directory / "last.bin"
        
        if c['count'] > 0:
            prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT
            if c['head'] < c['tail']:
                valid_data = c['data'][c['head']:c['tail']]
            else:
                valid_data = np.concatenate((c['data'][c['head']:prevention], c['data'][:c['tail']]), axis=0)
            valid_data.tofile(str(filepath))
        else:
            if filepath.exists():
                filepath.unlink()
                
        del cache[symbol][timeframe]
        if not cache[symbol]:
            del cache[symbol]


def _refresh(symbol: str, timeframe: str) -> dict:
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
    """Spawns background flush if there is at least HOT_LIMIT amount of data waiting."""
    c = cache.get(symbol, {}).get(timeframe)
    if not c:
        return
        
    limit = config.OHLC_STORER_HOT_LIMIT
    
    if c['count'] >= limit and not c["flushing"]:
        c["flushing"] = True
        
        def _flush_thread():
            try:
                prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT
                while True:
                    # Sync check state safely
                    while c.get('lock', 2) != 0: 
                        if c.get('lock') == 2: return # cache shutting down
                        time.sleep(0.005)
                        
                    c['lock'] = 1
                    if c['count'] < limit:
                        c['lock'] = 0
                        break
                        
                    current_head = c['head']
                    # Since limit divides prevention cleanly, no memory wrap-around during a single block read!
                    cold_data = c['data'][current_head : current_head + limit].copy()
                    c['lock'] = 0
                    
                    # Heavy I/O outside lock
                    _coldStorer.write(symbol, timeframe, cold_data)

                    # Shift pointer forward
                    while c.get('lock', 2) != 0: time.sleep(0.005)
                    c['lock'] = 1
                    c['head'] = (c['head'] + limit) % prevention
                    c['count'] -= limit
                    c['lock'] = 0
            finally:
                c["flushing"] = False

        threading.Thread(target=_flush_thread, daemon=True).start()


# ==============================================================================
# PUBLIC API
# ==============================================================================

def init() -> None:
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
    global _manager_alive
    _manager_alive = False
    if _manager_thread: _manager_thread.join(timeout=2.0)
        
    targets = []
    with _global_lock:
        for sym in list(cache.keys()):
            for tf in list(cache[sym].keys()):
                targets.append((sym, tf))
    for sym, tf in targets:
        _end(sym, tf)


def getFirst(symbol: str, timeframe: str) -> np.ndarray | list:
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2: time.sleep(0.01)
    if c['count'] == 0: return []
    return c['data'][c['head']].copy()


def getLast(symbol: str, timeframe: str) -> np.ndarray | list:
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2: time.sleep(0.01)
    if c['count'] == 0: return []
    
    prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT
    last_idx = (c['tail'] - 1) % prevention
    return c['data'][last_idx].copy()


def getRange(symbol: str, timeframe: str, fromTs: float, toTs: float) -> np.ndarray | list:
    c = _refresh(symbol, timeframe)
    while c['lock'] == 2: time.sleep(0.01)
        
    if c['count'] == 0: return []
    
    prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT
    if c['head'] < c['tail']:
        valid_data = c['data'][c['head']:c['tail']]
    else:
        valid_data = np.concatenate((c['data'][c['head']:prevention], c['data'][:c['tail']]), axis=0)
        
    timestamps = valid_data[:, 0]
    mask = (timestamps >= fromTs) & (timestamps < toTs)
    result = valid_data[mask]
    
    if result.shape[0] == 0: return []
    return result.copy()


def append(symbol: str, timeframe: str, data: np.ndarray) -> None:
    c = _refresh(symbol, timeframe)
    num_new = data.shape[0]
    prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT

    # Wait for space if full
    while True:
        while c.get("lock", 2) != 0: time.sleep(0.001)
        c["lock"] = 1
        
        if prevention - c["count"] >= num_new:
            break
            
        c["lock"] = 0
        time.sleep(0.01) # Backpressure wait

    try:
        tail = c["tail"]
        if tail + num_new <= prevention:
            c["data"][tail : tail + num_new] = data
        else:
            part1 = prevention - tail
            part2 = num_new - part1
            c["data"][tail : prevention] = data[:part1]
            c["data"][0 : part2] = data[part1:]
            
        c["tail"] = (tail + num_new) % prevention
        c["count"] += num_new
    finally:
        c["lock"] = 0

    _checkCapacity(symbol, timeframe)