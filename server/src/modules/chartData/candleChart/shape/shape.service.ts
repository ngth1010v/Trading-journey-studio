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
  private instances: Map<string, DbInstance> = new Map();
  private lastChangeTimestamps: Map<string, number> = new Map();

  private getDbPath(strategyName: string): string {
    // Escapes tracking to map safely into the required folder structure
    return path.join(__dirname, `../../../../../database/chartData/candleChart/shapes/${strategyName}.db`);
  }

  public getDb(strategyName: string): Database.Database {
    let instance = this.instances.get(strategyName);

    if (!instance) {
      const dbPath = this.getDbPath(strategyName);
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
      
      this.instances.set(strategyName, instance);
      this.lastChangeTimestamps.set(strategyName, Date.now());
    }

    this.resetTimer(strategyName, instance);
    return instance.db;
  }

  private resetTimer(strategyName: string, instance: DbInstance) {
    if (instance.timer) {
      clearTimeout(instance.timer);
    }
    instance.timer = setTimeout(() => {
      this.closeDb(strategyName);
    }, 5 * 60 * 1000); // 5 minutes inactivity timeout
  }

  private closeDb(strategyName: string) {
    const instance = this.instances.get(strategyName);
    if (instance) {
      if (instance.timer) clearTimeout(instance.timer);
      instance.db.close();
      this.instances.delete(strategyName);
    }
  }

  public updateLastChange(strategyName: string) {
    this.lastChangeTimestamps.set(strategyName, Date.now());
  }

  public getLastChange(strategyName: string): number {
    if (!this.lastChangeTimestamps.has(strategyName)) {
      this.lastChangeTimestamps.set(strategyName, Date.now());
    }
    return this.lastChangeTimestamps.get(strategyName)!;
  }

  public shutdown() {
    for (const strategyName of this.instances.keys()) {
      this.closeDb(strategyName);
    }
  }
}

export const strategyDbManager = new StrategyDbManager();