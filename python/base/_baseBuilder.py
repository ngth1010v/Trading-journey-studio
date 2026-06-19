from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5
from tqdm import tqdm

import _logger as logger
import config
import ohlcStorer
import symbols
from . import _collector
from ._type import ExtendRequest, Tick
from _type import Ohlc

_SECTION = "base/_baseBuilder.py"

_MT5_SERVER_OFFSET_MS: int | None = None
_BUILD_DIRECTION: str = "front"  # "front" | "back"
_BUILD_SEED_CLOSE: int | None = None


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _ms_to_dt(ts_ms: int) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


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


def _symbol_point(symbol: str) -> int:
    try:
        point = symbols._reader.getSymbol(symbol).point
        return int(point)
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


def init() -> int:
    """
    Cache the server-vs-UTC offset in milliseconds.

    The result is best-effort. If it cannot be determined, 0 is used.
    """
    global _MT5_SERVER_OFFSET_MS

    if _MT5_SERVER_OFFSET_MS is not None:
        return _MT5_SERVER_OFFSET_MS

    try:
        probe_symbol = _pick_probe_symbol()
        if not probe_symbol:
            _MT5_SERVER_OFFSET_MS = 0
            logger.warning(_SECTION, "No probe symbol found while initializing server offset. Using 0 ms.")
            return 0

        tick = mt5.symbol_info_tick(probe_symbol)
        if tick is None:
            _MT5_SERVER_OFFSET_MS = 0
            logger.warning(_SECTION, f"Could not read MT5 tick for {probe_symbol!r}. Using 0 ms.")
            return 0

        utc_now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        server_now_ms = _safe_int(getattr(tick, "time_msc", 0))
        _MT5_SERVER_OFFSET_MS = server_now_ms - utc_now_ms

        # logger.info(
        #     _SECTION,
        #     f"Server offset initialized for {probe_symbol!r}: {_MT5_SERVER_OFFSET_MS} ms "
        #     f"(server={server_now_ms}, utc={utc_now_ms})",
        # )
        return _MT5_SERVER_OFFSET_MS
    except Exception as exc:
        _MT5_SERVER_OFFSET_MS = 0
        logger.warning(_SECTION, f"Failed to initialize server offset: {exc}. Using 0 ms.")
        return 0


def _ensure_offset() -> int:
    return init()


def _utc_ms_to_mt5_ms(utc_ms: int) -> int:
    return int(utc_ms + _ensure_offset())


def _mt5_ms_to_utc_ms(mt5_ms: Any) -> int:
    return int(_safe_int(mt5_ms)) - _ensure_offset()


def _raw_tick_to_tick(raw_tick: Any, point: int) -> Tick | None:
    try:
        if hasattr(raw_tick, "dtype") and getattr(raw_tick.dtype, "names", None):
            names = raw_tick.dtype.names or ()
            timestamp = raw_tick["time_msc"] if "time_msc" in names else None
            if timestamp is None:
                timestamp = _safe_int(raw_tick["time"]) * 1000

            bid = raw_tick["bid"] if "bid" in names else None
            ask = raw_tick["ask"] if "ask" in names else None
            if bid is None or ask is None:
                return None

            volume = 0
            if "real_volume" in names:
                volume = raw_tick["real_volume"]
            elif "volume" in names:
                volume = raw_tick["volume"]
        elif isinstance(raw_tick, dict):
            timestamp = raw_tick.get("time_msc")
            if timestamp is None:
                timestamp = _safe_int(raw_tick.get("time", 0)) * 1000

            bid = raw_tick.get("bid")
            ask = raw_tick.get("ask")
            if bid is None or ask is None:
                return None

            volume = raw_tick.get("real_volume", raw_tick.get("volume", 0))
        else:
            timestamp = getattr(raw_tick, "time_msc", None)
            if timestamp is None:
                timestamp = _safe_int(getattr(raw_tick, "time", 0)) * 1000

            bid = getattr(raw_tick, "bid", None)
            ask = getattr(raw_tick, "ask", None)
            if bid is None or ask is None:
                return None

            volume = getattr(raw_tick, "real_volume", getattr(raw_tick, "volume", 0))

        timestamp = _mt5_ms_to_utc_ms(timestamp)

        return Tick(
            t=int(timestamp),
            b=int(round(float(bid) * point)),
            a=int(round(float(ask) * point)),
            v=_safe_int(volume),
        )
    except Exception as exc:
        logger.error(_SECTION, f"Failed to convert raw tick: {exc}")
        return None


def fetchTicksFromMt5(symbol: str, point: int, fromTs: int, toTs: int) -> list[Tick]:
    """
    Return a list of UTC ticks that satisfy fromTs <= tick.t < toTs.
    """
    try:
        symbol = (symbol or "").strip()
        if not symbol:
            logger.warning(_SECTION, "Empty symbol passed to fetchTicksFromMt5().")
            return []

        if fromTs <= 0 or toTs <= 0:
            logger.warning(_SECTION, f"Invalid range for {symbol!r}: fromTs={fromTs}, toTs={toTs}")
            return []

        if fromTs > toTs:
            fromTs, toTs = toTs, fromTs

        raw = mt5.copy_ticks_range(
            symbol,
            _ms_to_dt(_utc_ms_to_mt5_ms(fromTs)),
            _ms_to_dt(_utc_ms_to_mt5_ms(toTs)),
            mt5.COPY_TICKS_ALL,
        )
        if raw is None or len(raw) == 0:
            return []

        out: list[Tick] = []
        for item in raw:
            tick = _raw_tick_to_tick(item, point)
            if tick is None:
                continue
            if fromTs <= tick.t < toTs:
                out.append(tick)

        out.sort(key=lambda t: t.t)
        return out
    except Exception as exc:
        logger.error(_SECTION, f"fetchTicksFromMt5({symbol!r}, {point}, {fromTs}, {toTs}) failed: {exc}")
        return []


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


def _current_storage_bounds(symbol: str) -> tuple[int, int] | None:
    first = ohlcStorer.getFirstOhlc(symbol, "1S")
    last = ohlcStorer.getLastOhlc(symbol, "1S")
    if first in (None, False) or last in (None, False):
        return None
    try:
        return int(first.t), int(last.t)
    except Exception:
        return None


def _notify_done(caller: str, from_ts: int, to_ts: int) -> None:
    import requests
    import threading

    def _notify() -> None:
        url = (caller or "").strip()
        if not url:
            return
        if not (url.startswith("http://") or url.startswith("https://")):
            url = f"http://{url}"
        try:
            requests.post(
                url,
                json={
                    "type": "done-load-ohlc",
                    "timeframe": "1S",
                    "fromTs": int(from_ts),
                    "toTs": int(to_ts),
                },
                timeout=1.0,
            )
        except Exception as exc:
            logger.debug(_SECTION, f"Notify failed to {url}: {exc}")

    threading.Thread(target=_notify, daemon=True).start()

def _build_front(symbol: str, caller: str) -> tuple[int, int] | None:
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
        return _current_storage_bounds(symbol)

    build_start_ts = current_ts
    build_end_ts = now_ms

    total_expected_bars = max(1, (build_end_ts - build_start_ts) // 1000)

    total_ticks = 0
    total_bars = 0

    with tqdm(
        total=total_expected_bars,
        desc=f"{symbol} front",
        unit="bar",
        leave=False,
    ) as pbar:

        while current_ts < now_ms:
            start_ts = current_ts
            end_ts = min(current_ts + batch_limit_ms, now_ms)

            ohlc_batch_size = (end_ts - start_ts) // 1000
            if ohlc_batch_size <= 0:
                break

            batch = fetchTicksFromMt5(symbol, point, start_ts, end_ts)

            _set_build_context("front", seed_close)

            bars = _dedupe_and_sort(
                _buildOhlcBatchFromTickBatch(
                    batch,
                    start_ts,
                    ohlc_batch_size,
                )
            )

            if bars:
                seed_close = int(bars[-1].c)

            writer_ok = True
            if bars:
                writer_ok = _append_closed_bars(symbol, bars)

            if not writer_ok:
                logger.warning(
                    _SECTION,
                    f"Failed to append OHLC bars for {symbol!r}.",
                )
                break

            total_ticks += len(batch)
            total_bars += len(bars)

            if batch:
                _notify_done(
                    caller,
                    batch[0].t,
                    batch[-1].t,
                )

            pbar.update(ohlc_batch_size)

            current_ts = end_ts

            if not batch and current_ts >= now_ms:
                break

    logger.info(
        _SECTION,
        "Extended: "
        f"{datetime.fromtimestamp(build_start_ts / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')} "
        f"-> "
        f"{datetime.fromtimestamp(build_end_ts / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')}"
        f" | "
        f"{total_ticks:,} ticks -> "
        f"{total_bars:,} S1-bars"
    )

    return _current_storage_bounds(symbol)

def _build_back(
    symbol: str,
    caller: str,
    from_ts: int,
) -> tuple[int, int] | None:
    point = _symbol_point(symbol)
    _collector.init()

    first = ohlcStorer.getFirstOhlc(symbol, "1S")
    if first is False:
        logger.warning(_SECTION, f"Cannot read first OHLC for {symbol!r}.")

    if first in (None, False):
        current_oldest = _floor_sec(_now_ms())
    else:
        current_oldest = _floor_sec(int(first.t))

    target_from = _floor_sec(int(from_ts))

    if target_from <= 0:
        logger.warning(
            _SECTION,
            f"Invalid back request fromTs for {symbol!r}: {target_from}",
        )
        return _current_storage_bounds(symbol)

    if current_oldest <= target_from:
        logger.info(_SECTION, f"No back extension needed for {symbol!r}.")
        return

    seed_close = None

    first_existing = ohlcStorer.getFirstOhlc(symbol, "1S")
    if first_existing not in (None, False):
        seed_close = int(first_existing.c)

    batch_limit_ms = _batch_limit_seconds() * 1000

    build_start_ts = target_from
    build_end_ts = current_oldest

    total_expected_bars = max(1, (build_end_ts - build_start_ts) // 1000)

    total_ticks = 0
    total_bars = 0

    with tqdm(
        total=total_expected_bars,
        desc=f"{symbol} back",
        unit="bar",
        leave=False,
    ) as pbar:

        while current_oldest > target_from:
            end_ts = current_oldest

            start_ts = max(0, end_ts - batch_limit_ms)
            start_ts = _floor_sec(start_ts)

            ohlc_batch_size = (end_ts - start_ts) // 1000
            if ohlc_batch_size <= 0:
                break

            batch = fetchTicksFromMt5(
                symbol,
                point,
                start_ts,
                end_ts,
            )

            _set_build_context("back", seed_close)

            bars = _dedupe_and_sort(
                _buildOhlcBatchFromTickBatch(
                    batch,
                    start_ts,
                    ohlc_batch_size,
                )
            )

            writer_ok = True
            if bars:
                writer_ok = _prepend_closed_bars(symbol, bars)

            if not writer_ok:
                logger.warning(
                    _SECTION,
                    f"Failed to prepend OHLC bars for {symbol!r}.",
                )
                break

            total_ticks += len(batch)
            total_bars += len(bars)

            if batch:
                _notify_done(
                    caller,
                    batch[0].t,
                    batch[-1].t,
                )

            pbar.update(ohlc_batch_size)

            current_oldest = start_ts

            if current_oldest <= target_from:
                break

    logger.info(
        _SECTION,
        "Extended: "
        f"{datetime.fromtimestamp(build_start_ts / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')} "
        f"-> "
        f"{datetime.fromtimestamp(build_end_ts / 1000, timezone.utc).strftime('%d/%m/%Y-%H:%M:%S')}"
        f" | "
        f"{total_ticks:,} ticks -> "
        f"{total_bars:,} S1-bars"
    )

    return _current_storage_bounds(symbol)



def extend(req: ExtendRequest) -> tuple[int, int] | None:
    symbol = (req.symbol or "").strip()
    if not symbol:
        logger.warning(_SECTION, "Rejected empty symbol in base builder.")
        return

    extend_type = (req.extendType or "").strip().lower()
    if extend_type == "front":
        return _build_front(symbol, req.caller)
    elif extend_type == "back":
        return _build_back(symbol, req.caller, req.fromTs)
    else:
        logger.warning(_SECTION, f"Rejected request with invalid extendType={extend_type!r}.")
        return None
