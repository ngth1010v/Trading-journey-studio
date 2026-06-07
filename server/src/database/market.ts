import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import * as fs from "fs";
import * as path from "path";

let db: DuckDBConnection | null = null;

export const marketDb = {
    async Init(): Promise<void> {
        const dbPath = "./data/trading.duckdb";
        
        // Auto-create the directory if it does not exist
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Initialize DuckDB (will now cleanly auto-create trading.duckdb)
        const instance = await DuckDBInstance.create(dbPath);
        db = await instance.connect();

        await db.run(`
            CREATE TABLE IF NOT EXISTS SymbolData (
                symbol TEXT PRIMARY KEY,
                point INTEGER NOT NULL
            );
        `);

        await db.run(`
            CREATE TABLE IF NOT EXISTS Tick (
                symbol VARCHAR NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                bid UBIGINT NOT NULL,
                ask UBIGINT NOT NULL,
                volume UBIGINT NOT NULL
            );
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_tick_symbol_time
            ON Tick(symbol, timestamp);
        `);

        await db.run(`
            CREATE TABLE IF NOT EXISTS Ohlc (
                symbol VARCHAR NOT NULL,
                timeframe UBIGINT NOT NULL,
                openTimestamp TIMESTAMP NOT NULL,
                open UBIGINT NOT NULL,
                high UBIGINT NOT NULL,
                low UBIGINT NOT NULL,
                close UBIGINT NOT NULL,
                volume UBIGINT NOT NULL
            );
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_ohlc_symbol_tf_time
            ON Ohlc(symbol, timeframe, openTimestamp);
        `);

        console.log("DuckDB initialized successfully.");
    },

    Get(): DuckDBConnection {
        if (!db) {
            throw new Error(
                "Database not initialized. Call marketDb.Init() first."
            );
        }
        return db;
    }
};