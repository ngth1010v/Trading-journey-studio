// shape/shape.service.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DbInstance {
  db: Database.Database;
  timer: NodeJS.Timeout;
}

class StrategyDbManager {
  private instances: Map<number, DbInstance> = new Map();
  private lastChangeTimestamps: Map<number, number> = new Map();

  private getDbPath(strategyId: number): string {
    // Escapes tracking to map safely into the required folder structure
    return path.join(__dirname, `../../../../../database/chartData/candleChart/shapes/${strategyId}.db`);
  }

  public getDb(strategyId: number): Database.Database {
    let instance = this.instances.get(strategyId);

    if (!instance) {
      const dbPath = this.getDbPath(strategyId);
      const dbDir = path.dirname(dbPath);

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const db = new Database(dbPath);
      
      // Initialize strategy-isolated database tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS shapes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          symbol TEXT NOT NULL,
          tagIds TEXT NOT NULL,
          fromTs INTEGER NOT NULL,
          toTs INTEGER NOT NULL,
          data TEXT NOT NULL,
          style TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS shape_tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          color TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS shape_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          style TEXT NOT NULL
        );
      `);

      instance = {
        db,
        timer: null as any
      };
      
      this.instances.set(strategyId, instance);
      this.lastChangeTimestamps.set(strategyId, Date.now());
    }

    this.resetTimer(strategyId, instance);
    return instance.db;
  }

  private resetTimer(strategyId: number, instance: DbInstance) {
    if (instance.timer) {
      clearTimeout(instance.timer);
    }
    instance.timer = setTimeout(() => {
      this.closeDb(strategyId);
    }, 5 * 60 * 1000); // 5 minutes inactivity timeout
  }

  private closeDb(strategyId: number) {
    const instance = this.instances.get(strategyId);
    if (instance) {
      if (instance.timer) clearTimeout(instance.timer);
      instance.db.close();
      this.instances.delete(strategyId);
    }
  }

  public updateLastChange(strategyId: number) {
    this.lastChangeTimestamps.set(strategyId, Date.now());
  }

  public getLastChange(strategyId: number): number {
    if (!this.lastChangeTimestamps.has(strategyId)) {
      this.lastChangeTimestamps.set(strategyId, Date.now());
    }
    return this.lastChangeTimestamps.get(strategyId)!;
  }

  public shutdown() {
    for (const strategyId of this.instances.keys()) {
      this.closeDb(strategyId);
    }
  }
}

export const strategyDbManager = new StrategyDbManager();