from pathlib import Path

PORT = 5000

DEBUG_MODE = True
MT5_INIT_RETRY = 3

DATABASE_PATH = Path(__file__).parent.parent.resolve() / "database"


# old config
OHLC_BASE_BATCH_LIMIT           = 1200              # 1S ohlcs
OHLC_BASE_DEFAULT_LIMIT         = 60 * 60 * 24      # 1S ohlcs
OHLC_BATCH_LIMIT                = 1000              # ohlcs         



# Auto split file into .paquet every <OHLC_FILE_LIMIT> bar
OHLC_FILE_LIMIT = 2000000 

# Number of 1S-candles for each call to copy_ticks_range from mt5
OHLC_MT5_BATCH = 1200





# Timedelta for each extendFront call if not have data in database yet
OHLC_1S_BASE_DEFAULT_TIME = 60 * 60 * 24 * 2 

# The stage will be updated every <OHLC_BATCH> candles.
# The hightimeframe aggergater will be call every <OHLC_BATCH> candle
OHLC_BATCH = 120
