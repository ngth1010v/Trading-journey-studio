from __future__ import annotations

import os

DB_PATH = "../database/market.duckdb"
MARKET_DIR = "../database/market"
logMode = os.environ.get("READER_LOG_MODE", "")
