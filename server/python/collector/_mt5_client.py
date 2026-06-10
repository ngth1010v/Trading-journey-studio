from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import logger

from ._datetime_utils import utc_datetime_to_mt5


class MT5ImportError(RuntimeError):
    pass


@dataclass(slots=True)
class MT5Client:
    mt5: Any

    @classmethod
    def load(cls) -> "MT5Client":
        logger.info("collector.mt5", "loading MetaTrader5 module")

        try:
            import MetaTrader5 as mt5  # type: ignore
        except Exception as exc:  # pragma: no cover
            logger.error(
                "collector.mt5",
                f"failed to import MetaTrader5: {exc}",
            )
            raise MT5ImportError(
                "MetaTrader5 package is not installed or cannot be imported."
            ) from exc

        logger.info("collector.mt5", "MetaTrader5 module loaded")
        return cls(mt5=mt5)

    def copy_ticks_range(self, symbol: str, from_dt, to_dt):
        return self.mt5.copy_ticks_range(symbol, from_dt, to_dt, self.mt5.COPY_TICKS_ALL)

    def copy_ticks_from(self, symbol: str, from_dt, count: int):
        return self.mt5.copy_ticks_from(symbol, from_dt, count, self.mt5.COPY_TICKS_ALL)

    def symbols_get(self):
        return self.mt5.symbols_get()

    def symbol_info(self, symbol: str):
        return self.mt5.symbol_info(symbol)

    def symbol_select(self, symbol: str, enable: bool = True):
        return self.mt5.symbol_select(symbol, enable)

    def last_error(self):
        return self.mt5.last_error()

    def normalize_datetime(self, dt):
        return utc_datetime_to_mt5(dt)