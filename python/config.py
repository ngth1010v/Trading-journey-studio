from pathlib import Path

PORT = 5000


DATABASE_PATH = Path(__file__).parent.parent.resolve() / "server" / "database"

TICK_BATCH_LIMIT = 1000
TICK_DURATION_LIMIT = 2000000 #ms
TICK_DEFAULT_DURATION_OFFSET = 24 * 60 * 60 * 1000 # ms