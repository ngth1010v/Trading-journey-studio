from __future__ import annotations

import threading
import numpy as np
import _logger as logger
import config

from base import _stager
import ohlcStorer

# ============================================================================================================
# CONSTANTS & HELPERS
# ============================================================================================================

_SECTION = "_ohlcWorker.py"

TIMEFRAME_MAP = {
    "1S": 1_000,
    "1M": 1_000 * 60,
    "1H": 1_000 * 60 * 60,
    "1D": 1_000 * 60 * 60 * 24,
}

_TIMEFRAME_LIST = ["1S", "1M", "1H", "1D"]
_VALID_INIT_TIMEFRAMES = ["1M", "1H", "1D"]


def _get_src_timeframe(target_timeframe: str) -> str:
    idx = _TIMEFRAME_LIST.index(target_timeframe)
    if idx <= 0:
        raise ValueError(f"No source timeframe available for {target_timeframe}")
    return _TIMEFRAME_LIST[idx - 1]


def _get_next_timeframe(target_timeframe: str) -> str:
    idx = _TIMEFRAME_LIST.index(target_timeframe)
    if idx >= len(_TIMEFRAME_LIST) - 1:
        raise ValueError(f"No next timeframe available for {target_timeframe}")
    return _TIMEFRAME_LIST[idx + 1]


def _timestamp_floor(timestamp: int, timeframe: str) -> int:
    step = TIMEFRAME_MAP[timeframe]
    return (timestamp // step) * step


def _timestamp_ceil(timestamp: int, timeframe: str) -> int:
    step = TIMEFRAME_MAP[timeframe]
    return ((timestamp + step - 1) // step) * step


# ============================================================================================================
# CORE WORKFLOW logic
# ============================================================================================================
def _build_ohlc_from_ohlc(start_batch_ts: int, batch_size: int, timeframe_step: int, batch_src: np.ndarray) -> np.ndarray:
    """
    Downsamples a higher-resolution source OHLC NumPy array into a lower-resolution target OHLC matrix.
    Skips bars that contain no source metrics to save storage allocation space.
    """
    temp_list = []
    j = 0
    src_count = batch_src.shape[0]

    for i in range(batch_size):
        bar_t = start_batch_ts + i * timeframe_step
        have_src = False
        
        # Temporary tracker fields: [t, o, h, l, c, v]
        bar = [bar_t, 0, 0, 0, 0, 0]

        while j < src_count and bar_t <= batch_src[j, 0] < bar_t + timeframe_step:
            t, o, h, l, c, v = batch_src[j]
            if not have_src:
                bar[1] = o  # Open
                bar[2] = h  # High
                bar[3] = l  # Low
                bar[4] = c  # Close
                bar[5] = v  # Volume
                have_src = True
            else:
                if h > bar[2]: bar[2] = h
                if l < bar[3]: bar[3] = l
                bar[4] = c
                bar[5] += v
            j += 1

        if have_src:
            temp_list.append(bar)

    if not temp_list:
        return np.empty((0, 6), dtype=np.int64)
        
    return np.array(temp_list, dtype=np.int64)

def triggerNextTimeframe(symbol: str, timeframe: str):
    # Refresh stage boundaries
    stageFromTs = _stager.getFrom(timeframe, symbol)
    stageToTs = _stager.getTo(timeframe, symbol)
        
    # Avoid next-timeframe propagation if at the 1D limit boundary
    if timeframe != "1D":
        nextTimeframe = _get_next_timeframe(timeframe)
        _stager.putQueue(nextTimeframe, {
            "symbol": symbol,
            "timestamp": stageFromTs
        })
        _stager.putQueue(nextTimeframe, {
            "symbol": symbol,
            "timestamp": stageToTs
        })


def extendBack(symbol: str, timeframe: str) -> None:
    srcTimeframe = _get_src_timeframe(timeframe)
    timeframeStep = TIMEFRAME_MAP[timeframe]

    startTs = _stager.getFrom(srcTimeframe, symbol)
    endTs = _stager.getFrom(timeframe, symbol)
    
    if startTs == 0:
        logger.error(_SECTION, f"extendBack bug: source startTs is 0 for {symbol}/{srcTimeframe}")
        return
        
    if endTs == 0:
        endTs = _timestamp_floor(_stager.getTo(srcTimeframe, symbol), timeframe)
        _stager.setTo(timeframe, symbol, endTs)
        
    startTs = _timestamp_ceil(startTs, timeframe)
    endTs = _timestamp_floor(endTs, timeframe)
    
    if endTs - startTs < timeframeStep:
        return

    currentTs = endTs
    while startTs < currentTs:
        # Prepare
        startBatchTs = max(startTs, currentTs - config.OHLC_BATCH * timeframeStep)
        endBatchTs = currentTs
        ohlcBatchSize = (endBatchTs - startBatchTs) // timeframeStep
        
        # Get src matrix
        batchSrc = ohlcStorer.getRange(symbol, srcTimeframe, startBatchTs, endBatchTs)
        
        # Build lower resolution matrix via NumPy
        batchOhlcs = _build_ohlc_from_ohlc(startBatchTs, ohlcBatchSize, timeframeStep, batchSrc)

        # Write
        if batchOhlcs.size > 0:
            ohlcStorer.prepend(symbol, timeframe, batchOhlcs)
            
        _stager.setFrom(timeframe, symbol, startBatchTs)
        triggerNextTimeframe(symbol, timeframe)

        # Next loop
        currentTs = startBatchTs


def extendFront(symbol: str, timeframe: str) -> None:
    srcTimeframe = _get_src_timeframe(timeframe)
    timeframeStep = TIMEFRAME_MAP[timeframe]

    startTs = _stager.getTo(timeframe, symbol)
    endTs = _stager.getTo(srcTimeframe, symbol)
    
    if endTs == 0:
        logger.error(_SECTION, f"extendFront bug: source endTs is 0 for {symbol}/{srcTimeframe}")
        return
        
    if startTs == 0:
        extendBack(symbol, timeframe)
        return
        
    endTs = _timestamp_floor(endTs, timeframe)
    
    if endTs - startTs < timeframeStep:
        return

    currentTs = startTs
    while currentTs < endTs:
        # Prepare
        startBatchTs = currentTs
        endBatchTs = min(endTs, currentTs + config.OHLC_BATCH * timeframeStep)
        ohlcBatchSize = (endBatchTs - startBatchTs) // timeframeStep
        
        # Get src matrix
        batchSrc = ohlcStorer.getRange(symbol, srcTimeframe, startBatchTs, endBatchTs)
        
        # Build lower resolution matrix via NumPy
        batchOhlcs = _build_ohlc_from_ohlc(startBatchTs, ohlcBatchSize, timeframeStep, batchSrc)

        # Write
        if batchOhlcs.size > 0:
            ohlcStorer.append(symbol, timeframe, batchOhlcs)
            
        _stager.setTo(timeframe, symbol, endBatchTs)
        triggerNextTimeframe(symbol, timeframe)

        # Next loop
        currentTs = endBatchTs


# ============================================================================================================
# WORKER THREAD
# ============================================================================================================

def _worker(timeframe: str) -> None:
    while True:
        task = _stager.getQueue(timeframe)
        if task.get("cmd") == "SHUTDOWN":
            return

        symbol = task.get("symbol")
        if not symbol:
            logger.error(_SECTION, f"Worker bug: Missing symbol in task for {timeframe}")
            continue

        stageFromTs = _stager.getFrom(timeframe, symbol)
        stageToTs = _stager.getTo(timeframe, symbol)
        emptyDatabase = (stageFromTs == 0)

        timestamp = task.get("timestamp")
        
        if not timestamp:
            if emptyDatabase:
                extendFront(symbol, timeframe)
        else:
            if emptyDatabase:
                extendBack(symbol, timeframe)
            elif stageFromTs <= timestamp <= stageToTs:
                pass  # Do nothing, but allow downstream propagation
            elif timestamp < stageFromTs:
                extendBack(symbol, timeframe)
            else:
                extendFront(symbol, timeframe)


# ============================================================================================================
# PUBLIC INIT API
# ============================================================================================================

def init(timeframe: str) -> None:
    if timeframe not in _VALID_INIT_TIMEFRAMES:
        logger.error(_SECTION, f"Invalid timeframe for init: {timeframe}. Must be one of {_VALID_INIT_TIMEFRAMES}")
        return

    symbols_list = ohlcStorer.getAvailableSymbols()
    for symbol in symbols_list:
        first_ohlc = ohlcStorer.getFirst(symbol, timeframe)
        last_ohlc = ohlcStorer.getLast(symbol, timeframe)

        first_t = int(first_ohlc[0, 0]) if first_ohlc.size > 0 else 0
        last_t = (int(last_ohlc[0, 0]) + TIMEFRAME_MAP[timeframe]) if last_ohlc.size > 0 else 0

        _stager.setFrom(timeframe, symbol, first_t)
        _stager.setTo(timeframe, symbol, last_t)

    # Start the worker thread natively
    worker_thread = threading.Thread(target=_worker, args=(timeframe,), daemon=True, name=f"OhlcWorker-{timeframe}")
    worker_thread.start()