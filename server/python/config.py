from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SERVER_DIR = ROOT_DIR.parent
DATABASE_DIR = SERVER_DIR / "database"
MARKET_DB_PATH = DATABASE_DIR / "market.db"
MARKET_DIR = DATABASE_DIR / "market"
PYTHON_LOG_PATH = ROOT_DIR / "python.log"

IPC_HOST = "127.0.0.1"
IPC_PORT = 18765

HTTP_HOST = "127.0.0.1"
HTTP_PORT = 3000

BATCH_FLUSH_SECONDS = 60
BATCH_FLUSH_SIZE = 100_000
WORKER_IDLE_TIMEOUT_SECONDS = 300
MT5_RETRY_SECONDS = 5
REQUEST_TIMEOUT_SECONDS = 30
MAX_LIMIT = 10_000

# Toggle this file directly instead of environment variables.
# True  -> demo mode with deterministic local data
# False -> try to use the local MT5 terminal
DEMO_MODE = False

# When demo mode starts, clear old demo files so the API returns fresh data.
DEMO_RESET_ON_STARTUP = True

DEFAULT_POINT = 100_000

DEMO_SYMBOLS: dict[str, int] = {
    "EURUSD": 100_000,
    "USDJPY": 1_000,
    "XAUUSD": 100,
    "NAS100": 1,
}

SUPPORTED_TIMEFRAME_SUFFIXES = ("S", "M", "H", "D", "W", "MN", "Y")
