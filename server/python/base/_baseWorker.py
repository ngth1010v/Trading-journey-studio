from datetime import datetime, timezone
import threading
import numpy as np

import _logger as logger
import config
import ohlcStorer
import symbols
from tqdm import tqdm

from . import _collector
from . import _stager

_SECTION = "base/_baseWorker.py"


# ==============================================================================
# Helper Functions
# ==============================================================================
def _floor_sec(ts_ms: int) -> int:
    return (int(ts_ms) // 1000) * 1000


def _now_utc_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _symbol_point(symbol: str) -> int:
    try:
        point = symbols._reader.getSymbol(symbol).point
        return int(point)
    except Exception as exc:
        logger.error(_SECTION, f"Failed to read digits/point for {symbol!r}: {exc}")
        return 1


# ==============================================================================
# Core Workflow
# ==============================================================================
def _build_ohlc_from_ticks(start_batch_ts: int, batch_size: int, batch_ticks) -> np.ndarray:
    """
    Builds an OHLC NumPy array of shape (batch_size, 6) from a sequential list of ticks.
    Each row matches the structure: [t, o, h, l, c, v]
    """
    ohlc_matrix = np.zeros((batch_size, 6), dtype=np.int64)
    j = 0
    tick_count = len(batch_ticks)

    for i in range(batch_size):
        bar_t = start_batch_ts + i * 1000
        ohlc_matrix[i, 0] = bar_t
        have_tick = False

        while j < tick_count and bar_t <= batch_ticks[j].t < bar_t + 1000:
            tick = batch_ticks[j]
            if not have_tick:
                ohlc_matrix[i, 1] = tick.b  # Open
                ohlc_matrix[i, 2] = tick.b  # High
                ohlc_matrix[i, 3] = tick.b  # Low
                ohlc_matrix[i, 4] = tick.b  # Close
                ohlc_matrix[i, 5] = tick.v  # Volume
                have_tick = True
            else:
                if tick.b > ohlc_matrix[i, 2]: ohlc_matrix[i, 2] = tick.b
                if tick.b < ohlc_matrix[i, 3]: ohlc_matrix[i, 3] = tick.b
                ohlc_matrix[i, 4] = tick.b
                ohlc_matrix[i, 5] += tick.v
            j += 1

    return ohlc_matrix

def triggerNextTimeframe(symbol: str):
    stageFromTs = _stager.getFrom("1S", symbol)
    stageToTs = _stager.getTo("1S", symbol)
    _stager.putQueue("1M", {
        "symbol": symbol,
        "timestamp": stageFromTs
    })
    _stager.putQueue("1M", {
        "symbol": symbol,
        "timestamp": stageToTs
    })


def extendBack(symbol: str, fromTs: int) -> None:
    point = _symbol_point(symbol)
    startTs = _floor_sec(fromTs)
    endTs = _stager.getFrom("1S", symbol)

    if endTs == 0:
        endTs = _floor_sec(_now_utc_ms())
        _stager.setTo("1S", symbol, endTs)

    endTs = _floor_sec(endTs)

    total = max(0, (endTs - startTs) // (config.OHLC_BATCH * 1000) + 1)
    pbar = tqdm(total=total, desc=f"{symbol} Back", unit="batch")

    currentTs = endTs

    while startTs <= currentTs:
        # Prepare
        startBatchTs = currentTs - config.OHLC_BATCH * 1000
        endBatchTs = currentTs

        # Get ticks
        batchTick = _collector.fetchTicksFromMt5(symbol, point, startBatchTs, endBatchTs)

        # Build ohlc matrix via NumPy
        batchOhlcs = _build_ohlc_from_ticks(startBatchTs, config.OHLC_BATCH, batchTick)

        # Write
        if batchOhlcs.size > 0:
            ohlcStorer.prepend(symbol, "1S", batchOhlcs)

        _stager.setFrom("1S", symbol, startBatchTs)
        triggerNextTimeframe(symbol)

        pbar.update(1)

        # Next loop
        currentTs = startBatchTs

    pbar.close()


def extendFront(symbol: str) -> None:
    point = _symbol_point(symbol)
    startTs = _stager.getTo("1S", symbol)
    endTs = _floor_sec(_now_utc_ms())

    if startTs == 0:
        extendBack(symbol, endTs - config.OHLC_1S_BASE_DEFAULT_TIME)
        return

    startTs = _floor_sec(startTs)

    total = max(0, (endTs - startTs + config.OHLC_BATCH * 1000 - 1) // (config.OHLC_BATCH * 1000))
    pbar = tqdm(total=total, desc=f"{symbol} Front", unit="batch")

    currentTs = startTs

    while currentTs < endTs:
        # Prepare
        startBatchTs = currentTs
        endBatchTs = min(endTs, currentTs + config.OHLC_BATCH * 1000)
        ohlcBatchSize = (endBatchTs - startBatchTs) // 1000

        if ohlcBatchSize <= 0:
            break

        # Get ticks
        batchTick = _collector.fetchTicksFromMt5(symbol, point, startBatchTs, endBatchTs)

        # Build ohlc matrix via NumPy
        batchOhlcs = _build_ohlc_from_ticks(startBatchTs, ohlcBatchSize, batchTick)

        # Write
        if batchOhlcs.size > 0:
            ohlcStorer.append(symbol, "1S", batchOhlcs)

        _stager.setTo("1S", symbol, endBatchTs)
        triggerNextTimeframe(symbol)

        pbar.update(1)

        # Next loop
        currentTs = endBatchTs

    pbar.close()


def worker() -> None:
    while True:
        task = _stager.getQueue("1S")
        
        cmd = task.get("cmd")
        if cmd == "SHUTDOWN":
            return

        symbol = task.get("symbol")
        if not symbol:
            logger.error(_SECTION, "BUG: Worker received task with no symbol. Exiting thread.")
            return

        stageFromTs = _stager.getFrom("1S", symbol)
        stageToTs = _stager.getTo("1S", symbol)
        emptyDatabase = (stageFromTs == 0)

        timestamp = task.get("timestamp")

        if not timestamp:
            if emptyDatabase:
                extendFront(symbol)
        else:
            if emptyDatabase:
                extendBack(symbol, timestamp)
            elif stageFromTs <= timestamp <= stageToTs:
                continue
            elif timestamp < stageFromTs:
                extendBack(symbol, timestamp)
            else:
                extendFront(symbol)


# ==============================================================================
# Initialization
# ==============================================================================
def init() -> None:
    """
    Initializes the collector, sets the initial ranges for all available symbols
    in the stager, and starts a single global worker thread to process tasks.
    """
    _collector.init()
    
    # Retrieve available symbols; handles explicit structure from ohlcStorer
    symbols_list = ohlcStorer.getAvailableSymbols()
        
    for symbol in symbols_list:

        first_ohlc = ohlcStorer.getFirst(symbol, "1S")
        if first_ohlc.size > 0:
            _stager.setFrom("1S", symbol, int(first_ohlc[0, 0]))
        else:
            _stager.setFrom("1S", symbol, 0)
        
        last_ohlc = ohlcStorer.getLast(symbol, "1S")
        if last_ohlc.size > 0:
            _stager.setTo("1S", symbol, int(last_ohlc[0, 0]) + 1000)
        else:
            _stager.setTo("1S", symbol, 0)

    # Launching the single, independent worker thread
    t = threading.Thread(target=worker, daemon=True, name="BaseWorker-1S")
    t.start()
    logger.info(_SECTION, "Global base worker thread started.")