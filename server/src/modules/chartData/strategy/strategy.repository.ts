import Database from "better-sqlite3";
import { Strategy, StrategyTag } from "./strategy.model.js";

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../../database/chartData/strategy.db");

export class StrategyRepository {
  private db!: Database.Database;

  public init(): void {
    this.db = new Database(DB_PATH);
    
    // Enable WAL mode for better performance
    this.db.pragma("journal_mode = WAL");

    // Create Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS strategy_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        createdTimestamp INTEGER NOT NULL,
        desc TEXT NOT NULL,
        color TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        desc TEXT NOT NULL,
        tagIds TEXT NOT NULL,
        status TEXT NOT NULL,
        createdTimestamp INTEGER NOT NULL,
        favorite TEXT NOT NULL,
        color TEXT NOT NULL
      );
    `);
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  // --- STRATEGY TAG METHODS ---
  
  public getAllTags(): any[] {
    const stmt = this.db.prepare("SELECT id, name, color FROM strategy_tags");
    return stmt.all().map((row: any) => ({
      id: row.id,
      name: row.name,
      color: JSON.parse(row.color)
    }));
  }

  public getTagById(id: number): StrategyTag | null {
    const stmt = this.db.prepare("SELECT * FROM strategy_tags WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      createdTimestamp: row.createdTimestamp,
      desc: row.desc,
      color: JSON.parse(row.color)
    };
  }

  public createTag(tag: Omit<StrategyTag, "id">): number {
    const stmt = this.db.prepare(`
      INSERT INTO strategy_tags (name, createdTimestamp, desc, color)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(tag.name, tag.createdTimestamp, tag.desc, JSON.stringify(tag.color));
    return Number(result.lastInsertRowid);
  }

  public updateTag(tag: Required<StrategyTag>): boolean {
    const stmt = this.db.prepare(`
      UPDATE strategy_tags 
      SET name = ?, createdTimestamp = ?, desc = ?, color = ?
      WHERE id = ?
    `);
    const result = stmt.run(tag.name, tag.createdTimestamp, tag.desc, JSON.stringify(tag.color), tag.id);
    return result.changes > 0;
  }

  public deleteTag(id: number): boolean {
    const deleteTx = this.db.transaction(() => {
      // 1. Delete the tag itself
      const stmt = this.db.prepare("DELETE FROM strategy_tags WHERE id = ?");
      const result = stmt.run(id);
      
      if (result.changes === 0) return false;

      // 2. Scrub the tag ID from all strategies (Choice 3B)
      const stringId = String(id);
      const selectStmt = this.db.prepare("SELECT id, tagIds FROM strategies");
      const updateStmt = this.db.prepare("UPDATE strategies SET tagIds = ? WHERE id = ?");
      
      const strategies = selectStmt.all() as any[];
      for (const strat of strategies) {
        const tagIds: string[] = JSON.parse(strat.tagIds);
        if (tagIds.includes(stringId)) {
          const updatedTags = tagIds.filter(tId => tId !== stringId);
          updateStmt.run(JSON.stringify(updatedTags), strat.id);
        }
      }
      return true;
    });

    return deleteTx();
  }

  // --- STRATEGY METHODS ---

  public getAllStrategies(): any[] {
    const stmt = this.db.prepare("SELECT id, name, status, color FROM strategies");
    return stmt.all().map((row: any) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      color: JSON.parse(row.color)
    }));
  }

  public getStrategyById(id: number): Strategy | null {
    const stmt = this.db.prepare("SELECT * FROM strategies WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      desc: row.desc,
      tagIds: JSON.parse(row.tagIds),
      status: row.status as "live" | "end" | "backtest",
      createdTimestamp: row.createdTimestamp,
      favorite: JSON.parse(row.favorite),
      color: JSON.parse(row.color)
    };
  }

  public createStrategy(strat: Omit<Strategy, "id">): number {
    const stmt = this.db.prepare(`
      INSERT INTO strategies (name, desc, tagIds, status, createdTimestamp, favorite, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      strat.name,
      strat.desc,
      JSON.stringify(strat.tagIds),
      strat.status,
      strat.createdTimestamp,
      JSON.stringify(strat.favorite),
      JSON.stringify(strat.color)
    );
    return Number(result.lastInsertRowid);
  }

  public updateStrategy(strat: Required<Strategy>): boolean {
    const stmt = this.db.prepare(`
      UPDATE strategies 
      SET name = ?, desc = ?, tagIds = ?, status = ?, createdTimestamp = ?, favorite = ?, color = ?
      WHERE id = ?
    `);
    const result = stmt.run(
      strat.name,
      strat.desc,
      JSON.stringify(strat.tagIds),
      strat.status,
      strat.createdTimestamp,
      JSON.stringify(strat.favorite),
      JSON.stringify(strat.color),
      strat.id
    );
    return result.changes > 0;
  }

  public deleteStrategy(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM strategies WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

export const repo = new StrategyRepository();