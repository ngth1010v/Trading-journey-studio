# Database structure

The reader is read-only. It reads the same storage root used by the writer.

## Root folder

```text
database/
├── market.duckdb
└── market/
    └── <symbol>/
        ├── ticks.parquet
        └── <timeframe>.parquet
```

## `market.duckdb`

Stores only `SymbolData`.

| table | columns |
|---|---|
| `SymbolData` | `symbol TEXT PRIMARY KEY`, `point INTEGER NOT NULL` |

## `database/market/<symbol>/ticks.parquet`

Stores one symbol's ticks.

| column | type | meaning |
|---|---|---|
| `timestamp` | TIMESTAMP | naive UTC datetime |
| `bid` | BIGINT | bid price value |
| `ask` | BIGINT | ask price value |
| `volume` | BIGINT | volume |

## `database/market/<symbol>/<timeframe>.parquet`

Stores one symbol's OHLC data for one timeframe.

| column | type | meaning |
|---|---|---|
| `openTimestamp` | TIMESTAMP | naive UTC datetime |
| `open` | BIGINT | open price |
| `high` | BIGINT | high price |
| `low` | BIGINT | low price |
| `close` | BIGINT | close price |
| `volume` | BIGINT | volume |

## Reader behavior

- `GetTickByTimestamp` and `GetTickByDatetime` return a single tick or `null`.
- `GetOhlcsByTimestamp` and `GetOhlcsByDatetime` return a list of OHLC rows starting from the given point.
- Range queries use `[from, to)` boundaries.
- On missing data, the reader logs an error and returns `null`.
- `GetOhlcFromTick...` returns one synthetic OHLC value built from matching ticks.
- `GetOhlcFromOhlc...` returns one synthetic OHLC value built from matching OHLC rows across the selected timeframe range.
