from __future__ import annotations

import queue
import threading
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5
import requests

import _logger as logger
import config
import symbols
import ohlcStorer.storer as ohlcStorer

from . import _collector
from ._type import OhlcRequest, Tick
from _type import Ohlc

_SECTION = "base/_controller.py"

requestQueue: queue.Queue[Any] = queue.Queue()
_thread: threading.Thread | None = None
_stop_event = threading.Event()

# Build context for the shared 1S OHLC batch builder.
_BUILD_DIRECTION: str = "front"  # "front" | "back"
_BUILD_SEED_CLOSE: int | None = None


@dataclass(slots=True)
class Task:
    caller: str
    symbol: str
    extendType: str
    fromTs: int


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _normalize_url(caller: str) -> str:
    caller = (caller or "").strip()
    if not caller:
        return ""
    if caller.startswith("http://") or caller.startswith("https://"):
        return caller
    return f"http://{caller}"


def _symbol_point(symbol: str) -> int:
    """
    Use the stored scaling factor from symbols controller.
    """
    try:
        point = symbols._reader.getSymbol(symbol).point
        return point
    except Exception as exc:
        logger.error(_SECTION, f"Failed to read digits/point for {symbol!r}: {exc}")
        return 1


def _pick_probe_symbol() -> str:
    try:
        candidates = mt5.symbols_get() or []
        for item in candidates:
            name = getattr(item, "name", "")
            if name:
                return str(name)
    except Exception as exc:
        logger.debug(_SECTION, f"Cannot pick probe symbol from mt5.symbols_get(): {exc}")
    return ""


def _floor_sec(ts_ms: int) -> int:
    return (int(ts_ms) // 1000) * 1000


def _default_limit_seconds() -> int:
    value = getattr(config, "OHLC_BASE_DEFAULT_LIMIT", None)
    if value is not None:
        return int(value)

    fallback_ms = getattr(config, "TICK_DEFAULT_DURATION_OFFSET", 0)
    return int(fallback_ms) // 1000


def _batch_limit_seconds() -> int:
    value = getattr(config, "OHLC_BASE_BATCH_LIMIT", None)
    if value is not None:
        return int(value)

    fallback_ms = getattr(config, "TICK_DURATION_LIMIT", 0)
    return int(fallback_ms) // 1000


def _ohlc_price(tick: Tick) -> int:
    return int(tick.b)


def _tick_to_bucket(tick: Tick) -> int:
    return _floor_sec(tick.t)


def _flat_bar(ts: int, close: int) -> Ohlc:
    close = int(close)
    return Ohlc(t=int(ts), o=close, h=close, l=close, c=close, v=0)


def _set_build_context(direction: str, seed_close: int | None) -> None:
    global _BUILD_DIRECTION, _BUILD_SEED_CLOSE
    _BUILD_DIRECTION = direction
    _BUILD_SEED_CLOSE = seed_close


def _buildOhlcBatchFromTickBatch(tickBatch: list[Tick], fromTs: int, ohlcBatchSize: int) -> list[Ohlc]:
    """
    Build continuous 1S OHLC bars from a tick batch.

    Rules:
    - open = first tick.bid inside the second
    - high/low/close = based on tick.bid inside the second
    - if a second has no tick, carry previous close forward with v=0
    - for leading empty seconds:
      - front mode uses the provided seed close
      - back mode uses the first tick close inside the batch
    """
    if ohlcBatchSize <= 0:
        return []

    start_ts = _floor_sec(fromTs)
    end_ts = start_ts + (int(ohlcBatchSize) * 1000)

    ticks = sorted((t for t in tickBatch if start_ts <= _floor_sec(t.t) < end_ts), key=lambda t: t.t)

    bars: list[Ohlc | None] = [None] * ohlcBatchSize

    idx = 0
    n = len(ticks)
    while idx < n:
        tick = ticks[idx]
        bucket = _tick_to_bucket(tick)

        bucket_idx = (bucket - start_ts) // 1000
        if bucket_idx < 0 or bucket_idx >= ohlcBatchSize:
            idx += 1
            continue

        first = _ohlc_price(tick)
        high = first
        low = first
        close = first
        volume = int(tick.v)

        j = idx + 1
        while j < n and _tick_to_bucket(ticks[j]) == bucket:
            price = _ohlc_price(ticks[j])
            if price > high:
                high = price
            if price < low:
                low = price
            close = price
            volume += int(ticks[j].v)
            j += 1

        bars[bucket_idx] = Ohlc(
            t=bucket,
            o=first,
            h=high,
            l=low,
            c=close,
            v=volume,
        )
        idx = j

    first_tick_idx = next((i for i, bar in enumerate(bars) if bar is not None), None)

    if first_tick_idx is None:
        seed_close = _BUILD_SEED_CLOSE
        if seed_close is None:
            return []
        return [_flat_bar(start_ts + i * 1000, seed_close) for i in range(ohlcBatchSize)]

    first_tick_close = int(bars[first_tick_idx].c)

    if _BUILD_DIRECTION == "front" and _BUILD_SEED_CLOSE is not None:
        leading_close = int(_BUILD_SEED_CLOSE)
    else:
        leading_close = first_tick_close

    for i in range(first_tick_idx):
        bars[i] = _flat_bar(start_ts + i * 1000, leading_close)

    last_close = int(bars[first_tick_idx].c)
    for i in range(first_tick_idx + 1, ohlcBatchSize):
        if bars[i] is None:
            bars[i] = _flat_bar(start_ts + i * 1000, last_close)
        else:
            last_close = int(bars[i].c)

    return [bar for bar in bars if bar is not None]


def _dedupe_and_sort(bars: list[Ohlc]) -> list[Ohlc]:
    if not bars:
        return []
    unique: dict[int, Ohlc] = {}
    for bar in bars:
        unique[int(bar.t)] = bar
    return [unique[k] for k in sorted(unique)]


def _last_close_from_storage(symbol: str) -> int | None:
    last = ohlcStorer.getLastOhlc(symbol, "1S")
    if last in (None, False):
        return None
    return int(last.c)


def _first_close_from_storage(symbol: str) -> int | None:
    first = ohlcStorer.getFirstOhlc(symbol, "1S")
    if first in (None, False):
        return None
    return int(first.c)


def _append_closed_bars(symbol: str, bars: list[Ohlc]) -> bool:
    if not bars:
        return True

    last = ohlcStorer.getLastOhlc(symbol, "1S")
    last_ts = int(last.t) if last not in (None, False) else None

    filtered: list[Ohlc] = []
    for bar in bars:
        if last_ts is None or int(bar.t) > last_ts:
            filtered.append(bar)

    if not filtered:
        return True

    return bool(ohlcStorer.appendOhlcs(symbol, "1S", filtered))


def _prepend_closed_bars(symbol: str, bars: list[Ohlc]) -> bool:
    if not bars:
        return True

    first = ohlcStorer.getFirstOhlc(symbol, "1S")
    first_ts = int(first.t) if first not in (None, False) else None

    filtered: list[Ohlc] = []
    for bar in bars:
        if first_ts is None or int(bar.t) < first_ts:
            filtered.append(bar)

    if not filtered:
        return True

    return bool(ohlcStorer.prependOhlcs(symbol, "1S", filtered))


def _notify(caller: str, payload: dict[str, Any]) -> None:
    url = _normalize_url(caller)
    if not url:
        return
    try:
        requests.post(url, json=payload, timeout=1.0)
    except Exception as exc:
        logger.debug(_SECTION, f"Notify failed to {url}: {exc}")


def _notify_done(caller: str, from_ts: int, to_ts: int) -> None:
    threading.Thread(
        target=_notify,
        args=(
            caller,
            {
                "type": "done-load-ohlc",
                "timeframe": "1S",
                "fromTs": int(from_ts),
                "toTs": int(to_ts),
            },
        ),
        daemon=True,
    ).start()


def _fetch_front_batch(symbol: str, start_ts: int, end_ts: int, point: int) -> list[Tick]:
    return _collector.fetchTicksFromMt5(symbol, point, start_ts, end_ts)


def _fetch_back_batch(symbol: str, start_ts: int, end_ts: int, point: int) -> list[Tick]:
    return _collector.fetchTicksFromMt5(symbol, point, start_ts, end_ts)


#==================================================================================================
# MAIN LOGIC
#==================================================================================================
def _extend_front(req: OhlcRequest) -> None:
    symbol = req.symbol.strip()
    point = _symbol_point(symbol)

    _collector.init()

    last = ohlcStorer.getLastOhlc(symbol, "1S")
    if last is False:
        logger.warning(_SECTION, f"Cannot read last OHLC for {symbol!r}.")

    if last in (None, False):
        current_ts = _floor_sec(_now_ms() - (_default_limit_seconds() * 1000))
        seed_close = None
    else:
        current_ts = _floor_sec(int(last.t) + 1000)
        seed_close = int(last.c)

    now_ms = _floor_sec(_now_ms())
    batch_limit_ms = _batch_limit_seconds() * 1000

    if current_ts >= now_ms:
        logger.info(_SECTION, f"No front extension needed for {symbol!r}.")
        return

    while current_ts < now_ms and not _stop_event.is_set():
        start_ts = current_ts
        end_ts = min(current_ts + batch_limit_ms, now_ms)
        ohlcBatchSize = (end_ts - start_ts) // 1000

        if ohlcBatchSize <= 0:
            break

        batch = _fetch_front_batch(symbol, start_ts, end_ts, point)

        _set_build_context("front", seed_close)
        bars = _dedupe_and_sort(_buildOhlcBatchFromTickBatch(batch, start_ts, ohlcBatchSize))
        if bars:
            seed_close = int(bars[-1].c)

        writer_ok = True
        if bars:
            writer_ok = _append_closed_bars(symbol, bars)

        if not writer_ok:
            logger.warning(_SECTION, f"Failed to append OHLC bars for {symbol!r}.")
            break

        if batch:
            logger.debug(
                _SECTION,
                "Loaded ticks: "
                + datetime.fromtimestamp(batch[0].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
                + " -> "
                + datetime.fromtimestamp(batch[-1].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
                + f" ({len(batch)} ticks, {len(bars)} closed 1S bars)",
            )
            _notify_done(req.caller, batch[0].t, batch[-1].t)

        current_ts = end_ts

        if not batch and current_ts >= now_ms:
            break

    logger.info(_SECTION, f"Done extend 1S OHLC front for {symbol!r}.")


def _extend_back(req: OhlcRequest) -> None:
    symbol = req.symbol.strip()
    point = _symbol_point(symbol)

    _collector.init()

    first = ohlcStorer.getFirstOhlc(symbol, "1S")
    if first is False:
        logger.warning(_SECTION, f"Cannot read first OHLC for {symbol!r}.")

    if first in (None, False):
        current_oldest = _floor_sec(_now_ms())
    else:
        current_oldest = _floor_sec(int(first.t))

    target_from = _floor_sec(int(req.fromTs))
    if target_from <= 0:
        logger.warning(_SECTION, f"Invalid back request fromTs for {symbol!r}: {target_from}")
        return

    if current_oldest <= target_from:
        logger.info(_SECTION, f"No back extension needed for {symbol!r}.")
        return

    seed_close = _first_close_from_storage(symbol)
    batch_limit_ms = _batch_limit_seconds() * 1000

    while current_oldest > target_from and not _stop_event.is_set():
        end_ts = current_oldest
        start_ts = max(0, end_ts - batch_limit_ms)
        start_ts = _floor_sec(start_ts)
        ohlcBatchSize = (end_ts - start_ts) // 1000

        if ohlcBatchSize <= 0:
            break

        batch = _fetch_back_batch(symbol, start_ts, end_ts, point)

        _set_build_context("back", seed_close)
        bars = _dedupe_and_sort(_buildOhlcBatchFromTickBatch(batch, start_ts, ohlcBatchSize))

        writer_ok = True
        if bars:
            writer_ok = _prepend_closed_bars(symbol, bars)

        if not writer_ok:
            logger.warning(_SECTION, f"Failed to prepend OHLC bars for {symbol!r}.")
            break

        if batch:
            logger.debug(
                _SECTION,
                "Loaded ticks: "
                + datetime.fromtimestamp(batch[0].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
                + " -> "
                + datetime.fromtimestamp(batch[-1].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
                + f" ({len(batch)} ticks, {len(bars)} closed 1S bars)",
            )
            _notify_done(req.caller, batch[0].t, batch[-1].t)

        current_oldest = start_ts

        if current_oldest <= target_from:
            break

    logger.info(_SECTION, f"Done extend 1S OHLC back for {symbol!r}.")


def _handle_request(item: Any) -> None:
    if item == "SHUTDOWN":
        _stop_event.set()
        return

    if not isinstance(item, OhlcRequest):
        logger.warning(_SECTION, f"Ignoring invalid queue item: {type(item)!r}")
        return

    req = item
    req.caller = (req.caller or "").strip()
    req.symbol = (req.symbol or "").strip()
    req.timeframe = (req.timeframe or "1S").strip().upper()
    req.extendType = (req.extendType or "").strip().lower()

    if req.timeframe != "1S":
        logger.warning(_SECTION, f"Rejected request with unsupported timeframe={req.timeframe!r}.")
        return

    if not req.symbol:
        logger.warning(_SECTION, "Rejected request with empty symbol.")
        return

    if req.extendType == "back":
        if req.fromTs <= 0:
            logger.warning(_SECTION, f"Rejected back request with invalid fromTs for {req.symbol!r}.")
            return
        _extend_back(req)
    elif req.extendType == "front":
        _extend_front(req)
    else:
        logger.warning(_SECTION, f"Rejected request with invalid extendType={req.extendType!r}.")


def _worker() -> None:
    logger.info(_SECTION, "Controller thread started.")
    while not _stop_event.is_set():
        try:
            item = requestQueue.get()
            _handle_request(item)
            requestQueue.task_done()
            if item == "SHUTDOWN":
                break
        except Exception as exc:
            logger.error(_SECTION, f"Controller loop error: {exc}")
    logger.info(_SECTION, "Controller thread stopped.")


def start() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return

    _stop_event.clear()
    _collector.init()
    _thread = threading.Thread(target=_worker, daemon=True)
    _thread.start()


def stop() -> None:
    _stop_event.set()
    requestQueue.put("SHUTDOWN")


def enqueue(request: OhlcRequest) -> None:
    requestQueue.put(request)


def serialize_ohlc(ohlc: Ohlc) -> dict[str, Any]:
    return asdict(ohlc)