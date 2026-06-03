# I. Purpose And Scope
```text
Document name
server-architecture.md

Purpose
├── Define one canonical backend architecture for the Node.js trading server
├── Make Node.js the core application layer and Python the market-data worker layer
├── Remove ambiguity for future implementation by humans and AI code generators
└── Standardize folder structure, module boundaries, ownership rules, and runtime flows

Primary outcome
├── The server must be buildable from this document without inventing new architecture rules
├── The document must be usable as the single source of truth for server-side code generation
├── The document must keep market-data responsibilities separate from user-data responsibilities
└── The document must leave room for later AI-training use without redesign

In scope
├── Node.js backend architecture
├── Python worker architecture
├── Internal Node.js to Python call strategy
├── TimescaleDB and PostgreSQL responsibility split
├── Static asset handling from Node.js
├── API boundaries and realtime delivery
├── Feature-based folder tree
├── Error handling, deduplication, retries, and edge cases
└── Future placeholder for expertAdvisors orchestration

Out of scope
├── Frontend UI design details
├── Exact REST route list
├── Exact SQL schema definitions
├── Exact MQL5 integration code
├── Exact deployment topology
└── Exact CI/CD pipeline
```

## II. Architecture Summary
```text
Core idea

Node.js
├── Core server runtime
├── API gateway for client requests
├── Static asset host for images and application files
├── Owner of user data, app data, cache, and orchestration logic
└── Caller of Python jobs when market data needs to be collected or built

Python
├── Market-data worker layer
├── Connects to MQL5-related data source logic
├── Collects tick data
├── Builds OHLC from tick data when required
└── Writes market data outputs to TimescaleDB only

Databases
├── TimescaleDB
│   ├── Stores tick data
│   ├── Stores OHLC data
│   └── Stores other time-series market data that belongs to market history
└── PostgreSQL
    ├── Stores user data
    ├── Stores app state
    ├── Stores cache and derived non-market data
    └── Stores future AI-training metadata

Client boundary
├── Client talks only to Node.js
├── Client never talks directly to databases
└── Client never calls Python directly

Primary separation rule
├── Market write path belongs to Python
├── User/app write path belongs to Node.js
├── Data presentation belongs to the client
└── Shared logic must be intentionally placed in shared modules, not duplicated casually
```

## III. Tech Stack And Runtime Roles
```text
Runtime stack

Node.js
├── TypeScript-first project
├── Express app layer for HTTP APIs
├── Realtime channel layer for websocket or SSE
├── File serving for static assets
├── Database access for PostgreSQL and read-side access to TimescaleDB
└── Process orchestration for Python jobs

Python
├── Script and worker layer
├── Market ingestion scripts
├── OHLC builder scripts
├── Utility and shared helpers
└── Logging for worker-side execution

Storage
├── TimescaleDB is the source of truth for market series
├── PostgreSQL is the source of truth for application and user data
└── Neither database is treated as a dumping ground for the other domain

TypeScript naming convention
├── Use .ts for application source files
├── Use .js only for generated build output if needed
├── Keep module names descriptive and feature-oriented
└── Keep runtime entrypoint simple and explicit

Entry strategy
├── src/main.ts is the single server entrypoint
├── main.ts creates the app, loads config, starts HTTP listening, and installs process handlers
└── app.ts is optional only if the project later chooses to separate app construction from bootstrapping
```

## IV. Domain Boundaries And Data Ownership
```text
Domain split

1. Market domain
├── Tick data
├── OHLC data
├── Symbol metadata
├── Point size and precision
├── Session open and close rules
└── Derived market range data

Ownership
├── Written by Python
├── Read by Node.js
├── Never edited directly by the client
└── Never stored in PostgreSQL as the primary source of truth

2. User domain
├── Accounts
├── Sessions
├── Profiles
├── Watchlists
├── Notes
├── Tags
├── Alerts
├── Preferences
├── Captures
└── Audit-friendly user actions

Ownership
├── Written by Node.js
├── Read by Node.js and the client
├── Never written by Python in normal operation
└── Stored in PostgreSQL

3. Cache domain
├── Indicator-cache
├── Query-cache
├── Render-cache
├── Derived summaries
└── Temporary materialized app views

Ownership
├── Written by Node.js
├── Safe to rebuild
├── Must have clear invalidation rules
└── Must never be the only source of truth

4. Analysis domain
├── Strategy definitions
├── Strategy settings
├── Shapes
├── Trade records
├── Symbol-scoped analysis state
└── ExpertAdvisor orchestration metadata

Ownership
├── Strategy metadata belongs to PostgreSQL unless it is market history
├── Analysis services belong to Node.js
├── Execution of external helpers belongs to expertAdvisors manager placeholders
└── Market-derived helper data must keep a clean link to its market range
```

## V. Canonical Folder Tree
```text
Project root
server/
├── src/
│   ├── main.ts
│   ├── app/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── paths.ts
│   │   │   └── runtime.ts
│   │   └── bootstrap/
│   │       ├── createApp.ts
│   │       ├── createServer.ts
│   │       └── registerShutdown.ts
│   │
│   ├── modules/
│   │   ├── shared/
│   │   │   ├── logger/
│   │   │   │   ├── logger.ts
│   │   │   │   └── logger.types.ts
│   │   │   ├── errors/
│   │   │   │   ├── AppError.ts
│   │   │   │   ├── ErrorCodes.ts
│   │   │   │   └── normalizeError.ts
│   │   │   ├── time/
│   │   │   │   ├── time.ts
│   │   │   │   └── timezone.ts
│   │   │   ├── validation/
│   │   │   │   ├── schema.ts
│   │   │   │   └── validators.ts
│   │   │   └── constants/
│   │   │       ├── domains.ts
│   │   │       └── statuses.ts
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── mt5Account.ts
│   │   │   │   ├── ggdriveAccount.ts
│   │   │   │   ├── onedriveAccount.ts
│   │   │   │   └── auth.routes.ts
│   │   │   ├── market/
│   │   │   │   ├── MarketInfo.ts
│   │   │   │   ├── RangeData.ts
│   │   │   │   ├── RealtimeData.ts
│   │   │   │   └── market.routes.ts
│   │   │   ├── analysis/
│   │   │   │   ├── strategy.ts
│   │   │   │   ├── expertAdvisors.ts
│   │   │   │   └── analysis.routes.ts
│   │   │   ├── health/
│   │   │   │   └── health.routes.ts
│   │   │   └── static/
│   │   │       └── static.routes.ts
│   │   │
│   │   ├── services/
│   │   │   ├── python-bridge/
│   │   │   │   ├── pythonBridge.ts
│   │   │   │   ├── pythonCommand.ts
│   │   │   │   ├── pythonJobs.ts
│   │   │   │   └── python.types.ts
│   │   │   ├── database/
│   │   │   │   ├── postgres/
│   │   │   │   │   ├── postgresClient.ts
│   │   │   │   │   ├── postgresTx.ts
│   │   │   │   │   └── postgres.types.ts
│   │   │   │   ├── timescale/
│   │   │   │   │   ├── timescaleClient.ts
│   │   │   │   │   └── timescale.types.ts
│   │   │   │   └── dbManager.ts
│   │   │   ├── auth/
│   │   │   │   ├── authService.ts
│   │   │   │   ├── accountService.ts
│   │   │   │   └── sessionService.ts
│   │   │   ├── market/
│   │   │   │   ├── marketService.ts
│   │   │   │   ├── marketQueryService.ts
│   │   │   │   ├── rangeBuilderService.ts
│   │   │   │   └── marketCacheService.ts
│   │   │   ├── analysis/
│   │   │   │   ├── strategyService.ts
│   │   │   │   ├── expertAdvisorsService.ts
│   │   │   │   └── analysisCacheService.ts
│   │   │   ├── realtime/
│   │   │   │   ├── realtimeHub.ts
│   │   │   │   ├── websocketGateway.ts
│   │   │   │   └── eventRouter.ts
│   │   │   ├── storage/
│   │   │   │   ├── fileStorageService.ts
│   │   │   │   └── assetPathService.ts
│   │   │   └── jobs/
│   │   │       ├── jobQueue.ts
│   │   │       ├── jobRunner.ts
│   │   │       └── retryPolicy.ts
│   │   │
│   │   ├── repositories/
│   │   │   ├── postgres/
│   │   │   ├── timescale/
│   │   │   └── index.ts
│   │   │
│   │   ├── middlewares/
│   │   │   ├── authMiddleware.ts
│   │   │   ├── errorMiddleware.ts
│   │   │   ├── requestLogger.ts
│   │   │   └── rateLimitMiddleware.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── id.ts
│   │   │   ├── pagination.ts
│   │   │   ├── retry.ts
│   │   │   └── dedupe.ts
│   │   │
│   │   └── types/
│   │       ├── api.types.ts
│   │       ├── market.types.ts
│   │       └── analysis.types.ts
│   │
│   ├── assets/
│   │   ├── images/
│   │   └── static/
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── e2e/
│
├── python/
│   ├── shared/
│   │   ├── logger.py
│   │   ├── config.py
│   │   ├── errors.py
│   │   └── helpers.py
│   ├── mql5/
│   │   ├── client.py
│   │   ├── tick_reader.py
│   │   └── mt5_adapter.py
│   ├── market/
│   │   ├── auth.py
│   │   ├── market_info.py
│   │   ├── get_tick.py
│   │   ├── get_realtime_tick.py
│   │   ├── build_range.py
│   │   └── build_ohlc.py
│   ├── jobs/
│   │   ├── job_runner.py
│   │   ├── ingest_tick_job.py
│   │   ├── build_range_job.py
│   │   └── sync_job.py
│   └── entrypoints/
│       ├── main.py
│       └── cli.py
│
├── package.json
├── tsconfig.json
├── .env
├── .env.example
└── README.md

Naming rules
├── File names should describe one responsibility
├── Use camelCase for TypeScript source files where the project already uses it
├── Use snake_case only in Python where it is standard
├── Keep route files near feature APIs
└── Keep service files near the business capability they implement
```

## VI. Node.js Application Boundaries
```text
Node.js responsibilities

Public-facing responsibilities
├── Expose HTTP APIs for client requests
├── Expose realtime updates for important state
├── Serve static assets
├── Validate request payloads
└── Return normalized response formats

Business responsibilities
├── Own user data workflows
├── Own analysis workflows
├── Own caching workflows
├── Coordinate market-data reads
└── Orchestrate Python calls when derived market data is missing

Data responsibilities
├── Read market data from TimescaleDB
├── Write user and app data to PostgreSQL
├── Store indicator-cache and derived app caches in PostgreSQL
├── Never write raw market history into PostgreSQL as the canonical market store
└── Never write raw ticks or OHLC directly into TimescaleDB except through the Python-owned path

Process responsibilities
├── Start the app
├── Load environment configuration
├── Manage graceful shutdown
├── Guard worker failures
└── Keep background jobs isolated from request handlers

Static asset responsibilities
├── Serve images, accountInfo files, and other application files
├── Keep asset locations deterministic
├── Prevent direct database involvement for static files
└── Prefer simple file-path rules over complex storage assumptions
```

## VII. Python Worker Boundaries
```text
Python responsibilities

Market collection
├── Read or request tick data from the MQL5-related source
├── Normalize source ticks
├── Preserve timestamps and symbol identity
├── Deduplicate repeated ticks
└── Detect gaps or ordering issues before writing

Market transformation
├── Build OHLC from tick data when required
├── Keep bar construction deterministic
├── Use explicit timeframe rules
├── Preserve source linkage to the underlying ticks
└── Avoid hidden assumptions about timezones or session boundaries

Storage rules
├── Write market data to TimescaleDB only
├── Never own user records
├── Never own app state
├── Never bypass Node.js for client-facing actions
└── Never treat PostgreSQL as a fallback market store

Invocation rules
├── Python scripts may be run as short-lived jobs
├── Python may also run as a longer-lived worker if ingestion needs it
├── Node.js may call Python for build tasks only through the bridge layer
└── Each Python job must have explicit inputs, outputs, logs, and exit status
```

## VIII. Data Flow And Runtime Sequence
```text
Canonical flows

1. Tick ingestion flow
├── Python connects to the market source
├── Python fetches new ticks
├── Python validates symbol, timestamp, and ordering
├── Python deduplicates by source identity and source timestamp
├── Python writes ticks to TimescaleDB
└── Node.js reads the stored series later when the client requests it

2. OHLC build flow
├── Node.js detects that OHLC is missing or stale
├── Node.js calls Python through the bridge layer
├── Python reads source tick data or uses the supplied tick window
├── Python builds OHLC deterministically
├── Python writes OHLC to TimescaleDB
└── Node.js reads the built OHLC and returns it to the client

3. User action flow
├── Client sends request to Node.js
├── Node.js validates auth and payload
├── Node.js writes the change to PostgreSQL
├── Node.js emits an event if the change affects live UI state
└── Client refreshes only the impacted view or slice

4. Static asset flow
├── Client requests an image or file
├── Node.js resolves the path
├── Node.js serves the asset or returns a clear not-found error
└── No database lookup should be required for normal asset delivery

5. Analysis flow
├── Client requests strategy or expertAdvisor data
├── Node.js reads analysis metadata from PostgreSQL
├── Node.js may read market context from TimescaleDB
├── Node.js assembles the response
└── Node.js returns a normalized analysis payload
```

## IX. API, Realtime, And Client Contract
```text
API style

Node.js API
├── Client talks only to Node.js over HTTP
├── Node.js is the only public application entry point
├── APIs should be feature-based, not generic dumping grounds
└── Responses should be normalized and versionable

Realtime style
├── Use websocket or SSE for important live state
├── Push only meaningful updates
├── Keep update payloads small and feature-scoped
└── Fallback to polling where realtime is unnecessary

Client contract
├── Client can request market info, range data, realtime data, strategy data, and account data
├── Client can create or update user-owned data such as notes, tags, watchlists, alerts, and captures
├── Client must not know database topology
└── Client must not know Python execution details

Payload rules
├── All externally visible payloads should have stable field names
├── All time values should define timezone behavior explicitly
├── All lists should support pagination or range limits where data can grow large
└── All mutations should return enough data for the client to update its state without guessing
```

## X. Strategy, Shapes, Trades, And ExpertAdvisors
```text
Strategy domain

Strategy contains
├── ea definitions
├── config values
├── shapes such as lines and Fibonacci objects
├── trade records such as entry price, volume, stop loss, take profit, and time
└── symbol-scoped analysis state

Strategy does not contain
├── Raw market data such as tick, ohlc, or point series
├── Generic user account data
├── Database connection details
└── Python execution logic

expertAdvisors role
├── Treat expertAdvisors as a manager placeholder
├── It may later call ea.exe or ex.py from outside the Node.js process
├── For now, it only defines the boundary and not the final execution contract
├── Do not hardcode future behavior that is not required yet
└── Keep the module ready for later interface expansion

Strategy storage
├── Strategy metadata belongs to PostgreSQL
├── Strategy may reference market windows stored in TimescaleDB
├── Strategy objects should remain serializable
└── Strategy mutations must be versioned or timestamped when history matters
```

## XI. Database Rules And Failure Behavior
```text
TimescaleDB rules
├── Store tick history
├── Store OHLC history
├── Store market series derived from market data
├── Keep write ownership with Python
└── Support range queries and time-window access

PostgreSQL rules
├── Store accounts, profiles, preferences, captures, notes, tags, alerts, indicator-cache, and analysis metadata
├── Keep write ownership with Node.js
├── Support transactional updates
├── Support app-specific indexes and constraints
└── Store only app-owned or user-owned data

Failure behavior
├── If a write fails, the system must report failure clearly
├── Partial writes must be marked incomplete and retried safely
├── Duplicate insert attempts must be idempotent where possible
├── Missing market data must trigger a refresh or build path instead of guessed values
└── Cache misses must be rebuilt or invalidated, not silently reused

Ordering and deduplication
├── Ticks may arrive late or repeated
├── Use source identity plus source timestamp plus symbol identity for deduplication
├── Use explicit ordering rules for OHLC construction
└── Never rely only on arrival order
```

## XII. Reliability, Security, And Performance
```text
Reliability
├── Use graceful shutdown in Node.js
├── Keep worker logs separate from request logs
├── Retry only safe operations
├── Preserve checkpoints for long-running ingestion
└── Make recovery paths explicit

Security
├── Validate all external input at Node.js boundaries
├── Keep client secrets out of public storage
├── Restrict internal Python access to trusted server-to-server paths
├── Separate auth from business logic
└── Keep auditability for important writes

Performance
├── Use range queries for chart data
├── Avoid loading full history when only a visible window is needed
├── Use pagination or chunking for large lists
├── Rebuild cache incrementally when possible
└── Keep Node.js responsive under market-data load

Scalability
├── Scale Python ingestion independently when tick volume grows
├── Scale Node.js independently when client traffic grows
├── Keep TimescaleDB optimized for series queries
└── Keep PostgreSQL optimized for transactional app data
```

## XIII. AI-Training Readiness
```text
Future AI-training support

Goal
├── Preserve enough context to build training datasets later
├── Avoid redesigning the storage model when AI features are added
└── Keep market context and user annotations linkable

Recommended stored metadata
├── Capture labels
├── User corrections
├── Outcome annotations
├── Feature snapshots
├── Replay references
└── Export job metadata

Rules
├── Do not overwrite historical labels in place without versioning
├── Do not lose the link between a capture and the exact market window used
├── Do not mix cleaned training outputs with raw source data
├── Do not assume a future model format now
└── Do preserve provenance and consent boundaries
```

## XIV. Implementation Rules For Coder And AI
```text
Implementation contract

1. Respect ownership
├── Use Python for market ingestion and market transforms
├── Use Node.js for client APIs, app data, and orchestration
├── Use PostgreSQL for app-owned persistent data
└── Use TimescaleDB for market history only

2. Preserve boundaries
├── Do not let the client access databases directly
├── Do not let Node.js become the primary writer of raw market series
├── Do not let Python become the owner of user records
└── Do not let shared utilities hide domain ownership

3. Prefer explicit contracts
├── Define required fields before coding
├── Define error payloads before coding
├── Define retry rules before coding
├── Define deduplication keys before coding
└── Define timezone rules before coding

4. Keep modules feature-based
├── Group code by business capability
├── Keep api, services, repositories, and utilities separated
├── Keep Python scripts organized by job and responsibility
└── Keep shared code genuinely reusable and small

5. Avoid hidden assumptions
├── If data can be missing, define the fallback
├── If data can be duplicated, define the dedupe rule
├── If a process can fail mid-way, define the recovery rule
└── If a module is only a placeholder, say so clearly
```

## XV. Final Required Shape
```text
The server must end up with this final shape

Node.js
├── Core application runtime
├── HTTP API layer
├── Static asset delivery
├── PostgreSQL writer for app data
├── TimescaleDB reader for market data
├── Python bridge caller
└── Realtime event broadcaster

Python
├── Market ingestion worker
├── Tick collector
├── OHLC builder
├── TimescaleDB writer for market data
└── Helper layer for MQL5-related data access

TimescaleDB
├── Tick storage
├── OHLC storage
└── Market history only

PostgreSQL
├── User accounts
├── App state
├── Strategy metadata
├── Indicator-cache
├── Analysis metadata
└── Future training metadata

Client
├── Talks only to Node.js
├── Never accesses databases directly
├── Uses realtime updates for important states
└── Displays market, analysis, and user data
```
