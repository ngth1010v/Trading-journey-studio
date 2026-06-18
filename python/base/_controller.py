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
    Use 10^digits as the scaling factor.

    This matches the stored integer-price logic used by the project.
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


def _ohlc_price(tick: Tick) -> int:
    # Use bid as the base price for 1S OHLC bars.
    return int(tick.b)


def _tick_to_bucket(tick: Tick) -> int:
    return _floor_sec(tick.t)


def _bar_from_tick(tick: Tick) -> Ohlc:
    price = _ohlc_price(tick)
    bucket = _tick_to_bucket(tick)
    return Ohlc(t=bucket, o=price, h=price, l=price, c=price, v=int(tick.v))


def _update_bar(bar: Ohlc, tick: Tick) -> Ohlc:
    price = _ohlc_price(tick)
    bar.h = max(bar.h, price)
    bar.l = min(bar.l, price)
    bar.c = price
    bar.v += int(tick.v)
    return bar


_PENDING_FRONT_BARS: dict[str, Ohlc] = {}


def _consume_front_ticks(symbol: str, ticks: list[Tick]) -> list[Ohlc]:
    """
    Feed ticks in ascending order and return only the bars that have become closed.

    The current open 1S bucket is retained in memory so the next batch can finish it.
    """
    if not ticks:
        return []

    pending = _PENDING_FRONT_BARS.get(symbol)
    closed: list[Ohlc] = []
    idx = 0

    if pending is None:
        pending = _bar_from_tick(ticks[0])
        idx = 1
    else:
        first_bucket = _tick_to_bucket(ticks[0])

        if first_bucket < pending.t:
            # Skip stale/overlapping ticks from an older or duplicated batch.
            while idx < len(ticks) and _tick_to_bucket(ticks[idx].t) <= pending.t:
                idx += 1
        elif first_bucket > pending.t:
            closed.append(pending)
            pending = _bar_from_tick(ticks[0])
            idx = 1
        else:
            _update_bar(pending, ticks[0])
            idx = 1

    for tick in ticks[idx:]:
        bucket = _tick_to_bucket(tick)
        if bucket < pending.t:
            continue
        if bucket == pending.t:
            _update_bar(pending, tick)
            continue

        closed.append(pending)
        pending = _bar_from_tick(tick)

    _PENDING_FRONT_BARS[symbol] = pending
    return closed


def _build_closed_ohlcs_from_ticks(ticks: list[Tick]) -> list[Ohlc]:
    """
    Convert a sorted tick list into closed 1-second bars.

    This variant emits the final bucket as well, which is appropriate for
    historical ranges where the requested window is already closed.
    """
    if not ticks:
        return []

    bars: list[Ohlc] = []
    current_bar = _bar_from_tick(ticks[0])

    for tick in ticks[1:]:
        bucket = _tick_to_bucket(tick)
        if bucket == current_bar.t:
            _update_bar(current_bar, tick)
            continue

        bars.append(current_bar)
        current_bar = _bar_from_tick(tick)

    bars.append(current_bar)
    return bars


def _dedupe_and_sort(bars: list[Ohlc]) -> list[Ohlc]:
    if not bars:
        return []
    unique: dict[int, Ohlc] = {}
    for bar in bars:
        unique[int(bar.t)] = bar
    return [unique[k] for k in sorted(unique)]


def _append_closed_bars(symbol: str, bars: list[Ohlc]) -> bool:
    if not bars:
        return True

    last = ohlcStorer.getLastOhlc(symbol, "1S")
    last_ts = int(last.t) if last not in (None, False) else None

    filtered: list[Ohlc] = []
    for bar in bars:
        if last_ts is None or bar.t > last_ts:
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
        if first_ts is None or bar.t < first_ts:
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
        args=(caller, {"type": "done-load-ohlc", "timeframe": "1S", "fromTs": int(from_ts), "toTs": int(to_ts)}),
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
        # return

    if last in (None, False):
        current_ts = _now_ms() - config.TICK_DEFAULT_DURATION_OFFSET
    else:
        current_ts = int(last.t) + 1000


    now_ms      = _now_ms()
    current_ts  = _floor_sec(current_ts)
    now_ms      = int(now_ms)

    if current_ts >= now_ms:
        logger.info(_SECTION, f"No front extension needed for {symbol!r}.")
        return

    while current_ts < now_ms and not _stop_event.is_set():
        start_ts = current_ts
        end_ts = min(current_ts + config.TICK_DURATION_LIMIT, now_ms)
        if end_ts <= start_ts:
            break

        batch = _fetch_front_batch(symbol, start_ts, end_ts, point)
        if not batch:
            if end_ts == now_ms:
                logger.warning(_SECTION, f"No more front ticks for {symbol!r} between {start_ts} and {end_ts}.")
                break
            current_ts = _floor_sec(end_ts)
            if current_ts <= start_ts:
                current_ts = start_ts + 1000
            continue

        batch.sort(key=lambda t: t.t)
        bars = _dedupe_and_sort(_build_closed_ohlcs_from_ticks(batch))

        _writer_ok = _append_closed_bars(symbol, bars)
        if not _writer_ok:
            logger.warning(_SECTION, f"Failed to append OHLC bars for {symbol!r}.")
            break

        logger.debug(
            _SECTION,
            "Loaded ticks: "
            + datetime.fromtimestamp(batch[0].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
            + " -> "
            + datetime.fromtimestamp(batch[-1].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
            + f" ({len(batch)} ticks, {len(bars)} closed 1S bars)",
        )

        if batch:
            _notify_done(req.caller, batch[0].t, batch[-1].t)

        new_current = _floor_sec(batch[-1].t) + 1000
        if new_current <= current_ts:
            break
        current_ts = new_current

    logger.info(_SECTION, f"Done extend 1S OHLC front for {symbol!r}.")


def _extend_back(req: OhlcRequest) -> None:
    symbol = req.symbol.strip()
    point = _symbol_point(symbol)

    _collector.init()

    first = ohlcStorer.getFirstOhlc(symbol, "1S")
    if first is False:
        logger.warning(_SECTION, f"Cannot read first OHLC for {symbol!r}.")
        # return

    if first in (None, False):
        current_oldest = _now_ms()
    else:
        current_oldest = int(first.t)

    target_from = _floor_sec(int(req.fromTs))
    if target_from <= 0:
        logger.warning(_SECTION, f"Invalid back request fromTs for {symbol!r}: {target_from}")
        return

    while current_oldest > target_from and not _stop_event.is_set():
        end_ts = current_oldest
        start_ts = max(0, end_ts - config.TICK_DURATION_LIMIT)
        start_ts = _floor_sec(start_ts)

        batch = _fetch_back_batch(symbol, start_ts, end_ts, point)
        if not batch:
            logger.warning(_SECTION, f"No more back ticks for {symbol!r} between {start_ts} and {end_ts}.")
            break

        batch.sort(key=lambda t: t.t)
        bars = _dedupe_and_sort(_consume_front_ticks(symbol, batch))

        _writer_ok = _prepend_closed_bars(symbol, bars)
        if not _writer_ok:
            logger.warning(_SECTION, f"Failed to prepend OHLC bars for {symbol!r}.")
            break

        logger.debug(
            _SECTION,
            "Loaded ticks: "
            + datetime.fromtimestamp(batch[0].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
            + " -> "
            + datetime.fromtimestamp(batch[-1].t / 1000, timezone.utc).strftime("%d/%m/%Y-%H:%M:%S")
            + f" ({len(batch)} ticks, {len(bars)} closed 1S bars)",
        )

        if batch:
            _notify_done(req.caller, batch[0].t, batch[-1].t)

        new_oldest = _floor_sec(batch[0].t)
        if new_oldest >= current_oldest:
            break
        current_oldest = new_oldest

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
    _PENDING_FRONT_BARS.clear()
    _collector.init()
    _thread = threading.Thread(target=_worker, daemon=True)
    _thread.start()


def stop() -> None:
    _stop_event.set()
    requestQueue.put("SHUTDOWN")


def enqueue(request: OhlcRequest) -> None:
    requestQueue.put(request)


# def build_ohlc_from_ticks(ticks: list[Tick]) -> list[Ohlc]:
#     """
#     Public helper for tests.
#     """
#     return _dedupe_and_sort(_build_ohlcs_from_ticks(sorted(ticks, key=lambda t: t.t)))


def serialize_ohlc(ohlc: Ohlc) -> dict[str, Any]:
    return asdict(ohlc)
