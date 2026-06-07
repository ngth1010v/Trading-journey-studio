from __future__ import annotations

from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[2]
DATABASE_DIR = PROJECT_DIR / "database"
MARKET_DB_PATH = DATABASE_DIR / "market.duckdb"
MARKET_DATA_DIR = DATABASE_DIR / "market"
logMode = ""  # ["", "debug"]
