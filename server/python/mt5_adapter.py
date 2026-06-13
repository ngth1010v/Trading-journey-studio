from __future__ import annotations

from dataclasses import dataclass

from config import DEMO_MODE, DEMO_SYMBOLS
from logger import info, warning
from type import SymbolData

try:
    import MetaTrader5 as _mt5  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    _mt5 = None


@dataclass(slots=True)
class Mt5Status:
    enabled: bool
    ready: bool
    message: str


class Mt5Adapter:
    def __init__(self) -> None:
        self._demo_mode = bool(DEMO_MODE)
        self._enabled = (not self._demo_mode) and (_mt5 is not None)
        self._ready = False

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def demo_mode(self) -> bool:
        return self._demo_mode

    def initialize(self) -> Mt5Status:
        if self._demo_mode:
            self._ready = False
            return Mt5Status(enabled=False, ready=False, message="demo mode")

        if not self._enabled:
            self._ready = False
            return Mt5Status(enabled=False, ready=False, message="MetaTrader5 package unavailable")

        ok = bool(_mt5.initialize())
        self._ready = ok
        if ok:
            info("mt5", "MT5 connection ready")
            return Mt5Status(enabled=True, ready=True, message="ready")

        warning("mt5", "MT5 initialization failed")
        return Mt5Status(enabled=True, ready=False, message="init failed")

    def shutdown(self) -> None:
        if self._enabled and self._ready:
            try:
                _mt5.shutdown()
            finally:
                self._ready = False

    def list_symbols(self) -> list[str]:
        if not self._enabled or not self._ready:
            return list(DEMO_SYMBOLS.keys())

        symbols = _mt5.symbols_get()
        if not symbols:
            return list(DEMO_SYMBOLS.keys())
        return sorted({item.name for item in symbols if getattr(item, "name", "")})

    def get_symbol(self, symbol: str) -> SymbolData | None:
        if not self._enabled or not self._ready:
            point = DEMO_SYMBOLS.get(symbol.upper())
            if point is None:
                return None
            return SymbolData(symbol=symbol.upper(), point=point)

        info_obj = _mt5.symbol_info(symbol)
        if info_obj is None:
            return None

        point = int(round(1 / info_obj.point)) if info_obj.point else DEMO_SYMBOLS.get(symbol.upper(), 100_000)
        if point <= 0:
            point = DEMO_SYMBOLS.get(symbol.upper(), 100_000)
        return SymbolData(symbol=info_obj.name, point=point)
