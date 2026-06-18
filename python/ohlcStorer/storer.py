
from __future__ import annotations

from . import _reader, _writer
from _type import Ohlc, OhlcRequest

#============================================================================================================
# WRITER
#============================================================================================================
# Append OHLC batches to the newest-side hot database, then flush to cold parquet when needed.
def appendOhlcs(symbol: str, timeframe: str, list_of_ohlcs: list[Ohlc]) -> bool:
    return _writer.appendOhlcs(symbol, timeframe, list_of_ohlcs)


# Prepend OHLC batches to the oldest-side hot database, then flush to cold parquet when needed.
def prependOhlcs(symbol: str, timeframe: str, list_of_ohlcs: list[Ohlc]) -> bool:
    return _writer.prependOhlcs(symbol, timeframe, list_of_ohlcs)


#============================================================================================================
# READER
#============================================================================================================
# Get the earliest OHLC record across hot and cold storage.
def getFirstOhlc(symbol: str, timeframe: str):
    return _reader.getFirstOhlc(symbol, timeframe)


# Get the latest OHLC record across hot and cold storage.
def getLastOhlc(symbol: str, timeframe: str):
    return _reader.getLastOhlc(symbol, timeframe)


# Read OHLC records in the half-open range [fromTs, toTs).
def getOhlcs(symbol: str, timeframe: str, fromTs, toTs):
    return _reader.getOhlcs(symbol, timeframe, fromTs, toTs)


# Aggregate OHLC fields from stored OHLC bars inside the half-open range [fromTs, toTs).
def getOhlc(symbol: str, timeframe: str, fromTs, toTs):
    return _reader.getOhlc(symbol, timeframe, fromTs, toTs)


# Return True when there is no OHLC data for the given symbol/timeframe.
def IsEmpty(symbol: str, timeframe: str):
    return _reader.IsEmpty(symbol, timeframe)
