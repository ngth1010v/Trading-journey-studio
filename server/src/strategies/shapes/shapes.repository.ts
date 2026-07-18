import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { CONNECTION_IDLE_TIMEOUT_MS } from './shapes.index.js';

interface ManagedConnection {
  instance: Database.Database;
  timer: NodeJS.Timeout;
}

export class ShapesRepository {
  private static connections = new Map<string, ManagedConnection>();

  /**
   * Gets or initializes an active connection to the specific strategy/symbol database file.
   */
  public static getConnection(strateryName: string, symbol: string): Database.Database {
    const cacheKey = `${strateryName}:::${symbol}`;
    const cached = this.connections.get(cacheKey);
    if (cached) {
      // If the connection is no longer usable, clean it up.
      if (!cached.instance.open) {
        clearTimeout(cached.timer);
        this.connections.delete(cacheKey);
      } else {
        // Refresh the idle timeout.
        clearTimeout(cached.timer);
        cached.timer = this.createIdleTimer(cacheKey);
        return cached.instance;
      }
    }

    // Ensure directory exists
    const dirPath = path.join(process.cwd(), 'database', 'strategies', strateryName, symbol);
    fs.mkdirSync(dirPath, { recursive: true });
    const dbPath = path.join(dirPath, 'shapes.db');

    const db = new Database(dbPath);

    // CRITICAL FIX: Enable Write-Ahead Logging (WAL) to prevent lock issues/crashes
    db.pragma('journal_mode = WAL');

    // Initialize standard table structure safely with AUTOINCREMENT for numeric IDs
    db.exec(`
      CREATE TABLE IF NOT EXISTS shapes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        fromTs INTEGER,
        toTs INTEGER,
        data TEXT,
        style TEXT,
        creater TEXT,
        editable INTEGER,
        lastModifyTimestamp INTEGER
      );

      CREATE TABLE IF NOT EXISTS templateShapes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        name TEXT,
        style TEXT
      );
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
        try {
          if (cached.instance.open) {
            cached.instance.close();
          }
        } catch (err) {
          console.error(`[SQLite Error] Failed to auto-close connection for ${cacheKey}:`, err);
        } finally {
          this.connections.delete(cacheKey);
        }
      }
    }, CONNECTION_IDLE_TIMEOUT_MS);
  }
}