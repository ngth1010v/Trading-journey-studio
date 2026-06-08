from __future__ import annotations

from math import isfinite


def float_point_to_int_scale(point: float) -> int:
    if not isfinite(point) or point <= 0:
        return 1
    scale = int(round(1.0 / point))
    return scale if scale > 0 else 1


def real_price_to_int(price: float, point: int) -> int:
    if point <= 0:
        point = 1
    return int(float(price) * int(point))
