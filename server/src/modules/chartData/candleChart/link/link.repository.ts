import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { Link } from "./link.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../../../database/chartData/candleChart/link.db");

export class LinkRepository {
  private db: Database.Database | null = null;

  init(): void {
    // Ensure database connection is active
    if (!this.db) {
      this.db = new Database(DB_PATH);
      // Enable WAL mode for better concurrency performance
      this.db.pragma("journal_mode = WAL");
    }

    // Initialize schema: color object stored as text JSON string
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      );
    `);
  }

  shutdown(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.db;
  }

  findAll(): Link[] {
    const db = this.getDb();
    const rows = db.prepare("SELECT id, name, color FROM links").all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      color: JSON.parse(row.color)
    }));
  }

  findById(id: number): Link | null {
    const db = this.getDb();
    const row = db.prepare("SELECT id, name, color FROM links WHERE id = ?").get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      color: JSON.parse(row.color)
    };
  }

  create(link: Link): number {
    const db = this.getDb();
    const stmt = db.prepare("INSERT INTO links (name, color) VALUES (?, ?)");
    const result = stmt.run(link.name, JSON.stringify(link.color));
    return result.lastInsertRowid as number;
  }

  update(link: Link): void {
    const db = this.getDb();
    const stmt = db.prepare("UPDATE links SET name = ?, color = ? WHERE id = ?");
    stmt.run(link.name, JSON.stringify(link.color), link.id);
  }

  delete(id: number): boolean {
    const db = this.getDb();
    const stmt = db.prepare("DELETE FROM links WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

export const linkRepository = new LinkRepository();