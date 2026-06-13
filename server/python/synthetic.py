from __future__ import annotations

import hashlib
import math

from type import Tick

_BASE_PRICES = {
    "EURUSD": 1.08500,
    "USDJPY": 154.250,
    "XAUUSD": 2325.0,
    "NAS100": 134.0,
}


def base_price_for(symbol: str, point: int) -> int:
    base = _BASE_PRICES.get(symbol.upper())
    if base is None:
        digest = hashlib.sha256(symbol.upper().encode("utf-8")).hexdigest()
        base = 1.0 + (int(digest[:8], 16) % 10_000) / 1_000.0
    return max(1, int(round(base * max(1, point))))


def tick_interval_for(step_seconds: int) -> int:
    if step_seconds <= 60:
        return 1
    if step_seconds <= 3_600:
        return 10
    if step_seconds <= 86_400:
        return 60
    return 3_600


def _price_amplitude(point: int, base_price: int) -> int:
    by_point = max(1, point // 1_250)
    by_price = max(1, base_price // 500)
    return max(2, min(max(by_point, by_price), 5_000))


def synthetic_ticks(symbol: str, point: int, start_ts: int, end_ts: int, step_seconds: int) -> list[Tick]:
    if end_ts <= start_ts:
        return []

    interval = tick_interval_for(step_seconds)
    seed = int(hashlib.sha256(symbol.upper().encode("utf-8")).hexdigest()[:8], 16)
    base = base_price_for(symbol, point)
    amplitude = _price_amplitude(point, base)
    spread = max(1, point // 50_000)
    result: list[Tick] = []

    current = start_ts
    last_bid = base
    while current < end_ts:
        wobble = math.sin((current + seed) / (11.0 + (seed % 17)))
        drift = math.sin((current // 900) / (1.0 + (seed % 7))) * (amplitude * 0.75)
        trend = math.sin((current // 86_400) / (2.0 + (seed % 3))) * (amplitude * 0.5)
        step = int(round(wobble * amplitude + drift + trend))

        bid = max(1, last_bid + step)
        band = amplitude * 18
        if bid > base + band:
            bid = base + band - (bid - (base + band))
        elif bid < max(1, base - band):
            bid = max(1, base - band + ((base - band) - bid))

        ask = bid + spread
        volume = int(1 + abs(math.sin((current + seed) / 23.0)) * 9)
        result.append(Tick(timestamp=current, bid=bid, ask=ask, volume=volume))
        last_bid = bid
        current += interval

    return result
