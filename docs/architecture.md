# I. Purpose And Scope
```text
app-architecture.md

Purpose
├── Define the common architecture for a trading capture web app
├── Keep the document generic enough to guide both implementation and AI-assisted code generation
└── Avoid server/client folder-level details while still making system boundaries explicit

In scope
├── Web application architecture
├── Data flow between Python, Node.js, TimescaleDB, PostgreSQL, and the React client
├── Realtime update strategy
├── Data ownership and write rules
├── Core interaction and failure behavior
└── Future readiness for AI-training workflows

Out of scope
├── Exact folder structure of server or client codebases
├── Detailed UI layout of individual pages
├── Database DDL for every table
├── Exact API route list
└── Exact implementation of MQL5 integration code
```

## 1. Product Summary

```text
The app is a trading capture platform with a separated data pipeline:

Python
├── Connects to MQL5-related data collection
├── Receives tick data from the trading source
├── Converts tick data into OHLC when needed
└── Writes market data only into TimescaleDB

Node.js server
├── Reads market data from TimescaleDB
├── Writes user-owned data into PostgreSQL
├── Manages application logic for the web app
├── Coordinates realtime delivery to the client
└── May request Python to build OHLC from tick data when the app needs derived market data

React + Vite + TypeScript client
├── Displays charting and user workflows
├── Subscribes to live updates
├── Sends user actions to Node.js
└── Never talks directly to databases

Storage
├── TimescaleDB
│   ├── Stores tick data
│   └── Stores OHLC data
└── PostgreSQL
    ├── Stores user data
    ├── Stores indicator-cache
    ├── Stores captures, notes, tags, watchlists, alerts, and related app data
    └── Stores future AI-training related metadata and exports
```

## 2. System Principles

```text
The architecture should follow these principles:

1. Separation of ownership
├── Python owns market-data ingestion and market-data writing
├── Node.js owns application data writing
└── The client owns presentation only

2. Clear data boundaries
├── Market data lives in TimescaleDB
├── User and application data live in PostgreSQL
└── Derived values must have a defined owner before implementation

3. Minimal coupling
├── Client does not know database details
├── Node.js should not depend on UI behavior
└── Python should not depend on user-session logic

4. Realtime where useful
├── Live chart and capture state updates should be pushed to the client
├── Non-critical data can be polled or refreshed on demand
└── Avoid overengineering where polling is sufficient

5. Deterministic behavior
├── The same input data should produce the same stored output
├── Duplicate writes must be handled safely
└── Data recovery should not rely on manual repair whenever possible

6. Future extensibility
├── Keep the architecture ready for AI-training datasets later
├── Preserve traceability between source data and user actions
└── Prefer metadata-rich storage over lossy simplification
```

## 3. High-Level Architecture

```text
System overview

[ MQL5 / trading source ]
        |
        v
[ Python ingestion and transform layer ]
        |
        v
[ TimescaleDB: tick + OHLC market storage ]
        |
        v
[ Node.js application server ]
              / \
             /   \
            v     v
[ PostgreSQL ]   [ Realtime channel ]
(user data)          |
                     v
             [ React + Vite + TS client ]

Responsibility flow
├── Python collects and prepares market data
├── TimescaleDB persists market history
├── Node.js reads market history and manages app state
├── PostgreSQL persists all user-facing app records
└── Client renders views and sends user intent back to Node.js
```

## 4. Component Responsibilities

```text
A. Python data layer
├── Connect to the trading source through MQL5-related data access
├── Receive tick data reliably
├── Build OHLC from tick when needed
├── Validate temporal order and consistency before writing
├── Write only to TimescaleDB
└── Expose a callable interface for Node.js when Node.js asks for OHLC generation

B. Node.js application layer
├── Serve the web app backend
├── Authenticate and manage user sessions if authentication is enabled
├── Read market data from TimescaleDB
├── Write user data to PostgreSQL
├── Write indicator-cache and other derived app-level cache to PostgreSQL
├── Coordinate websocket or SSE updates
└── Orchestrate business rules that combine market data and user data

C. React client
├── Present charts, captures, watchlists, notes, alerts, and related views
├── Keep UI state responsive
├── Subscribe to live updates for important data
├── Use pagination, filtering, and lazy loading for large datasets
└── Never own source-of-truth business rules

D. TimescaleDB
├── Source of truth for tick and OHLC market series
├── Optimized for time-series queries
├── Must not receive writes from Node.js in normal operation
└── Can serve historical market queries through Node.js only

E. PostgreSQL
├── Source of truth for user-generated and app-generated non-market data
├── Stores user profiles, captures, notes, tags, watchlists, alerts, settings, indicator-cache, and future training metadata
├── Must not be used as the primary store for raw ticks or OHLC
└── Supports transactional consistency for user workflows
```

## 5. Data Domains

```text
Data is split into clear domains.

1. Market data domain
├── Tick
├── OHLC
├── Symbol metadata
├── Market session boundaries
└── Derived market aggregates

Rules
├── Stored in TimescaleDB
├── Written by Python only
├── Read by Node.js for client delivery
└── Must keep timestamps, source identity, and symbol identity

2. User data domain
├── User accounts
├── Preferences
├── Watchlists
├── Notes
├── Tags
├── Alerts
├── Capture records
├── Audit records
└── UI state that must persist across sessions

Rules
├── Stored in PostgreSQL
├── Written by Node.js
├── Read by Node.js and exposed to client
└── Must be owned by a user or by a defined shared scope

3. Cache and derived app data domain
├── Indicator-cache
├── Query cache
├── Render cache
├── Computed summaries
└── Temporary materialized app views

Rules
├── Stored in PostgreSQL unless a stronger reason exists
├── Must be safe to rebuild
├── Must have explicit invalidation behavior
└── Must never be treated as the only source of truth

4. Future AI-training domain
├── Capture labels
├── User corrections
├── Outcome annotations
├── Replay metadata
├── Feature snapshots
└── Training export bundles

Rules
├── Store enough metadata to reconstruct context later
├── Keep provenance information
├── Do not mix raw labels with irreversible transformations
└── Preserve consent and access boundaries
```

## 6. Data Ownership And Write Rules

```text
Write ownership matrix

┌───────────────────────────────┬──────────┬────────────┬──────────────┐
│ Data type                     │ Python   │ Node.js    │ Client       │
├───────────────────────────────┼──────────┼────────────┼──────────────┤
│ Tick data                     │ Write    │ Read only  │ No direct IO │
│ OHLC data                     │ Write    │ Read only  │ No direct IO │
│ User profile                  │ No       │ Write      │ Read via API │
│ Watchlist                     │ No       │ Write      │ Read via API │
│ Notes and tags                │ No       │ Write      │ Read via API │
│ Alerts                        │ No       │ Write      │ Read via API │
│ Indicator-cache               │ No       │ Write      │ Read via API │
│ Capture records               │ No       │ Write      │ Read via API │
│ AI-training metadata          │ No       │ Write      │ Read via API │
└───────────────────────────────┴──────────┴────────────┴──────────────┘

Required enforcement rules
├── Python must never write PostgreSQL in normal operation
├── Node.js must never write tick or OHLC into TimescaleDB in normal operation
├── Node.js may request Python to generate OHLC from tick when the data pipeline requires it
├── The client must never connect directly to either database
└── Any exception must be explicit, documented, and logged

Edge-case handling
├── If Node.js needs a market value that is missing in TimescaleDB, it should request a refresh path instead of inventing data
├── If Python receives duplicate ticks, deduplicate by source timestamp and source identity
├── If a write fails after partial processing, the system must mark the operation as incomplete and retry safely
└── If cache data becomes stale, it must be recomputed or invalidated rather than silently reused
```

## 7. Core Runtime Flows

```text
A. Market ingestion flow
├── Python connects to the trading source
├── Python receives ticks
├── Python validates sequence, timestamp, and symbol mapping
├── Python stores ticks in TimescaleDB
├── Python derives OHLC when needed and stores OHLC in TimescaleDB
└── Node.js later reads the market data for UI requests

B. User action flow
├── Client sends an action to Node.js
├── Node.js validates authentication and payload
├── Node.js updates PostgreSQL
├── Node.js returns the new state to the client
└── If the change affects live UI state, Node.js broadcasts an update

C. Capture workflow flow
├── User opens a market context
├── Client requests market data from Node.js
├── Node.js fetches from TimescaleDB
├── User creates notes, tags, captures, or alerts
├── Node.js stores them in PostgreSQL
└── Client updates immediately after success

D. Realtime update flow
├── Node.js maintains a live channel to the client
├── Important events are pushed to subscribed views
├── Examples include capture changes, alert triggers, and live data readiness
└── Less important changes may be refreshed by polling or explicit reload

E. Derived-data flow
├── Node.js needs derived OHLC or another derived series
├── Node.js first checks whether the data already exists
├── If not, Node.js may call Python to build it
├── Python writes the derived market result to TimescaleDB
└── Node.js then reads the result and continues the workflow
```

## 8. Realtime And Sync Strategy

```text
Realtime behavior

What should be realtime
├── Active chart updates
├── Capture creation and update feedback
├── Alert triggers
├── Connection status
└── Background job completion notices

What can be deferred
├── Historical refresh
├── Cache warm-up
├── Batch imports
├── Non-urgent reports
└── Admin-level summaries

Preferred sync pattern
├── Client sends intent to Node.js
├── Node.js confirms persistence
├── Node.js emits a change event
├── Client updates the visible state
└── Client refetches only the affected data slice

Conflict handling
├── Last write must not silently overwrite important user edits
├── For editable records, include version or updated-at checks
├── For append-only records, preserve history
└── For caches, rebuild rather than merge when conflicts are unclear
```

## 9. Reliability And Edge Cases

```text
The architecture must account for the following situations:

1. Data source failure
├── MQL5 source unavailable
├── Python worker disconnected
├── Partial tick ingestion
└── Recovery should resume from last safe cursor or checkpoint

2. Database availability failure
├── TimescaleDB temporarily unavailable
├── PostgreSQL temporarily unavailable
├── Read-only fallback when appropriate
└── Writes must fail clearly and not pretend success

3. Duplicate or out-of-order data
├── Repeated ticks
├── Late-arriving ticks
├── Clock drift
└── Must be handled with explicit deduplication and ordering rules

4. User workflow interruption
├── Browser refresh
├── Websocket disconnect
├── Slow network
├── Concurrent edits from multiple sessions
└── Session recovery should preserve unsaved intent when possible

5. Cache invalidation problems
├── Stale indicator-cache
├── Missing cache rows
├── Partial cache rebuild
└── Safe fallback is recompute or refetch, not silent reuse

6. Large-data behavior
├── Very large history loads
├── Heavy chart zooming and panning
├── Bulk capture imports
└── Must use paging, range queries, and lazy loading

7. Data integrity problems
├── Invalid symbol mapping
├── Missing timestamps
├── Wrong timezone interpretation
├── Corrupted payloads
└── Reject bad data early with clear error records
```

## 10. Security And Access Control

```text
Security assumptions

Authentication
├── User identity should be checked in Node.js
├── Session or token handling should stay in the application layer
└── The client must not store sensitive long-lived secrets in an unsafe way

Authorization
├── Read access and write access must be separated when needed
├── Shared resources need explicit scope rules
├── Admin operations must be isolated
└── Future role-based access control should be possible without redesign

Data access
├── Client never reaches databases directly
├── Node.js is the only public application entry point for user actions
├── Python is an internal service
└── Internal service calls must be trusted only on a restricted network or equivalent protection

Auditability
├── Important writes should be traceable
├── User edits should be attributable
├── Automated imports should be distinguishable from manual actions
└── Failure logs should preserve enough context to debug safely
```

## 11. Scalability And Performance

```text
Performance goals

Market data
├── Fast ingest of tick data
├── Fast range queries for charts
├── Efficient OHLC aggregation
└── Partitioning and time-series indexing are expected

Application data
├── Low-latency user edits
├── Fast lookup for captures, tags, and alerts
├── Cache where useful
└── Keep transactional work in PostgreSQL

Client performance
├── Avoid loading full history when only a window is needed
├── Prefer incremental updates over full re-renders
├── Virtualize large lists where necessary
└── Keep chart and table queries bounded

Scaling path
├── Scale Python ingestion independently if data volume grows
├── Scale Node.js separately if user traffic grows
├── Keep TimescaleDB optimized for series queries
└── Keep PostgreSQL optimized for user and application records
```

## 12. Future AI-Training Readiness

```text
The architecture should be ready for AI-training use later without a redesign.

Desired properties
├── Preserve original market context
├── Preserve user actions and labels
├── Keep timestamps and provenance
├── Store capture outcomes and corrections
├── Keep feature snapshots reproducible
└── Make export possible without joining unrelated data by guesswork

Recommended storage ideas
├── Training label records in PostgreSQL
├── Snapshot references to market ranges in TimescaleDB
├── Versioned feature definitions
├── Annotation source tracking
└── Export jobs that produce immutable datasets

Important constraints
├── Do not overwrite historical training labels in place without versioning
├── Do not lose the link between a capture and the exact market window used
├── Do not mix cleaned training data with raw source data
└── Do not assume future model formats during current design
```

## 13. Implementation Rules For AI And Developers

```text
When implementing features from this architecture, follow these rules:

1. Respect ownership
├── Use Python for source-market ingestion and market-derived writes
├── Use Node.js for user-facing application writes
├── Use React only for UI logic and presentation

2. Preserve boundaries
├── Do not add direct database access from the client
├── Do not let Node.js write raw market series into TimescaleDB
├── Do not let Python write user records into PostgreSQL unless this document is explicitly updated

3. Prefer explicit contracts
├── Define data shapes before coding
├── Define error behavior before coding
├── Define cache invalidation before coding
└── Define retry behavior before coding

4. Avoid hidden assumptions
├── If a field is required, mark it required
├── If a value can be missing, define the fallback
├── If data can be duplicated, define deduplication
└── If timing matters, define timezone and ordering rules

5. Keep extensibility
├── Add AI-training metadata in a versioned way
├── Keep room for alerts, journaling, and more analytics
└── Avoid architecture choices that force a rewrite later
```

## 14. Summary Of Required Architecture

```text
Final required shape

├── Python
│   └── Ingests tick data from MQL5, builds OHLC when needed, writes only to TimescaleDB
├── TimescaleDB
│   └── Stores tick and OHLC market data only
├── Node.js
│   ├── Reads market data from TimescaleDB
│   ├── Writes user data and indicator-cache to PostgreSQL
│   ├── Coordinates realtime updates
│   └── Orchestrates app logic
├── PostgreSQL
│   └── Stores user data, app data, cache, and future AI-training metadata
└── React + Vite + TypeScript
    └── Presents the trading capture experience and talks only to Node.js

Non-negotiable rules
├── Market write path belongs to Python
├── User/app write path belongs to Node.js
├── Client never talks to databases directly
├── Realtime updates should exist for important UI states
└── Future AI-training use must remain possible
```
