import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { CONNECTION_IDLE_TIMEOUT_MS } from './lines.index.js';

interface ManagedConnection {
  instance: Database.Database;
  timer: NodeJS.Timeout;
}

export class LinesRepository {
  private static connections = new Map<string, ManagedConnection>();

  /**
   * Gets or initializes an active connection to the specific strategy/symbol database file.
   */
  public static getConnection(strateryName: string, symbol: string): Database.Database {
    const cacheKey = `${strateryName}:::${symbol}`;
    const cached = this.connections.get(cacheKey);

    if (cached) {
      // Reset the idle countdown timer
      clearTimeout(cached.timer);
      cached.timer = this.createIdleTimer(cacheKey);
      return cached.instance;
    }

    // Ensure directory exists structural layer
    const dirPath = path.join(process.cwd(), 'database', 'strateries', strateryName, symbol);
    fs.mkdirSync(dirPath, { recursive: true });
    const dbPath = path.join(dirPath, 'lines.db');

    const db = new Database(dbPath);
    
    // Initialize standard table structure safely
    db.exec(`
      CREATE TABLE IF NOT EXISTS lines (
        id TEXT PRIMARY KEY,
        thickness REAL,
        color TEXT,
        timestamp1 INTEGER,
        timestamp2 INTEGER,
        price1 REAL,
        price2 REAL
      )
    `);

    // Store reference with its auto-eviction timer
    const timer = this.createIdleTimer(cacheKey);
    this.connections.set(cacheKey, { instance: db, timer });

    return db;
  }

  /**
   * Spawns an automated closing handle for inactive connections
   */
  private static createIdleTimer(cacheKey: string): NodeJS.Timeout {
    return setTimeout(() => {
      const cached = this.connections.get(cacheKey);
      if (cached) {
        cached.instance.close();
        this.connections.delete(cacheKey);
      }
    }, CONNECTION_IDLE_TIMEOUT_MS);
  }
}