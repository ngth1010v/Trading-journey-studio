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
    """Loads hot array backwards for prepending."""
    directory = get_directory(symbol, timeframe)
    filepath = directory / "first.bin"
    
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
                valid_loaded = loaded_data[-count:]
                
                # Align to end naturally, so tail = 0
                head = (0 - count) % prevention
                if head + count <= prevention:
                    data[head : head + count] = valid_loaded
                else:
                    part1 = prevention - head
                    part2 = count - part1
                    data[head : prevention] = valid_loaded[:part1]
                    data[0 : part2] = valid_loaded[part1:]
                    
        except Exception as e:
            _logger.error("ohlcStorer/_hotFirst", f"Failed to load first.bin for {symbol} {timeframe}: {e}")

    with _global_lock:
        if symbol not in cache:
            cache[symbol] = {}
            
        cache[symbol][timeframe] = {
            "openTimestamp": float(time.time() * 1000),
            "data": data,
            "head": head,   # Start of prepended data (oldest)
            "tail": tail,   # End bound (newest, connects to Cold)
            "count": count,
            "lock": 0,
            "flushing": False
        }


def _end(symbol: str, timeframe: str) -> None:
    with _global_lock:
        c = cache.get(symbol, {}).get(timeframe)
        if not c:
            return
        
        while c['lock'] != 0 or c['flushing']:
            time.sleep(0.01)
            
        c['lock'] = 2
        
        directory = get_directory(symbol, timeframe)
        filepath = directory / "first.bin"
        
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
    """Spawns background flush for the NEWEST rows (at tail) to send down to Cold."""
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
                    while c.get('lock', 2) != 0:
                        if c.get('lock') == 2: return
                        time.sleep(0.005)
                        
                    c['lock'] = 1
                    if c['count'] < limit:
                        c['lock'] = 0
                        break
                        
                    current_tail = c['tail']
                    flush_start = (current_tail - limit) % prevention
                    
                    # Read block right before tail safely
                    cold_data = c['data'][flush_start : flush_start + limit].copy()
                    c['lock'] = 0
                    
                    _coldStorer.write(symbol, timeframe, cold_data)

                    # Retreat tail backwards
                    while c.get('lock', 2) != 0: time.sleep(0.005)
                    c['lock'] = 1
                    c['tail'] = flush_start
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


def prepend(symbol: str, timeframe: str, data: np.ndarray) -> None:
    c = _refresh(symbol, timeframe)
    num_new = data.shape[0]
    prevention = config.OHLC_STORER_HOT_PREVENTION_LIMIT

    while True:
        while c.get("lock", 2) != 0: time.sleep(0.001)
        c["lock"] = 1
        
        if prevention - c["count"] >= num_new:
            break
            
        c["lock"] = 0
        time.sleep(0.01)

    try:
        head = c["head"]
        new_head = (head - num_new) % prevention
        
        if new_head + num_new <= prevention:
            c["data"][new_head : new_head + num_new] = data
        else:
            part1 = prevention - new_head
            part2 = num_new - part1
            c["data"][new_head : prevention] = data[:part1]
            c["data"][0 : part2] = data[part1:]
            
        c["head"] = new_head
        c["count"] += num_new
    finally:
        c["lock"] = 0

    _checkCapacity(symbol, timeframe)