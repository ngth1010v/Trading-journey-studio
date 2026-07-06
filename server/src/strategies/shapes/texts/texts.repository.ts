import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { CONNECTION_IDLE_TIMEOUT_MS } from './texts.index.js';

interface ManagedConnection {
  instance: Database.Database;
  timer: NodeJS.Timeout;
}

export class TextsRepository {
  private static connections = new Map<string, ManagedConnection>();

  /**
   * Gets or initializes an active connection to the specific strategy/symbol database file.
   */
  public static getConnection(strateryName: string, symbol: string): Database.Database {
    const cacheKey = `${strateryName}:::${symbol}`;
    const cached = this.connections.get(cacheKey);

    if (cached) {
      clearTimeout(cached.timer);
      cached.timer = this.createIdleTimer(cacheKey);
      return cached.instance;
    }

    const dirPath = path.join(process.cwd(), 'database', 'strateries', strateryName, symbol);
    fs.mkdirSync(dirPath, { recursive: true });
    
    // Explicitly using texts.db
    const dbPath = path.join(dirPath, 'texts.db');

    const db = new Database(dbPath);
    
    // Initialize structure table for texts
    db.exec(`
      CREATE TABLE IF NOT EXISTS texts (
        id TEXT PRIMARY KEY,
        text TEXT,
        timestamp INTEGER,
        price REAL,
        color TEXT,
        size REAL,
        alignX TEXT,
        alignY TEXT
      )
    `);

    const timer = this.createIdleTimer(cacheKey);
    this.connections.set(cacheKey, { instance: db, timer });

    return db;
  }

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