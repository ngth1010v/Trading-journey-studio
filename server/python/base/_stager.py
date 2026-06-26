from __future__ import annotations

import queue

# =============================================================================
# Global Stage
# =============================================================================

_VALID_TIMEFRAMES = ("1S", "1M", "1H", "1D")

_stages = {
    timeframe: {
        "queue": queue.Queue(),
        "symbols": {}
    }
    for timeframe in _VALID_TIMEFRAMES
}


# =============================================================================
# Internal
# =============================================================================

def _checkTimeframe(timeframe: str) -> None:
    if timeframe not in _VALID_TIMEFRAMES:
        raise ValueError(f"Invalid timeframe: {timeframe}")


def _checkInt(value: int, name: str) -> None:
    if type(value) is not int:
        raise TypeError(f"{name} must be int")


def _checkSymbol(symbol: str) -> None:
    if type(symbol) is not str:
        raise TypeError("symbol must be str")


def _getSymbolStage(timeframe: str, symbol: str) -> dict:
    _checkTimeframe(timeframe)
    _checkSymbol(symbol)

    symbols = _stages[timeframe]["symbols"]

    if symbol not in symbols:
        symbols[symbol] = {
            "from": 0,
            "to": 0,
        }

    return symbols[symbol]


# =============================================================================
# Stage
# =============================================================================

def getFrom(timeframe: str, symbol: str) -> int:
    return _getSymbolStage(timeframe, symbol)["from"]


def getTo(timeframe: str, symbol: str) -> int:
    return _getSymbolStage(timeframe, symbol)["to"]


def setFrom(timeframe: str, symbol: str, fromTs: int) -> None:
    _checkInt(fromTs, "fromTs")
    _getSymbolStage(timeframe, symbol)["from"] = fromTs


def setTo(timeframe: str, symbol: str, toTs: int) -> None:
    _checkInt(toTs, "toTs")
    _getSymbolStage(timeframe, symbol)["to"] = toTs


# =============================================================================
# Queue (shared by all symbols of same timeframe)
# =============================================================================

def getQueue(timeframe: str):
    _checkTimeframe(timeframe)
    return _stages[timeframe]["queue"].get()


def putQueue(timeframe: str, data: dict) -> None:
    _checkTimeframe(timeframe)

    if type(data) is not dict:
        raise TypeError("data must be dict")

    _stages[timeframe]["queue"].put(data)