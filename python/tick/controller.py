from __future__ import annotations

import queue
import threading
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any

import MetaTrader5 as mt5
import requests

import _logger as logger
import config
import symbols

from . import _collector, _reader, _writer
from ._type import Tick, TickRequest

_SECTION = "tick/controller.py"

requestQueue: queue.Queue[Any] = queue.Queue()
_thread: threading.Thread | None = None
_stop_event = threading.Event()

# MT5 server time offset relative to UTC (milliseconds).
# Example: if MT5 tick timestamps are ~UTC+3, this value will be about +10800000.
_MT5_SERVER_OFFSET_MS: int | None = None


@dataclass(slots=True)
class Task:
    symbol: str
    fromTs: int
    toTs: int


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
    try:
        info = symbols._reader.getSymbol(symbol)
        point = getattr(info, "point", 0)
        point = int(round(float(point)))
        return max(point, 1)
    except Exception as exc:
        logger.error(_SECTION, f"Failed to read point for {symbol!r}: {exc}")
        return 1


def _pick_probe_symbol() -> str:
    """
    Best-effort symbol used to infer the MT5 server time offset.
    """
    try:
        candidates = mt5.symbols_get() or []
        for item in candidates:
            name = getattr(item, "name", "")
            if name:
                return str(name)
    except Exception as exc:
        logger.debug(_SECTION, f"Cannot pick probe symbol from mt5.symbols_get(): {exc}")
    return ""


def _ensure_mt5_server_offset(symbol: str = "") -> int:
    """
    Initialize the cached MT5-vs-UTC offset once.
    If the offset cannot be determined, it falls back to 0.
    """
    global _MT5_SERVER_OFFSET_MS

    if _MT5_SERVER_OFFSET_MS is not None:
        return _MT5_SERVER_OFFSET_MS

    probe_symbol = (symbol or "").strip() or _pick_probe_symbol()
    if not probe_symbol:
        _MT5_SERVER_OFFSET_MS = 0
        logger.warning(_SECTION, "Could not determine MT5 server offset (no probe symbol). Using 0 ms.")
        return 0

    try:
        tick = mt5.symbol_info_tick(probe_symbol)
        if tick is None:
            _MT5_SERVER_OFFSET_MS = 0
            logger.warning(_SECTION, f"Could not read MT5 tick for {probe_symbol!r} to determine offset. Using 0 ms.")
            return 0

        utc_now_ms = _now_ms()
        server_now_ms = int(tick.time_msc)
        _MT5_SERVER_OFFSET_MS = server_now_ms - utc_now_ms

        logger.info(
            _SECTION,
            f"MT5 server offset initialized for {probe_symbol!r}: {_MT5_SERVER_OFFSET_MS} ms "
            f"(server={server_now_ms}, utc={utc_now_ms})",
        )
        return _MT5_SERVER_OFFSET_MS
    except Exception as exc:
        _MT5_SERVER_OFFSET_MS = 0
        logger.warning(_SECTION, f"Failed to determine MT5 server offset: {exc}. Using 0 ms.")
        return 0


def _utc_ms_to_mt5_ms(utc_ms: int) -> int:
    return int(utc_ms + _ensure_mt5_server_offset())


def _mt5_ms_to_utc_ms(mt5_ms: Any) -> int:
    return int(mt5_ms) - _ensure_mt5_server_offset()


def _mt5_dt_from_utc_ms(utc_ms: int) -> datetime:
    return datetime.fromtimestamp(_utc_ms_to_mt5_ms(utc_ms) / 1000.0, tz=timezone.utc)


def _raw_tick_to_storage_tick(raw_tick: Any, point: int) -> Tick | None:
    try:
        # MT5 numpy record
        if hasattr(raw_tick, "dtype") and getattr(raw_tick.dtype, "names", None):
            timestamp = raw_tick["time_msc"] if "time_msc" in raw_tick.dtype.names else None
            if timestamp is None:
                timestamp = int(raw_tick["time"]) * 1000

            bid = raw_tick["bid"] if "bid" in raw_tick.dtype.names else None
            ask = raw_tick["ask"] if "ask" in raw_tick.dtype.names else None

            if bid is None or ask is None:
                return None

            volume = 0
            if "real_volume" in raw_tick.dtype.names:
                volume = raw_tick["real_volume"]
            elif "volume" in raw_tick.dtype.names:
                volume = raw_tick["volume"]

        # dict
        elif isinstance(raw_tick, dict):
            timestamp = raw_tick.get("time_msc")
            if timestamp is None:
                timestamp = int(raw_tick.get("time", 0)) * 1000

            bid = raw_tick.get("bid")
            ask = raw_tick.get("ask")

            if bid is None or ask is None:
                return None

            volume = raw_tick.get("real_volume", raw_tick.get("volume", 0))

        # object / namedtuple
        else:
            timestamp = getattr(raw_tick, "time_msc", None)
            if timestamp is None:
                timestamp = int(getattr(raw_tick, "time", 0)) * 1000

            bid = getattr(raw_tick, "bid", None)
            ask = getattr(raw_tick, "ask", None)

            if bid is None or ask is None:
                return None

            volume = getattr(
                raw_tick,
                "real_volume",
                getattr(raw_tick, "volume", 0),
            )

        # Store timestamps in UTC.
        timestamp = _mt5_ms_to_utc_ms(timestamp)

        return Tick(
            timestamp=int(timestamp),
            bid=int(bid * point),
            ask=int(ask * point),
            volume=int(volume),
        )

    except Exception as exc:
        logger.error(_SECTION, f"Failed to convert tick: {exc}")
        return None


def _ticks_to_storage_ticks(raw_ticks: Any, point: int) -> list[Tick]:
    if raw_ticks is None:
        return []

    try:
        out: list[Tick] = []

        for raw_tick in raw_ticks:
            tick = _raw_tick_to_storage_tick(raw_tick, point)
            if tick is not None:
                out.append(tick)

        return out

    except Exception as exc:
        logger.error(_SECTION, f"Failed to convert raw ticks: {exc}")
        return []


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
        args=(caller, {"type": "done-load-tick", "fromTs": int(from_ts), "toTs": int(to_ts)}),
        daemon=True,
    ).start()


#=============================================================================================================
# DATA HANDLE
#=============================================================================================================
def _fetch_front_batch(symbol: str, start_ts: int, end_ts: int, point: int) -> list[Tick]:
    raw = mt5.copy_ticks_range(
        symbol,
        _mt5_dt_from_utc_ms(start_ts),
        _mt5_dt_from_utc_ms(end_ts),
        mt5.COPY_TICKS_INFO,
    )
    return _ticks_to_storage_ticks(raw, point)


def _fetch_back_batch(symbol: str, start_ts: int, end_ts: int, point: int) -> list[Tick]:
    raw = mt5.copy_ticks_range(
        symbol,
        _mt5_dt_from_utc_ms(start_ts),
        _mt5_dt_from_utc_ms(end_ts),
        mt5.COPY_TICKS_INFO,
    )
    return _ticks_to_storage_ticks(raw, point)


def _extend_front(req: TickRequest) -> None:
    symbol = req.symbol.strip()
    point = _symbol_point(symbol)

    _ensure_mt5_server_offset(symbol)

    if _reader.IsEmpty(symbol):
        current_ts = _now_ms() - config.TICK_DEFAULT_DURATION_OFFSET
    else:
        last_tick = _reader.getLastTick(symbol)
        if last_tick is False:
            logger.warning(_SECTION, f"Cannot read last tick for {symbol!r}.")
            return
        current_ts = int(last_tick.timestamp)

    now_ms = _now_ms()

    out = str(
        timedelta(
            seconds=int(
                (now_ms - current_ts) / 1000
            )
        )
    )
    logger.debug(_SECTION, "Last tick gap: " + out)

    while current_ts < now_ms and not _stop_event.is_set():
        start_ts = current_ts
        end_ts = min(current_ts + config.TICK_DURATION_LIMIT, now_ms)
        batch = _fetch_front_batch(symbol, start_ts, end_ts, point)

        if not batch:
            if end_ts == now_ms:
                logger.warning(_SECTION, f"No more front ticks for {symbol!r} between {start_ts} and {end_ts}.")
                break
            else:
                current_ts += config.TICK_DURATION_LIMIT
                continue

        _writer.set_active_symbol(symbol)
        if not _writer.appendTicks(batch):
            logger.warning(_SECTION, f"Failed to append front ticks for {symbol!r}.")
            break
        logger.debug(_SECTION, "Loaded ticks: "
            + str(datetime.fromtimestamp(batch[0].timestamp / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')) + " -> "        
            + str(datetime.fromtimestamp(batch[-1].timestamp / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S'))         
            + " (" + str(len(batch)) + " ticks)"   
        )
        

        _notify_done(req.caller, batch[0].timestamp, batch[-1].timestamp)
        new_current = batch[-1].timestamp
        if new_current <= current_ts:
            break
        current_ts = new_current

    logger.info(_SECTION, f"Done extend tick front.")



def _extend_back(req: TickRequest) -> None:
    symbol = req.symbol.strip()
    point = _symbol_point(symbol)

    _ensure_mt5_server_offset(symbol)

    if _reader.IsEmpty(symbol):
        current_oldest = _now_ms()
    else:
        first_tick = _reader.getFirstTick(symbol)
        if first_tick is False:
            logger.warning(_SECTION, f"Cannot read first tick for {symbol!r}.")
            return
        current_oldest = int(first_tick.timestamp)

    target_from = int(req.fromTs)
    if target_from <= 0:
        logger.warning(_SECTION, f"Invalid back request fromTs for {symbol!r}: {target_from}")
        return

    while current_oldest > target_from and not _stop_event.is_set():
        end_ts = max(target_from, current_oldest - 1)
        start_ts = max(0, end_ts - config.TICK_DURATION_LIMIT)
        batch = _fetch_back_batch(symbol, start_ts, end_ts, point)
        if not batch:
            logger.warning(_SECTION, f"No more back ticks for {symbol!r} between {start_ts} and {end_ts}.")
            break

        _writer.set_active_symbol(symbol)
        if not _writer.prependTicks(batch):
            logger.warning(_SECTION, f"Failed to prepend back ticks for {symbol!r}.")
            break
        logger.debug(_SECTION, "Loaded ticks: "
            + str(datetime.fromtimestamp(batch[0].timestamp / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')) + " -> "        
            + str(datetime.fromtimestamp(batch[-1].timestamp / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S'))         
            + " (" + str(len(batch)) + " ticks)"    
        )

        _notify_done(req.caller, batch[0].timestamp, batch[-1].timestamp)
        new_oldest = batch[0].timestamp
        if new_oldest >= current_oldest:
            break
        current_oldest = new_oldest

    logger.info(_SECTION, f"Done extend tick back.")


#=============================================================================================================
# WORKER
#=============================================================================================================
def _handle_request(item: Any) -> None:
    if item == "SHUTDOWN":
        _stop_event.set()
        return

    if not isinstance(item, TickRequest):
        logger.warning(_SECTION, f"Ignoring invalid queue item: {type(item)!r}")
        return

    req = item
    req.caller = (req.caller or "").strip()
    req.symbol = (req.symbol or "").strip()
    req.extendType = (req.extendType or "").strip().lower()

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


#=============================================================================================================
# PUBLIC API
#=============================================================================================================
def start() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return

    _stop_event.clear()
    _ensure_mt5_server_offset()
    _thread = threading.Thread(target=_worker, daemon=True)
    _thread.start()


def stop() -> None:
    _stop_event.set()
    requestQueue.put("SHUTDOWN")


def enqueue(request: TickRequest) -> None:
    requestQueue.put(request)
