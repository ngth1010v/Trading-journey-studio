from __future__ import annotations

import _logger as logger
from _type import Ohlc
from _reader import getFirstOhlc, getLastOhlc, getOhlcs

_SECTION = "storer/_aggregater.py"


def _timeframe_delta_ms(timeframe: str) -> int:
    tf = str(timeframe).strip().upper()
    mapping = {
        "1S": 1000,
        "1M": 1000 * 60,
        "1H": 1000 * 60 * 60,
        "1D": 1000 * 60 * 60 * 24,
    }

    if tf not in mapping:
        logger.error(_SECTION, f"aggregateOhlcs() unsupported timeframe: {timeframe!r}")
        raise RuntimeError(f"Unsupported timeframe: {timeframe!r}")

    return mapping[tf]


def aggregateOhlcs(symbol: str, srcTimeframe: str, targetPeriods: list[tuple[int, int]]):
    """
    Aggregate source OHLC rows from `srcTimeframe` into all requested target periods.
    Uses sequential sliding pointer logic matching tick aggregation styles.
    """
    try:
        src_step_ms = _timeframe_delta_ms(srcTimeframe)

        #=========================================================================
        # Validate period type
        #=========================================================================
        periods: list[tuple[int, int]] = []
        for period in targetPeriods or []:
            try:
                period_from = int(period[0])
                period_to = int(period[1])
            except Exception:
                continue
            if period_to <= period_from:
                continue
            periods.append((period_from, period_to))
        if not periods:
            return []

        # Đảm bảo các khoảng target period luôn tăng dần để kết quả đầu ra tự động xếp thứ tự
        periods.sort(key=lambda item: (item[0], item[1]))


        #=========================================================================
        # Validate period time
        #=========================================================================        
        first_src = getFirstOhlc(symbol, srcTimeframe)
        last_src  = getLastOhlc(symbol, srcTimeframe)
        if first_src is False or last_src is False:
            return False
        first_src_ts = int(first_src.t)
        last_src_ts  = int(last_src.t)
        source_first_boundary = first_src_ts
        source_last_boundary  = last_src_ts + src_step_ms
        while periods and periods[0][0] < source_first_boundary:
            periods.pop(0)
        while periods and source_last_boundary < periods[-1][1]:
            periods.pop(-1)
        if not periods:
            return []


        #=========================================================================
        # Get data from src
        #=========================================================================        
        min_from = periods[0][0]
        max_to   = periods[-1][1]
        source_rows = getOhlcs(symbol, srcTimeframe, min_from, max_to)
        if source_rows is False:
            return False
        if not source_rows:
            logger.error(
                _SECTION,
                f"aggregateOhlcs({symbol!r}, {srcTimeframe!r}) failed: source rows are missing in {min_from}..{max_to}",
            )
            return False



        #=========================================================================
        # Build ohlc
        #=========================================================================        
        result: list[Ohlc] = []
        j = 0
        src_count = len(source_rows)

        # Áp dụng logic giống hệt như duyệt tick trong hàm mẫu
        for period_from, period_to in periods:
            span_ms = period_to - period_from
            if span_ms <= 0:
                logger.error(
                    _SECTION,
                    f"aggregateOhlcs({symbol!r}, {srcTimeframe!r}) failed: invalid period [{period_from}, {period_to})",
                )
                return False

            if span_ms % src_step_ms != 0:
                logger.error(
                    _SECTION,
                    f"aggregateOhlcs({symbol!r}, {srcTimeframe!r}) failed: period [{period_from}, {period_to}) "
                    f"is not aligned to source step {src_step_ms}ms",
                )
                return False

            expected_count = span_ms // src_step_ms
            bar = Ohlc(t=period_from, o=0, h=0, l=0, c=0, v=0)
            matched_count = 0

            # Bỏ qua các source bar nằm trước khoảng period hiện tại nếu có lệch pha trỏ
            while j < src_count and source_rows[j].t < period_from:
                j += 1

            # Quét gom tất cả các source bar nằm trọn trong [period_from, period_to)
            while j < src_count and period_from <= source_rows[j].t < period_to:
                src_bar = source_rows[j]
                if matched_count == 0:
                    bar.o = src_bar.o
                    bar.h = src_bar.h
                    bar.l = src_bar.l
                    bar.c = src_bar.c
                    bar.v = src_bar.v
                else:
                    if src_bar.h > bar.h: bar.h = src_bar.h
                    if src_bar.l < bar.l: bar.l = src_bar.l
                    bar.c = src_bar.c
                    bar.v += src_bar.v

                matched_count += 1
                j += 1

            if matched_count != expected_count:
                logger.error(
                    _SECTION,
                    f"aggregateOhlcs({symbol!r}, {srcTimeframe!r}) missing source data for period "
                    f"[{period_from}, {period_to}): expected {expected_count}, got {matched_count}",
                )
                return False

            result.append(bar)

        # Khử trùng lặp tuyến tính (do dữ liệu đầu vào và các khoảng period đã sắp xếp sẵn)
        unique_result: list[Ohlc] = []
        last_ts: int | None = None
        for ohlc in result:
            if last_ts == ohlc.t:
                continue
            unique_result.append(ohlc)
            last_ts = ohlc.t

        return unique_result

    except Exception as exc:
        logger.error(
            _SECTION,
            f"aggregateOhlcs({symbol!r}, {srcTimeframe!r}, periods={len(targetPeriods) if targetPeriods is not None else 0}) failed: {exc}",
        )
        return False