import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { Page } from "./page.model.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "../../../database");
const DB_PATH = path.join(DB_DIR, "page.db");

export class PageRepository {
  private db!: Database.Database;

  public init(): void {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  public findAll(): Page[] {
    const stmt = this.db.prepare("SELECT id, name, data FROM pages");
    const rows = stmt.all() as { id: number; name: string; data: string }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data),
    }));
  }

  public flushToDatabase(pages: Page[], deletedIds: Set<number>): void {
    const deleteStmt = this.db.prepare("DELETE FROM pages WHERE id = ?");
    const updateStmt = this.db.prepare("UPDATE pages SET name = ?, data = ? WHERE id = ?");
    const insertStmt = this.db.prepare("INSERT INTO pages (name, data) VALUES (?, ?)");

    const transaction = this.db.transaction(() => {
      // 1. Purge deleted records
      for (const id of deletedIds) {
        deleteStmt.run(id);
      }

      // 2. Insert or update in-memory pages
      for (const page of pages) {
        if (page.id !== undefined) {
          const res = updateStmt.run(page.name, JSON.stringify(page.data), page.id);
          if (res.changes === 0) {
            insertStmt.run(page.name, JSON.stringify(page.data));
          }
        } else {
          const res = insertStmt.run(page.name, JSON.stringify(page.data));
          page.id = Number(res.lastInsertRowid);
        }
      }
    });

    transaction();
  }

  public close(): void {
    this.db.close();
  }
}