import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// Re-using the same idle timeout concept
export const CONNECTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface ManagedConnection {
  instance: Database.Database;
  timer: NodeJS.Timeout;
}

export class TradesRepository {
  private static connections = new Map<string, ManagedConnection>();

  /**
   * Gets or initializes an active connection to the specific strategy's database file.
   */
  public static getConnection(strateryName: string): Database.Database {
    const cacheKey = strateryName;
    const cached = this.connections.get(cacheKey);
    
    if (cached) {
      if (!cached.instance.open) {
        clearTimeout(cached.timer);
        this.connections.delete(cacheKey);
      } else {
        clearTimeout(cached.timer);
        cached.timer = this.createIdleTimer(cacheKey);
        return cached.instance;
      }
    }

    const dirPath = path.join(process.cwd(), 'database', 'strategies', strateryName);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const dbPath = path.join(dirPath, 'trades.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Initialize the 3 requested tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        symbol TEXT,
        tagIds TEXT,
        openTimestamp INTEGER,
        closeTimestamp INTEGER,
        openPrice REAL,
        closePrice REAL,
        stopLossPrice REAL,
        takeProfitPrice REAL,
        volume REAL,
        style TEXT,
        lastModifyTimestamp INTEGER
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT,
        name TEXT,
        desc TEXT,
        style TEXT,
        lastModifyTimestamp INTEGER
      );

      CREATE TABLE IF NOT EXISTS templates (
        name TEXT,
        symbol TEXT,
        style TEXT,
        PRIMARY KEY(name, symbol)
      );
    `);

    const timer = this.createIdleTimer(cacheKey);
    this.connections.set(cacheKey, { instance: db, timer });

    return db;
  }

  /**
   * Helper to scan the filesystem and return all strategy names for '*' queries
   */
  public static getAllStrategyNames(): string[] {
    const strategiesPath = path.join(process.cwd(), 'database', 'strategies');
    if (!fs.existsSync(strategiesPath)) return [];
    
    return fs.readdirSync(strategiesPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  }

  private static createIdleTimer(cacheKey: string): NodeJS.Timeout {
    return setTimeout(() => {
      const cached = this.connections.get(cacheKey);
      if (cached) {
        try {
          if (cached.instance.open) cached.instance.close();
        } catch (err) {
          console.error(`[SQLite Error] Failed to auto-close trades connection for ${cacheKey}:`, err);
        } finally {
          this.connections.delete(cacheKey);
        }
      }
    }, CONNECTION_IDLE_TIMEOUT_MS);
  }
}