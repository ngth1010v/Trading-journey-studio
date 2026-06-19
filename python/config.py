from pathlib import Path

PORT = 5000


DATABASE_PATH = Path(__file__).parent.parent.resolve() / "server" / "database"

OHLC_BASE_BATCH_LIMIT           = 1000              # 1S ohlcs
OHLC_BASE_DEFAULT_LIMIT         = 2* 60 * 60 * 24   # 1S ohlcs
OHLC_BATCH_LIMIT                = 1000              # ohlcs         
OHLC_FILE_LIMIT                 = 2000000           # ohlcs