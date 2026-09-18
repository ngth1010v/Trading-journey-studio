# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trading journey studio: a self-hosted trading journal / chart workspace. Three independently-run processes:

- **client/** — React 19 + TypeScript + Vite frontend, custom PixiJS-based candlestick chart engine.
- **server/** — Node/TypeScript Express API + WebSocket server, backed by better-sqlite3 files.
- **server/python/** — Flask service that talks to MetaTrader5 (mt5) to collect and store OHLC candle/tick data, independent of the Node server.

Run all three with `run.bat` (opens 3 Windows Terminal tabs: `server` → `npm start`, `client` → `npm run dev`, `server/python` → `python main.py`). There is no single dev-all script; each process must be started separately if not using `run.bat`.

## Commands

Client (`client/`):
- `npm run dev` — start Vite dev server
- `npm run build` — `tsc -b && vite build` (type-check then build)
- `npm run lint` — eslint
- `npm run preview` — preview production build

Server (`server/`):
- `npm run dev` — `tsx watch src/index.ts` (auto-reload)
- `npm start` — `tsx src/index.ts`
- `npm run check` — `tsc --noEmit`
- `npm run python` — shortcut to run `python python/main.py` from the server dir

Python service (`server/python/`):
- `python main.py` (requires `requirements.txt` deps and a running MetaTrader5 terminal on the host — this only works on Windows with MT5 installed)

No test runner is configured in any of the three package.json/requirements — there is no `npm test` or pytest suite. The `test/` directory at repo root is ad-hoc scratch content, not a test suite.

Graceful shutdown: both the Node server and the Python service expose a `GET /SHUTDOWN` HTTP endpoint that triggers cleanup (closing DB connections / MT5) before exiting, instead of being killed directly.

## Server architecture (`server/src`)

Feature modules live under `src/modules/<domain>/<feature>/`, each following the same file-suffix convention:
- `*.model.ts` — types/interfaces for the domain
- `*.repository.ts` — direct better-sqlite3 access (schema creation via `CREATE TABLE IF NOT EXISTS`, prepared statements); each repository owns and lazily opens its own `.db` file under `server/database/...` and exposes `init()`/`shutdown()`
- `*.service.ts` — business logic sitting on top of the repository
- `*.route.<name>.ts` — one file per Express sub-router (e.g. `trade.route.data.ts`, `trade.route.tag.ts`, `trade.route.style.ts`) — routes are split by sub-resource, not lumped into one file
- `*.index.ts` — wires the sub-routers into one `Router`, and exports `{ router, init, shutdown }`

Domains: `color`, `theme`, `pageElement`, `chartData/strategy`, `chartData/trade`, `chartData/candleChart/shape`, `chartData/candleChart/sync/link`. All are aggregated in `src/modules/index.ts` and wired up explicitly in `src/index.ts` (`startup()`/`useRouter()`/`attachWs()`/`shutdown()` each call every module by name — adding a new module means adding it in all four places).

The `chartData/candleChart/sync/link` module additionally attaches a WebSocket server (`attachWs`) for realtime chart sync between clients — this is the only module using `ws`.

When adding a new server module, copy this file-suffix pattern exactly rather than inventing a new layout.

## Client architecture (`client/src`)

- `modules/pageElements/charts/candleChart/` — the chart engine, the most complex part of the codebase. Structure:
  - `chart/ChartController.ts` — root controller composing `ViewportController`, `EventController`, `Renderer`, `SyncController`; each has `init(state, controller)` / `destroy()`.
  - `chart/render/` — PixiJS renderers, one per visual layer (candles, crosshair, trades, shapes, season markers, sync/link overlays). `Renderer.ts` is the top-level render loop that composes the individual renderers.
  - `chart/event/` — input/event handling (crosshair, viewport pan/zoom, cross-chart sync events), separate from rendering.
  - `chart/viewport/` — viewport math (aligning candle positions to pixel space, conversions between price/time and screen coordinates).
  - `chart/sync/` — cross-chart "link" feature (multiple chart instances syncing crosshair/viewport over WebSocket).
  - `state/` — plain state containers per concern (`CandleData`, `ShapeData`, `ViewportData`, `SyncData`, etc.), each typically paired with an `*Api.ts` that calls the server.
  - `interface/` — React UI chrome around the canvas: navigation bars, scale bars, floating bars, strategy bars.
  - This module is under active rework (see recent commits touching `Renderer.ts`, `UnselectedTradeRenderer.ts`, `LinkCrosshairRenderer.ts`) — check current renderer wiring in `Renderer.ts` before adding a new render layer.
- `modules/data/` — client-side data/API layer per domain (`chartData/strategy`, `chartData/trade`, `chartData/symbol`, `pageElement`, `theme`), mirroring the server's domain names. Each `*Data.ts` holds a mutable data store; each `*Api.ts` wraps `modules/shared/apiClient.ts`'s `request<T>()` helper to call the server's matching route.
- `modules/input/` — reusable form input primitives (`single/` for one field, `panel/PanelInput.tsx` for composing many fields into a settings panel via `InputMap.ts`).
- `modules/shared/` — cross-cutting: `apiClient.ts` (fetch wrapper), `components/list/*` (virtualized/fixed list components), `type.ts`.
- `pages/` — top-level routed views: `Workspace.tsx` (main app shell), `pages/editor/PageEditor.tsx`, `pages/home/Home.tsx`, `pages/loader/PageLoader.tsx`.
- `src/_modules/` — legacy/parked code (underscore prefix), not part of the active app; don't build on it without checking if it's actually still referenced.

Path alias: server TS uses `@shared/*` → `../shared/*` (see `server/tsconfig.json`); client has no custom path aliases configured.

## Python service (`server/python`)

- `main.py` — Flask app entry; initializes MT5 connection (`initMt5`, with retry) before registering blueprints and starting the server via `werkzeug.serving.make_server`.
- Each feature is a package with a Flask `Blueprint` (`bp`) exported from its `__init__.py`: `base/` (worker/collector/stager primitives), `ohlc/` (candle building/timeframe logic), `ohlcStorer/` (hot/cold storage split — `_hotFirstStorer.py`, `_hotLastStorer.py`, `_coldStorer.py`), `symbols/` (symbol list collection).
- Files prefixed `_` (e.g. `_controller.py`, `_type.py`) are internal to their package, not meant to be imported elsewhere.
- Comments/log strings in this service are written in Vietnamese; keep that convention when touching existing files unless asked otherwise.
