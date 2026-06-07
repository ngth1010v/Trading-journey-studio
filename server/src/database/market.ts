import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import * as fs from "fs";
import * as path from "path";

let db: DuckDBConnection | null = null;

export const marketDb = {
    async Init(): Promise<void> {
        const dbPath = "./database/market.duckdb";

        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const instance = await DuckDBInstance.create(dbPath);
        db = await instance.connect();

        await db.run(`
            CREATE TABLE IF NOT EXISTS SymbolData (
                symbol TEXT PRIMARY KEY,
                point INTEGER NOT NULL
            );
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
