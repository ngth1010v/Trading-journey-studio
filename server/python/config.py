from pathlib import Path

PORT = 5000

DEBUG_MODE = True
MT5_INIT_RETRY = 3

DATABASE_PATH = Path(__file__).parent.parent.resolve() / "database"

#==========================================================================
# BASE
#==========================================================================
# Timedelta for each extendFront call if not have data in database yet
OHLC_1S_BASE_DEFAULT_TIME = 60 * 60 * 24 * 2 

# The stage will be updated every <OHLC_BATCH> candles.
# The hightimeframe aggergater will be call every <OHLC_BATCH> candle
OHLC_BATCH = 120

# Number of requests for MT5 = <OHLC_BATCH> * <OHLC_MT5_EXTEND_PART>
OHLC_MT5_EXTEND_PART = 20


#==========================================================================
# OHLC STORER
#==========================================================================
OHLC_STORER_HOT_LIMIT            = 4_000_000
OHLC_STORER_HOT_PREVENTION_LIMIT = 16_000_000
OHLC_STORER_HOT_WAIT_DURATION    = 1000 * 60 * 5  #5 min


