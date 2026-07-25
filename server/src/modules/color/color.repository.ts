import Database from "better-sqlite3";
import type { Color, DbColorRow } from "./color.model.js";
import fs from "fs";

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "../../../database");
const DB_PATH = path.join(DB_DIR, "color.db");

export class ColorRepository {
  private db!: Database.Database;

  public init(): void {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    
    // Create table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS colors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        color TEXT NOT NULL,
        lastModifyTimestamp INTEGER NOT NULL
      );
    `);
  }

  public shutdown(): void {
    if (this.db) {
      this.db.close();
    }
  }

  public getAllSorted(): DbColorRow[] {
    const stmt = this.db.prepare("SELECT id, color, lastModifyTimestamp FROM colors ORDER BY lastModifyTimestamp DESC");
    return stmt.all() as DbColorRow[];
  }

  public getById(id: number): DbColorRow | undefined {
    const stmt = this.db.prepare("SELECT id, color, lastModifyTimestamp FROM colors WHERE id = ?");
    return stmt.get(id) as DbColorRow | undefined;
  }

  public create(colorJson: string, timestamp: number): number {
    const stmt = this.db.prepare("INSERT INTO colors (color, lastModifyTimestamp) VALUES (?, ?)");
    const result = stmt.run(colorJson, timestamp);
    return result.lastInsertRowid as number;
  }

  public update(id: number, colorJson: string, timestamp: number): boolean {
    const stmt = this.db.prepare("UPDATE colors SET color = ?, lastModifyTimestamp = ? WHERE id = ?");
    const result = stmt.run(colorJson, timestamp, id);
    return result.changes > 0;
  }

  public delete(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM colors WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
}