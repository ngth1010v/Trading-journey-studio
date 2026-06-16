from __future__ import annotations

from typing import List

import MetaTrader5 as mt5

import _logger as logger

from ._type import Symbol

_SECTION = "symbols/_collector.py"


def getSymbolsFromMt5() -> list[Symbol]:
    """
    Collect symbols from MetaTrader5 and convert them into Symbol records.

    Rules:
    - point = 10 ** digits
    - skip symbols whose digits is missing or <= 0
    - blocking function
    """
    logger.info(_SECTION, "Collecting symbols from MetaTrader5...")

    mt5_symbols = mt5.symbols_get()
    if mt5_symbols is None:
        err = mt5.last_error()
        logger.error(_SECTION, f"mt5.symbols_get() failed: {err}")
        raise RuntimeError(f"mt5.symbols_get() failed: {err}")

    result: list[Symbol] = []
    seen: set[str] = set()

    for mt5_symbol in mt5_symbols:
        name = getattr(mt5_symbol, "name", None)
        if not name or name in seen:
            continue

        symbol_info = mt5.symbol_info(name)
        if symbol_info is None:
            logger.warning(_SECTION, f"Skip symbol '{name}': symbol_info() returned None.")
            continue

        digits = getattr(symbol_info, "digits", None)
        if digits is None or int(digits) <= 0:
            logger.warning(_SECTION, f"Skip symbol '{name}': invalid digits={digits!r}.")
            continue

        point = 10 ** int(digits)
        result.append(Symbol(symbol=name, point=point))
        seen.add(name)

    logger.info(_SECTION, f"Collected {len(result)} symbols from MetaTrader5.")
    return result
