import Database from "better-sqlite3";
import { Strategy, StrategyTag } from "./strategy.model.js";

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "../../../../database/chartData");
const DB_PATH = path.join(DB_DIR, "strategy.db");

export class StrategyRepository {
  private db!: Database.Database;

  public init(): void {
    fs.mkdirSync(DB_DIR, { recursive: true });
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

  // --- HELPER PARSERS WITH FALLBACK DEFAULTS ---

  private parseTagRow(row: any): StrategyTag {
    let color = { font: [0, 0, 0], background: [255, 255, 255, 1], border: [0, 0, 0, 1] };
    try {
      if (row.color) color = JSON.parse(row.color);
    } catch {
      // Keep default color fallback
    }

    return {
      id: row.id,
      name: row.name ?? "",
      createdTimestamp: row.createdTimestamp ?? Date.now(),
      desc: row.desc ?? "",
      color: color as StrategyTag["color"],
    };
  }

  private parseStrategyRow(row: any): Strategy {
    let tagIds: string[] = [];
    try {
      if (row.tagIds) tagIds = JSON.parse(row.tagIds);
    } catch {}

    let favorite = { symbols: [], timeframes: [] };
    try {
      if (row.favorite) favorite = JSON.parse(row.favorite);
    } catch {}

    let color = { font: [0, 0, 0], background: [255, 255, 255, 1], border: [0, 0, 0, 1] };
    try {
      if (row.color) color = JSON.parse(row.color);
    } catch {}

    return {
      id: row.id,
      name: row.name ?? "",
      desc: row.desc ?? "",
      tagIds: Array.isArray(tagIds) ? tagIds : [],
      status: (["live", "end", "backtest"].includes(row.status) ? row.status : "backtest") as Strategy["status"],
      createdTimestamp: row.createdTimestamp ?? Date.now(),
      favorite: {
        symbols: Array.isArray(favorite?.symbols) ? favorite.symbols : [],
        timeframes: Array.isArray(favorite?.timeframes) ? favorite.timeframes : [],
      },
      color: color as Strategy["color"],
    };
  }

  // --- STRATEGY TAG METHODS ---

  public getAllTags(): StrategyTag[] {
    const stmt = this.db.prepare("SELECT * FROM strategy_tags");
    return stmt.all().map((row: any) => this.parseTagRow(row));
  }

  public getTagById(id: number): StrategyTag | null {
    const stmt = this.db.prepare("SELECT * FROM strategy_tags WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.parseTagRow(row);
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

      // 2. Scrub the tag ID from all strategies
      const stringId = String(id);
      const selectStmt = this.db.prepare("SELECT id, tagIds FROM strategies");
      const updateStmt = this.db.prepare("UPDATE strategies SET tagIds = ? WHERE id = ?");

      const strategies = selectStmt.all() as any[];
      for (const strat of strategies) {
        try {
          const tagIds: string[] = JSON.parse(strat.tagIds);
          if (tagIds.includes(stringId)) {
            const updatedTags = tagIds.filter((tId) => tId !== stringId);
            updateStmt.run(JSON.stringify(updatedTags), strat.id);
          }
        } catch {}
      }
      return true;
    });

    return deleteTx();
  }

  // --- STRATEGY METHODS ---

  public getAllStrategies(): Strategy[] {
    const stmt = this.db.prepare("SELECT * FROM strategies");
    return stmt.all().map((row: any) => this.parseStrategyRow(row));
  }

  public getStrategyById(id: number): Strategy | null {
    const stmt = this.db.prepare("SELECT * FROM strategies WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.parseStrategyRow(row);
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