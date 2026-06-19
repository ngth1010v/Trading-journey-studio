from __future__ import annotations

from dataclasses import dataclass

import _logger as logger
import ohlcStorer.storer as ohlcStorer
from ohlcStorer._type import AggregatePeriod
from _type import Ohlc

_SECTION = "base/_ohlcBuilder.py"

_TIMEFRAME_TO_MS = {
    "1S": 1000,
    "1M": 60_000,
    "1H": 3_600_000,
    "1D": 86_400_000,
}

_BUILD_CHAIN = ("1M", "1H", "1D")
_BATCH_TARGET_PERIODS = 1000


@dataclass(slots=True)
class _BuildState:
    dest_first_ts: int | None
    dest_last_ts: int | None


@dataclass(slots=True)
class _BuildResult:
    wrote_any: bool
    first_ts: int | None
    last_ts: int | None


def _floor_to_period(ts_ms: int, period_ms: int) -> int:
    return (int(ts_ms) // int(period_ms)) * int(period_ms)


def _ceil_to_period(ts_ms: int, period_ms: int) -> int:
    ts_ms = int(ts_ms)
    period_ms = int(period_ms)
    return ((ts_ms + period_ms - 1) // period_ms) * period_ms


def _safe_ohlc(obj: object) -> Ohlc | None:
    if obj in (None, False):
        return None
    if isinstance(obj, Ohlc):
        return obj
    try:
        return Ohlc(
            t=int(getattr(obj, "t")),
            o=int(getattr(obj, "o")),
            h=int(getattr(obj, "h")),
            l=int(getattr(obj, "l")),
            c=int(getattr(obj, "c")),
            v=int(getattr(obj, "v")),
        )
    except Exception:
        return None


def _state_for(symbol: str, timeframe: str) -> _BuildState:
    first = _safe_ohlc(ohlcStorer.getFirstOhlc(symbol, timeframe))
    last = _safe_ohlc(ohlcStorer.getLastOhlc(symbol, timeframe))
    return _BuildState(
        dest_first_ts=int(first.t) if first is not None else None,
        dest_last_ts=int(last.t) if last is not None else None,
    )


def _source_bounds(symbol: str, timeframe: str, hint: tuple[int, int] | None = None) -> tuple[int | None, int | None]:
    first = _safe_ohlc(ohlcStorer.getFirstOhlc(symbol, timeframe))
    last = _safe_ohlc(ohlcStorer.getLastOhlc(symbol, timeframe))

    first_ts = int(first.t) if first is not None else None
    last_ts = int(last.t) if last is not None else None

    if hint is not None:
        hint_first, hint_last = hint
        if hint_first is not None:
            first_ts = hint_first if first_ts is None else min(first_ts, int(hint_first))
        if hint_last is not None:
            last_ts = hint_last if last_ts is None else max(last_ts, int(hint_last))

    return first_ts, last_ts


def _source_unit_ms(source_tf: str) -> int:
    try:
        return _TIMEFRAME_TO_MS[source_tf]
    except KeyError:
        raise ValueError(f"Unsupported source timeframe: {source_tf!r}")


def _complete_target_range(source_first_ts: int, source_last_ts: int, source_tf: str, target_tf: str) -> tuple[int, int]:
    source_unit_ms = _source_unit_ms(source_tf)
    target_period_ms = _source_unit_ms(target_tf)

    start_ts = _ceil_to_period(source_first_ts, target_period_ms)
    last_complete_anchor = source_last_ts - (target_period_ms - source_unit_ms)
    end_ts = _floor_to_period(last_complete_anchor, target_period_ms) + target_period_ms
    return start_ts, end_ts


def _build_periods(start_ts: int, end_ts: int, period_ms: int) -> list[AggregatePeriod]:
    if start_ts >= end_ts:
        return []

    periods: list[AggregatePeriod] = []
    current = start_ts
    while current < end_ts:
        batch_end = min(end_ts, current + period_ms * _BATCH_TARGET_PERIODS)
        t = current
        while t < batch_end:
            periods.append(AggregatePeriod(fromTs=t, toTs=t + period_ms))
            t += period_ms
        current = batch_end
    return periods


def _write_append(symbol: str, timeframe: str, state: _BuildState, bars: list[Ohlc]) -> int:
    if not bars:
        return 0

    filtered: list[Ohlc] = []
    for bar in bars:
        if state.dest_last_ts is None or int(bar.t) > state.dest_last_ts:
            filtered.append(bar)

    if not filtered:
        return 0

    if ohlcStorer.appendOhlcs(symbol, timeframe, filtered):
        state.dest_last_ts = int(filtered[-1].t)
        if state.dest_first_ts is None:
            state.dest_first_ts = int(filtered[0].t)
        return len(filtered)

    logger.warning(_SECTION, f"Failed to append {timeframe} bars for {symbol!r}.")
    return 0


def _write_prepend(symbol: str, timeframe: str, state: _BuildState, bars: list[Ohlc]) -> int:
    if not bars:
        return 0

    filtered: list[Ohlc] = []
    for bar in bars:
        if state.dest_first_ts is None or int(bar.t) < state.dest_first_ts:
            filtered.append(bar)

    if not filtered:
        return 0

    if ohlcStorer.prependOhlcs(symbol, timeframe, filtered):
        state.dest_first_ts = int(filtered[0].t)
        if state.dest_last_ts is None:
            state.dest_last_ts = int(filtered[-1].t)
        return len(filtered)

    logger.warning(_SECTION, f"Failed to prepend {timeframe} bars for {symbol!r}.")
    return 0


def _aggregate(symbol: str, source_tf: str, periods: list[AggregatePeriod]) -> list[Ohlc]:
    if not periods:
        return []

    out = ohlcStorer.aggregateOhlcs(symbol, source_tf, periods)
    if not out:
        return []

    bars: list[Ohlc] = []
    for item in out:
        bar = _safe_ohlc(item)
        if bar is not None:
            bars.append(bar)
    bars.sort(key=lambda b: b.t)
    return bars


def _build_one(symbol: str, source_tf: str, target_tf: str, direction: str, source_hint: tuple[int, int] | None = None) -> _BuildResult:
    if source_tf not in _TIMEFRAME_TO_MS or target_tf not in _TIMEFRAME_TO_MS:
        logger.warning(_SECTION, f"Unsupported timeframe mapping {source_tf!r}->{target_tf!r} for {symbol!r}.")
        return _BuildResult(False, None, None)

    source_first, source_last = _source_bounds(symbol, source_tf, source_hint)
    if source_first is None or source_last is None:
        logger.warning(_SECTION, f"No source data for {symbol!r} {source_tf} while building {target_tf}.")
        state = _state_for(symbol, target_tf)
        return _BuildResult(False, state.dest_first_ts, state.dest_last_ts)

    start_ts, end_ts = _complete_target_range(int(source_first), int(source_last), source_tf, target_tf)
    if start_ts >= end_ts:
        state = _state_for(symbol, target_tf)
        return _BuildResult(False, state.dest_first_ts, state.dest_last_ts)

    target_period_ms = _TIMEFRAME_TO_MS[target_tf]
    periods = _build_periods(start_ts, end_ts, target_period_ms)
    if not periods:
        state = _state_for(symbol, target_tf)
        return _BuildResult(False, state.dest_first_ts, state.dest_last_ts)

    state = _state_for(symbol, target_tf)
    wrote_count = 0

    for i in range(0, len(periods), _BATCH_TARGET_PERIODS):
        batch_periods = periods[i : i + _BATCH_TARGET_PERIODS]
        bars = _aggregate(symbol, source_tf, batch_periods)
        if not bars:
            continue

        if direction == "front":
            wrote_count += _write_append(symbol, target_tf, state, bars)
        else:
            wrote_count += _write_prepend(symbol, target_tf, state, bars)

    if wrote_count > 0:
        logger.info(_SECTION, f"Done extend {target_tf} from {source_tf} for {symbol!r}. Wrote {wrote_count} bars.")
    else:
        logger.warning(_SECTION, f"No complete {target_tf} bars written from {source_tf} for {symbol!r}.")

    refreshed = _state_for(symbol, target_tf)
    return _BuildResult(wrote_count > 0, refreshed.dest_first_ts, refreshed.dest_last_ts)


def extend_all(symbol: str, direction: str, source_bounds: tuple[int, int] | None = None) -> None:
    symbol = (symbol or "").strip()
    direction = (direction or "").strip().lower()
    if not symbol:
        logger.warning(_SECTION, "Rejected empty symbol in ohlc builder.")
        return
    if direction not in {"front", "back"}:
        logger.warning(_SECTION, f"Rejected invalid direction={direction!r} in ohlc builder.")
        return

    # Build chain: 1M from 1S, 1H from 1M, 1D from 1H.
    result_1m = _build_one(symbol, "1S", "1M", direction, source_hint=source_bounds)
    result_1h = _build_one(symbol, "1M", "1H", direction, source_hint=(result_1m.first_ts, result_1m.last_ts) if result_1m.first_ts is not None and result_1m.last_ts is not None else None)
    _build_one(symbol, "1H", "1D", direction, source_hint=(result_1h.first_ts, result_1h.last_ts) if result_1h.first_ts is not None and result_1h.last_ts is not None else None)
