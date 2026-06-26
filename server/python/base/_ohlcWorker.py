from __future__ import annotations

import threading
import _logger as logger
import config

from base import _stager
from _type import Ohlc
import ohlcStorer._reader as _reader
import ohlcStorer._writer as _writer

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
        
        # Get src
        batchSrc = _reader.getOhlcs(symbol, srcTimeframe, startBatchTs, endBatchTs) or []
        
        # Build ohlc
        batchOhlcs = []
        j = 0
        for i in range(ohlcBatchSize):
            bar_t = startBatchTs + i * timeframeStep
            bar = Ohlc(t=bar_t, o=0, h=0, l=0, c=0, v=0)
            haveSrc = False
            
            while j < len(batchSrc) and bar.t <= batchSrc[j].t < bar.t + timeframeStep:
                srcBar = batchSrc[j]
                if not haveSrc:
                    bar.o = srcBar.o
                    bar.h = srcBar.h
                    bar.l = srcBar.l
                    bar.c = srcBar.c
                    bar.v = srcBar.v
                    haveSrc = True
                else:
                    bar.h = max(bar.h, srcBar.h)
                    bar.l = min(bar.l, srcBar.l)
                    bar.c = srcBar.c
                    bar.v += srcBar.v
                j += 1
                
            if haveSrc:
                batchOhlcs.append(bar)

        # Write
        if batchOhlcs:
            _writer.prependOhlcs(symbol, timeframe, batchOhlcs)
            
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
        
        # Get src
        batchSrc = _reader.getOhlcs(symbol, srcTimeframe, startBatchTs, endBatchTs) or []
        
        # Build ohlc
        batchOhlcs = []
        j = 0
        for i in range(ohlcBatchSize):
            bar_t = startBatchTs + i * timeframeStep
            bar = Ohlc(t=bar_t, o=0, h=0, l=0, c=0, v=0)
            haveSrc = False
            
            while j < len(batchSrc) and bar.t <= batchSrc[j].t < bar.t + timeframeStep:
                srcBar = batchSrc[j]
                if not haveSrc:
                    bar.o = srcBar.o
                    bar.h = srcBar.h
                    bar.l = srcBar.l
                    bar.c = srcBar.c
                    bar.v = srcBar.v
                    haveSrc = True
                else:
                    bar.h = max(bar.h, srcBar.h)
                    bar.l = min(bar.l, srcBar.l)
                    bar.c = srcBar.c
                    bar.v += srcBar.v
                j += 1
                
            if haveSrc:
                batchOhlcs.append(bar)

        # Write
        if batchOhlcs:
            _writer.appendOhlcs(symbol, timeframe, batchOhlcs)
            
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

    symbols = _reader.getAvailableSymbols()
    for symbol in symbols:
        first_ohlc = _reader.getFirstOhlc(symbol, timeframe)
        last_ohlc = _reader.getLastOhlc(symbol, timeframe)

        first_t = first_ohlc.t if first_ohlc else 0
        last_t = (last_ohlc.t + TIMEFRAME_MAP[timeframe]) if last_ohlc else 0

        _stager.setFrom(timeframe, symbol, first_t)
        _stager.setTo(timeframe, symbol, last_t)

    # Start the worker thread natively
    worker_thread = threading.Thread(target=_worker, args=(timeframe,), daemon=True, name=f"OhlcWorker-{timeframe}")
    worker_thread.start()