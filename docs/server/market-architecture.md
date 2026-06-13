# I. Purpose and Scope
```text
This document defines the collector architecture for a 1 server / 1 user / multi web-client system.

Main goal:
- Collect MT5 tick data in Python.
- Build OHLC from tick data only.
- Persist market data in DuckDB + Parquet.
- Expose Python data through Node.js APIs.
- Keep runtime behavior deterministic and easy to implement.

Primary design principle:
- Node.js is the public API boundary.
- Python owns market data collection, aggregation, and storage.
- Node.js never reads market data directly from the database.
```

## 1. System Goals
```text
The architecture must support:
- Real-time tick ingestion.
- Historical tick loading.
- OHLC generation from tick only.
- Lazy on-demand symbol worker startup.
- Automatic worker shutdown after inactivity.
- Batch writing to storage.
- Stable behavior under repeated client requests.

The system must avoid:
- Direct MT5 calls from Node.js.
- Direct database reads from Node.js.
- Recomputing OHLC from MT5.
- Saving every single tick or OHLC row immediately.
```

### A. Final Decisions Locked In
```text
Confirmed design decisions:

1) OHLC is never fetched from MT5.
2) Python builds OHLC only from tick data.
3) Timeframe parsing is handled in Python.
4) Node.js only forwards requests and returns results.
5) Python worker lifecycle is per symbol.
6) A worker stays alive for a configurable idle timeout.
7) Tick and OHLC are flushed in batches.
8) Only closed OHLC is saved to database.
9) The newest not-yet-closed OHLC is always built from RAM plus tick stream.
```

## 2. Non-Goals
```text
This system does not try to:
- Support multi-user permission systems.
- Support multiple database engines at runtime.
- Use MT5 as an OHLC source.
- Build a distributed cluster.
- Guarantee zero-latency market data under all failure conditions.
- Replace Node.js with Python or the reverse.
```

# II. Overall Architecture
```text
server/
├── database/
│   ├── market.db
│   └── market/
├── python/
│   ├── main.py
│   ├── type.py
│   ├── logger.py
│   ├── config.py
│   └── ...
└── src/
    ├── index.ts
    ├── modules/
    │   └── markets/
    └── shared/
```

## 1. Node.js Role
```text
Node.js responsibilities:
- Start Python controller process.
- Forward API requests to Python.
- Return JSON responses to clients.
- Manage shutdown ordering.
- Provide the public HTTP route layer.

Node.js must not:
- Query MT5 directly.
- Rebuild OHLC.
- Read tick/ohlc files directly.
- Bypass Python for market data.
```

### A. Public API Boundary
```text
Node.js exposes:
- /api/markets/symbols
- /api/markets/:symbols
- /api/markets/:symbols/ohlc
- /api/markets/:symbols/last-ohlc

Node.js validates:
- Path parameters.
- Query parameters.
- Timestamp range rules.
- Timeframe format.
- Limit bounds.
```

## 2. Python Role
```text
Python responsibilities:
- Connect to MT5.
- Discover and manage per-symbol workers.
- Load historical tick data.
- Maintain realtime tick stream.
- Build OHLC from ticks.
- Persist market data.
- Serve commands from Node.js.
- Return data batches to Node.js.

Python owns:
- Data freshness.
- Storage batching.
- Symbol worker lifecycle.
- Timeframe alignment logic.
- Tick-to-OHLC aggregation rules.
```

### A. Python Process Model
```text
Python runs as:
- 1 controller process.
- N symbol worker processes.
- 1 worker per active symbol.

Controller duties:
- Receive commands from Node.js.
- Start or stop symbol workers.
- Retry MT5 readiness every 5 seconds when needed.
- Route data requests to the proper worker.
- Track worker idle timeout.
```

## 3. Communication Model
```text
Communication flow:
client -> Node.js -> Python controller -> symbol worker -> storage -> Python -> Node.js -> client

Rules:
- Web requests terminate at Node.js.
- Market data work is delegated to Python.
- Python returns JSON-ready structures.
- Communication should be command based.
- A request may trigger loading, building, or reading.
```

### A. Request Handling Principle
```text
Only call MT5 when a client request requires fresh or missing market data.

That means:
- No background MT5 polling for every symbol all the time.
- No MT5 call from Node.js.
- No automatic OHLC fetch from MT5.
- Tick collection starts only when needed by an API request or worker activation.
```

# III. Repository and Folder Layout
```text
server/
├── database/
│   ├── market.db
│   └── market/
│       └── <symbol>/
│           ├── tick.parquet
│           └── <timeframe>.parquet
├── python/
│   ├── main.py
│   ├── type.py
│   ├── logger.py
│   ├── config.py
│   └── modules/
└── src/
    ├── index.ts
    ├── shared/
    │   └── type.ts
    └── modules/
        └── markets/
            ├── markets.route.ts
            └── ...
```

## 1. Python Files
```text
Direct Python files in python/:
- main.py
- type.py
- logger.py
- config.py

All other Python logic should be split into submodules under python/modules/.
This keeps the root directory stable and easy to import from.
```

### A. Python Root File Responsibilities
```text
main.py:
- Start controller runtime.
- Initialize logging.
- Initialize MT5 connection.
- Start IPC server.

type.py:
- Define dataclasses only.

logger.py:
- Append to python.log.
- Reset log file on startup.

config.py:
- Store ports, paths, timeouts, batch sizes, retry delay, and worker idle timeout.
```

## 2. Node.js Files
```text
Direct Node.js files in src/:
- index.ts

Shared market interfaces in:
- src/shared/type.ts

Market routes and services in:
- src/modules/markets/
```

### A. Node.js Module Boundary
```text
Node.js should separate:
- HTTP route parsing.
- Service calls to Python.
- DTO conversion.
- Validation.
- Shutdown hooks.

The route layer must stay thin.
The service layer should own Python IPC details.
```

# IV. Data Model
```text
Core data types are shared conceptually between Python and Node.js.

All timestamps:
- Use unix seconds as integers.
- Use UTC semantics.
- Never store timezone-aware datetime objects in the core market records.

Price fields:
- Store scaled integer values.
- scaled_value = real_price * point

Volume:
- Tick.volume comes from MT5.
- OHLC.volume is sum of tick volumes in the candle window.
```

## 1. Python Dataclasses
```py
@dataclass(slots=True)
class Tick:
    timestamp: int
    bid: int
    ask: int
    volume: int


@dataclass(slots=True)
class Ohlc:
    openTimestamp: int
    open: int
    high: int
    low: int
    close: int
    volume: int


@dataclass(slots=True)
class SymbolData:
    symbol: str
    point: int
```

### A. Meaning of Each Field
```text
Tick:
- timestamp = tick time in unix seconds.
- bid, ask = scaled integer prices.
- volume = MT5 tick volume.

Ohlc:
- openTimestamp = candle open time in unix seconds.
- open/high/low/close = scaled integer prices.
- volume = total tick volume in the candle.

SymbolData:
- symbol = market symbol name.
- point = price scaling factor for that symbol.
```

## 2. TypeScript Interfaces
```ts
export interface Tick {
    timestamp: number;
    bid: number;
    ask: number;
    volume: number;
}

export interface Ohlc {
    openTimestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface SymbolData {
    symbol: string;
    point: number;
}
```

### A. Serialization Rule
```text
Internally the system uses unix second integers.
At the API boundary, Node.js may convert openTimestamp to a Date only if the client contract requires it.
If the API contract is kept fully numeric, Node.js should serialize the timestamp as an integer instead of Date.
The implementation must choose one representation consistently and never mix both within the same endpoint.
```

# V. Storage Layout
```text
Storage is split into one relational metadata database and one file-based market data store.

database/
├── market.db
└── market/
    └── <symbol>/
        ├── tick.parquet
        └── <timeframe>.parquet
```

## 1. market.db
```text
market.db stores symbol metadata only.

Expected content:
- Symbol name.
- Point value.
- Optional sync flags.
- Optional worker state metadata.
- Optional last update markers.

market.db must not become the primary tick store.
```

### A. Purpose of Metadata DB
```text
Use market.db for:
- Symbol discovery cache.
- Symbol configuration.
- Light control metadata.

Do not use it for:
- Large tick history.
- Large OHLC history.
- Heavy analytic queries if DuckDB Parquet can answer them more efficiently.
```

## 2. Parquet Market Files
```text
Per symbol files:
- tick.parquet
- 1S.parquet, 1M.parquet, 1H.parquet, 1D.parquet, 1W.parquet, 1MN.parquet, 1Y.parquet, and other supported timeframe files.

Rules:
- One symbol owns one directory.
- One timeframe owns one Parquet file.
- Tick and OHLC are appended in batches.
- File writes are handled by Python only.
```

### A. Storage Write Policy
```text
Batch policy:
- Buffer new ticks in RAM.
- Buffer closed OHLC in RAM.
- Flush buffers every 1 minute or when buffer size reaches 100000 rows.
- Use append writes for current data.
- Use insert-like initialization for empty historical bootstrap when needed.

The exact write mode must be chosen by the Python storage layer, but the external behavior must remain batch based.
```

# VI. Symbol Worker Lifecycle
```text
Each active symbol has one Python worker process.

Worker lifecycle:
- Start on demand.
- Receive commands from controller.
- Keep updating a 5 minute idle timer.
- Stop automatically after inactivity.
- Restart cleanly when a new request arrives.
```

## 1. Start Conditions
```text
A worker starts when:
- Node.js asks for a symbol.
- The symbol is not active yet.
- The controller decides the symbol requires data access.

The worker should initialize:
- Symbol metadata.
- Tick state.
- OHLC state.
- Storage handles if needed.
- MT5 access if MT5 is ready.
```

### A. Idle Timeout Rule
```text
Idle timeout behavior:
- Each worker has last_access_time.
- Each valid command refreshes last_access_time.
- If no command is received for 5 minutes, the worker shuts down.
- On next access, the controller starts it again.

The timeout value must come from config.py.
```

## 2. Shutdown Conditions
```text
A worker shuts down when:
- It is idle longer than the configured timeout.
- The controller requests a controlled stop.
- The parent controller is stopping.
- MT5 becomes unavailable for a terminal failure state.
```

### A. Shutdown Safety
```text
Before exit, the worker should:
- Flush pending tick buffers.
- Flush pending OHLC buffers.
- Release MT5 handles.
- Release file handles.
- Emit a clean stop log message.
```

# VII. Market Data Pipeline
```text
Data pipeline order:
MT5 -> Python tick loader -> Python tick buffer -> Python OHLC builder -> Python storage -> Node.js API -> client

Important rule:
- Tick is the source of truth.
- OHLC is derived from tick.
- Closed OHLC can be persisted.
- Current OHLC can be returned from RAM even before close.
```

## 1. Tick Loading
```text
Tick loading strategy:
- Request tick batches from MT5.
- Use a batch size of 10000 ticks per call.
- Repeat until enough data is collected.
- Save in batches when the buffer reaches 100000 ticks or on flush timeout.

Two cases:
- Historical bootstrap.
- Current realtime extension.

The same loader may serve both cases, but the storage target and range handling may differ.
```

### A. Missing Historical Tick Data
```text
When historical tick data is missing:
- Repeatedly call MT5 for older ranges.
- Keep loading until the requested range is covered.
- Insert the recovered ticks into storage.
- Return only the requested slice to the caller.

Historical loading should prefer deterministic range coverage over minimum number of MT5 calls.
```

## 2. Current Tick Data
```text
When current tick data is missing:
- Repeatedly request recent ticks from MT5.
- Buffer incoming ticks in RAM.
- Append them to storage in batches.
- Keep the latest state in memory for OHLC construction.

The current stream must never be blocked by delayed disk flushes.
```

## 3. OHLC Building
```text
OHLC must be built from tick data only.

For each requested timeframe:
- Read ticks covering the needed range.
- Build closed candles from tick stream.
- Keep the latest in-progress candle in memory.
- Save only closed candles to Parquet.
- Return the in-progress candle only when the API asks for last-ohlc.

Missing tick coverage must trigger tick loading first.
```

### A. No-Tick Candle Rule
```text
If a candle window has no ticks:
- Still create the candle.
- open = high = low = close.
- volume = 0.

This rule applies to both historical and realtime building.
```

# VIII. Timeframe Rules
```text
Timeframe is a string and must be uppercase.

Supported canonical forms:
- <number>S
- <number>M
- <number>H
- <number>D
- <number>W
- <number>MN
- <number>Y

Only one unit type is allowed per timeframe string.
Examples:
- 1S
- 5M
- 1H
- 1D
- 1W
- 1MN
- 1Y

Invalid example:
- 1H5M
```

## 1. Parsing Rules
```text
The parser must:
- Reject mixed-unit strings.
- Reject lowercase input unless normalization is explicitly added.
- Reject zero or negative values.
- Reject unsupported suffixes.
- Return a normalized internal duration rule.
```

### A. Alignment Rules
```text
Alignment must use unix-second arithmetic.

Seconds:
- 1 <= timeframe < 60
- openTimestamp = floor(currentTimestamp / timeframe) * timeframe

Minutes:
- 60 <= timeframe < 3600
- timeframe must be divisible by 60
- openTimestamp = floor(currentTimestamp / timeframe) * timeframe

Hours:
- 3600 <= timeframe < 86400
- timeframe must be divisible by 3600
- openTimestamp = floor(currentTimestamp / timeframe) * timeframe

Days:
- 86400 <= timeframe < 2419200
- timeframe must be divisible by 86400
- openTimestamp = floor(currentTimestamp / timeframe) * timeframe

Longer day-based windows:
- 2419200 <= timeframe < 31536000
- timeframe must still be divisible by 86400
- openTimestamp = floor(currentTimestamp / timeframe) * timeframe
```

## 2. Candle Finalization Rule
```text
A candle is closed when:
- The current timestamp moves into the next candle window.
- The builder has enough tick evidence to finalize the previous window.

Only closed candles are persisted as permanent OHLC rows.
The newest candle remains in RAM until it closes.
```

# IX. API Contract
```text
Node.js exposes the public market API.
All responses are JSON.
All requests must be validated before reaching Python.
```

## 1. Symbol APIs
```text
GET /api/markets/symbols

Returns:
- A list of symbol names only.

Source order:
- Prefer MT5 when available.
- Fall back to local database when MT5 is not ready.

The response must not return SymbolData objects for this endpoint.
```

### A. Single Symbol API
```text
GET /api/markets/:symbols

Returns:
- The SymbolData for the requested symbol.

Source order:
- Prefer MT5 when available.
- Fall back to local database.

If the symbol does not exist anywhere, return a proper not-found response.
```

## 2. OHLC Range API
```text
GET /api/markets/:symbols/ohlc?timeframe=<timeframe>&from=<fromTimestamp>&to=<toTimestamp>

GET /api/markets/:symbols/ohlc?timeframe=<timeframe>&from=<fromTimestamp>&limit=<limit>

GET /api/markets/:symbols/ohlc?timeframe=<timeframe>&to=<toTimestamp>&limit=<limit>
```

### A. OHLC Range Semantics
```text
Range rules:
- from is inclusive.
- to is exclusive.
- only closed OHLC rows are returned.

Range behavior:
- from + to -> strict bounded interval.
- from + limit -> start near fromTimestamp and return forward.
- to + limit -> end near toTimestamp and return backward.

The API may include the nearest candles around the requested boundary if required by the request semantics.
```

## 3. Last OHLC API
```text
GET /api/markets/:symbols/last-ohlc?timeframe=<timeframe>

Returns:
- Exactly 1 OHLC object.
- The newest candle, including the not-yet-closed in-memory candle when available.

This endpoint should prefer RAM state first and storage second.
```

### A. Response Shape Rule
```text
Each API endpoint must return stable JSON shapes.

Examples:
- symbol list -> string[]
- symbol -> SymbolData
- OHLC range -> Ohlc[]
- last ohlc -> Ohlc

Do not mix array and object responses for the same endpoint.
```

# X. Runtime Workflow
```text
Startup sequence:
1. Node.js starts.
2. Node.js launches Python controller.
3. Python initializes logger.
4. Python resets python.log if required by startup policy.
5. Python attempts MT5 init.
6. If MT5 is not ready, Python warns Node.js and keeps retrying every 5 seconds.
7. Once MT5 is ready, Python accepts commands.
```

## 1. Request Workflow
```text
When a client calls an API:
1. Client sends request to Node.js.
2. Node.js validates input.
3. Node.js sends command to Python.
4. Python ensures the symbol worker is active.
5. Python loads missing tick data if needed.
6. Python builds missing OHLC if needed.
7. Python returns a batch of one list or one object.
8. Node.js returns JSON to the client.
```

### A. Data Missing Branch
```text
If the requested data is incomplete:
- Load tick data first.
- Build OHLC from tick second.
- Store newly closed rows.
- Return the requested data after the pipeline completes.

The caller should not need to know which internal step was required.
```

## 2. Shutdown Workflow
```text
When server shutdown begins:
1. Node.js stops accepting new requests.
2. Node.js tells Python to stop.
3. Python flushes worker buffers.
4. Python closes MT5.
5. Python closes its server.
6. Node.js exits cleanly.

Shutdown order matters:
- flush before close
- close before exit
```

# XI. Logging
```text
Logging is file based and append only.

Log file:
- python.log

Required format:
- timestamp [LEVEL][SECTION] message

Example:
- 2026-06-13 12:00:00 [INFO][controller] worker started
```

## 1. Logger Behavior
```text
Logger functions:
- reset()
- debug(section, message)
- info(section, message)
- warning(section, message)
- error(section, message)

Behavior rules:
- reset() clears or creates python.log.
- All writes append.
- Logging must be thread-safe.
- Logging should not crash the market pipeline.
```

### A. Logging Policy
```text
Recommended log events:
- startup
- MT5 ready / not ready
- worker start
- worker stop
- tick load start
- tick load finish
- OHLC build start
- OHLC build finish
- storage flush
- API error
- validation error
- shutdown begin
- shutdown finish
```

# XII. Error Handling and Edge Cases
```text
The implementation must explicitly handle common edge cases instead of assuming ideal input.
```

## 1. MT5 Unavailable
```text
If MT5 is not ready:
- Keep the controller alive.
- Return a warning state to Node.js.
- Retry initialization every 5 seconds.
- Do not hard crash the server.
```

### A. Request During MT5 Downtime
```text
If a request needs fresh market data while MT5 is unavailable:
- Use already stored data if possible.
- Return partial or stale data only if the API contract allows it.
- Otherwise return a clean error response.
- Never hang the request indefinitely.
```

## 2. Missing Data Ranges
```text
If the requested range is not fully present in storage:
- Load the missing ticks.
- Rebuild the required OHLC.
- Fill gaps according to the no-tick candle rule.
- Return the best complete result available.
```

### A. Invalid Input
```text
Reject:
- Empty symbol names.
- Invalid timeframe strings.
- Negative timestamps.
- from >= to when both are present.
- limit <= 0.
- Unsupported timeframe suffixes.
- Requests that would require impossible range expansion.
```

## 3. Concurrency Edge Cases
```text
If multiple requests arrive for the same symbol:
- The controller should deduplicate or serialize conflicting load/build operations.
- The worker should not start multiple identical MT5 loads for the same range.
- Duplicate flushes should be safe.
```

### A. Data Consistency
```text
When the same symbol is updated by multiple requests:
- Use a single authoritative in-memory state per active worker.
- Serialize writes to the same parquet file.
- Final candle state must remain monotonic and deterministic.
```

# XIII. Implementation Notes
```text
The code should be built so that:
- Python is the market engine.
- Node.js is the transport and API layer.
- Shared types stay small and stable.
- Storage code is isolated from business logic.
- Timeframe logic is testable in isolation.

Recommended internal module split:
- controller
- worker
- mt5 adapter
- tick loader
- ohlc builder
- storage adapter
- router
- validator
- ipc client/server
```

## 1. Testing Focus
```text
High-value tests:
- timeframe parsing
- timeframe alignment
- candle finalization
- no-tick candle generation
- batch flush trigger
- worker timeout
- MT5 retry loop
- request validation
- range boundary semantics
- last-ohlc behavior
```

### A. Determinism Requirement
```text
Given the same tick sequence and timeframe:
- OHLC output must be identical across runs.
- Closing rules must not depend on wall-clock jitter beyond the defined alignment logic.
- Storage writes must not change computed market values.
```

## 2. Coding Constraints
```text
Keep these constraints during implementation:
- Use plain shared type names without I-prefix in TypeScript.
- Keep Python direct files limited to the required root files.
- Keep Node.js route files thin.
- Keep all market data retrieval behind Python.
- Prefer explicit behavior over implicit heuristics.
```
