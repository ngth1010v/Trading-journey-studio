from datetime import datetime, timezone
import threading

import _logger as logger
import config
import ohlcStorer
import symbols
from tqdm import tqdm

from . import _collector
from . import _stager
from _type import Ohlc

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

from tqdm import tqdm


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

        # Build ohlc
        batchOhlcs = []
        j = 0
        tick_count = len(batchTick)

        for i in range(config.OHLC_BATCH):
            bar_t = startBatchTs + i * 1000
            bar = Ohlc(t=bar_t, o=0, h=0, l=0, c=0, v=0)
            haveTick = False

            while j < tick_count and bar_t <= batchTick[j].t < bar_t + 1000:
                tick = batchTick[j]
                if not haveTick:
                    bar.o = tick.b
                    bar.h = tick.b
                    bar.l = tick.b
                    bar.c = tick.b
                    bar.v = tick.v
                    haveTick = True
                else:
                    if tick.b > bar.h: bar.h = tick.b
                    if tick.b < bar.l: bar.l = tick.b
                    bar.c = tick.b
                    bar.v += tick.v
                j += 1

            batchOhlcs.append(bar)

        # Write
        if batchOhlcs:
            ohlcStorer.prependOhlcs(symbol, "1S", batchOhlcs)

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

        # Build ohlc
        batchOhlcs = []
        j = 0
        tick_count = len(batchTick)

        for i in range(ohlcBatchSize):
            bar_t = startBatchTs + i * 1000
            bar = Ohlc(t=bar_t, o=0, h=0, l=0, c=0, v=0)
            haveTick = False

            while j < tick_count and bar_t <= batchTick[j].t < bar_t + 1000:
                tick = batchTick[j]
                if not haveTick:
                    bar.o = tick.b
                    bar.h = tick.b
                    bar.l = tick.b
                    bar.c = tick.b
                    bar.v = tick.v
                    haveTick = True
                else:
                    if tick.b > bar.h: bar.h = tick.b
                    if tick.b < bar.l: bar.l = tick.b
                    bar.c = tick.b
                    bar.v += tick.v
                j += 1

            batchOhlcs.append(bar)

        # Write
        if batchOhlcs:
            ohlcStorer.appendOhlcs(symbol, "1S", batchOhlcs)

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
    if hasattr(ohlcStorer, "getAvailableSymbols"):
        symbols_list = ohlcStorer.getAvailableSymbols()
    else:
        # Fallback if imported via _reader internally
        from ohlcStorer import _reader
        symbols_list = _reader.getAvailableSymbols()
        
    for symbol in symbols_list:
        first_ohlc = ohlcStorer.getFirstOhlc(symbol, "1S")
        if first_ohlc not in (None, False):
            _stager.setFrom("1S", symbol, int(first_ohlc.t))
        else:
            _stager.setFrom("1S", symbol, 0)
        
        last_ohlc = ohlcStorer.getLastOhlc(symbol, "1S")
        if last_ohlc not in (None, False):
            _stager.setTo("1S", symbol, int(last_ohlc.t) + 1000)
        else:
            _stager.setTo("1S", symbol, 0)

    # Launching the single, independent worker thread
    t = threading.Thread(target=worker, daemon=True, name="BaseWorker-1S")
    t.start()
    logger.info(_SECTION, "Global base worker thread started.")