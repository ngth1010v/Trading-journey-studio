// server/src/modules/chartData/candleChart/link/link.repository.ts

import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { Link, LinkState } from "./link.model.js";

// Use process.cwd() to consistently point to your project root directory
const DB_DIR = path.join(process.cwd(), "database/chartData/candleChart");
const DB_PATH = path.join(DB_DIR, "link.db");

export class LinkRepository {
  private db: Database.Database | null = null;

  public init(): void {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    this.db = new Database(DB_PATH);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        state TEXT
      )
    `);
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  public getAll(): { id: number; name: string; color: any; state: any }[] {
    if (!this.db) throw new Error("Database not initialized");
    const stmt = this.db.prepare("SELECT id, name, color, state FROM links");
    return stmt.all() as any[];
  }

  public insert(link: Omit<Link, "id">, state?: LinkState): number {
    if (!this.db) throw new Error("Database not initialized");
    const stmt = this.db.prepare(`
      INSERT INTO links (name, color, state)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(
      link.name,
      JSON.stringify(link.color),
      state ? JSON.stringify(state) : null
    );
    return Number(result.lastInsertRowid);
  }

  public update(id: number, link: Link, state?: LinkState): void {
    if (!this.db) throw new Error("Database not initialized");
    const stmt = this.db.prepare(`
      UPDATE links
      SET name = ?, color = ?, state = ?
      WHERE id = ?
    `);
    stmt.run(
      link.name,
      JSON.stringify(link.color),
      state ? JSON.stringify(state) : null,
      id
    );
  }

  public delete(id: number): void {
    if (!this.db) throw new Error("Database not initialized");
    const stmt = this.db.prepare("DELETE FROM links WHERE id = ?");
    stmt.run(id);
  }
}